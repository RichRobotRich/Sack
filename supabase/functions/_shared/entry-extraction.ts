/**
 * Aus einer Nachricht einen Eintrag machen.
 *
 * Zwei Aufgaben, beide mit dem Textmodell:
 *   extractEntry()   - Freitext von der Baustelle in Protokoll, Bericht,
 *                      Notiz oder ToDo überführen
 *   suggestProject() - Stufe 3 der Projektzuordnung, wenn weder
 *                      Kostenträger-Nummer noch Sitzung gegriffen haben
 *
 * Beide erzwingen ein JSON-Schema. Ohne das kommt in jedem zwanzigsten Fall
 * eine abweichende Form zurück, und die fällt erst beim Schreiben auf.
 */

import { chat } from './ai.ts';
import type { ProjectLike, ScoredProject } from './project-match.ts';

// ---------------------------------------------------------------------------
// Eintrag aus Freitext
// ---------------------------------------------------------------------------

export type ExtractedTodo = {
  titel: string;
  beschreibung: string | null;
  faelligkeit: string | null;
  prioritaet: 'niedrig' | 'normal' | 'hoch' | 'dringend';
};

export type ExtractedEntry = {
  type: 'protokoll' | 'bericht' | 'notiz' | 'todo';
  title: string;
  body_md: string;
  entry_date: string | null;
  project_hint: string | null;
  notes: string | null;
  structured: {
    beteiligte: string[];
    arbeiten: string[];
    feststellungen: string[];
    material: string[];
    wetter: string | null;
    maengel: {
      beschreibung: string;
      gewerk: string | null;
      frist: string | null;
      verantwortlich: string | null;
    }[];
  };
  todos: ExtractedTodo[];
};

// Ein einziges Schema für alle vier Arten statt vier Varianten: das Modell
// entscheidet über das Feld type und lässt unpassende Listen leer. Bei
// strict = true müssen alle Felder aufgeführt und erlaubt sein, Weglassen
// geht nicht - deshalb überall ein null oder eine leere Liste.
const ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'title', 'body_md', 'entry_date', 'project_hint', 'notes', 'structured', 'todos'],
  properties: {
    type: {
      type: 'string',
      enum: ['protokoll', 'bericht', 'notiz', 'todo'],
      description: 'protokoll = Tagesbericht über geleistete Arbeit; bericht = Mängel- oder Abnahmebericht; todo = reine Aufgabe ohne Bericht; notiz = alles Übrige',
    },
    title: { type: 'string', description: 'Kurze Überschrift, höchstens 80 Zeichen' },
    body_md: { type: 'string', description: 'Lesbare Fassung in Markdown, ohne Überschrift' },
    entry_date: { type: ['string', 'null'], description: 'Bezugstag als yyyy-MM-dd, wenn genannt' },
    project_hint: { type: ['string', 'null'], description: 'Wörtlich die Stelle, die auf eine Baustelle hindeutet' },
    notes: { type: ['string', 'null'], description: 'Unverständliche oder widersprüchliche Stellen' },
    structured: {
      type: 'object',
      additionalProperties: false,
      required: ['beteiligte', 'arbeiten', 'feststellungen', 'material', 'wetter', 'maengel'],
      properties: {
        beteiligte: { type: 'array', items: { type: 'string' } },
        arbeiten: { type: 'array', items: { type: 'string' } },
        feststellungen: { type: 'array', items: { type: 'string' } },
        material: { type: 'array', items: { type: 'string' } },
        wetter: { type: ['string', 'null'] },
        maengel: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['beschreibung', 'gewerk', 'frist', 'verantwortlich'],
            properties: {
              beschreibung: { type: 'string' },
              gewerk: { type: ['string', 'null'] },
              frist: { type: ['string', 'null'] },
              verantwortlich: { type: ['string', 'null'] },
            },
          },
        },
      },
    },
    todos: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titel', 'beschreibung', 'faelligkeit', 'prioritaet'],
        properties: {
          titel: { type: 'string' },
          beschreibung: { type: ['string', 'null'] },
          faelligkeit: { type: ['string', 'null'] },
          prioritaet: { type: 'string', enum: ['niedrig', 'normal', 'hoch', 'dringend'] },
        },
      },
    },
  },
} as const;

