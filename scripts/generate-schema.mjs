#!/usr/bin/env node
/**
 * Erzeugt die Postgres-Migration aus den Entity-Schemas, die Base44 exportiert hat.
 *
 * Die Dateien unter base44/entities/ sind die einzige verlässliche Beschreibung
 * des Datenmodells aus der alten Umgebung. Statt 25 Tabellen von Hand
 * abzutippen, wird die Migration hier generiert – so bleibt sie
 * nachvollziehbar und lässt sich nach einer Schema-Änderung neu erzeugen.
 *
 *   node scripts/generate-schema.mjs > supabase/migrations/0001_initial_schema.sql
 */

import fs from 'node:fs';
import path from 'node:path';

const ENTITY_DIR = 'base44/entities';

// Die User-Entity wird nicht zu einer normalen Tabelle: ihre Felder landen in
// public.profiles, das an auth.users hängt. Siehe profilesTable() weiter unten.
const AUTH_ENTITY = 'User';

/** Employee -> employee, LeaveRequest -> leave_request */
const toTableName = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** JSON-Schema-Property -> Postgres-Spaltentyp */
const toColumnType = (prop) => {
  switch (prop.type) {
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'numeric';
    case 'array':
    case 'object':
      return 'jsonb';
    case 'string':
      if (prop.format === 'date') return 'date';
      if (prop.format === 'date-time') return 'timestamptz';
      return 'text';
    default:
      throw new Error(`Unbekannter Property-Typ: ${JSON.stringify(prop)}`);
  }
};

const sqlLiteral = (value) => {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
};

const toDefaultClause = (prop) => {
  if (prop.default === undefined) {
    // Arrays ohne expliziten Default trotzdem auf [] setzen: der Frontend-Code
    // liest sie durchgehend mit .map/.filter, ein NULL wäre dort ein Absturz.
    return prop.type === 'array' ? " default '[]'::jsonb" : '';
  }
  if (prop.type === 'array' || prop.type === 'object') {
    return ` default '${JSON.stringify(prop.default).replace(/'/g, "''")}'::jsonb`;
  }
  return ` default ${sqlLiteral(prop.default)}`;
};

/** Liefert Definition und Kommentar getrennt: der Kommentar muss hinter das
 *  trennende Komma, sonst kommentiert er es weg. */
const buildColumn = (columnName, prop, required) => {
  const parts = [`  ${columnName} ${toColumnType(prop)}`];
  parts.push(toDefaultClause(prop));
  if (required) parts.push(' not null');
  return {
    sql: parts.join(''),
    comment: prop.description ? prop.description.replace(/\s+/g, ' ') : '',
  };
};

/** Fügt die Spalten mit Komma zusammen und hängt Kommentare dahinter an. */
const joinColumns = (columns) =>
  columns
    .map((column, index) => {
      const isLast = index === columns.length - 1;
      const line = isLast ? column.sql : `${column.sql},`;
      return column.comment ? `${line} -- ${column.comment}` : line;
    })
    .join('\n');

/** enum-Properties werden als CHECK-Constraint abgebildet, nicht als PG-Enum:
 *  neue Werte lassen sich so ohne Typ-Migration ergänzen. */
const buildEnumChecks = (tableName, properties) =>
  Object.entries(properties)
    .filter(([, prop]) => Array.isArray(prop.enum))
    .map(([columnName, prop]) => {
      const values = prop.enum.map(sqlLiteral).join(', ');
      return `alter table public.${tableName} add constraint ${tableName}_${columnName}_check ` +
        `check (${columnName} is null or ${columnName} in (${values}));`;
    });

