/**
 * Erfassung aus der Weboberfläche.
 *
 * Der Browser legt Anhänge selbst in den Bucket 'assistant' (dafür reicht
 * seine Berechtigung) und meldet hier nur die Pfade. Alles Weitere - abtippen,
 * strukturieren, zuordnen - läuft serverseitig, weil die Schlüssel der
 * KI-Dienste nicht in den Browser gehören.
 *
 * Phase 1b wird für WhatsApp eine zweite Funktion haben, die dieselbe
 * Pipeline aufruft.
 */

import { corsHeaders, jsonResponse, requireApprovedCaller, serviceRoleClient } from '../_shared/context.ts';
import { isConfigured } from '../_shared/ai.ts';
import { runEntryPipeline, type IncomingAttachment } from '../_shared/entry-pipeline.ts';

const ALLOWED_KINDS = ['foto', 'sprachnachricht', 'dokument', 'video'];
const ALLOWED_TYPES = ['protokoll', 'bericht', 'notiz', 'todo'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;
  const { caller } = check;

  if (!isConfigured()) {
    return jsonResponse(
      { error: 'Die KI-Dienste sind nicht eingerichtet (AZURE_OPENAI_ENDPOINT fehlt).' },
      503,
    );
  }

  const body = await req.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'Ungültige Anfrage' }, 400);

  const attachments: IncomingAttachment[] = Array.isArray(body.attachments) ? body.attachments : [];

  // Der Pfad kommt aus dem Browser. Ohne Prüfung könnte ein angemeldeter
  // Benutzer eine beliebige Datei des Buckets an einen Eintrag hängen oder
  // abtippen lassen - die Erfassung legt alles unter erfassung/ ab.
  for (const item of attachments) {
    if (typeof item?.storage_path !== 'string' || !item.storage_path.startsWith('erfassung/')) {
      return jsonResponse({ error: 'Unerwarteter Ablagepfad' }, 400);
    }
    if (!ALLOWED_KINDS.includes(item.kind)) {
      return jsonResponse({ error: `Unbekannte Anhangsart: ${item.kind}` }, 400);
    }
  }

  if (body.type && !ALLOWED_TYPES.includes(body.type)) {
    return jsonResponse({ error: `Unbekannte Eintragsart: ${body.type}` }, 400);
  }

  if (!body.text?.trim() && attachments.length === 0) {
    return jsonResponse({ error: 'Ohne Text und ohne Anhang gibt es nichts zu erfassen.' }, 400);
  }

  try {
    const admin = serviceRoleClient();
    const result = await runEntryPipeline(admin, {
      text: body.text ?? null,
      attachments,
      projectId: body.project_id ?? null,
      forcedType: body.type ?? null,
      entryDate: body.entry_date ?? null,
      source: 'web',
      createdBy: caller.email,
      authorEmployeeId: (caller.employee_id as string) ?? null,
      authorName: (caller.display_name as string) ?? caller.email,
    });

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    console.error('Erfassung fehlgeschlagen:', error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
