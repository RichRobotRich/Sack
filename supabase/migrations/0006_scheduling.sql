-- Zeitplan: was bisher jemand anstoßen musste, läuft ab hier von allein.
--
-- Zwei Aufgaben wiederholen sich:
--   process-inbox    arbeitet WhatsApp-Nachrichten nach, die beim ersten
--                    Anlauf scheiterten (Azure drosselt, Instanz stirbt)
--   index-knowledge  liest hochgeladene Dokumente in die Wissensdatenbank
--
-- Warum nicht einfach im Code? Weil beides Fälle abdeckt, in denen der Code
-- gerade nicht läuft. Ein Nacharbeiter, der nur im selben Prozess startet,
-- der eben abgestürzt ist, hilft niemandem.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Aufruf einer Edge Function aus der Datenbank
-- ---------------------------------------------------------------------------

-- Der Zeitplan kann kein Anmeldetoken mitschicken. Er weist sich mit einem
-- gemeinsamen Geheimnis aus, das im Vault liegt - nicht im Klartext in dieser
-- Migration und nicht in der Aufgabendefinition, die jeder lesen kann, der
-- cron.job abfragt.
--
-- Zwei Geheimnisse müssen einmalig angelegt werden (siehe README):
--   edge_functions_url  https://<projekt-ref>.supabase.co/functions/v1
--   worker_secret       dieselbe Zeichenfolge wie WORKER_SECRET bei den
--                       Edge-Function-Secrets
create or replace function public.trigger_edge_function(function_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  basis text;
  geheimnis text;
  auftrag bigint;
begin
  select decrypted_secret into basis
    from vault.decrypted_secrets where name = 'edge_functions_url';
  select decrypted_secret into geheimnis
    from vault.decrypted_secrets where name = 'worker_secret';

  -- Fehlt die Einrichtung, wird das gemeldet und nicht etwa stillschweigend
  -- nichts getan. Sonst wundert sich in drei Wochen jemand, warum nichts
  -- indiziert wird.
  if basis is null or geheimnis is null then
    raise warning 'Vault unvollständig (edge_functions_url / worker_secret) - % nicht aufgerufen', function_name;
    return null;
  end if;

  select net.http_post(
    url := basis || '/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', geheimnis
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) into auftrag;

  return auftrag;
end;
$fn$;

-- Niemand außer dem Zeitplan braucht das. Über die REST-Schnittstelle wäre
-- es sonst ein Weg, beliebige Funktionen mit dem Geheimnis aufzurufen.
revoke execute on function public.trigger_edge_function(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Aufgaben
-- ---------------------------------------------------------------------------

-- Beim erneuten Einspielen erst abräumen, sonst entstünden Doppelläufe.
do $aufraeumen$
declare
  vorhanden record;
begin
  for vorhanden in
    select jobname from cron.job
    where jobname in ('assistent-eingang-nacharbeit', 'assistent-wissen-indizieren')
  loop
    perform cron.unschedule(vorhanden.jobname);
  end loop;
end;
$aufraeumen$;

-- Alle fünf Minuten. Häufiger bringt nichts: was durchgeht, geht sofort
-- durch, und was hier landet, wartet ohnehin auf einen Anbieter, der gerade
-- drosselt.
select cron.schedule(
  'assistent-eingang-nacharbeit',
  '*/5 * * * *',
  $auftrag$select public.trigger_edge_function('process-inbox')$auftrag$
);

select cron.schedule(
  'assistent-wissen-indizieren',
  '*/5 * * * *',
  $auftrag$select public.trigger_edge_function('index-knowledge')$auftrag$
);
