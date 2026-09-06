import React, { useMemo, useState, useEffect } from 'react';
import { getWeek, startOfWeek, addWeeks, getYear, format, startOfISOWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { FileText, ArrowUpDown, GripVertical, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

function getWeeksForYear(year) {
  // Alle Montage des Jahres
  const weeks = [];
  let d = new Date(year, 0, 1);
  // Gehe zum ersten Montag des Jahres (oder davor)
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  // Iteriere solange wir im Jahr oder in der letzten KW des Jahres sind
  while (true) {
    const kw = getWeek(d, { weekStartsOn: 1, firstWeekContainsDate: 4 });
    const y = getYear(startOfWeek(d, { weekStartsOn: 1 }));
    // Stoppe wenn wir ins nächste Jahr wechseln (nach KW 52/53)
    if (y > year) break;
    weeks.push({ monday: new Date(d), kw });
    d = new Date(d);
    d.setDate(d.getDate() + 7);
  }
  return weeks;
}

export default function EarlyShiftOverview({ employees }) {
  const currentYear = new Date().getFullYear();
  const [viewYear, setViewYear] = React.useState(currentYear);
  const [showSortDialog, setShowSortDialog] = useState(false);

  const baseEarlyShiftEmployees = useMemo(
    () => employees.filter(e => e.early_shift && e.is_active !== false).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
    [employees]
  );

  const [customOrder, setCustomOrder] = useState(() => {
    const saved = localStorage.getItem('earlyShiftEmployeeOrder');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (customOrder) {
      localStorage.setItem('earlyShiftEmployeeOrder', JSON.stringify(customOrder));
    } else {
      localStorage.removeItem('earlyShiftEmployeeOrder');
    }
  }, [customOrder]);

  const earlyShiftEmployees = useMemo(() => {
    if (!customOrder) return baseEarlyShiftEmployees;
    const orderMap = new Map(customOrder.map((id, i) => [id, i]));
    return [...baseEarlyShiftEmployees].sort((a, b) => {
      const ai = orderMap.has(a.id) ? orderMap.get(a.id) : 9999;
      const bi = orderMap.has(b.id) ? orderMap.get(b.id) : 9999;
      return ai - bi;
    });
  }, [baseEarlyShiftEmployees, customOrder]);

  // Nur Mitarbeiter ohne Bunse in der Rotation
  const activeEmployees = earlyShiftEmployees.filter(e => !e.full_name?.includes('Bunse'));

  // Finde Index von "Olaf Wiemer" in activeEmployees
  const wiemeStartIndex = activeEmployees.findIndex(e => e.full_name?.includes('Wiemer'));
  const rotationStartIndex = wiemeStartIndex >= 0 ? wiemeStartIndex : 0;

  // Berechne welche beiden Mitarbeiter in der KW Schicht haben
  // KW 2 (Kalenderwoche 2): Wiemer mit S, nächster mit F
  // KW 3: nächster mit S, danach mit F
  // usw.
  // Volker Bunse wird komplett übersprungen
  const getShiftForWeek = (weekIndex) => {
    const week = weeks[weekIndex];
    if (!week || week.kw < 2) return null;

    const weeksOffset = week.kw - 2;
    const firstEmpIndex = (rotationStartIndex + weeksOffset) % activeEmployees.length;
    const secondEmpIndex = (firstEmpIndex + 1) % activeEmployees.length;

    return {
      spätschichtId: activeEmployees[firstEmpIndex]?.id,  // S
      frühschichtId: activeEmployees[secondEmpIndex]?.id  // F
    };
  };

  const [shiftOverrides, setShiftOverrides] = useState(() => {
    const saved = localStorage.getItem('earlyShiftOverrides');
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem('earlyShiftOverrides', JSON.stringify(shiftOverrides));
  }, [shiftOverrides]);

  const getShift = (empId, weekIndex) => {
    const emp = earlyShiftEmployees.find(e => e.id === empId);

    // Volker Bunse zeigt immer F/S
    if (emp?.full_name?.includes('Bunse')) return 'F/S';

    const key = `${empId}-${weekIndex}`;
    if (shiftOverrides[key] !== undefined) return shiftOverrides[key];

    const assignment = getShiftForWeek(weekIndex);
    if (!assignment) return '';

    if (empId === assignment.spätschichtId) return 'S';
    if (empId === assignment.frühschichtId) return 'F';
    return '';
  };

  const toggleShift = (empId, weekIndex) => {
    const key = `${empId}-${weekIndex}`;
    const current = getShift(empId, weekIndex);
    setShiftOverrides(prev => ({
      ...prev,
      [key]: current === 'F' ? 'S' : current === 'S' ? '' : 'F'
    }));
  };

  const [sortList, setSortList] = useState([]);

  const openSortDialog = () => {
    setSortList([...earlyShiftEmployees]);
    setShowSortDialog(true);
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const items = [...sortList];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    setSortList(items);
  };

  const applyOrder = () => {
    setCustomOrder(sortList.map(e => e.id));
    setShowSortDialog(false);
  };

  const resetOrder = () => {
    setCustomOrder(null);
    setShowSortDialog(false);
  };

  const weeks = useMemo(() => getWeeksForYear(viewYear), [viewYear]);

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a3');
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentW = pageW - margin * 2;
    const today = new Date(viewYear, 0, 1);
    const dateStr = format(new Date(), 'dd.MM.yyyy');

    // === ROW 1: Kopfzeile (nur Datum rechts) ===
    doc.setFontSize(7);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text(dateStr, pageW - margin, margin + 3, { align: 'right' });

    // === ROW 2: Legende ===
    let legendY = margin + 8;
    const boxW = 22;
    const boxH = 4;

    // Ferienzeit (gelb)
    doc.setFillColor(255, 255, 0);
    doc.setDrawColor(0);
    doc.rect(margin, legendY, boxW, boxH, 'FD');
    doc.setFontSize(6);
    doc.setTextColor(0);
    doc.text('Ferienzeit', margin + boxW + 1, legendY + 3);

    // Vaterschaftsurlaub (orange)
    doc.setFillColor(255, 165, 0);
    doc.rect(margin + boxW + 22, legendY, boxW, boxH, 'FD');
    doc.text('Vaterschaftsurlaub', margin + boxW + 22 + boxW + 1, legendY + 3);

    // Urlaub (grün)
    doc.setFillColor(0, 200, 0);
    doc.rect(margin + (boxW + 22) * 2 + 15, legendY, boxW, boxH, 'FD');
    doc.text('Urlaub', margin + (boxW + 22) * 2 + 15 + boxW + 1, legendY + 3);

    // F= und S= Zeiten
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.text('F= Früh 5.50 Uhr', pageW / 2, legendY + 3);
    doc.text('S=Spät  Mo.-Do. 17.30,  Fr.16.00 Uhr', pageW / 2 + 50, legendY + 3);
    doc.setFont(undefined, 'normal');

    // === TABLE SETUP ===
    const tableStartY = legendY + 9;
    const nameColW = 22;
    const availW = contentW - nameColW;
    const cellW = availW / weeks.length;
    const rowH = 5;
    const headerRow1H = 5; // Jahr + Monatszeile
    const headerRow2H = 5; // Projektleiter + KW-Nummern

    // Month color map (German month names) - alternating grey tones
    const monthColors = {
      'Januar':    [210, 210, 210],
      'Februar':   [230, 230, 230],
      'März':      [210, 210, 210],
      'April':     [230, 230, 230],
      'Mai':       [210, 210, 210],
      'Juni':      [230, 230, 230],
      'Juli':      [210, 210, 210],
      'August':    [230, 230, 230],
      'September': [210, 210, 210],
      'Oktober':   [230, 230, 230],
      'November':  [210, 210, 210],
      'Dezember':  [230, 230, 230],
    };

    // === HEADER ROW 1: Jahr + Monatsnamen ===
    // Jahr-Box (links)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0);
    doc.setFontSize(7);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.rect(margin, tableStartY, nameColW, headerRow1H, 'FD');
    doc.text(`${viewYear}`, margin + nameColW / 2, tableStartY + 3.5, { align: 'center' });

    // Dienstplan Titel (mittig über alle KW-Spalten)
    doc.setFillColor(255, 255, 255);
    doc.setFontSize(9);
    doc.rect(margin + nameColW, tableStartY, availW, headerRow1H, 'FD');
    doc.text(`Dienstplan Projektleiter ${viewYear}`, margin + nameColW + availW / 2, tableStartY + 3.5, { align: 'center' });

    // Monatsnamen (farbig, über den jeweiligen KW-Spalten)
    let mx = margin + nameColW;
    monthGroups.forEach(({ label, span }) => {
      const color = monthColors[label] || [220, 220, 220];
      doc.setFillColor(...color);
      doc.setDrawColor(0);
      const mw = cellW * span;
      doc.rect(mx, tableStartY + headerRow1H, mw, headerRow1H, 'FD');
      doc.setFontSize(5.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0);
      doc.text(label, mx + mw / 2, tableStartY + headerRow1H + 3.5, { align: 'center' });
      mx += mw;
    });

    // Linke Ecke für Monatsnamen-Zeile (leer)
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0);
    doc.rect(margin, tableStartY + headerRow1H, nameColW, headerRow1H, 'FD');

    // === HEADER ROW 2: "Projektleiter" + KW-Nummern ===
    const kwY = tableStartY + headerRow1H * 2;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0);
    doc.setFontSize(6);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.rect(margin, kwY, nameColW, headerRow2H, 'FD');
    doc.text('Projektleiter', margin + nameColW / 2, kwY + 3.5, { align: 'center' });

    let kwX = margin + nameColW;
    weeks.forEach(({ monday, kw }) => {
      // Highlight current KW
      const isCurrentKW = kw === getWeek(new Date(), { weekStartsOn: 1, firstWeekContainsDate: 4 }) && viewYear === new Date().getFullYear();
      doc.setFillColor(isCurrentKW ? 255 : 220, isCurrentKW ? 200 : 220, isCurrentKW ? 0 : 220);
      doc.setDrawColor(0);
      doc.rect(kwX, kwY, cellW, headerRow2H, 'FD');
      doc.setFontSize(4.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(0);
      doc.text(`${kw}`, kwX + cellW / 2, kwY + 3.5, { align: 'center' });
      kwX += cellW;
    });

    // === EMPLOYEE ROWS ===
    doc.setFont(undefined, 'normal');
    earlyShiftEmployees.forEach((emp, ri) => {
      const y = kwY + headerRow2H + ri * rowH;
      if (y + rowH > pageH - 55) return; // Platz für Datumsbereich unten

      const bg = ri % 2 === 0 ? [255, 255, 255] : [245, 245, 245];
      doc.setFillColor(...bg);
      doc.setDrawColor(0);
      doc.rect(margin, y, nameColW, rowH, 'FD');
      doc.setFontSize(5.5);
      doc.setTextColor(0);
      doc.text(emp.full_name || '', margin + 1, y + 3.3);

      let cx = margin + nameColW;
      weeks.forEach(({ kw: weekKw }, wi) => {
        const color = wi % 2 === 0 ? monthColors[format(weeks[wi].monday, 'MMMM', { locale: de })] || [255,255,255] : [255, 255, 255];
        doc.setFillColor(...(bg));
        doc.setDrawColor(150, 150, 150);
        doc.rect(cx, y, cellW, rowH, 'FD');

        // Schicht für diesen Mitarbeiter in dieser Woche anzeigen
        const shift = getShift(emp.id, wi);
        if (shift) {
          doc.setFontSize(5);
          doc.setTextColor(0, 100, 200);
          doc.setFont(undefined, 'bold');
          doc.text(shift, cx + cellW / 2, y + 3.3, { align: 'center' });
        }
        cx += cellW;
      });
    });

    // === BOTTOM: Datumsbereich vertikal rotiert, mittig in jeder Spalte ===
    const lastEmpY = kwY + headerRow2H + earlyShiftEmployees.length * rowH;
    const dateRowH = 45;
    const dateRowY = lastEmpY + 1;

    // Schriftgröße so groß wie möglich (cellW bestimmt den Platz)
    const dateFontSize = Math.max(5, Math.min(9, cellW * 1.1));
    doc.setFontSize(dateFontSize);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(0);

    let dx = margin + nameColW + 2 * cellW;
    weeks.forEach(({ monday }) => {
      const friday = new Date(monday);
      friday.setDate(friday.getDate() + 4);
      const rangeText = `${format(monday, 'dd.MM.')} - ${format(friday, 'dd.MM.yy')}`;
      doc.setTextColor(0);
      // Text mittig in der Spalte positioniert
      doc.text(rangeText, dx + cellW / 2, dateRowY + dateRowH / 2, { angle: 90, align: 'center' });
      dx += cellW;
    });

    doc.save(`Dienstplan_Projektleiter_${viewYear}.pdf`);
  };

  const today = new Date();
  const currentKW = getWeek(today, { weekStartsOn: 1, firstWeekContainsDate: 4 });
  const currentKWYear = getYear(startOfWeek(today, { weekStartsOn: 1 }));

  // Monatsgruppen berechnen: für jede KW den Monat der Montags-Datum ermitteln
  const monthGroups = useMemo(() => {
    const groups = [];
    let currentMonth = null;
    let count = 0;
    weeks.forEach(({ monday }) => {
      const month = format(monday, 'MMMM', { locale: de });
      if (month !== currentMonth) {
        if (currentMonth !== null) groups.push({ label: currentMonth, span: count });
        currentMonth = month;
        count = 1;
      } else {
        count++;
      }
    });
    if (currentMonth !== null) groups.push({ label: currentMonth, span: count });
    return groups;
  }, [weeks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewYear(v => v - 1)}>← {viewYear - 1}</Button>
          <span className="font-semibold text-[#1e3a5f] dark:text-white text-lg px-2">{viewYear}</span>
          <Button variant="outline" size="sm" onClick={() => setViewYear(v => v + 1)}>{viewYear + 1} →</Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openSortDialog}>
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Reihenfolge anpassen
          </Button>
          <Button variant="outline" onClick={() => setShiftOverrides({})}>
            Zurücksetzen
          </Button>
          <Button onClick={exportPDF} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
            <FileText className="w-4 h-4 mr-2" />
            PDF exportieren
          </Button>
        </div>
      </div>

      {/* Sort Dialog */}
      {showSortDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSortDialog(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 w-80 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Reihenfolge anpassen</h3>
              <button onClick={() => setShowSortDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Mitarbeiter per Drag & Drop sortieren.</p>
            <div className="overflow-y-auto flex-1 mb-4">
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="sort-list">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                      {sortList.map((emp, index) => (
                        <Draggable key={emp.id} draggableId={emp.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-grab ${
                                snapshot.isDragging
                                  ? 'bg-blue-50 border-blue-300 shadow-md'
                                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                              }`}
                            >
                              <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="text-gray-900 dark:text-white">{emp.full_name}</span>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={resetOrder} className="flex-1">Alphabetisch</Button>
              <Button size="sm" onClick={applyOrder} className="flex-1 bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">Übernehmen</Button>
            </div>
          </div>
        </div>
      )}

      {earlyShiftEmployees.length === 0 ? (
        <div className="py-12 text-center text-gray-500 dark:text-gray-400">
          Keine Mitarbeiter mit Frühschicht gefunden.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="text-xs border-collapse" style={{ minWidth: `${40 + weeks.length * 30}px` }}>
            <thead>
              {/* Zeile 1: Dienstplan Projektleiter Jahr */}
              <tr>
                <th className="sticky left-0 z-10 bg-[#152c4a] text-white px-3 py-2 text-left font-bold min-w-[160px] border-r border-blue-900" rowSpan={1}>
                </th>
                <th
                  colSpan={weeks.length}
                  className="bg-[#152c4a] text-white text-center font-bold py-2 text-sm border-r border-blue-900"
                >
                  Dienstplan Projektleiter {viewYear}
                </th>
              </tr>
              {/* Zeile 2: Monatsnamen */}
              <tr>
                <th className="sticky left-0 z-10 bg-[#1e3a5f] text-white px-3 py-1.5 text-left font-semibold min-w-[160px] border-r border-blue-700">
                </th>
                {monthGroups.map((g, i) => (
                  <th
                    key={i}
                    colSpan={g.span}
                    className="bg-[#1e3a5f] text-amber-300 text-center font-semibold py-1.5 border-r border-blue-700 capitalize"
                  >
                    {g.label}
                  </th>
                ))}
              </tr>
              {/* Zeile 3: KW-Nummern */}
              <tr>
                <th className="sticky left-0 z-10 bg-[#1e3a5f] text-white px-3 py-2 text-left font-semibold min-w-[160px] border-r border-blue-700">
                  Mitarbeiter
                </th>
                {weeks.map(({ monday, kw }) => {
                  const isCurrentKW = kw === currentKW && viewYear === currentKWYear;
                  return (
                    <th
                      key={format(monday, 'yyyy-MM-dd')}
                      className={`px-1 py-2 text-center font-semibold border-r border-blue-700 min-w-[28px] ${
                        isCurrentKW
                          ? 'bg-amber-500 text-white'
                          : 'bg-[#1e3a5f] text-white'
                      }`}
                      title={`KW ${kw} – ${format(monday, 'd.M.', { locale: de })}`}
                    >
                      {kw}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {earlyShiftEmployees.map((emp, ri) => (
                <tr key={emp.id} className={ri % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'}>
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5 font-medium text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">
                    {emp.full_name}
                  </td>
                  {weeks.map(({ monday, kw }, wi) => {
                    const isCurrentKW = kw === currentKW && viewYear === currentKWYear;
                    const shift = getShift(emp.id, wi);
                    return (
                      <td
                        key={format(monday, 'yyyy-MM-dd')}
                        className={`border-r border-gray-100 dark:border-gray-700 text-center py-1.5 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 select-none ${
                          isCurrentKW ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                        }`}
                        onClick={() => toggleShift(emp.id, wi)}
                      >
                        {shift && <span className="font-semibold text-blue-600 dark:text-blue-400">{shift}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}