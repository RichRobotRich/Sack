/**
 * Wissensdatenbank: Dokumente einlesen und Fragen daraus beantworten.
 *
 * Die Zusage lautet, dass Antworten ausschließlich aus hinterlegten
 * Unterlagen stammen. Die hängt nicht am Prompt allein - drei Sperren greifen
 * nacheinander, siehe answerQuestion().
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { chat, embed, toVectorLiteral } from './ai.ts';
import { buildContext, chunkPages } from './chunk.ts';
import { extractDocument } from './extract.ts';
import { STORAGE_BUCKET } from './entry-pipeline.ts';

/** Antwort, wenn nichts Passendes in der Ablage steht. */
export const NO_ANSWER = 'Keine passenden Informationen gefunden.';

/** Wie ähnlich ein Abschnitt mindestens sein muss, um überhaupt zu zählen. */
const MIN_SIMILARITY = 0.35;
const MAX_PASSAGES = 8;

/** Azure nimmt viele Texte auf einmal; mehr als 64 wird unhandlich. */
const EMBED_BATCH = 64;

// ---------------------------------------------------------------------------
// Einlesen
// ---------------------------------------------------------------------------

export const indexDocument = async (
  admin: SupabaseClient,
  documentId: string,
): Promise<{ chunks: number; pages: number }> => {
  const { data: document, error } = await admin
    .from('knowledge_document')
    .select('*')
    .eq('id', documentId)
    .single();
  if (error || !document) throw new Error('Dokument nicht gefunden');
  if (!document.storage_path) throw new Error('Zu diesem Dokument liegt keine Datei');

  const download = await admin.storage.from(STORAGE_BUCKET).download(document.storage_path);
  if (download.error) throw new Error(`Datei nicht lesbar: ${download.error.message}`);

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const extracted = await extractDocument(bytes, document.file_name ?? document.title);
  const chunks = chunkPages(extracted.pages);

  if (chunks.length === 0) throw new Error('Kein auswertbarer Abschnitt entstanden');

  // Die Überschrift wandert in den eingebetteten Text: "Mindestens 3 bar"
  // allein ist bedeutungsarm, unter "4.2 Druckprüfung" wird es auffindbar.
  const texte = chunks.map((chunk) =>
    chunk.heading ? `${chunk.heading}\n\n${chunk.content}` : chunk.content);

  const vektoren: number[][] = [];
  for (let start = 0; start < texte.length; start += EMBED_BATCH) {
    vektoren.push(...await embed(texte.slice(start, start + EMBED_BATCH)));
  }

  // Erst die alten Abschnitte weg: sonst stünden nach einer Neuindizierung
  // zwei Fassungen desselben Dokuments nebeneinander, und die Antwort zöge
  // womöglich die veraltete heran.
  await admin.from('knowledge_chunk').delete().eq('document_id', documentId);

  const { error: insertError } = await admin.from('knowledge_chunk').insert(
    chunks.map((chunk, index) => ({
      document_id: documentId,
      chunk_index: chunk.index,
      heading: chunk.heading,
      content: chunk.content,
      page_from: chunk.pageFrom,
      page_to: chunk.pageTo,
      token_count: Math.round(chunk.content.length / 4),
      embedding: toVectorLiteral(vektoren[index]),
    })),
  );
  if (insertError) throw new Error(`Abschnitte nicht gespeichert: ${insertError.message}`);

  await admin
    .from('knowledge_document')
    .update({
      status: 'indiziert',
      indexed_at: new Date().toISOString(),
      chunk_count: chunks.length,
      page_count: extracted.pageCount,
      error: null,
    })
    .eq('id', documentId);

  return { chunks: chunks.length, pages: extracted.pageCount };
};

// ---------------------------------------------------------------------------
// Beantworten
// ---------------------------------------------------------------------------

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answered', 'answer', 'used'],
  properties: {
    answered: {
      type: 'boolean',
      description: 'true nur, wenn die Antwort vollständig durch die Abschnitte gedeckt ist',
    },
    answer: { type: 'string' },
    used: {
      type: 'array',
      items: { type: 'string' },
      description: 'Kennungen der tatsächlich verwendeten Abschnitte, z. B. Q1',
    },
  },
} as const;

const ANSWER_SYSTEM_PROMPT = `
Du beantwortest fachliche Fragen aus dem Anlagenbau (Heizung, Sanitär,
Lüftung) ausschließlich anhand der vorgelegten Abschnitte aus firmeneigenen
Unterlagen.

Verbindliche Regeln:
- Verwende NUR die vorgelegten Abschnitte. Dein eigenes Fachwissen ist hier
  ohne Bedeutung, auch wenn du die Antwort zu kennen glaubst.
- Jede Aussage muss durch einen Abschnitt gedeckt sein. Führe die benutzten
  Kennungen in "used" auf.
- Decken die Abschnitte die Frage nicht oder nur teilweise: answered = false.
  Lieber keine Antwort als eine halbe, auf die sich jemand auf der Baustelle
  verlässt.
- Zahlenwerte, Maße und Typenbezeichnungen wörtlich übernehmen, niemals
  umrechnen oder runden.
- Widersprechen sich zwei Abschnitte, benenne den Widerspruch und nenne beide
  Quellen.
- Antworte knapp und auf Deutsch, in ganzen Sätzen, ohne Quellenangaben im
  Text - die stehen in "used".
`.trim();

