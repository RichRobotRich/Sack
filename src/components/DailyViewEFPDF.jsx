import { jsPDF } from 'jspdf';
import { format, getWeek, startOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';

const SHOW_END_DATE_TYPES = ['urlaub', 'krank', 'beurlaubung'];

const isEmployeeOvernight = (employee, date) => {
  if (!employee) return false;
  const dateStr = format(date, 'yyyy-MM-dd');
  if (employee.friday_exceptions?.includes(dateStr)) return false;
  if (employee.overnight_stay) return true;

  const weekMon = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const dayIndex = (date.getDay() + 6) % 7; // 0=Mo, 4=Fr

  if (employee.overnight_stay_days?.length > 0) {
    const entry = employee.overnight_stay_days.find(e => e.week_start === weekMon);
    if (entry && entry.days?.length > 0) {
      return entry.days.includes(dayIndex);
    }
  }
  if (employee.overnight_stay_weeks?.length > 0) {
    return employee.overnight_stay_weeks.includes(weekMon);
  }
  return false;
};

/**
 * Generiert eine PDF im Leniger-Stil für die Aushang-EF-Seite.
 */
export const generateDailyViewEFPDF = ({
  selectedDate,
  projectsWithOvernight,
  projectsWithoutOvernight,
  absenceRows,
  allEmployees,
  employees,
  getEmployee,
  getVehicle,
  isFriday,
  getAbsenceEndDate,
}) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin     = 8;
  const contentW   = pageWidth - margin * 2;

  // ── Dynamische Spaltenbreiten ────────────────────────────────────────
  const allProjects = [
    ...projectsWithOvernight,
    ...projectsWithoutOvernight
  ];
  
  let maxPlAbbr = '';
  let maxDepTime = '';
  let maxWorkTime = '';
  
  allProjects.forEach(group => {
    const project = group.project;
    if (!project) return;
    const projectLeader = project.project_leader_id
      ? allEmployees.find(e => e.id === project.project_leader_id)
      : null;
    const plAbbr = projectLeader?.abbreviation || projectLeader?.full_name?.charAt(0) || '-';
    if (plAbbr.length > maxPlAbbr.length) maxPlAbbr = plAbbr;
    if (group.departureTime && group.departureTime.length > maxDepTime.length) maxDepTime = group.departureTime;
    const workStr = (group.workStartTime || '?') + '-' + (group.workEndTime || '?');
    if (workStr.length > maxWorkTime.length) maxWorkTime = workStr;
  });

  pdf.setFontSize(9);
  pdf.setFont(undefined, 'bold');
  const plWidth = pdf.getTextWidth(maxPlAbbr) + 0.5;
  const abWidth = pdf.getTextWidth(maxDepTime || '00:00') + 0.5;
  const azHalf = (maxWorkTime || '00:00').split('-')[0] + '-';
  const azWidth = pdf.getTextWidth(azHalf) + 1;

  const MAX_BAU_WIDTH = 65;
  pdf.setFontSize(9.5);
  pdf.setFont(undefined, 'bold');
  let maxBauLineWidth = 0;
  allProjects.forEach(group => {
    const project = group.project;
    if (project?.name) {
      const lines = pdf.splitTextToSize(project.name, MAX_BAU_WIDTH);
      lines.forEach(line => {
        const w = pdf.getTextWidth(line);
        if (w > maxBauLineWidth) maxBauLineWidth = w;
      });
    }
  });
  const bauWidth = Math.min(maxBauLineWidth + 2, MAX_BAU_WIDTH);

  const colPL   = plWidth;
  const colAb   = abWidth;
  const colAZ   = azWidth;
  const colBau  = Math.max(bauWidth, 40);
  const colFzg  = 28;
  const colMont = contentW - colPL - colAb - colAZ - colBau - colFzg;

  let y = margin;

  // ── HEADER ────────────────────────────────────────────────────────────
  const kw = getWeek(selectedDate, { weekStartsOn: 1, firstWeekContainsDate: 4 });
  const dayShort = format(selectedDate, 'EEE', { locale: de });
  const dayFull  = format(selectedDate, "d. MMMM yyyy", { locale: de });

  pdf.setFontSize(20);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${dayShort} ${dayFull}`, pageWidth / 2, y + 7, { align: 'center' });

  pdf.setFontSize(14);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${kw}. KW`, pageWidth - margin, y + 7, { align: 'right' });

  y += 10;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 2;

  // ── Tabellen-Header ───────────────────────────────────────────────────
  const drawTableHeader = () => {
    pdf.setFontSize(7.5);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.setFillColor(30, 58, 95);
    pdf.setDrawColor(100, 100, 100);

    const headers = [
      { label: 'PL',                w: colPL   },
      { label: 'Abfahrt',           w: colAb   },
      { label: 'A.Z.',              w: colAZ   },
      { label: 'Baustelle',         w: colBau  },
      { label: 'Monteur u. Helfer', w: colMont },
      { label: 'Fahrzeuge',         w: colFzg  },
    ];

    let x = margin;
    headers.forEach(({ label, w }) => {
      pdf.setFillColor(30, 58, 95);
      pdf.setDrawColor(30, 58, 95);
      pdf.rect(x, y, w, 6, 'FD');
      pdf.setTextColor(255, 255, 255);
      pdf.text(label, x + w / 2, y + 4, { align: 'center' });
      x += w;
    });
    y += 6;
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.1);
    pdf.setTextColor(0, 0, 0);
  };

  // ── Hilfsfunktionen ───────────────────────────────────────────────────
  const getDisplayName = (emp) => {
    if (!emp) return null;
    if (emp.employee_type === 'azubi') {
      const last = emp.full_name?.split(' ').pop() || '';
      return `${last}${emp.apprentice_year || ''}`;
    }
    return emp.full_name || null;
  };

  // ── Vorberechnung: Spaltenbreiten pro Position ──────────────────────
  const colWidthsPerPos = [];

  const computeNameObjs = (group, isOvernight) => {
    const relevantAssignments = group.assignments.filter(a => {
      if (!a.employee_id) {
        if (!a.notes) return false;
        return isOvernight ? !!a.is_supervisor : !a.is_supervisor;
      }
      if (isOvernight) {
        if (isFriday) return false;
        const emp = getEmployee(a.employee_id);
        return emp && isEmployeeOvernight(emp, selectedDate);
      } else {
        const emp = getEmployee(a.employee_id);
        return emp && !isEmployeeOvernight(emp, selectedDate);
      }
    });
    if (relevantAssignments.length === 0) return [];

    const empTypePrio = (emp) => {
      if (!emp) return 99;
      if (emp.employee_type === 'monteur') return 0;
      if (emp.employee_type === 'azubi') return 1;
      if (emp.employee_type === 'praktikant') return 2;
      return 3;
    };
    const sorted = [...relevantAssignments].sort((a, b) => {
      if (!a.employee_id && !b.employee_id) return 0;
      if (!a.employee_id) return 1;
      if (!b.employee_id) return -1;
      const empA = getEmployee(a.employee_id);
      const empB = getEmployee(b.employee_id);
      const pA = empTypePrio(empA);
      const pB = empTypePrio(empB);
      if (pA !== pB) return pA - pB;
      return (empA?.full_name || '').localeCompare(empB?.full_name || '');
    });

    return sorted.map(a => {
      if (!a.employee_id && a.notes) return { text: a.notes, isSupervisor: false, isAzubi: false };
      const emp = getEmployee(a.employee_id);
      const name = getDisplayName(emp);
      if (!name) return null;
      return { text: name, isSupervisor: a.is_supervisor, isAzubi: emp?.employee_type === 'azubi' };
    }).filter(Boolean);
  };

  const allGroupsWithNames = [
    ...projectsWithOvernight.map(g => ({ g, isOvernight: true })),
    ...projectsWithoutOvernight.map(g => ({ g, isOvernight: false })),
  ];

  pdf.setFontSize(9.5);
  allGroupsWithNames.forEach(({ g, isOvernight }) => {
    const names = computeNameObjs(g, isOvernight);
    names.forEach((n, i) => {
      const bold = n.isAzubi || n.isSupervisor;
      pdf.setFont(undefined, bold ? 'bold' : 'italic');
      const w = pdf.getTextWidth(n.text + '   ');
      if (colWidthsPerPos[i] === undefined || w > colWidthsPerPos[i]) {
        colWidthsPerPos[i] = w;
      }
    });
  });

  const drawRow = (group, isOvernight) => {
    const project = group.project;
    if (!project) return;

    const projectLeader = project.project_leader_id
      ? allEmployees.find(e => e.id === project.project_leader_id)
      : null;
    const plAbbr = projectLeader?.abbreviation || projectLeader?.full_name?.charAt(0) || '-';

    const nameObjs = computeNameObjs(group, isOvernight);
    if (nameObjs.length === 0) return;

    const vehicleIds = Array.from(new Set(
      group.assignments
        .filter(a => a.vehicle_id && (isOvernight
          ? (isFriday ? false : isEmployeeOvernight(getEmployee(a.employee_id), selectedDate))
          : !isEmployeeOvernight(getEmployee(a.employee_id), selectedDate)))
        .map(a => a.vehicle_id)
    ));

    pdf.setFontSize(9.5);
    pdf.setFont(undefined, 'normal');
    const bLines = pdf.splitTextToSize(project.name || '', colBau - 2);
    const bLineCount = Math.min(bLines.length, 4);

    const lineH = 5.5;
    const maxRowWidth = colMont - 2;

    let cols = 1;
    {
      let w = 0;
      for (let i = 0; i < colWidthsPerPos.length; i++) {
        w += (colWidthsPerPos[i] || 0);
        if (w <= maxRowWidth) cols = i + 1;
        else break;
      }
    }

    const nameRows = [];
    for (let i = 0; i < nameObjs.length; i += cols) {
      nameRows.push(nameObjs.slice(i, i + cols));
    }

    const contentRows = Math.max(nameRows.length, vehicleIds.length, bLineCount);
    const rowH = Math.max(7, contentRows * lineH + 1);

    pdf.setFontSize(8);
    pdf.setDrawColor(150, 150, 150);
    let x = margin;

    // PL
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.rect(x, y, colPL, rowH);
    pdf.text(plAbbr, x + colPL / 2, y + rowH / 2 + 1, { align: 'center' });
    x += colPL;

    // Abfahrt
    pdf.rect(x, y, colAb, rowH);
    if (group.departureTime) {
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(9);
      pdf.text(group.departureTime, x + colAb / 2, y + rowH / 2 + 1, { align: 'center' });
      pdf.setFontSize(8);
    }
    x += colAb;

    // Arbeitszeit
    pdf.setFont(undefined, 'normal');
    pdf.rect(x, y, colAZ, rowH);
    if (group.workStartTime || group.workEndTime) {
      pdf.setFontSize(9);
      pdf.text(`${group.workStartTime || '?'}-`, x + colAZ / 2, y + rowH / 2 - 0.8, { align: 'center' });
      pdf.text(group.workEndTime || '?',         x + colAZ / 2, y + rowH / 2 + 3,   { align: 'center' });
      pdf.setFontSize(8);
    }
    x += colAZ;

    // Baustelle
    pdf.setFontSize(9.5);
    pdf.setFont(undefined, 'bold');
    pdf.rect(x, y, colBau, rowH);
    const bauStartY = y + 4;
    bLines.slice(0, 4).forEach((line, li) => {
      pdf.text(line, x + 1, bauStartY + li * lineH);
    });
    // Unterkunft
    if (project.accommodation_name || project.accommodation_address) {
      const accText = [project.accommodation_name, project.accommodation_address].filter(Boolean).join(', ');
      pdf.setFont(undefined, 'italic');
      pdf.setFontSize(6);
      const accLines = pdf.splitTextToSize(accText, colBau - 2);
      pdf.text(accLines[0], x + 0.5, bauStartY + bLineCount * lineH);
    }
    pdf.setFont(undefined, 'normal');
    x += colBau;

    // Monteure
    pdf.setFontSize(9.5);
    pdf.rect(x, y, colMont, rowH);
    const nameStartY = y + 4;
    nameRows.forEach((row, ri) => {
      let nx = x + 1;
      row.forEach((n, ci) => {
        const bold = n.isAzubi || n.isSupervisor;
        pdf.setFont(undefined, bold ? 'bold' : 'italic');
        pdf.setTextColor(0, 0, 0);
        pdf.text(n.text, nx, nameStartY + ri * lineH);
        nx += colWidthsPerPos[ri * cols + ci] || pdf.getTextWidth(n.text + ' ');
      });
    });
    pdf.setTextColor(0, 0, 0);
    pdf.setFont(undefined, 'normal');
    x += colMont;

    // Fahrzeuge
    pdf.rect(x, y, colFzg, rowH);
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(7.5);
    const fzgStartY = y + 4;
    vehicleIds.forEach((id, vi) => {
      const vehicle = getVehicle(id);
      const plate = vehicle?.license_plate || '';
      if (plate) {
        pdf.setTextColor(vehicle?.seats >= 6 ? 220 : 0, vehicle?.seats >= 6 ? 38 : 0, vehicle?.seats >= 6 ? 38 : 0);
        pdf.text(plate, x + colFzg / 2, fzgStartY + vi * lineH, { align: 'center' });
      }
    });
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(8);

    y += rowH;
    pdf.setDrawColor(0, 0, 0);
    pdf.setFont(undefined, 'normal');
  };

  const drawSectionHeader = (label, bgColor = [240, 240, 240]) => {
    const rowH = 4.5;
    pdf.setFontSize(7.5);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.setDrawColor(150, 150, 150);
    let x = margin;
    pdf.setFillColor(...bgColor);
    pdf.rect(x, y, contentW, rowH, 'FD');
    pdf.text(label, x + 2, y + 3.2);
    y += rowH;
    pdf.setFont(undefined, 'normal');
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(0, 0, 0);
  };

  const drawAbsenceSection = () => {
    if (!absenceRows || absenceRows.length === 0) return;
    y += 2;
    pdf.setLineWidth(0.3);
    pdf.setDrawColor(0, 0, 0);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 2;

    absenceRows.forEach(({ key, label, assignments: abs }) => {
      if (abs.length === 0 && label !== 'Urlaub' && label !== 'Beurlaubung' && label !== 'Krank' && label !== 'Prüfung' && label !== 'TBZ' && label !== 'Berufsschule') return;

      const showEndDate = SHOW_END_DATE_TYPES.includes(key) && !!getAbsenceEndDate;
      const names = abs.map(a => {
        const emp = getEmployee(a.employee_id);
        const baseName = getDisplayName(emp);
        if (!baseName) return null;
        if (showEndDate) {
          const endDate = getAbsenceEndDate(a.employee_id, key);
          return endDate ? `${baseName} (${format(new Date(endDate), 'd.M.')})` : baseName;
        }
        return baseName;
      }).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')).join('  ');

      const rowH = 5.5;
      pdf.setFontSize(7);
      pdf.setDrawColor(150, 150, 150);

      let x = margin;
      pdf.rect(x, y, colPL,  rowH); x += colPL;
      pdf.rect(x, y, colAb,  rowH); x += colAb;
      pdf.rect(x, y, colAZ,  rowH); x += colAZ;

      pdf.rect(x, y, colBau, rowH);
      pdf.setFont(undefined, 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(label.toUpperCase(), x + 1, y + 3.8);
      x += colBau;

      pdf.rect(x, y, colMont, rowH);
      pdf.setFont(undefined, 'italic');
      if (names) pdf.text(pdf.splitTextToSize(names, colMont - 2)[0], x + 1, y + 3.8);
      x += colMont;

      pdf.rect(x, y, colFzg, rowH);

      y += rowH;
      pdf.setDrawColor(0, 0, 0);
      pdf.setFont(undefined, 'normal');
    });
  };

  // ── Inhalt rendern ────────────────────────────────────────────────────
  drawTableHeader();

  if (projectsWithOvernight.length > 0) {
    drawSectionHeader('Mit Übernachtung', [220, 232, 255]);
    projectsWithOvernight.forEach(g => drawRow(g, true));
  }

  if (projectsWithoutOvernight.length > 0) {
    drawSectionHeader('Ohne Übernachtung', [240, 240, 240]);
    projectsWithoutOvernight.forEach(g => drawRow(g, false));
  }

  drawAbsenceSection();

  // ── Footer ────────────────────────────────────────────────────────────
  const now = new Date();
  pdf.setFontSize(6.5);
  pdf.setFont(undefined, 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);
  pdf.text(`Plotzeit: ${format(now, 'HH:mm')}`, margin, pageHeight - 4);
  const fileName = `AUSHANG_EF ${format(selectedDate, 'yyyy.MM.dd')}`;
  pdf.text(fileName, pageWidth - margin, pageHeight - 4, { align: 'right' });

  pdf.save(`AUSHANG_EF_${format(selectedDate, 'yyyyMMdd')}.pdf`);
};