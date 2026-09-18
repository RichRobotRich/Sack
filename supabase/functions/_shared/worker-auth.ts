/**
 * Zugang für Funktionen, die sowohl ein Mensch als auch der Zeitplan aufruft.
 *
 * Der Zeitplan (pg_cron über pg_net) kann kein Anmeldetoken mitschicken -
 * er weist sich mit einem gemeinsamen Geheimnis aus, das in Supabase im
 * Vault liegt und als WORKER_SECRET auch der Funktion bekannt ist.
 *
 * Ist WORKER_SECRET nicht gesetzt, geht dieser Weg gar nicht auf: dann bleibt
 * nur der angemeldete Benutzer. Ein leeres Geheimnis darf niemals passen.
 */

import { jsonResponse, requireApprovedCaller, type CallerProfile } from './context.ts';

export type Zugang =
  | { caller: CallerProfile | null; vomZeitplan: boolean }
  | { response: Response };

export const requireWorkerOrCaller = async (req: Request): Promise<Zugang> => {
  const erwartet = Deno.env.get('WORKER_SECRET');
  const mitgeschickt = req.headers.get('x-worker-secret');

  if (erwartet && mitgeschickt) {
    // Vergleich in fester Zeit, damit sich das Geheimnis nicht Zeichen für
    // Zeichen erraten lässt.
    if (erwartet.length === mitgeschickt.length) {
      let difference = 0;
      for (let index = 0; index < erwartet.length; index++) {
        difference |= erwartet.charCodeAt(index) ^ mitgeschickt.charCodeAt(index);
      }
      if (difference === 0) return { caller: null, vomZeitplan: true };
    }
    return { response: jsonResponse({ error: 'Unauthorized' }, 401) };
  }

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check;
  return { caller: check.caller, vomZeitplan: false };
};
