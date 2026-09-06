/** Anzahl der Benutzerkonten (für das Dashboard). */
import { corsHeaders, jsonResponse, requireApprovedCaller, serviceRoleClient } from '../_shared/context.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  const { count, error } = await serviceRoleClient()
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ count: count ?? 0 });
});
