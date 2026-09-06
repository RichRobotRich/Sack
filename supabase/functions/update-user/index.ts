/**
 * Fremde Benutzerprofile ändern – nur für Admins.
 *
 * Ein Konto darf per RLS ausschließlich sein eigenes Profil schreiben.
 * Rollenvergabe und Freigabe laufen deshalb über diese Funktion, die die
 * Adminrechte des Aufrufers prüft, bevor sie mit Service-Role schreibt.
 */
import {
  corsHeaders,
  isAdmin,
  jsonResponse,
  requireApprovedCaller,
  serviceRoleClient,
} from '../_shared/context.ts';

/** Nur diese Felder dürfen von außen gesetzt werden. */
const ALLOWED_FIELDS = ['role_id', 'employee_id', 'is_approved', 'location', 'role', 'planpro'] as const;

/**
 * Meldet der Bau-App, dass sich der PlanPro-Zugriff geändert hat.
 * Fehler hier dürfen die Profiländerung nicht zurücknehmen.
 */
const notifyPlanProWebhook = async (email: string, planpro: boolean) => {
  const webhookUrl = Deno.env.get('SECONDARY_APP_WEBHOOK_URL');
  const apiKey = Deno.env.get('SECONDARY_APP_API_KEY');
  if (!webhookUrl || !apiKey) {
    console.warn('[planpro webhook] übersprungen: SECONDARY_APP_WEBHOOK_URL oder _API_KEY fehlt');
    return;
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', api_key: apiKey },
      body: JSON.stringify({ email, planpro }),
    });
    console.log(`[planpro webhook] ${email}: HTTP ${response.status}`);
  } catch (error) {
    console.error('[planpro webhook] fehlgeschlagen:', error);
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  if (!(await isAdmin(check.caller))) {
    return jsonResponse({ error: 'Forbidden: Adminrechte erforderlich' }, 403);
  }

  const payload = await req.json().catch(() => ({}));
  const { user_id } = payload;
  if (!user_id) return jsonResponse({ error: 'user_id fehlt' }, 400);

  const updates: Record<string, unknown> = {};
  for (const field of ALLOWED_FIELDS) {
    if (payload[field] !== undefined) updates[field] = payload[field];
  }
  if (Object.keys(updates).length === 0) {
    return jsonResponse({ error: 'Keine änderbaren Felder übergeben' }, 400);
  }

  // Festhalten, wer freigegeben hat – die Angaben stammen vom geprüften
  // Aufrufer, nicht aus dem Anfrage-Text.
  if (payload.is_approved === true) {
    updates.approved_by = check.caller.email;
    updates.approved_at = new Date().toISOString();
  }

  const admin = serviceRoleClient();
  const { data, error } = await admin
    .from('profiles')
    .update(updates)
    .eq('id', user_id)
    .select()
    .single();

  if (error) return jsonResponse({ error: error.message }, 500);

  if (payload.planpro !== undefined) {
    await notifyPlanProWebhook(data.email, payload.planpro);
  }

  return jsonResponse({ success: true, user: data });
});