const ENTRY_SYSTEM_PROMPT = `
Du erfasst Meldungen von Baustellen im Anlagenbau (Heizung, Sanitär, Lüftung)
und bringst sie in eine feste Form. Der Text stammt aus einer Sprachnachricht
oder einer schnell getippten Nachricht.

Regeln:
- Gib ausschließlich wieder, was dasteht. Ergänze nichts, was plausibel wäre.
- Die gesprochene Sprache bleibt erhalten: aus "Rohr is durch" wird "Rohr ist
  durchgerostet" nur dann, wenn das dasteht. Sonst bleibt es beim Wortlaut.
- Fachbegriffe, Typenbezeichnungen und Maße stehen unverändert da: DN 32,
  Vitodens 200-W, 1 1/4 Zoll, Rp 1/2.
- Erkennst du eine Passage nicht sicher, schreib sie in notes statt zu raten.
- Aufgaben ("muss noch", "bitte bestellen", "fehlt noch") gehören in todos,
  auch wenn der Rest ein Protokoll ist.
- Ist die Meldung nichts weiter als eine Aufgabe, ist type = todo und todos
  bleibt leer - der Eintrag selbst ist die Aufgabe.
- Datumsangaben wie "gestern" oder "Montag" rechne anhand des genannten
  heutigen Datums um.
- Schreib durchgehend Deutsch.
`.trim();

export const extractEntry = async (
  text: string,
  context: { today: string; authorName?: string | null },
): Promise<{ entry: ExtractedEntry; model: string }> => {
  const result = await chat({
    messages: [
      { role: 'system', content: ENTRY_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `Heutiges Datum: ${context.today}`,
          context.authorName ? `Absender: ${context.authorName}` : null,
          '',
          'Meldung:',
          text,
        ].filter(Boolean).join('\n'),
      },
    ],
    schema: { name: 'eintrag', schema: ENTRY_SCHEMA as unknown as Record<string, unknown> },
    maxTokens: 3000,
  });

  return { entry: result.data as ExtractedEntry, model: result.model };
};

// ---------------------------------------------------------------------------
// Projektvorschlag (Stufe 3 der Kaskade)
// ---------------------------------------------------------------------------

const PROJECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['project_id', 'confidence', 'reason'],
  properties: {
    project_id: { type: ['string', 'null'], description: 'ID aus der Liste, oder null' },
    confidence: { type: 'number', description: '0 bis 1' },
    reason: { type: 'string', description: 'Ein Satz, woran es festgemacht wurde' },
  },
} as const;

export type ProjectSuggestion = {
  projectId: string | null;
  confidence: number;
  reason: string;
};

/**
 * Wählt aus einer Vorauswahl die passende Baustelle.
 *
 * Bewusst nur die Vorauswahl aus scoreProjects() und nicht alle Baustellen:
 * bei 200 Stück wäre der Prompt teuer, und die Trefferquote sinkt, je mehr
 * Ähnliches darin steht.
 */
export const suggestProject = async (
  text: string,
  candidates: ScoredProject[],
): Promise<ProjectSuggestion> => {
  if (candidates.length === 0) {
    return { projectId: null, confidence: 0, reason: 'Keine Baustelle kam in Frage.' };
  }

  const list = candidates
    .map(({ project }: { project: ProjectLike }) =>
      `- id: ${project.id} | Name: ${project.name} | Ort: ${project.city ?? '-'} | Adresse: ${project.address ?? '-'} | Kostenträger: ${project.cost_center_number ?? '-'}`)
    .join('\n');

  const result = await chat({
    messages: [
      {
        role: 'system',
        content: [
          'Du ordnest eine Baustellenmeldung einer von mehreren Baustellen zu.',
          'Wähle nur eine ID aus der Liste. Passt keine, gib null zurück.',
          'Im Zweifel null: eine Rückfrage kostet weniger als ein Protokoll auf der falschen Baustelle.',
          'confidence ist deine Sicherheit von 0 bis 1.',
        ].join(' '),
      },
      { role: 'user', content: `Baustellen:\n${list}\n\nMeldung:\n${text}` },
    ],
    schema: { name: 'projektzuordnung', schema: PROJECT_SCHEMA as unknown as Record<string, unknown> },
    maxTokens: 300,
  });

  const data = result.data as { project_id: string | null; confidence: number; reason: string };
  const known = candidates.some((entry) => entry.project.id === data.project_id);

  // Erfundene IDs kommen vor. Nicht in der Liste heißt: nicht zugeordnet.
  return {
    projectId: known ? data.project_id : null,
    confidence: known ? data.confidence : 0,
    reason: known ? data.reason : 'Das Modell nannte keine Baustelle aus der Liste.',
  };
};

/** Ab hier wird direkt zugeordnet, darunter fragt der Bot nach. */
export const AUTO_ASSIGN_THRESHOLD = 0.75;
