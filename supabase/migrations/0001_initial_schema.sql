-- Generiert von scripts/generate-schema.mjs aus base44/entities/*.jsonc.
-- Nicht von Hand bearbeiten: Schema dort ändern und neu generieren,
-- oder Folgeänderungen als eigene Migration anlegen.

-- Hält updated_date bei jedem UPDATE aktuell.
create function public.set_updated_date() returns trigger language plpgsql as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

-- User (Base44) -> public.profiles, verknüpft mit auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  role_id text, -- Rollen-ID
  is_approved boolean default false, -- Vom Admin freigegeben
  employee_id text, -- Verknüpfter Mitarbeiter
  location text, -- Standort des Benutzers
  display_name text, -- Anzeigename des Benutzers (wird verwendet wenn kein Mitarbeiter verknüpft ist)
  planpro boolean default false, -- PlanPro Zugriff
  pl_sort_order jsonb default '[]'::jsonb -- Gespeicherte PL-Reihenfolge für Wocheneinteilung
);

create trigger profiles_set_updated_date before update on public.profiles
  for each row execute function public.set_updated_date();

alter table public.profiles add constraint profiles_location_check check (location is null or location in ('PB', 'EF', 'admin'));

-- Assignment
create table public.assignment (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  date date not null, -- Einsatzdatum
  project_id text, -- Baustellen-ID
  employee_id text, -- Mitarbeiter-ID
  vehicle_id text, -- Fahrzeug-ID
  departure_time text, -- Abfahrtszeit
  work_start_time text, -- Arbeitszeit von (HH:MM)
  work_end_time text, -- Arbeitszeit bis (HH:MM)
  assignment_type text default 'baustelle', -- Art des Eintrags
  is_supervisor boolean default false, -- Bauleitender Monteur
  notes text -- Bemerkungen
);

create trigger assignment_set_updated_date before update on public.assignment
  for each row execute function public.set_updated_date();

alter table public.assignment add constraint assignment_assignment_type_check check (assignment_type is null or assignment_type in ('baustelle', 'urlaub', 'krank', 'schule', 'pruefung', 'tbz', 'ts', 'beurlaubung', 'override_leer'));

-- BridgeDay
create table public.bridge_day (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  date date not null, -- Datum des Brückentages (yyyy-MM-dd)
  note text -- Optionale Notiz
);

create trigger bridge_day_set_updated_date before update on public.bridge_day
  for each row execute function public.set_updated_date();


-- CellInfo
create table public.cell_info (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  project_id text not null, -- Baustellen-ID
  date date not null, -- Datum des Eintrags (yyyy-MM-dd)
  info text not null, -- Info-Text für diese Zelle
  show_in_pdf boolean default false -- Info im PDF anzeigen
);

create trigger cell_info_set_updated_date before update on public.cell_info
  for each row execute function public.set_updated_date();


-- ClothingDelivery
create table public.clothing_delivery (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  clothing_item_id text not null, -- Artikel-ID
  quantity numeric not null, -- Menge
  delivery_date date not null, -- Lieferdatum
  supplier text, -- Lieferant
  notes text, -- Bemerkungen
  recorded_by_name text -- Name des Benutzers, der die Lieferung erfasst hat
);

create trigger clothing_delivery_set_updated_date before update on public.clothing_delivery
  for each row execute function public.set_updated_date();


-- ClothingIssue
create table public.clothing_issue (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  employee_id text not null, -- Mitarbeiter-ID
  employee_name text not null, -- Name des Mitarbeiters
  clothing_item_id text not null, -- Artikel-ID
  article_name text not null, -- Artikelbezeichnung
  size text not null, -- Größe
  quantity numeric not null, -- Ausgegebene Menge
  request_date date, -- Anfragedatum
  issue_date date not null, -- Ausgabedatum
  request_id text, -- Zugehörige Anfrage-ID
  notes text, -- Bemerkungen
  recorded_by_name text, -- Name des Benutzers, der die Ausgabe erfasst hat
  is_returned boolean default false, -- Wurde zurückgegeben
  returned_date date -- Datum der Rückgabe
);

create trigger clothing_issue_set_updated_date before update on public.clothing_issue
  for each row execute function public.set_updated_date();


-- ClothingItem
create table public.clothing_item (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  article_name text not null, -- Artikelbezeichnung
  size text not null, -- Größe
  current_stock numeric default 0, -- Aktueller Bestand
  minimum_stock numeric default 0, -- Mindestbestand
  is_active boolean default true, -- Aktiv
  is_used boolean default false -- Gebrauchte Kleidung
);

create trigger clothing_item_set_updated_date before update on public.clothing_item
  for each row execute function public.set_updated_date();

alter table public.clothing_item add constraint clothing_item_size_check check (size is null or size in ('23', '24', '25', '26', '27', '28', '29', '30', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60', '62', '64', '88', '90', '94', '98', '102', '106', '110', '114', '4XL'));

-- ClothingRequest
create table public.clothing_request (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  employee_id text, -- Mitarbeiter-ID
  items jsonb default '[]'::jsonb, -- Bestellte Artikel
  status text default 'eingereicht', -- Status
  notes text, -- Bemerkungen
  processed_by text -- Bearbeitet von
);

create trigger clothing_request_set_updated_date before update on public.clothing_request
  for each row execute function public.set_updated_date();

alter table public.clothing_request add constraint clothing_request_status_check check (status is null or status in ('eingereicht', 'in_bearbeitung', 'bestellt', 'geliefert', 'abgelehnt'));

-- ClothingReturn
create table public.clothing_return (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  request_id text not null, -- Zugehörige Anfrage-ID
  employee_id text, -- Mitarbeiter-ID
  items jsonb default '[]'::jsonb, -- Zurückzugebende Artikel
  reason text not null, -- Grund der Rückgabe / Bemerkung
  status text default 'eingereicht' -- Status der Rückgabe
);

create trigger clothing_return_set_updated_date before update on public.clothing_return
  for each row execute function public.set_updated_date();

alter table public.clothing_return add constraint clothing_return_status_check check (status is null or status in ('eingereicht', 'akzeptiert', 'abgelehnt'));

-- Crew
create table public.crew (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  name text not null, -- Name der Kolonne
  member_ids jsonb default '[]'::jsonb -- Liste der Mitarbeiter-IDs (alle Monteure)
);

create trigger crew_set_updated_date before update on public.crew
  for each row execute function public.set_updated_date();


-- EmailRecipient
create table public.email_recipient (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  email text not null, -- E-Mail-Adresse
  name text not null, -- Name
  notification_types jsonb default '[]'::jsonb, -- Benachrichtigungstypen: urlaub, krankmeldung, arbeitskleidung
  allowed_roles jsonb default '[]'::jsonb, -- Rollen-IDs, von denen Anträge weitergeleitet werden sollen
  is_active boolean default true -- Aktiv
);

create trigger email_recipient_set_updated_date before update on public.email_recipient
  for each row execute function public.set_updated_date();


-- Employee
create table public.employee (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  full_name text not null, -- Vollständiger Name des Mitarbeiters
  employee_type text not null, -- Typ des Mitarbeiters
  abbreviation text, -- Kürzel für Projektleiter
  overnight_stay boolean default false, -- Übernachtung dauerhaft (Legacy, wird durch overnight_stay_weeks ersetzt)
  overnight_stay_weeks jsonb default '[]'::jsonb, -- Liste von Montags-Daten (yyyy-MM-dd) der Wochen mit Übernachtung
  overnight_stay_days jsonb default '[]'::jsonb, -- Pro KW: welche Tage der Mitarbeiter auf Montage ist (Übernachtung)
  friday_exceptions jsonb default '[]'::jsonb, -- Liste von Freitags-Daten (yyyy-MM-dd), an denen der Mitarbeiter trotz Übernachtungs-KW arbeitet (Ausnahme)
  has_drivers_license boolean default false, -- Führerschein vorhanden
  has_trailer_license boolean default false, -- Anhängerführerschein vorhanden
  apprentice_year numeric, -- Lehrjahr (für Azubis)
  school_days jsonb default '[]'::jsonb, -- Wochentage der Berufsschule (0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr) für Azubis
  vacation_periods jsonb default '[]'::jsonb, -- Ferienzeiten für Azubis (keine automatische Schulzuweisung)
  tbz_periods jsonb default '[]'::jsonb, -- TBZ-Zeiträume für Azubis (automatische TBZ-Zuweisung)
  exam_periods jsonb default '[]'::jsonb, -- Prüfungszeiträume für Azubis (automatische Prüfungs-Zuweisung)
  is_active boolean default true, -- Mitarbeiter aktiv
  phone text, -- Telefonnummer
  email text, -- E-Mail-Adresse
  remark text, -- Bemerkung zum Mitarbeiter
  is_ef boolean default false, -- EF Mitarbeiter
  is_independent boolean default false, -- Eigenständig (wird lila angezeigt)
  early_shift boolean default false, -- Frühschicht (wird in der Frühschicht-Jahresübersicht angezeigt)
  has_workshop boolean default false, -- Monteur arbeitet in der Werkstatt
  mentor_id text, -- ID des zugeordneten Betreuers (Monteur) für Azubis
  always_own_vehicle boolean default false -- Mitarbeiter fährt immer mit eigenem Fahrzeug (Kolonne/Eigenfahrer) – sein zugeordnetes Fahrzeug wird immer auf seine Baustelle gesetzt
);

create trigger employee_set_updated_date before update on public.employee
  for each row execute function public.set_updated_date();

alter table public.employee add constraint employee_employee_type_check check (employee_type is null or employee_type in ('projektleiter', 'monteur', 'azubi', 'praktikant', 'buerokraft', 'lagerist'));

-- LeaveApprovalRule
create table public.leave_approval_rule (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  user_email text not null, -- E-Mail des Benutzers, der Anträge sehen darf
  can_view_roles jsonb default '[]'::jsonb not null, -- Liste der Rollen-IDs, deren Anträge dieser Benutzer sehen kann
  is_active boolean default true -- Regel aktiv
);

create trigger leave_approval_rule_set_updated_date before update on public.leave_approval_rule
  for each row execute function public.set_updated_date();


-- LeaveRequest
create table public.leave_request (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  employee_id text, -- Mitarbeiter-ID
  employee_name text, -- Name des Mitarbeiters
  requester_role_id text, -- Rolle des Antragstellers
  request_type text not null, -- Antragstyp
  start_date date not null, -- Startdatum
  end_date date not null, -- Enddatum
  is_half_day boolean default false, -- Halber Tag
  half_day_type text, -- Vormittag oder Nachmittag (nur wenn is_half_day true)
  status text default 'eingereicht', -- Status
  reason text, -- Begründung
  attachment_url text, -- Angehängte Datei/Bild URL
  approved_by text, -- Genehmigt von
  approved_at timestamptz, -- Genehmigt am
  notes text, -- Bemerkungen
  is_revoked boolean default false -- Wurde aufgehoben
);

create trigger leave_request_set_updated_date before update on public.leave_request
  for each row execute function public.set_updated_date();

alter table public.leave_request add constraint leave_request_request_type_check check (request_type is null or request_type in ('urlaub', 'krankmeldung'));
alter table public.leave_request add constraint leave_request_half_day_type_check check (half_day_type is null or half_day_type in ('vormittag', 'nachmittag'));
alter table public.leave_request add constraint leave_request_status_check check (status is null or status in ('eingereicht', 'in_pruefung', 'genehmigt', 'abgelehnt'));

-- News
create table public.news (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  title text not null, -- Überschrift des Beitrags
  images jsonb default '[]'::jsonb, -- Array von Bildern mit optionalen Links und Beschriftungen
  content text, -- Haupttext des Beitrags
  link text, -- Link zum Button
  link_text text, -- Anzeigetext für den Button
  is_active boolean default true -- Beitrag aktiv/deaktiviert
);

create trigger news_set_updated_date before update on public.news
  for each row execute function public.set_updated_date();


-- Poll
create table public.poll (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  title text not null, -- Überschrift der Abstimmung
  image_url text, -- Bild-URL
  description text, -- Beschreibungstext
  options jsonb default '[]'::jsonb not null, -- Auswahloptionen
  votes jsonb default '[]'::jsonb, -- Abgegebene Stimmen
  show_results boolean default false, -- Ergebnisse auf Dashboard anzeigen
  is_active boolean default true -- Aktiv/Inaktiv
);

create trigger poll_set_updated_date before update on public.poll
  for each row execute function public.set_updated_date();


-- Project
create table public.project (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  name text not null, -- Baustellenname
  cost_center_number text, -- Kostenträger Nummer
  address text, -- Adresse
  city text, -- Stadt
  project_leader_id text, -- ID des Projektleiters
  completion_date date, -- Fertigstellungstermin (Datum)
  completion_date_text text, -- Fertigstellungstermin als Text (z.B. 'KW 20', 'Ende Juli')
  default_departure_time text, -- Standard-Abfahrtszeit
  default_work_start_time text, -- Standard-Arbeitszeit von (HH:MM)
  default_work_end_time text, -- Standard-Arbeitszeit bis (HH:MM)
  lead_assembler text, -- Obermonteur
  status text default 'aktiv', -- Projektstatus
  notes text, -- Bemerkungen
  is_ts_project boolean default false, -- TS Projekt (wird nicht in Bauvorhaben angezeigt)
  is_ef_project boolean default false, -- EF Projekt
  is_planpro boolean default false, -- PlanPro Projekt (wird in der PlanPro App angezeigt)
  accommodation_name text, -- Name der Unterkunft
  accommodation_address text -- Adresse der Unterkunft
);

create trigger project_set_updated_date before update on public.project
  for each row execute function public.set_updated_date();

alter table public.project add constraint project_status_check check (status is null or status in ('aktiv', 'abgeschlossen', 'pausiert'));

-- ProjectComment
create table public.project_comment (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  project_id text not null, -- ID der Baustelle
  text text not null, -- Kommentartext
  start_date date not null -- Ab welchem Montag gilt der Kommentar (inklusiv)
);

create trigger project_comment_set_updated_date before update on public.project_comment
  for each row execute function public.set_updated_date();


-- Role
create table public.role (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  name text not null, -- Rollenname
  allowed_pages jsonb default '[]'::jsonb not null, -- Erlaubte Seiten für diese Rolle
  is_admin boolean default false, -- Admin-Rolle (hat Zugriff auf alles)
  is_active boolean default true, -- Aktiv
  description text, -- Beschreibung der Rolle
  can_approve_leave_for_roles jsonb default '[]'::jsonb -- Liste der Rollen-IDs, deren Urlaubsanträge diese Rolle genehmigen kann
);

create trigger role_set_updated_date before update on public.role
  for each row execute function public.set_updated_date();


-- TempAssignment
create table public.temp_assignment (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  temp_worker_id text not null, -- Leiharbeiter-ID
  project_id text, -- Baustellen-ID
  week_start date not null, -- Wochenbeginn (Montag)
  days jsonb default '[]'::jsonb, -- Einsatztage in der Woche
  notes text -- Bemerkungen
);

create trigger temp_assignment_set_updated_date before update on public.temp_assignment
  for each row execute function public.set_updated_date();


-- TempWorker
create table public.temp_worker (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  full_name text not null, -- Name des Leiharbeiters
  agency text, -- Leiharbeitsfirma
  phone text, -- Telefonnummer
  skills text, -- Qualifikationen
  is_active boolean default true, -- Aktiv verfügbar
  is_ef boolean default false -- EF Leiharbeiter
);

create trigger temp_worker_set_updated_date before update on public.temp_worker
  for each row execute function public.set_updated_date();


-- TempWorkerProjectRow
create table public.temp_worker_project_row (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  project_id text not null, -- ID der Baustelle
  notes text -- Bemerkungen zur Baustelle
);

create trigger temp_worker_project_row_set_updated_date before update on public.temp_worker_project_row
  for each row execute function public.set_updated_date();


-- Vehicle
create table public.vehicle (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  license_plate text not null, -- Kennzeichen
  vehicle_number text, -- Interne Fahrzeugnummer
  vehicle_type text, -- Fahrzeugtyp
  seats numeric, -- Anzahl Sitzplätze
  is_active boolean default true, -- Fahrzeug verfügbar
  is_ef boolean default false, -- EF Fahrzeug
  next_tuev_date date, -- Nächster TÜV-Termin
  next_inspection_date date, -- Nächster Inspektionstermin
  notes text, -- Bemerkungen
  assigned_employee_id text, -- Zugeordneter Monteur (für Transporter/PKW)
  always_assign boolean default false -- Fahrzeug immer automatisch zuteilen wenn der verknüpfte Monteur eingeplant ist (z.B. Eigenfahrer, Kolonnenfahrzeug)
);

create trigger vehicle_set_updated_date before update on public.vehicle
  for each row execute function public.set_updated_date();

alter table public.vehicle add constraint vehicle_vehicle_type_check check (vehicle_type is null or vehicle_type in ('transporter', 'pkw', 'lkw', 'anhaenger'));

-- WeeklyReport
create table public.weekly_report (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  user_email text not null, -- E-Mail des Benutzers
  user_name text, -- Name des Benutzers
  week_start date not null, -- Montag der Woche
  days jsonb default '[]'::jsonb not null, -- Arbeitstage Montag bis Freitag
  total_hours numeric, -- Gesamtstunden der Woche
  status text default 'in_pruefung', -- Status des Berichts
  submitted_at timestamptz, -- Zeitpunkt der Einreichung
  reviewed_by text, -- Geprüft von
  reviewed_at timestamptz, -- Zeitpunkt der Prüfung
  review_note text -- Bemerkung zur Prüfung
);

create trigger weekly_report_set_updated_date before update on public.weekly_report
  for each row execute function public.set_updated_date();

alter table public.weekly_report add constraint weekly_report_status_check check (status is null or status in ('in_pruefung', 'anerkannt', 'abgelehnt'));

-- WorkshopTask
create table public.workshop_task (
  id uuid primary key default gen_random_uuid(),
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text, -- E-Mail des Erstellers
  title text not null, -- Bauteil/Aufgabe
  project_id text, -- Zugehörige Baustelle
  due_date date, -- Fälligkeitsdatum (strukturiert)
  due_date_text text, -- Fälligkeitsdatum als Freitext (z.B. KW 22, Ende Mai)
  status text default 'offen', -- Status
  priority text default 'normal', -- Priorität
  assigned_to text, -- Zugewiesen an
  notes text -- Bemerkungen
);

create trigger workshop_task_set_updated_date before update on public.workshop_task
  for each row execute function public.set_updated_date();

alter table public.workshop_task add constraint workshop_task_status_check check (status is null or status in ('offen', 'bereit', 'fertig'));
alter table public.workshop_task add constraint workshop_task_priority_check check (priority is null or priority in ('niedrig', 'normal', 'hoch', 'dringend'));

-- Zugriffssteuerung (Row Level Security)
create function public.is_approved_user() returns boolean
  language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_approved = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.assignment enable row level security;
alter table public.bridge_day enable row level security;
alter table public.cell_info enable row level security;
alter table public.clothing_delivery enable row level security;
alter table public.clothing_issue enable row level security;
alter table public.clothing_item enable row level security;
alter table public.clothing_request enable row level security;
alter table public.clothing_return enable row level security;
alter table public.crew enable row level security;
alter table public.email_recipient enable row level security;
alter table public.employee enable row level security;
alter table public.leave_approval_rule enable row level security;
alter table public.leave_request enable row level security;
alter table public.news enable row level security;
alter table public.poll enable row level security;
alter table public.project enable row level security;
alter table public.project_comment enable row level security;
alter table public.role enable row level security;
alter table public.temp_assignment enable row level security;
alter table public.temp_worker enable row level security;
alter table public.temp_worker_project_row enable row level security;
alter table public.vehicle enable row level security;
alter table public.weekly_report enable row level security;
alter table public.workshop_task enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_select_approved on public.profiles
  for select to authenticated using (public.is_approved_user());

create policy assignment_rw on public.assignment
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy bridge_day_rw on public.bridge_day
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy cell_info_rw on public.cell_info
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy clothing_delivery_rw on public.clothing_delivery
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy clothing_issue_rw on public.clothing_issue
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy clothing_item_rw on public.clothing_item
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy clothing_request_rw on public.clothing_request
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy clothing_return_rw on public.clothing_return
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy crew_rw on public.crew
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy email_recipient_rw on public.email_recipient
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy employee_rw on public.employee
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy leave_approval_rule_rw on public.leave_approval_rule
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy leave_request_rw on public.leave_request
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy news_rw on public.news
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy poll_rw on public.poll
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy project_rw on public.project
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy project_comment_rw on public.project_comment
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy role_rw on public.role
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy temp_assignment_rw on public.temp_assignment
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy temp_worker_rw on public.temp_worker
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy temp_worker_project_row_rw on public.temp_worker_project_row
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy vehicle_rw on public.vehicle
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy weekly_report_rw on public.weekly_report
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());
create policy workshop_task_rw on public.workshop_task
  for all to authenticated using (public.is_approved_user())
  with check (public.is_approved_user());

-- Legt zu jedem neuen Konto ein (noch nicht freigegebenes) Profil an.
create function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, is_approved)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    false
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Indizes für die häufigsten Abfragen der App
create index assignment_date_idx on public.assignment (date);
create index assignment_employee_id_idx on public.assignment (employee_id);
create index assignment_project_id_idx on public.assignment (project_id);
create index temp_assignment_week_start_idx on public.temp_assignment (week_start);
create index temp_assignment_temp_worker_id_idx on public.temp_assignment (temp_worker_id);
create index leave_request_employee_id_idx on public.leave_request (employee_id);
create index leave_request_status_idx on public.leave_request (status);
create index employee_is_active_idx on public.employee (is_active);
create index project_status_idx on public.project (status);
