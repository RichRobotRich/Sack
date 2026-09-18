-- Baustellen-Assistent: Eingang über WhatsApp, erzeugte Einträge und
-- Wissensdatenbank. Siehe docs/ARCHITEKTUR.md.
--
-- Die Tabellen folgen dem Bestand: Textspalten für Fremdverweise auf
-- project/employee (der vorhandene Code behandelt IDs so), created_date /
-- updated_date / created_by wie in 0001, Zugriffssteuerung über
-- is_approved_user().

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------

-- Admin-Prüfung für Tabellen, die nicht jeder freigegebene Benutzer ändern
-- darf. Berücksichtigt beide Ebenen: die Systemrolle in profiles.role und die
-- App-Rolle mit is_admin. profiles.role_id ist Text, role.id ist uuid -
-- deshalb der Cast.
create function public.is_admin_user() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from public.profiles p
    left join public.role r on r.id::text = p.role_id
    where p.id = auth.uid()
      and p.is_approved = true
      and (p.role = 'admin' or coalesce(r.is_admin, false))
  );
$$;

revoke execute on function public.is_admin_user() from public, anon;
grant execute on function public.is_admin_user() to authenticated;

-- Rufnummern kommen von Meta ohne Pluszeichen ("4917012345678"), aus der
-- Mitarbeiterpflege dagegen in jeder denkbaren Schreibweise. Beide Seiten
-- werden hierüber auf E.164 gebracht, sonst findet der Abgleich nichts.
-- Ohne Landesvorwahl wird Deutschland angenommen.
create function public.normalize_phone(raw text) returns text
  language sql immutable set search_path = '' as $$
  select case
    when raw is null then null
    when digits = '' then null
    when digits like '00%' then '+' || substr(digits, 3)
    when digits like '0%' then '+49' || substr(digits, 2)
    else '+' || digits
  end
  from (select regexp_replace(raw, '[^0-9]', '', 'g') as digits) s;
$$;

