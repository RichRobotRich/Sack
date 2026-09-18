/**
 * Liest neue Dokumente in die Wissensdatenbank ein.
 *
 * Läuft nach Zeitplan (siehe 0006_scheduling.sql) und zusätzlich direkt nach
 * einem Upload, damit ein Dokument nicht erst Minuten später auffindbar ist.
 *
 * Wenige Dokumente je Lauf: Einlesen, Zerlegen und Einbetten eines großen
 * PDFs dauert, und die Laufzeit einer Edge Function ist begrenzt. Was liegen
 * bleibt, holt der nächste Lauf.
 */

import { corsHeaders, jsonResponse, serviceRoleClient } from '../_shared/context.ts';
import { requireWorkerOrCaller } from '../_shared/worker-auth.ts';
import { isConfigured } from '../_shared/ai.ts';
import { indexDocument } from '../_shared/knowledge.ts';

const BATCH = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const zugang = await requireWorkerOrCaller(req);
  if ('response' in zugang) return zugang.response;

  if (!isConfigured()) {
    return jsonResponse({ error: 'Die KI-Dienste sind nicht eingerichtet.' }, 503);
  }

  const admin = serviceRoleClient();
  const body = await req.json().catch(() => ({}));

  // Ein einzelnes Dokument (nach dem Upload oder beim erneuten Einlesen),
  // sonst alles, was offen ist.
  const query = admin.from('knowledge_document').select('id, title').limit(BATCH);
  const { data: documents, error } = body?.document_id
    ? await query.eq('id', body.document_id)
    : await query.eq('status', 'neu').order('created_date');

  if (error) return jsonResponse({ error: error.message }, 500);

  const ergebnisse = [];
  for (const document of documents ?? []) {
    try {
      const { chunks, pages } = await indexDocument(admin, document.id);
      ergebnisse.push({ id: document.id, titel: document.title, status: 'indiziert', chunks, pages });
    } catch (failure) {
      const meldung = (failure as Error).message;
      await admin
        .from('knowledge_document')
        .update({ status: 'fehler', error: meldung })
        .eq('id', document.id);
      ergebnisse.push({ id: document.id, titel: document.title, status: 'fehler', fehler: meldung });
    }
  }

  return jsonResponse({ success: true, verarbeitet: ergebnisse.length, ergebnisse });
});
