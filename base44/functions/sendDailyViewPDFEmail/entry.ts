import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { jsPDF } from 'npm:jspdf@4.0.0';

const ONEDRIVE_FOLDER = 'Tageseinteilung';

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const isEmployeeOvernight = (employee, weekStartStr, dateStr) => {
  if (!employee) return false;
  if (employee.friday_exceptions?.includes(dateStr)) return false;
  if (employee.overnight_stay) return true;

  // Wochentags-Index: 0=Mo ... 4=Fr
  const d = new Date(dateStr);
  const dayIndex = (d.getDay() + 6) % 7;

  if (employee.overnight_stay_days?.length > 0) {
    const entry = employee.overnight_stay_days.find(e => e.week_start === weekStartStr);
    if (entry && entry.days?.length > 0) {
      return entry.days.includes(dayIndex);
    }
  }
  if (employee.overnight_stay_weeks?.length > 0) {
    return employee.overnight_stay_weeks.includes(weekStartStr);
  }
  return false;
};

const getMonday = (dateStr) => {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
};

const getDisplayName = (emp) => {
  if (!emp) return null;
  if (emp.employee_type === 'azubi') {
    const last = emp.full_name?.split(' ').pop() || '';
    return `${last}${emp.apprentice_year || ''}`;
  }
  return emp.full_name || null;
};

const getWeekNumber = (dateStr) => {
  const d = new Date(dateStr);
  const startOfYear = new Date(d.getFullYear(), 0, 1);
  const startDay = startOfYear.getDay() || 7;
  const startOfFirstWeek = new Date(startOfYear);
  if (startDay > 4) startOfFirstWeek.setDate(startOfYear.getDate() + (8 - startDay));
  else startOfFirstWeek.setDate(startOfYear.getDate() + (1 - startDay));
  const diff = d - startOfFirstWeek;
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.ceil(diff / oneWeek) + 1;
};

// ── PDF-Generierung (vollständig, identisch mit DailyViewPDF.jsx) ─────────────

