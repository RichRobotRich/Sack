/**
 * Wochenbericht als PDF ausliefern.
 *
 * Zugriff hat nur, wem der Bericht gehört – oder ein Admin. Diese Prüfung ist
 * der Grund, warum das nicht im Browser passiert.
 */
import { jsPDF } from 'npm:jspdf@4.0.0';
import {
  corsHeaders,
  isAdmin,
  jsonResponse,
  requireApprovedCaller,
  serviceRoleClient,
} from '../_shared/context.ts';

const WEEK_DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

const formatDate = (value: string) => new Date(value).toLocaleDateString('de-DE');

const buildPdf = (report: Record<string, any>) => {
  const doc = new jsPDF();

  doc.setFontSize(20);
  doc.text('Wochenbericht', 20, 20);

  doc.setFontSize(12);
  doc.text(`Mitarbeiter: ${report.user_name}`, 20, 35);
  doc.text(`KW: ${formatDate(report.week_start)}`, 20, 42);
  doc.text(`Gesamtstunden: ${report.total_hours?.toFixed(2) ?? 0}h`, 20, 49);

  let y = 63;
  report.days?.forEach((day: Record<string, any>, index: number) => {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${WEEK_DAYS[index]} - ${formatDate(day.date)}`, 20, y);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    y += 7;

    const projectText = day.project_name || 'Nicht angegeben';
    doc.text(
      day.cost_center_number
        ? `Baustelle: ${projectText} | Kostenträger: ${day.cost_center_number}`
        : `Baustelle: ${projectText}`,
      25,
      y,
    );
    y += 5;
    doc.text(
      `Arbeitszeit: ${day.start_time} - ${day.end_time} (Pause: ${day.break_minutes}min)`,
      25,
      y,
    );
    y += 5;
    doc.text(`Stunden: ${day.work_hours?.toFixed(2) ?? 0}h`, 25, y);
    y += 5;

    if (day.description) {
      doc.text('Tätigkeit:', 25, y);
      y += 5;
      const lines = doc.splitTextToSize(day.description, 160);
      doc.text(lines, 25, y);
      y += lines.length * 5;
    }
    y += 10;
  });

  if (report.review_note) {
    if (y > 240) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Bemerkung:', 20, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(report.review_note, 170), 20, y);
  }

  return doc.output('arraybuffer');
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const check = await requireApprovedCaller(req);
  if ('response' in check) return check.response;

  const { reportId } = await req.json().catch(() => ({}));
  if (!reportId) return jsonResponse({ error: 'reportId fehlt' }, 400);

  const { data: report, error } = await serviceRoleClient()
    .from('weekly_report')
    .select('*')
    .eq('id', reportId)
    .maybeSingle();

  if (error) return jsonResponse({ error: error.message }, 500);
  if (!report) return jsonResponse({ error: 'Bericht nicht gefunden' }, 404);

  const isOwner = report.user_email === check.caller.email;
  if (!isOwner && !(await isAdmin(check.caller))) {
    return jsonResponse({ error: 'Nur eigene Berichte abrufbar' }, 403);
  }

  const fileName = `Wochenbericht_${report.user_name}_KW_${formatDate(report.week_start).replace(/\./g, '-')}.pdf`;

  return new Response(buildPdf(report), {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${fileName}`,
    },
  });
});
