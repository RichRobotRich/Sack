import React from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { format, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

export default function EFProjectsSection({
  efProjects,
  weekDays,
  nextMonday,
  employees,
  getLeaderColor,
  countOvernightStaff,
  countOvernightStaffForWeek,
  getAssignmentsForCell,
  getTempWorkersForCell,
  getEmployee,
  shouldShowOnDay,
  getDisplayName,
  handleEmployeeDoubleClick,
  empChipClass,
  setProjects,
  projects
}) {
  const nextWeekDays = nextMonday ? [0, 1, 2, 3, 4].map(i => addDays(nextMonday, i)) : [];
  return (
    <>
      {efProjects.map((project) => {
        const leader = employees.find(e => e.id === project.project_leader_id);
        const leaderAbbr = leader?.abbreviation || leader?.full_name?.charAt(0) || '-';
        const leaderColorClass = getLeaderColor(leader?.abbreviation);

        return (
          <tr key={project.id} className="border-b bg-yellow-50">
            <td className="p-2 text-center">
              <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${leaderColorClass}`}>
                {leaderAbbr}
              </span>
            </td>
            <td className="p-2 font-medium text-gray-900 text-sm">
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
              const cellAssignments = getAssignmentsForCell(project.id, day);
              const dateStr = format(day, 'yyyy-MM-dd');

              return (
                <td key={dayIndex} className="p-1 border-l">
                  <Droppable droppableId={`cell_${project.id}_${dateStr}`}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`min-h-[60px] rounded-lg p-1 ${
                          snapshot.isDraggingOver ? 'bg-yellow-100' : 'bg-yellow-50'
                        }`}
                      >
                        <div className="flex flex-wrap gap-1 items-start">
                          {cellAssignments.map((assignment, i) => {
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
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      handleEmployeeDoubleClick(emp);
                                    }}
                                    className={`px-2 py-1 rounded text-xs font-medium cursor-grab ${empChipClass ? empChipClass(emp, day) : 'bg-[#1e3a5f] text-white'} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                                  >
                                    {getDisplayName(emp)}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {getTempWorkersForCell(project.id, day).map((tempWorker, idx) => (
                            <Badge
                              key={`temp_${tempWorker.id}_${idx}`}
                              variant="outline"
                              className="text-xs bg-purple-100 text-purple-800 border-purple-300"
                            >
                              {tempWorker.full_name}
                            </Badge>
                          ))}
                        </div>
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </td>
              );
            })}
            <td className="p-1 border-l bg-yellow-50/30">
              <Droppable droppableId={`cell_${project.id}_${format(nextMonday, 'yyyy-MM-dd')}`}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`min-h-[60px] rounded-lg p-1 ${
                      snapshot.isDraggingOver ? 'bg-yellow-100' : ''
                    }`}
                  >
                    <div className="flex flex-wrap gap-1 items-start">
                      {getAssignmentsForCell(project.id, nextMonday).map((assignment, i) => {
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
                                 onDoubleClick={(e) => {
                                   e.stopPropagation();
                                   handleEmployeeDoubleClick(emp);
                                 }}
                                 className={`px-2 py-1 rounded text-xs font-medium cursor-grab ${empChipClass ? empChipClass(emp, nextMonday) : 'bg-[#1e3a5f] text-white'} ${snapshot.isDragging ? 'shadow-lg' : ''}`}
                               >
                                {getDisplayName(emp)}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {getTempWorkersForCell(project.id, nextMonday).map((tempWorker, idx) => (
                        <Badge
                          key={`temp_${tempWorker.id}_${idx}`}
                          variant="outline"
                          className="text-xs bg-purple-100 text-purple-800 border-purple-300"
                        >
                          {tempWorker.full_name}
                        </Badge>
                      ))}
                    </div>
                    {provided.placeholder}
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
            <td className="p-2 text-center text-sm text-gray-600">
              {(project.completion_date || project.completion_date_text) ? (
                <span>
                  {project.completion_date ? format(new Date(project.completion_date), 'd.M.yy') : ''}
                  {project.completion_date && project.completion_date_text ? ' · ' : ''}
                  {project.completion_date_text || ''}
                </span>
              ) : '-'}
            </td>
            <td className="p-2">
              <Input
                value={project.lead_assembler || ''}
                onChange={(e) => {
                  const updatedProjects = projects.map(p =>
                    p.id === project.id ? {...p, lead_assembler: e.target.value} : p
                  );
                  setProjects(updatedProjects);
                }}
                onBlur={async () => {
                  try {
                    await base44.entities.Project.update(project.id, {
                      lead_assembler: project.lead_assembler
                    });
                  } catch (error) {
                    console.error('Error updating lead assembler:', error);
                  }
                }}
                placeholder="Name..."
                className="h-8 text-xs"
              />
            </td>
            <td className="p-2 font-medium text-gray-900 text-sm">
              {project.name}
            </td>
            <td className="p-2 text-center">
              <span className={`inline-block px-2 py-1 rounded font-bold text-sm ${leaderColorClass}`}>
                {leaderAbbr}
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}