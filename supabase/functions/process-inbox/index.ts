/**
 * Nacharbeiter für Nachrichten, die beim ersten Anlauf nicht durchgingen.
 *
 * Der Webhook verarbeitet im Hintergrund direkt weiter. Das deckt den
 * Normalfall ab, aber nicht den Fall, dass Azure gerade drosselt oder die
 * Instanz stirbt. Dafür gibt es ingest_job und diese Funktion.
 *
 * Aufrufen kann sie ein Admin aus der Oberfläche – oder ein Zeitplan, sobald
 * einer eingerichtet ist (Supabase: pg_cron plus pg_net).
 */

import { corsHeaders, jsonResponse, requireApprovedCaller, serviceRoleClient } from '../_shared/context.ts';
import { handleInboundMessage } from '../_shared/whatsapp-handler.ts';

const MAX_ATTEMPTS = 3;
const BATCH = 10;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  const admin = serviceRoleClient();

  const { data: jobs, error } = await admin
    .from('ingest_job')
    .select('*')
    .eq('kind', 'inbound_message')
    .eq('status', 'wartend')
    .lte('run_after', new Date().toISOString())
    .order('run_after')
    .limit(BATCH);

  if (error) return jsonResponse({ error: error.message }, 500);

  let erledigt = 0;
  let gescheitert = 0;

  for (const job of jobs ?? []) {
    await admin
      .from('ingest_job')
      .update({ status: 'laeuft', locked_at: new Date().toISOString(), attempts: job.attempts + 1 })
      .eq('id', job.id);

    try {
      const { data: message } = await admin
        .from('inbound_message')
        .select('*')
        .eq('id', job.ref_id)
        .single();
      if (!message) throw new Error('Nachricht nicht gefunden');

      await handleInboundMessage(admin, message);
      await admin.from('ingest_job').update({ status: 'fertig' }).eq('id', job.id);
      erledigt++;
    } catch (failure) {
      const attempts = job.attempts + 1;
      const aufgeben = attempts >= MAX_ATTEMPTS;

      await admin.from('ingest_job').update({
        status: aufgeben ? 'fehler' : 'wartend',
        last_error: (failure as Error).message,
        // Abstand verdoppeln: drosselt Azure gerade, hilft sofortiges
        // Nachsetzen niemandem.
        run_after: new Date(Date.now() + 2 ** attempts * 60_000).toISOString(),
      }).eq('id', job.id);

      gescheitert++;
    }
  }

  return jsonResponse({ success: true, geprueft: jobs?.length ?? 0, erledigt, gescheitert });
});