const generatePDF = ({ selectedDateStr, assignments, employees, projects, vehicles, includeAbsences, futureAssignments = [] }) => {
  const SHOW_END_DATE_TYPES = ['urlaub', 'krank', 'beurlaubung'];

  const getAbsenceEndDate = (employeeId, absenceType) => {
    let last = selectedDateStr;
    let d = new Date(selectedDateStr);
    while (true) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      const nextStr = d.toISOString().slice(0, 10);
      const found = futureAssignments.some(a => a.employee_id === employeeId && a.assignment_type === absenceType && a.date === nextStr);
      if (found) last = nextStr;
      else break;
    }
    return last === selectedDateStr ? null : last;
  };
  const empMap = {};
  employees.forEach(e => empMap[e.id] = e);
  const projMap = {};
  projects.forEach(p => projMap[p.id] = p);

  const weekStart = getMonday(selectedDateStr);
  const isFriday = new Date(selectedDateStr).getDay() === 5;

  const getEmployee = (id) => empMap[id] || null;
  const getVehicle = () => null; // Fahrzeuge werden per assignment_vehicle aufgelöst

  // Fahrzeug-Lookup aus Assignments selbst (vehicle_id ist auf Assignment)
  const vehicleIds = new Set(assignments.filter(a => a.vehicle_id).map(a => a.vehicle_id));
  // Wir haben keine Vehicle-Tabelle hier – Kennzeichen müssen wir separat laden
  // → Fahrzeuge werden als vehicle_plate gespeichert falls vorhanden, sonst leer
  // Da wir Vehicles nicht geladen haben, geben wir vehicle_id als Platzhalter zurück
  // (Backend lädt Vehicles separat)

  const dateAssignments = assignments.filter(a => a.date === selectedDateStr);

  // Gruppierung
  const groupedByProject = {};
  dateAssignments
    .filter(a => a.assignment_type === 'baustelle' && a.project_id && a.project_id !== 'workshop')
    .forEach(a => {
      const proj = projMap[a.project_id];
      if (!proj || proj.is_ef_project) return;
      if (!groupedByProject[a.project_id]) {
        groupedByProject[a.project_id] = {
          project: proj,
          assignments: [],
          departureTime: proj.default_departure_time || null,
          workStartTime: proj.default_work_start_time || null,
          workEndTime: proj.default_work_end_time || null,
        };
      }
      groupedByProject[a.project_id].assignments.push(a);
      if (a.departure_time && !groupedByProject[a.project_id].departureTime) {
        groupedByProject[a.project_id].departureTime = a.departure_time;
      }
    });

  const sortByPL = (a, b) => {
    const plA = a.project?.project_leader_id ? (empMap[a.project.project_leader_id]?.abbreviation || '') : '';
    const plB = b.project?.project_leader_id ? (empMap[b.project.project_leader_id]?.abbreviation || '') : '';
    return plA.localeCompare(plB) || (a.project?.name || '').localeCompare(b.project?.name || '');
  };

  const allGroups = Object.values(groupedByProject);

  // Platzhalter: is_supervisor=true → Übernachtung, sonst → Tagesdienst
  const hasOvernightPerson = (g) => !isFriday && g.assignments.some(a => {
    if (!a.employee_id) return !!a.notes && !!a.is_supervisor;
    const emp = getEmployee(a.employee_id);
    return emp && !emp.is_ef && isEmployeeOvernight(emp, weekStart, selectedDateStr);
  });

  const hasDayPerson = (g) => g.assignments.some(a => {
    if (!a.employee_id) return !!a.notes && !a.is_supervisor;
    const emp = getEmployee(a.employee_id);
    return emp && !emp.is_ef && !isEmployeeOvernight(emp, weekStart, selectedDateStr);
  });

  // Übernachtung: alle Projekte (inkl. TS) mit Übernachtungspersonal
  const projectsWithOvernight = allGroups.filter(g =>
    g.project && hasOvernightPerson(g)
  ).sort(sortByPL);

  // TS: nur TS-Projekte mit Tagespersonal oder Platzhaltern
  const projectsTS = allGroups.filter(g =>
    g.project?.is_ts_project && hasDayPerson(g)
  ).sort(sortByPL);

  // Ohne Übernachtung: nicht-TS mit Tagespersonal oder Platzhaltern
  const projectsWithoutOvernight = allGroups.filter(g =>
    g.project && !g.project.is_ts_project && hasDayPerson(g)
  ).sort(sortByPL);

  const workshopAssignments = dateAssignments.filter(a =>
    a.assignment_type === 'baustelle' && a.project_id === 'workshop'
  );

  const absenceTypes = [
    { key: 'beurlaubung', label: 'Beurlaubung' },
    { key: 'urlaub', label: 'Urlaub' },
    { key: 'schule', label: 'Berufsschule' },
    { key: 'pruefung', label: 'Prüfung' },
    { key: 'tbz', label: 'TBZ' },
    { key: 'krank', label: 'Krank' },
  ];

  const absenceRows = includeAbsences
    ? absenceTypes.map(({ key, label }) => ({
        key, label,
        assignments: dateAssignments.filter(a => {
          if (a.assignment_type !== key) return false;
          const emp = getEmployee(a.employee_id);
          return emp && !emp.is_ef;
        }),
      }))
    : [];

  // ── PDF aufbauen ──────────────────────────────────────────────────────────
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const contentW = pageWidth - margin * 2;

  const allProjects = [...projectsWithOvernight, ...projectsWithoutOvernight, ...projectsTS];

  let maxPlAbbr = '', maxDepTime = '', maxWorkTime = '';
  allProjects.forEach(group => {
    const project = group.project;
    if (!project) return;
    const pl = project.project_leader_id ? empMap[project.project_leader_id] : null;
    const abbr = pl?.abbreviation || pl?.full_name?.charAt(0) || '-';
    if (abbr.length > maxPlAbbr.length) maxPlAbbr = abbr;
    if (group.departureTime?.length > maxDepTime.length) maxDepTime = group.departureTime;
    const wStr = (group.workStartTime || '?') + '-' + (group.workEndTime || '?');
    if (wStr.length > maxWorkTime.length) maxWorkTime = wStr;
  });

  pdf.setFontSize(9);
  pdf.setFont(undefined, 'bold');
  const colPL = pdf.getTextWidth(maxPlAbbr) + 0.5;
  const colAb = pdf.getTextWidth(maxDepTime || '00:00') + 0.5;
  const azHalf = (maxWorkTime || '00:00').split('-')[0] + '-';
  const colAZ = pdf.getTextWidth(azHalf) + 1;

  const MAX_BAU_WIDTH = 65;
  pdf.setFontSize(9.5);
  pdf.setFont(undefined, 'bold');
  let maxBauLineWidth = 0;
  allProjects.forEach(g => {
    if (g.project?.name) {
      const lines = pdf.splitTextToSize(g.project.name, MAX_BAU_WIDTH);
      lines.forEach(line => {
        const w = pdf.getTextWidth(line);
        if (w > maxBauLineWidth) maxBauLineWidth = w;
      });
    }
  });
  const colBau = Math.max(Math.min(maxBauLineWidth + 2, MAX_BAU_WIDTH), 40);
  const colFzg = 28;
  const colMont = contentW - colPL - colAb - colAZ - colBau - colFzg;

  let y = margin;

  // Header
  const d = new Date(selectedDateStr);
  const days = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const dayShort = days[d.getDay()];
  const dayFull = `${d.getDate()}. ${months[d.getMonth()]} ${d.getFullYear()}`;
  const kw = getWeekNumber(selectedDateStr);

  pdf.setFontSize(20);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${dayShort} ${dayFull}`, pageWidth / 2, y + 9, { align: 'center' });
  pdf.setFontSize(12);
  pdf.setTextColor(30, 58, 95);
  pdf.text('LENIGER', pageWidth - margin, y + 5, { align: 'right' });
  pdf.setFontSize(7);
  pdf.setFont(undefined, 'bold');
  pdf.setTextColor(0, 0, 0);
  pdf.text(`${kw}. KW`, pageWidth - margin, y + 14, { align: 'right' });

  y += 16;
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.4);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 2;

  // Fahrzeug-Lookup aufbauen (Kennzeichen + Sitze für Farbgebung)
  const vehicleMap = {};
  (vehicles || []).forEach(v => { vehicleMap[v.id] = v; });

  // Tabellen-Header
  const drawTableHeader = () => {
    pdf.setFontSize(7.5);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.setFillColor(30, 58, 95);
    const headers = [
      { label: 'PL', w: colPL },
      { label: 'Abfahrt', w: colAb },
      { label: 'A.Z.', w: colAZ },
      { label: 'Baustelle', w: colBau },
      { label: 'Monteur u. Helfer', w: colMont },
      { label: 'Fahrzeuge', w: colFzg },
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

  // ── Vorberechnung Spaltenbreiten ─────────────────────────────────────────
  const colWidthsPerPos = [];
  const empTypePrio = (emp) => {
    if (!emp) return 99;
    if (emp.employee_type === 'monteur') return 0;
    if (emp.employee_type === 'azubi') return 1;
    if (emp.employee_type === 'praktikant') return 2;
    return 3;
  };
  const computeNameObjs = (group, isOvernight) => {
    const relevant = group.assignments.filter(a => {
      if (!a.employee_id) {
        if (!a.notes) return false;
        return isOvernight ? !!a.is_supervisor : !a.is_supervisor;
      }
      if (isOvernight) {
        if (isFriday) return false;
        const emp = getEmployee(a.employee_id);
        return emp && isEmployeeOvernight(emp, weekStart, selectedDateStr);
      } else {
        const emp = getEmployee(a.employee_id);
        return emp && !isEmployeeOvernight(emp, weekStart, selectedDateStr);
      }
    });
    if (relevant.length === 0) return [];
    const sorted = [...relevant].sort((a, b) => {
      if (!a.employee_id && !b.employee_id) return 0;
      if (!a.employee_id) return 1;
      if (!b.employee_id) return -1;
      const empA = empMap[a.employee_id];
      const empB = empMap[b.employee_id];
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

  pdf.setFontSize(9.5);
  [
    ...projectsWithOvernight.map(g => ({ g, isOvernight: true })),
    ...projectsWithoutOvernight.map(g => ({ g, isOvernight: false })),
    ...projectsTS.map(g => ({ g, isOvernight: false })),
  ].forEach(({ g, isOvernight }) => {
    computeNameObjs(g, isOvernight).forEach((n, i) => {
      const bold = n.isAzubi || n.isSupervisor;
      pdf.setFont(undefined, bold ? 'bold' : 'italic');
      const w = pdf.getTextWidth(n.text + '   ');
      if (colWidthsPerPos[i] === undefined || w > colWidthsPerPos[i]) colWidthsPerPos[i] = w;
    });
  });

  const drawRow = (group, isOvernight) => {
    const project = group.project;
    if (!project) return;
    const pl = project.project_leader_id ? empMap[project.project_leader_id] : null;
    const plAbbr = pl?.abbreviation || pl?.full_name?.charAt(0) || '-';

    const nameObjs = computeNameObjs(group, isOvernight);
    if (nameObjs.length === 0) return;

    const vIds = [...new Set(group.assignments.filter(a => a.vehicle_id && (isOvernight
      ? (a.employee_id && isEmployeeOvernight(getEmployee(a.employee_id), weekStart, selectedDateStr))
      : true
    )).map(a => a.vehicle_id))];

    // Baustellenname umbrechen
    const lineH = 5.5;
    const maxRowWidth = colMont - 2;
    pdf.setFontSize(9.5);
    pdf.setFont(undefined, 'normal');
    const bLines = pdf.splitTextToSize(project.name || '', colBau - 2);
    const bLineCount = Math.min(bLines.length, 4);

    // Spaltenanzahl pro Zeile bestimmen
    let cols = 1;
    { let w = 0;
      for (let i = 0; i < colWidthsPerPos.length; i++) {
        w += (colWidthsPerPos[i] || 0);
        if (w <= maxRowWidth) cols = i + 1;
        else break;
      }
    }
    // Namen in Zeilen aufteilen
    const nameRows = [];
    for (let i = 0; i < nameObjs.length; i += cols) nameRows.push(nameObjs.slice(i, i + cols));

    const contentRows = Math.max(nameRows.length, vIds.length, bLineCount);
    const rowH = Math.max(7, contentRows * lineH + 1);

    pdf.setFontSize(8);
    pdf.setDrawColor(150, 150, 150);
    let x = margin;

    pdf.setFont(undefined, 'bold');
    pdf.rect(x, y, colPL, rowH);
    pdf.text(plAbbr, x + colPL / 2, y + rowH / 2 + 1, { align: 'center' });
    x += colPL;

    pdf.rect(x, y, colAb, rowH);
    if (group.departureTime) {
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(9);
      pdf.text(group.departureTime, x + colAb / 2, y + rowH / 2 + 1, { align: 'center' });
      pdf.setFontSize(8);
    }
    x += colAb;

    pdf.setFont(undefined, 'normal');
    pdf.rect(x, y, colAZ, rowH);
    if (group.workStartTime || group.workEndTime) {
      pdf.setFontSize(9);
      pdf.text(`${group.workStartTime || '?'}-`, x + colAZ / 2, y + rowH / 2 - 0.8, { align: 'center' });
      pdf.text(group.workEndTime || '?', x + colAZ / 2, y + rowH / 2 + 3, { align: 'center' });
      pdf.setFontSize(8);
    }
    x += colAZ;

    // Baustelle – mehrzeilig, oben ausgerichtet
    pdf.setFontSize(9.5);
    pdf.setFont(undefined, 'bold');
    pdf.rect(x, y, colBau, rowH);
    const bauStartY = y + 4;
    bLines.slice(0, 4).forEach((line, li) => {
      pdf.text(line, x + 1, bauStartY + li * lineH);
    });
    pdf.setFont(undefined, 'normal');
    x += colBau;

    // Monteure – untereinander, mit fixen Spaltenbreiten pro Position
    pdf.setFontSize(9.5);
    pdf.rect(x, y, colMont, rowH);
    const nameStartY = y + 4;
    nameRows.forEach((row, ri) => {
      let nx = x + 1;
      row.forEach((n, ci) => {
        const bold = n.isAzubi || n.isSupervisor || n.isPlaceholder;
        pdf.setFont(undefined, bold ? 'bold' : 'italic');
        pdf.setTextColor(0, 0, 0);
        pdf.text(n.text, nx, nameStartY + ri * lineH);
        nx += colWidthsPerPos[ri * cols + ci] || pdf.getTextWidth(n.text + ' ');
      });
    });
    pdf.setTextColor(0, 0, 0);
    pdf.setFont(undefined, 'normal');
    x += colMont;

    // Fahrzeuge – oben ausgerichtet
    pdf.rect(x, y, colFzg, rowH);
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(7.5);
    const fzgStartY = y + 4;
    vIds.forEach((vid, vi) => {
      const veh = vehicleMap[vid];
      const plate = veh?.license_plate || vid;
      if (plate) {
        pdf.setTextColor(veh?.seats >= 6 ? 220 : 0, veh?.seats >= 6 ? 38 : 0, veh?.seats >= 6 ? 38 : 0);
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
    pdf.setFillColor(...bgColor);
    pdf.rect(margin, y, contentW, rowH, 'FD');
    pdf.text(label, margin + 2, y + 3.2);
    y += rowH;
    pdf.setFont(undefined, 'normal');
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(0, 0, 0);
  };

  const drawAbsenceSection = () => {
    if (absenceRows.length === 0) return;
    y += 2;
    pdf.setLineWidth(0.3);
    pdf.setDrawColor(0, 0, 0);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 2;

    absenceRows.forEach(({ key, label, assignments: abs }) => {
      const showEnd = SHOW_END_DATE_TYPES.includes(key);
      const names = abs.map(a => {
        const emp = getEmployee(a.employee_id);
        const baseName = getDisplayName(emp);
        if (!baseName) return null;
        if (showEnd) {
          const endDate = getAbsenceEndDate(a.employee_id, key);
          if (endDate) {
            const ed = new Date(endDate);
            return `${baseName} (${ed.getDate()}.${ed.getMonth() + 1}.)`;
          }
        }
        return baseName;
      }).filter(Boolean).join('  ');
      const rowH = 5.5;
      pdf.setFontSize(7);
      pdf.setDrawColor(150, 150, 150);
      let x = margin;
      pdf.rect(x, y, colPL, rowH); x += colPL;
      pdf.rect(x, y, colAb, rowH); x += colAb;
      pdf.rect(x, y, colAZ, rowH); x += colAZ;
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

  drawTableHeader();

  if (projectsWithOvernight.length > 0) {
    drawSectionHeader('Mit Übernachtung', [220, 232, 255]);
    projectsWithOvernight.forEach(g => drawRow(g, true));
  }
  if (projectsWithoutOvernight.length > 0) {
    drawSectionHeader('Ohne Übernachtung', [240, 240, 240]);
    projectsWithoutOvernight.forEach(g => drawRow(g, false));
  }
  if (projectsTS.length > 0) {
    drawSectionHeader('TS', [252, 231, 243]);
    // TS mit Übernachtung erscheint bereits unter "Mit Übernachtung" – hier nur Tagespersonal
    projectsTS.forEach(g => drawRow(g, false));
  }
  if (workshopAssignments.length > 0) {
    const rowH = 5.5;
    pdf.setDrawColor(150, 150, 150);
    pdf.setTextColor(0, 0, 0);
    const wsGreen = [220, 252, 231];
    let x = margin;
    pdf.setFillColor(...wsGreen); pdf.rect(x, y, colPL, rowH, 'FD'); x += colPL;
    pdf.setFillColor(...wsGreen); pdf.rect(x, y, colAb, rowH, 'FD'); x += colAb;
    pdf.setFillColor(...wsGreen); pdf.rect(x, y, colAZ, rowH, 'FD'); x += colAZ;
    pdf.setFillColor(...wsGreen); pdf.rect(x, y, colBau, rowH, 'FD');
    pdf.setFontSize(9.5);
    pdf.setFont(undefined, 'bold');
    pdf.text('WERKSTATT', x + 1, y + 3.8);
    x += colBau;
    pdf.setFillColor(255, 255, 255); pdf.rect(x, y, colMont, rowH, 'FD');
    pdf.setFont(undefined, 'italic');
    const wsNames = workshopAssignments.map(a => getDisplayName(getEmployee(a.employee_id))).filter(Boolean).join('  ');
    pdf.text(wsNames, x + 1, y + 3.8);
    x += colMont;
    pdf.setFillColor(255, 255, 255); pdf.rect(x, y, colFzg, rowH, 'FD');
    y += rowH;
    pdf.setDrawColor(0, 0, 0);
    pdf.setFont(undefined, 'normal');
  }

  drawAbsenceSection();

  // Footer
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  pdf.setFontSize(6.5);
  pdf.setFont(undefined, 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);
  pdf.text(`Plotzeit: ${hh}:${mm}`, margin, pageHeight - 4);
  pdf.text(`EINTEILUNG ${selectedDateStr}.xlsm`, pageWidth - margin, pageHeight - 4, { align: 'right' });

  return pdf.output('arraybuffer');
};

// ── OneDrive Helpers ──────────────────────────────────────────────────────────

async function clearOneDriveFolder(accessToken) {
  // Alle Dateien im Ordner auflisten
  const listUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${ONEDRIVE_FOLDER}:/children`;
  const listRes = await fetch(listUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!listRes.ok) return; // Ordner existiert noch nicht – nichts zu löschen

  const listData = await listRes.json();
  const items = listData.value || [];

  // Alle Einträge löschen
  await Promise.allSettled(
    items.map(item =>
      fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${item.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
    )
  );
}