export type Source = {
  chunk_id: string;
  document_id: string;
  title: string;
  page: number | null;
  web_url: string | null;
};

export type Answer = {
  answered: boolean;
  answer: string;
  sources: Source[];
  topScore: number | null;
  model: string | null;
  latencyMs: number;
};

/**
 * Beantwortet eine Frage - oder sagt ausdrücklich, dass sie unbeantwortet
 * bleibt.
 *
 * Drei Sperren:
 *   1. Findet die Suche nichts über der Mindestähnlichkeit, wird das Modell
 *      gar nicht erst gefragt.
 *   2. Das Modell bekommt nur die gefundenen Abschnitte und muss jede Aussage
 *      mit einer Kennung belegen.
 *   3. Jede genannte Kennung wird gegen die tatsächlich übergebenen Abschnitte
 *      geprüft. Erfundene Quellen oder gar keine Quelle verwerfen die Antwort.
 */
export const answerQuestion = async (
  admin: SupabaseClient,
  options: { question: string; channel: 'web' | 'whatsapp'; phone?: string | null; createdBy?: string | null },
): Promise<Answer> => {
  const start = Date.now();
  const frage = options.question.trim();

  const leer = (grund: string): Answer => ({
    answered: false,
    answer: NO_ANSWER,
    sources: [],
    topScore: null,
    model: grund,
    latencyMs: Date.now() - start,
  });

  const protokolliere = async (antwort: Answer) => {
    await admin.from('knowledge_query').insert({
      channel: options.channel,
      phone: options.phone ?? null,
      created_by: options.createdBy ?? null,
      question: frage,
      answer: antwort.answer,
      answered: antwort.answered,
      sources: antwort.sources,
      top_score: antwort.topScore,
      model: antwort.model,
      latency_ms: antwort.latencyMs,
    });
  };

  if (frage.length < 3) {
    const antwort = leer('frage-zu-kurz');
    await protokolliere(antwort);
    return antwort;
  }

  // Sperre 1
  const [frageVektor] = await embed([frage]);
  const { data: passages, error } = await admin.rpc('match_knowledge_chunks', {
    query_embedding: toVectorLiteral(frageVektor),
    query_text: frage,
    match_count: MAX_PASSAGES,
    min_similarity: MIN_SIMILARITY,
  });
  if (error) throw new Error(`Suche fehlgeschlagen: ${error.message}`);

  if (!passages || passages.length === 0) {
    const antwort = leer('keine-treffer');
    await protokolliere(antwort);
    return antwort;
  }

  const topScore = Math.max(...passages.map((passage: { similarity: number }) => Number(passage.similarity) || 0));
  const { context, ids } = buildContext(passages);

  // Sperre 2
  const result = await chat({
    messages: [
      { role: 'system', content: ANSWER_SYSTEM_PROMPT },
      { role: 'user', content: `Abschnitte:\n\n${context}\n\n---\n\nFrage: ${frage}` },
    ],
    schema: { name: 'antwort', schema: ANSWER_SCHEMA as unknown as Record<string, unknown> },
    maxTokens: 1200,
  });

  const data = result.data as { answered: boolean; answer: string; used: string[] };

  // Sperre 3: jede genannte Kennung muss es wirklich geben.
  const verwendet = (data.used ?? [])
    .map((kennung) => {
      const nummer = Number(String(kennung).replace(/[^0-9]/g, ''));
      return Number.isFinite(nummer) && nummer >= 1 && nummer <= ids.length ? nummer - 1 : -1;
    })
    .filter((index) => index >= 0);

  if (!data.answered || verwendet.length === 0) {
    const antwort: Answer = {
      answered: false,
      answer: NO_ANSWER,
      sources: [],
      topScore,
      model: result.model,
      latencyMs: Date.now() - start,
    };
    await protokolliere(antwort);
    return antwort;
  }

  const sources: Source[] = verwendet.map((index) => ({
    chunk_id: passages[index].chunk_id,
    document_id: passages[index].document_id,
    title: passages[index].document_title,
    page: passages[index].page_from ?? null,
    web_url: passages[index].web_url ?? null,
  }));

  const antwort: Answer = {
    answered: true,
    answer: data.answer.trim(),
    sources,
    topScore,
    model: result.model,
    latencyMs: Date.now() - start,
  };
  await protokolliere(antwort);
  return antwort;
};
