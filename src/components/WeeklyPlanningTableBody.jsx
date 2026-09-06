import React, { useState, useEffect, useRef } from 'react';
import { api } from '@/api/client';
import { format, startOfWeek } from 'date-fns';
import { de } from 'date-fns/locale';
import { addDays, subDays } from 'date-fns';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Moon, GripVertical, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import EFProjectsSection from './EFProjectsSection';
import { getPublicHolidayName } from '../utils/publicHolidays';
import CellInfoButton from './CellInfoButton';

// Dropdown: Auswahl eines Tages der Vorwoche, um ihn auf targetDay zu kopieren
// prevWeekMonday = Montag der Woche vor targetDay
function PreviousWeekDayPicker({ project, targetDay, prevWeekMonday, onCopy }) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const prevWeekDays = [
    { label: 'Mo', day: addDays(prevWeekMonday, 0) },
    { label: 'Di', day: addDays(prevWeekMonday, 1) },
    { label: 'Mi', day: addDays(prevWeekMonday, 2) },
    { label: 'Do', day: addDays(prevWeekMonday, 3) },
    { label: 'Fr', day: addDays(prevWeekMonday, 4) },
  ];

  return (
    <div className="relative no-print" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        className="w-full text-[7px] text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded px-0.5 py-0.5 leading-tight transition-colors"
        title="Vorwoche übernehmen"
      >
        ⇦ Vortag
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-0.5 bg-white border border-gray-200 rounded-lg shadow-lg p-1 flex gap-1" onClick={e => e.stopPropagation()}>
          {prevWeekDays.map(({ label, day }) => (
            <button
              key={label}
              onClick={() => { onCopy(project.id, day, targetDay); setOpen(false); }}
              className="px-1.5 py-1 text-[9px] rounded hover:bg-blue-50 hover:text-blue-700 text-gray-600 font-medium border border-gray-100 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WeeklyPlanningTableBody({
  normalProjects = [],
  tsProjects = [],
  efProjects = [],
  weekDays = [],
  isBridgeDay,
  nextMonday,
  employees = [],
  getEmployee,
  shouldShowOnDay,
  getDisplayName,
  getLeaderColor,
  getPrintEmployeeDisplay,
  countOvernightStaff,
  countOvernightStaffForWeek,
  getAssignmentsForCell,
  getTempWorkersForCell,
  handleEmployeeDoubleClick,
  getUnassignedEmployees,
  onCopyFromPreviousDay,
  onCellDoubleClick,
  absenceTypes = [],
  getAbsenceAssignments,
  projects = [],
  setProjects,
  onDeleteAssignment,
  getCommentForProjectOnMonday,
  onDeleteCommentFromDate,
  onDeleteComment,
  isOvernightForWeek,
  isOvernightOnDay,
  isFridayException,
  weekStart,
  cellInfos = [],
  onCellInfosChange,
  getAbsenceEndDate,
  poolSplitIndex,
  onToggleTsOvernight,
  onCopyFromDay,
}) {
  const getOvernightForWeek = (emp, day) => {
    if (isOvernightForWeek) {
      const mon = startOfWeek(day, { weekStartsOn: 1 });
      return isOvernightForWeek(emp, mon);
    }
    return emp?.overnight_stay === true;
  };

  // Gibt zurück ob ein Mitarbeiter an einem Tag als "Übernachtung aktiv" zählt
  // (Übernachtungs-KW UND kein Freitags-Ausnahme-Tag)
  const isOvernightActive = (emp, day) => {
    if (!getOvernightForWeek(emp, day)) return false;
    if (isFridayException && isFridayException(emp, day)) return false;
    return true;
  };

  // Prüft ob Mitarbeiter an einem konkreten Tag auf Montage ist (taggenau)
  const isOvernightActiveOnDay = (emp, day) => {
    if (isOvernightOnDay) return isOvernightOnDay(emp, day);
    return isOvernightActive(emp, day);
  };

  const empChipClass = (emp, day) => {
    if (emp.is_independent) return 'bg-purple-600 text-white';
    if (emp.employee_type === 'praktikant') return 'bg-green-600 text-white';
    if (isOvernightActiveOnDay(emp, day)) return 'bg-red-500 text-white';
    return 'bg-[#1e3a5f] text-white';
  };

  const empChipClassPrint = (emp, day) => {
    if (emp.is_independent) return 'bg-purple-600 text-white print:text-purple-700 print:font-normal';
    if (emp.employee_type === 'praktikant') return 'bg-green-600 text-white print:text-green-700 print:font-normal';
    if (isOvernightActiveOnDay(emp, day)) return 'bg-red-500 text-white print:text-red-600 print:font-normal';
    return 'bg-[#1e3a5f] text-white print:text-gray-600 print:font-normal';
  };

  const poolChipClass = (emp, day) => {
    if (emp.is_independent) return 'bg-purple-600 text-white';
    if (emp.employee_type === 'praktikant') return 'bg-green-600 text-white';
    if (isOvernightActiveOnDay(emp, day)) return 'bg-red-200 text-red-900 border border-red-300';
    return 'bg-gray-600 text-white';
  };

  // Sortiert Assignments: Übernachtungs-Monteure → Übernachtungs-Azubis → Monteure → Azubis → Praktikanten → Rest; innerhalb alphabetisch
  const sortAssignments = (assignmentList, day) => {
    const typeOrder = (emp) => {
      if (!emp) return 99;
      const overnight = getOvernightForWeek(emp, day);
      if (overnight && emp.employee_type === 'monteur') return 0;
      if (overnight && emp.employee_type === 'azubi') return 1;
      if (emp.employee_type === 'monteur') return 2;
      if (emp.employee_type === 'azubi') return 3;
      if (emp.employee_type === 'praktikant') return 4;
      return 5;
    };
    return [...assignmentList].sort((a, b) => {
      // Platzhalter (notes ohne employee_id) immer ans Ende
      if (!a.employee_id && a.notes) return 1;
      if (!b.employee_id && b.notes) return -1;
      const empA = getEmployee(a.employee_id);
      const empB = getEmployee(b.employee_id);
      const orderDiff = typeOrder(empA) - typeOrder(empB);
      if (orderDiff !== 0) return orderDiff;
      return (empA?.full_name || '').localeCompare(empB?.full_name || '', 'de');
    });
  };

  // Pool-Position: Standard = nach allen normalProjects, oder per poolSplitIndex
  const nextWeekDays = nextMonday ? [0, 1, 2, 3, 4].map(i => addDays(nextMonday, i)) : [];

  const effectivePoolSplitIndex = (poolSplitIndex !== undefined && poolSplitIndex !== null)
    ? poolSplitIndex
    : normalProjects.length;
  const normalProjectsBefore = normalProjects.slice(0, effectivePoolSplitIndex);
  const normalProjectsAfter = normalProjects.slice(effectivePoolSplitIndex);

  const renderNormalProject = (project) => {
    const leader = employees.find(e => e.id === project.project_leader_id);
    const leaderAbbr = leader?.abbreviation || leader?.full_name?.charAt(0) || '-';
    const leaderColorClass = getLeaderColor(leader?.abbreviation);

    return (
          <tr key={project.id} className="border-b dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
            <td className="p-2 text-center">
              <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${leaderColorClass}`}>
                {leaderAbbr}
              </span>
            </td>
            <td className="p-2 font-medium text-gray-900 dark:text-white text-sm">
              {project.name}
            </td>
            <td className="p-1 text-center">
              {(() => {
                const overnightStr = countOvernightStaff ? weekDays.map(d => countOvernightStaff(project.id, d)).join('-') : '';
                return overnightStr && !/^0-0-0-0-0$/.test(overnightStr) ? (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[9px] px-1">
                    {overnightStr}
                  </Badge>
                ) : null;
              })()}
            </td>
            {weekDays.map((day, dayIndex) => {
              const cellAssignments = sortAssignments(getAssignmentsForCell(project.id, day), day);
              const dateStr = format(day, 'yyyy-MM-dd');
              const holidayName = getPublicHolidayName(day, 'NRW');
              const bridgeDay = isBridgeDay ? isBridgeDay(day) : false;
              const dayOff = holidayName || bridgeDay;
              const dayComment = (dayIndex === 0 && getCommentForProjectOnMonday) ? getCommentForProjectOnMonday(project.id, day) : null;

              return (
                <td key={dayIndex} className={`p-0.5 border-l ${holidayName ? 'bg-orange-50' : bridgeDay ? 'bg-green-50' : ''}`} onDoubleClick={(e) => { if (!dayOff) { e.stopPropagation(); onCellDoubleClick && onCellDoubleClick(project.id, day); } }}>
                 {dayOff ? (
                  <div className="min-h-[50px]" />
                ) : (
                  <>
                    {dayComment && (
                       <div className="flex items-center gap-0.5 mb-0.5 px-0.5 py-1 bg-green-600 text-white rounded text-[10px] font-semibold no-print">
                         <span className="truncate max-w-[80px]">📝 {dayComment.text}</span>
                         <button
                           onMouseDown={(e) => e.stopPropagation()}
                           onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDeleteComment ? onDeleteComment(dayComment.id) : onDeleteCommentFromDate && onDeleteCommentFromDate(project.id, day); }}
                           className="ml-0.5 hover:bg-green-700 rounded leading-none flex-shrink-0 px-1"
                         >×</button>
                       </div>
                     )}
                    <Droppable droppableId={`cell_${project.id}_${dateStr}`}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-[50px] h-full rounded p-0.5 flex flex-col justify-between ${snapshot.isDraggingOver ? 'bg-blue-50' : 'bg-gray-50/50'}`}
                        >
                          <div className="flex flex-wrap gap-1 items-start flex-1">
                            {cellAssignments.map((assignment, i) => {
                                if (!assignment.employee_id && assignment.notes) {
                                     const isTS = assignment.notes === 'TS';
                                     return (
                                       <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                                         {(provided, snapshot) => (
                                           <div
                                             ref={provided.innerRef}
                                             {...provided.draggableProps}
                                             {...provided.dragHandleProps}
                                             onDoubleClick={(e) => { if (isTS) { e.stopPropagation(); onToggleTsOvernight && onToggleTsOvernight(assignment); } }}
                                             className={`px-2 py-1 rounded text-xs font-medium cursor-grab flex items-center gap-0.5 ${isTS && assignment.is_supervisor ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                             >
                                              ⚡ {assignment.notes}{isTS && assignment.is_supervisor ? ' 🌙' : ''}
                                              <button
                                                onMouseDown={(e) => e.stopPropagation()}
                                                onClick={(e) => { e.stopPropagation(); onDeleteAssignment && onDeleteAssignment(assignment.id); }}
                                                className="ml-0.5 hover:bg-orange-700 rounded leading-none"
                                              >×</button>
                                             </div>
                                             )}
                                             </Draggable>
                                             );
                                             }
                                             const emp = getEmployee(assignment.employee_id);
                                   if (!emp) return null;
                                   if (emp.employee_type === 'projektleiter') return null;
                                   if (!shouldShowOnDay(emp, dayIndex, day)) return null;
                                const displayInfo = getPrintEmployeeDisplay(emp);
                                return (
                                  <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                                        className={`px-2 py-1 rounded text-xs font-medium cursor-grab print:border-0 print:bg-transparent ${empChipClassPrint(emp, day)} ${snapshot.isDragging ? 'shadow-lg' : ''} ${displayInfo.class}`}
                                        >
                                          {emp.employee_type === 'azubi' ? getDisplayName(emp) : emp.full_name}
                                        </div>
                                        )}
                                        </Draggable>
                                        );
                                        })}
                                        {getTempWorkersForCell(project.id, day).map((tempWorker, idx) => (
                                        <Badge key={`temp_${tempWorker.id}_${idx}`} variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300">
                                        {tempWorker.full_name}
                                        </Badge>
                                        ))}
                                        </div>
                                        {provided.placeholder}
                                        <div className="flex items-center justify-between mt-auto pt-1 relative">
                              <div className="flex-1">
                                {(() => {
                                  // Erster Werktag der Woche (Montag oder erster Nicht-Feiertag)
                                  const firstWorkDay = weekDays.find(d => !getPublicHolidayName(d, 'NRW') && !(isBridgeDay && isBridgeDay(d)));
                                  const isFirstWorkDay = firstWorkDay && format(day, 'yyyy-MM-dd') === format(firstWorkDay, 'yyyy-MM-dd');

                                  if (isFirstWorkDay && onCopyFromDay && weekStart) {
                                    // Erster Werktag: Vorwoche-Picker
                                    return (
                                      <PreviousWeekDayPicker
                                        project={project}
                                        targetDay={day}
                                        prevWeekMonday={addDays(weekStart, -7)}
                                        onCopy={onCopyFromDay}
                                      />
                                    );
                                  } else if (!isFirstWorkDay && dayIndex > 0 && onCopyFromPreviousDay) {
                                    // Alle anderen Tage: Vortag-Button
                                    return (
                                      <button
                                        onClick={() => onCopyFromPreviousDay(project.id, day)}
                                        className="w-full text-[7px] text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded px-0.5 py-0.5 leading-tight transition-colors no-print"
                                        title="Vortag übernehmen"
                                      >
                                        ⇦ Vortag
                                      </button>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <CellInfoButton
                                projectId={project.id}
                                date={day}
                                cellInfos={cellInfos}
                                onCellInfosChange={onCellInfosChange}
                              />
                            </div>
                            
                          </div>
                        )}
                      </Droppable>
                    </>
                  )}
                </td>
              );
            })}
            <td className="p-1 border-l bg-blue-50/30" onDoubleClick={(e) => { e.stopPropagation(); onCellDoubleClick && onCellDoubleClick(project.id, nextMonday); }}>
              {(() => {
                const nextMondayComment = getCommentForProjectOnMonday ? getCommentForProjectOnMonday(project.id, nextMonday) : null;
                return nextMondayComment ? (
                  <div className="flex items-center gap-0.5 mb-0.5 px-0.5 py-1 bg-green-600 text-white rounded text-[10px] font-semibold no-print">
                    <span className="truncate max-w-[80px]">📝 {nextMondayComment.text}</span>
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDeleteComment ? onDeleteComment(nextMondayComment.id) : onDeleteCommentFromDate && onDeleteCommentFromDate(project.id, nextMonday); }}
                      className="ml-0.5 hover:bg-green-700 rounded leading-none flex-shrink-0 px-1"
                    >×</button>
                  </div>
                ) : null;
              })()}
              <Droppable droppableId={`cell_${project.id}_${format(nextMonday, 'yyyy-MM-dd')}`}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[60px] rounded-lg p-1 flex flex-col justify-between ${snapshot.isDraggingOver ? 'bg-blue-100' : ''}`}
                  >
                    <div className="flex flex-wrap gap-1 items-start">
                      {sortAssignments(getAssignmentsForCell(project.id, nextMonday), nextMonday).map((assignment, i) => {
                        if (!assignment.employee_id && assignment.notes) {
                          return (
                            <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                  className={`px-2 py-1 rounded text-xs font-medium cursor-grab bg-orange-500 text-white flex items-center gap-0.5 ${snapshot.isDragging ? 'shadow-lg' : ''}`}>
                                  ⚡ {assignment.notes}
                                  <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDeleteAssignment && onDeleteAssignment(assignment.id); }} className="ml-0.5 hover:bg-orange-700 rounded leading-none">×</button>
                                </div>
                              )}
                            </Draggable>
                          );
                        }
                        const emp = getEmployee(assignment.employee_id);
                         if (!emp) return null;
                         if (emp.employee_type === 'projektleiter') return null;
                         return (
                           <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                             {(provided, snapshot) => (
                               <div
                                 ref={provided.innerRef}
                                 {...provided.draggableProps}
                                 {...provided.dragHandleProps}
                                 onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                                 className={`px-2 py-1 rounded text-xs font-medium cursor-grab ${empChipClass(emp, nextMonday)} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                 >
                                 {emp.employee_type === 'azubi' ? getDisplayName(emp) : emp.full_name}
                                 </div>
                                 )}
                                 </Draggable>
                                 );
                                 })}
                                 {getTempWorkersForCell(project.id, nextMonday).map((tempWorker, idx) => (
                                 <Badge key={`temp_${tempWorker.id}_${idx}`} variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300">
                                 {tempWorker.full_name}
                                 </Badge>
                                 ))}
                                 </div>
                                 {provided.placeholder}
                                 {onCopyFromDay && weekStart && (
                                   <PreviousWeekDayPicker
                                     project={project}
                                     targetDay={nextMonday}
                                     prevWeekMonday={weekStart}
                                     onCopy={onCopyFromDay}
                                   />
                                 )}
                                 </div>
                                 )}
                                 </Droppable>
                                 </td>
                                 <td className="p-1 text-center">
                                 {(() => {
                                   const overnightStr = countOvernightStaff ? nextWeekDays.map(d => countOvernightStaff(project.id, d)).join('-') : '';
                                   return overnightStr && !/^0-0-0-0-0$/.test(overnightStr) ? (
                                     <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[9px] px-1">
                                       {overnightStr}
                                     </Badge>
                                   ) : null;
                                 })()}
                                 </td>
                                 <td className="p-2 text-center text-sm text-gray-600 dark:text-gray-300">
                                 {(project.completion_date || project.completion_date_text) ? (
                                   <span>
                                     {project.completion_date ? format(new Date(project.completion_date), 'd.M.yy') : ''}
                                     {project.completion_date && project.completion_date_text ? ' · ' : ''}
                                     {project.completion_date_text || ''}
                                   </span>
                                 ) : '-'}
                                 </td>
                                 <td className="p-2 min-w-[120px]">
                                 <Input
                                 value={project.lead_assembler || ''}
                onChange={(e) => {
                  const updatedProjects = projects.map(p => p.id === project.id ? {...p, lead_assembler: e.target.value} : p);
                  setProjects(updatedProjects);
                }}
                onBlur={async () => {
                  try {
                    await api.entities.Project.update(project.id, { lead_assembler: project.lead_assembler });
                  } catch (error) {
                    console.error('Error updating lead assembler:', error);
                  }
                }}
                placeholder="Name..."
                className="h-8 text-xs"
              />
            </td>
            <td className="p-2 font-medium text-gray-900 dark:text-white text-sm max-w-[20%] break-words">
              {project.name}
            </td>
            <td className="p-2 text-center">
              <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${leaderColorClass}`}>
                {leaderAbbr}
              </span>
            </td>
          </tr>
        );
  };

  const PoolRow = () => (
      <tr className="bg-yellow-100 dark:bg-yellow-900/30 border-t-2 border-yellow-300 dark:border-yellow-800 border-b-2">
        <td className="p-1 text-center font-bold text-yellow-800 dark:text-yellow-300 text-[11px]">Pool</td>
        <td className="p-1 font-semibold text-yellow-800 dark:text-yellow-300 text-[11px]">Nicht eingeplant</td>
        <td className="p-1"></td>
        {weekDays.map((day, dayIndex) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const holidayName = getPublicHolidayName(day, 'NRW');
          const bridgeDay = isBridgeDay ? isBridgeDay(day) : false;
          const dayOff = holidayName || bridgeDay;
          const unassignedEmployees = dayOff ? [] : getUnassignedEmployees(day, dayIndex);
          return (
            <td key={dayIndex} className={`p-1 border-l ${holidayName ? 'bg-orange-50' : bridgeDay ? 'bg-green-50' : ''}`}>
              {dayOff ? (
                <div className="min-h-[60px]" />
              ) : (
                <Droppable droppableId={`pool_pool_${dateStr}`}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`min-h-[60px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-yellow-200' : 'bg-yellow-50'}`}
                    >
                      <div className="flex flex-wrap gap-1 items-start">
                        {unassignedEmployees.map((employee, i) => (
                          <Draggable key={`pool_${employee.id}_${dateStr}`} draggableId={`pool_${employee.id}_${dateStr}`} index={i}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(employee); }}
                                className={`px-2 py-1 rounded text-xs font-medium cursor-grab flex items-center gap-1 ${poolChipClass(employee, day)} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                              >
                                <GripVertical className="w-3 h-3 opacity-50" />
                                {getDisplayName(employee)}
                                {isOvernightActive(employee, day) && <Moon className="w-3 h-3" />}
                                </div>
                                )}
                                </Draggable>
                                ))}
                                </div>
                                {provided.placeholder}
                                </div>
                                )}
                                </Droppable>
                                )}
                                </td>
                                );
                                })}
                                <td className="p-1 border-l bg-yellow-50">
                                <Droppable droppableId={`pool_pool_${format(nextMonday, 'yyyy-MM-dd')}`}>
                                {(provided, snapshot) => (
                                <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`min-h-[60px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-yellow-200' : 'bg-yellow-50'}`}
                                >
                                <div className="flex flex-wrap gap-1 items-start">
                                {getUnassignedEmployees(nextMonday, 0).map((employee, i) => (
                                <Draggable key={`pool_${employee.id}_${format(nextMonday, 'yyyy-MM-dd')}`} draggableId={`pool_${employee.id}_${format(nextMonday, 'yyyy-MM-dd')}`} index={i}>
                                {(provided, snapshot) => (
                                <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(employee); }}
                                className={`px-2 py-1 rounded text-xs font-medium cursor-grab flex items-center gap-1 ${poolChipClass(employee, nextMonday)} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                >
                                <GripVertical className="w-3 h-3 opacity-50" />
                                {getDisplayName(employee)}
                                {isOvernightActive(employee, nextMonday) && <Moon className="w-3 h-3" />}
                                </div>
                      )}
                    </Draggable>
                  ))}
                </div>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </td>
        <td className="p-0.5"></td>
        <td className="p-0.5"></td>
        <td className="p-0.5"></td>
        <td className="p-0.5"></td>
        <td className="p-0.5"></td>
      </tr>
  );

  return (
    <tbody>
      {normalProjectsBefore.map(renderNormalProject)}
      <PoolRow />
      {normalProjectsAfter.map(renderNormalProject)}

      {/* TS Projects */}
      {tsProjects.map((project) => {
        const leader = employees.find(e => e.id === project.project_leader_id);
        const leaderAbbr = leader?.abbreviation || leader?.full_name?.charAt(0) || '-';
        const leaderColorClass = getLeaderColor(leader?.abbreviation);

        return (
          <tr key={project.id} className="border-b bg-red-50">
            <td className="p-2 text-center">
              <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${leaderColorClass}`}>{leaderAbbr}</span>
            </td>
            <td className="p-2 font-medium text-gray-900 dark:text-white text-sm">{project.name}</td>
            <td className="p-2 text-center">
              {(() => {
                const overnightStr = countOvernightStaff ? weekDays.map(d => countOvernightStaff(project.id, d)).join('-') : '';
                return overnightStr && !/^0-0-0-0-0$/.test(overnightStr) ? <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">{overnightStr}</Badge> : null;
              })()}
            </td>
            {weekDays.map((day, dayIndex) => {
              const cellAssignments = sortAssignments(getAssignmentsForCell(project.id, day), day);
              const dateStr = format(day, 'yyyy-MM-dd');
              const holidayName = getPublicHolidayName(day, 'NRW');
              const bridgeDay = isBridgeDay ? isBridgeDay(day) : false;
              const dayOff = holidayName || bridgeDay;
              return (
                <td key={dayIndex} className={`p-1 border-l ${holidayName ? 'bg-orange-50' : bridgeDay ? 'bg-green-50' : ''}`} onDoubleClick={(e) => { if (!dayOff) { e.stopPropagation(); onCellDoubleClick && onCellDoubleClick(project.id, day); } }}>
                  {dayOff ? <div className="min-h-[60px]" /> : (
                    <Droppable droppableId={`cell_${project.id}_${dateStr}`}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[60px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-red-100' : 'bg-red-50'}`}>
                          <div className="flex flex-wrap gap-1 items-start">
                            {cellAssignments.map((assignment, i) => {
                              if (!assignment.employee_id && assignment.notes) {
                                 const isTS = assignment.notes === 'TS';
                                 return (
                                   <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                                     {(provided, snapshot) => (
                                       <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                         onDoubleClick={(e) => { if (isTS) { e.stopPropagation(); onToggleTsOvernight && onToggleTsOvernight(assignment); } }}
                                         className={`px-2 py-1 rounded text-xs font-medium cursor-grab flex items-center gap-0.5 ${isTS && assignment.is_supervisor ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'} ${snapshot.isDragging ? 'shadow-lg' : ''}`}>
                                         ⚡ {assignment.notes}{isTS && assignment.is_supervisor ? ' 🌙' : ''}
                                         <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDeleteAssignment && onDeleteAssignment(assignment.id); }} className="ml-0.5 hover:bg-orange-700 rounded leading-none">×</button>
                                       </div>
                                     )}
                                   </Draggable>
                                 );
                               }
                               const emp = getEmployee(assignment.employee_id);
                               if (!emp) return null;
                               if (emp.employee_type === 'projektleiter') return null;
                               if (!shouldShowOnDay(emp, dayIndex, day)) return null;
                               return (
                                 <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                                   {(provided, snapshot) => (
                                     <div
                                       ref={provided.innerRef}
                                       {...provided.draggableProps}
                                       {...provided.dragHandleProps}
                                       onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                                       className={`px-2 py-1 rounded text-xs font-medium cursor-grab ${empChipClass(emp, day)} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                     >
                                       {getDisplayName(emp)}
                                     </div>
                                   )}
                                 </Draggable>
                               );
                              })}
                              {getTempWorkersForCell(project.id, day).map((tempWorker, idx) => (
                               <Badge key={`temp_${tempWorker.id}_${idx}`} variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300">
                                 {tempWorker.full_name}
                               </Badge>
                              ))}
                              </div>
                              {provided.placeholder}
                              <div className="flex items-center justify-between mt-auto pt-1 relative">
                                <div className="flex-1">
                                  {(() => {
                                    const firstWorkDay = weekDays.find(d => !getPublicHolidayName(d, 'NRW') && !(isBridgeDay && isBridgeDay(d)));
                                    const isFirstWorkDay = firstWorkDay && format(day, 'yyyy-MM-dd') === format(firstWorkDay, 'yyyy-MM-dd');
                                    if (isFirstWorkDay && onCopyFromDay && weekStart) {
                                      return (
                                        <PreviousWeekDayPicker
                                          project={project}
                                          targetDay={day}
                                          prevWeekMonday={addDays(weekStart, -7)}
                                          onCopy={onCopyFromDay}
                                        />
                                      );
                                    } else if (!isFirstWorkDay && dayIndex > 0 && onCopyFromPreviousDay) {
                                      return (
                                        <button
                                          onClick={() => onCopyFromPreviousDay(project.id, day)}
                                          className="w-full text-[7px] text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded px-0.5 py-0.5 leading-tight transition-colors no-print"
                                          title="Vortag übernehmen"
                                        >
                                          ⇦ Vortag
                                        </button>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                              </div>
                              </div>
                              )}
                              </Droppable>
                              )}
                              </td>
                              );
                              })}
                              <td className="p-1 border-l bg-red-50/30" onDoubleClick={(e) => { e.stopPropagation(); onCellDoubleClick && onCellDoubleClick(project.id, nextMonday); }}>
                              <Droppable droppableId={`cell_${project.id}_${format(nextMonday, 'yyyy-MM-dd')}`}>
                              {(provided, snapshot) => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[60px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-red-100' : ''}`}>
                              <div className="flex flex-wrap gap-1 items-start">
                              {sortAssignments(getAssignmentsForCell(project.id, nextMonday), nextMonday).map((assignment, i) => {
                        if (!assignment.employee_id && assignment.notes) {
                          return (
                            <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                  className={`px-2 py-1 rounded text-xs font-medium cursor-grab bg-orange-500 text-white flex items-center gap-0.5 ${snapshot.isDragging ? 'shadow-lg' : ''}`}>
                                  ⚡ {assignment.notes}
                                  <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onDeleteAssignment && onDeleteAssignment(assignment.id); }} className="ml-0.5 hover:bg-orange-700 rounded leading-none">×</button>
                                </div>
                              )}
                            </Draggable>
                          );
                        }
                        const emp = getEmployee(assignment.employee_id);
                         if (!emp) return null;
                         if (emp.employee_type === 'projektleiter') return null;
                         return (
                           <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                             {(provided, snapshot) => (
                               <div
                                 ref={provided.innerRef}
                                 {...provided.draggableProps}
                                 {...provided.dragHandleProps}
                                 onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                                 className={`px-2 py-1 rounded text-xs font-medium cursor-grab ${empChipClass(emp, nextMonday)} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                 >
                                 {emp.employee_type === 'azubi' ? getDisplayName(emp) : emp.full_name}
                                 </div>
                                 )}
                                 </Draggable>
                                 );
                                 })}
                                 {getTempWorkersForCell(project.id, nextMonday).map((tempWorker, idx) => (
                                 <Badge key={`temp_${tempWorker.id}_${idx}`} variant="outline" className="text-xs bg-purple-100 text-purple-800 border-purple-300">
                                 {tempWorker.full_name}
                                 </Badge>
                                 ))}
                                 </div>
                                 {provided.placeholder}
                                 {onCopyFromDay && weekStart && (
                                   <PreviousWeekDayPicker
                                     project={project}
                                     targetDay={nextMonday}
                                     prevWeekMonday={weekStart}
                                     onCopy={onCopyFromDay}
                                   />
                                 )}
                                 </div>
                                 )}
                                 </Droppable>
                                 </td>
                                 <td className="p-1 text-center">
                                 {(() => {
                                   const overnightStr = countOvernightStaff ? nextWeekDays.map(d => countOvernightStaff(project.id, d)).join('-') : '';
                                   return overnightStr && !/^0-0-0-0-0$/.test(overnightStr) ? (
                                     <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[9px] px-1">
                                       {overnightStr}
                                     </Badge>
                                   ) : null;
                                 })()}
                                 </td>
                                 <td className="p-2 text-center text-sm text-gray-600 dark:text-gray-300">
                                 {(project.completion_date || project.completion_date_text) ? (
                                   <span>
                                     {project.completion_date ? format(new Date(project.completion_date), 'd.M.yy') : ''}
                                     {project.completion_date && project.completion_date_text ? ' · ' : ''}
                                     {project.completion_date_text || ''}
                                   </span>
                                 ) : '-'}
                                 </td>
                                 <td className="p-0.5 min-w-[100px]">
                                 <Input
                                 value={project.lead_assembler || ''}
                                 onChange={(e) => {
                                 const updatedProjects = projects.map(p => p.id === project.id ? {...p, lead_assembler: e.target.value} : p);
                                 setProjects(updatedProjects);
                                 }}
                                 onBlur={async () => {
                                 try {
                                 await api.entities.Project.update(project.id, { lead_assembler: project.lead_assembler });
                                 } catch (error) {
                                 console.error('Error updating lead assembler:', error);
                                 }
                                 }}
                                 placeholder="Name..."
                                 className="h-6 text-[9px]"
                                 />
                                 </td>
            <td className="p-2 font-medium text-gray-900 dark:text-white text-sm max-w-[20%] break-words">{project.name}</td>
            <td className="p-2 text-center">
              <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${leaderColorClass}`}>{leaderAbbr}</span>
            </td>
          </tr>
        );
      })}

      {/* Werkstatt Row */}
      <tr className="bg-green-100 dark:bg-green-900/30 border-t-2 border-green-300 dark:border-green-800 border-b-2">
        <td className="p-1 text-center font-bold text-green-800 dark:text-green-300 text-[11px]">WS</td>
        <td className="p-1 font-semibold text-green-800 dark:text-green-300 text-[11px]">Werkstatt</td>
        <td className="p-0.5"></td>
        {weekDays.map((day, dayIndex) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const workshopAssignments = sortAssignments(getAssignmentsForCell('workshop', day), day);
          return (
            <td key={dayIndex} className="p-1 border-l" onDoubleClick={(e) => { e.stopPropagation(); onCellDoubleClick && onCellDoubleClick('workshop', day); }}>
              <Droppable droppableId={`workshop_workshop_${dateStr}`}>
                {(provided, snapshot) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[60px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-green-200' : 'bg-green-50'}`}>
                    <div className="flex flex-wrap gap-1 items-start">
                      {workshopAssignments.map((assignment, i) => {
                        const emp = getEmployee(assignment.employee_id);
                        if (!emp) return null;
                        const displayInfo = getPrintEmployeeDisplay(emp);
                        return (
                          <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                                className={`px-2 py-1 rounded text-xs font-medium cursor-grab print:border-0 print:bg-transparent ${empChipClassPrint(emp, day)} ${snapshot.isDragging ? 'shadow-lg' : ''} ${displayInfo.class}`}
                              >
                                {emp.employee_type === 'azubi' ? getDisplayName(emp) : emp.full_name}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                    </div>
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </td>
          );
        })}
        <td className="p-1 border-l bg-green-50" onDoubleClick={(e) => { e.stopPropagation(); onCellDoubleClick && onCellDoubleClick('workshop', nextMonday); }}>
          <Droppable droppableId={`workshop_workshop_${format(nextMonday, 'yyyy-MM-dd')}`}>
            {(provided, snapshot) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[60px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-green-200' : 'bg-green-50'}`}>
                <div className="flex flex-wrap gap-1 items-start">
                  {sortAssignments(getAssignmentsForCell('workshop', nextMonday), nextMonday).map((assignment, i) => {
                    const emp = getEmployee(assignment.employee_id);
                    if (!emp) return null;
                    const displayInfo = getPrintEmployeeDisplay(emp);
                    return (
                      <Draggable key={assignment.id} draggableId={assignment.id} index={i}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                            className={`px-2 py-1 rounded text-xs font-medium cursor-grab print:border-0 print:bg-transparent ${empChipClassPrint(emp, nextMonday)} ${snapshot.isDragging ? 'shadow-lg' : ''} ${displayInfo.class}`}
                          >
                            {emp.employee_type === 'azubi' ? getDisplayName(emp) : emp.full_name}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                </div>
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </td>
        <td className="p-2"></td>
        <td className="p-2"></td>
        <td className="p-2"></td>
        <td className="p-2"></td>
        <td className="p-2"></td>
      </tr>

      {/* EF Projects */}
      <EFProjectsSection
        efProjects={efProjects}
        weekDays={weekDays}
        nextMonday={nextMonday}
        employees={employees}
        getLeaderColor={getLeaderColor}
        countOvernightStaff={countOvernightStaff}
        countOvernightStaffForWeek={countOvernightStaffForWeek}
        getAssignmentsForCell={getAssignmentsForCell}
        getTempWorkersForCell={getTempWorkersForCell}
        getEmployee={getEmployee}
        shouldShowOnDay={shouldShowOnDay}
        getDisplayName={getDisplayName}
        handleEmployeeDoubleClick={handleEmployeeDoubleClick}
        empChipClass={empChipClass}
        setProjects={setProjects}
        projects={projects}
      />

      {/* Absence Rows */}
      {absenceTypes.map(({ key, label }) => (
        <tr key={key} className="border-b dark:border-gray-700 border-t-2 border-gray-300 dark:border-gray-600">
          <td className="p-2 text-center"></td>
          <td className="p-2 font-medium text-gray-600 dark:text-gray-300 text-sm">{label}</td>
          <td className="p-2"></td>
          {weekDays.map((day, i) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const absences = getAbsenceAssignments(key, day);
            return (
              <td key={i} className="p-1 border-l">
                <Droppable droppableId={`absence_${key}_${dateStr}`}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[40px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-amber-50' : 'bg-gray-50/50'}`}>
                      <div className="flex flex-wrap gap-1 items-start">
                        {absences.map((assignment, idx) => {
                          const emp = getEmployee(assignment.employee_id);
                          if (!emp) return null;
                          const showEndDate = ['urlaub', 'krank', 'beurlaubung'].includes(key);
                          const endDate = showEndDate && getAbsenceEndDate ? getAbsenceEndDate(emp.id, key, dateStr) : null;
                          const endLabel = endDate ? ` (${format(new Date(endDate), 'd.M.')})` : '';
                          return (
                            <Draggable key={assignment.id} draggableId={assignment.id} index={idx}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                                  className={`px-2 py-1 rounded text-xs font-medium cursor-grab bg-amber-500 text-white ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                >
                                  {getDisplayName(emp)}{endLabel}
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                      </div>
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </td>
            );
          })}
          <td className="p-1 border-l bg-blue-50/30">
            <Droppable droppableId={`absence_${key}_${format(nextMonday, 'yyyy-MM-dd')}`}>
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className={`min-h-[40px] rounded-lg p-1 ${snapshot.isDraggingOver ? 'bg-amber-50' : ''}`}>
                  <div className="flex flex-wrap gap-1 items-start">
                    {getAbsenceAssignments(key, nextMonday).map((assignment, idx) => {
                      const emp = getEmployee(assignment.employee_id);
                      if (!emp) return null;
                      const nextMondayStr = format(nextMonday, 'yyyy-MM-dd');
                      const showEndDate = ['urlaub', 'krank', 'beurlaubung'].includes(key);
                      const endDate = showEndDate && getAbsenceEndDate ? getAbsenceEndDate(emp.id, key, nextMondayStr) : null;
                      const endLabel = endDate ? ` (${format(new Date(endDate), 'd.M.')})` : '';
                      return (
                        <Draggable key={assignment.id} draggableId={assignment.id} index={idx}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onDoubleClick={(e) => { e.stopPropagation(); handleEmployeeDoubleClick(emp); }}
                              className={`px-2 py-1 rounded text-xs font-medium cursor-grab bg-amber-500 text-white ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                            >
                              {getDisplayName(emp)}{endLabel}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                  </div>
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </td>
          <td className="p-2"></td>
          <td className="p-2"></td>
          <td className="p-2"></td>
          <td className="p-2"></td>
          <td className="p-2"></td>
        </tr>
      ))}
    </tbody>
  );
}