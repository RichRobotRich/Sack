-- Nacharbeit zur Sicherheitsprüfung von Supabase (Database Linter).

-- 1. Fester Suchpfad für die Trigger-Funktion. Ohne ihn könnte ein
--    veränderter search_path bestimmen, welche Objekte die Funktion trifft.
alter function public.set_updated_date() set search_path = '';

-- 2. handle_new_user() ist eine reine Trigger-Funktion, war aber zusätzlich
--    über die REST-Schnittstelle aufrufbar. Der Trigger selbst bleibt davon
--    unberührt: Postgres prüft das Ausführungsrecht beim Anlegen des
--    Triggers, nicht bei jedem Auslösen.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 3. is_approved_user() behält 'authenticated': die Funktion wird in jeder
--    RLS-Regel ausgewertet, und zwar mit den Rechten des abfragenden Kontos.
--    Ein Entzug würde sämtliche Zugriffe blockieren - geprüft mit
--    "set role authenticated": ohne das Recht scheitert jede Abfrage.
--    Für 'anon' wird sie nicht gebraucht.
revoke execute on function public.is_approved_user() from public, anon;
grant execute on function public.is_approved_user() to authenticated;
