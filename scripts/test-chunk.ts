/**
 * Prüfung der Dokumentzerlegung.
 *
 *   npm run test:chunk
 *
 * Reine Logik, kein Netz. Geprüft wird, was die Trefferqualität der
 * Wissensdatenbank bestimmt: Abschnittsgrößen, Überlappung, Überschriften
 * und die Seitenzuordnung – ohne die kann eine Antwort ihre Quelle nicht
 * benennen.
 */

import { chunkPages, looksLikeHeading, buildContext } from '../supabase/functions/_shared/chunk.ts';

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

const truthy = (label: string, wert: boolean) => check(label, wert, true);

console.log('--- Überschriften ---');
truthy('nummerierte Gliederung', looksLikeHeading('4.2 Druckprüfung'));
truthy('Großbuchstaben', looksLikeHeading('SICHERHEITSHINWEISE'));
truthy('Markdown', looksLikeHeading('## Wartung'));
check('normaler Satz', looksLikeHeading('Die Anlage ist jährlich zu warten.'), false);
check('nackte Seitenzahl', looksLikeHeading('12'), false);
check('Gliederungsnummer ohne Text', looksLikeHeading('4.2'), false);
check('zu lang für eine Überschrift',
  looksLikeHeading('Dies ist ein sehr langer Satz der eindeutig keine Überschrift mehr ist sondern Fließtext'),
  false);

console.log('\n--- Zerlegung ---');
check('leeres Dokument', chunkPages([]).length, 0);
check('zu kurz zum Behalten', chunkPages([{ page: 1, text: 'Hallo' }]).length, 0);

const kurz = chunkPages([{
  page: 1,
  text: '4.2 Druckprüfung\n\nDie Dichtheitsprüfung erfolgt mit einem Prüfdruck von 3 bar über 30 Minuten.',
}]);
check('kurzes Dokument: ein Abschnitt', kurz.length, 1);
check('Überschrift übernommen', kurz[0].heading, '4.2 Druckprüfung');
check('Seite übernommen', [kurz[0].pageFrom, kurz[0].pageTo], [1, 1]);

// Ein langes Dokument aus vielen Absätzen: nichts darf über die Zielgröße
// hinauswachsen, sonst passt der Abschnitt nicht mehr sinnvoll in den Kontext.
const langerText = Array.from({ length: 40 },
  (_, index) => `Absatz ${index}. ` + 'Fachtext zur Montage von Rohrleitungen. '.repeat(6)).join('\n\n');
const lang = chunkPages([{ page: 1, text: langerText }]);
truthy('langes Dokument ergibt mehrere Abschnitte', lang.length > 1);
truthy('kein Abschnitt über 2600 Zeichen', lang.every((chunk) => chunk.content.length <= 2600));
truthy('kein Abschnitt unter 40 Zeichen', lang.every((chunk) => chunk.content.length >= 40));
check('fortlaufend nummeriert', lang.map((chunk) => chunk.index), lang.map((_, index) => index));

// Überlappung: das Ende eines Abschnitts muss im nächsten wieder auftauchen,
// sonst wird eine Aussage genau an der Grenze zerrissen.
const ueberlappung = lang.length > 1 &&
  lang[1].content.slice(0, 60).length > 0 &&
  lang[0].content.slice(-60).split(' ').some((wort) => wort.length > 3 && lang[1].content.includes(wort));
truthy('Abschnitte überlappen', ueberlappung);

// Eine Tabelle als eine einzige lange Zeile muss hart geschnitten werden.
const tabelle = chunkPages([{ page: 1, text: 'Artikel;Preis\n' + 'Rohr DN 32;12,50;'.repeat(600) }]);
truthy('überlanger Einzelabsatz wird geschnitten', tabelle.length > 1);
truthy('auch dann keine Übergröße', tabelle.every((chunk) => chunk.content.length <= 2600));

console.log('\n--- Seiten über mehrere Seiten hinweg ---');
const mehrseitig = chunkPages([
  { page: 7, text: 'Wartung\n\n' + 'Text auf Seite sieben. '.repeat(60) },
  { page: 8, text: 'Weiter auf Seite acht. '.repeat(60) },
]);
check('erster Abschnitt beginnt auf Seite 7', mehrseitig[0].pageFrom, 7);
truthy('letzter Abschnitt endet auf Seite 8',
  mehrseitig[mehrseitig.length - 1].pageTo === 8);

console.log('\n--- Kontext für das Modell ---');
const { context, ids } = buildContext([
  { chunk_id: 'c1', document_title: 'Montageanleitung', heading: 'Abgas', content: 'Mindestens DN 32.', page_from: 4 },
  { chunk_id: 'c2', document_title: 'Norm', heading: null, content: 'Prüfdruck 3 bar.', page_from: null },
]);
truthy('Kennungen stehen im Kontext', context.includes('[Q1]') && context.includes('[Q2]'));
truthy('Quelle mit Seitenzahl', context.includes('Montageanleitung, Abgas, Seite 4'));
truthy('Quelle ohne Seitenzahl', context.includes('(Norm)'));
check('Kennungen zeigen auf die Abschnitte', ids, ['c1', 'c2']);

console.log(`\n${checks - failures} von ${checks} bestanden.`);
if (failures > 0) process.exit(1);
