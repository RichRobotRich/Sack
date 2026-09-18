/**
 * Zugang zu den KI-Diensten.
 *
 * Alles, was die App an KI braucht, sind drei Dinge: Text erzeugen (chat),
 * Text in Vektoren übersetzen (embed) und Sprache in Text wandeln
 * (transcribe). Jeder Aufruf im Projekt geht hierüber. Ein Anbieterwechsel
 * ist damit eine Änderung in dieser Datei - nicht in den Edge Functions, die
 * sie benutzen.
 *
 * Voreinstellung ist Azure OpenAI in einer EU-Region (Schweden oder
 * Westeuropa). Grund ist nicht die Modellqualität, sondern dass für OneDrive
 * ohnehin ein Microsoft-Tenant besteht: ein Vertrag, eine Region, ein
 * Schlüssel für alle drei Aufgaben. Siehe docs/ARCHITEKTUR.md.
 *
 * Umgebungsvariablen:
 *   AZURE_OPENAI_ENDPOINT              https://<name>.openai.azure.com
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_CHAT_DEPLOYMENT       Name der Chat-Bereitstellung
 *   AZURE_OPENAI_EMBEDDING_DEPLOYMENT  Name der Einbettungs-Bereitstellung
 *   AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT Name der Transkriptions-Bereitstellung
 *   AZURE_OPENAI_API_VERSION           optional, Vorgabe unten
 */

const API_VERSION = Deno.env.get('AZURE_OPENAI_API_VERSION') ?? '2024-10-21';

/**
 * Muss zur Spaltenbreite von knowledge_chunk.embedding passen. Wird das hier
 * geändert, braucht es eine Migration - ein Einbettungsvektor anderer Länge
 * lässt sich nicht speichern und die vorhandenen wären ohnehin unbrauchbar.
 */
export const EMBEDDING_DIMENSIONS = 1536;

const env = (name: string) => Deno.env.get(name);

export const isConfigured = () =>
  Boolean(env('AZURE_OPENAI_ENDPOINT') && env('AZURE_OPENAI_API_KEY'));

const requireEnv = (name: string): string => {
  const value = env(name);
  if (!value) throw new Error(`${name} ist nicht gesetzt`);
  return value;
};

const endpointFor = (deployment: string, path: string) => {
  const base = requireEnv('AZURE_OPENAI_ENDPOINT').replace(/\/$/, '');
  return `${base}/openai/deployments/${deployment}/${path}?api-version=${API_VERSION}`;
};

/**
 * Azure drosselt pro Bereitstellung und antwortet dann mit 429 und einem
 * Retry-After. Ohne Wiederholung würde eine Sprachnachricht verloren gehen,
 * nur weil zeitgleich jemand eine Frage gestellt hat.
 */
const callWithRetry = async (
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<Response> => {
  let lastError = '';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const response = await fetch(url, {
      ...init,
      headers: { 'api-key': requireEnv('AZURE_OPENAI_API_KEY'), ...(init.headers ?? {}) },
    });

    if (response.ok) return response;

    const retryable = response.status === 429 || response.status >= 500;
    lastError = `${response.status} ${await response.text()}`;
    if (!retryable || attempt === attempts) break;

    const retryAfter = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : 2 ** attempt * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  throw new Error(`KI-Aufruf fehlgeschlagen: ${lastError}`);
};

// ---------------------------------------------------------------------------
// Text erzeugen
// ---------------------------------------------------------------------------

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  messages: ChatMessage[];
  /**
   * JSON-Schema für eine strukturierte Antwort. Ist es gesetzt, erzwingt das
   * Modell diese Form - wichtig überall dort, wo das Ergebnis direkt in die
   * Datenbank geht und nicht erst von Hand nachgebessert wird.
   */
  schema?: { name: string; schema: Record<string, unknown> };
  temperature?: number;
  maxTokens?: number;
};

export type ChatResult = {
  text: string;
  model: string;
  /** Bei gesetztem schema das geparste Ergebnis, sonst null. */
  data: unknown;
};

export const chat = async (options: ChatOptions): Promise<ChatResult> => {
  const deployment = requireEnv('AZURE_OPENAI_CHAT_DEPLOYMENT');

  const body: Record<string, unknown> = {
    messages: options.messages,
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 2000,
  };

  if (options.schema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: options.schema.name,
        // Ohne strict liefert das Modell gelegentlich zusätzliche Felder oder
        // lässt Pflichtfelder weg - beides fällt erst beim Schreiben auf.
        strict: true,
        schema: options.schema.schema,
      },
    };
  }

  const response = await callWithRetry(
    endpointFor(deployment, 'chat/completions'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content ?? '';

  return {
    text,
    model: result.model ?? deployment,
    data: options.schema && text ? JSON.parse(text) : null,
  };
};

// ---------------------------------------------------------------------------
// Einbettungen
// ---------------------------------------------------------------------------

/**
 * Wandelt Texte in Vektoren. Die Reihenfolge des Ergebnisses entspricht der
 * Eingabe - Azure gibt einen index mit, auf den wir uns nicht verlassen,
 * sondern nach dem wir sortieren.
 */
export const embed = async (texts: string[]): Promise<number[][]> => {
  if (texts.length === 0) return [];

  const deployment = requireEnv('AZURE_OPENAI_EMBEDDING_DEPLOYMENT');

  const response = await callWithRetry(
    endpointFor(deployment, 'embeddings'),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: texts, dimensions: EMBEDDING_DIMENSIONS }),
    },
  );

  const result = await response.json();
  const rows: { index: number; embedding: number[] }[] = result.data ?? [];

  if (rows.length !== texts.length) {
    throw new Error(`Einbettung unvollständig: ${rows.length} von ${texts.length}`);
  }

  return rows
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((row) => {
      if (row.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Einbettung hat ${row.embedding.length} statt ${EMBEDDING_DIMENSIONS} Dimensionen`,
        );
      }
      return row.embedding;
    });
};

/** Postgres erwartet den Vektor als '[1,2,3]' - JSON.stringify trifft das genau. */
export const toVectorLiteral = (embedding: number[]) => JSON.stringify(embedding);

// ---------------------------------------------------------------------------
// Sprache in Text
// ---------------------------------------------------------------------------

export type TranscribeOptions = {
  audio: Blob;
  fileName?: string;
  /**
   * Fachbegriffe, Baustellennamen und Artikelnummern als Hilfestellung. Ohne
   * sie macht die Erkennung aus "Vitodens" gern "Vita Dens" - auf der
   * Baustelle kommt dazu Lärm und Dialekt.
   */
  hint?: string;
};

export const transcribe = async ({
  audio,
  fileName = 'sprachnachricht.ogg',
  hint,
}: TranscribeOptions): Promise<string> => {
  const deployment = requireEnv('AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT');

  const form = new FormData();
  form.append('file', audio, fileName);
  form.append('language', 'de');
  form.append('response_format', 'text');
  if (hint) form.append('prompt', hint);

  const response = await callWithRetry(
    endpointFor(deployment, 'audio/transcriptions'),
    { method: 'POST', body: form },
  );

  return (await response.text()).trim();
};
