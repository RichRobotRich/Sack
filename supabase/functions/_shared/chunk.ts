/**
 * Dokumente in durchsuchbare Abschnitte zerlegen.
 *
 * Die Größe ist ein Kompromiss: zu kleine Abschnitte verlieren den
 * Zusammenhang ("Mindestens 3 bar" - wovon?), zu große verwässern die
 * Ähnlichkeitssuche, weil ein Vektor dann über zu viele Themen mittelt.
 * Rund 2500 Zeichen entsprechen etwa einer halben Seite Fachtext.
 *
 * Überlappung, damit eine Aussage nicht genau an der Grenze zerrissen wird.
 *
 * Reine Logik, ohne Netz und ohne Deno - prüfbar über
 * scripts/test-chunk.ts.
 */

export type SourcePage = {
  page: number;
  text: string;
};

export type Chunk = {
  index: number;
  heading: string | null;
  content: string;
  pageFrom: number;
  pageTo: number;
};

const TARGET = 2500;
const OVERLAP = 250;
const MIN_USEFUL = 40;

/**
 * Erkennt Überschriften.
 *
 * Nicht perfekt und muss es nicht sein: die Überschrift wird dem Abschnitt
 * vorangestellt, damit "Mindestens 3 bar" unter "4.2 Druckprüfung" steht.
 * Eine falsch erkannte Überschrift schadet wenig, eine fehlende kostet
 * Trefferqualität.
 */
export const looksLikeHeading = (line: string): boolean => {
  const text = line.trim();
  if (text.length === 0 || text.length > 80) return false;
  if (/[.;:,]$/.test(text)) return false;
  // Ohne Buchstaben ist es keine Überschrift, sondern eine Seitenzahl oder
  // ein Messwert, der allein in einer Zeile steht.
  if (!/[a-zA-ZäöüÄÖÜß]/.test(text)) return false;

  // Nummerierte Gliederung: "4.2 Druckprüfung"
  if (/^\d+(\.\d+)*\.?\s+\S/.test(text)) return true;

  // Durchgehend groß geschrieben, mit mindestens einem Buchstaben
  if (text === text.toUpperCase() && /[A-ZÄÖÜ]/.test(text)) return true;

  // Markdown
  if (/^#{1,6}\s/.test(text)) return true;

  return false;
};

const cleanHeading = (line: string) => line.trim().replace(/^#{1,6}\s*/, '');

/**
 * Zerlegt die Seiten eines Dokuments.
 *
 * Absätze werden nie mitten im Satz getrennt: gefüllt wird bis zur Zielgröße,
 * dann beginnt ein neuer Abschnitt. Ein einzelner Absatz, der allein schon zu
 * lang ist (etwa eine Tabelle als CSV), wird hart geschnitten - sonst entstünde
 * ein Abschnitt, der nicht mehr in den Kontext passt.
 */
export const chunkPages = (pages: SourcePage[]): Chunk[] => {
  const chunks: Chunk[] = [];

  let buffer = '';
  let heading: string | null = null;
  let bufferHeading: string | null = null;
  let pageFrom = pages[0]?.page ?? 1;
  let pageTo = pageFrom;

  const flush = () => {
    const content = buffer.trim();
    if (content.length >= MIN_USEFUL) {
      chunks.push({
        index: chunks.length,
        heading: bufferHeading,
        content,
        pageFrom,
        pageTo,
      });
    }
    buffer = '';
  };

  for (const page of pages) {
    for (const block of page.text.split(/\n\s*\n/)) {
      const absatz = block.trim();
      if (!absatz) continue;

      // Steht eine Überschrift allein im Absatz, gilt sie für das Folgende.
      const zeilen = absatz.split('\n');
      if (zeilen.length === 1 && looksLikeHeading(absatz)) {
        heading = cleanHeading(absatz);
        continue;
      }
      if (looksLikeHeading(zeilen[0])) heading = cleanHeading(zeilen[0]);

      if (buffer.length === 0) {
        bufferHeading = heading;
        pageFrom = page.page;
      }

      // Ein Absatz, der für sich genommen zu lang ist, wird geschnitten.
      let rest = absatz;
      while (rest.length > TARGET) {
        if (buffer.length > 0) {
          pageTo = page.page;
          flush();
          bufferHeading = heading;
          pageFrom = page.page;
        }
        buffer = rest.slice(0, TARGET);
        pageTo = page.page;
        flush();
        bufferHeading = heading;
        pageFrom = page.page;
        rest = rest.slice(TARGET - OVERLAP);
      }

      if (buffer.length + rest.length + 2 > TARGET && buffer.length > 0) {
        pageTo = page.page;
        const vorher = buffer;
        flush();
        // Überlappung: das Ende des vorigen Abschnitts beginnt den nächsten.
        buffer = vorher.slice(-OVERLAP).trimStart();
        bufferHeading = heading;
        pageFrom = page.page;
      }

      buffer += (buffer ? '\n\n' : '') + rest;
      pageTo = page.page;
    }
  }

  flush();
  return chunks.map((chunk, index) => ({ ...chunk, index }));
};

/**
 * Was dem Modell als Kontext vorgelegt wird.
 *
 * Die Kennung steht bei jedem Abschnitt, weil das Modell damit belegen muss.
 * Ohne sie könnte es nicht zitieren, und die Prüfung danach hätte nichts, was
 * sie prüfen könnte.
 */
export const buildContext = (
  passages: { chunk_id: string; document_title: string; heading: string | null; content: string; page_from: number | null }[],
): { context: string; ids: string[] } => {
  const ids: string[] = [];
  const blocks = passages.map((passage, index) => {
    const kennung = `Q${index + 1}`;
    ids.push(passage.chunk_id);
    const quelle = [
      passage.document_title,
      passage.heading,
      passage.page_from ? `Seite ${passage.page_from}` : null,
    ].filter(Boolean).join(', ');

    return `[${kennung}] (${quelle})\n${passage.content}`;
  });

  return { context: blocks.join('\n\n---\n\n'), ids };
};
