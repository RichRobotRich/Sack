/**
 * Zuordnung einer eingegangenen Nachricht zu einer Baustelle.
 *
 * Kaskade, erster Treffer gewinnt (docs/ARCHITEKTUR.md):
 *   1. Kostenträger-Nummer im Text   -> eindeutig, kein Modell nötig
 *   2. aktive Sitzung ("#baustelle") -> vom Absender gesetzt
 *   3. Vorschlag des Modells         -> bei Unsicherheit Rückfrage
 *   4. ohne Zuordnung                -> Eingang "Ohne Projekt"
 *
 * Diese Datei enthält bewusst nur die Stufen ohne Modell. Sie ist frei von
 * Deno- und Netzzugriffen und dadurch für sich prüfbar
 * (scripts/test-project-match.ts). Stufe 3 sitzt in der Edge Function, die
 * das Modell ohnehin schon geladen hat.
 */

export type ProjectLike = {
  id: string;
  name: string;
  cost_center_number?: string | null;
  city?: string | null;
  address?: string | null;
  status?: string | null;
};

export type Command =
  | { kind: 'projekt_setzen'; argument: string }
  | { kind: 'projekt_loeschen' }
  | { kind: 'frage'; argument: string }
  | { kind: 'hilfe' }
  | { kind: 'keiner' };

/**
 * Befehle am Anfang der Nachricht. Bewusst großzügig: auf dem Telefon mit
 * Handschuhen tippt niemand exakt, und die Autokorrektur macht aus "#bv" gern
 * "#BV". Alles nach dem Befehl gilt als Argument.
 */
export const parseCommand = (raw: string): Command => {
  const text = (raw ?? '').trim();
  const match = text.match(/^#\s*([a-zäöüß]+)\s*(.*)$/is);
  if (!match) return { kind: 'keiner' };

  const word = match[1].toLowerCase();
  const argument = match[2].trim();

  if (['baustelle', 'projekt', 'bv', 'bauvorhaben'].includes(word)) {
    // "#baustelle" ohne Argument heißt: Kontext aufheben.
    return argument
      ? { kind: 'projekt_setzen', argument }
      : { kind: 'projekt_loeschen' };
  }
  if (['ende', 'reset', 'stop', 'kein', 'keine'].includes(word)) {
    return { kind: 'projekt_loeschen' };
  }
  if (['frage', 'f', 'wissen', 'suche'].includes(word)) {
    return { kind: 'frage', argument };
  }
  if (['hilfe', 'help', 'h'].includes(word)) {
    return { kind: 'hilfe' };
  }

  return { kind: 'keiner' };
};

/** Kleinschreibung, Umlaute aufgelöst, alles Übrige zu einfachen Leerzeichen. */
export const normalizeForMatch = (value: string): string =>
  (value ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/str\.|strasse|straße/g, 'str')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Sucht eine Kostenträger-Nummer im Nachrichtentext.
 *
 * Geschrieben wird sie unterschiedlich: "2024-117", "2024 117", "KT2024/117".
 * Deshalb wird die hinterlegte Nummer in ihre Bestandteile zerlegt und mit
 * beliebigen Trennzeichen dazwischen gesucht.
 *
 * Nummern unter drei Zeichen werden übergangen - eine einstellige Nummer
 * träfe in jedem Text auf ein Datum oder eine Mengenangabe.
 */
export const findCostCenterMatch = (
  text: string,
  projects: ProjectLike[],
): { project: ProjectLike; matched: string } | null => {
  const haystack = text ?? '';
  const hits: { project: ProjectLike; matched: string }[] = [];

  for (const project of projects) {
    const number = (project.cost_center_number ?? '').trim();
    const parts = number.match(/[a-zA-Z0-9]+/g);
    if (!parts || number.replace(/[^a-zA-Z0-9]/g, '').length < 3) continue;

    const pattern = parts
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s./-]{0,3}');

    // Grenzen ohne \b: "2024-117" endet auf einer Ziffer, \b würde in
    // "2024-1170" trotzdem treffen. Der negative Ausblick schließt das aus.
    const regex = new RegExp(`(?<![a-zA-Z0-9])${pattern}(?![a-zA-Z0-9])`, 'i');
    const found = haystack.match(regex);
    if (found) hits.push({ project, matched: found[0] });
  }

  if (hits.length === 0) return null;

  // Mehrere Treffer: die längste Nummer ist die genauere Angabe. Steht "117"
  // und "2024-117" im Text, ist Letzteres gemeint.
  hits.sort((a, b) => b.matched.length - a.matched.length);
  return hits[0];
};

