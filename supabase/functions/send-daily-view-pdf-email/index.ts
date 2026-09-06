/**
 * Tageseinteilung als PDF erzeugen, in OneDrive ablegen und per E-Mail versenden.
 *
 * Es entstehen zwei Fassungen desselben Tages:
 *   - ohne Abwesenheiten -> OneDrive, für das Hallendisplay
 *   - mit Abwesenheiten  -> in den Storage, Link geht per E-Mail raus
 *
 * Gegenüber der Base44-Fassung geändert: die Daten kommen über den
 * Supabase-Client, der Mailversand über Resend, und die OneDrive-Tokens holt
 * sich die App selbst (siehe _shared/onedrive.ts). Fehlt die
 * OneDrive-Konfiguration, läuft der E-Mail-Versand trotzdem durch – die
 * Antwort sagt dann, dass die Ablage übersprungen wurde.
 */
import {
  corsHeaders,
  jsonResponse,
  requireApprovedCaller,
  serviceRoleClient,
} from '../_shared/context.ts';
import { generatePDF } from '../_shared/daily-view-pdf.js';
import { sendEmail } from '../_shared/email.ts';
import * as oneDrive from '../_shared/onedrive.ts';

const UPLOAD_BUCKET = 'uploads';
const ABSENCE_TYPES = ['urlaub', 'krank', 'beurlaubung'];
const FUTURE_WORKDAYS = 30;

/** Die nächsten Werktage nach dem Stichtag – für das Ende laufender Abwesenheiten. */
const upcomingWorkdays = (fromDate: string) => {
  const dates: string[] = [];
  const base = new Date(fromDate);
  for (let offset = 1; offset <= FUTURE_WORKDAYS; offset += 1) {
    const day = new Date(base);
    day.setDate(day.getDate() + offset);
    if (day.getDay() !== 0 && day.getDay() !== 6) {
      dates.push(day.toISOString().slice(0, 10));
    }
  }
  return dates;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  const { emails, selectedDate } = await req.json().catch(() => ({}));
  if (!Array.isArray(emails) || emails.length === 0) {
    return jsonResponse({ error: 'Keine E-Mail-Adressen angegeben' }, 400);
  }
  if (!selectedDate) {
    return jsonResponse({ error: 'Kein Datum angegeben' }, 400);
  }

  const db = serviceRoleClient();

  try {
    const [assignments, employees, projects, vehicles] = await Promise.all([
      db.from('assignment').select('*').eq('date', selectedDate),
      db.from('employee').select('*'),
      db.from('project').select('*'),
      db.from('vehicle').select('*'),
    ]);

    for (const result of [assignments, employees, projects, vehicles]) {
      if (result.error) throw new Error(result.error.message);
    }

    const assignmentsData = assignments.data ?? [];

    // Nur laden, wenn an dem Tag überhaupt jemand abwesend ist.
    const hasAbsences = assignmentsData.some((a) => ABSENCE_TYPES.includes(a.assignment_type));
    let futureAssignments: unknown[] = [];
    if (hasAbsences) {
      const { data, error } = await db
        .from('assignment')
        .select('*')
        .in('date', upcomingWorkdays(selectedDate));
      if (error) throw new Error(error.message);
      futureAssignments = data ?? [];
    }

    const pdfInput = {
      selectedDateStr: selectedDate,
      assignments: assignmentsData,
      employees: employees.data ?? [],
      projects: projects.data ?? [],
      vehicles: vehicles.data ?? [],
      futureAssignments,
    };

    const pdfForDisplay = generatePDF({ ...pdfInput, includeAbsences: false });
    const pdfForEmail = generatePDF({ ...pdfInput, includeAbsences: true });

    const fileName = `Tageseinteilung_${selectedDate}.pdf`;
    const date = new Date(selectedDate);
    const dateFormatted = date.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    // 1) Fassung ohne Abwesenheiten nach OneDrive.
    let oneDriveUrl: string | null = null;
    let oneDriveNote = 'OneDrive ist nicht konfiguriert – Ablage übersprungen.';
    if (oneDrive.isConfigured()) {
      try {
        const accessToken = await oneDrive.getAccessToken();
        await oneDrive.clearFolder(accessToken);
        oneDriveUrl = await oneDrive.uploadFile(accessToken, fileName, pdfForDisplay);
        oneDriveNote = 'PDF ohne Abwesenheiten in OneDrive gespeichert.';
      } catch (error) {
        // Die E-Mails sollen auch dann rausgehen, wenn OneDrive klemmt.
        console.error('OneDrive-Ablage fehlgeschlagen:', error);
        oneDriveNote = `OneDrive-Ablage fehlgeschlagen: ${(error as Error).message}`;
      }
    }

    // 2) Fassung mit Abwesenheiten in den Storage, Link kommt in die E-Mail.
    const storagePath = `tageseinteilung/${selectedDate}-${crypto.randomUUID()}.pdf`;
    const upload = await db.storage
      .from(UPLOAD_BUCKET)
      .upload(storagePath, new Uint8Array(pdfForEmail), { contentType: 'application/pdf' });
    if (upload.error) throw new Error(`Upload fehlgeschlagen: ${upload.error.message}`);
    const { data: publicUrl } = db.storage.from(UPLOAD_BUCKET).getPublicUrl(storagePath);
    const emailFileUrl = publicUrl?.publicUrl ?? null;

    const emailBody = emailFileUrl
      ? `Tageseinteilung für den ${dateFormatted}\n\n` +
        `PDF herunterladen (mit Abwesenheiten):\n${emailFileUrl}\n\n` +
        'Mit freundlichen Grüßen\nLeniger'
      : `Tageseinteilung für den ${dateFormatted}\n\nMit freundlichen Grüßen\nLeniger`;

    const results = await Promise.allSettled(
      emails.map((address: string) =>
        sendEmail({ to: address, subject: `Tageseinteilung ${dateFormatted}`, body: emailBody }),
      ),
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`E-Mail an ${emails[index]} fehlgeschlagen:`, result.reason);
      }
    });
    const sentCount = results.filter((result) => result.status === 'fulfilled').length;

    return jsonResponse({
      success: true,
      message: `${oneDriveNote} PDF mit Abwesenheiten an ${sentCount} von ${emails.length} Empfängern versendet.`,
      recipients: sentCount,
      failed: emails.length - sentCount,
      oneDriveUrl,
      oneDriveFolder: oneDrive.ONEDRIVE_FOLDER,
      fileName,
      emailFileUrl,
    });
  } catch (error) {
    console.error('send-daily-view-pdf-email:', error);
    return jsonResponse({ error: (error as Error).message ?? 'Fehler beim Versenden' }, 500);
  }
});
