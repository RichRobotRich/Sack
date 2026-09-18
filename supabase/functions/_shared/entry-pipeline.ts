/**
 * Der Weg von einer Meldung zum fertigen Eintrag.
 *
 * Sprachnachricht abtippen -> Text zusammenführen -> strukturieren ->
 * Baustelle zuordnen -> schreiben.
 *
 * Bewusst getrennt von der Edge Function, die sie aufruft: die Weberfassung
 * (Phase 1a) und der WhatsApp-Eingang (Phase 1b) unterscheiden sich nur
 * darin, woher Text und Anhänge kommen. Alles danach ist identisch und soll
 * es auch bleiben - sonst entstehen zwei Sorten Protokoll.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { transcribe } from './ai.ts';
import {
  AUTO_ASSIGN_THRESHOLD,
  extractEntry,
  suggestProject,
  type ExtractedEntry,
} from './entry-extraction.ts';
import {
  findCostCenterMatch,
  scoreProjects,
  type ProjectLike,
} from './project-match.ts';

export const STORAGE_BUCKET = 'assistant';

export type IncomingAttachment = {
  storage_path: string;
  kind: 'foto' | 'sprachnachricht' | 'dokument' | 'video';
  mime_type?: string | null;
  caption?: string | null;
  byte_size?: number | null;
  inbound_message_id?: string | null;
};

export type PipelineInput = {
  text?: string | null;
  attachments?: IncomingAttachment[];
  /** Vom Benutzer gesetzt - überspringt die Zuordnungskaskade. */
  projectId?: string | null;
  /** Aus einer WhatsApp-Sitzung ("#baustelle ..."). */
  sessionProjectId?: string | null;
  /** Erzwungene Eintragsart, sonst entscheidet das Modell. */
  forcedType?: ExtractedEntry['type'] | null;
  source: 'web' | 'whatsapp';
  createdBy?: string | null;
  authorEmployeeId?: string | null;
  authorPhone?: string | null;
  authorName?: string | null;
  entryDate?: string | null;
};

