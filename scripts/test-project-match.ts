/**
 * Prüfung der Projektzuordnung ohne Modell und ohne Netz.
 *
 *   npm run test:match
 *
 * Läuft über Node mit --experimental-strip-types; die Datei selbst wird in
 * Deno ausgeführt, benutzt aber keine Deno-API.
 */

import {
  findCostCenterMatch,
  normalizeForMatch,
  parseCommand,
  resolveProjectQuery,
  scoreProjects,
  type ProjectLike,
} from '../supabase/functions/_shared/project-match.ts';

const projects: ProjectLike[] = [
  { id: 'p1', name: 'Klinikum Musterstadt Haus C', cost_center_number: '2024-117', city: 'Musterstadt', address: 'Krankenhausweg 3', status: 'aktiv' },
  { id: 'p2', name: 'Schulzentrum Nordstraße', cost_center_number: '2024-1170', city: 'Paderborn', address: 'Nordstraße 12', status: 'aktiv' },
  { id: 'p3', name: 'Bürogebäude Ostwall', cost_center_number: 'KT/2023/45', city: 'Erfurt', address: 'Ostwall 7', status: 'abgeschlossen' },
  { id: 'p4', name: 'Sporthalle Lindenberg', cost_center_number: '7', city: 'Lindenberg', address: 'Am Sportplatz 1', status: 'aktiv' },
];

let failures = 0;
let checks = 0;

const check = (label: string, actual: unknown, expected: unknown) => {
  checks++;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`FEHLER  ${label}\n        erwartet: ${JSON.stringify(expected)}\n        erhalten: ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok      ${label}`);
  }
};

console.log('--- Befehle ---');
check('#baustelle mit Argument', parseCommand('#baustelle Klinikum Musterstadt'), { kind: 'projekt_setzen', argument: 'Klinikum Musterstadt' });
check('Großschreibung der Autokorrektur', parseCommand('#BV Ostwall'), { kind: 'projekt_setzen', argument: 'Ostwall' });
check('Leerzeichen nach der Raute', parseCommand('# projekt Nordstraße'), { kind: 'projekt_setzen', argument: 'Nordstraße' });
check('ohne Argument hebt auf', parseCommand('#baustelle'), { kind: 'projekt_loeschen' });
check('#ende hebt auf', parseCommand('#ende'), { kind: 'projekt_loeschen' });
check('Frage', parseCommand('#frage Welcher Druck beim Abpressen?'), { kind: 'frage', argument: 'Welcher Druck beim Abpressen?' });
check('normaler Text ist kein Befehl', parseCommand('Heute Rohre verlegt'), { kind: 'keiner' });
check('Raute mitten im Text ist kein Befehl', parseCommand('Bauteil #4 fehlt'), { kind: 'keiner' });

console.log('\n--- Kostenträger-Nummer ---');
check('exakte Nummer', findCostCenterMatch('Protokoll zu 2024-117, Steigleitung fertig', projects)?.project.id, 'p1');
check('mit Leerzeichen geschrieben', findCostCenterMatch('KT 2024 117 Rohrbruch', projects)?.project.id, 'p1');
check('mit Schrägstrich geschrieben', findCostCenterMatch('Auftrag 2024/117 erledigt', projects)?.project.id, 'p1');
check('Nummer mit Buchstaben', findCostCenterMatch('Siehe KT/2023/45 im Ostwall', projects)?.project.id, 'p3');
// Der wichtigste Fall: 2024-117 darf nicht in 2024-1170 hineintreffen.
check('längere Nummer gewinnt', findCostCenterMatch('Bericht zu 2024-1170', projects)?.project.id, 'p2');
check('einstellige Nummer wird übergangen', findCostCenterMatch('Wir waren zu 7 Mann vor Ort', projects), null);
check('keine Nummer im Text', findCostCenterMatch('Heute nichts besonderes', projects), null);

console.log('\n--- Normalisierung ---');
check('Umlaute und Straße', normalizeForMatch('Nordstraße 12, Bürogebäude'), 'nordstr 12 buerogebaeude');

console.log('\n--- Bewertung und Auflösung ---');
check('Name im Freitext', scoreProjects('Heute im Klinikum Musterstadt Haus C gewesen', projects)[0]?.project.id, 'p1');
check('Ort allein reicht für einen Vorschlag', scoreProjects('Anfahrt nach Lindenberg', projects)[0]?.project.id, 'p4');
check('#baustelle eindeutig', resolveProjectQuery('Schulzentrum Nordstraße', projects).project?.id, 'p2');
check('#baustelle per Nummer', resolveProjectQuery('2024-117', projects).project?.id, 'p1');
check('unbekannte Baustelle: keine Zuordnung', resolveProjectQuery('Tiefgarage Südstadt', projects).project, null);
check('nichts Passendes: keine Vorschläge', resolveProjectQuery('xyzxyz', projects).candidates.length, 0);

console.log(`\n${checks - failures} von ${checks} bestanden.`);
if (failures > 0) process.exit(1);
