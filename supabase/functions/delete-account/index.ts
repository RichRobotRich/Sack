/**
 * Löscht das eigene Konto.
 *
 * Das Entfernen aus auth.users setzt Service-Role-Rechte voraus, die der
 * Browser nicht hat. Gelöscht wird ausschließlich das Konto des Aufrufers;
 * eine Benutzer-ID nimmt die Funktion bewusst nicht entgegen. Das Profil
 * verschwindet über den Fremdschlüssel mit (on delete cascade).
 */
import { corsHeaders, getCaller, jsonResponse, serviceRoleClient } from '../_shared/context.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const caller = await getCaller(req);
  if (!caller) return jsonResponse({ error: 'Unauthorized' }, 401);

  const { error } = await serviceRoleClient().auth.admin.deleteUser(caller.id);
  if (error) return jsonResponse({ error: error.message }, 500);

  return jsonResponse({ success: true });
});
