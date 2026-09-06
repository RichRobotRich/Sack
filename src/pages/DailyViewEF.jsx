import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, getDay, startOfWeek } from 'date-fns';
import { isPublicHoliday, getPublicHolidayName } from '@/utils/publicHolidays';
import { de } from 'date-fns/locale';
import {
  ClipboardList,
  Clock,
  MapPin,
  Users,
  Car,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Moon,
  GripVertical,
  FileText,
  Copy
} from 'lucide-react';
import { generateDailyViewEFPDF } from '@/components/DailyViewEFPDF';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

export default function DailyViewEF() {
  const [assignments, setAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [printMode, setPrintMode] = useState('full');

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [assignmentsData, employeesData, allEmployeesData, projectsData, vehiclesData] = await Promise.all([
        api.entities.Assignment.filter({ date: format(selectedDate, 'yyyy-MM-dd') }),
        api.entities.Employee.filter({ is_ef: true }),
        api.entities.Employee.list(),
        api.entities.Project.filter({ is_ef_project: true }),
        api.entities.Vehicle.filter({ is_ef: true })
      ]);
      
      // Assignments von EF-Projekten und Abwesenheiten von EF-Mitarbeitern
      const efEmployeeIds = new Set(employeesData.map(e => e.id));
      const efAssignments = assignmentsData.filter(a => {
        // Abwesenheiten von EF-Mitarbeitern immer einbeziehen
        if (a.assignment_type !== 'baustelle') {
          return efEmployeeIds.has(a.employee_id);
        }
        // Nur Baustellen-Assignments von EF-Projekten
        if (!a.project_id || a.project_id === 'workshop') return false;
        return projectsData.some(p => p.id === a.project_id);
      });
      
      setAssignments(efAssignments);
      setEmployees(employeesData);
      setAllEmployees(allEmployeesData);
      setProjects(projectsData);
      setVehicles(vehiclesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getProject = (id) => projects.find(p => p.id === id);
  const getVehicle = (id) => vehicles.find(v => v.id === id);

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

  const isEmployeeOvernight = (employee, date) => {
    if (!employee) return false;
    const dateStr = format(date, 'yyyy-MM-dd');
    if (employee.friday_exceptions?.includes(dateStr)) return false;
    if (employee.overnight_stay) return true;
    if (employee.overnight_stay_weeks?.length > 0) {
      const weekMon = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
      return employee.overnight_stay_weeks.includes(weekMon);
    }
    return false;
  };

  // Group assignments by project
  const groupedByProject = assignments
    .filter(a => a.assignment_type === 'baustelle' && a.project_id)
    .reduce((acc, assignment) => {
      const projectId = assignment.project_id;
      if (!acc[projectId]) {
        const proj = getProject(projectId);
        acc[projectId] = {
          project: proj,
          assignments: [],
          vehicles: new Set(),
          departureTime: proj?.default_departure_time || null,
          workStartTime: proj?.default_work_start_time || null,
          workEndTime: proj?.default_work_end_time || null
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

  const getProjectLeaderAbbreviation = (projectId) => {
    const project = getProject(projectId);
    if (!project) return '';
    const projectLeader = allEmployees.find(e => e.id === project.project_leader_id);
    return projectLeader?.abbreviation || projectLeader?.full_name?.charAt(0) || '';
  };

  // Projects with overnight staff
  const projectsWithOvernight = Object.values(groupedByProject).filter(group =>
    group.project && group.assignments.some(a => {
      const emp = getEmployee(a.employee_id);
      return isEmployeeOvernight(emp, selectedDate);
    })
  ).sort((a, b) => {
    const aAbbr = getProjectLeaderAbbreviation(a.project?.id);
    const bAbbr = getProjectLeaderAbbreviation(b.project?.id);
    return aAbbr.localeCompare(bAbbr);
  });

  // Projects without overnight staff
  const projectsWithoutOvernight = Object.values(groupedByProject).filter(group =>
    group.project && group.assignments.some(a => {
      const emp = getEmployee(a.employee_id);
      return !isEmployeeOvernight(emp, selectedDate);
    })
  ).sort((a, b) => {
    const aAbbr = getProjectLeaderAbbreviation(a.project?.id);
    const bAbbr = getProjectLeaderAbbreviation(b.project?.id);
    return aAbbr.localeCompare(bAbbr);
  });

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const isVehicleUnavailable = (vehicle) => {
    if (!vehicle) return false;
    return vehicle.next_tuev_date === selectedDateStr || vehicle.next_inspection_date === selectedDateStr;
  };

  // Get used and available vehicles (only EF vehicles, exclude vehicles with appointments today)
  const usedVehicleIds = new Set(
    assignments
      .filter(a => a.vehicle_id && a.assignment_type === 'baustelle')
      .map(a => a.vehicle_id)
  );
  const availableVehicles = vehicles.filter(v => v.is_active && !usedVehicleIds.has(v.id) && !isVehicleUnavailable(v));

  // Get absence assignments by type
  const absenceTypes = [
    { key: 'beurlaubung', label: 'Beurlaubung' },
    { key: 'urlaub', label: 'Urlaub' },
    { key: 'schule', label: 'Berufsschule' },
    { key: 'pruefung', label: 'Prüfung' },
    { key: 'tbz', label: 'TBZ' },
    { key: 'krank', label: 'Krank' }
  ];

  const officeTypes = ['projektleiter', 'buerokraft', 'lagerist'];

  const getAbsenceAssignments = (type) => {
    return assignments.filter(a => {
      if (a.assignment_type !== type) return false;
      const emp = getEmployee(a.employee_id);
      if (!emp) return false;
      return !officeTypes.includes(emp.employee_type);
    });
  };

  const copyVehiclesFromPreviousDay = async () => {
    try {
      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      const prevDateStr = format(previousDate, 'yyyy-MM-dd');

      const prevAssignments = await api.entities.Assignment.filter({ date: prevDateStr });

      // Für jede heutige Baustellen-Assignment: Fahrzeug vom Vortag für dasselbe Projekt übernehmen
      const updates = [];
      for (const todayAssignment of assignments.filter(a => a.assignment_type === 'baustelle' && a.project_id)) {
        if (todayAssignment.vehicle_id) continue; // bereits ein Fahrzeug zugewiesen
        // Finde ein Vortags-Assignment mit demselben Projekt und einem Fahrzeug
        const prevWithVehicle = prevAssignments.find(
          a => a.project_id === todayAssignment.project_id && a.vehicle_id
        );
        if (prevWithVehicle) {
          updates.push(api.entities.Assignment.update(todayAssignment.id, { vehicle_id: prevWithVehicle.vehicle_id }));
        }
      }

      if (updates.length === 0) {
        toast.info('Keine Fahrzeugzuweisungen vom Vortag gefunden');
        return;
      }

      await Promise.all(updates);
      toast.success(`${updates.length} Fahrzeugzuweisung(en) vom Vortag übernommen`);
      loadData();
    } catch (error) {
      console.error('Error copying vehicles:', error);
      toast.error('Fehler beim Übernehmen der Fahrzeuge');
    }
  };

  const getAbsenceEndDate = (employeeId, absenceType) => {
    const dateSet = new Set(
      assignments
        .filter(a => a.employee_id === employeeId && a.assignment_type === absenceType)
        .map(a => a.date)
    );
    const fromDateStr = format(selectedDate, 'yyyy-MM-dd');
    let last = fromDateStr;
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

  const changeDate = (days) => {
    let newDate = new Date(selectedDate);
    const direction = days > 0 ? 1 : -1;
    newDate.setDate(newDate.getDate() + days);
    let safety = 0;
    while (safety < 20) {
      const dow = getDay(newDate);
      const isWeekend = dow === 0 || dow === 6;
      if (!isWeekend && !isPublicHoliday(newDate, 'TH')) break;
      newDate.setDate(newDate.getDate() + direction);
      safety++;
    }
    setSelectedDate(newDate);
  };

  const buildPdfParams = (withAbsences) => ({
    selectedDate,
    projectsWithOvernight,
    projectsWithoutOvernight,
    absenceRows: withAbsences ? absenceTypes.map(({ key, label }) => ({
      key,
      label,
      assignments: getAbsenceAssignments(key),
    })) : [],
    allEmployees,
    employees,
    getEmployee,
    getVehicle,
    isFriday: dayOfWeek === 5,
    getAbsenceEndDate,
  });

  const generatePDF = () => {
    try {
      generateDailyViewEFPDF(buildPdfParams(true));
      toast.success('PDF erfolgreich heruntergeladen');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Fehler beim Erstellen der PDF');
    }
  };

  const generatePDF2 = () => {
    try {
      generateDailyViewEFPDF(buildPdfParams(false));
      toast.success('PDF ohne Abwesenheiten heruntergeladen');
    } catch (error) {
      console.error('Error generating PDF 2:', error);
      toast.error('Fehler beim Erstellen der PDF 2');
    }
  };

  const [vehicleDialog, setVehicleDialog] = useState(null);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [editVehicle, setEditVehicle] = useState(null);

  const handleVehicleAssign = (vehicleId) => {
    if (!vehicleDialog) return;
    const { projectId, isOvernight } = vehicleDialog;

    let projectAssignments = assignments.filter(a => a.project_id === projectId && a.assignment_type === 'baustelle');
    projectAssignments = isOvernight
      ? projectAssignments.filter(a => isEmployeeOvernight(getEmployee(a.employee_id), selectedDate))
      : projectAssignments.filter(a => !isEmployeeOvernight(getEmployee(a.employee_id), selectedDate));
    const target = projectAssignments.find(a => !a.vehicle_id) || projectAssignments[0];
    const prevOwners = assignments.filter(a => a.vehicle_id === vehicleId).map(a => a.id);

    setAssignments(prev => prev.map(a => {
      if (prevOwners.includes(a.id)) return { ...a, vehicle_id: null };
      if (target && a.id === target.id) return { ...a, vehicle_id: vehicleId };
      return a;
    }));
    setVehicleDialog(null);
    setVehicleSearch('');
    toast.success('Fahrzeug zugewiesen');

    (async () => {
      try {
        if (prevOwners.length > 0) await Promise.all(prevOwners.map(id => api.entities.Assignment.update(id, { vehicle_id: null })));
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
  const holidayName = getPublicHolidayName(selectedDate, 'TH');

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
            <ClipboardList className="w-8 h-8 dark:text-blue-300" />
            Aushang EF
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
            onClick={() => setSelectedDate(new Date())}
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
          <Button variant="outline" size="sm" onClick={generatePDF} className="hidden lg:flex">
            <FileText className="w-4 h-4 mr-2" />
            PDF Download
          </Button>
          <Button variant="outline" size="icon" onClick={generatePDF} className="lg:hidden">
            <FileText className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={generatePDF2} className="hidden lg:flex">
            <FileText className="w-4 h-4 mr-2" />
            PDF 2 Download
          </Button>
          <Button variant="outline" size="icon" onClick={generatePDF2} className="lg:hidden" title="PDF 2 (ohne Abwesenheiten)">
            <FileText className="w-4 h-4" />
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
        <h1 className="text-xl font-bold">Tageseinteilung EF</h1>
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
              🎉 {holidayName} – gesetzlicher Feiertag (Thüringen)
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

                  const projectLeader = project.project_leader_id ? allEmployees.find(e => e.id === project.project_leader_id) : null;
                  const allowedTypes = ['monteur', 'azubi', 'praktikant'];
                  const overnightAssignments = isFriday ? [] : group.assignments.filter(a => {
                    const emp = getEmployee(a.employee_id);
                    return isEmployeeOvernight(emp, selectedDate) && allowedTypes.includes(emp?.employee_type);
                  });

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
                        {(project.accommodation_name || project.accommodation_address) && (
                          <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                            <strong>Unterkunft:</strong> {project.accommodation_name}
                            {project.accommodation_name && project.accommodation_address && ' - '}
                            {project.accommodation_address}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {overnightAssignments.map((assignment) => {
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

                  const projectLeader = project.project_leader_id ? allEmployees.find(e => e.id === project.project_leader_id) : null;
                  const allowedTypes = ['monteur', 'azubi', 'praktikant'];
                  const nonOvernightAssignments = group.assignments.filter(a => {
                    const emp = getEmployee(a.employee_id);
                    return !isEmployeeOvernight(emp, selectedDate) && allowedTypes.includes(emp?.employee_type);
                  });

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
                        {(project.accommodation_name || project.accommodation_address) && (
                          <div className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                            <strong>Unterkunft:</strong> {project.accommodation_name}
                            {project.accommodation_name && project.accommodation_address && ' - '}
                            {project.accommodation_address}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {nonOvernightAssignments.map((assignment) => {
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

            {projectsWithOvernight.length === 0 && projectsWithoutOvernight.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Keine EF-Einsätze für diesen Tag geplant
                </TableCell>
              </TableRow>
            )}
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
                        return (
                          <Badge
                            key={a.id}
                            variant="outline"
                            className="bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                          >
                            {getDisplayName(emp)}
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
                Verfügbare EF-Fahrzeuge
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
                        <span className="text-gray-400 dark:text-gray-500 text-sm">Alle EF-Fahrzeuge sind zugewiesen</span>
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
                .filter(v => v.is_active && v.is_ef && !isVehicleUnavailable(v))
                .filter(v => v.license_plate?.toLowerCase().includes(vehicleSearch.toLowerCase()))
                .map(v => {
                  const isUsed = assignments.some(a => a.vehicle_id === v.id && a.assignment_type === 'baustelle');
                  return (
                    <button key={v.id} onClick={() => handleVehicleAssign(v.id)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 hover:text-blue-700 text-sm transition-colors border border-transparent hover:border-blue-200 flex items-center justify-between">
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