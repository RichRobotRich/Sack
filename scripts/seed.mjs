#!/usr/bin/env node
/**
 * Legt Beispieldaten für die Entwicklung an.
 *
 * Die Base44-Umgebung enthielt nur Testdaten, die nicht mitgewandert sind.
 * Damit die Seiten nicht auf leere Listen laufen, füllt dieses Skript einen
 * realistischen kleinen Bestand: Rollen, Mitarbeiter, Fahrzeuge, Baustellen
 * und eine Wocheneinteilung rund um das heutige Datum.
 *
 * Aufruf (Service-Role-Schlüssel nötig, weil RLS sonst greift):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed.mjs
 *
 * Das Skript ist wiederholbar: es räumt die von ihm belegten Tabellen vorher
 * ab. NICHT gegen eine Produktivdatenbank laufen lassen.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY müssen gesetzt sein.');
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });

/** yyyy-MM-dd, ausgehend von heute plus Versatz in Tagen. */
const dateOffset = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Montag der laufenden Woche. */
const currentMonday = () => {
  const date = new Date();
  const weekday = date.getDay();
  date.setDate(date.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return date.toISOString().slice(0, 10);
};

const insert = async (table, rows) => {
  const { data, error } = await db.from(table).insert(rows).select();
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table}: ${data.length}`);
  return data;
};

// Reihenfolge ist egal, weil zwischen den Tabellen keine Fremdschlüssel
// bestehen – die Verknüpfungen laufen über IDs in Textspalten.
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

const clear = async () => {
  console.log('Bestehende Beispieldaten entfernen:');
  for (const table of TABLES_TO_CLEAR) {
    const { error } = await db.from(table).delete().not('id', 'is', null);
    if (error) throw new Error(`${table} leeren: ${error.message}`);
  }
  console.log(`  ${TABLES_TO_CLEAR.length} Tabellen geleert`);
};

const seed = async () => {
  console.log('Beispieldaten anlegen:');

  const roles = await insert('role', [
    {
      name: 'Administrator',
      is_admin: true,
      is_active: true,
      description: 'Voller Zugriff',
      allowed_pages: [],
    },
    {
      name: 'Disponent',
      is_admin: false,
      is_active: true,
      description: 'Planung und Verwaltung',
      allowed_pages: [
        'Dashboard',
        'WeeklyPlanning',
        'DailyView',
        'TempWorkers',
        'EmployeeManagement',
        'ProjectManagement',
        'VehicleManagement',
      ],
    },
    {
      name: 'Monteur',
      is_admin: false,
      is_active: true,
      description: 'Eigene Ansichten',
      allowed_pages: [
        'Dashboard',
        'CurrentPlan',
        'ProjectList',
        'WeeklyReports',
        'LeaveRequests',
        'SickReports',
        'ClothingRequests',
      ],
    },
  ]);

  const employees = await insert('employee', [
    { full_name: 'Michael Braun', employee_type: 'projektleiter', abbreviation: 'BRA', is_active: true, has_drivers_license: true },
    { full_name: 'Sabine Wolf', employee_type: 'projektleiter', abbreviation: 'WOL', is_active: true, has_drivers_license: true },
    { full_name: 'Thomas Keller', employee_type: 'monteur', is_active: true, has_drivers_license: true, has_trailer_license: true },
    { full_name: 'Andreas Krüger', employee_type: 'monteur', is_active: true, has_drivers_license: true, has_workshop: true },
    { full_name: 'Stefan Lorenz', employee_type: 'monteur', is_active: true, is_independent: true, has_drivers_license: true },
    { full_name: 'Markus Hoffmann', employee_type: 'monteur', is_active: true, early_shift: true },
    { full_name: 'Daniel Schuster', employee_type: 'monteur', is_active: true, is_ef: true, has_drivers_license: true },
    { full_name: 'Jonas Fischer', employee_type: 'azubi', apprentice_year: 2, school_days: [1, 2], is_active: true },
    { full_name: 'Lena Vogel', employee_type: 'azubi', apprentice_year: 1, school_days: [3], is_active: true },
    { full_name: 'Petra Sommer', employee_type: 'buerokraft', is_active: true },
    { full_name: 'Ralf Zimmermann', employee_type: 'lagerist', is_active: true, has_workshop: true },
  ]);

  const byName = (name) => employees.find((employee) => employee.full_name === name);

  // Betreuer für die Azubis eintragen.
  await db
    .from('employee')
    .update({ mentor_id: byName('Thomas Keller').id })
    .eq('id', byName('Jonas Fischer').id);

  const projects = await insert('project', [
    {
      name: 'Neubau Sporthalle',
      cost_center_number: '4711',
      address: 'Schulstraße 12',
      city: 'Paderborn',
      project_leader_id: byName('Michael Braun').id,
      status: 'aktiv',
      default_departure_time: '06:30',
      default_work_start_time: '07:00',
      default_work_end_time: '16:00',
      completion_date: dateOffset(120),
    },
    {
      name: 'Sanierung Rathaus',
      cost_center_number: '4712',
      address: 'Marktplatz 1',
      city: 'Detmold',
      project_leader_id: byName('Sabine Wolf').id,
      status: 'aktiv',
      default_departure_time: '06:00',
      default_work_start_time: '07:00',
      default_work_end_time: '16:30',
      completion_date_text: 'KW 42',
    },
    {
      name: 'Logistikzentrum Erweiterung',
      cost_center_number: '4713',
      address: 'Industriering 40',
      city: 'Erfurt',
      project_leader_id: byName('Sabine Wolf').id,
      status: 'aktiv',
      is_ef_project: true,
      default_departure_time: '06:15',
    },
    {
      name: 'Wohnanlage Südstadt',
      cost_center_number: '4699',
      city: 'Paderborn',
      project_leader_id: byName('Michael Braun').id,
      status: 'abgeschlossen',
    },
  ]);

  await insert('vehicle', [
    { license_plate: 'PB-LE 101', vehicle_number: '101', vehicle_type: 'transporter', seats: 3, is_active: true, next_tuev_date: dateOffset(200) },
    { license_plate: 'PB-LE 102', vehicle_number: '102', vehicle_type: 'transporter', seats: 6, is_active: true, next_tuev_date: dateOffset(45) },
    { license_plate: 'PB-LE 103', vehicle_number: '103', vehicle_type: 'lkw', seats: 3, is_active: true, assigned_employee_id: byName('Stefan Lorenz').id, always_assign: true },
    { license_plate: 'EF-LE 201', vehicle_number: '201', vehicle_type: 'transporter', seats: 5, is_active: true, is_ef: true },
  ]);

  await insert('clothing_item', [
    { article_name: 'Arbeitshose', size: '50', current_stock: 12, minimum_stock: 5, is_active: true },
    { article_name: 'Arbeitshose', size: '52', current_stock: 3, minimum_stock: 5, is_active: true },
    { article_name: 'Winterjacke', size: '54', current_stock: 7, minimum_stock: 3, is_active: true },
    { article_name: 'Sicherheitsschuhe', size: '44', current_stock: 4, minimum_stock: 4, is_active: true },
  ]);

  // Einteilung für die laufende Woche: Montag bis Freitag.
  const monday = currentMonday();
  const weekDates = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const crew = [
    { employee: 'Thomas Keller', project: 'Neubau Sporthalle', supervisor: true },
    { employee: 'Andreas Krüger', project: 'Neubau Sporthalle', supervisor: false },
    { employee: 'Jonas Fischer', project: 'Neubau Sporthalle', supervisor: false },
    { employee: 'Stefan Lorenz', project: 'Sanierung Rathaus', supervisor: true },
    { employee: 'Markus Hoffmann', project: 'Sanierung Rathaus', supervisor: false },
    { employee: 'Daniel Schuster', project: 'Logistikzentrum Erweiterung', supervisor: true },
  ];

  const assignments = [];
  for (const date of weekDates) {
    const weekday = new Date(date).getDay();
    for (const entry of crew) {
      const employee = byName(entry.employee);
      // Azubis sind an ihren Berufsschultagen nicht auf der Baustelle.
      const schoolDay = employee.school_days?.includes((weekday + 6) % 7);
      const project = projects.find((candidate) => candidate.name === entry.project);
      assignments.push({
        date,
        employee_id: employee.id,
        project_id: schoolDay ? null : project.id,
        assignment_type: schoolDay ? 'schule' : 'baustelle',
        is_supervisor: !schoolDay && entry.supervisor,
        departure_time: schoolDay ? null : project.default_departure_time,
        work_start_time: schoolDay ? null : project.default_work_start_time,
        work_end_time: schoolDay ? null : project.default_work_end_time,
      });
    }
  }
  await insert('assignment', assignments);

  await insert('leave_request', [
    {
      employee_id: byName('Markus Hoffmann').id,
      employee_name: 'Markus Hoffmann',
      request_type: 'urlaub',
      start_date: dateOffset(21),
      end_date: dateOffset(32),
      status: 'eingereicht',
      reason: 'Sommerurlaub',
    },
    {
      employee_id: byName('Andreas Krüger').id,
      employee_name: 'Andreas Krüger',
      request_type: 'krankmeldung',
      start_date: dateOffset(-4),
      end_date: dateOffset(-2),
      status: 'genehmigt',
    },
  ]);

  await insert('temp_worker', [
    { full_name: 'Kowalski', agency: 'Fa. Nord', is_active: true, skills: 'Montage' },
    { full_name: 'Petrov', agency: 'Fa. Nord', is_active: true },
  ]);

  await insert('news', [
    {
      title: 'Betriebsversammlung',
      content: 'Die nächste Betriebsversammlung findet am kommenden Freitag um 14:00 Uhr in der Halle statt.',
      is_active: true,
    },
  ]);

  await insert('bridge_day', [{ date: dateOffset(60), note: 'Brückentag nach Feiertag' }]);

  console.log(`\nRollen-IDs für die Zuordnung in der Benutzerverwaltung:`);
  for (const role of roles) {
    console.log(`  ${role.name}: ${role.id}`);
  }
};

const main = async () => {
  try {
    await clear();
    await seed();
    console.log('\nFertig. Erstes Konto über die Anmeldeseite registrieren, dann in');
    console.log('der Tabelle profiles is_approved auf true und role auf admin setzen.');
  } catch (error) {
    console.error(`\nFehlgeschlagen: ${error.message}`);
    process.exit(1);
  }
};

main();