grant execute on function public.normalize_phone(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Eingangskanal
-- ---------------------------------------------------------------------------

-- Freigegebene Rufnummern. Ohne Eintrag mit is_enabled wird eine Nachricht
-- abgewiesen - der Webhook ist öffentlich erreichbar, die Freigabe ist die
-- einzige Zugangskontrolle.
create table public.whatsapp_contact (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  phone text not null unique, -- E.164, immer mit führendem +
  employee_id text, -- Verknüpfter Mitarbeiter (employee.id)
  display_name text, -- Anzeigename, falls kein Mitarbeiter verknüpft ist
  is_enabled boolean not null default false, -- Vom Admin freigegeben
  approved_by text,
  approved_at timestamptz,
  last_message_at timestamptz, -- Zeitpunkt der letzten eingegangenen Nachricht
  note text
);

create trigger whatsapp_contact_set_updated_date before update on public.whatsapp_contact
  for each row execute function public.set_updated_date();

-- Aktiver Projektkontext je Rufnummer und offene Rückfrage. Eine Zeile pro
-- Absender, deshalb unique auf phone statt einer Sitzungshistorie.
create table public.whatsapp_session (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  phone text not null unique,
  project_id text, -- gesetzt über "#baustelle ..."
  project_set_at timestamptz,
  expires_at timestamptz, -- danach gilt der Kontext nicht mehr
  pending_kind text, -- worauf gewartet wird: projektwahl | eintragsart
  pending_payload jsonb not null default '{}'::jsonb -- Zustand der Rückfrage
);

create trigger whatsapp_session_set_updated_date before update on public.whatsapp_session
  for each row execute function public.set_updated_date();

alter table public.whatsapp_session add constraint whatsapp_session_pending_kind_check
  check (pending_kind is null or pending_kind in ('projektwahl', 'eintragsart'));

-- Rohnachrichten, bevor irgendetwas interpretiert wird. Der Webhook schreibt
-- hierhin und antwortet Meta sofort; die Verarbeitung passiert danach.
-- provider_message_id ist eindeutig: Meta stellt bei ausbleibender Bestätigung
-- erneut zu, die Nachricht darf dann nicht doppelt verarbeitet werden.
create table public.inbound_message (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  channel text not null default 'whatsapp',
  provider_message_id text unique, -- wamid... von Meta
  phone text, -- E.164 des Absenders
  contact_id uuid references public.whatsapp_contact(id) on delete set null,
  kind text, -- text | audio | image | document | video | interactive | unsupported
  body text, -- Text bzw. Bildunterschrift
  media_id text, -- Kennung bei Meta, nur begrenzt gültig
  storage_path text, -- Ablage im Bucket assistant, sobald heruntergeladen
  mime_type text,
  raw jsonb not null default '{}'::jsonb, -- vollständige Meldung, für Fehlersuche
  received_at timestamptz not null default now(),
  status text not null default 'neu', -- neu | verarbeitet | fehler | abgewiesen
  error text,
  entry_id uuid -- gesetzt, sobald ein Eintrag daraus entstanden ist
);

alter table public.inbound_message add constraint inbound_message_status_check
  check (status in ('neu', 'verarbeitet', 'fehler', 'abgewiesen'));

create index inbound_message_phone_idx on public.inbound_message (phone, received_at desc);
create index inbound_message_status_idx on public.inbound_message (status) where status = 'neu';

-- Warteschlange. Transkription und Textmodell brauchen zu lange für die
-- Antwort an Meta, Indizierung großer Dokumente erst recht.
create table public.ingest_job (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  kind text not null, -- inbound_message | knowledge_document
  ref_id uuid not null, -- Zeile in der jeweiligen Tabelle
  status text not null default 'wartend', -- wartend | laeuft | fertig | fehler
  attempts integer not null default 0,
  run_after timestamptz not null default now(), -- für verzögerte Wiederholung
  locked_at timestamptz,
  last_error text
);

create trigger ingest_job_set_updated_date before update on public.ingest_job
  for each row execute function public.set_updated_date();

alter table public.ingest_job add constraint ingest_job_kind_check
  check (kind in ('inbound_message', 'knowledge_document'));
alter table public.ingest_job add constraint ingest_job_status_check
  check (status in ('wartend', 'laeuft', 'fertig', 'fehler'));

create index ingest_job_pending_idx on public.ingest_job (run_after)
  where status = 'wartend';
create unique index ingest_job_open_ref_idx on public.ingest_job (kind, ref_id)
  where status in ('wartend', 'laeuft');

-- ---------------------------------------------------------------------------
-- Einträge
-- ---------------------------------------------------------------------------

-- Protokoll, Bericht, Notiz und ToDo in einer Tabelle: die gemeinsamen Felder
-- überwiegen deutlich, und Listen, Suche und Projektzuordnung wären über vier
-- Tabellen hinweg jedes Mal eine Vereinigung. Was sich je Art unterscheidet,
-- steht in structured.
create table public.entry (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers, bei WhatsApp leer
  type text not null, -- protokoll | bericht | notiz | todo
  status text not null default 'entwurf', -- entwurf | offen | erledigt | archiviert
  source text not null default 'web', -- whatsapp | web

  project_id text, -- project.id, null = noch ohne Zuordnung
  project_match_method text, -- kostentraeger | sitzung | ki | manuell | keine
  project_match_confidence numeric, -- 0..1, nur bei Methode ki
  project_match_candidates jsonb not null default '[]'::jsonb, -- Vorschläge zur Auswahl

  author_employee_id text, -- employee.id
  author_phone text, -- E.164, wenn über WhatsApp eingegangen

  entry_date date not null default current_date, -- Tag, auf den sich der Eintrag bezieht
  title text,
  body_md text, -- lesbare Fassung, Markdown
  structured jsonb not null default '{}'::jsonb, -- je Art: Arbeiten, Mängel, Beteiligte ...

  -- nur für type = 'todo'
  due_date date,
  assignee_employee_id text,
  priority text, -- niedrig | normal | hoch | dringend

  -- Ein automatisch erzeugter Eintrag ist ein Vorschlag, kein Ergebnis.
  -- needs_review bleibt true, bis ihn jemand gesehen und freigegeben hat.
  needs_review boolean not null default true,
  reviewed_by text,
  reviewed_at timestamptz,
  ai_model text, -- welches Modell den Eintrag erzeugt hat
  ai_notes text -- Hinweise des Modells, z. B. unverständliche Passagen
);

create trigger entry_set_updated_date before update on public.entry
  for each row execute function public.set_updated_date();

alter table public.entry add constraint entry_type_check
  check (type in ('protokoll', 'bericht', 'notiz', 'todo'));
alter table public.entry add constraint entry_status_check
  check (status in ('entwurf', 'offen', 'erledigt', 'archiviert'));
alter table public.entry add constraint entry_source_check
  check (source in ('whatsapp', 'web'));
alter table public.entry add constraint entry_priority_check
  check (priority is null or priority in ('niedrig', 'normal', 'hoch', 'dringend'));
alter table public.entry add constraint entry_project_match_method_check
  check (project_match_method is null or project_match_method in
    ('kostentraeger', 'sitzung', 'ki', 'manuell', 'keine'));

create index entry_project_idx on public.entry (project_id, entry_date desc);
create index entry_type_status_idx on public.entry (type, status);
create index entry_review_idx on public.entry (needs_review) where needs_review;
create index entry_unassigned_idx on public.entry (created_date desc) where project_id is null;

alter table public.inbound_message
  add constraint inbound_message_entry_id_fkey
  foreign key (entry_id) references public.entry(id) on delete set null;

create table public.entry_attachment (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  created_by text,
  entry_id uuid not null references public.entry(id) on delete cascade,
  inbound_message_id uuid references public.inbound_message(id) on delete set null,
  kind text not null, -- foto | sprachnachricht | dokument | video
  storage_path text not null, -- Bucket assistant
  mime_type text,
  byte_size bigint,
  caption text,
  transcript text, -- Volltext der Sprachnachricht
  sort_order integer not null default 0
);

alter table public.entry_attachment add constraint entry_attachment_kind_check
  check (kind in ('foto', 'sprachnachricht', 'dokument', 'video'));

create index entry_attachment_entry_idx on public.entry_attachment (entry_id, sort_order);

-- ---------------------------------------------------------------------------
-- Wissensdatenbank
-- ---------------------------------------------------------------------------

create table public.knowledge_source (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  kind text not null, -- upload | onedrive | sharepoint
  name text not null,
  config jsonb not null default '{}'::jsonb, -- z. B. {"drive_id": "...", "folder": "..."}
  is_active boolean not null default true,
  delta_token text, -- Fortschrittsmarke des Graph-Abgleichs
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text
);

create trigger knowledge_source_set_updated_date before update on public.knowledge_source
  for each row execute function public.set_updated_date();

alter table public.knowledge_source add constraint knowledge_source_kind_check
  check (kind in ('upload', 'onedrive', 'sharepoint'));

create table public.knowledge_document (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  source_id uuid references public.knowledge_source(id) on delete set null,
  external_id text, -- Kennung beim Herkunftssystem (Graph item id)
  title text not null,
  file_name text,
  mime_type text,
  byte_size bigint,
  storage_path text, -- Kopie im Bucket assistant
  web_url text, -- Rücklink ins Herkunftssystem
  content_hash text, -- unverändert? dann nicht neu indizieren
  page_count integer,
  category text, -- frei, z. B. Herstellerunterlage, Arbeitsanweisung, Norm
  tags text[] not null default '{}',
  status text not null default 'neu', -- neu | indiziert | fehler | veraltet
  indexed_at timestamptz,
  chunk_count integer not null default 0,
  error text
);

create trigger knowledge_document_set_updated_date before update on public.knowledge_document
  for each row execute function public.set_updated_date();

alter table public.knowledge_document add constraint knowledge_document_status_check
  check (status in ('neu', 'indiziert', 'fehler', 'veraltet'));

create unique index knowledge_document_external_idx
  on public.knowledge_document (source_id, external_id)
  where external_id is not null;
create index knowledge_document_status_idx on public.knowledge_document (status);

-- 1536 Dimensionen, nicht die vollen 3072 von text-embedding-3-large: der
-- HNSW-Index von pgvector arbeitet nur bis 2000, und die Qualität fällt bei
-- der Verkürzung kaum ab. Ein Anbieterwechsel muss dieselbe Zahl liefern.
create table public.knowledge_chunk (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  document_id uuid not null references public.knowledge_document(id) on delete cascade,
  chunk_index integer not null,
  heading text, -- Überschrift des Abschnitts, hilft beim Zitieren
  content text not null,
  page_from integer,
  page_to integer,
  token_count integer,
  embedding extensions.vector(1536),
  -- Deutsche Volltextsuche: fängt Typenbezeichnungen und Artikelnummern ab,
  -- bei denen die Ähnlichkeitssuche unzuverlässig ist.
  tsv tsvector generated always as (
    to_tsvector('german', coalesce(heading, '') || ' ' || content)
  ) stored
);

create unique index knowledge_chunk_document_idx
  on public.knowledge_chunk (document_id, chunk_index);
create index knowledge_chunk_tsv_idx on public.knowledge_chunk using gin (tsv);
create index knowledge_chunk_embedding_idx on public.knowledge_chunk
  using hnsw (embedding extensions.vector_cosine_ops);

-- Nachweis: welche Frage wurde wie beantwortet, aus welchen Quellen, und wann
-- gab es nichts. Die unbeantworteten Fragen zeigen die Lücken in der Ablage.
create table public.knowledge_query (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  created_by text,
  channel text not null default 'web', -- web | whatsapp
  phone text,
  question text not null,
  answer text,
  answered boolean not null default false, -- false = keine passende Quelle
  sources jsonb not null default '[]'::jsonb, -- [{document_id, chunk_id, title, page}]
  top_score numeric, -- höchste erreichte Ähnlichkeit
  model text,
  latency_ms integer,
  feedback text -- hilfreich | nicht_hilfreich
);

alter table public.knowledge_query add constraint knowledge_query_channel_check
  check (channel in ('web', 'whatsapp'));
alter table public.knowledge_query add constraint knowledge_query_feedback_check
  check (feedback is null or feedback in ('hilfreich', 'nicht_hilfreich'));

create index knowledge_query_unanswered_idx on public.knowledge_query (created_date desc)
  where not answered;

-- ---------------------------------------------------------------------------
-- Suche über die Wissensdatenbank
-- ---------------------------------------------------------------------------

-- Hybrid aus Ähnlichkeits- und Volltextsuche, zusammengeführt per Reciprocal
-- Rank Fusion. Die Konstante 60 ist der übliche Dämpfungswert: sie verhindert,
-- dass ein einzelner Spitzentreffer alles andere verdrängt.
--
-- Wichtig für die Zusage "nur aus der Wissensdatenbank": liefert diese
-- Funktion nichts, wird das Modell gar nicht erst gefragt.
create function public.match_knowledge_chunks(
  query_embedding extensions.vector(1536),
  query_text text default null,
  match_count integer default 8,
  min_similarity numeric default 0.35
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  web_url text,
  heading text,
  content text,
  page_from integer,
  page_to integer,
  similarity numeric,
  score numeric
)
language sql stable set search_path = public, extensions as $$
  with pool as (
    select greatest(match_count * 5, 40) as n
  ),
  semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from public.knowledge_chunk c
    join public.knowledge_document d on d.id = c.document_id
    where c.embedding is not null and d.status = 'indiziert'
    order by c.embedding <=> query_embedding
    limit (select n from pool)
  ),
  lexical as (
    select c.id,
           row_number() over (
             order by ts_rank_cd(c.tsv, websearch_to_tsquery('german', query_text)) desc
           ) as rank
    from public.knowledge_chunk c
    join public.knowledge_document d on d.id = c.document_id
    where query_text is not null and length(trim(query_text)) > 0
      and d.status = 'indiziert'
      and c.tsv @@ websearch_to_tsquery('german', query_text)
    order by ts_rank_cd(c.tsv, websearch_to_tsquery('german', query_text)) desc
    limit (select n from pool)
  ),
  fused as (
    select coalesce(s.id, l.id) as id,
           coalesce(1.0 / (60 + s.rank), 0) + coalesce(1.0 / (60 + l.rank), 0) as score,
           l.rank is not null as lexical_hit
    from semantic s
    full outer join lexical l on l.id = s.id
  )
  select c.id,
         d.id,
         d.title,
         d.web_url,
         c.heading,
         c.content,
         c.page_from,
         c.page_to,
         (1 - (c.embedding <=> query_embedding))::numeric as similarity,
         f.score::numeric
  from fused f
  join public.knowledge_chunk c on c.id = f.id
  join public.knowledge_document d on d.id = c.document_id
  -- Die Schwelle gilt für Ähnlichkeitstreffer. Ein wörtlicher Volltexttreffer
  -- darf sie unterschreiten: bei "Vitodens 200-W" oder "DN 32" ist die
  -- Zeichenfolge das stärkere Signal als die Bedeutungsnähe.
  where (1 - (c.embedding <=> query_embedding)) >= min_similarity or f.lexical_hit
  order by f.score desc
  limit match_count;
