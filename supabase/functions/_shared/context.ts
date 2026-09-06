/**
 * Gemeinsame Bausteine für die Edge Functions.
 *
 * Ersetzt createClientFromRequest() aus dem Base44-SDK. Dort lieferte ein
 * Aufruf sowohl den Benutzerkontext als auch asServiceRole; hier sind das
 * zwei getrennte Clients, damit im Code sichtbar bleibt, wann bewusst an der
 * Zugriffssteuerung vorbei gearbeitet wird.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Client mit vollen Rechten – umgeht Row Level Security. Sparsam einsetzen. */
export const serviceRoleClient = (): SupabaseClient =>
  createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

export type CallerProfile = {
  id: string;
  email: string;
  role: string;
  is_approved: boolean;
  [key: string]: unknown;
};

/**
 * Prüft das Bearer-Token des Aufrufers und lädt sein Profil.
 * Gibt null zurück, wenn niemand angemeldet ist.
 */
export const getCaller = async (req: Request): Promise<CallerProfile | null> => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length);
  const admin = serviceRoleClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  return { ...(profile ?? {}), id: data.user.id, email: data.user.email! } as CallerProfile;
};

/** true, wenn der Aufrufer Systemadmin ist oder eine als Admin markierte Rolle hat. */
export const isAdmin = async (caller: CallerProfile): Promise<boolean> => {
  if (caller.role === 'admin') return true;
  if (!caller.role_id) return false;

  const admin = serviceRoleClient();
  const { data } = await admin
    .from('role')
    .select('is_admin')
    .eq('id', caller.role_id)
    .maybeSingle();
  return Boolean(data?.is_admin);
};

/** Einheitliche Vorprüfung: CORS, Anmeldung, Freigabe. */
export const requireApprovedCaller = async (
  req: Request,
): Promise<{ caller: CallerProfile } | { response: Response }> => {
  const caller = await getCaller(req);
  if (!caller) return { response: jsonResponse({ error: 'Unauthorized' }, 401) };
  if (!caller.is_approved) {
    return { response: jsonResponse({ error: 'Konto ist nicht freigegeben' }, 403) };
  }
  return { caller };
};