async function uploadToOneDrive(accessToken, fileName, pdfBuffer) {
  // Ordner sicherstellen
  const folderUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${ONEDRIVE_FOLDER}`;
  const folderCheck = await fetch(folderUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!folderCheck.ok) {
    await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ONEDRIVE_FOLDER, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' }),
    });
  }

  const uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${ONEDRIVE_FOLDER}/${fileName}:/content`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/pdf' },
    body: pdfBuffer,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    throw new Error(`OneDrive Upload fehlgeschlagen: ${err}`);
  }

  const data = await uploadRes.json();
  return data.webUrl || null;
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { emails, selectedDate } = await req.json();

    console.log('Empfänger:', JSON.stringify(emails));
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return Response.json({ error: 'Keine E-Mail-Adressen angegeben' }, { status: 400 });
    }
    if (!selectedDate) {
      return Response.json({ error: 'Kein Datum angegeben' }, { status: 400 });
    }

    // Daten laden
    const [assignmentsData, employeesData, projectsData, vehiclesData] = await Promise.all([
      base44.entities.Assignment.filter({ date: selectedDate }),
      base44.entities.Employee.list(),
      base44.entities.Project.list(),
      base44.entities.Vehicle.list(),
    ]);

    // Future-Assignments für Abwesenheits-Enddatum (nächste 30 Werktage)
    const absenceEmployeeIds = new Set(
      assignmentsData
        .filter(a => ['urlaub', 'krank', 'beurlaubung'].includes(a.assignment_type))
        .map(a => a.employee_id)
    );
    let futureAssignments = [];
    if (absenceEmployeeIds.size > 0) {
      const futureDates = [];
      const dBase = new Date(selectedDate);
      for (let i = 1; i <= 30; i++) {
        const fd = new Date(dBase);
        fd.setDate(fd.getDate() + i);
        if (fd.getDay() !== 0 && fd.getDay() !== 6) {
          futureDates.push(fd.toISOString().slice(0, 10));
        }
      }
      const futureResults = await Promise.all(
        futureDates.map(date => base44.entities.Assignment.filter({ date }))
      );
      futureAssignments = futureResults.flat();
    }

    const d = new Date(selectedDate);
    const dateFormatted = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    const fileName = `Tageseinteilung_${selectedDate}.pdf`;

    // 1) PDF OHNE Abwesenheiten → OneDrive (für Hallendisplay)
    const pdfNoAbsences = generatePDF({
      selectedDateStr: selectedDate,
      assignments: assignmentsData,
      employees: employeesData,
      projects: projectsData,
      vehicles: vehiclesData,
      includeAbsences: false,
      futureAssignments,
    });

    // 2) PDF MIT Abwesenheiten → als öffentliche Datei hochladen → Link per E-Mail
    const pdfWithAbsences = generatePDF({
      selectedDateStr: selectedDate,
      assignments: assignmentsData,
      employees: employeesData,
      projects: projectsData,
      vehicles: vehiclesData,
      includeAbsences: true,
      futureAssignments,
    });

    // PDF ohne Abwesenheiten → OneDrive (für Hallendisplay)
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('one_drive');
    // Ordner vor dem Upload leeren
    await clearOneDriveFolder(accessToken);
    const oneDriveResult = await Promise.allSettled([
      uploadToOneDrive(accessToken, fileName, pdfNoAbsences),
    ]);
    const oneDriveUrl = oneDriveResult[0].status === 'fulfilled' ? oneDriveResult[0].value : null;
    if (oneDriveResult[0].status === 'rejected') console.error('OneDrive Upload fehlgeschlagen:', oneDriveResult[0].reason);

    // PDF mit Abwesenheiten → als File-Objekt via SDK hochladen → Link per E-Mail
    const emailFileUrl = await (async () => {
      const file = new File([pdfWithAbsences], `Tageseinteilung_${selectedDate}.pdf`, { type: 'application/pdf' });
      const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      console.log('Upload result:', JSON.stringify(result));
      return result?.file_url || null;
    })();

    const emailBody = emailFileUrl
      ? `Tageseinteilung für den ${dateFormatted}\n\nPDF herunterladen (mit Abwesenheiten):\n${emailFileUrl}\n\nMit freundlichen Grüßen\nLeniger`
      : `Tageseinteilung für den ${dateFormatted}\n\nMit freundlichen Grüßen\nLeniger`;

    const emailResults = await Promise.allSettled(
      emails.map(email =>
        base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: `Tageseinteilung ${dateFormatted}`,
          body: emailBody,
        })
      )
    );

    emailResults.forEach((r, i) => {
      console.log(`E-Mail ${emails[i]}: ${r.status}`, r.status === 'rejected' ? r.reason?.message : r.value);
    });
    const sentCount = emailResults.filter(r => r.status === 'fulfilled').length;

    return Response.json({
      success: true,
      message: `PDF ohne Abwesenheiten in OneDrive gespeichert. PDF mit Abwesenheiten an ${sentCount} Empfänger per E-Mail versendet.`,
      recipients: sentCount,
      oneDriveUrl,
      oneDriveFolder: ONEDRIVE_FOLDER,
      fileName,
      emailFileUrl,
    });
  } catch (error) {
    console.error('Error in sendDailyViewPDFEmail:', error);
    return Response.json({ error: error.message || 'Fehler beim Versenden' }, { status: 500 });
  }
});