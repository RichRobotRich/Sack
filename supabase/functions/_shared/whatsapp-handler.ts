/**
 * Was mit einer eingegangenen WhatsApp-Nachricht passiert.
 *
 * Getrennt vom Webhook, weil der Webhook Meta binnen Sekunden bestätigen
 * muss. Transkribieren und Strukturieren dauert länger als das - also nimmt
 * der Webhook nur entgegen, und hier passiert die eigentliche Arbeit.
 */

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { parseCommand, resolveProjectQuery, type ProjectLike } from './project-match.ts';
import { runEntryPipeline, STORAGE_BUCKET, type IncomingAttachment } from './entry-pipeline.ts';
import { downloadMedia, sendChoice, sendText } from './whatsapp.ts';

/** Wie lange ein per "#baustelle" gesetzter Kontext gilt. */
const SESSION_HOURS = 12;

const HELP_TEXT = [
  'So funktioniert es:',
  '',
  '• Einfach sprechen oder schreiben – daraus wird ein Protokoll, eine Notiz oder eine Aufgabe.',
  '• Steht die Kostenträger-Nummer im Text, wird die Baustelle daraus erkannt.',
  '• #baustelle Musterstraße – legt die Baustelle für alles Folgende fest',
  '• #ende – hebt die Baustelle wieder auf',
  '• #hilfe – dieser Text',
].join('\n');

const ENTRY_LABEL: Record<string, string> = {
  protokoll: 'Protokoll',
  bericht: 'Bericht',
  notiz: 'Notiz',
  todo: 'Aufgabe',
};

type MessageRow = {
  id: string;
  phone: string;
  kind: string;
  body: string | null;
  media_id: string | null;
  mime_type: string | null;
  raw: Record<string, unknown>;
};

const MEDIA_KIND: Record<string, IncomingAttachment['kind']> = {
  audio: 'sprachnachricht',
  image: 'foto',
  document: 'dokument',
  video: 'video',
};

const extensionFor = (mimeType: string) => {
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('pdf')) return 'pdf';
  return 'bin';
};

const markMessage = (admin: SupabaseClient, id: string, values: Record<string, unknown>) =>
  admin.from('inbound_message').update(values).eq('id', id);

const loadSession = async (admin: SupabaseClient, phone: string) => {
  const { data } = await admin
    .from('whatsapp_session')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (!data) return null;
  // Abgelaufener Kontext zählt nicht mehr, wird aber nicht gelöscht: die
  // offene Rückfrage in derselben Zeile soll erhalten bleiben.
  const expired = data.expires_at && new Date(data.expires_at) < new Date();
  return { ...data, project_id: expired ? null : data.project_id };
};

const saveSession = (admin: SupabaseClient, phone: string, values: Record<string, unknown>) =>
  admin.from('whatsapp_session').upsert({ phone, ...values }, { onConflict: 'phone' });

const loadProjects = async (admin: SupabaseClient): Promise<ProjectLike[]> => {
  const { data } = await admin
    .from('project')
    .select('id, name, cost_center_number, city, address, status');
  return (data ?? []) as ProjectLike[];
};

/**
 * Ordnet einen Eintrag samt der daraus entstandenen Aufgaben einer Baustelle
 * zu. Die Aufgaben hängen über parent_entry_id daran und sollen nicht
 * getrennt vom Protokoll auf einer anderen Baustelle landen.
 */
const assignProject = async (admin: SupabaseClient, entryId: string, projectId: string) => {
  const values = {
    project_id: projectId,
    project_match_method: 'manuell',
    project_match_confidence: 1,
  };
  await admin.from('entry').update(values).eq('id', entryId);
  await admin.from('entry').update(values).eq('parent_entry_id', entryId);
};

/** Lädt die Anhänge einer Nachricht in den eigenen Bucket. */
const fetchAttachment = async (
  admin: SupabaseClient,
  message: MessageRow,
): Promise<IncomingAttachment | null> => {
  if (!message.media_id || !MEDIA_KIND[message.kind]) return null;

  const { blob, mimeType } = await downloadMedia(message.media_id);
  const path = `whatsapp/${crypto.randomUUID()}.${extensionFor(mimeType)}`;

  const upload = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: false });
  if (upload.error) throw new Error(`Ablage fehlgeschlagen: ${upload.error.message}`);

  await markMessage(admin, message.id, { storage_path: path, mime_type: mimeType });

  return {
    storage_path: path,
    kind: MEDIA_KIND[message.kind],
    mime_type: mimeType,
    byte_size: blob.size,
    caption: message.body,
    inbound_message_id: message.id,
  };
};

