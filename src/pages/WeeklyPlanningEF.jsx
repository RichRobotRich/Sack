import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, addDays, startOfWeek, addWeeks, getWeek, isWeekend } from 'date-fns';
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
  FileText
} from 'lucide-react';
import { generateWeeklyPlanningPDF } from '../components/WeeklyPlanningPDF';
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

export default function WeeklyPlanningEF() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [tempWorkers, setTempWorkers] = useState([]);
  const [tempAssignments, setTempAssignments] = useState([]);
  const [projectComments, setProjectComments] = useState([]);
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
    overnight_stay: false,
    apprentice_year: '',
    school_days: [],
    vacation_periods: [],
    tbz_periods: [],
    phone: '',
    email: '',
    is_active: true,
    remark: ''
  });
  const [vacationDialog, setVacationDialog] = useState(false);
  const [vacationForm, setVacationForm] = useState({ start_date: null, end_date: null });
  const [tbzDialog, setTbzDialog] = useState(false);
  const [tbzForm, setTbzForm] = useState({ start_date: null, end_date: null });

  const weekDays = [0, 1, 2, 3, 4].map(i => addDays(weekStart, i));
  const nextMondayRaw = addDays(weekStart, 7);
  const nextMonday = getNextWorkday(nextMondayRaw, 'TH');

  useEffect(() => {
    loadData();
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
      const [projectsData, efEmployeesData, allProjectLeadersData, assignmentsData, leaveRequestsData, tempWorkersData, tempAssignmentsData, projectCommentsData] = await Promise.all([
       api.entities.Project.filter({ status: 'aktiv', is_ef_project: true }),
       api.entities.Employee.filter({ is_active: true, is_ef: true }),
       api.entities.Employee.filter({ is_active: true, employee_type: 'projektleiter' }),
       api.entities.Assignment.list(),
       api.entities.LeaveRequest.filter({ status: 'genehmigt', request_type: 'urlaub' }),
       api.entities.TempWorker.filter({ is_active: true, is_ef: true }),
       api.entities.TempAssignment.list(),
       api.entities.ProjectComment.list()
      ]);

      // Merge: EF-Mitarbeiter + alle Projektleiter (für korrekte PL-Kürzel-Anzeige)
      const employeesMap = new Map();
      [...efEmployeesData, ...allProjectLeadersData].forEach(e => employeesMap.set(e.id, e));
      const employeesData = Array.from(employeesMap.values());

      const tsProjects = projectsData.filter(p => p.is_ts_project);
      const efProjects = projectsData.filter(p => !p.is_ts_project);

      const sortedProjects = efProjects.sort((a, b) => {
        const leaderA = employeesData.find(e => e.id === a.project_leader_id);
        const leaderB = employeesData.find(e => e.id === b.project_leader_id);
        const nameA = leaderA?.abbreviation || leaderA?.full_name || '';
        const nameB = leaderB?.abbreviation || leaderB?.full_name || '';
        return nameA.localeCompare(nameB);
      });

      setProjects([...sortedProjects, ...tsProjects]);
      setEmployees(employeesData);
      setAssignments(assignmentsData);
      setLeaveRequests(leaveRequestsData);
      setTempWorkers(tempWorkersData);
      setTempAssignments(tempAssignmentsData);
      setProjectComments(projectCommentsData);
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

  const autoAssignApprovedLeave = async () => {
    if (leaveRequests.length === 0) return;

    const today = new Date();
    const assignmentsToCreate = [];
    
    for (const leaveRequest of leaveRequests) {
      if (!leaveRequest.employee_id) continue;
      
      const startDate = new Date(leaveRequest.start_date);
      const endDate = new Date(leaveRequest.end_date);
      
      if (endDate < today) continue;
      
      let currentDate = startDate < today ? today : startDate;
      
      while (currentDate <= endDate) {
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        
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
    const sixWeeksFromNow = addWeeks(today, 6);
    const assignmentsToCreate = [];
    
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
          
          if (existingAssignment) continue;
          
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
    
    if (assignmentsToCreate.length > 0) {
      try {
        await api.entities.Assignment.bulkCreate(assignmentsToCreate);
        await loadData();
        const schoolCount = assignmentsToCreate.filter(a => a.assignment_type === 'schule').length;
        const tbzCount = assignmentsToCreate.filter(a => a.assignment_type === 'tbz').length;
        toast.success(`${schoolCount} Schultage und ${tbzCount} TBZ-Tage für die nächsten 6 Wochen eingeplant`);
      } catch (error) {
        console.error('Error auto-assigning school days:', error);
        toast.error('Fehler beim automatischen Einplanen');
      }
    }
  };

  const getEmployee = (id) => employees.find(e => e.id === id);

  const handleCopyFromPreviousDay = async (projectId, date) => {
    const prevDay = addDays(date, -1);
    const prevDateStr = format(prevDay, 'yyyy-MM-dd');
    const targetDateStr = format(date, 'yyyy-MM-dd');

    // Assignments vom Vortag für dieses Projekt
    const prevAssignments = assignments.filter(a =>
      a.project_id === projectId &&
      a.date === prevDateStr &&
      a.assignment_type === 'baustelle'
    );

    if (prevAssignments.length === 0) {
      toast.info('Keine Einträge vom Vortag vorhanden');
      return;
    }

    // Mitarbeiter die heute bereits irgendwo eingeplant sind
    const alreadyAssignedToday = new Set(
      assignments.filter(a => a.date === targetDateStr).map(a => a.employee_id)
    );

    const toCreate = prevAssignments
      .filter(a => !alreadyAssignedToday.has(a.employee_id))
      .map(a => ({
        employee_id: a.employee_id,
        project_id: projectId,
        date: targetDateStr,
        assignment_type: 'baustelle'
      }));

    const skipped = prevAssignments.length - toCreate.length;

    if (toCreate.length === 0) {
      toast.info(skipped > 0 ? `${skipped} Mitarbeiter bereits eingeplant oder abwesend` : 'Alle Mitarbeiter bereits eingeplant');
      return;
    }

    const tempAssignments = toCreate.map((a, i) => ({ ...a, id: `temp_${Date.now()}_${i}` }));
    setAssignments(prev => [...prev, ...tempAssignments]);
    toast.success(`${toCreate.length} Mitarbeiter übernommen${skipped > 0 ? `, ${skipped} übersprungen` : ''}`);

    (async () => {
      try {
        const created = await api.entities.Assignment.bulkCreate(toCreate);
        if (Array.isArray(created)) {
          setAssignments(prev => {
            let updated = [...prev];
            tempAssignments.forEach((temp, i) => { updated = updated.map(a => a.id === temp.id ? { ...a, id: created[i]?.id || a.id } : a); });
            return updated;
          });
        }
      } catch {
        toast.error('Fehler beim Speichern – Daten werden neu geladen');
        loadData();
      }
    })();
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
      .filter(w => w && w.is_active && w.is_ef);
  };

  const normalProjects = projects.filter(p => !p.is_ts_project);
  const tsProjects = projects.filter(p => p.is_ts_project);
  const efProjects = [];

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
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.filter(a => {
      const employee = getEmployee(a.employee_id);
      if (!employee || !employee.is_ef) return false;
      
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

  // Wenn Montag ein Feiertag ist, gehen Übernachtungs-Mitarbeiter Di-Fr statt Mo-Do
  const mondayIsHoliday = isPublicHoliday(weekStart, 'TH');

  // Gibt zurück ob ein Mitarbeiter für die gegebene Woche (Montag) Übernachtung hat
  const isOvernightForWeek = (emp, mondayDate) => {
    if (!emp) return false;
    const mondayStr = format(mondayDate, 'yyyy-MM-dd');
    if (emp.overnight_stay_weeks && emp.overnight_stay_weeks.length > 0) {
      return emp.overnight_stay_weeks.includes(mondayStr);
    }
    return emp.overnight_stay === true;
  };

  // Gibt zurück ob ein Mitarbeiter an einem konkreten Tag auf Montage ist
  const isOvernightOnDay = (emp, date) => {
    if (!emp) return false;
    const mondayStr = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const entry = emp.overnight_stay_days?.find(e => e.week_start === mondayStr);
    if (!entry) {
      if (!isOvernightForWeek(emp, startOfWeek(date, { weekStartsOn: 1 }))) return false;
      const dow = date.getDay();
      const dayIndex = dow === 0 ? 6 : dow - 1;
      return dayIndex <= 3;
    }
    const dayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1;
    return entry.days.includes(dayIndex);
  };

  const isFridayException = (emp, date) => {
    if (!emp || !emp.friday_exceptions || emp.friday_exceptions.length === 0) return false;
    return emp.friday_exceptions.includes(format(date, 'yyyy-MM-dd'));
  };

  const getUnassignedEmployees = (date, dayIndex) => {
    if (isPublicHoliday(date, 'TH')) return [];

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
    const weekMon = startOfWeek(date, { weekStartsOn: 1 });
    
    return employees
      .filter(e => e.employee_type !== 'projektleiter' && e.employee_type !== 'buerokraft' && e.employee_type !== 'lagerist')
      .filter(e => {
        if (!shouldShowOnDay(e, dayIndex, date)) return false;
        return !assignedIds.has(e.id) || orphanedEmployeeIds.has(e.id);
      });
  };

  const shouldShowOnDay = (employee, dayIndex, date) => {
    if (employee.employee_type === 'buerokraft') return false;
    if (employee.employee_type === 'lagerist') return false;
    if (date && isPublicHoliday(date, 'TH')) return false;
    if (!date) return true;
    const weekMon = startOfWeek(date, { weekStartsOn: 1 });
    if (!isOvernightForWeek(employee, weekMon)) return true;
    const entry = employee.overnight_stay_days?.find(e => e.week_start === format(weekMon, 'yyyy-MM-dd'));
    if (entry) {
      const dow = date.getDay() === 0 ? 6 : date.getDay() - 1;
      if (entry.days.includes(dow)) return true;
      if (dow === 4 && isFridayException(employee, date)) return true;
      return false;
    }
    if (dayIndex === 4 && !mondayIsHoliday && !isFridayException(employee, date)) return false;
    return true;
  };

  const countOvernightStaff = (projectId, date) => {
    const weekMon = startOfWeek(date, { weekStartsOn: 1 });
    const cellAssignments = getAssignmentsForCell(projectId, date);
    return cellAssignments.filter(a => {
      const emp = getEmployee(a.employee_id);
      return isOvernightForWeek(emp, weekMon);
    }).length;
  };

  const getAbsenceEndDate = (employeeId, absenceType, fromDateStr) => {
    const sorted = assignments
      .filter(a => a.employee_id === employeeId && a.assignment_type === absenceType)
      .map(a => a.date)
      .sort();
    if (sorted.length === 0) return null;
    let last = fromDateStr;
    const dateSet = new Set(sorted);
    let d = new Date(fromDateStr);
    while (true) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() === 6) d.setDate(d.getDate() + 2);
      else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
      const next = format(d, 'yyyy-MM-dd');
      if (dateSet.has(next)) { last = next; } else { break; }
    }
    return last === fromDateStr ? null : last;
  };

  const getProjectLeaderAbbreviation = (projectId) => {
    const project = getProject(projectId);
    if (!project?.project_leader_id) return '';
    const leader = getEmployee(project.project_leader_id);
    return leader?.abbreviation || '';
  };

  const getCommentForProjectOnMonday = (projectId, mondayDate) => {
    const mondayStr = format(mondayDate, 'yyyy-MM-dd');
    const relevant = projectComments
      .filter(c => c.project_id === projectId && c.start_date <= mondayStr)
      .sort((a, b) => b.start_date.localeCompare(a.start_date));
    return relevant[0] || null;
  };

  const handleDeleteCommentFromDate = async (projectId, fromMondayDate) => {
    const fromStr = format(fromMondayDate, 'yyyy-MM-dd');
    const toDelete = projectComments.filter(c => c.project_id === projectId && c.start_date >= fromStr);
    if (toDelete.length === 0) return;
    setProjectComments(prev => prev.filter(c => !(c.project_id === projectId && c.start_date >= fromStr)));
    toDelete.forEach(c => api.entities.ProjectComment.delete(c.id).catch(() => {}));
    toast.success('Kommentar ab diesem Montag entfernt');
  };

  const isEmployeeAssignedOnDay = (employeeId, date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return assignments.some(a => a.employee_id === employeeId && a.date === dateStr);
  };

  const [cellClickDialog, setCellClickDialog] = useState(null);
  const [cellSearch, setCellSearch] = useState('');
  const [commentInput, setCommentInput] = useState('');

  const getAvailableEmployeesForDay = (day, dayIndex) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const absenceTypeKeys = ['urlaub', 'krank', 'schule', 'pruefung', 'tbz', 'beurlaubung'];
    const absentIds = new Set(
      assignments.filter(a => a.date === dateStr && absenceTypeKeys.includes(a.assignment_type)).map(a => a.employee_id)
    );
    return employees
      .filter(e => e.employee_type !== 'projektleiter' && e.employee_type !== 'buerokraft' && e.employee_type !== 'lagerist' && e.is_active)
      .filter(e => !absentIds.has(e.id))
      .filter(e => !(e.overnight_stay && dayIndex === 4 && !mondayIsHoliday));
  };

  const handleCellAssign = (employeeId) => {
    if (!cellClickDialog) return;
    const { projectId, day } = cellClickDialog;
    const dateStr = format(day, 'yyyy-MM-dd');

    // Platzhalter: Schweißer / Bedarf
    if (employeeId === '__schweisser__' || employeeId === '__bedarf__') {
      const label = employeeId === '__schweisser__' ? 'Schweißer' : 'Bedarf';
      const tempId = `temp_${Date.now()}`;
      setAssignments(prev => [...prev, { id: tempId, project_id: projectId, date: dateStr, assignment_type: 'baustelle', notes: label }]);
      setCellClickDialog(null);
      setCellSearch('');
      setCommentInput('');
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

    const existingIds = assignments
      .filter(a => a.employee_id === employeeId && a.date === dateStr && a.assignment_type === 'baustelle')
      .map(a => a.id);

    const tempId = `temp_${Date.now()}`;
    setAssignments(prev => [
      ...prev.filter(a => !existingIds.includes(a.id)),
      { id: tempId, employee_id: employeeId, project_id: projectId, date: dateStr, assignment_type: 'baustelle' }
    ]);
    setCellClickDialog(null);
    setCellSearch('');
    toast.success('Mitarbeiter eingeplant');

    (async () => {
      try {
        if (existingIds.length > 0) await Promise.all(existingIds.map(id => api.entities.Assignment.delete(id)));
        const created = await api.entities.Assignment.create({ employee_id: employeeId, project_id: projectId, date: dateStr, assignment_type: 'baustelle' });
        setAssignments(prev => prev.map(a => a.id === tempId ? { ...a, id: created.id } : a));
      } catch {
        toast.error('Fehler beim Speichern – Daten werden neu geladen');
        loadData();
      }
    })();
  };

  const optimisticUpdate = (updater, apiCall) => {
    setAssignments(prev => updater(prev));
    apiCall().catch(() => {
      toast.error('Fehler beim Speichern – Daten werden neu geladen');
      loadData();
    });
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
          async () => { const c = await api.entities.Assignment.create({ employee_id: employeeId, project_id: destProjectId, date: destDateStr, assignment_type: 'baustelle' }); setAssignments(p => p.map(a => a.id === tempId ? { ...a, id: c.id } : a)); toast.success('Mitarbeiter eingeplant'); }
        );
      } else if (destType === 'absence') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: employeeId, date: destDateStr, assignment_type: destProjectId, project_id: null }],
          async () => { const c = await api.entities.Assignment.create({ employee_id: employeeId, date: destDateStr, assignment_type: destProjectId, project_id: null }); setAssignments(p => p.map(a => a.id === tempId ? { ...a, id: c.id } : a)); toast.success('Als Abwesenheit markiert'); }
        );
      } else if (destType === 'workshop') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: employeeId, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' }],
          async () => { const c = await api.entities.Assignment.create({ employee_id: employeeId, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' }); setAssignments(p => p.map(a => a.id === tempId ? { ...a, id: c.id } : a)); toast.success('Zur Werkstatt hinzugefügt'); }
        );
      }
      return;
    }

    const existingAssignment = assignments.find(a => a.id === draggableId);
    if (!existingAssignment) return;

    if (destDateStr !== sourceDateStr && isEmployeeAssignedOnDay(existingAssignment.employee_id, new Date(destDateStr))) {
      toast.error('Mitarbeiter ist an diesem Tag bereits eingeplant!');
      return;
    }

    if (isCopyMode) {
      const tempId = `temp_${Date.now()}`;
      if (destType === 'cell') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: existingAssignment.employee_id, project_id: destProjectId, date: destDateStr, assignment_type: 'baustelle' }],
          async () => { const c = await api.entities.Assignment.create({ employee_id: existingAssignment.employee_id, project_id: destProjectId, date: destDateStr, assignment_type: 'baustelle' }); setAssignments(p => p.map(a => a.id === tempId ? { ...a, id: c.id } : a)); toast.success('Mitarbeiter eingeplant'); }
        );
      } else if (destType === 'absence') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: destProjectId, project_id: null }],
          async () => { const c = await api.entities.Assignment.create({ employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: destProjectId, project_id: null }); setAssignments(p => p.map(a => a.id === tempId ? { ...a, id: c.id } : a)); toast.success('Als Abwesenheit markiert'); }
        );
      } else if (destType === 'workshop') {
        optimisticUpdate(
          prev => [...prev, { id: tempId, employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' }],
          async () => { const c = await api.entities.Assignment.create({ employee_id: existingAssignment.employee_id, date: destDateStr, assignment_type: 'baustelle', project_id: 'workshop' }); setAssignments(p => p.map(a => a.id === tempId ? { ...a, id: c.id } : a)); toast.success('Zur Werkstatt hinzugefügt'); }
        );
      }
      return;
    }

    if (destDateStr === sourceDateStr && destType === 'cell' && sourceType === 'cell' && sourceProjectId !== destProjectId) {
      const others = assignments.filter(a => a.id !== existingAssignment.id && a.employee_id === existingAssignment.employee_id && a.date === destDateStr && a.assignment_type === 'baustelle');
      if (others.length > 0) { toast.error('Mitarbeiter ist an diesem Tag bereits eingeplant!'); return; }
    }

    if (destType === 'pool') {
      optimisticUpdate(prev => prev.filter(a => a.id !== existingAssignment.id), async () => { await api.entities.Assignment.delete(existingAssignment.id); toast.success('Mitarbeiter aus Planung entfernt'); });
    } else if (destType === 'cell') {
      optimisticUpdate(prev => prev.map(a => a.id === existingAssignment.id ? { ...a, project_id: destProjectId, date: destDateStr } : a), async () => { await api.entities.Assignment.update(existingAssignment.id, { project_id: destProjectId, date: destDateStr }); toast.success('Mitarbeiter verschoben'); });
    } else if (destType === 'absence') {
      optimisticUpdate(prev => prev.map(a => a.id === existingAssignment.id ? { ...a, assignment_type: destProjectId, date: destDateStr, project_id: null } : a), async () => { await api.entities.Assignment.update(existingAssignment.id, { assignment_type: destProjectId, date: destDateStr, project_id: null }); toast.success('Als Abwesenheit markiert'); });
    } else if (destType === 'workshop') {
      optimisticUpdate(prev => prev.map(a => a.id === existingAssignment.id ? { ...a, project_id: 'workshop', date: destDateStr } : a), async () => { await api.entities.Assignment.update(existingAssignment.id, { project_id: 'workshop', date: destDateStr }); toast.success('Zur Werkstatt verschoben'); });
    }
  };

  const handleEmployeeDoubleClick = (employee) => {
    setEditingEmployee(employee);
    setForm({
      full_name: employee.full_name || '',
      employee_type: employee.employee_type || 'monteur',
      abbreviation: employee.abbreviation || '',
      overnight_stay: employee.overnight_stay || false,
      apprentice_year: employee.apprentice_year?.toString() || '',
      school_days: employee.school_days || [],
      vacation_periods: employee.vacation_periods || [],
      tbz_periods: employee.tbz_periods || [],
      phone: employee.phone || '',
      email: employee.email || '',
      is_active: employee.is_active !== false,
      remark: employee.remark || ''
    });
    setEditDialogOpen(true);
  };

  const handleSaveEmployee = async () => {
    if (!form.full_name || !editingEmployee) return;
    
    setSubmitting(true);
    try {
      await api.entities.Employee.update(editingEmployee.id, {
        ...form,
        apprentice_year: form.apprentice_year ? parseInt(form.apprentice_year) : null
      });
      
      setEditDialogOpen(false);
      toast.success('Mitarbeiter aktualisiert');
      loadData();
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

  const generatePDF = () => {
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
      getAbsenceEndDate,
      isOvernightForWeek,
      getTempWorkersForCell,
      isEF: true,
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
          <div>Wocheneinteilung EF</div>
          <div>KW {getWeek(weekStart)} • {format(weekStart, 'd.M.yyyy', { locale: de })} - {format(addDays(weekStart, 4), 'd.M.yyyy', { locale: de })}</div>
        </div>

        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
              <CalendarDays className="w-8 h-8 dark:text-blue-300" />
              Wocheneinteilung EF
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
                    const holidayName = getPublicHolidayName(day, 'TH');
                    return (
                      <th key={i} className={`p-0.5 text-center text-[7.5px] font-semibold border-b dark:border-gray-700 ${holidayName ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300'}`} style={{width: '9%'}}>
                        <div>{format(day, 'EEE d.M.', { locale: de })}</div>
                        {holidayName && <div className="text-[6px] font-normal truncate leading-tight">{holidayName}</div>}
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
                weekDays={weekDays}
                nextMonday={nextMonday}
                employees={employees}
                getEmployee={getEmployee}
                shouldShowOnDay={shouldShowOnDay}
                getDisplayName={getDisplayName}
                getLeaderColor={getLeaderColor}
                getPrintEmployeeDisplay={getPrintEmployeeDisplay}
                countOvernightStaff={countOvernightStaff}
                getAssignmentsForCell={getAssignmentsForCell}
                getTempWorkersForCell={getTempWorkersForCell}
                handleEmployeeDoubleClick={handleEmployeeDoubleClick}
                getUnassignedEmployees={getUnassignedEmployees}
                onCopyFromPreviousDay={handleCopyFromPreviousDay}
                onCellDoubleClick={(projectId, day) => { setCellClickDialog({ projectId, day }); setCellSearch(''); setCommentInput(''); }}
                absenceTypes={[
                  { key: 'urlaub', label: 'Urlaub' },
                  { key: 'krank', label: 'Krank' },
                  { key: 'schule', label: 'Berufsschule' },
                  { key: 'pruefung', label: 'Prüfung' },
                  { key: 'tbz', label: 'TBZ' },
                  { key: 'beurlaubung', label: 'Beurlaubung' }
                ]}
                getAbsenceAssignments={getAbsenceAssignments}
                projects={projects}
                setProjects={setProjects}
                getCommentForProjectOnMonday={getCommentForProjectOnMonday}
                onDeleteCommentFromDate={handleDeleteCommentFromDate}
                getAbsenceEndDate={getAbsenceEndDate}
                isOvernightForWeek={isOvernightForWeek}
                isOvernightOnDay={isOvernightOnDay}
                isFridayException={isFridayException}
                weekStart={weekStart}
                onDeleteAssignment={(assignmentId) => {
                  setAssignments(prev => prev.filter(a => a.id !== assignmentId));
                  api.entities.Assignment.delete(assignmentId).catch(() => loadData());
                }}
                onDeleteComment={(commentId) => {
                  setProjectComments(prev => prev.filter(c => c.id !== commentId));
                  api.entities.ProjectComment.delete(commentId).catch(() => loadData());
                }}
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
                {['Schweißer', 'Bedarf'].filter(label => label.toLowerCase().includes(cellSearch.toLowerCase()) || cellSearch === '').map(label => (
                  <button
                    key={label}
                    onClick={() => handleCellAssign(label === 'Schweißer' ? '__schweisser__' : '__bedarf__')}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-50 hover:text-orange-700 text-sm transition-colors border border-orange-200 bg-orange-50 font-medium text-orange-700"
                  >
                    ⚡ {label}
                  </button>
                ))}
                {cellSearch === '' && <div className="border-t border-gray-200 my-1" />}
                {cellClickDialog && (() => {
                  const dayIndex = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === format(cellClickDialog.day, 'yyyy-MM-dd'));
                  const available = getAvailableEmployeesForDay(cellClickDialog.day, dayIndex === -1 ? 0 : dayIndex);
                  const filtered = available
                    .filter(e => e.full_name?.toLowerCase().includes(cellSearch.toLowerCase()))
                    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de'));
                  if (filtered.length === 0 && cellSearch !== '') return <p className="text-sm text-gray-400 text-center py-4">Keine verfügbaren Mitarbeiter</p>;
                  return filtered.map(emp => (
                    <button key={emp.id} onClick={() => handleCellAssign(emp.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 hover:text-blue-700 text-sm transition-colors border border-transparent hover:border-blue-200">
                      {getDisplayName(emp)}
                      {emp.overnight_stay && <span className="ml-2 text-xs text-red-500">Übernachtung</span>}
                    </button>
                  ));
                })()}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Employee Edit Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Mitarbeiter bearbeiten</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({...form, full_name: e.target.value})}
                  placeholder="Vollständiger Name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Typ *</Label>
                <Select
                  value={form.employee_type}
                  onValueChange={(value) => setForm({...form, employee_type: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="projektleiter">Projektleiter</SelectItem>
                    <SelectItem value="monteur">Monteur</SelectItem>
                    <SelectItem value="azubi">Azubi</SelectItem>
                    <SelectItem value="praktikant">Praktikant</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.employee_type === 'projektleiter' && (
                <div className="space-y-2">
                  <Label>Kürzel</Label>
                  <Input
                    value={form.abbreviation}
                    onChange={(e) => setForm({...form, abbreviation: e.target.value})}
                    placeholder="z.B. MÜ, SCH"
                    maxLength={4}
                  />
                </div>
              )}

              {form.employee_type === 'azubi' && (
                <>
                  <div className="space-y-2">
                    <Label>Lehrjahr</Label>
                    <Select
                      value={form.apprentice_year}
                      onValueChange={(value) => setForm({...form, apprentice_year: value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1. Lehrjahr</SelectItem>
                        <SelectItem value="2">2. Lehrjahr</SelectItem>
                        <SelectItem value="3">3. Lehrjahr</SelectItem>
                        <SelectItem value="4">4. Lehrjahr</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Schultage (Berufsschule)</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { value: 0, label: 'Mo' },
                        { value: 1, label: 'Di' },
                        { value: 2, label: 'Mi' },
                        { value: 3, label: 'Do' },
                        { value: 4, label: 'Fr' }
                      ].map(day => (
                        <Button
                          key={day.value}
                          type="button"
                          variant={form.school_days.includes(day.value) ? 'default' : 'outline'}
                          className={form.school_days.includes(day.value) ? 'bg-[#1e3a5f] hover:bg-[#1e3a5f]/90' : ''}
                          onClick={() => {
                            const newDays = form.school_days.includes(day.value)
                              ? form.school_days.filter(d => d !== day.value)
                              : [...form.school_days, day.value];
                            setForm({...form, school_days: newDays});
                          }}
                        >
                          {form.school_days.includes(day.value) && <Check className="w-3 h-3 mr-1" />}
                          {day.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Ferien</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setVacationForm({ start_date: null, end_date: null });
                          setVacationDialog(true);
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Hinzufügen
                      </Button>
                    </div>
                    {form.vacation_periods.length > 0 ? (
                      <div className="space-y-2">
                        {form.vacation_periods.map((period, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-200">
                            <span className="text-sm">
                              {format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                const newPeriods = form.vacation_periods.filter((_, i) => i !== idx);
                                setForm({...form, vacation_periods: newPeriods});
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">Keine Ferien eingetragen</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>TBZ-Zeiträume</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTbzForm({ start_date: null, end_date: null });
                          setTbzDialog(true);
                        }}
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Hinzufügen
                      </Button>
                    </div>
                    {form.tbz_periods.length > 0 ? (
                      <div className="space-y-2">
                        {form.tbz_periods.map((period, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
                            <span className="text-sm">
                              {format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}
                            </span>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                const newPeriods = form.tbz_periods.filter((_, i) => i !== idx);
                                setForm({...form, tbz_periods: newPeriods});
                              }}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">Keine TBZ-Zeiträume eingetragen</p>
                    )}
                  </div>
                </>
              )}

              {(form.employee_type === 'monteur' || form.employee_type === 'azubi') && (
                <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl">
                  <div>
                    <Label className="text-red-700">Übernachtung</Label>
                    <p className="text-sm text-red-600">Monteur übernachtet auf Baustelle (Mo-Do)</p>
                  </div>
                  <Switch
                    checked={form.overnight_stay}
                    onCheckedChange={(checked) => setForm({...form, overnight_stay: checked})}
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telefon</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({...form, phone: e.target.value})}
                    placeholder="Telefonnummer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-Mail</Label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm({...form, email: e.target.value})}
                    placeholder="E-Mail-Adresse"
                    type="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bemerkung</Label>
                <Input
                  value={form.remark}
                  onChange={(e) => setForm({...form, remark: e.target.value})}
                  placeholder="z.B. Führerschein, Zertifikat, etc."
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <Label>Aktiv</Label>
                  <p className="text-sm text-gray-500">Mitarbeiter wird in der Planung angezeigt</p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({...form, is_active: checked})}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button 
                onClick={handleSaveEmployee}
                disabled={!form.full_name || submitting}
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
              >
                {submitting ? 'Wird gespeichert...' : 'Speichern'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Print Styles */}
        <style>{`
          .print-header {
            display: none;
          }
          
          @media print {
            @page { 
              size: A3 landscape; 
              margin: 5mm 5mm;
            }
            
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            html, body { 
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              height: 100% !important;
            }
            
            body > div,
            #root,
            main,
            main > div {
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
            }
            
            .no-print { 
              display: none !important; 
            }
            
            .print-header {
              display: block !important;
              margin-bottom: 8px !important;
              text-align: left;
              font-size: 24px;
              font-weight: 700;
              color: #1e3a5f;
              line-height: 1.1;
            }
            
            .shadow-sm, .shadow-lg, .shadow { 
              box-shadow: none !important; 
            }
            
            .rounded-lg, .rounded-xl, .rounded-2xl, .rounded {
              border-radius: 0 !important;
            }
            
            .space-y-6 {
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
            
            .space-y-6 > div {
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            
            .space-y-6 > div > div {
              margin: 0 !important;
              padding: 0 !important;
            }
            
            table { 
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              border-collapse: collapse !important;
              table-layout: fixed !important;
              font-size: 8px !important;
              page-break-inside: auto !important;
            }
            
            .overflow-hidden,
            [class*="ScrollArea"] {
              overflow: visible !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            
            thead {
              display: table-header-group !important;
            }
            
            thead th {
              font-size: 10px !important;
              font-weight: 700 !important;
              padding: 2px 1px !important;
              background-color: #e5e7eb !important;
              border: 0.5pt solid #9ca3af !important;
              text-align: center !important;
              vertical-align: middle !important;
              line-height: 1.1 !important;
              white-space: nowrap;
            }
            
            tbody td {
              padding: 1.5px !important;
              border: 0.5pt solid #d1d5db !important;
              vertical-align: top !important;
              font-size: 11px !important;
              line-height: 1.15 !important;
              overflow: hidden;
            }
            
            th:nth-child(1), td:nth-child(1) { width: 2.5% !important; }
            th:nth-child(2), td:nth-child(2) { width: 9% !important; }
            th:nth-child(3), td:nth-child(3) { width: 1.5% !important; }
            
            th:nth-child(4), td:nth-child(4),
            th:nth-child(5), td:nth-child(5),
            th:nth-child(6), td:nth-child(6),
            th:nth-child(7), td:nth-child(7),
            th:nth-child(8), td:nth-child(8) { 
              width: 2.56% !important; 
            }
            
            th:nth-child(9), td:nth-child(9) { width: 9% !important; }
            th:nth-child(10), td:nth-child(10) { width: 1.5% !important; }
            th:nth-child(11), td:nth-child(11) { width: 4.5% !important; }
            th:nth-child(12), td:nth-child(12) { width: 7% !important; }
            th:nth-child(13), td:nth-child(13) { width: 9% !important; }
            th:nth-child(14), td:nth-child(14) { width: 2.5% !important; }
            
            tbody td > div {
              min-height: 32px !important;
              padding: 1.5px !important;
            }
            
            tbody td > div > div {
              display: flex !important;
              flex-wrap: wrap !important;
              gap: 1.5px !important;
              align-items: flex-start !important;
            }
            
            tbody td > div > div > div {
              display: block !important;
              padding: 0.5px 1.5px !important;
              margin: 0.5px !important;
              font-size: 11px !important;
              line-height: 1.15 !important;
              border: none !important;
              background: transparent !important;
              white-space: normal !important;
              word-wrap: break-word !important;
              color: #000 !important;
              font-weight: 400 !important;
            }
            
            .print\\:text-gray-600 {
              color: #000 !important;
              font-weight: 400 !important;
            }
            
            .print\\:text-red-600 {
              color: #dc2626 !important;
              font-weight: 400 !important;
            }
            
            tbody td > div > div > div.font-bold {
              color: #000 !important;
              font-weight: 700 !important;
            }
            
            tbody td span.inline-block,
            thead th span.inline-block {
              padding: 1px 2px !important;
              font-size: 10px !important;
              border-radius: 2px !important;
              font-weight: 700 !important;
              display: inline-block !important;
            }
            
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
            
            .bg-red-50.text-red-700 {
              background-color: #fef2f2 !important;
              color: #b91c1c !important;
              border: 0.5pt solid #fca5a5 !important;
              padding: 0.5px 1.5px !important;
              font-size: 9px !important;
            }
            
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
            
            input {
              border: none !important;
              background: transparent !important;
              padding: 0 !important;
              font-size: 9px !important;
              color: #000 !important;
            }
            
            svg {
              display: none !important;
            }
            
            tr {
              page-break-inside: avoid !important;
            }
            
            tbody {
              page-break-inside: auto !important;
            }
          }
        `}</style>

        {/* Vacation Period Dialog */}
        <Dialog open={vacationDialog} onOpenChange={setVacationDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ferienzeit hinzufügen</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Von</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {vacationForm.start_date ? format(vacationForm.start_date, 'd.M.yyyy') : 'Datum wählen'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={vacationForm.start_date}
                        onSelect={(date) => setVacationForm({...vacationForm, start_date: date})}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Bis</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {vacationForm.end_date ? format(vacationForm.end_date, 'd.M.yyyy') : 'Datum wählen'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={vacationForm.end_date}
                        onSelect={(date) => setVacationForm({...vacationForm, end_date: date})}
                        disabled={(date) => date < (vacationForm.start_date || new Date())}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setVacationDialog(false)}>
                Abbrechen
              </Button>
              <Button 
                onClick={() => {
                  if (vacationForm.start_date && vacationForm.end_date) {
                    setForm({
                      ...form,
                      vacation_periods: [
                        ...form.vacation_periods,
                        {
                          start_date: format(vacationForm.start_date, 'yyyy-MM-dd'),
                          end_date: format(vacationForm.end_date, 'yyyy-MM-dd')
                        }
                      ]
                    });
                    setVacationDialog(false);
                    setVacationForm({ start_date: null, end_date: null });
                  }
                }}
                disabled={!vacationForm.start_date || !vacationForm.end_date}
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
              >
                Hinzufügen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* TBZ Period Dialog */}
        <Dialog open={tbzDialog} onOpenChange={setTbzDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>TBZ-Zeitraum hinzufügen</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Von</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {tbzForm.start_date ? format(tbzForm.start_date, 'd.M.yyyy') : 'Datum wählen'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={tbzForm.start_date}
                        onSelect={(date) => setTbzForm({...tbzForm, start_date: date})}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Bis</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        <Calendar className="w-4 h-4 mr-2" />
                        {tbzForm.end_date ? format(tbzForm.end_date, 'd.M.yyyy') : 'Datum wählen'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={tbzForm.end_date}
                        onSelect={(date) => setTbzForm({...tbzForm, end_date: date})}
                        disabled={(date) => date < (tbzForm.start_date || new Date())}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setTbzDialog(false)}>
                Abbrechen
              </Button>
              <Button 
                onClick={() => {
                  if (tbzForm.start_date && tbzForm.end_date) {
                    setForm({
                      ...form,
                      tbz_periods: [
                        ...form.tbz_periods,
                        {
                          start_date: format(tbzForm.start_date, 'yyyy-MM-dd'),
                          end_date: format(tbzForm.end_date, 'yyyy-MM-dd')
                        }
                      ]
                    });
                    setTbzDialog(false);
                    setTbzForm({ start_date: null, end_date: null });
                  }
                }}
                disabled={!tbzForm.start_date || !tbzForm.end_date}
                className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
              >
                Hinzufügen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DragDropContext>
  );
}