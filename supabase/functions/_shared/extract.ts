/**
 * Text aus Dokumenten holen.
 *
 * Bewusst je Format eine kleine, vorhersehbare Umsetzung statt einer großen
 * Bibliothek: In der Edge-Laufzeit ist jede Abhängigkeit ein Risiko, und wenn
 * ein Format scheitert, soll das Dokument als fehlerhaft markiert werden -
 * nicht der ganze Lauf abbrechen.
 *
 * Word ist eine ZIP-Datei mit XML darin. Die Absatzenden werden gerettet,
 * bevor die Tags fallen; was zwischen den Tags steht, ist der Text. Das spart
 * eine schwergewichtige Abhängigkeit und verhält sich in Deno berechenbar.
 */

export type ExtractedPage = {
  page: number;
  text: string;
};

export type ExtractedDocument = {
  pages: ExtractedPage[];
  pageCount: number;
};

const decoder = new TextDecoder();

/** Mehrfache Leerzeichen und Zeilenumbrüche zusammenfassen. */
const tidy = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const unescapeXml = (text: string) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

// ---------------------------------------------------------------------------

const extractPdf = async (bytes: Uint8Array): Promise<ExtractedDocument> => {
  const { extractText, getDocumentProxy } = await import('npm:unpdf@0.12.1');
  const document = await getDocumentProxy(bytes);

  // mergePages: false liefert je Seite einen Eintrag - nötig, damit die
  // Antwort später die Seitenzahl nennen kann.
  const { text } = await extractText(document, { mergePages: false });
  const seiten = text as string[];

  return {
    pages: seiten
      .map((content, index) => ({ page: index + 1, text: tidy(content) }))
      .filter((page) => page.text.length > 0),
    pageCount: seiten.length,
  };
};

const extractDocx = async (bytes: Uint8Array): Promise<ExtractedDocument> => {
  const { unzipSync } = await import('npm:fflate@0.8.2');
  const files = unzipSync(bytes);
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('Keine word/document.xml - ist das wirklich eine .docx?');

  const text = decoder.decode(xml)
    .replace(/<w:p[ >]/g, 'NEUERABSATZ<w:p ')
    .replace(/<w:br[^>]*>/g, 'NEUERABSATZ')
    .replace(/<w:tab[^>]*>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/NEUERABSATZ/g, '\n');

  return { pages: [{ page: 1, text: tidy(unescapeXml(text)) }], pageCount: 1 };
};

const extractSpreadsheet = async (bytes: Uint8Array): Promise<ExtractedDocument> => {
  const XLSX = await import('npm:xlsx@0.18.5');
  const workbook = XLSX.read(bytes, { type: 'array' });

  // Je Tabellenblatt ein Abschnitt, mit dem Blattnamen davor: eine Preisliste
  // ohne ihren Zusammenhang ist später nicht mehr einzuordnen.
  const pages: ExtractedPage[] = [];
  workbook.SheetNames.forEach((name, index) => {
    const csv = tidy(XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false }));
    if (csv.length > 0) pages.push({ page: index + 1, text: `${name}\n\n${csv}` });
  });

  return { pages, pageCount: workbook.SheetNames.length };
};

const extractPlain = (bytes: Uint8Array): ExtractedDocument => ({
  pages: [{ page: 1, text: tidy(decoder.decode(bytes)) }],
  pageCount: 1,
});

// ---------------------------------------------------------------------------

type Handler = (bytes: Uint8Array) => Promise<ExtractedDocument> | ExtractedDocument;

const BY_EXTENSION: Record<string, Handler> = {
  pdf: extractPdf,
  docx: extractDocx,
  xlsx: extractSpreadsheet,
  xlsm: extractSpreadsheet,
  csv: extractSpreadsheet,
  txt: extractPlain,
  md: extractPlain,
  markdown: extractPlain,
};

export const supportedExtensions = () => Object.keys(BY_EXTENSION);

/**
 * Holt den Text aus einer Datei.
 *
 * Gescannte PDFs kommen hier mit fast leerem Ergebnis heraus - da steht ein
 * Bild, kein Text. Das wird ausdrücklich gemeldet, statt ein leeres Dokument
 * als erfolgreich indiziert zu führen und später nichts zu finden.
 */
export const extractDocument = async (
  bytes: Uint8Array,
  fileName: string,
): Promise<ExtractedDocument> => {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const handler = BY_EXTENSION[extension];

  if (!handler) {
    throw new Error(
      `Format .${extension} wird nicht gelesen. Möglich: ${supportedExtensions().join(', ')}`,
    );
  }

  const result = await handler(bytes);
  const gesamt = result.pages.reduce((sum, page) => sum + page.text.length, 0);

  if (gesamt < 50) {
    throw new Error(
      extension === 'pdf'
        ? 'Kein Text gefunden. Vermutlich ein Scan - dafür wäre Texterkennung nötig.'
        : 'Kein auswertbarer Text im Dokument.',
    );
  }

  return result;
};