const summarise = (
  entryType: string,
  title: string | null,
  projectName: string | null,
  todoCount: number,
) => {
  const lines = [`✅ ${ENTRY_LABEL[entryType] ?? 'Eintrag'} angelegt`];
  if (title) lines.push(`„${title}"`);
  if (projectName) lines.push(`Baustelle: ${projectName}`);
  if (todoCount > 0) lines.push(todoCount === 1 ? 'Dazu 1 Aufgabe.' : `Dazu ${todoCount} Aufgaben.`);
  return lines.join('\n');
};

// ---------------------------------------------------------------------------

export const handleInboundMessage = async (
  admin: SupabaseClient,
  message: MessageRow,
): Promise<void> => {
  const phone = message.phone;

  // 1. Zugang. Der Webhook ist öffentlich erreichbar; die Freigabe der
  //    Rufnummer ist die einzige Zugangskontrolle.
  const { data: contact } = await admin
    .from('whatsapp_contact')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (!contact?.is_enabled) {
    await markMessage(admin, message.id, {
      status: 'abgewiesen',
      error: contact ? 'Rufnummer nicht freigegeben' : 'Rufnummer unbekannt',
      contact_id: contact?.id ?? null,
    });

    // Höchstens eine Abweisung je Rufnummer und Tag. Sonst wird der Bot zum
    // Werkzeug, um fremde Nummern mit Nachrichten zu belegen.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin
      .from('inbound_message')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phone)
      .eq('status', 'abgewiesen')
      .gte('received_at', since);

    if ((count ?? 0) <= 1) {
      await sendText(phone, 'Diese Nummer ist nicht freigegeben. Bitte im Büro melden.');
    }
    return;
  }

  await admin
    .from('whatsapp_contact')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', contact.id);
  await markMessage(admin, message.id, { contact_id: contact.id });

  const session = await loadSession(admin, phone);
  const projects = await loadProjects(admin);

  // 2. Antwort auf eine Rückfrage nach der Baustelle.
  const replyId = ((message.raw?.interactive as Record<string, unknown>)?.list_reply as
    Record<string, unknown>)?.id as string | undefined;

  if (message.kind === 'interactive' && replyId?.startsWith('proj:')) {
    const chosen = replyId.slice('proj:'.length);
    const entryId = (session?.pending_payload as Record<string, unknown>)?.entry_id as string | undefined;

    if (!entryId) {
      await sendText(phone, 'Dazu ist keine offene Rückfrage mehr da.');
    } else if (chosen === 'none') {
      await sendText(phone, 'Gut – der Eintrag bleibt ohne Baustelle und wartet im Büro.');
    } else {
      await assignProject(admin, entryId, chosen);
      const name = projects.find((project) => project.id === chosen)?.name ?? 'Baustelle';
      await sendText(phone, `Zugeordnet: ${name}`);
    }

    await saveSession(admin, phone, { pending_kind: null, pending_payload: {} });
    await markMessage(admin, message.id, { status: 'verarbeitet' });
    return;
  }

  // 3. Befehle.
  const command = parseCommand(message.body ?? '');

  if (command.kind === 'hilfe') {
    await sendText(phone, HELP_TEXT);
    await markMessage(admin, message.id, { status: 'verarbeitet' });
    return;
  }

  if (command.kind === 'projekt_loeschen') {
    await saveSession(admin, phone, { project_id: null, project_set_at: null, expires_at: null });
    await sendText(phone, 'Baustelle aufgehoben. Ab jetzt wird wieder automatisch zugeordnet.');
    await markMessage(admin, message.id, { status: 'verarbeitet' });
    return;
  }

  if (command.kind === 'projekt_setzen') {
    const { project, candidates } = resolveProjectQuery(command.argument, projects);

    if (project) {
      await saveSession(admin, phone, {
        project_id: project.id,
        project_set_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString(),
      });
      await sendText(phone, `Baustelle gesetzt: ${project.name}\nGilt ${SESSION_HOURS} Stunden oder bis #ende.`);
    } else if (candidates.length > 0) {
      await sendChoice(
        phone,
        'Welche Baustelle ist gemeint?',
        candidates.map(({ project: option }) => ({
          id: `set:${option.id}`,
          title: option.name,
          description: option.city ?? undefined,
        })),
      );
      await saveSession(admin, phone, { pending_kind: 'projektwahl', pending_payload: { mode: 'set' } });
    } else {
      await sendText(phone, `Keine Baustelle gefunden für „${command.argument}".`);
    }

    await markMessage(admin, message.id, { status: 'verarbeitet' });
    return;
  }

  if (command.kind === 'frage') {
    // Phase 2b. Bis dahin ist eine ehrliche Absage besser als eine Antwort
    // aus dem Modellwissen - genau das soll das System nie tun.
    await sendText(phone, 'Die Wissensdatenbank ist noch nicht freigeschaltet. Deine Frage wurde nicht gespeichert.');
    await markMessage(admin, message.id, { status: 'verarbeitet' });
    return;
  }

  // 4. Auswahl einer Baustelle für den Sitzungskontext (aus Schritt 3).
  if (message.kind === 'interactive' && replyId?.startsWith('set:')) {
    const chosen = replyId.slice('set:'.length);
    await saveSession(admin, phone, {
      project_id: chosen,
      project_set_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString(),
      pending_kind: null,
      pending_payload: {},
    });
    const name = projects.find((project) => project.id === chosen)?.name ?? 'Baustelle';
    await sendText(phone, `Baustelle gesetzt: ${name}`);
    await markMessage(admin, message.id, { status: 'verarbeitet' });
    return;
  }

  // 5. Der Normalfall: daraus wird ein Eintrag.
  const attachment = await fetchAttachment(admin, message);
  const attachments = attachment ? [attachment] : [];

  if (!message.body?.trim() && attachments.length === 0) {
    await sendText(phone, 'Damit kann ich nichts anfangen – bitte als Text, Sprachnachricht oder Foto schicken.');
    await markMessage(admin, message.id, { status: 'verarbeitet' });
    return;
  }

  const result = await runEntryPipeline(admin, {
    // Bei einem Medium ist body die Bildunterschrift; die steckt schon im
    // Anhang und wäre hier ein zweites Mal im Text.
    text: attachment ? null : message.body,
    attachments,
    sessionProjectId: session?.project_id ?? null,
    source: 'whatsapp',
    authorEmployeeId: contact.employee_id,
    authorPhone: phone,
    authorName: contact.display_name,
  });

  await markMessage(admin, message.id, { status: 'verarbeitet', entry_id: result.entryId });

  const { data: entry } = await admin
    .from('entry')
    .select('type, title')
    .eq('id', result.entryId)
    .single();

  const projectName = result.projectId
    ? projects.find((project) => project.id === result.projectId)?.name ?? null
    : null;

  await sendText(
    phone,
    summarise(entry?.type ?? 'notiz', entry?.title ?? null, projectName, result.todoIds.length),
  );

  // 6. Blieb die Baustelle offen, wird jetzt nachgefragt - solange der
  //    Monteur noch am Telefon ist und weiß, wovon die Rede war.
  if (result.needsProjectChoice) {
    if (result.candidates.length > 0) {
      await sendChoice(
        phone,
        'Zu welcher Baustelle gehört das?',
        [
          ...result.candidates.map((candidate) => ({
            id: `proj:${candidate.id}`,
            title: candidate.name,
          })),
          { id: 'proj:none', title: 'Weiß ich nicht' },
        ],
      );
      await saveSession(admin, phone, {
        pending_kind: 'projektwahl',
        pending_payload: { entry_id: result.entryId },
      });
    } else {
      await sendText(
        phone,
        'Die Baustelle konnte ich nicht erkennen. Der Eintrag wartet im Büro.\n' +
        'Tipp: mit #baustelle Name festlegen oder die Kostenträger-Nummer mitschreiben.',
      );
    }
  }
};
