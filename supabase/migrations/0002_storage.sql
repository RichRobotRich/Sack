-- Ablage für Anhänge: Krankmeldungs-Nachweise, News-Bilder und die
-- Tageseinteilungs-PDFs, deren Link per E-Mail verschickt wird.
--
-- Der Bucket ist öffentlich lesbar, weil die E-Mail-Empfänger die PDFs ohne
-- Anmeldung öffnen können müssen - so verhielt sich auch die Base44-Ablage.
-- Die Dateinamen enthalten deshalb eine Zufalls-UUID, damit sie nicht
-- erratbar sind.
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

-- Hochladen darf nur, wer angemeldet und freigegeben ist.
create policy uploads_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and public.is_approved_user());

create policy uploads_update on storage.objects
  for update to authenticated
  using (bucket_id = 'uploads' and public.is_approved_user());

create policy uploads_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and public.is_approved_user());
