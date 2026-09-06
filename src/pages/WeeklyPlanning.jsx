import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, addDays, startOfWeek, addWeeks, getWeek } from 'date-fns';
import { isPublicHoliday, getPublicHolidayName, getNextWorkday } from '../utils/publicHolidays';
import { de } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Printer,
  RefreshCw,
  Moon,
  GripVertical,
  AlertTriangle,
  Check,
  Calendar,
  X,
  FileText,
  Copy,
  ListOrdered
} from 'lucide-react';
import { generateWeeklyPlanningPDF } from '../components/WeeklyPlanningPDF';
import { invalidateBridgeDayCache } from '../lib/bridgeDays';
import CrewMoveDialog from '../components/CrewMoveDialog';
import AzubiMoveDialog from '../components/AzubiMoveDialog';
import EmployeeEditDialog from '../components/EmployeeEditDialog';
import ProjectLeaderSortDialog, { loadPlSortOrder, savePlSortOrder, sortProjectsByPlOrder, getPoolSplitIndex } from '../components/ProjectLeaderSortDialog';
import EFProjectsSection from '../components/EFProjectsSection';
import WeeklyPlanningTableBody from '../components/WeeklyPlanningTableBody';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

export default function WeeklyPlanning() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [tempWorkers, setTempWorkers] = useState([]);
  const [tempAssignments, setTempAssignments] = useState([]);
  const [projectComments, setProjectComments] = useState([]);
  const [cellInfos, setCellInfos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    return startOfWeek(addWeeks(today, 1), { weekStartsOn: 1 });
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    employee_type: 'monteur',
    abbreviation: '',
    overnight_stay_weeks: [],
    apprentice_year: '',
    school_days: [],
    vacation_periods: [],
    tbz_periods: [],
    exam_periods: [],
    phone: '',
    email: '',
    is_active: true,
    remark: ''
  });
  const [cellClickDialog, setCellClickDialog] = useState(null); // { projectId, day }
  const [cellSearch, setCellSearch] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [bridgeDays, setBridgeDays] = useState(new Set()); // Set of 'yyyy-MM-dd' strings

  const weekDays = [0, 1, 2, 3, 4].map(i => addDays(weekStart, i));
  const nextMondayRaw = addDays(weekStart, 7);
  const nextMonday = getNextWorkday(nextMondayRaw, 'NRW');

  useEffect(() => {
    loadData();
    api.entities.Crew.list().then(setCrews).catch(() => {});
  }, [weekStart]);

  useEffect(() => {
    if (employees.length > 0 && assignments.length >= 0 && leaveRequests.length >= 0) {
      autoAssignApprovedLeave();
      autoAssignSchoolDays();
    }
  }, [employees, leaveRequests]);

  const loadData = async () => {
     setLoading(true);
     try {
       const [projectsData, employeesData, assignmentsData, leaveRequestsData, tempWorkersData, tempAssignmentsData, projectCommentsData, cellInfosData, bridgeDaysData, currentUser] = await Promise.all([
         api.entities.Project.filter({ status: 'aktiv' }),
         api.entities.Employee.filter({ is_active: true }),
         api.entities.Assignment.list(),
         api.entities.LeaveRequest.filter({ status: 'genehmigt', request_type: 'urlaub' }),
         api.entities.TempWorker.filter({ is_active: true }),
         api.entities.TempAssignment.list(),
         api.entities.ProjectComment.list(),
         api.entities.CellInfo.list(),
         api.entities.BridgeDay.list(),
         api.auth.me()
       ]);

       // Duplikate bereinigen: gleicher Mitarbeiter + gleicher Tag → nur ersten behalten, Rest löschen
       // AUSNAHME: Einträge ohne employee_id (Schweißer/Bedarf-Platzhalter) werden nie als Duplikate behandelt
       const seen = new Map(); // key: "employeeId_date"
       const duplicateIds = [];
       for (const a of assignmentsData) {
         if (!a.employee_id) continue; // Platzhalter (Schweißer/Bedarf) überspringen
         const key = `${a.employee_id}_${a.date}`;
         if (seen.has(key)) {
           duplicateIds.push(a.id);
         } else {
           seen.set(key, a.id);
         }
       }
       if (duplicateIds.length > 0) {
         await Promise.all(duplicateIds.map(id => api.entities.Assignment.delete(id)));
         // Assignments ohne Duplikate weiterverwenden
         const cleanedAssignments = assignmentsData.filter(a => !duplicateIds.includes(a.id));
         assignmentsData.splice(0, assignmentsData.length, ...cleanedAssignments);
       }

       // Teile Projekte in normale, EF und TS-Projekte
       const normalProjects = projectsData.filter(p => !p.is_ts_project && !p.is_ef_project);
       const efProjects = projectsData.filter(p => p.is_ef_project && !p.is_ts_project).sort((a, b) => {
         const leaderA = employeesData.find(e => e.id === a.project_leader_id);
         const leaderB = employeesData.find(e => e.id === b.project_leader_id);
         const nameA = leaderA?.abbreviation || leaderA?.full_name || '';
         const nameB = leaderB?.abbreviation || leaderB?.full_name || '';
         return nameA.localeCompare(nameB);
       });
       const tsProjects = projectsData.filter(p => p.is_ts_project).sort((a, b) => {
         const leaderA = employeesData.find(e => e.id === a.project_leader_id);
         const leaderB = employeesData.find(e => e.id === b.project_leader_id);
         const nameA = leaderA?.abbreviation || leaderA?.full_name || '';
         const nameB = leaderB?.abbreviation || leaderB?.full_name || '';
         return nameA.localeCompare(nameB);
       });

       // Sortiere normale Projekte nach PL-Reihenfolge (DB hat Vorrang, dann localStorage)
       const dbSortOrder = currentUser?.pl_sort_order;
       if (dbSortOrder && dbSortOrder.length > 0) {
         savePlSortOrder(dbSortOrder); // DB → localStorage sync
       }
       const currentSortOrder = (dbSortOrder && dbSortOrder.length > 0) ? dbSortOrder : (loadPlSortOrder() || []);
       const getAbbr = (p) => {
         const leader = employeesData.find(e => e.id === p.project_leader_id);
         return leader?.abbreviation || leader?.full_name || '';
       };
       const sortedProjects = currentSortOrder.length > 0
         ? sortProjectsByPlOrder(normalProjects, currentSortOrder, getAbbr)
         : normalProjects.sort((a, b) => getAbbr(a).localeCompare(getAbbr(b)));

       // Kombiniere: normale Projekte zuerst, dann TS-Projekte, dann EF-Projekte
       setProjects([...sortedProjects, ...tsProjects, ...efProjects]);
       setEmployees(employeesData);
       setAssignments(assignmentsData);
       setLeaveRequests(leaveRequestsData);
       setTempWorkers(tempWorkersData);
       setTempAssignments(tempAssignmentsData);
       setProjectComments(projectCommentsData);
       setCellInfos(cellInfosData);
       setBridgeDays(new Set((bridgeDaysData || []).map(d => d.date)));
       } catch (error) {
       console.error('Error loading data:', error);
       } finally {
       setLoading(false);
       }
       };

    const isInVacation = (date, vacationPeriods) => {
      if (!vacationPeriods || vacationPeriods.length === 0) return false;
      
      const dateStr = format(date, 'yyyy-MM-dd');
      return vacationPeriods.some(period => {
        return dateStr >= period.start_date && dateStr <= period.end_date;
      });
    };

    const isInTBZ = (date, tbzPeriods) => {
      if (!tbzPeriods || tbzPeriods.length === 0) return false;

      const dateStr = format(date, 'yyyy-MM-dd');
      return tbzPeriods.some(period => {
        return dateStr >= period.start_date && dateStr <= period.end_date;
      });
    };

    const isInExam = (date, examPeriods) => {
      if (!examPeriods || examPeriods.length === 0) return false;
      const dateStr = format(date, 'yyyy-MM-dd');
      return examPeriods.some(period => dateStr >= period.start_date && dateStr <= period.end_date);
    };

    const autoAssignApprovedLeave = async () => {
      if (leaveRequests.length === 0) return;

      const today = new Date();
      const assignmentsToCreate = [];
      
      for (const leaveRequest of leaveRequests) {
        // Nur Urlaubsanträge mit verknüpftem Mitarbeiter berücksichtigen
        if (!leaveRequest.employee_id) continue;
        
        const startDate = new Date(leaveRequest.start_date);
        const endDate = new Date(leaveRequest.end_date);
        
        // Nur zukünftige oder aktuelle Urlaube berücksichtigen
        if (endDate < today) continue;
        
        let currentDate = startDate < today ? today : startDate;
        
        while (currentDate <= endDate) {
          const dateStr = format(currentDate, 'yyyy-MM-dd');
          
          // Wochenenden und Feiertage überspringen
          const dayOfWeek = currentDate.getDay();
          if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isPublicHoliday(currentDate, 'NRW')) {
            // Prüfen, ob bereits eine Zuweisung existiert
            const existingAssignment = assignments.find(a => 
              a.employee_id === leaveRequest.employee_id && 
              a.date === dateStr
            );
            
            if (!existingAssignment) {
              assignmentsToCreate.push({
                employee_id: leaveRequest.employee_id,
                date: dateStr,
                assignment_type: 'urlaub',
                project_id: null
              });
            }
          }
          
          currentDate = addDays(currentDate, 1);
        }
      }
      
      if (assignmentsToCreate.length > 0) {
        try {
          await api.entities.Assignment.bulkCreate(assignmentsToCreate);
          await loadData();
        } catch (error) {
          console.error('Error auto-assigning approved leave:', error);
        }
      }
    };

    const autoAssignSchoolDays = async () => {
      const azubis = employees.filter(e => e.employee_type === 'azubi');
      if (azubis.length === 0) return;

      const today = new Date();
      const assignmentsToCreate = [];
      const assignmentsToDelete = [];
      
      for (const azubi of azubis) {
        for (let week = 0; week < 6; week++) {
          const currentWeekStart = startOfWeek(addWeeks(today, week), { weekStartsOn: 1 });
          
          for (let dayIndex = 0; dayIndex < 5; dayIndex++) {
            const date = addDays(currentWeekStart, dayIndex);
            
            if (date < today) continue;
            
            const dateStr = format(date, 'yyyy-MM-dd');
            
            const existingAssignment = assignments.find(a => 
              a.employee_id === azubi.id && 
              a.date === dateStr
            );

            // Wenn ein Schule-Assignment existiert aber Ferienzeit → löschen
            if (existingAssignment && existingAssignment.assignment_type === 'schule') {
              if (isInVacation(date, azubi.vacation_periods)) {
                assignmentsToDelete.push(existingAssignment.id);
                continue;
              }
            }

            // Wenn kein Prüfungs-Assignment existiert aber Prüfungszeit → löschen und neu anlegen
            if (existingAssignment && existingAssignment.assignment_type !== 'pruefung' && isInExam(date, azubi.exam_periods)) {
              assignmentsToDelete.push(existingAssignment.id);
              assignmentsToCreate.push({
                employee_id: azubi.id,
                date: dateStr,
                assignment_type: 'pruefung',
                project_id: null
              });
              continue;
            }
            
            if (existingAssignment) continue;

            if (isInExam(date, azubi.exam_periods)) {
              assignmentsToCreate.push({
                employee_id: azubi.id,
                date: dateStr,
                assignment_type: 'pruefung',
                project_id: null
              });
              continue;
            }
            
            if (isInTBZ(date, azubi.tbz_periods)) {
              assignmentsToCreate.push({
                employee_id: azubi.id,
                date: dateStr,
                assignment_type: 'tbz',
                project_id: null
              });
              continue;
            }
            
            if (azubi.school_days && azubi.school_days.includes(dayIndex)) {
              if (isInVacation(date, azubi.vacation_periods)) continue;
              
              assignmentsToCreate.push({
                employee_id: azubi.id,
                date: dateStr,
                assignment_type: 'schule',
                project_id: null
              });
            }
          }
        }
      }
      
      const hasChanges = assignmentsToCreate.length > 0 || assignmentsToDelete.length > 0;
      if (hasChanges) {
        try {
          if (assignmentsToDelete.length > 0) {
            await Promise.all(assignmentsToDelete.map(id => api.entities.Assignment.delete(id)));
          }
          if (assignmentsToCreate.length > 0) {
            await api.entities.Assignment.bulkCreate(assignmentsToCreate);
          }
          await loadData();
          if (assignmentsToDelete.length > 0) {
            toast.success(`${assignmentsToDelete.length} Schultage wegen Ferien entfernt`);
          } else {
            const schoolCount = assignmentsToCreate.filter(a => a.assignment_type === 'schule').length;
            const tbzCount = assignmentsToCreate.filter(a => a.assignment_type === 'tbz').length;
            if (schoolCount > 0 || tbzCount > 0) {
              toast.success(`${schoolCount} Schultage und ${tbzCount} TBZ-Tage für die nächsten 6 Wochen eingeplant`);
            }
          }
        } catch (error) {
          console.error('Error auto-assigning school days:', error);
          toast.error('Fehler beim automatischen Einplanen');
        }
      }
    };

  const getEmployee = (id) => employees.find(e => e.id === id);

  // Gibt das letzte Datum einer zusammenhängenden Abwesenheitsphase zurück (ab gegebenem Datum)
  const getAbsenceEndDate = (employeeId, absenceType, fromDateStr) => {
    const sorted = assignments
      .filter(a => a.employee_id === employeeId && a.assignment_type === absenceType)
      .map(a => a.date)
      .sort();
    if (sorted.length === 0) return null;
    // Finde aufeinanderfolgende Arbeitstage ab fromDateStr
    // Wochenenden UND Feiertage (NRW) gelten als Lücke, unterbrechen aber NICHT die Folge
    let last = fromDateStr;
    const dateSet = new Set(sorted);
    let d = new Date(fromDateStr);
    while (true) {
      d.setDate(d.getDate() + 1);
      // Nicht-Arbeitstage überspringen (Wochenende + Feiertage NRW)
      let safety = 0;
      while (safety < 20) {
        const dow = d.getDay();
        if (dow !== 0 && dow !== 6 && !isPublicHoliday(d, 'NRW')) break;
        d.setDate(d.getDate() + 1);
        safety++;
      }
      const next = format(d, 'yyyy-MM-dd');
      if (dateSet.has(next)) {
        last = next;
      } else {
        break;
      }
    }
    return last === fromDateStr ? null : last;
  };
  const getProject = (id) => projects.find(p => p.id === id);
  const getTempWorker = (id) => tempWorkers.find(w => w.id === id);

  const getTempWorkersForCell = (projectId, date) => {
    const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
    const weekStartStr = format(weekStartDate, 'yyyy-MM-dd');
    const dayOfWeek = date.getDay();
    
    if (dayOfWeek === 0 || dayOfWeek === 6) return [];
    
    return tempAssignments
      .filter(ta => ta.project_id === projectId && ta.week_start === weekStartStr)
      .map(ta => getTempWorker(ta.temp_worker_id))
      .filter(w => w && w.is_active && !w.is_ef);
  };

  const normalProjects = projects.filter(p => !p.is_ts_project && !p.is_ef_project);
  const tsProjects = projects.filter(p => p.is_ts_project);
  const efProjects = projects.filter(p => p.is_ef_project && !p.is_ts_project);

  const getAssignmentsForCell = (projectId, date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.filter(a => {
      if (a.project_id && a.project_id !== 'workshop') {
        const projectExists = projects.some(p => p.id === a.project_id);
        if (!projectExists) {
          return false;
        }
      }
      
      return a.project_id === projectId && 
        a.date === dateStr &&
        a.assignment_type === 'baustelle';
    });
  };

  const getAbsenceAssignments = (type, date) => {
    if (bridgeDays.has(format(date, 'yyyy-MM-dd'))) return [];
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.filter(a => {
      const employee = getEmployee(a.employee_id);
      if (!employee || employee.is_ef) return false;
      
      return a.date === dateStr && a.assignment_type === type;
    });
  };

  const getAssignedEmployeeIds = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return new Set(
      assignments
        .filter(a => a.date === dateStr)
        .map(a => a.employee_id)
    );
  };

  const getUnassignedEmployees = (date, dayIndex) => {
    if (isPublicHoliday(date, 'NRW')) return [];

    const dateStr = format(date, 'yyyy-MM-dd');
    const assignedIds = getAssignedEmployeeIds(date);
    
    const orphanedAssignments = assignments.filter(a => {
      if (a.date !== dateStr) return false;
      if (!a.project_id || a.project_id === 'workshop') return false;
      if (a.assignment_type !== 'baustelle') return false;
      
      const projectExists = projects.some(p => p.id === a.project_id);
      return !projectExists;
    });
    
    const orphanedEmployeeIds = new Set(orphanedAssignments.map(a => a.employee_id));
    
    return employees
      .filter(e => e.employee_type !== 'projektleiter' && e.employee_type !== 'buerokraft' && e.employee_type !== 'lagerist')
      .filter(e => !e.is_ef)
      .filter(e => {
        if (!shouldShowOnDay(e, dayIndex, date)) return false;
        return !assignedIds.has(e.id) || orphanedEmployeeIds.has(e.id);
      });
  };

  const getDisplayName = (employee) => {
    let name = '';
    if (employee.employee_type === 'azubi') {
      const lastName = employee.full_name?.split(' ').pop();
      name = `${lastName} ${employee.apprentice_year || ''}`;
    } else {
      name = employee.full_name;
    }
    
    if (employee.remark) {
      return `${name} (${employee.remark})`;
    }
    return name;
  };

  const getPrintEmployeeDisplay = (employee) => {
    if (employee.employee_type === 'azubi') {
      return {
        text: `${employee.full_name} ${employee.apprentice_year || ''}`,
        class: 'font-bold text-black'
      };
    } else if (employee.employee_type === 'praktikant') {
      return {
        text: employee.full_name,
        class: 'text-green-700'
      };
    } else if (employee.employee_type === 'monteur') {
      if (employee.overnight_stay) {
        return {
          text: employee.full_name,
          class: 'text-red-600'
        };
      } else {
        return {
          text: employee.full_name,
          class: 'text-gray-600'
        };
      }
    }
    return {
      text: employee.full_name,
      class: 'text-gray-900'
    };
  };

  const getLeaderColor = (abbreviation) => {
    const colors = [
      'bg-blue-500 text-white',
      'bg-green-500 text-white',
      'bg-purple-500 text-white',
      'bg-orange-500 text-white',
      'bg-pink-500 text-white',
      'bg-indigo-500 text-white',
      'bg-teal-500 text-white',
      'bg-cyan-500 text-white',
      'bg-violet-500 text-white',
      'bg-fuchsia-500 text-white'
    ];
    
    if (!abbreviation) return 'bg-gray-500 text-white';
    
    const charSum = abbreviation.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return colors[charSum % colors.length];
  };

  const monteure = employees.filter(e => e.employee_type === 'monteur' || e.employee_type === 'azubi');

  // Wenn Montag ein Feiertag ist, gehen Übernachtungs-Mitarbeiter Di-Fr statt Mo-Do
  const mondayIsHoliday = isPublicHoliday(weekStart, 'NRW');

  const shouldShowOnDay = (employee, dayIndex, date) => {
    if (employee.employee_type === 'buerokraft') return false;
    if (employee.employee_type === 'lagerist') return false;
    // An Feiertagen (NRW) keine Mitarbeiter anzeigen
    if (date && isPublicHoliday(date, 'NRW')) return false;
    if (!date) return true;
    const weekMon = startOfWeek(date, { weekStartsOn: 1 });
    if (!isOvernightForWeek(employee, weekMon)) return true;
    // Mitarbeiter hat Übernachtungs-KW: prüfen ob er an diesem Tag auf Montage ist
    const entry = employee.overnight_stay_days?.find(e => e.week_start === format(weekMon, 'yyyy-MM-dd'));
    if (entry) {
      // Tagesgenaue Logik: Tag muss in entry.days sein ODER Freitags-Ausnahme
      const dow = date.getDay() === 0 ? 6 : date.getDay() - 1; // 0=Mo,...,4=Fr
      if (entry.days.includes(dow)) return true; // Er ist an diesem Tag auf Montage → zeigen
      if (dow === 4 && isFridayException(employee, date)) return true; // Freitags-Ausnahme
      return false; // Nicht auf Montage an diesem Tag
    }
    // Kein day-Eintrag → Legacy-Verhalten: Mo-Do (Freitag ausblenden außer Ausnahme/Feiertag)
    if (dayIndex === 4 && !mondayIsHoliday && !isFridayException(employee, date)) return false;
    return true;
  };

  // Gibt zurück ob ein Mitarbeiter für die gegebene Woche (Montag) Übernachtung hat
  const isOvernightForWeek = (emp, mondayDate) => {
    if (!emp) return false;
    const mondayStr = format(mondayDate, 'yyyy-MM-dd');
    if (emp.overnight_stay_weeks && emp.overnight_stay_weeks.length > 0) {
      return emp.overnight_stay_weeks.includes(mondayStr);
    }
    // Fallback: Legacy-Feld
    return emp.overnight_stay === true;
  };

  // Gibt zurück ob ein Mitarbeiter an einem konkreten Tag auf Montage ist (gemäß overnight_stay_days)
  // dayOfWeek: 0=Mo, 1=Di, 2=Mi, 3=Do, 4=Fr
  const isOvernightOnDay = (emp, date) => {
    if (!emp) return false;
    const mondayStr = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const entry = emp.overnight_stay_days?.find(e => e.week_start === mondayStr);
    if (!entry) {
      // Kein day-spezifischer Eintrag → Legacy: Mo-Do wenn Übernachtungswoche
      if (!isOvernightForWeek(emp, startOfWeek(date, { weekStartsOn: 1 }))) return false;
      const dow = date.getDay(); // 1=Mo,...,5=Fr
      const dayIndex = dow === 0 ? 6 : dow - 1; // 0=Mo,...,4=Fr
      return dayIndex <= 3; // Mo-Do
    }
    const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1; // 0=Mo,...,4=Fr
    return entry.days.includes(dayIndex);
  };

  // Gibt zurück ob ein Mitarbeiter an einem konkreten Freitag eine Ausnahme hat (d.h. er arbeitet doch)
  const isFridayException = (emp, date) => {
    if (!emp || !emp.friday_exceptions || emp.friday_exceptions.length === 0) return false;
    const dateStr = format(date, 'yyyy-MM-dd');
    return emp.friday_exceptions.includes(dateStr);
  };

  const countOvernightStaff = (projectId, date) => {
     // Zählt Mitarbeiter die an diesem konkreten Tag auf Montage sind (tagesgenau)
     const cellAssignments = getAssignmentsForCell(projectId, date);
     return cellAssignments.filter(a => {
       // TS-Platzhalter mit is_supervisor = Übernachtung
       if (!a.employee_id && a.notes && a.is_supervisor) return true;
       const emp = getEmployee(a.employee_id);
       return isOvernightOnDay(emp, date);
     }).length;
   };

  // Gibt die maximale Anzahl Übernachtungs-Mitarbeiter über alle Wochentage zurück
  const countOvernightStaffForWeek = (projectId, days) => {
    return Math.max(...days.map(day => countOvernightStaff(projectId, day)), 0);
  };

  // Gibt den aktuell gültigen Kommentar für ein Projekt an einem bestimmten Montag zurück.
  // Gültig = start_date <= montagDate, neuester gewinnt.
  const getCommentForProjectOnMonday = (projectId, mondayDate) => {
    const mondayStr = format(mondayDate, 'yyyy-MM-dd');
    const relevant = projectComments
      .filter(c => c.project_id === projectId && c.start_date <= mondayStr)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
    return relevant[0] || null;
  };

  const handleDeleteComment = async (commentId) => {
    setProjectComments(prev => prev.filter(c => c.id !== commentId));
    api.entities.ProjectComment.delete(commentId).catch(() => loadData());
  };

  const handleDeleteCommentFromDate = async (projectId, fromMondayDate) => {
    // Löscht alle Kommentare für dieses Projekt ab diesem Datum (inklusiv)
    const fromStr = format(fromMondayDate, 'yyyy-MM-dd');
    const toDelete = projectComments.filter(c => c.project_id === projectId && c.start_date >= fromStr);
    if (toDelete.length === 0) return;
    setProjectComments(prev => prev.filter(c => !(c.project_id === projectId && c.start_date >= fromStr)));
    toDelete.forEach(c => api.entities.ProjectComment.delete(c.id).catch(() => {}));
    toast.success('Kommentar ab diesem Montag entfernt');
  };

  const getProjectLeaderAbbreviation = (projectId) => {
     const project = getProject(projectId);
     if (!project?.project_leader_id) return '';
     const leader = getEmployee(project.project_leader_id);
     return leader?.abbreviation || '';
   };

  const isEmployeeAssignedOnDay = (employeeId, date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.some(a => a.employee_id === employeeId && a.date === dateStr);
  };

  // Hilfsfunktion: optimistisch den State updaten, dann im Hintergrund speichern
  const optimisticUpdate = (updater, apiCall) => {
    setAssignments(prev => updater(prev));
    apiCall().catch(() => {
      toast.error('Fehler beim Speichern – Daten werden neu geladen');
      loadData();
    });
  };

  // Prüft nach dem Einplanen eines Monteurs: Kolonne + Azubis mitverschieben?
  // assignments_snapshot: aktueller assignments-State BEVOR die neue Zuweisung erstellt wurde
  const checkCrewAndAzubiAfterAssign = (employeeId, destProjectId, dateStr, assignmentsSnapshot) => {
    const emp = employees.find(e => e.id === employeeId);
    if (!emp || emp.employee_type !== 'monteur') return;

    const absenceTypes = ['urlaub', 'krank', 'schule', 'pruefung', 'tbz', 'beurlaubung'];

    // -- Azubi-Check --
    const azubisOfMentor = employees.filter(e => e.employee_type === 'azubi' && e.mentor_id === employeeId);
    const availableAzubis = azubisOfMentor.filter(azubi => {
      const azubiAssignment = assignmentsSnapshot.find(a => a.employee_id === azubi.id && a.date === dateStr);
      if (!azubiAssignment) return false;
      if (absenceTypes.includes(azubiAssignment.assignment_type)) return false;
      if (azubiAssignment.project_id === destProjectId) return false; // schon dort
      return true;
    });

    // -- Kolonnen-Check --
    const crew = crews.find(c => (c.member_ids || []).includes(employeeId));
    const crewMembersOnOtherProject = crew
      ? (crew.member_ids || [])
          .filter(id => id !== employeeId)
          .map(id => {
            const a = assignmentsSnapshot.find(ma => ma.employee_id === id && ma.date === dateStr && ma.assignment_type === 'baustelle');
            if (!a || a.project_id === destProjectId) return null;
            return employees.find(e => e.id === id) || null;
          })
          .filter(Boolean)
      : [];

    const destProject = projects.find(p => p.id === destProjectId);
    const destProjectName = destProject?.name || destProjectId;

    const doMoveAzubis = (azubiIds) => {
      if (azubiIds.length === 0) return;
      for (const azubiId of azubiIds) {
        const azubiAssignment = assignmentsSnapshot.find(a => a.employee_id === azubiId && a.date === dateStr && a.assignment_type === 'baustelle');
        if (azubiAssignment) {
          optimisticUpdate(
            prev => prev.map(a => a.id === azubiAssignment.id ? { ...a, project_id: destProjectId } : a),
            async () => { await api.entities.Assignment.update(azubiAssignment.id, { project_id: destProjectId }); }
          );
        }
      }
      toast.success(`Azubi${azubiIds.length > 1 ? 's' : ''} ebenfalls verschoben`);
    };

    const doMoveCrew = (empIds) => {
      if (empIds.length === 0) return;
      for (const empId of empIds) {
        const a = assignmentsSnapshot.find(ma => ma.employee_id === empId && ma.date === dateStr && ma.assignment_type === 'baustelle');
        if (a) {
          optimisticUpdate(
            prev => prev.map(x => x.id === a.id ? { ...x, project_id: destProjectId } : x),
            async () => { await api.entities.Assignment.update(a.id, { project_id: destProjectId }); }
          );
        }
      }
    };

    // Reihenfolge: erst Kolonnen-Dialog, dann (falls bestätigt) Azubi-Dialog
    const showAzubiDialogIfNeeded = () => {
      if (availableAzubis.length === 0) return;
      setAzubiMoveDialog({
        mentor: emp,
        azubis: availableAzubis,
        destProjectId,
        destProjectName,
        dateStr,
        pendingAction: () => {}, // Haupt-Move bereits erledigt
      });
      // onConfirm im AzubiMoveDialog ruft doMoveAzubis auf – aber wir müssen den Dialog
      // so konfigurieren dass er doMoveAzubis nutzt. Wir überschreiben onConfirm über den State.
      // Eleganterer Weg: wir setzen eine spezielle confirmFn in den Dialog-State.
      setAzubiMoveDialog({
        mentor: emp,
        azubis: availableAzubis,
        destProjectId,
        destProjectName,
        dateStr,
        pendingAction: () => {},
        _customConfirm: doMoveAzubis,
      });
    };

    if (crewMembersOnOtherProject.length > 0) {
      setCrewMoveDialog({
        movedEmployee: emp,
        crewMembers: crewMembersOnOtherProject,
        destProjectId,
        destProjectName,
        dateStr,
        pendingAction: () => showAzubiDialogIfNeeded(),
        _crewConfirmFn: doMoveCrew,
      });
    } else {
      showAzubiDialogIfNeeded();
    }
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;

    if (source.droppableId === destination.droppableId) return;

    const sourceParts = source.droppableId.split('_');
    const destParts = destination.droppableId.split('_');
    const sourceType = sourceParts[0];
    const sourceProjectId = sourceParts.slice(1, -1).join('_');
    const sourceDateStr = sourceParts[sourceParts.length - 1];
    const destType = destParts[0];
    const destProjectId = destParts.slice(1, -1).join('_');
    const destDateStr = destParts[destParts.length - 1];

    const isDifferentDay = sourceDateStr !== destDateStr;
    const isCopyMode = isDifferentDay && sourceType !== 'pool';

    // --- Pool → Zelle ---
    if (sourceType === 'pool' && draggableId.startsWith('pool_')) {
      const employeeId = draggableId.split('_')[1];

      if (isEmployeeAssignedOnDay(employeeId, new Date(destDateStr))) {
        toast.error('Mitarbeiter ist an diesem Tag bereits eingeplant!');
        return;
      }

      const tempId = `temp_${Date.now()}`;

      if (destType === 'cell') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: employeeId, project_id: destProjectId, date: destDateStr, assignment_type: 'baustelle' }],
          async () => {
            const created = await api.entities.Assignment.create({ employee_id: employeeId, project_id: destProjectId, date: destDateStr, assignment_type: 'baustelle' });
            setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
            toast.success('Mitarbeiter eingeplant');
          }
        );
      } else if (destType === 'absence') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: employeeId, date: destDateStr, assignment_type: destProjectId, project_id: null }],
          async () => {
            const created = await api.entities.Assignment.create({ employee_id: employeeId, date: destDateStr, assignment_type: destProjectId, project_id: null });
            setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
            toast.success('Als Abwesenheit markiert');
          }
        );
      } else if (destType === 'workshop') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: employeeId, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' }],
          async () => {
            const created = await api.entities.Assignment.create({ employee_id: employeeId, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' });
            setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
            toast.success('Zur Werkstatt hinzugefügt');
          }
        );
      }
      return;
    }

    const existingAssignment = assignments.find(a => a.id === draggableId);
    if (!existingAssignment) return;

    if (!existingAssignment.notes && destDateStr !== sourceDateStr && isEmployeeAssignedOnDay(existingAssignment.employee_id, new Date(destDateStr))) {
      toast.error('Mitarbeiter ist an diesem Tag bereits eingeplant!');
      return;
    }

    // --- Kopier-Modus (anderer Tag) ---
    if (isCopyMode) {
      const tempId = `temp_${Date.now()}`;
      if (destType === 'cell') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: existingAssignment.employee_id, project_id: destProjectId, date: destDateStr, assignment_type: 'baustelle' }],
          async () => {
            const created = await api.entities.Assignment.create({ employee_id: existingAssignment.employee_id, project_id: destProjectId, date: destDateStr, assignment_type: 'baustelle' });
            setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
            toast.success('Mitarbeiter für diesen Tag eingeplant');
          }
        );
      } else if (destType === 'absence') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: destProjectId, project_id: null }],
          async () => {
            const created = await api.entities.Assignment.create({ employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: destProjectId, project_id: null });
            setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
            toast.success('Als Abwesenheit markiert');
          }
        );
      } else if (destType === 'workshop') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' }],
          async () => {
            const created = await api.entities.Assignment.create({ employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' });
            setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
            toast.success('Zur Werkstatt hinzugefügt');
          }
        );
      }
      return;
    }

    // --- Gleicher Tag, anderes Projekt prüfen ---
    if (destDateStr === sourceDateStr && destType === 'cell' && sourceType === 'cell') {
      if (sourceProjectId !== destProjectId) {
        const otherAssignments = assignments.filter(a =>
          a.id !== existingAssignment.id &&
          a.employee_id === existingAssignment.employee_id &&
          a.date === destDateStr &&
          a.assignment_type === 'baustelle'
        );
        if (otherAssignments.length > 0) {
          toast.error('Mitarbeiter ist an diesem Tag bereits eingeplant!');
          return;
        }
      }
    }

    // Azubi-Check: Prüft ob der Monteur Azubis hat die an diesem Tag nicht abwesend sind
    const checkAzubiAndMove = (moveFn) => {
      const empId = existingAssignment.employee_id;
      const emp = employees.find(e => e.id === empId);
      if (!emp || emp.employee_type !== 'monteur') {
        moveFn();
        return;
      }
      // Nur bei gleicher-Tag-Verschiebung auf eine andere Baustelle
      if (destType !== 'cell' || destDateStr !== sourceDateStr || destProjectId === sourceProjectId) {
        moveFn();
        return;
      }
      // Azubis die diesen Monteur als Betreuer haben
      const absenceAssignmentTypes = ['urlaub', 'krank', 'schule', 'pruefung', 'tbz', 'beurlaubung'];
      const azubisOfMentor = employees.filter(e =>
        e.employee_type === 'azubi' && e.mentor_id === empId
      );
      if (azubisOfMentor.length === 0) {
        moveFn();
        return;
      }
      // Filtere Azubis die an diesem Tag NICHT abwesend sind und auf der Quell-Baustelle eingeplant sind
      const availableAzubis = azubisOfMentor.filter(azubi => {
        const azubiAssignment = assignments.find(a =>
          a.employee_id === azubi.id && a.date === sourceDateStr
        );
        if (!azubiAssignment) return false; // nicht eingeplant, kein Mitverschieben nötig
        if (absenceAssignmentTypes.includes(azubiAssignment.assignment_type)) return false; // abwesend
        if (azubiAssignment.project_id !== sourceProjectId) return false; // auf anderer Baustelle
        return true;
      });
      if (availableAzubis.length === 0) {
        moveFn();
        return;
      }
      const destProject = projects.find(p => p.id === destProjectId);
      setAzubiMoveDialog({
        mentor: emp,
        azubis: availableAzubis,
        destProjectId,
        destProjectName: destProject?.name || destProjectId,
        dateStr: destDateStr,
        pendingAction: moveFn,
      });
    };

    // Kolonnen-Check: Wenn ein Monteur auf eine andere Baustelle bewegt wird (gleicher Tag)
    const doMoveEmployee = () => {
      optimisticUpdate(
        prev => prev.map(a => a.id === existingAssignment.id ? { ...a, project_id: destProjectId, date: destDateStr } : a),
        async () => {
          await api.entities.Assignment.update(existingAssignment.id, { project_id: destProjectId, date: destDateStr });
          toast.success('Mitarbeiter verschoben');
        }
      );
    };

    const checkCrewAndMove = () => {
      // Nur bei gleicher-Tag-Verschiebung auf eine andere Baustelle prüfen
      if (destType !== 'cell' || destDateStr !== sourceDateStr || destProjectId === sourceProjectId) {
        checkAzubiAndMove(doMoveEmployee);
        return;
      }
      const empId = existingAssignment.employee_id;
      const emp = employees.find(e => e.id === empId);
      if (!emp || emp.employee_type !== 'monteur') {
        checkAzubiAndMove(doMoveEmployee);
        return;
      }
      // Suche ob Mitarbeiter in einer Kolonne ist
      const crew = crews.find(c => (c.member_ids || []).includes(empId));
      if (!crew) {
        checkAzubiAndMove(doMoveEmployee);
        return;
      }
      // Andere Mitglieder die an diesem Tag auf der Quell-Baustelle sind
      const otherMemberIds = (crew.member_ids || []).filter(id => id !== empId);
      const otherOnSameProject = otherMemberIds
        .map(id => {
          const assignment = assignments.find(a => a.employee_id === id && a.date === sourceDateStr && a.project_id === sourceProjectId && a.assignment_type === 'baustelle');
          return assignment ? employees.find(e => e.id === id) : null;
        })
        .filter(Boolean);

      if (otherOnSameProject.length === 0) {
        checkAzubiAndMove(doMoveEmployee);
        return;
      }

      const destProject = projects.find(p => p.id === destProjectId);
      setCrewMoveDialog({
        movedEmployee: emp,
        crewMembers: otherOnSameProject,
        destProjectId,
        destProjectName: destProject?.name || destProjectId,
        dateStr: destDateStr,
        // Nach Kolonnen-Dialog → dann noch Azubi-Check
        pendingAction: () => checkAzubiAndMove(doMoveEmployee),
      });
    };

    // --- Verschieben / Löschen (gleicher Tag oder Pool-Drop) ---
    if (destType === 'pool') {
      optimisticUpdate(
        prev => prev.filter(a => a.id !== existingAssignment.id),
        async () => {
          await api.entities.Assignment.delete(existingAssignment.id);
          toast.success('Mitarbeiter aus Planung entfernt');
        }
      );
    } else if (destType === 'cell') {
      checkCrewAndMove();
      return;
    } else if (destType === 'absence') {
      optimisticUpdate(
        prev => prev.map(a => a.id === existingAssignment.id ? { ...a, assignment_type: destProjectId, date: destDateStr, project_id: null } : a),
        async () => {
          await api.entities.Assignment.update(existingAssignment.id, { assignment_type: destProjectId, date: destDateStr, project_id: null });
          toast.success('Als Abwesenheit markiert');
        }
      );
    } else if (destType === 'workshop') {
      optimisticUpdate(
        prev => prev.map(a => a.id === existingAssignment.id ? { ...a, project_id: 'workshop', date: destDateStr } : a),
        async () => {
          await api.entities.Assignment.update(existingAssignment.id, { project_id: 'workshop', date: destDateStr });
          toast.success('Zur Werkstatt verschoben');
        }
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEmployeeDoubleClick = (employee) => {
    setEditingEmployee(employee);
    setEditDialogOpen(true);
  };

  const handleToggleTsOvernight = (assignment) => {
    const newValue = !assignment.is_supervisor;
    optimisticUpdate(
      prev => prev.map(a => a.id === assignment.id ? { ...a, is_supervisor: newValue } : a),
      async () => {
        await api.entities.Assignment.update(assignment.id, { is_supervisor: newValue });
        toast.success(newValue ? 'TS: Übernachtung aktiviert' : 'TS: Übernachtung deaktiviert');
      }
    );
  };

  const handleSaveEmployee = async (formData) => {
    if (!formData.full_name || !editingEmployee) return;
    setSubmitting(true);
    try {
      const updatedData = {
        ...formData,
        apprentice_year: formData.apprentice_year ? parseInt(formData.apprentice_year) : null
      };
      await api.entities.Employee.update(editingEmployee.id, updatedData);
      // Lokal updaten ohne Seite neu zu laden
      setEmployees(prev => prev.map(e => e.id === editingEmployee.id ? { ...e, ...updatedData } : e));
      setEditDialogOpen(false);
      toast.success('Mitarbeiter aktualisiert');
    } catch (error) {
      console.error('Error updating employee:', error);
      toast.error('Fehler beim Speichern');
    } finally {
      setSubmitting(false);
    }
  };

  const absenceTypes = [
    { key: 'urlaub', label: 'Urlaub' },
    { key: 'krank', label: 'Krank' },
    { key: 'schule', label: 'Berufsschule' },
    { key: 'pruefung', label: 'Prüfung' },
    { key: 'tbz', label: 'TBZ' },
    { key: 'beurlaubung', label: 'Beurlaubung' }
  ];

  const getAvailableEmployeesForDay = (day, dayIndex) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const absenceTypes = ['urlaub', 'krank', 'schule', 'pruefung', 'tbz', 'beurlaubung'];
    const absentIds = new Set(
      assignments
        .filter(a => a.date === dateStr && absenceTypes.includes(a.assignment_type))
        .map(a => a.employee_id)
    );
    return employees
      .filter(e => e.employee_type !== 'projektleiter' && e.employee_type !== 'buerokraft' && e.employee_type !== 'lagerist' && !e.is_ef && e.is_active)
      .filter(e => !absentIds.has(e.id))
      .filter(e => !(isOvernightForWeek(e, weekStart) && dayIndex === 4 && !mondayIsHoliday && !isFridayException(e, day)));
  };

  const handleCellAssign = (employeeId) => {
    if (!cellClickDialog) return;
    const { projectId, day } = cellClickDialog;
    const dateStr = format(day, 'yyyy-MM-dd');

    // Platzhalter: Schweißer / Bedarf — Dialog bleibt offen für mehrfaches Hinzufügen
    if (employeeId === '__schweisser__' || employeeId === '__bedarf__' || employeeId === '__ts__') {
      const label = employeeId === '__schweisser__' ? 'Schweißer' : employeeId === '__bedarf__' ? 'Bedarf' : 'TS';
      const tempId = `temp_${Date.now()}`;
      setAssignments(prev => [...prev, { id: tempId, project_id: projectId, date: dateStr, assignment_type: 'baustelle', notes: label }]);
      // Dialog bleibt offen!
      toast.success(`"${label}" eingetragen`);
      (async () => {
        try {
          const created = await api.entities.Assignment.create({ project_id: projectId, date: dateStr, assignment_type: 'baustelle', notes: label });
          setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
        } catch {
          toast.error('Fehler beim Speichern – Daten werden neu geladen');
          loadData();
        }
      })();
      return;
    }

    // Kommentar (nur Montag) – dauerhaft ab diesem Datum
    if (employeeId === '__kommentar__') {
      if (!commentInput.trim()) return;
      // Bestehenden Kommentar für dieses Projekt ab diesem Datum oder später deaktivieren/ersetzen
      // Wir erstellen einen neuen Eintrag; bestehende mit gleichem project_id + start_date >= dateStr bleiben, werden aber visuell überschrieben
      const tempId = `temp_comment_${Date.now()}`;
      const newComment = { id: tempId, project_id: projectId, text: commentInput.trim(), start_date: dateStr };
      setProjectComments(prev => [...prev, newComment]);
      setCellClickDialog(null);
      setCellSearch('');
      setCommentInput('');
      toast.success('Kommentar ab diesem Montag gesetzt');
      (async () => {
        try {
          const created = await api.entities.ProjectComment.create({ project_id: projectId, text: commentInput.trim(), start_date: dateStr });
          setProjectComments(prev => prev.map(c => c.id === tempId ? { ...c, id: created.id } : c));
        } catch {
          toast.error('Fehler beim Speichern');
          loadData();
        }
      })();
      return;
    }

    // Bestehende Baustellen-Zuweisungen an diesem Tag optimistisch entfernen
    const existingIds = assignments
      .filter(a => a.employee_id === employeeId && a.date === dateStr && a.assignment_type === 'baustelle')
      .map(a => a.id);

    const tempId = `temp_${Date.now()}`;
    const newAssignment = { id: tempId, employee_id: employeeId, project_id: projectId, date: dateStr, assignment_type: 'baustelle' };
    // Snapshot BEVOR wir den State ändern (für Kolonne/Azubi-Check)
    const assignmentsBeforeAdd = assignments.filter(a => !existingIds.includes(a.id));

    setAssignments(prev => [
      ...prev.filter(a => !existingIds.includes(a.id)),
      newAssignment
    ]);
    setCellClickDialog(null);
    setCellSearch('');
    toast.success('Mitarbeiter eingeplant');

    // Im Hintergrund speichern
    (async () => {
      try {
        if (existingIds.length > 0) {
          await Promise.all(existingIds.map(id => api.entities.Assignment.delete(id)));
        }
        const created = await api.entities.Assignment.create({ employee_id: employeeId, project_id: projectId, date: dateStr, assignment_type: 'baustelle' });
        setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
      } catch {
        toast.error('Fehler beim Speichern – Daten werden neu geladen');
        loadData();
      }
    })();

    // Kolonne + Azubi-Check nach dem Einplanen
    checkCrewAndAzubiAfterAssign(employeeId, projectId, dateStr, assignmentsBeforeAdd);
  };

  const [crews, setCrews] = useState([]);
  const [crewMoveDialog, setCrewMoveDialog] = useState(null); // { movedEmployee, crewMembers, destProjectId, destProjectName, dateStr, pendingAction }
  const [azubiMoveDialog, setAzubiMoveDialog] = useState(null); // { mentor, azubis, destProjectId, destProjectName, dateStr, pendingAction }
  const [copyingDay, setCopyingDay] = useState(null);
  const [plSortDialogOpen, setPlSortDialogOpen] = useState(false);
  const [plSortOrder, setPlSortOrder] = useState(() => loadPlSortOrder() || []);

  // Kopiert von einem beliebigen Quelltag (sourceDay) auf einen Zieltag (targetDay)
  const onCopyFromDay = async (projectId, sourceDay, targetDay) => {
    const targetDateStr = format(targetDay, 'yyyy-MM-dd');
    const key = `${projectId}_${targetDateStr}_from_${format(sourceDay, 'yyyy-MM-dd')}`;
    if (copyingDay === key) return;
    setCopyingDay(key);

    try {
      const prevDateStr = format(sourceDay, 'yyyy-MM-dd');

      const prevAssignments = assignments.filter(
        a => a.project_id === projectId && a.date === prevDateStr && a.assignment_type === 'baustelle'
      );

      if (prevAssignments.length === 0) {
        toast.info('Keine Einträge vom gewählten Tag gefunden');
        return;
      }

      const existingOnTargetDay = new Set(
        assignments.filter(a => a.date === targetDateStr).map(a => a.employee_id)
      );

      const toCreate = [];
      for (const a of prevAssignments) {
        if (existingOnTargetDay.has(a.employee_id)) continue;
        toCreate.push({ employee_id: a.employee_id, project_id: projectId, date: targetDateStr, assignment_type: 'baustelle' });
      }

      if (toCreate.length === 0) {
        toast.info('Alle Mitarbeiter vom gewählten Tag sind bereits eingeplant');
        return;
      }

      const tempAssigns = toCreate.map((a, i) => ({ ...a, id: `temp_${Date.now()}_${i}` }));
      setAssignments(prev => [...prev, ...tempAssigns]);
      toast.success(`${toCreate.length} Mitarbeiter übernommen`);

      (async () => {
        try {
          const created = await api.entities.Assignment.bulkCreate(toCreate);
          if (Array.isArray(created)) {
            setAssignments(prev => {
              let updated = [...prev];
              tempAssigns.forEach((temp, i) => {
                updated = updated.map(a => a.id === temp.id ? { ...a, id: created[i]?.id || a.id } : a);
              });
              return updated;
            });
          }
        } catch {
          toast.error('Fehler beim Speichern – Daten werden neu geladen');
          loadData();
        }
      })();
    } finally {
      setCopyingDay(null);
    }
  };

  const onCopyFromPreviousDay = async (projectId, targetDay) => {
    const key = `${projectId}_${format(targetDay, 'yyyy-MM-dd')}`;
    if (copyingDay === key) return; // Doppelklick-Schutz
    setCopyingDay(key);

    try {
      const previousDay = addDays(targetDay, -1);
      const prevDateStr = format(previousDay, 'yyyy-MM-dd');
      const targetDateStr = format(targetDay, 'yyyy-MM-dd');

      const prevAssignments = assignments.filter(
        a => a.project_id === projectId && a.date === prevDateStr && a.assignment_type === 'baustelle'
      );

      if (prevAssignments.length === 0) {
        toast.info('Keine Einträge vom Vortag gefunden');
        return;
      }

      // Bereits vorhandene Einträge für diesen Tag holen (aus aktuellem State)
      const existingOnTargetDay = new Set(
        assignments
          .filter(a => a.date === targetDateStr)
          .map(a => a.employee_id)
      );

      const toCreate = [];
      for (const a of prevAssignments) {
        // Überspringe, wenn Mitarbeiter an dem Tag bereits irgendwo eingeplant ist
        if (existingOnTargetDay.has(a.employee_id)) continue;
        toCreate.push({
          employee_id: a.employee_id,
          project_id: projectId,
          date: targetDateStr,
          assignment_type: 'baustelle'
        });
      }

      if (toCreate.length === 0) {
        toast.info('Alle Mitarbeiter vom Vortag sind bereits eingeplant');
        return;
      }

      // Optimistisch hinzufügen
      const tempAssignments = toCreate.map((a, i) => ({ ...a, id: `temp_${Date.now()}_${i}` }));
      setAssignments(prev => [...prev, ...tempAssignments]);
      toast.success(`${toCreate.length} Mitarbeiter vom Vortag übernommen`);

      // Im Hintergrund speichern
      (async () => {
        try {
          const created = await api.entities.Assignment.bulkCreate(toCreate);
          // Temp-IDs durch echte IDs ersetzen
          if (Array.isArray(created)) {
            setAssignments(prev => {
              let updated = [...prev];
              tempAssignments.forEach((temp, i) => {
                updated = updated.map(a => a.id === temp.id ? { ...a, id: created[i]?.id || a.id } : a);
              });
              return updated;
            });
          }
        } catch {
          toast.error('Fehler beim Speichern – Daten werden neu geladen');
          loadData();
        }
      })();
    } finally {
      setCopyingDay(null);
    }
  };

  const isBridgeDay = (date) => bridgeDays.has(format(date, 'yyyy-MM-dd'));

  const handleToggleBridgeDay = async (day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (isBridgeDay(day)) {
      // Löschen
      setBridgeDays(prev => { const s = new Set(prev); s.delete(dateStr); return s; });
      try {
        const all = await api.entities.BridgeDay.list();
        const existing = all.find(d => d.date === dateStr);
        if (existing) await api.entities.BridgeDay.delete(existing.id);
        invalidateBridgeDayCache();
        toast.success('Brückentag entfernt');
      } catch {
        toast.error('Fehler beim Speichern');
        loadData();
      }
    } else {
      // Hinzufügen
      setBridgeDays(prev => new Set([...prev, dateStr]));
      try {
        await api.entities.BridgeDay.create({ date: dateStr });
        invalidateBridgeDayCache();
        toast.success('Brückentag eingetragen – alle haben Urlaub!');
      } catch {
        toast.error('Fehler beim Speichern');
        loadData();
      }
    }
  };

  const generatePDF = () => {
    const currentSortOrder = loadPlSortOrder() || [];
    const getAbbr = (p) => {
      const leader = employees.find(e => e.id === p.project_leader_id);
      return leader?.abbreviation || leader?.full_name || '';
    };
    const poolSplitIndex = getPoolSplitIndex(normalProjects, currentSortOrder, getAbbr);
    generateWeeklyPlanningPDF({
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
      cellInfos,
      isOvernightForWeek,
      isOvernightOnDay,
      isFridayException,
      poolSplitIndex,
      bridgeDays: bridgeDays instanceof Set ? bridgeDays : new Set(),
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-6">
         {/* Print Header */}
         <div className="print-header">
           <div>Wocheneinteilung</div>
           <div>KW {getWeek(weekStart)} • {format(weekStart, 'd.M.yyyy', { locale: de })} - {format(addDays(weekStart, 4), 'd.M.yyyy', { locale: de })}</div>
         </div>

         {/* Header */}
         <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
           <div>
             <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
               <CalendarDays className="w-8 h-8 dark:text-blue-300" />
               Wocheneinteilung
             </h1>
             <p className="text-gray-500 dark:text-gray-400 mt-1">
               KW {getWeek(weekStart)} • {format(weekStart, 'd. MMM', { locale: de })} - {format(addDays(weekStart, 4), 'd. MMM yyyy', { locale: de })}
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
            <Button variant="outline" size="sm" onClick={() => setPlSortDialogOpen(true)}>
              <ListOrdered className="w-4 h-4 mr-2" />
              PL-Reihenfolge
            </Button>
            <Button variant="outline" size="sm" onClick={generatePDF}>
              <FileText className="w-4 h-4 mr-2" />
              PDF Download
            </Button>
          </div>
        </div>

        {/* Planning Grid */}
         <Card className="border-0 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
           <div className="overflow-x-auto">
             <table className="w-full border-collapse" style={{tableLayout: 'fixed'}}>
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900">
                    <th className="p-0.5 text-left text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '3%'}}>PL</th>
                    <th className="p-0.5 text-left text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '7%'}}>Baustelle</th>
                    <th className="p-0.5 text-center text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '1.5%'}}>
                      <Moon className="w-1.5 h-1.5 mx-auto" />
                    </th>
                    {weekDays.map((day, i) => {
                     const holidayName = getPublicHolidayName(day, 'NRW');
                     const bridge = isBridgeDay(day);
                     return (
                       <th
                         key={i}
                         className={`p-0.5 text-center text-[7.5px] font-semibold border-b dark:border-gray-700 cursor-pointer select-none transition-colors ${
                           bridge
                             ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                             : holidayName
                             ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                             : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                         }`}
                         style={{width: '9%'}}
                         onDoubleClick={() => handleToggleBridgeDay(day)}
                         title={bridge ? 'Brückentag (Doppelklick zum Entfernen)' : 'Doppelklick → Brückentag setzen'}
                       >
                         <div>{format(day, 'EEE d.M.', { locale: de })}</div>
                         {bridge && <div className="text-[6px] font-semibold truncate leading-tight">🏖 Brückentag</div>}
                         {!bridge && holidayName && <div className="text-[6px] font-normal truncate leading-tight">{holidayName}</div>}
                       </th>
                     );
                    })}
                    <th className="p-0.5 text-center text-[7.5px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700 bg-blue-50 dark:bg-blue-950" style={{width: '9%'}}>
                      {format(nextMonday, 'EEE d.M.', { locale: de })}
                    </th>
                    <th className="p-0.5 text-center text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '1.5%'}}>
                      <Moon className="w-1.5 h-1.5 mx-auto" />
                    </th>
                    <th className="p-0.5 text-center text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '3%'}}>Fertig</th>
                    <th className="p-0.5 text-center text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '4%'}}>Oberm.</th>
                    <th className="p-0.5 text-left text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '7%'}}>Baustelle</th>
                    <th className="p-0.5 text-center text-[9px] font-semibold text-gray-600 dark:text-gray-300 border-b dark:border-gray-700" style={{width: '3%'}}>
                      <span className="inline-block px-1.5 py-0.5 rounded font-bold text-[9px] bg-gray-200 text-gray-700">PL</span>
                    </th>
                  </tr>
                </thead>
                <WeeklyPlanningTableBody
                 normalProjects={normalProjects}
                 tsProjects={tsProjects}
                 efProjects={efProjects}
                 isBridgeDay={isBridgeDay}
                 poolSplitIndex={(() => {
                   const order = loadPlSortOrder() || [];
                   const getAbbr = (p) => {
                     const leader = employees.find(e => e.id === p.project_leader_id);
                     return leader?.abbreviation || leader?.full_name || '';
                   };
                   return getPoolSplitIndex(normalProjects, order, getAbbr);
                 })()}
                  weekDays={weekDays}
                  nextMonday={nextMonday}
                  employees={employees}
                  getEmployee={getEmployee}
                  shouldShowOnDay={shouldShowOnDay}
                  getDisplayName={getDisplayName}
                  getLeaderColor={getLeaderColor}
                  getPrintEmployeeDisplay={getPrintEmployeeDisplay}
                  countOvernightStaff={countOvernightStaff}
                  countOvernightStaffForWeek={(projectId) => countOvernightStaffForWeek(projectId, weekDays)}
                  getAssignmentsForCell={getAssignmentsForCell}
                  getTempWorkersForCell={getTempWorkersForCell}
                  handleEmployeeDoubleClick={handleEmployeeDoubleClick}
                  getUnassignedEmployees={getUnassignedEmployees}
                  onCopyFromPreviousDay={onCopyFromPreviousDay}
                  onCellDoubleClick={(projectId, day) => {
                    setCellClickDialog({ projectId, day });
                    setCellSearch('');
                    setCommentInput('');
                  }}
                  absenceTypes={absenceTypes}
                  getAbsenceAssignments={getAbsenceAssignments}
                  getAbsenceEndDate={getAbsenceEndDate}
                  projects={projects}
                  setProjects={setProjects}
                  onDeleteAssignment={(assignmentId) => {
                    setAssignments(prev => prev.filter(a => a.id !== assignmentId));
                    api.entities.Assignment.delete(assignmentId).catch(() => loadData());
                  }}
                  getCommentForProjectOnMonday={getCommentForProjectOnMonday}
                  onDeleteCommentFromDate={handleDeleteCommentFromDate}
                  isOvernightForWeek={isOvernightForWeek}
                  isOvernightOnDay={isOvernightOnDay}
                  isFridayException={isFridayException}
                  weekStart={weekStart}
                  cellInfos={cellInfos}
                  onCellInfosChange={setCellInfos}
                  onCopyFromDay={onCopyFromDay}
                  onDeleteComment={(commentId) => {
                    setProjectComments(prev => prev.filter(c => c.id !== commentId));
                    api.entities.ProjectComment.delete(commentId).catch(() => loadData());
                  }}
                  onToggleTsOvernight={handleToggleTsOvernight}
                  />
                  </table>
          </div>
        </Card>

        {/* Cell Double-Click: Mitarbeiter hinzufügen */}
        <Dialog open={!!cellClickDialog} onOpenChange={(open) => { if (!open) { setCellClickDialog(null); setCellSearch(''); setCommentInput(''); } }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Mitarbeiter hinzufügen</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {/* Kommentar-Bereich – nur Montag (dayOfWeek === 1) */}
              {cellClickDialog && new Date(format(cellClickDialog.day, 'yyyy-MM-dd')).getDay() === 1 && (
                <div className="flex gap-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <Input
                    placeholder="Kommentar eingeben..."
                    value={commentInput}
                    onChange={(e) => setCommentInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && commentInput.trim()) handleCellAssign('__kommentar__'); }}
                    className="h-8 text-sm"
                  />
                  <button
                    onClick={() => handleCellAssign('__kommentar__')}
                    disabled={!commentInput.trim()}
                    className="px-3 py-1 rounded bg-gray-700 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-800"
                  >
                    📝
                  </button>
                </div>
              )}
              <Input
                autoFocus
                placeholder="Name suchen..."
                value={cellSearch}
                onChange={(e) => setCellSearch(e.target.value)}
              />
              <div className="max-h-72 overflow-y-auto space-y-1">
                {/* Platzhalter oben */}
                {[
                  { label: 'Schweißer', key: '__schweisser__' },
                  { label: 'Bedarf', key: '__bedarf__' },
                  { label: 'TS', key: '__ts__' },
                ].filter(({ label }) => label.toLowerCase().includes(cellSearch.toLowerCase()) || cellSearch === '').map(({ label, key }) => (
                  <button
                    key={key}
                    onClick={() => handleCellAssign(key)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-700 text-sm transition-colors border border-orange-200 bg-orange-50 font-medium text-orange-700"
                  >
                    ⚡ {label}
                  </button>
                ))}
                {cellSearch === '' && <div className="border-t border-gray-200 my-1" />}
                {cellClickDialog && (() => {
                  const dayIndex = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === format(cellClickDialog.day, 'yyyy-MM-dd'));
                  // nextMonday hat dayIndex === -1, Montag ist kein Freitag → 0 verwenden
                  const available = getAvailableEmployeesForDay(cellClickDialog.day, dayIndex === -1 ? 0 : dayIndex);
                  const filtered = available
                   .filter(e => e.full_name?.toLowerCase().includes(cellSearch.toLowerCase()))
                   .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de'));
                  if (filtered.length === 0 && cellSearch !== '') return <p className="text-sm text-gray-400 text-center py-4">Keine verfügbaren Mitarbeiter</p>;
                  return filtered.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => handleCellAssign(emp.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 hover:text-blue-700 text-sm transition-colors border border-transparent hover:border-blue-200"
                    >
                      {getDisplayName(emp)}
                      {emp.overnight_stay && <span className="ml-2 text-xs text-red-500">Übernachtung</span>}
                    </button>
                  ));
                })()}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* PL Sort Dialog */}
        <ProjectLeaderSortDialog
          open={plSortDialogOpen}
          onOpenChange={setPlSortDialogOpen}
          projectLeaders={employees
            .filter(e => e.employee_type === 'projektleiter' && !e.is_ef && e.abbreviation)
            .sort((a, b) => (a.abbreviation || '').localeCompare(b.abbreviation || ''))}
          onSave={(order) => {
            setPlSortOrder(order);
            api.auth.updateMe({ pl_sort_order: order }).catch(() => {});
            loadData();
          }}
        />

        {/* Kolonnen-Mitbewegen Dialog */}
        <CrewMoveDialog
          open={!!crewMoveDialog}
          onClose={() => setCrewMoveDialog(null)}
          movedEmployee={crewMoveDialog?.movedEmployee}
          crewMembers={crewMoveDialog?.crewMembers || []}
          destProjectName={crewMoveDialog?.destProjectName}
          dateStr={crewMoveDialog?.dateStr}
          onConfirm={(additionalIds) => {
            // Führe die ursprüngliche Bewegung aus (pendingAction)
            crewMoveDialog.pendingAction();
            // Bewege die anderen Mitglieder ebenfalls
            if (additionalIds.length > 0) {
              if (crewMoveDialog._crewConfirmFn) {
                crewMoveDialog._crewConfirmFn(additionalIds);
              } else {
                const destProjectId = crewMoveDialog.destProjectId;
                const dateStr = crewMoveDialog.dateStr;
                for (const empId of additionalIds) {
                  const assignment = assignments.find(a =>
                    a.employee_id === empId && a.date === dateStr && a.assignment_type === 'baustelle'
                  );
                  if (assignment) {
                    optimisticUpdate(
                      prev => prev.map(a => a.id === assignment.id ? { ...a, project_id: destProjectId } : a),
                      async () => {
                        await api.entities.Assignment.update(assignment.id, { project_id: destProjectId });
                      }
                    );
                  }
                }
              }
              toast.success(`${additionalIds.length + 1} Mitarbeiter verschoben`);
            }
            setCrewMoveDialog(null);
          }}
        />

        {/* Azubi-Mitbewegen Dialog */}
        <AzubiMoveDialog
          open={!!azubiMoveDialog}
          onClose={() => setAzubiMoveDialog(null)}
          mentor={azubiMoveDialog?.mentor}
          azubis={azubiMoveDialog?.azubis || []}
          destProjectName={azubiMoveDialog?.destProjectName}
          dateStr={azubiMoveDialog?.dateStr}
          onConfirm={(azubiIds) => {
            azubiMoveDialog.pendingAction();
            if (azubiIds.length > 0) {
              if (azubiMoveDialog._customConfirm) {
                azubiMoveDialog._customConfirm(azubiIds);
              } else {
                const dateStr = azubiMoveDialog.dateStr;
                const destProjectId = azubiMoveDialog.destProjectId;
                for (const azubiId of azubiIds) {
                  const azubiAssignment = assignments.find(a =>
                    a.employee_id === azubiId && a.date === dateStr && a.assignment_type === 'baustelle'
                  );
                  if (azubiAssignment) {
                    optimisticUpdate(
                      prev => prev.map(a => a.id === azubiAssignment.id ? { ...a, project_id: destProjectId } : a),
                      async () => {
                        await api.entities.Assignment.update(azubiAssignment.id, { project_id: destProjectId });
                      }
                    );
                  }
                }
                toast.success(`Azubi${azubiIds.length > 1 ? 's' : ''} ebenfalls verschoben`);
              }
            }
            setAzubiMoveDialog(null);
          }}
        />

        {/* Employee Edit Dialog */}
        <EmployeeEditDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          employee={editingEmployee}
          onSave={handleSaveEmployee}
          submitting={submitting}
          assignments={assignments}
        />

        {/* Print Styles */}
        <style>{`
          .print-header { display: none; }
          @media print {
            @page { size: A3 landscape; margin: 5mm 5mm; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            html, body { margin: 0 !important; padding: 0 !important; width: 100% !important; height: 100% !important; }
            body > div, #root, main, main > div { margin: 0 !important; padding: 0 !important; width: 100% !important; }
            .no-print { display: none !important; }
            .print-header { display: block !important; margin-bottom: 8px !important; text-align: left; font-size: 24px; font-weight: 700; color: #1e3a5f; line-height: 1.1; }
            .shadow-sm, .shadow-lg, .shadow { box-shadow: none !important; }
            .rounded-lg, .rounded-xl, .rounded-2xl, .rounded { border-radius: 0 !important; }
            .space-y-6 { padding: 0 !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; }
            .space-y-6 > div { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
            .space-y-6 > div > div { margin: 0 !important; padding: 0 !important; }
            table { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; border-collapse: collapse !important; table-layout: fixed !important; font-size: 8px !important; page-break-inside: auto !important; }
            .overflow-hidden, [class*="ScrollArea"] { overflow: visible !important; padding: 0 !important; margin: 0 !important; }
            thead { display: table-header-group !important; }
            thead th { font-size: 10px !important; font-weight: 700 !important; padding: 2px 1px !important; background-color: #e5e7eb !important; border: 0.5pt solid #9ca3af !important; text-align: center !important; vertical-align: middle !important; line-height: 1.1 !important; white-space: nowrap; }
            tbody td { padding: 1.5px !important; border: 0.5pt solid #d1d5db !important; vertical-align: top !important; font-size: 11px !important; line-height: 1.15 !important; overflow: hidden; }
            th:nth-child(1), td:nth-child(1) { width: 2.5% !important; }
            th:nth-child(2), td:nth-child(2) { width: 9% !important; }
            th:nth-child(3), td:nth-child(3) { width: 1.5% !important; }
            th:nth-child(4), td:nth-child(4), th:nth-child(5), td:nth-child(5), th:nth-child(6), td:nth-child(6), th:nth-child(7), td:nth-child(7), th:nth-child(8), td:nth-child(8) { width: 2.56% !important; }
            th:nth-child(9), td:nth-child(9) { width: 9% !important; }
            th:nth-child(10), td:nth-child(10) { width: 1.5% !important; }
            th:nth-child(11), td:nth-child(11) { width: 4.5% !important; }
            th:nth-child(12), td:nth-child(12) { width: 7% !important; }
            th:nth-child(13), td:nth-child(13) { width: 9% !important; }
            th:nth-child(14), td:nth-child(14) { width: 2.5% !important; }
            tbody td > div { min-height: 32px !important; padding: 1.5px !important; }
            tbody td > div > div { display: flex !important; flex-wrap: wrap !important; gap: 1.5px !important; align-items: flex-start !important; }
            tbody td > div > div > div { display: block !important; padding: 0.5px 1.5px !important; margin: 0.5px !important; font-size: 11px !important; line-height: 1.15 !important; border: none !important; background: transparent !important; white-space: normal !important; word-wrap: break-word !important; color: #000 !important; font-weight: 400 !important; }
            .print\\:text-gray-600 { color: #000 !important; font-weight: 400 !important; }
            .print\\:text-red-600 { color: #dc2626 !important; font-weight: 400 !important; }
            tbody td > div > div > div.font-bold { color: #000 !important; font-weight: 700 !important; }
            tbody td span.inline-block, thead th span.inline-block { padding: 1px 2px !important; font-size: 10px !important; border-radius: 2px !important; font-weight: 700 !important; display: inline-block !important; }
            .bg-gray-50, .bg-gray-50\\/50 { background-color: #f9fafb !important; }
            .bg-yellow-100 { background-color: #fef3c7 !important; }
            .bg-yellow-50 { background-color: #fefce8 !important; }
            .bg-blue-50, .bg-blue-50\\/30 { background-color: #eff6ff !important; }
            .bg-blue-100 { background-color: #dbeafe !important; }
            .bg-red-50, .bg-red-50\\/30 { background-color: #fef2f2 !important; }
            .bg-red-100 { background-color: #fee2e2 !important; }
            .bg-purple-50, .bg-purple-50\\/30 { background-color: #faf5ff !important; }
            .bg-purple-100 { background-color: #f3e8ff !important; }
            .bg-green-50 { background-color: #f0fdf4 !important; }
            .bg-green-100 { background-color: #dcfce7 !important; }
            .bg-amber-50 { background-color: #fffbeb !important; }
            .bg-blue-500 { background-color: #3b82f6 !important; color: white !important; }
            .bg-green-500 { background-color: #10b981 !important; color: white !important; }
            .bg-purple-500 { background-color: #a855f7 !important; color: white !important; }
            .bg-orange-500 { background-color: #f97316 !important; color: white !important; }
            .bg-pink-500 { background-color: #ec4899 !important; color: white !important; }
            .bg-indigo-500 { background-color: #6366f1 !important; color: white !important; }
            .bg-teal-500 { background-color: #14b8a6 !important; color: white !important; }
            .bg-cyan-500 { background-color: #06b6d4 !important; color: white !important; }
            .bg-violet-500 { background-color: #8b5cf6 !important; color: white !important; }
            .bg-fuchsia-500 { background-color: #d946ef !important; color: white !important; }
            .bg-gray-500 { background-color: #6b7280 !important; color: white !important; }
            .bg-red-50.text-red-700 { background-color: #fef2f2 !important; color: #b91c1c !important; border: 0.5pt solid #fca5a5 !important; padding: 0.5px 1.5px !important; font-size: 9px !important; }
            .border-t-2 { border-top: 1.5pt solid #374151 !important; }
            .border-b-2 { border-bottom: 1.5pt solid #374151 !important; }
            .border-yellow-300 { border-color: #fcd34d !important; }
            .border-green-300 { border-color: #86efac !important; }
            .border-gray-300 { border-color: #d1d5db !important; }
            .text-gray-600 { color: #4b5563 !important; }
            .text-gray-900 { color: #111827 !important; }
            .text-red-600 { color: #dc2626 !important; }
            .text-red-700 { color: #b91c1c !important; }
            .text-green-800 { color: #166534 !important; }
            .text-yellow-800 { color: #854d0e !important; }
            .font-semibold, .font-bold { font-weight: 700 !important; }
            .font-medium { font-weight: 500 !important; }
            input { border: none !important; background: transparent !important; padding: 0 !important; font-size: 9px !important; color: #000 !important; }
            svg { display: none !important; }
            tr { page-break-inside: avoid !important; }
            tbody { page-break-inside: auto !important; }
          }
        `}</style>
        </div>
        </DragDropContext>
        );
        }