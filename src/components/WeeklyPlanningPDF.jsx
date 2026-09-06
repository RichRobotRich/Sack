import jsPDF from 'jspdf';
import { format, addDays, addWeeks, getWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { toast } from 'sonner';
import { isPublicHoliday, getPublicHolidayName } from '../utils/publicHolidays';

export const generateWeeklyPlanningPDF = ({
  weekStart,
  projects,
  normalProjects,
  tsProjects,
  efProjects,
  assignments,
  employees,
  absenceTypes,
  getProjectLeaderAbbreviation,
  getAssignmentsForCell,
  getAbsenceAssignments,
  getEmployee,
  countOvernightStaff,
  getCommentForProjectOnMonday,
  getTempWorkersForCell,
  getAbsenceEndDate,
  cellInfos = [],
  isOvernightForWeek: isOvernightForWeekProp,
  isOvernightOnDay: isOvernightOnDayProp,
  isFridayException: isFridayExceptionProp,
  isEF = false,
  poolSplitIndex,
  bridgeDays = new Set(), // Set of 'yyyy-MM-dd' strings
}) => {
  const SHOW_END_DATE_TYPES = ['urlaub', 'krank', 'beurlaubung'];
  try {
    const pdf = new jsPDF('l', 'mm', 'a3');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    
    const margin = 2;
    
    const weekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

    const nextWeekMondayRaw = addWeeks(weekStart, 1);
    let nextWeekMonday = nextWeekMondayRaw;
    while (isPublicHoliday(nextWeekMonday, isEF ? 'TH' : 'NRW')) {
      nextWeekMonday = addDays(nextWeekMonday, 1);
    }
    const nextWeekDays = Array.from({ length: 5 }, (_, i) => addDays(nextWeekMonday, i));

    // Spaltenbreiten mit 6.8pt messen
    pdf.setFontSize(6.8);
    pdf.setFont(undefined, 'bold');

    // PL-Spalte: breitestes Kürzel
    const allPlAbbrs = projects.map(p => getProjectLeaderAbbreviation(p.id) || '-');
    const maxPlWidth = allPlAbbrs.reduce((max, abbr) => Math.max(max, pdf.getTextWidth(abbr)), pdf.getTextWidth('PL'));
    const plColWidth = maxPlWidth + 0.5;

    // Baustellen-Spalte (links): breitester Projektname
    const maxNameWidth = projects.reduce((max, p) => Math.max(max, pdf.getTextWidth((p.name || '').substring(0, 45))), pdf.getTextWidth('Baustelle'));
    const nameColWidth = maxNameWidth + 0.5;

    // Rechte Baustellenspalte (infoBau): breitester Projektname (max 14 Zeichen)
    const maxInfoBauWidth = projects.reduce((max, p) => Math.max(max, pdf.getTextWidth((p.name || '').substring(0, 14))), pdf.getTextWidth('Baustelle'));
    const infoBauColWidth = maxInfoBauWidth + 0.5;

    // Ü-Spalte: breitester Tagessatz wie "0-1-1-1-2" (9pt normal)
    pdf.setFont(undefined, 'normal');
    const overnightColWidth = Math.max(
      pdf.getTextWidth('Ü'),
      ...projects.map(p => pdf.getTextWidth(weekDays.map(d => countOvernightStaff(p.id, d)).join('-'))),
      ...projects.map(p => pdf.getTextWidth(nextWeekDays.map(d => countOvernightStaff(p.id, d)).join('-')))
    ) + 0.3;

    // Fertig-Spalte: breitester Fertig-Text (9pt normal)
    const maxFinishWidth = projects.reduce((max, p) => {
      if (!p.completion_date_text) return max;
      return Math.max(max, pdf.getTextWidth(p.completion_date_text));
    }, 0);
    const infoSmallColWidth = maxFinishWidth > 0 ? maxFinishWidth + 0.3 : pdf.getTextWidth('Fertig') + 0.3;

    // Obermonteur-Spalte: breitester Name (9pt normal)
    const maxOMWidth = projects.reduce((max, p) => {
      if (!p.lead_assembler) return max;
      return Math.max(max, pdf.getTextWidth(p.lead_assembler.substring(0, 18)));
    }, pdf.getTextWidth('Oberm.'));
    const infoOMColWidth = maxOMWidth + 0.5;

    const fixedWidths = plColWidth * 2 + nameColWidth + overnightColWidth * 2 + infoSmallColWidth + infoOMColWidth + infoBauColWidth;
    const availableForDays = (pageWidth - margin * 2) - fixedWidths;
    const dayColWidth = Math.floor((availableForDays / 6) * 10) / 10;

    const colWidths = {
      pl: plColWidth,
      name: nameColWidth,
      overnight: overnightColWidth,
      day: dayColWidth,
      infoSmall: infoSmallColWidth,
      infoOM: infoOMColWidth,
      infoBau: infoBauColWidth,
    };
    
    let y = margin;
    
    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(6);
    const now = new Date();
    const location = isEF ? 'Erfurt' : 'Paderborn';
    const createdText = `${location} – Erstellt: ${format(now, 'dd.MM.yyyy HH:mm')} Uhr`;
    const createdTextWidth = pdf.getTextWidth(createdText);
    pdf.text(createdText, pageWidth - margin - createdTextWidth, y + 3.5);
    pdf.setFont(undefined, 'bold');
    pdf.setFontSize(8);
    
    y += 2;
    
    pdf.setFontSize(6);
    pdf.setFont(undefined, 'bold');
    
    let x = margin;
    
    // Feiertags-Logik
    const holidayState = isEF ? 'TH' : 'NRW';
    const isMondayHoliday = isPublicHoliday(weekStart, holidayState);
    
    // isOvernightForWeek: wochenbasierte Übernachtungslogik
    const isOvernightForWeek = (emp, mondayDate) => {
      if (isOvernightForWeekProp) return isOvernightForWeekProp(emp, mondayDate);
      if (!emp) return false;
      const mondayStr = format(mondayDate, 'yyyy-MM-dd');
      if (emp.overnight_stay_weeks && emp.overnight_stay_weeks.length > 0) {
        return emp.overnight_stay_weeks.includes(mondayStr);
      }
      return emp.overnight_stay === true;
    };

    // Ermittelt den Montag eines Datums
    const getMondayOf = (day) => {
      const d = new Date(day);
      const dow = d.getDay();
      const diff = dow === 0 ? -6 : 1 - dow;
      d.setDate(d.getDate() + diff);
      return d;
    };

    // Gibt zurück ob Mitarbeiter an einem konkreten Tag auf Montage ist (taggenau)
    const isOvernightOnDay = isOvernightOnDayProp || ((emp, day) => {
      if (!emp) return false;
      const mondayOfDay = getMondayOf(day);
      const mondayStr = format(mondayOfDay, 'yyyy-MM-dd');
      const entry = emp.overnight_stay_days?.find(e => e.week_start === mondayStr);
      if (!entry) {
        // Kein day-Eintrag → Legacy: Mo-Do
        if (!isOvernightForWeek(emp, mondayOfDay)) return false;
        const dow = day.getDay() === 0 ? 6 : day.getDay() - 1; // 0=Mo,...,4=Fr
        return dow <= 3;
      }
      const dow = day.getDay() === 0 ? 6 : day.getDay() - 1;
      return entry.days.includes(dow);
    });

    const shouldHideEmployee = (emp, day) => {
      if (emp.employee_type === 'buerokraft') return true;
      if (emp.employee_type === 'lagerist') return true;
      if (isPublicHoliday(day, holidayState)) return true;
      const mondayOfDay = getMondayOf(day);
      if (!isOvernightForWeek(emp, mondayOfDay)) return false;
      // Taggenau prüfen ob Mitarbeiter an diesem Tag auf Montage ist
      const entry = emp.overnight_stay_days?.find(e => e.week_start === format(mondayOfDay, 'yyyy-MM-dd'));
      if (entry) {
        const dow = day.getDay() === 0 ? 6 : day.getDay() - 1; // 0=Mo,...,4=Fr
        if (entry.days.includes(dow)) return false; // Er ist auf Montage → zeigen
        // Freitags-Ausnahme: Fr. arbeitet
        if (dow === 4) {
          const dayStr = format(day, 'yyyy-MM-dd');
          const hasException = isFridayExceptionProp 
            ? isFridayExceptionProp(emp, day) 
            : (emp.friday_exceptions || []).includes(dayStr);
          if (hasException) return false;
        }
        return true; // Nicht auf Montage an diesem Tag → ausblenden
      }
      // Legacy-Verhalten: Freitag ausblenden außer Ausnahme/Feiertag
      const isFriday = day.getDay() === 5;
      const dayStr = format(day, 'yyyy-MM-dd');
      const hasFridayException = isFridayExceptionProp 
        ? isFridayExceptionProp(emp, day)
        : (emp.friday_exceptions || []).includes(dayStr);
      if (isFriday && !isMondayHoliday && !hasFridayException) return true;
      return false;
    };

    // Sortiert Assignments wie im TableBody: Übernachtungs-Monteure → Übernachtungs-Azubis → Monteure → Azubis → Praktikanten → Rest
    const sortAssignmentsForPDF = (assignmentList, day) => {
      const mondayOfDay = (() => {
        const d = new Date(day);
        const dow = d.getDay();
        const diff = dow === 0 ? -6 : 1 - dow;
        d.setDate(d.getDate() + diff);
        return d;
      })();
      const typeOrder = (emp) => {
        if (!emp) return 99;
        const overnight = isOvernightForWeek(emp, mondayOfDay);
        if (overnight && emp.employee_type === 'monteur') return 0;
        if (overnight && emp.employee_type === 'azubi') return 1;
        if (emp.employee_type === 'monteur') return 2;
        if (emp.employee_type === 'azubi') return 3;
        if (emp.employee_type === 'praktikant') return 4;
        return 5;
      };
      return [...assignmentList].sort((a, b) => {
        if (!a.employee_id && a.notes) return 1;
        if (!b.employee_id && b.notes) return -1;
        const empA = getEmployee(a.employee_id);
        const empB = getEmployee(b.employee_id);
        const orderDiff = typeOrder(empA) - typeOrder(empB);
        if (orderDiff !== 0) return orderDiff;
        return (empA?.full_name || '').localeCompare(empB?.full_name || '', 'de');
      });
    };
    
    const isDayOff = (day) => isPublicHoliday(day, holidayState) || bridgeDays.has(format(day, 'yyyy-MM-dd'));
    const isDayHoliday = isDayOff; // alias used throughout
    
    // Header-Zeile (einzeilig, KW + Tag + Datum kombiniert)
    const hdrH = 5;
    const currentWeek = getWeek(weekStart); // für pdf.save Dateiname

    pdf.rect(x, y, colWidths.pl, hdrH);
    pdf.text('PL', x + 0.5, y + 3.5);
    x += colWidths.pl;
    
    pdf.rect(x, y, colWidths.name, hdrH);
    pdf.text('Baustelle', x + 1, y + 3.5);
    x += colWidths.name;
    
    pdf.rect(x, y, colWidths.overnight, hdrH);
    const uWidth = pdf.getTextWidth('Ü');
    pdf.text('Ü', x + (colWidths.overnight - uWidth) / 2, y + 3.5);
    x += colWidths.overnight;
    
    const currentKW = getWeek(weekStart, { weekStartsOn: 1, firstWeekContainsDate: 4 });
    const nextKW = getWeek(nextWeekMonday, { weekStartsOn: 1, firstWeekContainsDate: 4 });

    weekDays.forEach((day) => {
      const holidayName = getPublicHolidayName(day, holidayState);
      const isBridge = bridgeDays.has(format(day, 'yyyy-MM-dd'));
      if (holidayName) {
        pdf.setFillColor(254, 215, 170);
        pdf.rect(x, y, colWidths.day, hdrH, 'F');
        pdf.setTextColor(194, 65, 12);
      } else if (isBridge) {
        pdf.setFillColor(187, 247, 208);
        pdf.rect(x, y, colWidths.day, hdrH, 'F');
        pdf.setTextColor(22, 101, 52);
      }
      pdf.rect(x, y, colWidths.day, hdrH);
      const dayLabel = format(day, 'EEE d.M.', { locale: de });
      const isMonday = day.getDay() === 1;
      const kwLabel = isMonday ? ` (KW ${currentKW})` : '';
      const shortHoliday = holidayName ? (holidayName.length > 8 ? holidayName.substring(0, 7) + '.' : holidayName) : '';
      const cellLabel = holidayName ? `${dayLabel} (${shortHoliday})` : isBridge ? `${dayLabel} (Brückentag)` : `${dayLabel}${kwLabel}`;
      pdf.text(cellLabel, x + 1, y + 3.5);
      if (holidayName || isBridge) pdf.setTextColor(0, 0, 0);
      x += colWidths.day;
    });
    
    pdf.setLineWidth(0.6);
    pdf.line(x, y, x, y + hdrH);
    pdf.setLineWidth(0.1);
    pdf.rect(x, y, colWidths.day, hdrH);
    pdf.text(`${format(nextWeekMonday, 'EEE', { locale: de })} ${format(nextWeekMonday, 'd.M.', { locale: de })} (KW ${nextKW})`, x + 1, y + 3.5);
    x += colWidths.day;
    
    const infoColumns = [
      { label: 'Ü', width: colWidths.overnight },
      { label: 'Fertig', width: colWidths.infoSmall },
      { label: 'Oberm.', width: colWidths.infoOM },
      { label: 'Baustelle', width: colWidths.infoBau },
      { label: 'PL', width: colWidths.pl }
    ];
    infoColumns.forEach(col => {
      pdf.rect(x, y, col.width, hdrH);
      pdf.text(col.label, x + 0.5, y + 3.5);
      x += col.width;
    });
    
    y += hdrH;
    const startY = y;
    
    pdf.setFont(undefined, 'normal');
    pdf.setFontSize(9);
    pdf.setLineWidth(0.2);
    const lineHeight = 4.5;
    const rowPadding = 0.2;
    const minRowHeight = lineHeight + rowPadding;
    const absenceRowPadding = 1.0;
    
    const NAMES_PER_ROW = 4;

    // Smart-Grid: 4 Spalten, Namen die breiter sind überspannen mehrere Spalten, Umbruch bei Überlauf
    const smartGridCountLines = (nameDataArray, cellWidth) => {
      if (nameDataArray.length === 0) return 1;
      const subCellW = cellWidth / NAMES_PER_ROW;
      let col = 0;
      let rows = 1;
      nameDataArray.forEach(nameData => {
        const nameWidth = pdf.getTextWidth(nameData.name);
        const fits = nameWidth <= subCellW - 1;
        if (!fits) {
          const neededCols = Math.ceil((nameWidth + 1) / subCellW);
          if (col + neededCols > NAMES_PER_ROW) { col = 0; rows++; }
          col += neededCols;
        } else {
          if (col >= NAMES_PER_ROW) { col = 0; rows++; }
          col++;
        }
        if (col >= NAMES_PER_ROW) { col = 0; rows++; }
      });
      return rows;
    };

    // Rendert Namen im Smart-Grid: 4 Spalten, breite Namen überspannen mehrere Spalten
    const renderSmartGrid = (nameDataArray, cellX, cellY, cellHeight, cellWidth, drawBg = false, isEFProject = false) => {
      if (nameDataArray.length === 0) return;
      const subCellW = cellWidth / NAMES_PER_ROW;
      const textStartY = cellY + scaledLineHeight * 0.85;
      let col = 0;
      let row = 0;

      nameDataArray.forEach((nameData) => {
        pdf.setFont(undefined, nameData.isAzubi ? 'bold' : 'normal');
        if (nameData.isPlaceholder) {
          pdf.setTextColor(234, 88, 12);
          pdf.setFont(undefined, 'bold');
        } else if (nameData.isIndependent) {
          pdf.setTextColor(126, 34, 206);
        } else if (nameData.isTempWorker) {
          pdf.setTextColor(29, 78, 216);
        } else if (nameData.isPraktikant) {
          pdf.setTextColor(22, 163, 74);
        } else {
          pdf.setTextColor(0, 0, 0);
        }

        const nameWidth = pdf.getTextWidth(nameData.name);
        const fits = nameWidth <= subCellW - 1;

        if (!fits) {
          const neededCols = Math.ceil((nameWidth + 1) / subCellW);
          if (col + neededCols > NAMES_PER_ROW) { col = 0; row++; }
          const xPos = cellX + 1 + col * subCellW;
          const yPos = textStartY + row * scaledLineHeight;
          if (drawBg && nameData.isOvernight && !isEFProject) {
            pdf.setFillColor(254, 202, 202);
            pdf.rect(xPos, yPos - scaledLineHeight * 0.75, nameWidth, scaledLineHeight, 'F');
          }
          pdf.text(nameData.name, xPos, yPos);
          col += neededCols;
        } else {
          if (col >= NAMES_PER_ROW) { col = 0; row++; }
          const xPos = cellX + 1 + col * subCellW;
          const yPos = textStartY + row * scaledLineHeight;
          if (drawBg && nameData.isOvernight && !isEFProject) {
            pdf.setFillColor(254, 202, 202);
            pdf.rect(xPos, yPos - scaledLineHeight * 0.75, nameWidth, scaledLineHeight, 'F');
          }
          pdf.text(nameData.name, xPos, yPos);
          col++;
        }

        if (col >= NAMES_PER_ROW) { col = 0; row++; }
      });

      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(0, 0, 0);
    };

    // Grid-Wrapping (4 pro Zeile, einfaches Layout für Legacy-Verwendung)
    const wrapNames = (nameDataArray, maxWidth) => {
      if (nameDataArray.length === 0) return [];
      const lines = [];
      for (let i = 0; i < nameDataArray.length; i += NAMES_PER_ROW) {
        lines.push(nameDataArray.slice(i, i + NAMES_PER_ROW));
      }
      return lines;
    };

    // Smart-Grid-Rendering für Pool/Workshop/Abwesenheiten
    const renderSmartGridScaled = (nameDataArray, cellX, cellY, cellHeight, maxWidth) => {
      renderSmartGrid(nameDataArray, cellX, cellY, cellHeight, maxWidth, false, false);
    };
    
    const calculateRowHeight = (project, days, nextMonday) => {
       let maxLines = 1;

       const getCommentForDay = (day) => {
         const isMonday = day.getDay() === 1;
         if (!isMonday || !getCommentForProjectOnMonday) return null;
         return getCommentForProjectOnMonday(project.id, day);
       };

       days.forEach(day => {
         if (isDayHoliday(day)) return;
         const dateStr = format(day, 'yyyy-MM-dd');
         const projectComment = getCommentForDay(day);
         const cellInfo = cellInfos.find(ci => ci.project_id === project.id && ci.date === dateStr && ci.show_in_pdf);

         const cellAssignments = getAssignmentsForCell(project.id, day);
          const empData = cellAssignments
            .map(a => {
              if (!a.employee_id && a.notes) return { name: `* ${a.notes}`, isAzubi: false };
              const emp = getEmployee(a.employee_id);
              if (!emp) return null;
              if (shouldHideEmployee(emp, day)) return null;
              let name = emp.employee_type === 'azubi'
                ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
                : emp.full_name;
              if (a.notes) name = name + ' (' + a.notes + ')';
              return { name, isAzubi: emp.employee_type === 'azubi', isPraktikant: emp.employee_type === 'praktikant' };
              })
              .filter(Boolean);

          const hasNames = empData.length > 0;
          const hasComment = projectComment;
          const hasInfo = cellInfo;

          // Zähle Zeilen anhand Flow-Wrapping (wie beim Rendern)
          const cellContentWidth = colWidths.day - 2;
          let cellLines = 1;
          if (hasNames) {
            cellLines = smartGridCountLines(empData, cellContentWidth);
            if (hasComment || hasInfo) cellLines += 1;
          } else if (hasComment || hasInfo) {
            cellLines = 1;
          }

          maxLines = Math.max(maxLines, cellLines);
         });

         const nextMondayAssignments = getAssignmentsForCell(project.id, nextMonday);
         const nextMondayData = nextMondayAssignments
          .map(a => {
            if (!a.employee_id && a.notes) return { name: `* ${a.notes}`, isAzubi: false };
            const emp = getEmployee(a.employee_id);
            if (!emp) return null;
            let name = emp.employee_type === 'azubi'
              ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
              : emp.full_name;
            if (a.notes) name = name + ' (' + a.notes + ')';
            return { name, isAzubi: emp.employee_type === 'azubi' };
          })
          .filter(Boolean);

         const nextMondayComment = getCommentForDay(nextMonday);
         let nextMondayLines = 0;
         if (nextMondayData.length > 0) {
          const cellContentWidth = colWidths.day - 2;
          nextMondayLines = smartGridCountLines(nextMondayData, cellContentWidth);
          if (nextMondayComment) nextMondayLines += 1;
         } else if (nextMondayComment) {
          nextMondayLines = 1;
         }
         maxLines = Math.max(maxLines, nextMondayLines);

         return Math.max(minRowHeight, maxLines * lineHeight + rowPadding);
     };
    
    const getLeaderColorRGB = (abbreviation) => {
      const colors = [
        { r: 59, g: 130, b: 246 },
        { r: 16, g: 185, b: 129 },
        { r: 168, g: 85, b: 247 },
        { r: 249, g: 115, b: 22 },
        { r: 236, g: 72, b: 153 },
        { r: 99, g: 102, b: 241 },
        { r: 20, g: 184, b: 166 },
        { r: 6, g: 182, b: 212 },
        { r: 139, g: 92, b: 246 },
        { r: 217, g: 70, b: 239 }
      ];
      if (!abbreviation) return { r: 107, g: 114, b: 128 };
      const charSum = abbreviation.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
      return colors[charSum % colors.length];
    };
    
    const projectsBeforeWorkshop = [...normalProjects, ...tsProjects];
    const projectsAfterWorkshop = [...efProjects];

    // Pool-Mitarbeiter
    const getPoolEmployees = (day) => {
      if (isDayHoliday(day)) return [];
      const dateStr = format(day, 'yyyy-MM-dd');
      const assignedEmployeeIds = new Set();
      assignments.forEach(a => {
        if (a.date === dateStr) assignedEmployeeIds.add(a.employee_id);
      });
      return employees.filter(emp => {
        if (!emp.is_active) return false;
        // EF-Modus: nur EF-Mitarbeiter im Pool; NRW-Modus: keine EF-Mitarbeiter
        if (isEF ? !emp.is_ef : emp.is_ef) return false;
        if (emp.employee_type === 'projektleiter') return false;
        if (assignedEmployeeIds.has(emp.id)) return false;
        if (shouldHideEmployee(emp, day)) return false;
        return true;
      });
    };

    // splitIndex: aus übergebenem poolSplitIndex oder Standard nach dem 3. unterschiedlichen PL
    let splitIndex = poolSplitIndex;
    if (splitIndex === undefined || splitIndex === null) {
      splitIndex = 0;
      const seen = new Set();
      for (let i = 0; i < projectsBeforeWorkshop.length; i++) {
        const plAbbr = getProjectLeaderAbbreviation(projectsBeforeWorkshop[i].id) || '-';
        seen.add(plAbbr);
        if (seen.size === 3) {
          splitIndex = i + 1;
          while (splitIndex < projectsBeforeWorkshop.length &&
                 (getProjectLeaderAbbreviation(projectsBeforeWorkshop[splitIndex].id) || '-') === plAbbr) {
            splitIndex++;
          }
          break;
        }
      }
    }

    // Alle Zeilenhöhen vorberechnen
    // WICHTIG: Fontgröße auf 9 setzen damit wrapNames (pdf.getTextWidth) korrekte Breiten misst
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'normal');
    const computeAllRowHeights = () => {
      const allRows = [];
      
      projectsBeforeWorkshop.slice(0, splitIndex).forEach(p => {
        allRows.push({ type: 'project', data: p, height: calculateRowHeight(p, weekDays, nextWeekMonday) });
      });
      
      let poolMaxLines = 1;
      const cellW = colWidths.day - 2;
      [...weekDays, nextWeekMonday].forEach(day => {
        const poolEmps = getPoolEmployees(day);
        const empData = poolEmps.map(emp => {
          let name = emp.employee_type === 'azubi'
            ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
            : emp.full_name;
          if (emp.remark) name = name + ' (' + emp.remark + ')';
          return { name, isAzubi: emp.employee_type === 'azubi' };
        });
        poolMaxLines = Math.max(poolMaxLines, smartGridCountLines(empData, cellW));
      });
      allRows.push({ type: 'pool', height: Math.max(minRowHeight * 3, poolMaxLines * lineHeight + rowPadding) });
      
      projectsBeforeWorkshop.slice(splitIndex).forEach(p => {
        allRows.push({ type: 'project', data: p, height: calculateRowHeight(p, weekDays, nextWeekMonday) });
      });
      
      let workshopMaxLines = 1;
      const wsCellW = colWidths.day - 2;
      [...weekDays, nextWeekMonday].forEach(day => {
        if (isDayHoliday(day)) return;
        const wsAssignments = getAssignmentsForCell('workshop', day);
        const empData = wsAssignments.map(a => {
          const emp = getEmployee(a.employee_id);
          if (!emp) return null;
          let name = emp.full_name;
          if (a.notes) name = name + ' (' + a.notes + ')';
          return { name, isAzubi: emp.employee_type === 'azubi' };
        }).filter(Boolean);
        workshopMaxLines = Math.max(workshopMaxLines, smartGridCountLines(empData, wsCellW));
      });
      allRows.push({ type: 'workshop', height: Math.max(minRowHeight, workshopMaxLines * lineHeight + rowPadding) });
      
      projectsAfterWorkshop.forEach(p => {
        allRows.push({ type: 'project', data: p, height: calculateRowHeight(p, weekDays, nextWeekMonday) });
      });
      
      absenceTypes.forEach(({ key, label }) => {
        // Prüfen ob irgendwo Mitarbeiter vorhanden – sonst Zeile überspringen
        const hasAnyAbsence = [...weekDays, nextWeekMonday].some(day => {
          if (isDayHoliday(day)) return false;
          return getAbsenceAssignments(key, day).length > 0;
        });
        if (!hasAnyAbsence) return;

        let absenceMaxLines = 1;
        const showEnd = SHOW_END_DATE_TYPES.includes(key) && !!getAbsenceEndDate;
        const cellWidth = colWidths.day - 2;
        const subCellW = cellWidth / NAMES_PER_ROW;

        const countAbsenceLines = (empData) => {
          if (empData.length === 0) return 1;
          let col = 0;
          let rows = 1;
          empData.forEach(nameData => {
            const nameWidth = pdf.getTextWidth(nameData.name);
            const fits = nameWidth <= subCellW - 1;
            if (!fits) {
              const neededCols = Math.ceil((nameWidth + 1) / subCellW);
              if (col + neededCols > NAMES_PER_ROW) { col = 0; rows++; }
              col += neededCols;
            } else {
              if (col >= NAMES_PER_ROW) { col = 0; rows++; }
              col++;
            }
            if (col >= NAMES_PER_ROW) { col = 0; rows++; }
          });
          return rows;
        };

        [...weekDays, nextWeekMonday].forEach(day => {
          if (isDayHoliday(day)) return;
          const absences = getAbsenceAssignments(key, day);
          const empData = absences.map(a => {
            const emp = getEmployee(a.employee_id);
            if (!emp) return null;
            const baseName = emp.employee_type === 'azubi'
              ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
              : emp.full_name;
            const dayStr = format(day, 'yyyy-MM-dd');
            const endDate = showEnd ? getAbsenceEndDate(emp.id, key, dayStr) : null;
            const name = endDate ? `${baseName} (${format(new Date(endDate), 'd.M.')})` : baseName;
            return { name, isAzubi: emp.employee_type === 'azubi', hasEndDate: !!endDate };
          }).filter(Boolean).sort((a, b) => {
            const nameA = a.name.split(' (')[0];
            const nameB = b.name.split(' (')[0];
            return nameA.localeCompare(nameB, 'de');
          });
          absenceMaxLines = Math.max(absenceMaxLines, countAbsenceLines(empData));
        });
        allRows.push({ type: 'absence', key, label, height: absenceMaxLines * lineHeight + absenceRowPadding });
      });
      
      return allRows;
    };

    // Erste Schätzung der Skalierung mit 9pt
    const allRowsEstimate = computeAllRowHeights();
    const totalContentHeightEstimate = allRowsEstimate.reduce((sum, row) => sum + row.height, 0);
    const availableHeight = pageHeight - margin - startY;
    const scaleFactorEstimate = totalContentHeightEstimate > availableHeight ? availableHeight / totalContentHeightEstimate : 1;
    const scaledFontSizeEstimate = 9 * scaleFactorEstimate;

    // Zweiter Durchgang mit der echten skalierten Fontgröße für präzise Zeilenhöhen
    pdf.setFontSize(scaledFontSizeEstimate);
    pdf.setFont(undefined, 'normal');
    const allRows = computeAllRowHeights();
    const totalContentHeight = allRows.reduce((sum, row) => sum + row.height, 0);
    const scaleFactor = totalContentHeight > availableHeight ? availableHeight / totalContentHeight : 1;
    const scaledRows = allRows.map(row => ({ ...row, height: row.height * scaleFactor }));
    const scaledLineHeight = lineHeight * scaleFactor;
    const scaledFontSize = 9 * scaleFactor;
    if (scaleFactor < 1) {
      pdf.setFontSize(scaledFontSize);
    }

    // Rendert Namen in einem Excel-artigen Grid: 4 Spalten à (cellWidth/4), linksbündig + vertikal mittig
    const renderNamesGrid = (nameDataArray, cellX, cellY, cellHeight, cellWidth, drawSubCells = false) => {
      const lines = wrapNames(nameDataArray, cellWidth);
      if (lines.length === 0) return;

      const subCellW = cellWidth / NAMES_PER_ROW;
      const totalTextHeight = lines.length * scaledLineHeight;
      const textStartY = cellY + scaledLineHeight * 0.85;

      lines.forEach((lineNames, lineIdx) => {
        const yPos = textStartY + lineIdx * scaledLineHeight;
        lineNames.forEach((nameData, nameIdx) => {
          const subCellX = cellX + nameIdx * subCellW;

          // Optionale Zell-Trennlinien (für Projekt-Tageszellen)
          if (drawSubCells && nameIdx > 0) {
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.1);
            pdf.line(subCellX, cellY, subCellX, cellY + cellHeight);
            pdf.setDrawColor(0, 0, 0);
          }

          pdf.setFont(undefined, nameData.isAzubi ? 'bold' : 'normal');
          if (nameData.isPlaceholder) {
            pdf.setTextColor(234, 88, 12);
            pdf.setFont(undefined, 'bold');
          } else if (nameData.isIndependent) {
            pdf.setTextColor(126, 34, 206);
          } else if (nameData.isTempWorker) {
            pdf.setTextColor(29, 78, 216);
          } else if (nameData.isPraktikant) {
            pdf.setTextColor(22, 163, 74);
          } else {
            pdf.setTextColor(0, 0, 0);
          }
          pdf.text(nameData.name, subCellX + 1, yPos);
        });
      });

      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(0, 0, 0);
    };

    // Rückwärtskompatible Alias für Pool/Workshop/Abwesenheiten
    const renderNamesInCellScaled = (nameDataArray, cellX, cellY, cellHeight, maxWidth) => {
      renderNamesGrid(nameDataArray, cellX, cellY, cellHeight, maxWidth, false);
    };

    let rowIndex = 0;
    const nextRow = () => scaledRows[rowIndex++];

    // Funktion zum Rendern eines Projekts (ohne PL-Spalte links)
    const renderProject = (project, rowHeight, isEFProject = false) => {
      const plAbbr = getProjectLeaderAbbreviation(project.id) || '-';
      const leaderColor = getLeaderColorRGB(plAbbr);
      x = margin + colWidths.pl; // PL-Spalte überspringen (wird separat gezeichnet)
      
      pdf.rect(x, y, colWidths.name, rowHeight);
      const projectName = project.name || '';
      const nameFontSize = scaledFontSize * 1.15;
      // Kommentar für dieses Projekt (ab aktuellem Montag)
      const projectComment = getCommentForProjectOnMonday ? getCommentForProjectOnMonday(project.id, weekStart) : null;
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(nameFontSize);
      pdf.text(projectName, x + 1, y + rowHeight / 2 + 1);
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(scaledFontSize);
      x += colWidths.name;
      
      const overnightStr = weekDays.map(d => countOvernightStaff(project.id, d)).join('-');
      if (!/^0-0-0-0-0$/.test(overnightStr) && !isEFProject) {
       pdf.setFillColor(254, 202, 202); // rot hinterlegt
       pdf.rect(x, y, colWidths.overnight, rowHeight, 'FD');
      } else {
       pdf.rect(x, y, colWidths.overnight, rowHeight);
      }
      if (!/^0-0-0-0-0$/.test(overnightStr)) {
       const numWidth = pdf.getTextWidth(overnightStr);
       pdf.text(overnightStr, x + (colWidths.overnight - numWidth) / 2, y + rowHeight / 2 + 1);
      }
      x += colWidths.overnight;
      
      weekDays.forEach(day => {
        if (isDayHoliday(day)) {
          const isBridgeDay = bridgeDays.has(format(day, 'yyyy-MM-dd'));
          if (isBridgeDay) {
            pdf.setFillColor(187, 247, 208); // grün für Brückentag
          } else {
            pdf.setFillColor(255, 237, 213); // orange-100 für Feiertag
          }
          pdf.rect(x, y, colWidths.day, rowHeight, 'F');
        }
        pdf.rect(x, y, colWidths.day, rowHeight);
        if (!isDayHoliday(day)) {
         const dayStr = format(day, 'yyyy-MM-dd');
         const isMonday = day.getDay() === 1;
         const cellInfo = cellInfos.find(ci => ci.project_id === project.id && ci.date === dayStr && ci.show_in_pdf);
         const cellAssignments = sortAssignmentsForPDF(getAssignmentsForCell(project.id, day), day);
         const empData = cellAssignments
           .map(a => {
             if (!a.employee_id && a.notes) {
               return { name: `* ${a.notes}`, isAzubi: false, isPraktikant: false, isPlaceholder: true };
             }
             const emp = getEmployee(a.employee_id);
             if (!emp) return null;
             if (shouldHideEmployee(emp, day)) return null;
             let name = emp.employee_type === 'azubi'
               ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
               : emp.full_name;
             if (a.notes) name = name + ' (' + a.notes + ')';
             return { name, isAzubi: emp.employee_type === 'azubi', isPraktikant: emp.employee_type === 'praktikant', isIndependent: !!emp.is_independent, isOvernight: isOvernightOnDay(emp, day) };
           })
           .filter(Boolean);
         if (getTempWorkersForCell) {
           const tempWorkers = getTempWorkersForCell(project.id, day);
           tempWorkers.forEach(tw => empData.push({ name: tw.full_name, isAzubi: false, isTempWorker: true }));
         }

         const hasNames = empData.length > 0;
         const dayComment = day.getDay() === 1 && getCommentForProjectOnMonday 
           ? getCommentForProjectOnMonday(project.id, day) 
           : null;
         const hasComment = dayComment;
         const hasInfo = cellInfo;

         // Berechne verfügbare Breite für Inhalte
         const cellContentWidth = colWidths.day - 2;

         if (hasNames) {
           const lines = smartGridCountLines(empData, cellContentWidth);
           const startY = y + scaledLineHeight * 0.85;

           // Namen im Smart-Grid rendern (4 Spalten, breite Namen überspannen mehrere)
           renderSmartGrid(empData, x, y, rowHeight, cellContentWidth, true, isEFProject);

           // Kommentar/Info unterhalb der Namen
            if (hasComment || hasInfo) {
              const infoLineY = startY + lines * scaledLineHeight;
              let infoX = x + 1;
              if (hasComment) {
                pdf.setFontSize(scaledFontSize * 1.1);
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(34, 197, 94);
                const commentText = dayComment.text.substring(0, 25);
                pdf.text(commentText, infoX, infoLineY);
                infoX += pdf.getTextWidth(commentText) + 2;
              }
              if (hasInfo) {
               const availableWidth = (x + colWidths.day) - infoX;
               if (availableWidth > 15) {
                 pdf.setFontSize(scaledFontSize * 0.78);
                 pdf.setFont(undefined, 'italic');
                 pdf.setTextColor(153, 27, 27);
                 pdf.text(cellInfo.info.substring(0, 20), infoX, infoLineY);
               }
              }
           }
         } else {
            // Keine Namen – nur Kommentar/Info
            const infoY = y + rowHeight / 2 + scaledLineHeight * 0.3;
            let infoX = x + 1;
            if (hasComment) {
              pdf.setFontSize(scaledFontSize * 1.1);
              pdf.setFont(undefined, 'bold');
              pdf.setTextColor(34, 197, 94);
              const commentText = dayComment.text.substring(0, 30);
              pdf.text(commentText, infoX, infoY);
              infoX += pdf.getTextWidth(commentText) + 2;
            }
            if (hasInfo) {
              const availableWidth = (x + colWidths.day) - infoX;
              if (availableWidth > 15) {
                pdf.setFontSize(scaledFontSize * 0.78);
                pdf.setFont(undefined, 'italic');
                pdf.setTextColor(153, 27, 27);
                pdf.text(cellInfo.info.substring(0, 25), infoX, infoY);
              }
            }
          }

          pdf.setTextColor(0, 0, 0);
          pdf.setFont(undefined, 'normal');
          pdf.setFontSize(scaledFontSize);
        }
        x += colWidths.day;
      });
      
      pdf.rect(x, y, colWidths.day, rowHeight);
      // Dicke linke Linie = Trennung zur neuen Woche
      pdf.setLineWidth(0.6);
      pdf.line(x, y, x, y + rowHeight);
      pdf.setLineWidth(0.1);
      const nextMondayAssignments = sortAssignmentsForPDF(getAssignmentsForCell(project.id, nextWeekMonday), nextWeekMonday);
      const nextMondayData = nextMondayAssignments
        .map(a => {
          if (!a.employee_id && a.notes) {
            return { name: `* ${a.notes}`, isAzubi: false, isPraktikant: false, isPlaceholder: true };
          }
          const emp = getEmployee(a.employee_id);
          if (!emp) return null;
          let name = emp.employee_type === 'azubi'
            ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
            : emp.full_name;
          if (a.notes) name = name + ' (' + a.notes + ')';
          return { name, isAzubi: emp.employee_type === 'azubi', isPraktikant: emp.employee_type === 'praktikant', isIndependent: !!emp.is_independent, isOvernight: isOvernightOnDay(emp, nextWeekMonday) };
        })
        .filter(Boolean);
      // Leihpersonal (blau) für nächsten Montag
      if (getTempWorkersForCell) {
        const tempWorkers = getTempWorkersForCell(project.id, nextWeekMonday);
        tempWorkers.forEach(tw => nextMondayData.push({ name: tw.full_name, isAzubi: false, isTempWorker: true }));
      }
      // Nächster Montag – mit Kommentar
      const nextMondayComment = getCommentForProjectOnMonday 
        ? getCommentForProjectOnMonday(project.id, nextWeekMonday) 
        : null;

      const hasNextMondayNames = nextMondayData.length > 0;
      const hasNextMondayComment = nextMondayComment;

      if (hasNextMondayNames) {
        const lines = smartGridCountLines(nextMondayData, colWidths.day - 2);
        const startY = y + scaledLineHeight * 0.85;

        // Namen im Smart-Grid rendern
        renderSmartGrid(nextMondayData, x, y, rowHeight, colWidths.day - 2, true, isEFProject);

        if (hasNextMondayComment) {
          const infoLineY = startY + lines * scaledLineHeight;
          pdf.setFontSize(scaledFontSize * 1.1);
          pdf.setFont(undefined, 'bold');
          pdf.setTextColor(34, 197, 94);
          pdf.text(nextMondayComment.text.substring(0, 25), x + 1, infoLineY);
        }
        } else if (hasNextMondayComment) {
        const infoY = y + rowHeight / 2 + scaledLineHeight * 0.3;
        pdf.setFontSize(scaledFontSize * 1.1);
        pdf.setFont(undefined, 'bold');
        pdf.setTextColor(34, 197, 94);
        pdf.text(nextMondayComment.text.substring(0, 30), x + 1, infoY);
        }

      pdf.setTextColor(0, 0, 0);
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(scaledFontSize);
      x += colWidths.day;
      
      const overnightNextWeekStr = nextWeekDays.map(d => countOvernightStaff(project.id, d)).join('-');
      if (!/^0-0-0-0-0$/.test(overnightNextWeekStr) && !isEFProject) {
       pdf.setFillColor(254, 202, 202);
       pdf.rect(x, y, colWidths.overnight, rowHeight, 'FD');
      } else {
       pdf.rect(x, y, colWidths.overnight, rowHeight);
      }
      if (!/^0-0-0-0-0$/.test(overnightNextWeekStr)) {
       const numWidth = pdf.getTextWidth(overnightNextWeekStr);
       pdf.text(overnightNextWeekStr, x + (colWidths.overnight - numWidth) / 2, y + rowHeight / 2 + 1);
      }
      x += colWidths.overnight;
      
      pdf.rect(x, y, colWidths.infoSmall, rowHeight);
      if (project.completion_date_text) {
        pdf.text(project.completion_date_text, x + 0.5, y + rowHeight / 2 + 1);
      }
      x += colWidths.infoSmall;
      
      pdf.rect(x, y, colWidths.infoOM, rowHeight);
      if (project.lead_assembler) {
        pdf.text(project.lead_assembler.substring(0, 18), x + 0.5, y + rowHeight / 2 + 1);
      }
      x += colWidths.infoOM;
      
      pdf.rect(x, y, colWidths.infoBau, rowHeight);
      pdf.setFont(undefined, 'bold');
      pdf.setFontSize(nameFontSize);
      pdf.text(projectName.substring(0, 14), x + 0.5, y + rowHeight / 2 + 1);
      pdf.setFont(undefined, 'normal');
      pdf.setFontSize(scaledFontSize);
      x += colWidths.infoBau;
      
      // Rechte PL-Spalte: nur Rahmen zeichnen, Füllung kommt über renderProjectGroup
      pdf.rect(x, y, colWidths.pl, rowHeight);
      
      y += rowHeight;
    };

    // Hilfsfunktion: Projekte als Gruppe rendern (PL-Spalte zusammengeführt)
    const renderProjectGroup = (projectList, rows, isEF = false) => {
      // Gruppiere nach PL-Kürzel (zusammenhängende Blöcke)
      const groups = [];
      let currentGroup = null;
      projectList.forEach((project, i) => {
        const plAbbr = getProjectLeaderAbbreviation(project.id) || '-';
        if (!currentGroup || currentGroup.plAbbr !== plAbbr) {
          currentGroup = { plAbbr, projects: [{ project, row: rows[i] }] };
          groups.push(currentGroup);
        } else {
          currentGroup.projects.push({ project, row: rows[i] });
        }
      });

      groups.forEach(group => {
        const groupStartY = y;
        const groupTotalHeight = group.projects.reduce((sum, p) => sum + p.row.height, 0);
        const leaderColor = getLeaderColorRGB(group.plAbbr);

        // Zeichne alle Zeilen der Gruppe (ohne PL-Text), mit dünner Linie innerhalb
        group.projects.forEach(({ project, row }) => {
          renderProject(project, row.height, isEF);
        });
        // Dicke Trennlinie am Ende jeder PL-Gruppe
        const groupEndY = groupStartY + groupTotalHeight;
        pdf.setDrawColor(80, 80, 80);
        pdf.setLineWidth(0.7);
        const totalW = colWidths.pl + colWidths.name + colWidths.overnight
          + colWidths.day * 5 + colWidths.day
          + colWidths.overnight + colWidths.infoSmall + colWidths.infoOM + colWidths.infoBau + colWidths.pl;
        pdf.line(margin, groupEndY, margin + totalW, groupEndY);
        pdf.setDrawColor(0, 0, 0);
        pdf.setLineWidth(0.2);

        // Zeichne linke PL-Spalte als zusammengeführten Block
        pdf.setFillColor(leaderColor.r, leaderColor.g, leaderColor.b);
        pdf.rect(margin, groupStartY, colWidths.pl, groupTotalHeight, 'F');
        pdf.rect(margin, groupStartY, colWidths.pl, groupTotalHeight);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont(undefined, 'bold');
        const textY = groupStartY + groupTotalHeight / 2 + 1;
        const plTextWidth = pdf.getTextWidth(group.plAbbr);
        pdf.text(group.plAbbr, margin + (colWidths.pl - plTextWidth) / 2, textY);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(undefined, 'normal');

        // Zeichne rechte PL-Spalte als zusammengeführten Block (gleich wie links)
        const rightPlX = margin + colWidths.pl + colWidths.name + colWidths.overnight
          + colWidths.day * 5 + colWidths.day  // 5 Werktage + nächster Montag
          + colWidths.overnight + colWidths.infoSmall + colWidths.infoOM + colWidths.infoBau;
        pdf.setFillColor(leaderColor.r, leaderColor.g, leaderColor.b);
        pdf.rect(rightPlX, groupStartY, colWidths.pl, groupTotalHeight, 'F');
        pdf.rect(rightPlX, groupStartY, colWidths.pl, groupTotalHeight);
        pdf.setTextColor(255, 255, 255);
        pdf.setFont(undefined, 'bold');
        const plTextWidth2 = pdf.getTextWidth(group.plAbbr);
        pdf.text(group.plAbbr, rightPlX + (colWidths.pl - plTextWidth2) / 2, groupStartY + groupTotalHeight / 2 + 1);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont(undefined, 'normal');
      });
    };

    // Projekte vor Pool rendern
    const rowsBefore = projectsBeforeWorkshop.slice(0, splitIndex).map(() => nextRow());
    renderProjectGroup(projectsBeforeWorkshop.slice(0, splitIndex), rowsBefore);
    
    // Pool-Zeile
    const poolRowHeight = nextRow().height;
    pdf.setFontSize(scaledFontSize);
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(0, 0, 0);
    x = margin;
    pdf.setFillColor(253, 216, 0);
    pdf.rect(x, y, colWidths.pl, poolRowHeight, 'F');
    pdf.rect(x, y, colWidths.pl, poolRowHeight);
    pdf.text('Pool', x + 1, y + poolRowHeight / 2 + 1);
    x += colWidths.pl;
    pdf.setFillColor(253, 216, 0);
    pdf.rect(x, y, colWidths.name, poolRowHeight, 'F');
    pdf.rect(x, y, colWidths.name, poolRowHeight);
    pdf.text('Nicht eingeplant', x + 1, y + poolRowHeight / 2 + 1);
    x += colWidths.name;
    pdf.setFillColor(253, 216, 0);
    pdf.rect(x, y, colWidths.overnight, poolRowHeight, 'F');
    pdf.rect(x, y, colWidths.overnight, poolRowHeight);
    x += colWidths.overnight;
    pdf.setFont(undefined, 'normal');
    [...weekDays, nextWeekMonday].forEach(day => {
      const isNextMon = day === nextWeekMonday;
      if (isDayHoliday(day)) {
        pdf.setFillColor(255, 237, 213);
        pdf.rect(x, y, colWidths.day, poolRowHeight, 'F');
        pdf.rect(x, y, colWidths.day, poolRowHeight);
      } else {
        pdf.setFillColor(253, 216, 0);
        pdf.rect(x, y, colWidths.day, poolRowHeight, 'F');
        pdf.rect(x, y, colWidths.day, poolRowHeight);
        const poolEmps = getPoolEmployees(day);
        const poolData = poolEmps.map(emp => {
          let name = emp.employee_type === 'azubi'
            ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
            : emp.full_name;
          if (emp.remark) name = name + ' (' + emp.remark + ')';
          return { name, isAzubi: emp.employee_type === 'azubi' };
        });
        renderSmartGridScaled(poolData, x, y, poolRowHeight, colWidths.day - 2);
      }
      if (isNextMon) {
        pdf.setLineWidth(0.6);
        pdf.line(x, y, x, y + poolRowHeight);
        pdf.setLineWidth(0.1);
      }
      x += colWidths.day;
    });
    pdf.setFont(undefined, 'bold');
    [colWidths.overnight, colWidths.infoSmall, colWidths.infoOM, colWidths.infoBau, colWidths.pl].forEach(width => {
      pdf.setFillColor(253, 216, 0);
      pdf.rect(x, y, width, poolRowHeight, 'F');
      pdf.rect(x, y, width, poolRowHeight);
      x += width;
    });
    y += poolRowHeight;
    
    // Restliche Projekte nach Pool
    const rowsAfterPool = projectsBeforeWorkshop.slice(splitIndex).map(() => nextRow());
    renderProjectGroup(projectsBeforeWorkshop.slice(splitIndex), rowsAfterPool);
    
    // Werkstatt-Zeile
    const workshopRowHeight = nextRow().height;
    pdf.setFont(undefined, 'bold');
    pdf.setTextColor(0, 0, 0);
    x = margin;
    pdf.setFillColor(220, 252, 231);
    pdf.rect(x, y, colWidths.pl, workshopRowHeight, 'F');
    pdf.rect(x, y, colWidths.pl, workshopRowHeight);
    pdf.text('WS', x + 1, y + workshopRowHeight / 2 + 1);
    x += colWidths.pl;
    pdf.setFillColor(220, 252, 231);
    pdf.rect(x, y, colWidths.name, workshopRowHeight, 'F');
    pdf.rect(x, y, colWidths.name, workshopRowHeight);
    pdf.text('WERKSTATT', x + 1, y + workshopRowHeight / 2 + 1);
    x += colWidths.name;
    pdf.rect(x, y, colWidths.overnight, workshopRowHeight);
    x += colWidths.overnight;
    pdf.setFont(undefined, 'normal');
    [...weekDays, nextWeekMonday].forEach(day => {
      const isNextMon = day === nextWeekMonday;
      pdf.setFillColor(240, 253, 244);
      pdf.rect(x, y, colWidths.day, workshopRowHeight, 'F');
      pdf.rect(x, y, colWidths.day, workshopRowHeight);
      if (!isDayHoliday(day)) {
        const workshopAssignments = getAssignmentsForCell('workshop', day);
        const workshopData = workshopAssignments.map(a => {
          const emp = getEmployee(a.employee_id);
          if (!emp) return null;
          let name = emp.full_name;
          if (a.notes) name = name + ' (' + a.notes + ')';
          return { name, isAzubi: emp.employee_type === 'azubi' };
        }).filter(Boolean);
        renderSmartGridScaled(workshopData, x, y, workshopRowHeight, colWidths.day - 2);
      }
      if (isNextMon) {
        pdf.setLineWidth(0.6);
        pdf.line(x, y, x, y + workshopRowHeight);
        pdf.setLineWidth(0.1);
      }
      x += colWidths.day;
    });
    [colWidths.overnight, colWidths.infoSmall, colWidths.infoOM, colWidths.infoBau, colWidths.pl].forEach(width => {
      pdf.rect(x, y, width, workshopRowHeight);
      x += width;
    });
    y += workshopRowHeight;
    
    // EF-Projekte
    const rowsEF = projectsAfterWorkshop.map(() => nextRow());
    renderProjectGroup(projectsAfterWorkshop, rowsEF, true);
    
    // Abwesenheiten – dicke Trennlinie oben
    const totalRowWidth = colWidths.pl + colWidths.name + colWidths.overnight
      + colWidths.day * 5 + colWidths.day
      + colWidths.overnight + colWidths.infoSmall + colWidths.infoOM + colWidths.infoBau + colWidths.pl;
    pdf.setDrawColor(30, 58, 95); // dunkelblau
    pdf.setLineWidth(0.8);
    pdf.line(margin, y, margin + totalRowWidth, y);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.1);

    pdf.setFont(undefined, 'bold');
    absenceTypes.forEach(({ key, label }) => {
      // Nur anzeigen wenn mind. ein Mitarbeiter vorhanden
      const hasAnyAbsence = [...weekDays, nextWeekMonday].some(day => {
        if (isDayHoliday(day)) return false;
        return getAbsenceAssignments(key, day).length > 0;
      });
      if (!hasAnyAbsence) return;

      const absenceRowHeight = nextRow().height;
      
      x = margin;
      pdf.rect(x, y, colWidths.pl, absenceRowHeight);
      x += colWidths.pl;
      pdf.rect(x, y, colWidths.name, absenceRowHeight);
      pdf.text(label.toUpperCase(), x + 1, y + absenceRowHeight / 2 + 1);
      x += colWidths.name;
      pdf.rect(x, y, colWidths.overnight, absenceRowHeight);
      x += colWidths.overnight;
      
      const showEnd = SHOW_END_DATE_TYPES.includes(key) && !!getAbsenceEndDate;

      const buildAbsenceData = (day) => {
        const absences = getAbsenceAssignments(key, day);
        return absences.map(a => {
          const emp = getEmployee(a.employee_id);
          if (!emp) return null;
          let baseName = emp.employee_type === 'azubi'
            ? `${emp.full_name?.split(' ').pop()}${emp.apprentice_year || ''}`
            : emp.full_name;
          if (a.notes) baseName = baseName + ' (' + a.notes + ')';
          const dayStr = format(day, 'yyyy-MM-dd');
          const endDate = showEnd ? getAbsenceEndDate(emp.id, key, dayStr) : null;
          const name = endDate ? `${baseName} (${format(new Date(endDate), 'd.M.')})` : baseName;
          return { name, isAzubi: emp.employee_type === 'azubi', hasEndDate: !!endDate, sortKey: baseName.split(' (')[0] };
        }).filter(Boolean).sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'de'));
      };

      const renderAbsenceNames = (absenceData, cellX, cellY, cellHeight) => {
        if (absenceData.length === 0) return;
        const cellWidth = colWidths.day - 2;
        const subCellW = cellWidth / NAMES_PER_ROW;
        const startTextY = cellY + scaledLineHeight * 0.85;

        let col = 0; // aktuelle Spalte (0-3)
        let row = 0; // aktuelle Zeile

        absenceData.forEach((nameData) => {
          pdf.setFont(undefined, nameData.isAzubi ? 'bold' : 'normal');
          pdf.setTextColor(0, 0, 0);

          const nameWidth = pdf.getTextWidth(nameData.name);
          // Passt der Name in die aktuelle Subzelle?
          const fits = nameWidth <= subCellW - 1;

          if (!fits) {
            // Name zu breit: rücke bis zur nächsten freien Position vor, sodass keine Überlappung entsteht
            // Wir brauchen mindestens so viele Spalten, dass der Name Platz hat
            const neededCols = Math.ceil((nameWidth + 1) / subCellW);
            // Wenn der Name schon ganz rechts steht oder nicht mehr passt → nächste Zeile
            if (col + neededCols > NAMES_PER_ROW) {
              col = 0;
              row++;
            }
            const xPos = cellX + 1 + col * subCellW;
            const yPos = startTextY + row * scaledLineHeight;
            pdf.text(nameData.name, xPos, yPos);
            col += neededCols;
          } else {
            if (col >= NAMES_PER_ROW) {
              col = 0;
              row++;
            }
            const xPos = cellX + 1 + col * subCellW;
            const yPos = startTextY + row * scaledLineHeight;
            pdf.text(nameData.name, xPos, yPos);
            col++;
          }

          if (col >= NAMES_PER_ROW) {
            col = 0;
            row++;
          }
        });

        pdf.setFont(undefined, 'normal');
        pdf.setTextColor(0, 0, 0);
      };

      pdf.setFont(undefined, 'normal');
      weekDays.forEach(day => {
        if (isDayHoliday(day)) {
          pdf.setFillColor(255, 237, 213);
          pdf.rect(x, y, colWidths.day, absenceRowHeight, 'F');
        }
        pdf.rect(x, y, colWidths.day, absenceRowHeight);
        if (!isDayHoliday(day)) {
          renderAbsenceNames(buildAbsenceData(day), x, y, absenceRowHeight);
        }
        x += colWidths.day;
      });
      
      pdf.setLineWidth(0.6);
      pdf.line(x, y, x, y + absenceRowHeight);
      pdf.setLineWidth(0.1);
      pdf.rect(x, y, colWidths.day, absenceRowHeight);
      if (!isDayHoliday(nextWeekMonday)) {
        renderAbsenceNames(buildAbsenceData(nextWeekMonday), x, y, absenceRowHeight);
      }
      x += colWidths.day;
      
      [colWidths.overnight, colWidths.infoSmall, colWidths.infoOM, colWidths.infoBau, colWidths.pl].forEach(width => {
        pdf.rect(x, y, width, absenceRowHeight);
        x += width;
      });
      
      pdf.setFont(undefined, 'bold');
      y += absenceRowHeight;
    });
    
    pdf.save(`Wocheneinteilung_KW${getWeek(weekStart)}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    toast.error('Fehler beim PDF-Download');
  }
};