$$;

revoke execute on function public.match_knowledge_chunks(extensions.vector, text, integer, numeric)
  from public, anon;
grant execute on function public.match_knowledge_chunks(extensions.vector, text, integer, numeric)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Zugriffssteuerung
-- ---------------------------------------------------------------------------

alter table public.whatsapp_contact enable row level security;
alter table public.whatsapp_session enable row level security;
alter table public.inbound_message enable row level security;
alter table public.ingest_job enable row level security;
alter table public.entry enable row level security;
alter table public.entry_attachment enable row level security;
alter table public.knowledge_source enable row level security;
alter table public.knowledge_document enable row level security;
alter table public.knowledge_chunk enable row level security;
alter table public.knowledge_query enable row level security;

-- Einträge: jeder freigegebene Benutzer darf lesen und bearbeiten, wie im
-- Bestand. Eine Einschränkung auf eigene Projekte kommt in Phase 3.
create policy entry_rw on public.entry
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy entry_attachment_rw on public.entry_attachment
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());

-- Fragen und Antworten: lesen darf jeder Freigegebene, geschrieben wird über
-- die Edge Function. Nachträgliches Ändern nur für Rückmeldungen.
create policy knowledge_query_select on public.knowledge_query
  for select to authenticated using (public.is_approved_user());
