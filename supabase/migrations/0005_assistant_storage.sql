-- Ablage für den Baustellen-Assistenten.
--
-- Eigener Bucket, und anders als 'uploads' aus 0002 ausdrücklich **nicht**
-- öffentlich: hier liegen Sprachnachrichten von Baustellen, Fotos aus dem
-- Kundenobjekt und interne Unterlagen. Der Zugriff läuft über signierte Links
-- mit begrenzter Gültigkeit statt über eine erratbare Adresse.
insert into storage.buckets (id, name, public)
values ('assistant', 'assistant', false)
on conflict (id) do nothing;

-- Lesen darf jeder freigegebene Benutzer. Die Trennung nach Projekten kommt
-- mit den Projektrechten in Phase 3; bis dahin gilt dieselbe Sichtbarkeit wie
-- für die Einträge selbst.
create policy assistant_select on storage.objects
  for select to authenticated
  using (bucket_id = 'assistant' and public.is_approved_user());

create policy assistant_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assistant' and public.is_approved_user());

create policy assistant_update on storage.objects
  for update to authenticated
  using (bucket_id = 'assistant' and public.is_approved_user());

-- Löschen nur für Admins: ein Anhang ist der Nachweis zu einem Protokoll und
-- soll nicht beiläufig verschwinden.
create policy assistant_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'assistant' and public.is_admin_user());
