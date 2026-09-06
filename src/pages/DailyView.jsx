import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, getDay, startOfWeek as dateFnsStartOfWeek } from 'date-fns';
import { isPublicHoliday, getPublicHolidayName } from '@/utils/publicHolidays';
import { de } from 'date-fns/locale';
import {
  ClipboardList,
  Clock,
  MapPin,
  Users,
  Car,
  RefreshCw,
  Printer,
  ChevronLeft,
  ChevronRight,
  Moon,
  GripVertical,
  FileText,
  Copy,
  AlertTriangle,
  Mail
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { generateDailyViewPDF } from '@/components/DailyViewPDF';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import VehicleEditDialog from '@/components/VehicleEditDialog';
import EmailPDFDialog from '@/components/EmailPDFDialog';

export default function DailyView() {
  const [assignments, setAssignments] = useState([]);
  const [futureAssignments, setFutureAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [tempWorkers, setTempWorkers] = useState([]);
  const [tempAssignments, setTempAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [lastAutoAssignedDate, setLastAutoAssignedDate] = useState(null);
  const [printMode, setPrintMode] = useState('full');
  const [vehicleDialog, setVehicleDialog] = useState(null);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [editVehicle, setEditVehicle] = useState(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  // Prüft ob ein Mitarbeiter an einem bestimmten Datum auf Übernachtung ist
  const isEmployeeOvernight = (employee, date) => {
    if (!employee) return false;
    const dateStr = format(date, 'yyyy-MM-dd');
    if (employee.friday_exceptions?.includes(dateStr)) return false;
    if (employee.overnight_stay) return true;

    const weekMon = format(dateFnsStartOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
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

  // Berechnet den ersten Arbeitstag der Woche (Montag, oder später wenn Feiertag/Brückentag)
  const getFirstWorkdayOfWeek = async (date) => {
    const dow = date.getDay();
    const diff = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(date);
    monday.setDate(date.getDate() + diff);

    let bridgeDaySet = new Set();
    try {
      const bds = await api.entities.BridgeDay.list();
      bridgeDaySet = new Set(bds.map(d => d.date));
    } catch {}

    let candidate = new Date(monday);
    for (let i = 0; i < 5; i++) {
      const cdow = candidate.getDay();
      const cdStr = format(candidate, 'yyyy-MM-dd');
      if (cdow !== 0 && cdow !== 6 && !isPublicHoliday(candidate, 'NRW') && !bridgeDaySet.has(cdStr)) {
        return cdStr;
      }
      candidate.setDate(candidate.getDate() + 1);
    }
    return format(monday, 'yyyy-MM-dd');
  };

  // Weist jedem Monteur sein verknüpftes Fahrzeug zu (bzw. das vom ersten Arbeitstag der Woche bei Übernachtung)
  const autoAssignLinkedVehicles = async (assignmentsData, vehiclesData, employeesData) => {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Fahrzeuge die heute in Werkstatt sind (TÜV oder Inspektion)
    const inShopToday = new Set(
      vehiclesData.filter(v => v.next_tuev_date === dateStr || v.next_inspection_date === dateStr).map(v => v.id)
    );

    // Erster Arbeitstag der Woche ermitteln
    const firstWorkday = await getFirstWorkdayOfWeek(selectedDate);
    const isFirstWorkday = firstWorkday === dateStr;

    // Assignments des ersten Arbeitstages laden (für Fahrzeugübernahme bei Übernachtungs-Monteuren)
    let firstDayAssignments = [];
    if (!isFirstWorkday) {
      try {
        firstDayAssignments = await api.entities.Assignment.filter({ date: firstWorkday });
      } catch {}
    }

    const updatedAssignments = assignmentsData.map(a => ({ ...a }));
    const dbUpdates = [];

    for (const assignment of updatedAssignments) {
      if (assignment.assignment_type !== 'baustelle' || !assignment.employee_id || !assignment.project_id || assignment.project_id === 'workshop') continue;
      if (assignment.vehicle_id) continue; // bereits manuell zugewiesen → nicht anfassen

      const emp = employeesData.find(e => e.id === assignment.employee_id);
      if (!emp || (emp.employee_type !== 'monteur' && emp.employee_type !== 'azubi')) continue;

      let vehicleToAssign = null;

      // Für Übernachtungs-Monteure (nicht am ersten Arbeitstag): Fahrzeug vom ersten Arbeitstag übernehmen
      if (!isFirstWorkday && isEmployeeOvernight(emp, selectedDate)) {
        const firstDayAssignment = firstDayAssignments.find(
          a => a.employee_id === assignment.employee_id &&
               a.project_id === assignment.project_id &&
               a.assignment_type === 'baustelle' &&
               a.vehicle_id
        );
        if (firstDayAssignment?.vehicle_id) {
          const v = vehiclesData.find(veh => veh.id === firstDayAssignment.vehicle_id);
          if (v && v.is_active && !inShopToday.has(v.id)) {
            vehicleToAssign = v;
          }
        }
      }

      // Fallback: eigenes verknüpftes Fahrzeug
      if (!vehicleToAssign) {
        const linkedVehicle = vehiclesData.find(v => v.assigned_employee_id === assignment.employee_id && v.is_active && !v.is_ef);
        if (linkedVehicle && !inShopToday.has(linkedVehicle.id)) {
          vehicleToAssign = linkedVehicle;
        }
      }

      if (!vehicleToAssign) continue;

      assignment.vehicle_id = vehicleToAssign.id;
      dbUpdates.push(api.entities.Assignment.update(assignment.id, { vehicle_id: vehicleToAssign.id }));
    }

    if (dbUpdates.length > 0) {
      await Promise.all(dbUpdates).catch(() => {});
    }

    return updatedAssignments;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const [assignmentsData, employeesData, projectsData, vehiclesData, leaveRequestsData, tempWorkersData, tempAssignmentsData] = await Promise.all([
        api.entities.Assignment.filter({ date: dateStr }),
        api.entities.Employee.list(),
        api.entities.Project.list(),
        api.entities.Vehicle.list(),
        api.entities.LeaveRequest.filter({ status: 'genehmigt' }),
        api.entities.TempWorker.filter({ is_active: true }),
        api.entities.TempAssignment.list(),
      ]);
      
      // Filter out EF projects and EF employees
      const filteredProjects = projectsData.filter(p => !p.is_ef_project);
      const filteredEmployees = employeesData.filter(e => !e.is_ef);

      // Genehmigte LeaveRequests ergänzen
      const typeMap = { urlaub: 'urlaub', krankmeldung: 'krank' };
      leaveRequestsData.forEach(req => {
        if (!req.employee_id || !req.start_date || !req.end_date) return;
        const assignmentType = typeMap[req.request_type];
        if (!assignmentType) return;
        if (dateStr < req.start_date || dateStr > req.end_date) return;
        const alreadyExists = assignmentsData.some(
          a => a.employee_id === req.employee_id && ['urlaub', 'krank', 'beurlaubung'].includes(a.assignment_type)
        );
        if (!alreadyExists) {
          assignmentsData.push({
            id: `leave_${req.id}_${dateStr}`,
            employee_id: req.employee_id,
            date: dateStr,
            assignment_type: assignmentType,
            _from_leave_request: true,
          });
        }
      });
      
      const isNewDate = lastAutoAssignedDate !== dateStr;
      let finalAssignments = assignmentsData;

      if (isNewDate) {
        const toReset = assignmentsData.filter(a => a.vehicle_id && !a._from_leave_request);
        if (toReset.length > 0) {
          await Promise.all(toReset.map(a => api.entities.Assignment.update(a.id, { vehicle_id: null }))).catch(() => {});
          toReset.forEach(a => { a.vehicle_id = null; });
        }

        finalAssignments = await autoAssignLinkedVehicles(assignmentsData, vehiclesData, filteredEmployees);
        setLastAutoAssignedDate(dateStr);
      }
      
      setAssignments(finalAssignments);
      setEmployees(filteredEmployees);
      setProjects(filteredProjects);
      setVehicles(vehiclesData);
      setTempWorkers(tempWorkersData.filter(w => !w.is_ef));
      setTempAssignments(tempAssignmentsData);

      // Für Abwesenheits-Enddatum: lade Assignments der nächsten 30 Tage
      const absenceEmployeeIds = new Set(
        assignmentsData
          .filter(a => ['urlaub','krank','beurlaubung','schule','pruefung','tbz'].includes(a.assignment_type))
          .map(a => a.employee_id)
      );
      if (absenceEmployeeIds.size > 0) {
        const futures = [];
        for (let i = 1; i <= 30; i++) {
          const d = new Date(selectedDate);
          d.setDate(d.getDate() + i);
          futures.push(format(d, 'yyyy-MM-dd'));
        }
        const futureData = await Promise.all(
          futures.map(d => api.entities.Assignment.filter({ date: d }))
        );
        setFutureAssignments(futureData.flat());
      } else {
        setFutureAssignments([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEmployee = (id) => employees.find(e => e.id === id);

  const getTempWorkersForProjectDay = (projectId, date) => {
    const weekStartDate = dateFnsStartOfWeek(date, { weekStartsOn: 1 });
    const weekStartStr = format(weekStartDate, 'yyyy-MM-dd');
    return tempAssignments
      .filter(ta => ta.project_id === projectId && ta.week_start === weekStartStr)
      .map(ta => tempWorkers.find(w => w.id === ta.temp_worker_id))
      .filter(Boolean);
  };
  const getProject = (id) => projects.find(p => p.id === id);
  const getVehicle = (id) => vehicles.find(v => v.id === id);

  // Gibt den letzten Tag einer zusammenhängenden Abwesenheit zurück
  const getAbsenceEndDate = (employeeId, absenceType) => {
    const allRelevant = [...assignments, ...futureAssignments];
    const dateSet = new Set(
      allRelevant
        .filter(a => a.employee_id === employeeId && a.assignment_type === absenceType)
        .map(a => a.date)
    );
    const fromDateStr = format(selectedDate, 'yyyy-MM-dd');
    let last = fromDateStr;
    let d = new Date(fromDateStr);
    while (true) {
      d.setDate(d.getDate() + 1);
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

  const getVehicleBadgeClass = (vehicle) => {
    if (!vehicle) return '';
    if (vehicle.seats >= 6) return 'bg-red-100 text-red-700 border-red-300';
    if (vehicle.seats <= 3) return 'bg-gray-900 text-white border-gray-900';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  };

  const getVehiclePdfColor = (vehicle) => {
    if (!vehicle) return '#000';
    if (vehicle.seats >= 6) return '#dc2626';
    if (vehicle.seats <= 3) return '#000';
    return '#000';
  };

  const getDisplayName = (employee) => {
    if (!employee) return 'Unbekannt';
    let name = '';
    if (employee.employee_type === 'azubi') {
      const lastName = employee.full_name?.split(' ').pop();
      name = `${lastName} ${employee.apprentice_year || ''}`;
    } else {
      name = employee.full_name;
    }
    
    if (employee.remark) {
      name = `${name} (${employee.remark})`;
    }
    if (employee.employee_type === 'praktikant') {
      name = `${name} (P)`;
    }
    return name;
  };

  // Group assignments by project
   const groupedByProject = assignments
     .filter(a => a.assignment_type === 'baustelle' && a.project_id && a.project_id !== 'workshop' && (a.employee_id || a.notes))
     .reduce((acc, assignment) => {
       const projectId = assignment.project_id;
       if (!acc[projectId]) {
         const project = getProject(projectId);
         acc[projectId] = {
           project: project,
           assignments: [],
           vehicles: new Set(),
           departureTime: project?.default_departure_time || null,
           workStartTime: project?.default_work_start_time || null,
           workEndTime: project?.default_work_end_time || null
         };
       }
       acc[projectId].assignments.push(assignment);
       if (assignment.vehicle_id) {
         acc[projectId].vehicles.add(assignment.vehicle_id);
       }
       if (assignment.departure_time && !acc[projectId].departureTime) {
         acc[projectId].departureTime = assignment.departure_time;
       }
       if (assignment.work_start_time && !acc[projectId].workStartTime) {
         acc[projectId].workStartTime = assignment.work_start_time;
       }
       if (assignment.work_end_time && !acc[projectId].workEndTime) {
         acc[projectId].workEndTime = assignment.work_end_time;
       }
       return acc;
     }, {});

   // Get workshop assignments
   const workshopAssignments = assignments.filter(a => a.assignment_type === 'baustelle' && a.project_id === 'workshop');

  const getProjectLeaderAbbreviation = (projectId) => {
    const project = getProject(projectId);
    if (!project) return '';
    const projectLeader = employees.find(e => e.id === project.project_leader_id);
    return projectLeader?.abbreviation || projectLeader?.full_name?.charAt(0) || '';
  };

  const groupHasDriver = (assignmentList) => {
    return assignmentList.some(a => getEmployee(a.employee_id)?.has_drivers_license);
  };

  const employeeTypePriority = (emp) => {
    if (!emp) return 99;
    if (emp.employee_type === 'monteur') return 0;
    if (emp.employee_type === 'azubi') return 1;
    if (emp.employee_type === 'praktikant') return 2;
    return 3;
  };

  const sortAssignments = (assignmentList) => {
    return [...assignmentList].sort((a, b) => {
      const empA = getEmployee(a.employee_id);
      const empB = getEmployee(b.employee_id);
      if (!a.employee_id && !b.employee_id) return 0;
      if (!a.employee_id) return 1;
      if (!b.employee_id) return -1;
      const pA = employeeTypePriority(empA);
      const pB = employeeTypePriority(empB);
      if (pA !== pB) return pA - pB;
      return (empA?.full_name || '').localeCompare(empB?.full_name || '');
    });
  };

  const sortByPLThenName = (a, b) => {
    const aAbbr = getProjectLeaderAbbreviation(a.project?.id);
    const bAbbr = getProjectLeaderAbbreviation(b.project?.id);
    const plCmp = aAbbr.localeCompare(bAbbr);
    if (plCmp !== 0) return plCmp;
    return (a.project?.name || '').localeCompare(b.project?.name || '');
  };

  const _isFriday = selectedDate.getDay() === 5;

  const isPlaceholderOvernight = (a) => !a.employee_id && !!a.notes && !!a.is_supervisor;
  const isPlaceholderDay = (a) => !a.employee_id && !!a.notes && !a.is_supervisor;

  const hasOvernightPerson = (a) => {
    if (!a.employee_id) return isPlaceholderOvernight(a);
    const emp = getEmployee(a.employee_id);
    return emp ? isEmployeeOvernight(emp, selectedDate) : false;
  };

  const hasDayPerson = (a) => {
    if (!a.employee_id) return isPlaceholderDay(a);
    const emp = getEmployee(a.employee_id);
    return emp ? !isEmployeeOvernight(emp, selectedDate) : false;
  };

  const projectsWithOvernight = Object.values(groupedByProject).filter(group =>
    group.project && !_isFriday && group.assignments.some(a => hasOvernightPerson(a))
  ).sort(sortByPLThenName);

  const projectsTS = Object.values(groupedByProject).filter(group =>
    group.project?.is_ts_project && group.assignments.some(a => hasDayPerson(a))
  ).sort(sortByPLThenName);

  const projectsWithoutOvernight = Object.values(groupedByProject).filter(group =>
    group.project && !group.project?.is_ts_project && group.assignments.some(a => hasDayPerson(a))
  ).sort(sortByPLThenName);

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const isVehicleUnavailable = (vehicle) => {
    if (!vehicle) return false;
    return vehicle.next_tuev_date === selectedDateStr || vehicle.next_inspection_date === selectedDateStr;
  };

  const usedVehicleIds = new Set(
    assignments
      .filter(a => a.vehicle_id && a.assignment_type === 'baustelle')
      .map(a => a.vehicle_id)
  );
  const availableVehicles = vehicles.filter(v => v.is_active && !usedVehicleIds.has(v.id) && !v.is_ef && !isVehicleUnavailable(v));

  const absenceTypes = [
    { key: 'beurlaubung', label: 'Beurlaubung' },
    { key: 'urlaub', label: 'Urlaub' },
    { key: 'schule', label: 'Berufsschule' },
    { key: 'pruefung', label: 'Prüfung' },
    { key: 'tbz', label: 'TBZ' },
    { key: 'krank', label: 'Krank' }
  ];

  const getAbsenceAssignments = (type) => {
    return assignments.filter(a => {
      if (a.assignment_type !== type) return false;
      const emp = getEmployee(a.employee_id);
      return emp && !emp.is_ef;
    });
  };

  const copyVehiclesFromPreviousDay = async () => {
    try {
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      const prevDateStr = format(previousDate, 'yyyy-MM-dd');

      const [prevAssignments, allEmployees] = await Promise.all([
        api.entities.Assignment.filter({ date: prevDateStr }),
        employees.length > 0 ? Promise.resolve(employees) : api.entities.Employee.list()
      ]);

      const getEmpOvernight = (empId) => {
        const emp = allEmployees.find(e => e.id === empId);
        return isEmployeeOvernight(emp, selectedDate);
      };

      const prevVehiclesByKey = {};
      for (const a of prevAssignments) {
        if (a.assignment_type !== 'baustelle' || !a.project_id || !a.vehicle_id) continue;
        const isOvernight = getEmpOvernight(a.employee_id);
        const key = `${a.project_id}_${isOvernight}`;
        if (!prevVehiclesByKey[key]) prevVehiclesByKey[key] = new Set();
        prevVehiclesByKey[key].add(a.vehicle_id);
      }

      if (Object.keys(prevVehiclesByKey).length === 0) {
        toast.info('Keine Fahrzeugzuweisungen vom Vortag gefunden');
        return;
      }

      const localAssignments = assignments.map(a => ({ ...a }));
      const updates = [];

      for (const [key, vehicleSet] of Object.entries(prevVehiclesByKey)) {
        const [projectId, overnightStr] = key.split('_');
        const isOvernight = overnightStr === 'true';

        const todayGroup = localAssignments.filter(
          a => a.assignment_type === 'baustelle' && a.project_id === projectId
            && getEmpOvernight(a.employee_id) === isOvernight
        );
        if (todayGroup.length === 0) continue;

        for (const vehicleId of vehicleSet) {
          if (localAssignments.some(a => a.vehicle_id === vehicleId)) continue;
          const target = todayGroup.find(a => !a.vehicle_id) || todayGroup[0];
          if (!target) continue;
          updates.push(api.entities.Assignment.update(target.id, { vehicle_id: vehicleId }));
          target.vehicle_id = vehicleId;
        }
      }

      if (updates.length === 0) {
        toast.info('Alle Fahrzeuge bereits zugewiesen oder Projekte nicht mehr aktiv');
        return;
      }

      await Promise.all(updates);
      toast.success(`${updates.length} Fahrzeug(e) vom Vortag übernommen`);
      loadData();
    } catch (error) {
      console.error('Error copying vehicles:', error);
      toast.error('Fehler beim Übernehmen der Fahrzeuge');
    }
  };

  const changeDate = async (days) => {
    let newDate = new Date(selectedDate);
    const direction = days > 0 ? 1 : -1;
    newDate.setDate(newDate.getDate() + days);

    let bridgeDaySet = new Set();
    try {
      const bds = await api.entities.BridgeDay.list();
      bridgeDaySet = new Set(bds.map(d => d.date));
    } catch {}

    let safety = 0;
    while (safety < 20) {
      const dow = getDay(newDate);
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = isPublicHoliday(newDate, 'NRW');
      const isBridge = bridgeDaySet.has(format(newDate, 'yyyy-MM-dd'));
      if (!isWeekend && !isHoliday && !isBridge) break;
      newDate.setDate(newDate.getDate() + direction);
      safety++;
    }
    
    setSelectedDate(newDate);
  };

  const handlePrint = (mode) => {
    setPrintMode(mode);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleDownloadPDF = () => {
    try {
      const dayOfWeek = selectedDate.getDay();
      const isFridayFlag = dayOfWeek === 5;

      const absenceRows = absenceTypes.map(({ key, label }) => ({
        key,
        label,
        assignments: getAbsenceAssignments(key),
      }));

      generateDailyViewPDF({
        selectedDate,
        projectsWithOvernight,
        projectsWithoutOvernight,
        projectsTS,
        workshopAssignments,
        absenceRows,
        employees,
        getEmployee,
        getVehicle,
        isFriday: isFridayFlag,
        getAbsenceEndDate,
        getTempWorkersForProject: (projectId) => getTempWorkersForProjectDay(projectId, selectedDate),
        availableVehicles,
      });
      toast.success('PDF erfolgreich heruntergeladen');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Fehler beim Erstellen der PDF');
    }
  };

  const handleDownloadPDFNoAbsences = () => {
    try {
      const dayOfWeek = selectedDate.getDay();
      const isFridayFlag = dayOfWeek === 5;

      generateDailyViewPDF({
        selectedDate,
        projectsWithOvernight,
        projectsWithoutOvernight,
        projectsTS,
        workshopAssignments,
        absenceRows: [],
        employees,
        getEmployee,
        getVehicle,
        isFriday: isFridayFlag,
        getTempWorkersForProject: (projectId) => getTempWorkersForProjectDay(projectId, selectedDate),
        availableVehicles: [],
      });
      toast.success('PDF ohne Abwesenheiten heruntergeladen');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Fehler beim Erstellen der PDF');
    }
  };

  const checkVehicleConflict = (vehicleId, targetProjectId) => {
    const vehicle = getVehicle(vehicleId);
    if (!vehicle?.always_assign || !vehicle?.assigned_employee_id) return null;
    const assignedEmp = employees.find(e => e.id === vehicle.assigned_employee_id);
    if (!assignedEmp) return null;
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const empAssignment = assignments.find(
      a => a.employee_id === assignedEmp.id && a.assignment_type === 'baustelle' && a.date === dateStr && a.project_id && a.project_id !== 'workshop'
    );
    if (!empAssignment || empAssignment.project_id === targetProjectId) return null;
    const empProject = projects.find(p => p.id === empAssignment.project_id);
    return `Dieses Fahrzeug ist ${assignedEmp.full_name} fest zugeordnet (fährt immer damit), der heute auf "${empProject?.name || 'einer anderen Baustelle'}" eingeplant ist!`;
  };

  const handleVehicleAssign = (vehicleId) => {
    if (!vehicleDialog) return;
    const { projectId, isOvernight } = vehicleDialog;

    const conflict = checkVehicleConflict(vehicleId, projectId);
    if (conflict) {
      toast.warning(conflict, { duration: 5000 });
    }

    let projectAssignments = assignments.filter(a => a.project_id === projectId && a.assignment_type === 'baustelle');
    projectAssignments = isOvernight
      ? projectAssignments.filter(a => isEmployeeOvernight(getEmployee(a.employee_id), selectedDate))
      : projectAssignments.filter(a => !isEmployeeOvernight(getEmployee(a.employee_id), selectedDate));
    const target = projectAssignments.find(a => !a.vehicle_id) || projectAssignments[0];
    const prevVehicleOwners = assignments.filter(a => a.vehicle_id === vehicleId).map(a => a.id);

    setAssignments(prev => prev.map(a => {
      if (prevVehicleOwners.includes(a.id)) return { ...a, vehicle_id: null };
      if (target && a.id === target.id) return { ...a, vehicle_id: vehicleId };
      return a;
    }));
    setVehicleDialog(null);
    setVehicleSearch('');
    toast.success('Fahrzeug zugewiesen');

    (async () => {
      try {
        if (prevVehicleOwners.length > 0) await Promise.all(prevVehicleOwners.map(id => api.entities.Assignment.update(id, { vehicle_id: null })));
        if (target) await api.entities.Assignment.update(target.id, { vehicle_id: vehicleId });
      } catch {
        toast.error('Fehler beim Speichern – Daten werden neu geladen');
        loadData();
      }
    })();
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId) return;

    if (!draggableId.startsWith('vehicle_')) return;
    const vehicleId = draggableId.replace('vehicle_', '');

    if (destination.droppableId === 'available_vehicles') {
      const owners = assignments.filter(a => a.vehicle_id === vehicleId).map(a => a.id);
      setAssignments(prev => prev.map(a => owners.includes(a.id) ? { ...a, vehicle_id: null } : a));
      toast.success('Fahrzeug freigegeben');
      Promise.all(owners.map(id => api.entities.Assignment.update(id, { vehicle_id: null }))).catch(() => { toast.error('Fehler'); loadData(); });
      return;
    }

    if (destination.droppableId.startsWith('project_')) {
      const destProjectIdMatch = destination.droppableId.match(/^project_([^_]+)/);
      if (!destProjectIdMatch) return;
      const destProjectId = destProjectIdMatch[1];
      const isOvernightTarget = destination.droppableId.endsWith('_overnight');

      const conflict = checkVehicleConflict(vehicleId, destProjectId);
      if (conflict) {
        toast.warning(conflict, { duration: 5000 });
      }

      let projectAssignments = assignments.filter(a => a.project_id === destProjectId && a.assignment_type === 'baustelle');
      projectAssignments = isOvernightTarget
        ? projectAssignments.filter(a => isEmployeeOvernight(getEmployee(a.employee_id), selectedDate))
        : projectAssignments.filter(a => !isEmployeeOvernight(getEmployee(a.employee_id), selectedDate));

      if (projectAssignments.length === 0) return;
      const targetAssignment = projectAssignments.find(a => !a.vehicle_id) || projectAssignments[0];
      const prevOwners = assignments.filter(a => a.vehicle_id === vehicleId).map(a => a.id);

      setAssignments(prev => prev.map(a => {
        if (prevOwners.includes(a.id)) return { ...a, vehicle_id: null };
        if (a.id === targetAssignment.id) return { ...a, vehicle_id: vehicleId };
        return a;
      }));
      toast.success('Fahrzeug zugewiesen');

      (async () => {
        try {
          if (prevOwners.length > 0) await Promise.all(prevOwners.map(id => api.entities.Assignment.update(id, { vehicle_id: null })));
          await api.entities.Assignment.update(targetAssignment.id, { vehicle_id: vehicleId });
        } catch {
          toast.error('Fehler beim Zuweisen');
          loadData();
        }
      })();
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  const dayOfWeek = getDay(selectedDate);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isFriday = dayOfWeek === 5;
  const holidayName = getPublicHolidayName(selectedDate, 'NRW');

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
            <ClipboardList className="w-8 h-8 dark:text-blue-300" />
            Tagesansicht
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {format(selectedDate, "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={async () => {
              let today = new Date();
              let bridgeDaySet = new Set();
              try {
                const bds = await api.entities.BridgeDay.list();
                bridgeDaySet = new Set(bds.map(d => d.date));
              } catch {}
              let safety = 0;
              while (safety < 20) {
                const dow = getDay(today);
                if (dow !== 0 && dow !== 6 && !isPublicHoliday(today, 'NRW') && !bridgeDaySet.has(format(today, 'yyyy-MM-dd'))) break;
                today.setDate(today.getDate() + 1);
                safety++;
              }
              setSelectedDate(today);
            }}
          >
            Heute
          </Button>
          <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} className="hidden lg:flex">
            <RefreshCw className="w-4 h-4 mr-2" />
            Aktualisieren
          </Button>
          <Button variant="outline" size="icon" onClick={loadData} className="lg:hidden">
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="hidden lg:flex">
            <FileText className="w-4 h-4 mr-2" />
            PDF Download
          </Button>
          <Button variant="outline" size="icon" onClick={handleDownloadPDF} className="lg:hidden">
            <FileText className="w-4 h-4" />
          </Button>

          <Button variant="outline" size="sm" onClick={handleDownloadPDFNoAbsences} className="hidden lg:flex">
            <FileText className="w-4 h-4 mr-2" />
            PDF ohne Abwesenheiten
          </Button>
          <Button variant="outline" size="icon" onClick={handleDownloadPDFNoAbsences} className="lg:hidden" title="PDF ohne Abwesenheiten">
            <FileText className="w-4 h-4" />
          </Button>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setEmailDialogOpen(true)}
            className="hidden lg:flex bg-blue-50 hover:bg-blue-100 border-blue-200"
          >
            <Mail className="w-4 h-4 mr-2" />
            PDF per Mail
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => setEmailDialogOpen(true)}
            className="lg:hidden bg-blue-50 hover:bg-blue-100 border-blue-200"
            title="PDF per E-Mail versenden"
          >
            <Mail className="w-4 h-4" />
          </Button>

          <Button variant="outline" size="sm" onClick={copyVehiclesFromPreviousDay} className="hidden lg:flex">
           <Copy className="w-4 h-4 mr-2" />
           Fahrzeuge vom Vortag
          </Button>
          <Button variant="outline" size="icon" onClick={copyVehiclesFromPreviousDay} className="lg:hidden" title="Fahrzeuge vom Vortag übernehmen">
           <Copy className="w-4 h-4" />
          </Button>
          </div>
          </div>

      {/* Print Header */}
      <div className="hidden print-only text-center mb-4">
        <h1 className="text-xl font-bold">Tageseinteilung</h1>
        <p>{format(selectedDate, "EEEE, d. MMMM yyyy", { locale: de })}</p>
      </div>

      {/* Weekend Warning */}
      {isWeekend && (
        <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <CardContent className="py-4 text-center">
            <p className="text-amber-700 dark:text-amber-300 font-medium">
              Dies ist ein Wochenende. Normalerweise werden nur Wochentage (Mo-Fr) geplant.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Holiday Warning */}
      {holidayName && (
        <Card className="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="py-4 text-center">
            <p className="text-blue-700 dark:text-blue-300 font-medium">
              🎉 {holidayName} – gesetzlicher Feiertag (NRW)
            </p>
          </CardContent>
        </Card>
      )}

      {/* Baustellen mit Drag & Drop */}
      <Card className="border-0 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900">
              <TableHead className="w-16 dark:text-gray-300">PL</TableHead>
              <TableHead className="w-20 dark:text-gray-300">Abfahrt</TableHead>
              <TableHead className="w-28 dark:text-gray-300">Arbeitszeit</TableHead>
              <TableHead className="dark:text-gray-300">Baustelle</TableHead>
              <TableHead className="dark:text-gray-300">Monteure</TableHead>
              <TableHead className="w-64 dark:text-gray-300">Fahrzeuge</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Baustellen mit Übernachtungspersonal */}
            {projectsWithOvernight.length > 0 && (
              <>
                <TableRow className="bg-red-50 dark:bg-red-900/20">
                   <TableCell colSpan={6} className="font-semibold text-red-900 dark:text-red-300 py-2">
                     Mit Übernachtung
                   </TableCell>
                 </TableRow>
                {projectsWithOvernight.map((group) => {
                  const project = group.project;
                  if (!project) return null;

                  const projectLeader = project.project_leader_id ? employees.find(e => e.id === project.project_leader_id) : null;
                  const overnightAssignments = sortAssignments(isFriday ? [] : group.assignments.filter(a => hasOvernightPerson(a)));
                  const noDriverOvernight = overnightAssignments.filter(a => a.employee_id).length > 0 && !groupHasDriver(overnightAssignments);

                  return (
                   <TableRow key={`${project.id}_overnight`} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
                     <TableCell className="font-bold text-[#1e3a5f] dark:text-blue-300">
                       {projectLeader?.abbreviation || projectLeader?.full_name?.charAt(0) || '-'}
                     </TableCell>
                     <TableCell>
                       {group.departureTime ? (
                         <Badge variant="outline" className="bg-[#1e3a5f]/5 dark:bg-blue-900/30 border-[#1e3a5f]/20 dark:border-blue-700 dark:text-blue-300">
                           <Clock className="w-3 h-3 mr-1" />
                           {group.departureTime}
                         </Badge>
                       ) : '-'}
                     </TableCell>
                     <TableCell className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {(group.workStartTime || group.workEndTime) ? (
                          <span className="text-xs font-medium">{group.workStartTime || '?'} – {group.workEndTime || '?'}</span>
                        ) : '-'}
                      </TableCell>
                     <TableCell>
                       <div className="font-medium text-gray-900 dark:text-white">{project.name}</div>
                       {project.address && (
                         <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                           <MapPin className="w-3 h-3" />
                           {project.address}
                         </div>
                       )}
                       {noDriverOvernight && (
                         <div className="flex items-center gap-1 mt-1 text-orange-600 dark:text-orange-400 text-xs font-medium">
                           <AlertTriangle className="w-3 h-3" />
                           Kein Fahrer!
                         </div>
                       )}
                     </TableCell>
                       <TableCell>
                         <div className="flex flex-wrap gap-1">
                           {overnightAssignments.map((assignment) => {
                             if (!assignment.employee_id && assignment.notes) {
                               return (
                                 <Badge key={assignment.id} variant="outline" className="bg-red-500 text-white border-red-600">
                                   <Moon className="w-3 h-3 mr-1" />
                                   {assignment.notes}
                                 </Badge>
                               );
                             }
                             const emp = getEmployee(assignment.employee_id);
                             if (!emp) return null;

                             return (
                               <Badge
                                 key={assignment.id}
                                 variant="outline"
                                 className="bg-red-500 text-white border-red-600"
                               >
                                 <Moon className="w-3 h-3 mr-1" />
                                 {getDisplayName(emp)}
                                 {assignment.is_supervisor && ' ★'}
                               </Badge>
                             );
                           })}
                         </div>
                       </TableCell>
                       <TableCell>
                         <Droppable droppableId={`project_${project.id}_overnight`} direction="horizontal">
                          {(provided, snapshot) => {
                            const overnightVehicles = new Set(
                              overnightAssignments
                                .filter(a => a.vehicle_id && !isVehicleUnavailable(getVehicle(a.vehicle_id)))
                                .map(a => a.vehicle_id)
                            );
                            return (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              onDoubleClick={() => { setVehicleDialog({ projectId: project.id, isOvernight: true }); setVehicleSearch(''); }}
                              className={`flex flex-wrap gap-1 min-h-[32px] p-1 rounded cursor-pointer ${
                                snapshot.isDraggingOver ? 'bg-blue-100' : ''
                              }`}
                            >
                              {Array.from(overnightVehicles).map((vehicleId, index) => {
                                const vehicle = getVehicle(vehicleId);
                                if (!vehicle) return null;

                                return (
                                  <Draggable
                                    key={vehicleId}
                                    draggableId={`vehicle_${vehicleId}`}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={`${snapshot.isDragging ? 'opacity-50' : ''}`}
                                      >
                                        <Badge
                                          variant="outline"
                                          className={`cursor-grab flex items-center gap-1 ${getVehicleBadgeClass(vehicle)}`}
                                          onDoubleClick={(e) => { e.stopPropagation(); setEditVehicle(vehicle); }}
                                          >
                                            <GripVertical className="w-3 h-3" />
                                            <Car className="w-3 h-3" />
                                            {vehicle.license_plate}
                                          </Badge>
                                          </div>
                                          )}
                                          </Draggable>
                                          );
                                          })}
                                          {provided.placeholder}
                                          </div>
                                          );
                                          }}
                                          </Droppable>
                                          </TableCell>
                                          </TableRow>
                                          );
                                          })}
                                          </>
                                          )}

                                          {/* Normale Baustellen */}
                      {projectsWithoutOvernight.length > 0 && (
                      <>
                      <TableRow className="bg-gray-100 dark:bg-gray-700">
                        <TableCell colSpan={6} className="font-semibold text-gray-700 dark:text-gray-300 py-2">
                            Ohne Übernachtung
                          </TableCell>
                        </TableRow>
                        {projectsWithoutOvernight.map((group) => {
                          const project = group.project;
                          if (!project) return null;

                          const projectLeader = project.project_leader_id ? employees.find(e => e.id === project.project_leader_id) : null;
                        const nonOvernightAssignments = sortAssignments(group.assignments.filter(a => hasDayPerson(a)));
                        const noDriverDay = nonOvernightAssignments.filter(a => a.employee_id).length > 0 && !groupHasDriver(nonOvernightAssignments);

                        return (
                        <TableRow key={`${project.id}_no_overnight`} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
                        <TableCell className="font-bold text-[#1e3a5f] dark:text-blue-300">
                          {projectLeader?.abbreviation || projectLeader?.full_name?.charAt(0) || '-'}
                        </TableCell>
                        <TableCell>
                          {group.departureTime ? (
                            <Badge variant="outline" className="bg-[#1e3a5f]/5 dark:bg-blue-900/30 border-[#1e3a5f]/20 dark:border-blue-700 dark:text-blue-300">
                              <Clock className="w-3 h-3 mr-1" />
                              {group.departureTime}
                            </Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {(group.workStartTime || group.workEndTime) ? (
                            <span className="text-xs font-medium">{group.workStartTime || '?'} – {group.workEndTime || '?'}</span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-gray-900 dark:text-white">{project.name}</div>
                          {project.address && (
                            <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {project.address}
                            </div>
                          )}
                          {noDriverDay && (
                          <div className="flex items-center gap-1 mt-1 text-orange-600 dark:text-orange-400 text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Kein Fahrer!
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-wrap gap-1">
                           {nonOvernightAssignments.map((assignment) => {
                               if (!assignment.employee_id && assignment.notes) {
                                 return (
                                   <Badge key={assignment.id} variant="outline" className="bg-orange-500 text-white border-orange-400">
                                     {assignment.notes}
                                   </Badge>
                                 );
                               }
                               const emp = getEmployee(assignment.employee_id);
                               if (!emp) return null;

                               return (
                                 <Badge
                                   key={assignment.id}
                                   variant="outline"
                                   className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                                 >
                                   {getDisplayName(emp)}
                                   {assignment.is_supervisor && ' ★'}
                                 </Badge>
                               );
                             })}
                             {getTempWorkersForProjectDay(project.id, selectedDate).map((tw) => (
                               <Badge key={`tw_${tw.id}`} variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                                 {tw.full_name}
                               </Badge>
                             ))}
                           </div>
                           </TableCell>
                           <TableCell>
                           <Droppable droppableId={`project_${project.id}_day`} direction="horizontal">
                             {(provided, snapshot) => {
                               const dayVehicles = new Set(
                                  nonOvernightAssignments
                                    .filter(a => a.vehicle_id && !isVehicleUnavailable(getVehicle(a.vehicle_id)))
                                    .map(a => a.vehicle_id)
                                );
                             return (
                             <div
                               ref={provided.innerRef}
                               {...provided.droppableProps}
                               onDoubleClick={() => { setVehicleDialog({ projectId: project.id, isOvernight: false }); setVehicleSearch(''); }}
                             className={`flex flex-wrap gap-1 min-h-[32px] p-1 rounded cursor-pointer ${
                               snapshot.isDraggingOver ? 'bg-blue-100' : ''
                             }`}
                           >
                             {Array.from(dayVehicles).map((vehicleId, index) => {
                               const vehicle = getVehicle(vehicleId);
                               if (!vehicle) return null;

                               return (
                                 <Draggable
                                   key={vehicleId}
                                   draggableId={`vehicle_${vehicleId}`}
                                   index={index}
                                 >
                                   {(provided, snapshot) => (
                                     <div
                                       ref={provided.innerRef}
                                       {...provided.draggableProps}
                                       {...provided.dragHandleProps}
                                       className={`${snapshot.isDragging ? 'opacity-50' : ''}`}
                                     >
                                       <Badge
                                         variant="outline"
                                         className={`cursor-grab flex items-center gap-1 ${getVehicleBadgeClass(vehicle)}`}
                                         onDoubleClick={(e) => { e.stopPropagation(); setEditVehicle(vehicle); }}
                                         >
                                         <GripVertical className="w-3 h-3" />
                                         <Car className="w-3 h-3" />
                                         {vehicle.license_plate}
                                       </Badge>
                                       </div>
                                       )}
                                       </Draggable>
                                       );
                                       })}
                                       {provided.placeholder}
                                       </div>
                                       );
                                       }}
                                       </Droppable>
                                       </TableCell>
                                       </TableRow>
                                       );
                                       })}
                                       </>
                                       )}

                                       {/* TS Projekte */}
            {projectsTS.length > 0 && (
              <>
                <TableRow className="bg-purple-50 dark:bg-purple-900/20">
                  <TableCell colSpan={6} className="font-semibold text-purple-900 dark:text-purple-300 py-2">
                    TS
                  </TableCell>
                  </TableRow>
                  {projectsTS.map((group) => {
                  const project = group.project;
                  if (!project) return null;

                  const projectLeader = project.project_leader_id ? employees.find(e => e.id === project.project_leader_id) : null;
                  const nonOvernightAssignments = sortAssignments(group.assignments.filter(a => hasDayPerson(a)));
                  const noDriverTS = nonOvernightAssignments.filter(a => a.employee_id).length > 0 && !groupHasDriver(nonOvernightAssignments);

                  return (
                    <TableRow key={`${project.id}_ts`} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
                      <TableCell className="font-bold text-[#1e3a5f] dark:text-blue-300">
                        {projectLeader?.abbreviation || projectLeader?.full_name?.charAt(0) || '-'}
                      </TableCell>
                      <TableCell>
                        {group.departureTime ? (
                          <Badge variant="outline" className="bg-[#1e3a5f]/5 dark:bg-blue-900/30 border-[#1e3a5f]/20 dark:border-blue-700 dark:text-blue-300">
                            <Clock className="w-3 h-3 mr-1" />
                            {group.departureTime}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {(group.workStartTime || group.workEndTime) ? (
                          <span className="text-xs font-medium">{group.workStartTime || '?'} – {group.workEndTime || '?'}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900 dark:text-white">{project.name}</div>
                        {project.address && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {project.address}
                          </div>
                        )}
                        {noDriverTS && (
                          <div className="flex items-center gap-1 mt-1 text-orange-600 dark:text-orange-400 text-xs font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Kein Fahrer!
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {nonOvernightAssignments.map((assignment) => {
                            if (!assignment.employee_id && assignment.notes) {
                              return (
                                <Badge key={assignment.id} variant="outline" className="bg-orange-500 text-white border-orange-400">
                                  {assignment.notes}
                                </Badge>
                              );
                            }
                            const emp = getEmployee(assignment.employee_id);
                            if (!emp) return null;

                            return (
                              <Badge
                                key={assignment.id}
                                variant="outline"
                                className="bg-[#1e3a5f] text-white border-[#1e3a5f]"
                              >
                                {getDisplayName(emp)}
                                {assignment.is_supervisor && ' ★'}
                              </Badge>
                            );
                          })}
                          {getTempWorkersForProjectDay(project.id, selectedDate).map((tw) => (
                            <Badge key={`tw_${tw.id}`} variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                              {tw.full_name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Droppable droppableId={`project_${project.id}_day`} direction="horizontal">
                          {(provided, snapshot) => {
                            const dayVehicles = new Set(
                               nonOvernightAssignments
                                 .filter(a => a.vehicle_id && !isVehicleUnavailable(getVehicle(a.vehicle_id)))
                                 .map(a => a.vehicle_id)
                             );
                             return (
                             <div
                               ref={provided.innerRef}
                               {...provided.droppableProps}
                               onDoubleClick={() => { setVehicleDialog({ projectId: project.id, isOvernight: false }); setVehicleSearch(''); }}
                               className={`flex flex-wrap gap-1 min-h-[32px] p-1 rounded cursor-pointer ${
                                snapshot.isDraggingOver ? 'bg-blue-100' : ''
                              }`}
                            >
                              {Array.from(dayVehicles).map((vehicleId, index) => {
                                const vehicle = getVehicle(vehicleId);
                                if (!vehicle) return null;

                                return (
                                  <Draggable
                                    key={vehicleId}
                                    draggableId={`vehicle_${vehicleId}`}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                        className={`${snapshot.isDragging ? 'opacity-50' : ''}`}
                                      >
                                        <Badge
                                          variant="outline"
                                          className={`cursor-grab flex items-center gap-1 ${getVehicleBadgeClass(vehicle)}`}
                                          onDoubleClick={(e) => { e.stopPropagation(); setEditVehicle(vehicle); }}
                                          >
                                          <GripVertical className="w-3 h-3" />
                                          <Car className="w-3 h-3" />
                                          {vehicle.license_plate}
                                        </Badge>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          );
                          }}
                        </Droppable>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </>
            )}

            {projectsWithOvernight.length === 0 && projectsWithoutOvernight.length === 0 && projectsTS.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Keine Einsätze für diesen Tag geplant
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Werkstatt Zeile */}
      <Card className="border-0 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        <Table>
          <TableBody>
            <TableRow className="bg-green-100 dark:bg-green-900/30">
              <TableCell className="w-16"></TableCell>
              <TableCell className="w-20"></TableCell>
              <TableCell className="w-28"></TableCell>
              <TableCell className="font-semibold text-green-800 dark:text-green-300">
                Werkstatt
              </TableCell>
              <TableCell colSpan={2}>
                {workshopAssignments.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {workshopAssignments.map(a => {
                      const emp = getEmployee(a.employee_id);
                      if (!emp) return null;
                      return (
                        <Badge
                          key={a.id}
                          variant="outline"
                          className="bg-green-500 text-white border-green-600"
                        >
                          {getDisplayName(emp)}
                        </Badge>
                      );
                    })}
                  </div>
                ) : null}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {/* Abwesenheitszeilen */}
      <Card className="border-0 shadow-sm overflow-hidden print-absence-section dark:bg-gray-800 dark:border-gray-700">
        <Table>
          <TableBody>
            {absenceTypes.map(({ key, label }) => {
              const absences = getAbsenceAssignments(key);
              
              return (
                <TableRow key={key} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
                  <TableCell className="w-16"></TableCell>
                  <TableCell className="w-20"></TableCell>
                  <TableCell className="w-28"></TableCell>
                  <TableCell className="font-medium text-gray-600 dark:text-gray-300">
                    {label}
                  </TableCell>
                  <TableCell colSpan={2}>
                    <div className="flex flex-wrap gap-1">
                      {absences.map(a => {
                        const emp = getEmployee(a.employee_id);
                        const showEndDate = ['urlaub', 'krank', 'beurlaubung'].includes(key);
                        const endDate = showEndDate && emp ? getAbsenceEndDate(emp.id, key) : null;
                        const endLabel = endDate ? ` (${format(new Date(endDate), 'd.M.')})` : '';
                        return (
                          <Badge
                            key={a.id}
                            variant="outline"
                            className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                          >
                            {getDisplayName(emp)}{endLabel}
                          </Badge>
                        );
                      })}
                      {absences.length === 0 && (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">-</span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Verfügbare Fahrzeuge */}
      <Card className="border-0 shadow-sm overflow-hidden print-vehicles-section dark:bg-gray-800 dark:border-gray-700">
        <Table>
          <TableBody>
            <TableRow className="bg-green-50 dark:bg-green-900/30 hover:bg-green-50 dark:hover:bg-green-900/30">
              <TableCell className="w-16"></TableCell>
              <TableCell className="w-20"></TableCell>
              <TableCell className="w-28"></TableCell>
              <TableCell className="font-semibold text-green-800 dark:text-green-300">
                Verfügbare Fahrzeuge
              </TableCell>
              <TableCell></TableCell>
              <TableCell className="w-64">
                <Droppable droppableId="available_vehicles" direction="horizontal">
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex flex-wrap gap-1 min-h-[32px] p-2 rounded ${
                        snapshot.isDraggingOver ? 'bg-green-100' : ''
                      }`}
                    >
                      {availableVehicles.map((vehicle, index) => (
                        <Draggable
                          key={vehicle.id}
                          draggableId={`vehicle_${vehicle.id}`}
                          index={index}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${snapshot.isDragging ? 'opacity-50' : ''}`}
                            >
                              <Badge
                                variant="outline"
                                className={`cursor-grab flex items-center gap-1 ${getVehicleBadgeClass(vehicle)}`}
                               onDoubleClick={(e) => { e.stopPropagation(); setEditVehicle(vehicle); }}
                              >
                                <GripVertical className="w-3 h-3" />
                                <Car className="w-3 h-3" />
                                {vehicle.license_plate}
                              </Badge>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {availableVehicles.length === 0 && (
                        <span className="text-gray-400 dark:text-gray-500 text-sm">Alle Fahrzeuge sind zugewiesen</span>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Card>

      {editVehicle && (
        <VehicleEditDialog
          vehicle={editVehicle}
          onClose={() => setEditVehicle(null)}
          onSaved={loadData}
        />
      )}

      {/* Email PDF Dialog */}
      <EmailPDFDialog
        isOpen={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        selectedDate={selectedDate}
      />

      {/* Vehicle Assignment Dialog */}
      {vehicleDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setVehicleDialog(null); setVehicleSearch(''); }}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80 space-y-3" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900">Fahrzeug zuweisen</h3>
            <input
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Kennzeichen suchen..."
              value={vehicleSearch}
              onChange={e => setVehicleSearch(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {vehicles
                .filter(v => v.is_active && !v.is_ef && !isVehicleUnavailable(v))
                .filter(v => v.license_plate?.toLowerCase().includes(vehicleSearch.toLowerCase()))
                .map(v => {
                  const isUsed = assignments.some(a => a.vehicle_id === v.id && a.assignment_type === 'baustelle');
                  return (
                    <button
                      key={v.id}
                      onClick={() => handleVehicleAssign(v.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 hover:text-blue-700 text-sm transition-colors border border-transparent hover:border-blue-200 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <Car className="w-3 h-3" />
                        {v.license_plate}
                        {v.vehicle_number && <span className="text-gray-400 text-xs">({v.vehicle_number})</span>}
                      </span>
                      {isUsed && <span className="text-xs text-amber-500">belegt</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 10mm 10mm; }
          body { font-size: 13px; margin: 0; }
          .shadow-sm { box-shadow: none !important; }
          table { font-size: 11px; width: 100%; }
          th, td { padding: 6px !important; }
          .print-only { display: block !important; }
          main { padding: 0 !important; }
          
          ${printMode === 'compact' ? `
            .print-absence-section { display: none !important; }
            .print-vehicles-section { display: none !important; }
          ` : ''}
        }
        .print-only { display: none; }
      `}</style>
      </div>
    </DragDropContext>
  );
}