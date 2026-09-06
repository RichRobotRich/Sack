import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { reportId } = await req.json();

        if (!reportId) {
            return Response.json({ error: 'Report ID required' }, { status: 400 });
        }

        const report = await base44.asServiceRole.entities.WeeklyReport.get(reportId);

        if (!report) {
            return Response.json({ error: 'Report not found' }, { status: 404 });
        }

        // Security: Only allow access if user is admin or report owner
        const isAdmin = user.role === 'admin';
        const isOwner = report.user_email === user.email;

        if (!isAdmin && !isOwner) {
            return Response.json({ error: 'Forbidden: You can only download your own reports' }, { status: 403 });
        }

        const doc = new jsPDF();
        const weekDays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

        // Title
        doc.setFontSize(20);
        doc.text('Wochenbericht', 20, 20);

        // User info
        doc.setFontSize(12);
        doc.text(`Mitarbeiter: ${report.user_name}`, 20, 35);
        doc.text(`KW: ${new Date(report.week_start).toLocaleDateString('de-DE')}`, 20, 42);
        doc.text(`Gesamtstunden: ${report.total_hours?.toFixed(2) || 0}h`, 20, 49);

        // Days
        let y = 63;
        report.days?.forEach((day, idx) => {
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text(`${weekDays[idx]} - ${new Date(day.date).toLocaleDateString('de-DE')}`, 20, y);
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            y += 7;
            
            const projectText = day.project_name || 'Nicht angegeben';
            const baustelleText = day.cost_center_number 
                ? `Baustelle: ${projectText} | Kostenträger: ${day.cost_center_number}`
                : `Baustelle: ${projectText}`;
            doc.text(baustelleText, 25, y);
            y += 5;
            doc.text(`Arbeitszeit: ${day.start_time} - ${day.end_time} (Pause: ${day.break_minutes}min)`, 25, y);
            y += 5;
            doc.text(`Stunden: ${day.work_hours?.toFixed(2) || 0}h`, 25, y);
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

        // Review note if exists
        if (report.review_note) {
            if (y > 240) {
                doc.addPage();
                y = 20;
            }
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text('Bemerkung:', 20, y);
            y += 7;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            const noteLines = doc.splitTextToSize(report.review_note, 170);
            doc.text(noteLines, 20, y);
        }

        const pdfBytes = doc.output('arraybuffer');

        return new Response(pdfBytes, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename=Wochenbericht_${report.user_name}_KW_${new Date(report.week_start).toLocaleDateString('de-DE').replace(/\./g, '-')}.pdf`
            }
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});