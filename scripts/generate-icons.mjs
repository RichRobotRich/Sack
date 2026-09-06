#!/usr/bin/env node
/**
 * Erzeugt alle Bildformate der App aus einer einzigen Vorlage.
 *
 *   Vorlage:  assets/logo-source.png   quadratisches App-Symbol, 1024x1024,
 *                                      abgerundet mit transparenten Ecken
 *
 *   Ergebnis: public/logo.png              freigestelltes Zeichen für die Kopfzeile
 *             public/pwa-192.png           Startsymbol Android/Desktop
 *             public/pwa-512.png             "
 *             public/pwa-512-maskable.png  randlos für Androids Zuschnitt
 *             public/apple-touch-icon.png  Home-Bildschirm auf iPhone/iPad
 *             public/favicon-32.png        Browser-Tab
 *             public/favicon-48.png          "
 *
 * Aufruf:
 *   node scripts/generate-icons.mjs
 *
 * Bei neuem Logo nur assets/logo-source.png austauschen (1024x1024) und das
 * Skript laufen lassen. Passt der Zuschnitt nicht mehr, EMBLEM anpassen.
 */

import sharp from 'sharp';
import path from 'node:path';

const ICON_SOURCE = 'assets/logo-source.png';
const OUT_DIR = 'public';

/** Lage des Emblems in der Vorlage, ohne den umgebenden Rand. */
const EMBLEM = { left: 328, top: 106, width: 375, height: 790 };

/** Hintergrund für Formate ohne Transparenz. Entspricht dem Grund der Vorlage. */
const BACKGROUND = '#f7f7f7';

/**
 * Höhe des ausgelieferten Zeichens. Angezeigt wird es mit höchstens 64 px;
 * 320 px deckt auch Bildschirme mit hoher Pixeldichte reichlich ab.
 */
const LOGO_HEIGHT = 320;

const write = async (image, name) => {
  const file = path.join(OUT_DIR, name);
  const { width, height, size } = await image.toFile(file);
  console.log(`  ${name.padEnd(24)} ${width}x${height}`.padEnd(46) + `${(size / 1024).toFixed(0)} KB`);
};

/**
 * Stellt das Zeichen frei.
 *
 * Der Grund der Vorlage ist ein heller Verlauf, das Zeichen selbst blau und
 * rot. Über die Farbsättigung lassen sich beide sauber trennen – ein
 * Helligkeitsschwellwert scheitert am Verlauf und hinterlässt einen grauen
 * Kasten.
 */
const cutOutEmblem = async () => {
  const { data, info } = await sharp(ICON_SOURCE)
    .extract(EMBLEM)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = info.width * info.height;
  const out = Buffer.alloc(pixels * 4);
  const [SAT_LOW, SAT_HIGH] = [6, 30];

  for (let p = 0; p < pixels; p += 1) {
    const i = p * info.channels;
    let [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const saturation = Math.max(r, g, b) - Math.min(r, g, b);
    const alpha = Math.max(
      0,
      Math.min(255, Math.round(((saturation - SAT_LOW) / (SAT_HIGH - SAT_LOW)) * 255)),
    );

    // Teildeckende Randpixel sind eine Mischung aus Zeichenfarbe und weißem
    // Grund. Ohne Herausrechnen des Weißanteils bliebe auf dunklem
    // Hintergrund ein heller Saum stehen.
    if (alpha > 0 && alpha < 255) {
      const factor = alpha / 255;
      const unmix = (channel) =>
        Math.max(0, Math.min(255, Math.round((channel - 255 * (1 - factor)) / factor)));
      [r, g, b] = [unmix(r), unmix(g), unmix(b)];
    }

    out[p * 4] = r;
    out[p * 4 + 1] = g;
    out[p * 4 + 2] = b;
    out[p * 4 + 3] = alpha;
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .resize({ height: LOGO_HEIGHT })
    // Das Zeichen hat wenige Farben; eine Palette spart hier rund 90 Prozent.
    .png({ palette: true, quality: 90, compressionLevel: 9 });
};

const main = async () => {
  console.log('Bildformate erzeugen:');

  await write(await cutOutEmblem(), 'logo.png');

  // Startsymbol. Transparente Ecken sind hier richtig: Android und die
  // Desktop-Browser zeichnen die Vorlage unverändert.
  for (const size of [192, 512]) {
    await write(sharp(ICON_SOURCE).resize(size, size).png({ compressionLevel: 9 }), `pwa-${size}.png`);
  }

  // Maskierbares Symbol: Android beschneidet es je nach Gerät zu Kreis oder
  // Rechteck. Deshalb randlos hinterlegt und das Zeichen kleiner, damit im
  // sicheren Bereich (mittlere 80 %) nichts abgeschnitten wird.
  await write(
    sharp({ create: { width: 512, height: 512, channels: 4, background: BACKGROUND } })
      .composite([
        {
          input: await sharp(path.join(OUT_DIR, 'logo.png'))
            .resize({ height: Math.round(512 * 0.62) })
            .toBuffer(),
          gravity: 'centre',
        },
      ])
      .png({ compressionLevel: 9 }),
    'pwa-512-maskable.png',
  );

  // Apple rundet selbst ab und ersetzt Transparenz durch Schwarz – ohne
  // deckenden Grund entstünden schwarze Ecken.
  await write(
    sharp({ create: { width: 180, height: 180, channels: 4, background: BACKGROUND } })
      .composite([{ input: await sharp(ICON_SOURCE).resize(180, 180).toBuffer(), gravity: 'centre' }])
      .flatten({ background: BACKGROUND })
      .png({ compressionLevel: 9 }),
    'apple-touch-icon.png',
  );

  for (const size of [32, 48]) {
    await write(sharp(ICON_SOURCE).resize(size, size).png({ compressionLevel: 9 }), `favicon-${size}.png`);
  }
};

main().catch((error) => {
  console.error(`Fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
