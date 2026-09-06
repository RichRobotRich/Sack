#!/usr/bin/env node
/**
 * Schreibt die Beispieldaten aus scripts/seed.mjs als reines SQL.
 *
 *   node scripts/generate-seed-sql.mjs > supabase/seed.sql
 *
 * Hintergrund: seed.mjs braucht Node und den Service-Role-Schlüssel. Für die
 * Ersteinrichtung ist es bequemer, das SQL direkt im SQL-Editor von Supabase
 * einzufügen. Damit beide Wege nicht auseinanderlaufen, wird das SQL aus
 * demselben Skript erzeugt: seed.mjs läuft hier gegen einen Ersatz-Client,
 * der die Schreibzugriffe aufzeichnet, statt sie zu senden.
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import module from 'node:module';

const statements = [];
let idCounter = 0;

const sqlLiteral = (value) => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value) || typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
};

// Feste IDs statt Zufallswerten: so ergibt ein erneuter Lauf dieselbe Datei
// und Änderungen sind im Diff ablesbar.
const nextId = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`;

const tableApi = (table) => ({
  insert(rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    const created = list.map((row) => ({ ...row, id: nextId() }));
    for (const row of created) {
      const columns = ['id', ...Object.keys(row).filter((name) => name !== 'id')];
      statements.push(
        `insert into public.${table} (${columns.join(', ')}) ` +
          `values (${columns.map((name) => sqlLiteral(row[name])).join(', ')});`,
      );
    }
    return { select: async () => ({ data: created, error: null }) };
  },
  update(values) {
    return {
      eq: async (column, value) => {
        const assignments = Object.entries(values)
          .map(([name, item]) => `${name} = ${sqlLiteral(item)}`)
          .join(', ');
        statements.push(
          `update public.${table} set ${assignments} where ${column} = ${sqlLiteral(value)};`,
        );
        return { data: null, error: null };
      },
    };
  },
  // Das Leeren steht als fester Block im Kopf der Datei.
  delete: () => ({ not: async () => ({ data: null, error: null }) }),
});

// Tabellen, die das Seed-Skript belegt - in derselben Reihenfolge wie dort.
const TABLES_TO_CLEAR = [
  'assignment',
  'temp_assignment',
  'temp_worker',
  'leave_request',
  'clothing_item',
  'vehicle',
  'project',
  'employee',
  'role',
  'news',
  'bridge_day',
];

// seed.mjs importiert @supabase/supabase-js. Dieser Haken hängt stattdessen
// den aufzeichnenden Ersatz ein.
const STUB = pathToFileURL(path.resolve('scripts/.seed-sql-stub.mjs')).href;

const main = async () => {
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(
    'scripts/.seed-sql-stub.mjs',
    'export const createClient = () => ({ from: globalThis.__seedTableApi });\n',
  );
  globalThis.__seedTableApi = tableApi;

  module.register(
    'data:text/javascript,' +
      encodeURIComponent(
        `export async function resolve(specifier, context, next) {
          if (specifier === '@supabase/supabase-js') {
            return { url: ${JSON.stringify(STUB)}, shortCircuit: true };
          }
          return next(specifier, context);
        }`,
    ),
    import.meta.url,
  );

  // seed.mjs bricht ohne diese Variablen ab.
  process.env.SUPABASE_URL ||= 'https://seed.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'seed';

  const log = console.log;
  console.log = () => {}; // Fortschrittsmeldungen des Seeds unterdrücken
  await import(pathToFileURL(path.resolve('scripts/seed.mjs')).href);
  await new Promise((resolve) => setTimeout(resolve, 300));
  console.log = log;

  unlinkSync('scripts/.seed-sql-stub.mjs');

  const out = [
    '-- Beispieldaten für die Entwicklung.',
    '--',
    '-- Gleicher Inhalt wie scripts/seed.mjs, aber als reines SQL: so lässt es sich',
    '-- ohne Node direkt im SQL-Editor von Supabase einfügen.',
    '--',
    '-- ACHTUNG: leert die betroffenen Tabellen vorher. Nicht auf einer',
    '-- Datenbank mit echten Daten ausführen.',
    '--',
    '-- Erzeugt mit: node scripts/generate-seed-sql.mjs > supabase/seed.sql',
    '',
    'begin;',
    '',
    ...TABLES_TO_CLEAR.map((table) => `delete from public.${table};`),
    '',
    ...statements,
    '',
    'commit;',
  ];

  process.stdout.write(out.join('\n') + '\n');
};

main().catch((error) => {
  console.error(`Fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