export type ScoredProject = {
  project: ProjectLike;
  score: number;
  reason: string;
};

/**
 * Bewertet Baustellen nach Übereinstimmung mit dem Text. Dient zwei Zwecken:
 * der Auflösung von "#baustelle Musterstraße" und der Vorauswahl für das
 * Modell - bei 200 Baustellen alle in den Prompt zu schreiben wäre teuer und
 * würde die Trefferqualität senken.
 */
export const scoreProjects = (
  text: string,
  projects: ProjectLike[],
  limit = 8,
): ScoredProject[] => {
  const needle = normalizeForMatch(text);
  if (!needle) return [];

  const needleWords = new Set(needle.split(' ').filter((word) => word.length > 2));
  const scored: ScoredProject[] = [];

  for (const project of projects) {
    const name = normalizeForMatch(project.name ?? '');
    const city = normalizeForMatch(project.city ?? '');
    const address = normalizeForMatch(project.address ?? '');

    let score = 0;
    const reasons: string[] = [];

    // Der vollständige Name im Text ist das stärkste Signal.
    if (name && needle.includes(name)) {
      score += 10;
      reasons.push('Name vollständig genannt');
    } else if (name) {
      const nameWords = name.split(' ').filter((word) => word.length > 2);
      const shared = nameWords.filter((word) => needleWords.has(word));
      if (shared.length > 0) {
        score += (shared.length / nameWords.length) * 6;
        reasons.push(`Namensteile: ${shared.join(', ')}`);
      }
    }

    if (city && needleWords.has(city)) {
      score += 3;
      reasons.push(`Ort: ${project.city}`);
    }

    if (address) {
      const addressWords = address.split(' ').filter((word) => word.length > 3);
      const shared = addressWords.filter((word) => needleWords.has(word));
      if (shared.length > 0) {
        score += 2;
        reasons.push(`Adresse: ${shared.join(', ')}`);
      }
    }

    // Abgeschlossene Baustellen sind selten gemeint, aber nicht ausgeschlossen
    // - ein Mangel kann auch nach der Abnahme auftauchen.
    if (score > 0 && project.status && project.status !== 'aktiv') {
      score *= 0.5;
      reasons.push(`Status: ${project.status}`);
    }

    if (score > 0) scored.push({ project, score, reason: reasons.join('; ') });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
};

/**
 * Löst das Argument von "#baustelle ..." auf.
 *
 * Eindeutig ist es nur, wenn der beste Treffer deutlich vor dem zweiten liegt.
 * Andernfalls kommt die Liste zurück und der Bot fragt nach - lieber eine
 * Rückfrage als ein Protokoll auf der falschen Baustelle.
 */
export const resolveProjectQuery = (
  query: string,
  projects: ProjectLike[],
): { project: ProjectLike | null; candidates: ScoredProject[] } => {
  const byNumber = findCostCenterMatch(query, projects);
  if (byNumber) return { project: byNumber.project, candidates: [] };

  const candidates = scoreProjects(query, projects, 5);
  if (candidates.length === 0) return { project: null, candidates: [] };

  const best = candidates[0];
  const runnerUp = candidates[1];
  const clear = best.score >= 4 && (!runnerUp || best.score >= runnerUp.score * 1.5);

  return { project: clear ? best.project : null, candidates };
};