const buildTable = (entity) => {
  const tableName = toTableName(entity.name);
  const required = new Set(entity.required || []);
  const columns = Object.entries(entity.properties || {}).map(([columnName, prop]) =>
    buildColumn(columnName, prop, required.has(columnName)),
  );

  // Diese vier Felder legt Base44 implizit auf jeder Entity an; der
  // Frontend-Code liest id, created_date und created_by an vielen Stellen.
  const systemColumns = [
    { sql: '  id uuid primary key default gen_random_uuid()', comment: '' },
    { sql: '  created_date timestamptz not null default now()', comment: '' },
    { sql: '  updated_date timestamptz not null default now()', comment: '' },
    { sql: '  created_by text', comment: 'E-Mail des Erstellers' },
  ];

  return [
    `-- ${entity.name}`,
    `create table public.${tableName} (`,
    joinColumns([...systemColumns, ...columns]),
    ');',
    '',
    `create trigger ${tableName}_set_updated_date before update on public.${tableName}`,
    '  for each row execute function public.set_updated_date();',
    '',
    ...buildEnumChecks(tableName, entity.properties || {}),
  ].join('\n');
};

/** public.profiles ersetzt die User-Entity und hängt an auth.users. */
const profilesTable = (entity) => {
  const columns = Object.entries(entity.properties || {}).map(([columnName, prop]) =>
    buildColumn(columnName, prop, false),
  );
  return [
    '-- User (Base44) -> public.profiles, verknüpft mit auth.users',
    'create table public.profiles (',
    joinColumns([
      { sql: '  id uuid primary key references auth.users(id) on delete cascade', comment: '' },
      { sql: '  email text not null unique', comment: '' },
      { sql: '  full_name text', comment: '' },
      // role gehört nicht zum exportierten User-Schema, weil Base44 es als
      // Systemfeld führte. Der Code prüft an mehreren Stellen user.role ===
      // 'admin', also muss die Spalte hier mitwandern.
      { sql: "  role text not null default 'user'", comment: "Systemrolle: 'admin' oder 'user'" },
      // Prüfspur der Freigabe. Base44 legte diese Felder beim Schreiben
      // dynamisch an; gelesen wurden sie nie, sie sind aber die einzige
      // Auskunft darüber, wer ein Konto freigeschaltet hat.
      { sql: '  approved_by text', comment: 'E-Mail des freigebenden Admins' },
      { sql: '  approved_at timestamptz', comment: 'Zeitpunkt der Freigabe' },
      { sql: '  created_date timestamptz not null default now()', comment: '' },
      { sql: '  updated_date timestamptz not null default now()', comment: '' },
      { sql: '  created_by text', comment: '' },
      ...columns,
    ]),
    ');',
    '',
    'create trigger profiles_set_updated_date before update on public.profiles',
    '  for each row execute function public.set_updated_date();',
    '',
    "alter table public.profiles add constraint profiles_role_check check (role in ('admin', 'user'));",
    ...buildEnumChecks('profiles', entity.properties || {}),
  ].join('\n');
};

const readEntities = () =>
  fs
    .readdirSync(ENTITY_DIR)
    .filter((file) => file.endsWith('.jsonc'))
    .sort()
    .map((file) => JSON.parse(fs.readFileSync(path.join(ENTITY_DIR, file), 'utf8')));