create policy knowledge_query_update on public.knowledge_query
  for update to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());

-- Dokumente und Abschnitte: lesen für alle Freigegebenen, sonst hätte die
-- Antwort keine anklickbare Quelle. Pflegen nur Admins.
create policy knowledge_document_select on public.knowledge_document
  for select to authenticated using (public.is_approved_user());
create policy knowledge_document_admin on public.knowledge_document
  for all to authenticated using (public.is_admin_user())
  with check (public.is_admin_user());
create policy knowledge_chunk_select on public.knowledge_chunk
  for select to authenticated using (public.is_approved_user());

-- Reine Verwaltung: Rufnummern-Freigabe, Dokumentenquellen, Rohnachrichten und
-- Warteschlange gehen niemanden außer Admins etwas an.
create policy whatsapp_contact_admin on public.whatsapp_contact
  for all to authenticated using (public.is_admin_user())
  with check (public.is_admin_user());
create policy whatsapp_session_admin on public.whatsapp_session
  for all to authenticated using (public.is_admin_user())
  with check (public.is_admin_user());
create policy inbound_message_admin on public.inbound_message
  for select to authenticated using (public.is_admin_user());
create policy ingest_job_admin on public.ingest_job
  for select to authenticated using (public.is_admin_user());
create policy knowledge_source_admin on public.knowledge_source
  for all to authenticated using (public.is_admin_user())
  with check (public.is_admin_user());
