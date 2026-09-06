/**
 * Baut aus index.html, karte.css, app.js und geo-deutschland.js eine einzige
 * HTML-Datei - zum Weitergeben, per Mail verschicken oder einfach
 * doppelklicken. Das Logo wandert als Data-URL mit hinein, damit die Datei
 * wirklich allein lauffähig ist.
 *
 *   node projektkarte/build-einzeldatei.mjs
 *
 * Mit --rumpf entsteht statt einer vollständigen Seite nur der Seiteninhalt
 * (Titel, Stil, Markup, Skript) - so wird die Karte als Artifact veröffentlicht.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (name) => fs.readFileSync(path.join(hier, name), 'utf8');

const nurRumpf = process.argv.includes('--rumpf');
const zielArgument = process.argv.find((a) => a.startsWith('--ziel='));
const ziel = zielArgument
  ? zielArgument.slice('--ziel='.length)
  : path.join(hier, 'projektkarte-komplett.html');

const logo = 'data:image/png;base64,' +
  fs.readFileSync(path.join(hier, 'logo.png')).toString('base64');

let markup = lies('index.html');
const css = lies('karte.css');
const geo = lies('geo-deutschland.js');
let app = lies('app.js');

// In der Artifact-Fassung bleibt der Seitentitel des Browsertabs unverändert.
if (nurRumpf) {
  app = app.replace(/^\s*document\.title = .*\n/gm, '');
}

// Nur den Körper des Grundgerüsts übernehmen und die Verweise auflösen.
const koerper = markup
  .slice(markup.indexOf('<body>') + '<body>'.length, markup.indexOf('</body>'))
  .replace(/<script src="[^"]*"><\/script>/g, '')
  .replace(
    /<img id="logo"[^>]*>/,
    `<img id="logo" class="da" src="${logo}" alt="">`
  )
  .trim();

const titel = 'Leniger Projektkarte';

const stil = ['<title>' + titel + '</title>', '<style>', css.trim(), '</style>'].join('\n');
const skripte = ['<script>', geo.trim(), '</script>', '<script>', app.trim(), '</script>'].join('\n');

const seite = nurRumpf
  ? [stil, '', koerper, '', skripte, ''].join('\n')
  : [
      '<!DOCTYPE html>',
      '<html lang="de">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
      stil,
      '</head>',
      '<body>',
      koerper,
      skripte,
      '</body>',
      '</html>',
      ''
    ].join('\n');

fs.writeFileSync(ziel, seite);
console.log('geschrieben:', ziel, (fs.statSync(ziel).size / 1024).toFixed(0) + ' KB');
