/**
 * Liste aller Benutzerprofile.
 *
 * Die Benutzerverwaltung braucht alle Profile, die RLS-Regeln geben einem
 * normalen Konto aber nur das eigene frei. Deshalb läuft die Abfrage hier mit
 * Service-Role-Rechten – wie zuvor asServiceRole im Base44-SDK.
 */
import { corsHeaders, jsonResponse, requireApprovedCaller, serviceRoleClient } from '../_shared/context.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  const { data, error } = await serviceRoleClient()
    .from('profiles')
    .select('*')
    .order('email');

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ users: data ?? [] });
});
