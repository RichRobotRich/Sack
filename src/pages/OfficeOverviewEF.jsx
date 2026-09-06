import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { format, addDays, startOfWeek, addWeeks, getWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { isPublicHoliday } from '../utils/publicHolidays';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Building2,
  Briefcase,
  Plane,
  Thermometer,
  X,
  FileText,
} from 'lucide-react';
import jsPDF from 'jspdf';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

const ASSIGNMENT_COLORS = {
  baustelle: { bg: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Baustelle' },
  buero: { bg: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Büro' },
  urlaub: { bg: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Urlaub' },
  krank: { bg: 'bg-red-100 text-red-800 border-red-200', label: 'Krank' },
};

export default function OfficeOverviewEF() {
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [dialog, setDialog] = useState(null); // { employee, day, dateStr }
  const [dialogComment, setDialogComment] = useState('');

  const weekDays = [0, 1, 2, 3, 4].map(i => addDays(weekStart, i));

  const generatePDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297;
    const pageH = 210;
    const margin = 10;
    const usableW = pageW - margin * 2;

    // Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 95);
    doc.text('Büroübersicht EF', margin, margin + 6);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    const subtitle = `KW ${getWeek(weekStart)} • ${format(weekStart, 'd. MMM', { locale: de })} – ${format(addDays(weekStart, 4), 'd. MMM yyyy', { locale: de })}`;
    doc.text(subtitle, margin, margin + 12);

    const tableTop = margin + 18;
    const nameColW = 55;
    const dayColW = (usableW - nameColW) / 5;
    const rowH = 12;
    const headerH = 12;

    // Header row
    doc.setFillColor(240, 244, 248);
    doc.rect(margin, tableTop, usableW, headerH, 'F');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 80);
    doc.text('Mitarbeiter', margin + 3, tableTop + 8);

    weekDays.forEach((day, i) => {
      const x = margin + nameColW + i * dayColW;
      const isHoliday = isPublicHoliday(day, 'TH');
      if (isHoliday) doc.setFillColor(248, 248, 248);
      else doc.setFillColor(240, 244, 248);
      doc.rect(x, tableTop, dayColW, headerH, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(80, 80, 80);
      doc.text(format(day, 'EEE', { locale: de }), x + dayColW / 2, tableTop + 5, { align: 'center' });
      doc.text(format(day, 'd.M.', { locale: de }), x + dayColW / 2, tableTop + 10, { align: 'center' });
    });

    // Draw header borders
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(margin, tableTop, usableW, headerH);
    weekDays.forEach((_, i) => {
      const x = margin + nameColW + i * dayColW;
      doc.line(x, tableTop, x, tableTop + headerH);
    });
    doc.line(margin + nameColW, tableTop, margin + nameColW, tableTop + headerH);

    let currentY = tableTop + headerH;

    const drawSection = (label, emps, bgColor) => {
      if (emps.length === 0) return;
      // Section header
      doc.setFillColor(...bgColor);
      doc.rect(margin, currentY, usableW, 7, 'F');
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(60, 60, 60);
      doc.text(label, margin + 3, currentY + 5);
      doc.setDrawColor(200, 200, 200);
      doc.rect(margin, currentY, usableW, 7);
      currentY += 7;

      emps.forEach(emp => {
        // Name cell
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, currentY, nameColW, rowH, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(emp.full_name || '', margin + 3, currentY + 5, { maxWidth: nameColW - 4 });
        if (emp.abbreviation) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          doc.setTextColor(120, 120, 120);
          doc.text(emp.abbreviation, margin + 3, currentY + 9.5);
        }

        weekDays.forEach((day, i) => {
          const x = margin + nameColW + i * dayColW;
          const dateStr = format(day, 'yyyy-MM-dd');
          const isHoliday = isPublicHoliday(day, 'TH');

          if (isHoliday) {
            doc.setFillColor(248, 248, 248);
            doc.rect(x, currentY, dayColW, rowH, 'F');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 180, 180);
            doc.text('Feiertag', x + dayColW / 2, currentY + 7, { align: 'center' });
          } else {
            const ass = getCellAssignment(emp.id, dateStr);
            let cellText = '';
            let fillR = 255, fillG = 255, fillB = 255;
            let textR = 80, textG = 80, textB = 80;

            if (ass) {
              if (ass.assignment_type === 'baustelle') {
                cellText = getProjectName(ass.project_id);
                fillR = 239; fillG = 246; fillB = 255;
                textR = 30; textG = 64; textB = 175;
              } else if (ass.assignment_type === 'buero') {
                cellText = 'Büro';
                fillR = 243; fillG = 244; fillB = 246;
                textR = 55; textG = 65; textB = 81;
              } else if (ass.assignment_type === 'urlaub') {
                cellText = 'Urlaub';
                fillR = 255; fillG = 251; fillB = 235;
                textR = 146; textG = 64; textB = 14;
              } else if (ass.assignment_type === 'krank') {
                cellText = 'Krank';
                fillR = 254; fillG = 242; fillB = 242;
                textR = 185; textG = 28; textB = 28;
              }
            }

            doc.setFillColor(fillR, fillG, fillB);
            doc.rect(x, currentY, dayColW, rowH, 'F');

            if (cellText) {
              doc.setFontSize(8);
              doc.setFont('helvetica', 'bold');
              doc.setTextColor(textR, textG, textB);
              const lines = doc.splitTextToSize(cellText, dayColW - 4);
              const lineH = 3.5;
              const totalH = lines.length * lineH;
              const startY = currentY + (rowH - totalH) / 2 + lineH - 0.5;
              lines.forEach((line, li) => {
                doc.text(line, x + dayColW / 2, startY + li * lineH, { align: 'center' });
              });
            }
          }
        });

        // Row borders
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(margin, currentY, usableW, rowH);
        doc.line(margin + nameColW, currentY, margin + nameColW, currentY + rowH);
        weekDays.forEach((_, i) => {
          const x = margin + nameColW + (i + 1) * dayColW;
          if (i < 4) doc.line(x, currentY, x, currentY + rowH);
        });

        currentY += rowH;
      });
    };

    drawSection('Projektleiter', projektleiter, [235, 245, 255]);
    drawSection('Bürokräfte', buerokraefte, [255, 247, 237]);
    drawSection('Lageristen', lageristen, [240, 253, 244]);

    doc.save(`Bueroübersicht_EF_KW${getWeek(weekStart)}.pdf`);
  };

  useEffect(() => {
    loadData();
  }, [weekStart]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [empsData, projectsData, assignmentsData] = await Promise.all([
        base44.entities.Employee.filter({ is_active: true, is_ef: true }),
        base44.entities.Project.filter({ status: 'aktiv', is_ef_project: true }),
        base44.entities.Assignment.list(),
      ]);

      // Only projektleiter, buerokraft and lagerist with is_ef
      const officeEmps = empsData.filter(e =>
        e.employee_type === 'projektleiter' || e.employee_type === 'buerokraft' || e.employee_type === 'lagerist'
      );

      const typeOrder = { projektleiter: 0, buerokraft: 1, lagerist: 2 };
      officeEmps.sort((a, b) => {
        const orderDiff = (typeOrder[a.employee_type] ?? 99) - (typeOrder[b.employee_type] ?? 99);
        if (orderDiff !== 0) return orderDiff;
        return (a.full_name || '').localeCompare(b.full_name || '', 'de');
      });

      setEmployees(officeEmps);
      setProjects(projectsData);
      setAssignments(assignmentsData);
    } catch (e) {
      console.error(e);
      toast.error('Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  // Get the assignment for a specific employee+day (buero/urlaub/krank/baustelle)
  const getCellAssignment = (employeeId, dateStr) => {
    // Look for office-specific assignment first (buero/urlaub/krank)
    const officeTypes = ['buero', 'urlaub', 'krank'];
    const officeAss = assignments.find(
      a => a.employee_id === employeeId && a.date === dateStr && officeTypes.includes(a.assignment_type)
    );
    if (officeAss) return officeAss;

    // Then check for baustelle
    const bauAss = assignments.find(
      a => a.employee_id === employeeId && a.date === dateStr && a.assignment_type === 'baustelle'
    );
    if (bauAss) return bauAss;

    return null;
  };

  const getProjectName = (projectId) => {
    const p = projects.find(pr => pr.id === projectId);
    return p ? (p.name || p.cost_center_number || projectId) : 'Baustelle';
  };

  const getLeaderProjects = (employeeId) => {
    return projects.filter(p => p.project_leader_id === employeeId);
  };

  const handleCellDoubleClick = (employee, day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (isPublicHoliday(day, 'TH')) return;
    const existing = getCellAssignment(employee.id, dateStr);
    setDialogComment(existing?.notes || '');
    setDialog({ employee, day, dateStr });
  };

  const handleSelect = async (type, projectId = null) => {
    if (!dialog) return;
    const { employee, dateStr } = dialog;

    // Remove existing assignment for this employee+day (office types + baustelle)
    const existing = assignments.filter(
      a => a.employee_id === employee.id && a.date === dateStr &&
        ['buero', 'urlaub', 'krank', 'baustelle'].includes(a.assignment_type)
    );

    const newAssignment = {
      employee_id: employee.id,
      date: dateStr,
      assignment_type: type,
      project_id: projectId || null,
      notes: dialogComment.trim() || null,
    };

    // Optimistic update
    const removedIds = new Set(existing.map(a => a.id));
    const tempId = `temp_${Date.now()}`;
    setAssignments(prev => [
      ...prev.filter(a => !removedIds.has(a.id)),
      { ...newAssignment, id: tempId },
    ]);
    setDialog(null);
    toast.success('Gespeichert');

    try {
      if (existing.length > 0) {
        await Promise.all(existing.map(a => base44.entities.Assignment.delete(a.id)));
      }
      const created = await base44.entities.Assignment.create(newAssignment);
      setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
    } catch {
      toast.error('Fehler beim Speichern');
      loadData();
    }
  };

  const handleClear = async () => {
    if (!dialog) return;
    const { employee, dateStr } = dialog;
    const existing = assignments.filter(
      a => a.employee_id === employee.id && a.date === dateStr &&
        ['buero', 'urlaub', 'krank', 'baustelle'].includes(a.assignment_type)
    );
    if (existing.length === 0) { setDialog(null); return; }

    const removedIds = new Set(existing.map(a => a.id));
    setAssignments(prev => prev.filter(a => !removedIds.has(a.id)));
    setDialog(null);
    toast.success('Eintrag entfernt');

    try {
      await Promise.all(existing.map(a => base44.entities.Assignment.delete(a.id)));
    } catch {
      toast.error('Fehler beim Löschen');
      loadData();
    }
  };

  const renderCellContent = (employee, day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const isHoliday = isPublicHoliday(day, 'TH');

    if (isHoliday) {
      return (
        <div className="h-full min-h-[52px] bg-gray-50 flex items-center justify-center">
          <span className="text-[10px] text-gray-400">Feiertag</span>
        </div>
      );
    }

    const ass = getCellAssignment(employee.id, dateStr);
    if (!ass) {
      return (
        <div
          className="h-full min-h-[52px] cursor-pointer hover:bg-blue-50 transition-colors flex items-center justify-center"
          onDoubleClick={() => handleCellDoubleClick(employee, day)}
        >
          <span className="text-[11px] text-gray-300">–</span>
        </div>
      );
    }

    let label = '';
    let colorClass = '';
    if (ass.assignment_type === 'baustelle') {
      label = getProjectName(ass.project_id);
      colorClass = 'bg-blue-50 text-blue-800 border-blue-200';
    } else if (ass.assignment_type === 'buero') {
      label = 'Büro';
      colorClass = 'bg-gray-100 text-gray-700 border-gray-300';
    } else if (ass.assignment_type === 'urlaub') {
      label = 'Urlaub';
      colorClass = 'bg-amber-50 text-amber-800 border-amber-200';
    } else if (ass.assignment_type === 'krank') {
      label = 'Krank';
      colorClass = 'bg-red-50 text-red-800 border-red-200';
    }

    return (
      <div
        className={`h-full min-h-[52px] cursor-pointer transition-colors flex flex-col items-center justify-center p-1 gap-0.5 ${colorClass} border`}
        onDoubleClick={() => handleCellDoubleClick(employee, day)}
        title={ass.notes ? `${label} – ${ass.notes}` : 'Doppelklick zum Ändern'}
      >
        <span className="text-[11px] font-medium text-center leading-tight break-words">{label}</span>
        {ass.notes && (
          <span className="text-[9px] text-center leading-tight opacity-70 break-words max-w-full line-clamp-2">{ass.notes}</span>
        )}
      </div>
    );
  };

  const projektleiter = employees.filter(e => e.employee_type === 'projektleiter');
  const buerokraefte = employees.filter(e => e.employee_type === 'buerokraft');
  const lageristen = employees.filter(e => e.employee_type === 'lagerist');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
            <Briefcase className="w-8 h-8 dark:text-blue-300" />
            Büroübersicht EF
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            KW {getWeek(weekStart)} • {format(weekStart, 'd. MMM', { locale: de })} – {format(addDays(weekStart, 4), 'd. MMM yyyy', { locale: de })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Aktualisieren
          </Button>
          <Button variant="outline" size="sm" onClick={generatePDF}>
            <FileText className="w-4 h-4 mr-2" />
            PDF Download
          </Button>
        </div>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-900">
                <th className="p-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 border-b border-r dark:border-gray-700 w-48 min-w-[180px]">
                  Mitarbeiter
                </th>
                {weekDays.map((day, i) => {
                  const isHoliday = isPublicHoliday(day, 'TH');
                  const isToday = format(day, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                  return (
                    <th
                      key={i}
                      className={`p-3 text-center text-xs font-semibold border-b border-r dark:border-gray-700 ${
                        isHoliday ? 'bg-gray-100 text-gray-400' :
                        isToday ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                        'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <div>{format(day, 'EEE', { locale: de })}</div>
                      <div className="font-bold">{format(day, 'd.M.', { locale: de })}</div>
                      {isHoliday && <div className="text-[9px] font-normal text-gray-400">Feiertag</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Projektleiter section */}
              {projektleiter.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950 text-xs font-semibold text-blue-700 dark:text-blue-300 border-b dark:border-gray-700"
                    >
                      Projektleiter
                    </td>
                  </tr>
                  {projektleiter.map(emp => (
                    <tr key={emp.id} className="border-b dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-white/5">
                      <td className="p-3 border-r dark:border-gray-700">
                        <div className="font-medium text-sm text-gray-900 dark:text-white">{emp.full_name}</div>
                        {emp.abbreviation && (
                          <span className="text-xs text-gray-500 font-mono">{emp.abbreviation}</span>
                        )}
                      </td>
                      {weekDays.map((day, i) => (
                        <td key={i} className="border-r dark:border-gray-700 p-0">
                          {renderCellContent(emp, day)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {/* Bürokräfte section */}
              {buerokraefte.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-1.5 bg-orange-50 dark:bg-orange-950 text-xs font-semibold text-orange-700 dark:text-orange-300 border-b dark:border-gray-700"
                    >
                      Bürokräfte
                    </td>
                  </tr>
                  {buerokraefte.map(emp => (
                    <tr key={emp.id} className="border-b dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-white/5">
                      <td className="p-3 border-r dark:border-gray-700">
                        <div className="font-medium text-sm text-gray-900 dark:text-white">{emp.full_name}</div>
                      </td>
                      {weekDays.map((day, i) => (
                        <td key={i} className="border-r dark:border-gray-700 p-0">
                          {renderCellContent(emp, day)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {/* Lageristen section */}
              {lageristen.length > 0 && (
                <>
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-1.5 bg-green-50 dark:bg-green-950 text-xs font-semibold text-green-700 dark:text-green-300 border-b dark:border-gray-700"
                    >
                      Lageristen
                    </td>
                  </tr>
                  {lageristen.map(emp => (
                    <tr key={emp.id} className="border-b dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-white/5">
                      <td className="p-3 border-r dark:border-gray-700">
                        <div className="font-medium text-sm text-gray-900 dark:text-white">{emp.full_name}</div>
                      </td>
                      {weekDays.map((day, i) => (
                        <td key={i} className="border-r dark:border-gray-700 p-0">
                          {renderCellContent(emp, day)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              )}

              {employees.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400 text-sm">
                    Keine EF-Mitarbeiter mit Typ Projektleiter, Bürokraft oder Lagerist gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex gap-3 flex-wrap text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-200 inline-block" /> Baustelle</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-300 inline-block" /> Büro</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-200 inline-block" /> Urlaub</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block" /> Krank</span>
        <span className="text-gray-400 ml-2">Doppelklick auf Zelle zum Bearbeiten</span>
      </div>

      {/* Assignment Dialog */}
      <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog?.employee?.full_name} – {dialog?.day && format(dialog.day, 'EEEE, d. MMM', { locale: de })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {/* Baustellen (only for Projektleiter) */}
            {dialog?.employee?.employee_type === 'projektleiter' && (() => {
              const leaderProjects = getLeaderProjects(dialog.employee.id);
              if (leaderProjects.length > 0) return (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Baustellen</p>
                  {leaderProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSelect('baustelle', p.id)}
                      className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 hover:text-blue-700 text-sm transition-colors border border-transparent hover:border-blue-200 flex items-center gap-2"
                    >
                      <Building2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <span>{p.name || p.cost_center_number}</span>
                    </button>
                  ))}
                </div>
              );
              return null;
            })()}

            {/* Büro / Urlaub / Krank */}
            <div className="space-y-1">
              {dialog?.employee?.employee_type === 'projektleiter' && getLeaderProjects(dialog?.employee?.id || '').length > 0 && (
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1 pt-2">Sonstiges</p>
              )}
              <button
                onClick={() => handleSelect('buero')}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 text-sm transition-colors border border-transparent hover:border-gray-300 flex items-center gap-2"
              >
                <Briefcase className="w-4 h-4 text-gray-500 flex-shrink-0" />
                Büro
              </button>
              <button
                onClick={() => handleSelect('urlaub')}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-amber-50 hover:text-amber-700 text-sm transition-colors border border-transparent hover:border-amber-200 flex items-center gap-2"
              >
                <Plane className="w-4 h-4 text-amber-500 flex-shrink-0" />
                Urlaub
              </button>
              <button
                onClick={() => handleSelect('krank')}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-red-50 hover:text-red-700 text-sm transition-colors border border-transparent hover:border-red-200 flex items-center gap-2"
              >
                <Thermometer className="w-4 h-4 text-red-500 flex-shrink-0" />
                Krank
              </button>
            </div>

            {/* Kommentar */}
            <div className="pt-2 border-t space-y-1">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">Kommentar (optional)</Label>
              <Textarea
                value={dialogComment}
                onChange={e => setDialogComment(e.target.value)}
                placeholder="Kommentar zur Zelle..."
                rows={2}
                className="text-sm resize-none"
              />
              {dialog && getCellAssignment(dialog.employee.id, dialog.dateStr) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-1"
                  onClick={async () => {
                    const ass = getCellAssignment(dialog.employee.id, dialog.dateStr);
                    if (!ass) return;
                    setAssignments(prev => prev.map(a => a.id === ass.id ? { ...a, notes: dialogComment.trim() || null } : a));
                    setDialog(null);
                    try {
                      await base44.entities.Assignment.update(ass.id, { notes: dialogComment.trim() || null });
                      toast.success('Kommentar gespeichert');
                    } catch {
                      toast.error('Fehler beim Speichern');
                      loadData();
                    }
                  }}
                >
                  Nur Kommentar speichern
                </Button>
              )}
            </div>

            {/* Clear */}
            {dialog && getCellAssignment(dialog.employee.id, dialog.dateStr) && (
              <div className="pt-2 border-t">
                <button
                  onClick={handleClear}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 hover:text-red-600 text-sm transition-colors text-gray-400 flex items-center gap-2"
                >
                  <X className="w-4 h-4 flex-shrink-0" />
                  Eintrag löschen
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}