const main = () => {
  const entities = readEntities();
  const dataEntities = entities.filter((entity) => entity.name !== AUTH_ENTITY);
  const userEntity = entities.find((entity) => entity.name === AUTH_ENTITY);
  const tableNames = ['profiles', ...dataEntities.map((entity) => toTableName(entity.name))];

  const out = [];
  out.push('-- Generiert von scripts/generate-schema.mjs aus base44/entities/*.jsonc.');
  out.push('-- Nicht von Hand bearbeiten: Schema dort ändern und neu generieren,');
  out.push('-- oder Folgeänderungen als eigene Migration anlegen.');
  out.push('');
  out.push('-- Hält updated_date bei jedem UPDATE aktuell.');
  out.push('create function public.set_updated_date() returns trigger language plpgsql as $$');
  out.push('begin');
  out.push('  new.updated_date = now();');
  out.push('  return new;');
  out.push('end;');
  out.push('$$;');
  out.push('');

  if (userEntity) {
    out.push(profilesTable(userEntity));
    out.push('');
  }
  for (const entity of dataEntities) {
    out.push(buildTable(entity));
    out.push('');
  }

  // Zugriff: Die App ist ein internes Werkzeug. Wer eingeloggt UND freigegeben
  // ist, darf lesen und schreiben; die feinere Steuerung, welche Seite wer
  // sieht, macht die Rollenverwaltung in der App. Nicht freigegebene Konten
  // kommen an keine Daten - das ersetzt den user_not_registered-Gate von Base44.
  out.push('-- Zugriffssteuerung (Row Level Security)');
  out.push('create function public.is_approved_user() returns boolean');
  out.push('  language sql security definer stable set search_path = public as $$');
  out.push('  select exists (');
  out.push('    select 1 from public.profiles');
  out.push('    where id = auth.uid() and is_approved = true');
  out.push('  );');
  out.push('$$;');
  out.push('');

  for (const tableName of tableNames) {
    out.push(`alter table public.${tableName} enable row level security;`);
  }
  out.push('');

  // Jeder Angemeldete darf sein eigenes Profil sehen - sonst könnte die App
  // gar nicht feststellen, ob das Konto noch auf Freigabe wartet.
  out.push('create policy profiles_select_own on public.profiles');
  out.push('  for select to authenticated using (id = auth.uid());');
  out.push('create policy profiles_update_own on public.profiles');
  out.push('  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());');
  out.push('create policy profiles_select_approved on public.profiles');
  out.push('  for select to authenticated using (public.is_approved_user());');
  out.push('');

  for (const tableName of tableNames.filter((name) => name !== 'profiles')) {
    out.push(`create policy ${tableName}_rw on public.${tableName}`);
    out.push('  for all to authenticated using (public.is_approved_user())');
    out.push('  with check (public.is_approved_user());');
  }
  out.push('');

  // Neu registrierte Konten bekommen automatisch ein Profil - allerdings
  // ohne Freigabe. Ein Admin schaltet sie in der Benutzerverwaltung frei.
  out.push('-- Legt zu jedem neuen Konto ein (noch nicht freigegebenes) Profil an.');
  out.push('create function public.handle_new_user() returns trigger');
  out.push('  language plpgsql security definer set search_path = public as $$');
  out.push('begin');
  out.push('  insert into public.profiles (id, email, full_name, is_approved)');
  out.push('  values (');
  out.push('    new.id,');
  out.push('    new.email,');
  out.push("    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),");
  out.push('    false');
  out.push('  );');
  out.push('  return new;');
  out.push('end;');
  out.push('$$;');
  out.push('');
  out.push('create trigger on_auth_user_created after insert on auth.users');
  out.push('  for each row execute function public.handle_new_user();');
  out.push('');

  // Indizes auf den Spalten, nach denen der Frontend-Code tatsächlich filtert.
  // Die Spaltennamen werden gegen die Entity-Schemas geprüft, damit ein
  // umbenanntes Feld hier nicht als kaputte Migration endet.
  const indexes = [
    ['Assignment', 'date'],
    ['Assignment', 'employee_id'],
    ['Assignment', 'project_id'],
    ['TempAssignment', 'week_start'],
    ['TempAssignment', 'temp_worker_id'],
    ['LeaveRequest', 'employee_id'],
    ['LeaveRequest', 'status'],
    ['Employee', 'is_active'],
    ['Project', 'status'],
  ];

  const byName = new Map(entities.map((entity) => [entity.name, entity]));
  out.push('-- Indizes für die häufigsten Abfragen der App');
  for (const [entityName, columnName] of indexes) {
    const entity = byName.get(entityName);
    if (!entity?.properties?.[columnName]) {
      throw new Error(
        `Index verweist auf unbekanntes Feld ${entityName}.${columnName} – Entity-Schema geändert?`,
      );
    }
    const tableName = toTableName(entityName);
    out.push(`create index ${tableName}_${columnName}_idx on public.${tableName} (${columnName});`);
  }

  process.stdout.write(out.join('\n') + '\n');
};

main();