export type PipelineResult = {
  entryId: string;
  todoIds: string[];
  projectId: string | null;
  matchMethod: string;
  confidence: number;
  candidates: { id: string; name: string; reason: string }[];
  transcripts: { storage_path: string; text: string }[];
  needsProjectChoice: boolean;
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Sprachnachrichten abtippen.
 *
 * Die Baustellennamen gehen als Hilfestellung mit: ohne sie macht die
 * Erkennung aus "Vitodens" schnell "Vita Dens" und aus "Musterstadt Haus C"
 * etwas anderes. Schlägt eine Transkription fehl, geht der Rest trotzdem
 * weiter - ein Eintrag mit Foto und ohne Text ist mehr wert als gar keiner.
 */
const transcribeVoice = async (
  admin: SupabaseClient,
  attachments: IncomingAttachment[],
  projects: ProjectLike[],
): Promise<{ storage_path: string; text: string; error?: string }[]> => {
  const voice = attachments.filter((item) => item.kind === 'sprachnachricht');
  if (voice.length === 0) return [];

  const hint = [
    'Anlagenbau, Heizung, Sanitär, Lüftung.',
    'Baustellen: ' + projects.slice(0, 40).map((project) => project.name).join(', '),
  ].join(' ');

  const results = [];
  for (const item of voice) {
    try {
      const download = await admin.storage.from(STORAGE_BUCKET).download(item.storage_path);
      if (download.error) throw download.error;

      const text = await transcribe({
        audio: download.data,
        fileName: item.storage_path.split('/').pop() ?? 'sprachnachricht.ogg',
        hint,
      });
      results.push({ storage_path: item.storage_path, text });
    } catch (error) {
      console.error('Transkription fehlgeschlagen', item.storage_path, error);
      results.push({ storage_path: item.storage_path, text: '', error: (error as Error).message });
    }
  }
  return results;
};

/**
 * Die Zuordnungskaskade aus docs/ARCHITEKTUR.md.
 * Reihenfolge ist Absicht: das Billige und Eindeutige zuerst.
 */
const matchProject = async (
  text: string,
  projects: ProjectLike[],
  input: PipelineInput,
): Promise<Pick<PipelineResult, 'projectId' | 'matchMethod' | 'confidence' | 'candidates'>> => {
  if (input.projectId) {
    return { projectId: input.projectId, matchMethod: 'manuell', confidence: 1, candidates: [] };
  }

  const byNumber = findCostCenterMatch(text, projects);
  if (byNumber) {
    return {
      projectId: byNumber.project.id,
      matchMethod: 'kostentraeger',
      confidence: 1,
      candidates: [],
    };
  }

  if (input.sessionProjectId) {
    return {
      projectId: input.sessionProjectId,
      matchMethod: 'sitzung',
      confidence: 1,
      candidates: [],
    };
  }

  const shortlist = scoreProjects(text, projects, 6);
  const candidates = shortlist.map(({ project, reason }) => ({
    id: project.id,
    name: project.name,
    reason,
  }));

  if (shortlist.length === 0) {
    return { projectId: null, matchMethod: 'keine', confidence: 0, candidates: [] };
  }

  const suggestion = await suggestProject(text, shortlist);
  const confident = suggestion.projectId && suggestion.confidence >= AUTO_ASSIGN_THRESHOLD;

  return {
    projectId: confident ? suggestion.projectId : null,
    matchMethod: confident ? 'ki' : 'keine',
    confidence: suggestion.confidence,
    // Auch bei sicherer Zuordnung bleiben die Alternativen stehen: wer den
    // Eintrag prüft, sieht damit, was sonst noch in Frage kam.
    candidates,
  };
};

export const runEntryPipeline = async (
  admin: SupabaseClient,
  input: PipelineInput,
): Promise<PipelineResult> => {
  const attachments = input.attachments ?? [];

  const { data: projectRows, error: projectError } = await admin
    .from('project')
    .select('id, name, cost_center_number, city, address, status');
  if (projectError) throw new Error(`Baustellen nicht lesbar: ${projectError.message}`);
  const projects = (projectRows ?? []) as ProjectLike[];

  const transcripts = await transcribeVoice(admin, attachments, projects);

  const combined = [
    input.text?.trim() ?? '',
    ...transcripts.map((item) => item.text).filter(Boolean),
    ...attachments.map((item) => item.caption?.trim() ?? '').filter(Boolean),
  ].filter(Boolean).join('\n\n');

  if (!combined) {
    throw new Error('Die Meldung enthält keinen auswertbaren Text.');
  }

  const { entry: extracted, model } = await extractEntry(combined, {
    today: today(),
    authorName: input.authorName,
  });

  const match = await matchProject(combined, projects, input);

  const type = input.forcedType ?? extracted.type;
  const entryDate = input.entryDate ?? extracted.entry_date ?? today();

  const { data: entryRow, error: entryError } = await admin
    .from('entry')
    .insert({
      type,
      status: type === 'todo' ? 'offen' : 'entwurf',
      source: input.source,
      project_id: match.projectId,
      project_match_method: match.matchMethod,
      project_match_confidence: match.confidence,
      project_match_candidates: match.candidates,
      author_employee_id: input.authorEmployeeId ?? null,
      author_phone: input.authorPhone ?? null,
      created_by: input.createdBy ?? null,
      entry_date: entryDate,
      title: extracted.title,
      body_md: extracted.body_md,
      structured: extracted.structured,
      due_date: type === 'todo' ? extracted.todos[0]?.faelligkeit ?? null : null,
      priority: type === 'todo' ? extracted.todos[0]?.prioritaet ?? 'normal' : null,
      ai_model: model,
      ai_notes: extracted.notes,
      needs_review: true,
    })
    .select('id')
    .single();

  if (entryError) throw new Error(`Eintrag nicht gespeichert: ${entryError.message}`);
  const entryId = entryRow.id as string;

  if (attachments.length > 0) {
    const rows = attachments.map((item, index) => ({
      entry_id: entryId,
      inbound_message_id: item.inbound_message_id ?? null,
      kind: item.kind,
      storage_path: item.storage_path,
      mime_type: item.mime_type ?? null,
      byte_size: item.byte_size ?? null,
      caption: item.caption ?? null,
      transcript: transcripts.find((entry) => entry.storage_path === item.storage_path)?.text ?? null,
      sort_order: index,
      created_by: input.createdBy ?? null,
    }));
    const { error } = await admin.from('entry_attachment').insert(rows);
    if (error) throw new Error(`Anhänge nicht gespeichert: ${error.message}`);
  }

  // Aufgaben aus einem Protokoll werden eigene Einträge, damit sie in der
  // ToDo-Liste auftauchen. Bei type = todo ist der Eintrag selbst die
  // Aufgabe - dann wäre eine Kopie doppelt.
  let todoIds: string[] = [];
  if (type !== 'todo' && extracted.todos.length > 0) {
    const { data, error } = await admin
      .from('entry')
      .insert(extracted.todos.map((todo) => ({
        type: 'todo',
        status: 'offen',
        source: input.source,
        parent_entry_id: entryId,
        project_id: match.projectId,
        project_match_method: match.matchMethod,
        project_match_confidence: match.confidence,
        author_employee_id: input.authorEmployeeId ?? null,
        author_phone: input.authorPhone ?? null,
        created_by: input.createdBy ?? null,
        entry_date: entryDate,
        title: todo.titel,
        body_md: todo.beschreibung,
        due_date: todo.faelligkeit,
        priority: todo.prioritaet,
        ai_model: model,
        needs_review: true,
      })))
      .select('id');
    if (error) throw new Error(`Aufgaben nicht gespeichert: ${error.message}`);
    todoIds = (data ?? []).map((row) => row.id as string);
  }

  return {
    entryId,
    todoIds,
    projectId: match.projectId,
    matchMethod: match.matchMethod,
    confidence: match.confidence,
    candidates: match.candidates,
    transcripts: transcripts.map(({ storage_path, text }) => ({ storage_path, text })),
    needsProjectChoice: !match.projectId,
  };
};
