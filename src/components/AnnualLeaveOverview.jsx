import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { format, startOfYear, endOfYear, eachDayOfInterval, isWeekend, getMonth, getDay, parseISO, isWithinInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import { isPublicHoliday } from '../utils/publicHolidays';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import BulkLeaveEditor from './BulkLeaveEditor';
const NAME_W = 160; // px name column
const COL_W = 22; // px per day column

const TYPE_ORDER = ['projektleiter', 'buerokraft', 'lagerist', 'monteur', 'azubi', 'praktikant'];
const TYPE_LABELS = {
  projektleiter: 'Projektleiter',
  buerokraft: 'Bürokräfte',
  lagerist: 'Lageristen',
  monteur: 'Monteure',
  azubi: 'Azubis',
  praktikant: 'Praktikanten',
};

const CELL_COLORS = {
  U: 'bg-amber-400 text-white',
  U_pending: 'bg-amber-200 text-amber-700',
  K: 'bg-red-500 text-white',
  K_pending: 'bg-red-200 text-red-700',
  B: 'bg-purple-500 text-white',
  S: 'bg-green-500 text-white',
  T: 'bg-cyan-500 text-white',
  P: 'bg-orange-500 text-white',
  TS: 'bg-gray-600 text-white',
};

// Helper: check if a date is within any of the given periods [{start_date, end_date}]
function isInPeriod(dateStr, periods = []) {
  return periods.some(p => {
    if (!p.start_date || !p.end_date) return false;
    return dateStr >= p.start_date && dateStr <= p.end_date;
  });
}

// Get azubi cell symbol from employee data (Schule/TBZ/Prüfung)
function getAzubiSymbol(emp, dateStr, day) {
  if (emp.employee_type !== 'azubi') return null;
  // Prüfung hat höchste Priorität
  if (isInPeriod(dateStr, emp.exam_periods)) return 'P';
  // TBZ
  if (isInPeriod(dateStr, emp.tbz_periods)) return 'T';
  // Schule: Wochentag in school_days, aber nicht in Ferienzeit
  const weekday = getDay(day); // 0=So, 1=Mo ... 6=Sa
  // school_days uses 0=Mo, 1=Di, ..., 4=Fr → map to JS getDay (1=Mo..5=Fr)
  const jsWeekday = weekday === 0 ? -1 : weekday - 1; // -1 for Sunday
  if (Array.isArray(emp.school_days) && emp.school_days.includes(jsWeekday)) {
    if (!isInPeriod(dateStr, emp.vacation_periods)) return 'S';
  }
  return null;
}

// Dialog for manual cell editing
function CellEditDialog({ employee, date, currentValue, isWeekend, onSave, onClose }) {
  const isAzubi = employee.employee_type === 'azubi';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-5 w-80 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
          {employee.full_name} — {format(date, 'd. MMM yyyy', { locale: de })}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {!isWeekend && (
            <>
              <button onClick={() => onSave('U')} className={`px-3 py-3 rounded-lg text-sm font-bold transition-colors ${currentValue === 'U' ? 'bg-amber-500 text-white ring-2 ring-amber-300' : 'bg-amber-100 text-amber-800 hover:bg-amber-200'}`}>U – Urlaub</button>
              <button onClick={() => onSave('K')} className={`px-3 py-3 rounded-lg text-sm font-bold transition-colors ${currentValue === 'K' ? 'bg-red-500 text-white ring-2 ring-red-300' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>K – Krank</button>
              <button onClick={() => onSave('B')} className={`px-3 py-3 rounded-lg text-sm font-bold transition-colors ${currentValue === 'B' ? 'bg-purple-500 text-white ring-2 ring-purple-300' : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}>B – Beurlaubt</button>
              {isAzubi && (
                <>
                  <button onClick={() => onSave('S')} className={`px-3 py-3 rounded-lg text-sm font-bold transition-colors ${currentValue === 'S' ? 'bg-green-500 text-white ring-2 ring-green-300' : 'bg-green-100 text-green-800 hover:bg-green-200'}`}>S – Schule</button>
                  <button onClick={() => onSave('T')} className={`px-3 py-3 rounded-lg text-sm font-bold transition-colors ${currentValue === 'T' ? 'bg-cyan-500 text-white ring-2 ring-cyan-300' : 'bg-cyan-100 text-cyan-800 hover:bg-cyan-200'}`}>T – TBZ</button>
                  <button onClick={() => onSave('P')} className={`px-3 py-3 rounded-lg text-sm font-bold transition-colors ${currentValue === 'P' ? 'bg-orange-500 text-white ring-2 ring-orange-300' : 'bg-orange-100 text-orange-800 hover:bg-orange-200'}`}>P – Prüfung</button>
                  <button onClick={() => onSave('TS')} className={`px-3 py-3 rounded-lg text-sm font-bold transition-colors ${currentValue === 'TS' ? 'bg-gray-600 text-white ring-2 ring-gray-400' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>TS – Techn. Service</button>
                </>
              )}
            </>
          )}
          {currentValue && (
            <button onClick={() => onSave(null)} className="col-span-2 px-3 py-3 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300">Löschen</button>
          )}
        </div>
        <button onClick={onClose} className="w-full text-xs text-gray-400 hover:text-gray-600 mt-1">Abbrechen</button>
      </div>
    </div>
  );
}

export default function AnnualLeaveOverview() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editDialog, setEditDialog] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const scrollRef = useRef(null);
  const tableRef = useRef(null);
  const hasScrolledRef = useRef(false);

  // PDF export dialogs
  const [showPdfTypeDialog, setShowPdfTypeDialog] = useState(false);
  const [showPdfMonthDialog, setShowPdfMonthDialog] = useState(false);
  const [pdfSelectedTypes, setPdfSelectedTypes] = useState(new Set(TYPE_ORDER));
  const [pdfSelectedMonths, setPdfSelectedMonths] = useState(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));

  // DOM-based hover handlers (no React state = no re-renders = instant)
  const handleCellEnter = (e) => {
    const table = tableRef.current;
    if (!table) return;
    const td = e.currentTarget;
    const cellIndex = td.cellIndex;

    // Highlight column in tbody
    const tbody = table.querySelector('tbody');
    if (tbody) {
      tbody.querySelectorAll('tr').forEach(row => {
        const cell = row.cells[cellIndex];
        if (cell) cell.classList.add('col-hovered');
      });
    }

    // Highlight column in thead day row (second tr of thead)
    const thead = table.querySelector('thead');
    if (thead) {
      const dayRow = thead.querySelectorAll('tr')[1];
      if (dayRow) {
        const th = dayRow.cells[cellIndex];
        if (th) th.classList.add('th-col-hovered');
      }
    }

    // Highlight name cell in this row
    const nameCell = td.parentElement?.cells[0];
    if (nameCell) nameCell.classList.add('name-hovered');
  };

  const handleCellLeave = () => {
    const table = tableRef.current;
    if (!table) return;
    table.querySelectorAll('.col-hovered').forEach(el => el.classList.remove('col-hovered'));
    table.querySelectorAll('.name-hovered').forEach(el => el.classList.remove('name-hovered'));
    table.querySelectorAll('.th-col-hovered').forEach(el => el.classList.remove('th-col-hovered'));
  };

  const days = eachDayOfInterval({
    start: startOfYear(new Date(year, 0, 1)),
    end: endOfYear(new Date(year, 0, 1)),
  });

  // Group days by month for header rendering
  const months = [];
  let currentMonth = -1;
  days.forEach(day => {
    const m = getMonth(day);
    if (m !== currentMonth) {
      months.push({ month: m, label: format(day, 'MMM', { locale: de }), startIdx: days.indexOf(day), count: 0 });
      currentMonth = m;
    }
    months[months.length - 1].count++;
  });

  useEffect(() => {
    // Reset scroll flag when year changes so the new year scrolls to current month
    hasScrolledRef.current = false;
  }, [year]);

  useEffect(() => {
    if (scrollRef.current && !loading && !hasScrolledRef.current) {
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');
      const todayIndex = days.findIndex(d => format(d, 'yyyy-MM-dd') === todayStr);
      if (todayIndex !== -1) {
        const scrollPos = todayIndex * COL_W - 100;
        scrollRef.current.scrollLeft = Math.max(0, scrollPos);
      }
      hasScrolledRef.current = true;
    }
  }, [days, year, loading]);

  useEffect(() => {
    loadData();
  }, [year]);

  const loadData = async () => {
    setLoading(true);
    try {
      const yearStr = String(year);
      const [me, empsData, assignmentsData, leaveRequestsData] = await Promise.all([
        api.auth.me(),
        api.entities.Employee.filter({ is_active: true }),
        api.entities.Assignment.filter({}),
        api.entities.LeaveRequest.filter({}),  // alle Status laden
      ]);

      setCurrentUser(me);

      // Filter employees by user location
      const location = me?.location;
      let filteredEmps = empsData;
      if (location === 'EF') {
        filteredEmps = empsData.filter(e => e.is_ef === true);
      } else if (location === 'PB') {
        filteredEmps = empsData.filter(e => !e.is_ef);
      }
      // location === 'admin' or no location → all employees

      // Sort employees by type order, then alphabetically
      filteredEmps.sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.employee_type);
        const bi = TYPE_ORDER.indexOf(b.employee_type);
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return (a.full_name || '').localeCompare(b.full_name || '', 'de');
      });

      setEmployees(filteredEmps);

      // Only keep relevant assignment types for this year
      const relevant = assignmentsData.filter(a =>
        a.date && a.date.startsWith(yearStr) &&
        ['urlaub', 'krank', 'beurlaubung', 'schule', 'tbz', 'pruefung', 'ts', 'override_leer'].includes(a.assignment_type)
      );

      // Add approved leave requests as assignments for this year
      // Skip manually created ones (notes === '__manual_overview__') and revocation requests
      const leaveAssignments = leaveRequestsData.flatMap(req => {
        if (!req.employee_id || !req.start_date || !req.end_date) return [];
        if (req.notes === '__manual_overview__') return [];
        if (req.notes?.includes('__revoke_request_for_')) return [];
        const isPending = req.status === 'eingereicht' || req.status === 'in_pruefung';

        const typeMap = {
          urlaub: { assignment_type: 'urlaub', symbol: 'U' },
          krankmeldung: { assignment_type: 'krank', symbol: 'K' }
        };

        const typeConfig = typeMap[req.request_type];
        if (!typeConfig) return [];

        // Generate assignments for each day in the range
        const start = new Date(req.start_date);
        const end = new Date(req.end_date);
        const assignments = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = format(d, 'yyyy-MM-dd');
          if (dateStr.startsWith(yearStr)) {
            // Für Urlaub und Krank: nur Arbeitstage (kein Wochenende, kein Feiertag)
            if (typeConfig.assignment_type === 'urlaub' || typeConfig.assignment_type === 'krank') {
              if (isWeekend(d) || isPublicHoliday(d, 'TH')) continue;
            }
            assignments.push({
              id: `leave_${req.id}_${dateStr}`,
              employee_id: req.employee_id,
              date: dateStr,
              assignment_type: typeConfig.assignment_type,
              _from_leave_request: true,
              _pending: isPending,
            });
          }
        }

        return assignments;
      });

      // Combine assignments: manual ones take priority
      const combined = [...relevant];
      leaveAssignments.forEach(leaveAssign => {
        const exists = relevant.some(a => a.employee_id === leaveAssign.employee_id && a.date === leaveAssign.date);
        if (!exists) {
          combined.push(leaveAssign);
        }
      });

      setAssignments(combined);
    } catch (e) {
      console.error(e);
      toast.error('Fehler beim Laden');
    } finally {
      setLoading(false);
    }
  };

  // Build a lookup: employeeId -> dateStr -> symbol (manual assignments take priority over derived)
  // 'override_leer' means "explicitly cleared" (no symbol, blocks azubi auto-derivation)
  const cellMap = {};
  assignments.forEach(a => {
    if (!cellMap[a.employee_id]) cellMap[a.employee_id] = {};
    if (a.assignment_type === 'override_leer') {
      cellMap[a.employee_id][a.date] = '__cleared__';
      return;
    }
    const sym = a._pending && a.assignment_type === 'urlaub' ? 'U_pending'
      : a._pending && a.assignment_type === 'krank' ? 'K_pending'
      : { urlaub: 'U', krank: 'K', beurlaubung: 'B', schule: 'S', tbz: 'T', pruefung: 'P', ts: 'TS' }[a.assignment_type];
    if (sym) cellMap[a.employee_id][a.date] = sym;
  });

  const getCell = (empId, dateStr, day) => {
    // Assignment-based (manual) takes priority
    const manual = cellMap[empId]?.[dateStr];
    if (manual === '__cleared__') return null; // explicitly cleared, skip azubi derivation
    if (manual) return manual;
    // For azubis: derive from employee data
    const emp = employees.find(e => e.id === empId);
    if (emp && day) return getAzubiSymbol(emp, dateStr, day);
    return null;
  };

  const handleDoubleClick = (employee, day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const currentValue = getCell(employee.id, dateStr, day);
    const isWe = isWeekend(day);
    const isHol = isPublicHoliday(day, 'TH');
    setEditDialog({ employee, date: day, dateStr, currentValue, isWeekendOrHoliday: isWe || isHol });
  };

  const handleSave = async (symbol) => {
    if (!editDialog) return;
    const { employee, dateStr, currentValue } = editDialog;
    setEditDialog(null);

    const typeMap = { U: 'urlaub', K: 'krank', B: 'beurlaubung', S: 'schule', T: 'tbz', P: 'pruefung', TS: 'ts' };
    const allTypes = [...Object.values(typeMap), 'override_leer'];

    // Optimistic update
    setAssignments(prev => {
      const filtered = prev.filter(a =>
        !(a.employee_id === employee.id && a.date === dateStr && allTypes.includes(a.assignment_type))
      );
      if (!symbol) return filtered;
      return [...filtered, { id: `temp_${Date.now()}`, employee_id: employee.id, date: dateStr, assignment_type: typeMap[symbol] }];
    });

    try {
      // Delete existing assignments for this cell (all, including _from_leave_request)
      const existing = assignments.filter(
        a => a.employee_id === employee.id && a.date === dateStr && allTypes.includes(a.assignment_type)
      );
      // Find all LeaveRequests for this employee that cover this day (including multi-day ranges)
      const allLeaveReqs = await api.entities.LeaveRequest.filter({
        employee_id: employee.id,
      });
      const coveringLeaveReqs = allLeaveReqs.filter(r =>
        (r.request_type === 'urlaub' || r.request_type === 'krankmeldung') &&
        !r.notes?.includes('__revoke_request_for_') &&
        r.start_date <= dateStr && r.end_date >= dateStr
      );

      // Also fetch any real Assignments from the daily view for this employee/day
      const dailyAssignments = await api.entities.Assignment.filter({
        employee_id: employee.id,
        date: dateStr,
      });
      const relevantDailyAssignments = dailyAssignments.filter(a =>
        allTypes.includes(a.assignment_type)
      );

      // Delete all covering leave requests & assignments for this day
      // Also delete any related revocation requests for this day
      const revocationReqs = allLeaveReqs.filter(r =>
        r.notes?.includes('__revoke_request_for_') &&
        r.start_date <= dateStr && r.end_date >= dateStr
      );

      await Promise.all([
        ...existing.filter(a => !a._from_leave_request).map(a => api.entities.Assignment.delete(a.id)),
        ...coveringLeaveReqs.map(r => api.entities.LeaveRequest.delete(r.id)),
        ...revocationReqs.map(r => api.entities.LeaveRequest.delete(r.id)), // Delete related revocations
        ...relevantDailyAssignments
          .filter(a => !existing.find(e => e.id === a.id))
          .map(a => api.entities.Assignment.delete(a.id)),
      ]);

      // For each deleted multi-day LeaveRequest: recreate as two parts (before + after the deleted day)
      for (const req of coveringLeaveReqs) {
        const beforeEnd = new Date(dateStr);
        beforeEnd.setDate(beforeEnd.getDate() - 1);
        const beforeEndStr = format(beforeEnd, 'yyyy-MM-dd');

        const afterStart = new Date(dateStr);
        afterStart.setDate(afterStart.getDate() + 1);
        const afterStartStr = format(afterStart, 'yyyy-MM-dd');

        const splits = [];
        if (req.start_date <= beforeEndStr) {
          splits.push({ ...req, start_date: req.start_date, end_date: beforeEndStr });
        }
        if (afterStartStr <= req.end_date) {
          splits.push({ ...req, start_date: afterStartStr, end_date: req.end_date });
        }

        await Promise.all(splits.map(split => api.entities.LeaveRequest.create({
          employee_id: split.employee_id,
          employee_name: split.employee_name,
          request_type: split.request_type,
          start_date: split.start_date,
          end_date: split.end_date,
          status: split.status,
          approved_by: split.approved_by,
          approved_at: split.approved_at,
          notes: split.notes,
        })));
      }

      if (!symbol) {
        // If the cell had an azubi-derived symbol (S/T/P), save an override_leer to block re-derivation
        const azubiDerived = getAzubiSymbol(employees.find(e => e.id === employee.id), dateStr, editDialog.date);
        if (azubiDerived) {
          await api.entities.Assignment.create({
            employee_id: employee.id,
            date: dateStr,
            assignment_type: 'override_leer',
          });
          // Update optimistic state to include this marker
          setAssignments(prev => [...prev.filter(a =>
            !(a.employee_id === employee.id && a.date === dateStr && a.assignment_type === 'override_leer')
          ), { id: `override_${Date.now()}`, employee_id: employee.id, date: dateStr, assignment_type: 'override_leer' }]);
        }
      }

      if (symbol) {
        const created = await api.entities.Assignment.create({
          employee_id: employee.id,
          date: dateStr,
          assignment_type: typeMap[symbol],
        });
        setAssignments(prev => prev.map(a =>
          a.id?.startsWith('temp_') && a.employee_id === employee.id && a.date === dateStr
            ? { ...a, id: created.id }
            : a
        ));

        // For U (Urlaub) and K (Krank): also create a LeaveRequest so it shows up in user's leave/sick pages
        if (symbol === 'U' || symbol === 'K') {
          const requestType = symbol === 'U' ? 'urlaub' : 'krankmeldung';
          await api.entities.LeaveRequest.create({
            employee_id: employee.id,
            employee_name: employee.full_name,
            request_type: requestType,
            start_date: dateStr,
            end_date: dateStr,
            status: 'genehmigt',
            approved_by: currentUser?.full_name || currentUser?.email || 'Admin',
            approved_at: new Date().toISOString(),
            notes: '__manual_overview__',
          });
        }
      }
      toast.success('Gespeichert');
    } catch (e) {
      console.error(e);
      toast.error('Fehler beim Speichern');
      loadData();
    }
  };

  // Group employees by type for section headers
  const groupedEmployees = [];
  let lastType = null;
  employees.forEach(emp => {
    if (emp.employee_type !== lastType) {
      groupedEmployees.push({ type: 'header', key: `header_${emp.employee_type}`, label: TYPE_LABELS[emp.employee_type] || emp.employee_type });
      lastType = emp.employee_type;
    }
    groupedEmployees.push({ type: 'employee', key: emp.id, emp });
  });

  const openPdfTypeDialog = () => {
    setPdfSelectedTypes(new Set(TYPE_ORDER));
    setShowPdfTypeDialog(true);
  };

  const handlePdfTypesConfirm = () => {
    if (pdfSelectedTypes.size === 0) {
      toast.error('Bitte wählen Sie mindestens einen Mitarbeitertyp aus.');
      return;
    }
    setShowPdfTypeDialog(false);
    setPdfSelectedMonths(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    setShowPdfMonthDialog(true);
  };

  const handlePdfMonthsConfirm = () => {
    if (pdfSelectedMonths.size === 0) {
      toast.error('Bitte wählen Sie mindestens einen Monat aus.');
      return;
    }
    setShowPdfMonthDialog(false);
    handleExportPDF();
  };

  const handleExportPDF = () => {
    const filteredEmps = employees.filter(e => pdfSelectedTypes.has(e.employee_type));
    if (filteredEmps.length === 0) {
      toast.error('Keine Mitarbeiter für die gewählten Typen gefunden.');
      return;
    }

    const selectedMonthIndices = [...pdfSelectedMonths].sort((a, b) => a - b);
    const monthGroups = [];
    // Build groups from selected consecutive months, 4 per page
    for (let i = 0; i < selectedMonthIndices.length; i += 4) {
      const groupMonths = selectedMonthIndices.slice(i, i + 4);
      const firstM = groupMonths[0];
      const lastM = groupMonths[groupMonths.length - 1];
      const MONTH_NAMES = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
      monthGroups.push({
        label: `${MONTH_NAMES[firstM]} – ${MONTH_NAMES[lastM]} ${year}`,
        monthIndices: groupMonths,
      });
    }

    // DIN A3 landscape: 420 x 297 mm
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    const pageW = 420;
    const pageH = 297;
    const margin = 6;

    const rowH = 3.5;
    const headerH = 4;
    const subHeaderH = 3;
    const fontSize = 4.5;

    // Dynamically calculate name column width based on longest name
    doc.setFontSize(fontSize);
    const maxNameW = filteredEmps.reduce((max, emp) => {
      const w = doc.getTextWidth(emp.full_name || '');
      return w > max ? w : max;
    }, 0);
    const nameColW = Math.ceil(maxNameW) + 3; // small padding

    // Build grouped employees for PDF from filtered employees
    const pdfGroupedEmployees = [];
    let pdfLastType = null;
    filteredEmps.forEach(emp => {
      if (emp.employee_type !== pdfLastType) {
        pdfGroupedEmployees.push({ type: 'header', key: `header_${emp.employee_type}`, label: TYPE_LABELS[emp.employee_type] || emp.employee_type });
        pdfLastType = emp.employee_type;
      }
      pdfGroupedEmployees.push({ type: 'employee', key: emp.id, emp });
    });

    monthGroups.forEach((group, pageIdx) => {
      if (pageIdx > 0) doc.addPage('a3', 'landscape');

      // Filter days and months for this group
      const pageDays = days.filter(d => group.monthIndices.includes(getMonth(d)));
      const pageMonths = months.filter(m => group.monthIndices.includes(m.month));

      const availableW = pageW - 2 * margin - nameColW;
      const dayColW = availableW / pageDays.length;

      // Title
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Jahresübersicht – ${group.label}`, margin, margin + 4);

      // Legend
      doc.setFontSize(5.5);
      doc.setFont('helvetica', 'normal');
      const legendItems = [
        { color: [251, 191, 36], label: 'U = Urlaub' },
        { color: [239, 68, 68], label: 'K = Krank' },
        { color: [168, 85, 247], label: 'B = Beurlaubt' },
        { color: [34, 197, 94], label: 'S = Schule' },
        { color: [6, 182, 212], label: 'T = TBZ' },
        { color: [249, 115, 22], label: 'P = Prüfung' },
        { color: [107, 114, 128], label: 'TS = Techn. Service' },
      ];
      let lx = pageW - 130;
      legendItems.forEach(item => {
        doc.setFillColor(...item.color);
        doc.rect(lx, margin + 1, 3, 3, 'F');
        doc.setTextColor(60, 60, 60);
        doc.text(item.label, lx + 4, margin + 4);
        lx += 22;
      });

      let y = margin + 8;

      // Month header row
      doc.setFontSize(4);
      doc.setFont('helvetica', 'bold');
      doc.setDrawColor(200, 200, 200);
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, y, nameColW, headerH, 'F');
      doc.rect(margin, y, nameColW, headerH);

      let mx = margin + nameColW;
      pageMonths.forEach(m => {
        const mw = dayColW * m.count;
        doc.setFillColor(243, 244, 246);
        doc.rect(mx, y, mw, headerH, 'F');
        doc.rect(mx, y, mw, headerH);
        doc.setTextColor(60, 60, 60);
        doc.text(m.label, mx + mw / 2, y + headerH - 1.5, { align: 'center' });
        mx += mw;
      });

      y += headerH;

      // Day number sub-header
      doc.setFontSize(4);
      doc.setFont('helvetica', 'normal');
      doc.setFillColor(249, 250, 251);
      doc.rect(margin, y, nameColW, subHeaderH, 'F');
      doc.rect(margin, y, nameColW, subHeaderH);
      doc.setTextColor(80, 80, 80);
      doc.text('Mitarbeiter', margin + 1, y + subHeaderH - 1.2);

      pageDays.forEach((day, i) => {
        const isWe = isWeekend(day);
        const isHol = isPublicHoliday(day, 'TH');
        const dx = margin + nameColW + i * dayColW;
        doc.setFillColor(isWe || isHol ? 229 : 249, isWe || isHol ? 231 : 250, isWe || isHol ? 235 : 251);
        doc.rect(dx, y, dayColW, subHeaderH, 'F');
        doc.rect(dx, y, dayColW, subHeaderH);
        doc.setTextColor(100, 100, 100);
        doc.text(format(day, 'd'), dx + dayColW / 2, y + subHeaderH - 1.2, { align: 'center' });
      });

      y += subHeaderH;

      // Data rows
      doc.setFontSize(fontSize);
      pdfGroupedEmployees.forEach(row => {
        if (row.type === 'header') {
          doc.setFillColor(219, 234, 254);
          doc.rect(margin, y, pageW - 2 * margin, rowH, 'F');
          doc.rect(margin, y, pageW - 2 * margin, rowH);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(4);
          doc.setTextColor(29, 78, 216);
          doc.text(row.label, margin + 1, y + rowH - 1.2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(fontSize);
        } else {
          const { emp } = row;
          // Name cell
          doc.setFillColor(255, 255, 255);
          doc.rect(margin, y, nameColW, rowH, 'F');
          doc.rect(margin, y, nameColW, rowH);
          doc.setTextColor(40, 40, 40);
          doc.text(emp.full_name || '', margin + 1, y + rowH - 1.2);

          // Day cells
          pageDays.forEach((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isWe = isWeekend(day);
            const isHol = isPublicHoliday(day, 'TH');
            const symbol = cellMap[emp.id]?.[dateStr] || getAzubiSymbol(emp, dateStr, day);
            const dx = margin + nameColW + i * dayColW;

            if (symbol === 'U') doc.setFillColor(251, 191, 36);
            else if (symbol === 'K') doc.setFillColor(239, 68, 68);
            else if (symbol === 'B') doc.setFillColor(168, 85, 247);
            else if (symbol === 'S') doc.setFillColor(34, 197, 94);
            else if (symbol === 'T') doc.setFillColor(6, 182, 212);
            else if (symbol === 'P') doc.setFillColor(249, 115, 22);
            else if (symbol === 'TS') doc.setFillColor(107, 114, 128);
            else if (isWe || isHol) doc.setFillColor(229, 231, 235);
            else doc.setFillColor(255, 255, 255);

            doc.rect(dx, y, dayColW, rowH, 'F');
            doc.rect(dx, y, dayColW, rowH);

            if (symbol) {
              doc.setTextColor(255, 255, 255);
              doc.setFont('helvetica', 'bold');
              doc.text(symbol, dx + dayColW / 2, y + rowH - 1.2, { align: 'center' });
              doc.setFont('helvetica', 'normal');
              doc.setTextColor(40, 40, 40);
            }
          });
        }
        y += rowH;
      });
    });

    doc.save(`Jahresübersicht_${year}.pdf`);
    toast.success('PDF wurde heruntergeladen');
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const handleAssignmentsChange = (newAssignments, empId, startDate, endDate) => {
    setAssignments(prev => {
      // Entferne nur Assignments für diese Employee IM ZEITRAUM des Schnelleintrags
      const filtered = prev.filter(a => {
        if (a.employee_id !== empId) return true;
        // Behalte Assignments außerhalb des Zeitraums
        return a.date < startDate || a.date > endDate;
      });
      return [...filtered, ...newAssignments];
    });
  };

  return (
     <div className="space-y-4">
       {/* Bulk Editor */}
       <BulkLeaveEditor
         employees={employees}
         year={year}
         onSaved={loadData}
         currentUser={currentUser}
         onAssignmentsChange={handleAssignmentsChange}
       />

      {/* Year navigation */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setYear(y => y - 1)}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-lg font-semibold text-gray-900 dark:text-white w-16 text-center">{year}</span>
        <Button variant="outline" size="icon" onClick={() => setYear(y => y + 1)}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={openPdfTypeDialog} className="ml-2">
          <Download className="w-4 h-4 mr-1" />
          PDF (DIN A3)
        </Button>
        <div className="flex flex-wrap items-center gap-3 ml-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-amber-400" /> U = Urlaub</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-red-500" /> K = Krank</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-purple-500" /> B = Beurlaubt</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-green-500" /> S = Schule</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-cyan-500" /> T = TBZ</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-orange-500" /> P = Prüfung</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 h-4 rounded bg-gray-600" /> TS = Techn. Service</span>
          <span className="text-gray-400">Doppelklick auf Zelle zum Bearbeiten</span>
        </div>
      </div>

      {/* Hover styles */}
      <style>{`
        .col-hovered { background-color: #fef2f2 !important; }
        .dark .col-hovered { background-color: rgba(185,28,28,0.15) !important; }
        .name-hovered { color: #dc2626 !important; font-weight: 700 !important; background-color: #fef2f2 !important; }
        .dark .name-hovered { color: #f87171 !important; background-color: rgba(185,28,28,0.15) !important; }
        .th-col-hovered { background-color: #fee2e2 !important; color: #dc2626 !important; font-weight: 700 !important; }
        .dark .th-col-hovered { background-color: rgba(185,28,28,0.2) !important; color: #f87171 !important; }
      `}</style>

      {/* Scrollable grid */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-gray-800">
        <div className="overflow-auto" ref={scrollRef} style={{ maxHeight: '75vh' }}>
          <table ref={tableRef} className="border-collapse" style={{ tableLayout: 'fixed', minWidth: `${NAME_W + COL_W * days.length}px` }}>
            <thead className="sticky top-0 z-20 bg-white dark:bg-gray-800">
              {/* Month header */}
              <tr>
                <th
                  className="sticky left-0 z-30 bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700"
                  style={{ width: NAME_W, minWidth: NAME_W }}
                />
                {months.map((m, i) => (
                  <th
                    key={i}
                    colSpan={m.count}
                    className="text-center text-xs font-bold text-gray-600 dark:text-gray-300 border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 py-1"
                    style={{ width: COL_W * m.count }}
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
              {/* Day number header */}
              <tr>
                <th
                  className="sticky left-0 z-30 bg-white dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 text-xs text-left px-2 py-1 font-semibold text-gray-600 dark:text-gray-300"
                  style={{ width: NAME_W, minWidth: NAME_W }}
                >
                  Mitarbeiter
                </th>
                {days.map((day, i) => {
                  const isWe = isWeekend(day);
                  const isHol = isPublicHoliday(day, 'TH');
                  return (
                    <th
                      key={i}
                      className={`text-center border-b border-r border-gray-200 dark:border-gray-700 py-0.5 ${isWe || isHol ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-white dark:bg-gray-800 text-gray-500'}`}
                      style={{ width: COL_W, minWidth: COL_W, fontSize: 9 }}
                      title={format(day, 'EEEE, d. MMM', { locale: de })}
                    >
                      {format(day, 'd')}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {groupedEmployees.map(row => {
                if (row.type === 'header') {
                  return (
                    <tr key={row.key}>
                      <td
                        colSpan={days.length + 1}
                        className="bg-blue-50 dark:bg-blue-950 border-b border-gray-200 dark:border-gray-700"
                        style={{ padding: 0 }}
                      >
                        <div
                          className="sticky left-0 text-blue-700 dark:text-blue-300 text-xs font-bold px-2 py-1"
                          style={{ width: 'max-content' }}
                        >
                          {row.label}
                        </div>
                      </td>
                    </tr>
                  );
                }

                const { emp } = row;
                return (
                  <tr key={row.key} className="group">
                    <td
                      className="sticky left-0 z-10 border-b border-r border-gray-200 dark:border-gray-700 px-2 py-0.5 text-xs font-medium truncate text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-gray-750"
                      style={{ width: NAME_W, minWidth: NAME_W, maxWidth: NAME_W }}
                      title={emp.full_name}
                    >
                      {emp.full_name}
                    </td>
                    {days.map((day, i) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isWe = isWeekend(day);
                      const isHol = isPublicHoliday(day, 'TH');
                      const symbol = getCell(emp.id, dateStr, day);
                      const SYMBOL_LABELS = { U: 'Urlaub', K: 'Krank', B: 'Beurlaubt', S: 'Schule', T: 'TBZ', P: 'Prüfung', TS: 'Techn. Service' };

                      return (
                        <td
                          key={i}
                          onMouseEnter={handleCellEnter}
                          onMouseLeave={handleCellLeave}
                          className={`border-b border-r border-gray-200 dark:border-gray-700 text-center cursor-pointer select-none ${
                            symbol
                              ? CELL_COLORS[symbol]
                              : isWe || isHol
                              ? 'bg-gray-100 dark:bg-gray-700'
                              : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                          }`}
                          style={{ width: COL_W, minWidth: COL_W, height: 24, fontSize: 10, fontWeight: symbol ? 700 : 400 }}
                          onDoubleClick={() => (!isWe && !isHol) || symbol ? handleDoubleClick(emp, day) : undefined}
                          title={symbol === 'U_pending' ? `${emp.full_name}: Urlaub (ausstehend)` : symbol === 'K_pending' ? `${emp.full_name}: Krank (ausstehend)` : symbol ? `${emp.full_name}: ${SYMBOL_LABELS[symbol] || symbol}` : ''}
                        >
                          {symbol === 'U_pending' ? 'U' : symbol === 'K_pending' ? 'K' : symbol || ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {editDialog && (
        <CellEditDialog
          employee={editDialog.employee}
          date={editDialog.date}
          currentValue={editDialog.currentValue}
          isWeekend={editDialog.isWeekendOrHoliday}
          onSave={handleSave}
          onClose={() => setEditDialog(null)}
        />
      )}

      {/* PDF Type Selection Dialog */}
      {showPdfTypeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPdfTypeDialog(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-96 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Mitarbeitertypen für PDF</h3>
            <p className="text-sm text-gray-500">Wählen Sie die Typen, die im PDF erscheinen sollen:</p>
            <div className="space-y-2">
              {TYPE_ORDER.map(type => (
                <label key={type} className="flex items-center gap-3 cursor-pointer py-1.5 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={pdfSelectedTypes.has(type)}
                    onChange={() => {
                      const next = new Set(pdfSelectedTypes);
                      if (next.has(type)) next.delete(type); else next.add(type);
                      setPdfSelectedTypes(next);
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{TYPE_LABELS[type]}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowPdfTypeDialog(false)}>Abbrechen</Button>
              <Button size="sm" onClick={handlePdfTypesConfirm} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">Weiter</Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Month Selection Dialog */}
      {showPdfMonthDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPdfMonthDialog(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-96 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Monate für PDF</h3>
            <p className="text-sm text-gray-500">Wählen Sie die Monate, die gedruckt werden sollen:</p>
            <div className="grid grid-cols-3 gap-2">
              {['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'].map((name, idx) => (
                <label key={idx} className="flex items-center gap-2 cursor-pointer py-2 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700">
                  <input
                    type="checkbox"
                    checked={pdfSelectedMonths.has(idx)}
                    onChange={() => {
                      const next = new Set(pdfSelectedMonths);
                      if (next.has(idx)) next.delete(idx); else next.add(idx);
                      setPdfSelectedMonths(next);
                    }}
                    className="w-4 h-4 rounded border-gray-300 text-[#1e3a5f] focus:ring-[#1e3a5f]"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-200">{name}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowPdfMonthDialog(false); setShowPdfTypeDialog(true); }}>Zurück</Button>
              <Button size="sm" onClick={handlePdfMonthsConfirm} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">PDF erstellen</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}