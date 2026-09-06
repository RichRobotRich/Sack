/**
 * E-Mail-Versand für das Frontend (ersetzt integrations.Core.SendEmail).
 *
 * Der Versand läuft bewusst serverseitig: der API-Schlüssel des Mailanbieters
 * darf nicht im Browser landen.
 */
import { corsHeaders, jsonResponse, requireApprovedCaller } from '../_shared/context.ts';
import { sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  const { to, subject, body, from_name } = await req.json().catch(() => ({}));
  if (!to || !subject || !body) {
    return jsonResponse({ error: 'to, subject und body sind erforderlich' }, 400);
  }

  try {
    const result = await sendEmail({ to, subject, body, from_name });
    return jsonResponse({ success: true, id: result?.id ?? null });
  } catch (error) {
    console.error('Versand fehlgeschlagen:', error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
