import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { format, addDays, isMonday, isTuesday, isWednesday, isThursday, isFriday } from 'date-fns';
import { isPublicHoliday } from '@/utils/publicHolidays';
import { de } from 'date-fns/locale';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  Car,
  RefreshCw,

} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PullToRefresh from '@/components/PullToRefresh';

export default function CurrentPlan() {
  const [assignments, setAssignments] = useState([]);
  const [futureAssignments, setFutureAssignments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [displayDate, setDisplayDate] = useState(new Date());
  const [currentUser, setCurrentUser] = useState(null);

  // Gibt den nächsten Arbeitstag ab einem Datum zurück (Wochenende, Feiertage, Brückentage überspringen)
  const skipToWorkday = (date, bridgeDaySet = new Set()) => {
    let d = new Date(date);
    let safety = 0;
    while (safety < 20) {
      const dow = d.getDay();
      const isWeekend = dow === 0 || dow === 6;
      const isHoliday = isPublicHoliday(d, 'NRW');
      const isBridge = bridgeDaySet.has(format(d, 'yyyy-MM-dd'));
      if (!isWeekend && !isHoliday && !isBridge) return d;
      d = addDays(d, 1);
      safety++;
    }
    return d;
  };

  // Berechne das angezeigte Datum basierend auf der aktuellen Uhrzeit
  const getDisplayDate = (bridgeDaySet = new Set()) => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes; // In Minuten seit Mitternacht
    const cutoffTime = 15 * 60 + 30; // 15:30 in Minuten

    let candidate;
    
    // Samstag (6) oder Sonntag (0) → immer Montag anzeigen
    if (dayOfWeek === 6 || dayOfWeek === 0) {
      const mondayDate = dayOfWeek === 6 ? addDays(now, 2) : addDays(now, 1);
      candidate = mondayDate;
    } else if (dayOfWeek === 5 && currentTime >= cutoffTime) {
      // Freitag (5) ab 15:30 → Montag anzeigen
      candidate = addDays(now, 3);
    } else if (currentTime >= cutoffTime) {
      // Montag-Donnerstag nach 15:30 → nächster Arbeitstag
      candidate = addDays(now, 1);
    } else {
      // Vor 15:30 → heute
      candidate = now;
    }

    return skipToWorkday(candidate, bridgeDaySet);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
   setLoading(true);
   try {
     // Zuerst Brückentage laden, damit getDisplayDate sie berücksichtigen kann
     let bridgeDaySet = new Set();
     try {
       const bds = await base44.entities.BridgeDay.list();
       bridgeDaySet = new Set(bds.map(d => d.date));
     } catch {}

     const dateToLoad = getDisplayDate(bridgeDaySet);
     const [user, assignmentsData, employeesData, projectsData, vehiclesData] = await Promise.all([
       base44.auth.me(),
       base44.entities.Assignment.filter({ date: format(dateToLoad, 'yyyy-MM-dd') }),
       base44.entities.Employee.list(),
       base44.entities.Project.list(),
       base44.entities.Vehicle.list()
     ]);

     setCurrentUser(user);

     // Future assignments für Abwesenheits-Enddatum laden
     const futureDates = [];
     for (let i = 1; i <= 30; i++) {
       const fd = new Date(dateToLoad);
       fd.setDate(fd.getDate() + i);
       if (fd.getDay() !== 0 && fd.getDay() !== 6) {
         futureDates.push(format(fd, 'yyyy-MM-dd'));
       }
     }
     const futureResults = await Promise.all(
       futureDates.map(date => base44.entities.Assignment.filter({ date }))
     );
     setFutureAssignments(futureResults.flat());

     // Filter assignments based on user location and project type
     let filteredAssignments = assignmentsData;
     let filteredEmployees = employeesData;

     if (user.location === 'PB') {
       // PB: Nur Assignments von Projekten, die NICHT EF sind
       filteredAssignments = assignmentsData.filter(a => {
         if (a.assignment_type !== 'baustelle' || !a.project_id) return true; // Abwesenheiten etc. immer anzeigen
         const project = projectsData.find(p => p.id === a.project_id);
         return project && !project.is_ef_project;
       });
       filteredEmployees = employeesData.filter(e => !e.is_ef);
     } else if (user.location === 'EF') {
       // EF: Nur Assignments von EF-Projekten
       filteredAssignments = assignmentsData.filter(a => {
         if (a.assignment_type !== 'baustelle' || !a.project_id) return true;
         const project = projectsData.find(p => p.id === a.project_id);
         return project && project.is_ef_project;
       });
       filteredEmployees = employeesData.filter(e => e.is_ef);
     }
     // Wenn kein Standort gesetzt ist, alle Assignments und Mitarbeiter anzeigen

     setAssignments(filteredAssignments);
     setEmployees(filteredEmployees);
     setProjects(projectsData); // Alle Projekte laden, damit getProject() funktioniert
     setVehicles(vehiclesData);
     setDisplayDate(dateToLoad);
   } catch (error) {
     console.error('Error loading data:', error);
     } finally {
     setLoading(false);
     }
     };

  const getEmployee = (id) => employees.find(e => e.id === id);
  const getProject = (id) => projects.find(p => p.id === id);
  const getVehicle = (id) => vehicles.find(v => v.id === id);

  const isFridayDisplay = displayDate.getDay() === 5;

  // Berechne Montag der Woche für das angezeigte Datum
  const getMondayOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return format(d, 'yyyy-MM-dd');
  };

  const hasOvernightStay = (employee) => {
    if (!employee) return false;
    // Neue Logik: overnight_stay_weeks (Liste von Montags-Daten)
    if (employee.overnight_stay_weeks && employee.overnight_stay_weeks.length > 0) {
      const mondayOfDisplayWeek = getMondayOfWeek(displayDate);
      return employee.overnight_stay_weeks.includes(mondayOfDisplayWeek);
    }
    // Legacy: overnight_stay (boolean)
    return !!employee.overnight_stay;
  };

  // Group assignments by project
  const groupedAssignments = assignments
    .filter(a => {
      if (a.assignment_type !== 'baustelle' || !a.project_id) return false;
      // Freitags: Mitarbeiter mit Übernachtung nicht anzeigen
      if (isFridayDisplay) {
        const employee = getEmployee(a.employee_id);
        if (hasOvernightStay(employee)) return false;
      }
      return true;
    })
    .reduce((acc, assignment) => {
      const projectId = assignment.project_id;
      if (!acc[projectId]) {
        const project = getProject(projectId);
        acc[projectId] = {
          project: project,
          assignments: [],
          vehicles: new Set(),
          departureTime: project?.default_departure_time || null,
          supervisor: null
        };
      }
      acc[projectId].assignments.push(assignment);
      if (assignment.vehicle_id) {
        acc[projectId].vehicles.add(assignment.vehicle_id);
      }
      if (assignment.departure_time && !acc[projectId].departureTime) {
        acc[projectId].departureTime = assignment.departure_time;
      }
      if (assignment.is_supervisor) {
        const emp = getEmployee(assignment.employee_id);
        if (emp) acc[projectId].supervisor = emp;
      }
      return acc;
    }, {});

  // Sortiere Baustellen: Die Baustelle des zugewiesenen Mitarbeiters zuerst
  const noLocationSet = !currentUser?.location || currentUser?.location === 'admin';
  const sortedProjects = Object.values(groupedAssignments).sort((a, b) => {
    // Prüfe, ob der aktuelle Benutzer einen zugewiesenen Mitarbeiter hat
    if (currentUser?.linked_employee_id) {
      const userOnProjectA = a.assignments.some(assignment => 
        assignment.employee_id === currentUser.linked_employee_id
      );
      const userOnProjectB = b.assignments.some(assignment => 
        assignment.employee_id === currentUser.linked_employee_id
      );
      
      // Baustelle des Benutzers kommt zuerst
      if (userOnProjectA && !userOnProjectB) return -1;
      if (!userOnProjectA && userOnProjectB) return 1;
    }

    // Wenn kein Standort oder Admin: erst PB, dann EF
    if (noLocationSet) {
      const aIsEF = a.project?.is_ef_project ? 1 : 0;
      const bIsEF = b.project?.is_ef_project ? 1 : 0;
      if (aIsEF !== bIsEF) return aIsEF - bIsEF;
    }
    
    // Ansonsten alphabetisch nach Baustellenname
    return (a.project?.name || '').localeCompare(b.project?.name || '');
  });

  // Get absence assignments - only for monteur, azubi, praktikant
  const absenceRelevantTypes = ['monteur', 'azubi', 'praktikant'];
  const absenceAssignments = assignments.filter(a => {
    if (a.assignment_type === 'baustelle') return false;
    const emp = employees.find(e => e.id === a.employee_id);
    return emp && absenceRelevantTypes.includes(emp.employee_type);
  });
  const absencesByType = absenceAssignments.reduce((acc, a) => {
    if (!acc[a.assignment_type]) acc[a.assignment_type] = [];
    acc[a.assignment_type].push(a);
    return acc;
  }, {});

  const absenceLabels = {
    urlaub: 'Urlaub',
    krank: 'Krank',
    schule: 'Berufsschule',
    pruefung: 'Prüfung',
    tbz: 'TBZ',
    beurlaubung: 'Beurlaubung'
  };

  const SHOW_END_DATE_TYPES = ['urlaub', 'krank', 'beurlaubung'];

  // Berechnet das letzte zusammenhängende Datum einer Abwesenheit ab displayDate
  const getAbsenceEndDate = (employeeId, absenceType) => {
    const dateStr = format(displayDate, 'yyyy-MM-dd');
    // Alle bekannten Daten (heute + zukünftige) dieses Typs für diesen Mitarbeiter
    const allDates = [...assignments, ...futureAssignments]
      .filter(a => a.employee_id === employeeId && a.assignment_type === absenceType)
      .map(a => a.date);
    // Finde das Ende der zusammenhängenden Kette ab heute
    let lastConsecutive = null;
    let d = new Date(dateStr);
    for (let i = 0; i <= 60; i++) {
      const cur = new Date(d);
      cur.setDate(cur.getDate() + i);
      if (cur.getDay() === 0 || cur.getDay() === 6) continue;
      const dStr = format(cur, 'yyyy-MM-dd');
      if (allDates.includes(dStr)) {
        lastConsecutive = dStr;
      } else {
        break;
      }
    }
    return lastConsecutive && lastConsecutive !== dateStr ? lastConsecutive : null;
  };



  if (loading) {
    return (
       <div className="space-y-6 no-print">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
            <Calendar className="w-8 h-8 dark:text-blue-300" />
            Aktueller Plan
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {format(displayDate, "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
        </div>
        <div className="flex gap-2 no-print">
           <Button variant="outline" size="sm" onClick={loadData}>
             <RefreshCw className="w-4 h-4 mr-2" />
             Aktualisieren
           </Button>
         </div>
      </div>

      {/* Project Assignments */}
      {Object.keys(groupedAssignments).length === 0 ? (
        <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">Keine Einsätze für heute geplant</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedProjects.map((group, index) => {
            const project = group.project;
            if (!project) return null;
            
            const projectLeader = employees.find(e => e.id === project.project_leader_id);

            // Abschnittsüberschriften bei kein Standort / admin
            const isEF = !!project.is_ef_project;
            const prevIsEF = index > 0 ? !!sortedProjects[index - 1].project?.is_ef_project : null;
            const showPBHeader = noLocationSet && !isEF && (index === 0 || prevIsEF === true);
            const showEFHeader = noLocationSet && isEF && (index === 0 || prevIsEF === false);
            
            return (
              <React.Fragment key={project.id}>
              {showPBHeader && (
                <div className="flex items-center gap-3 mt-2 mb-1">
                  <div className="h-1 w-8 rounded-full bg-[#1e3a5f] dark:bg-blue-400" />
                  <h2 className="text-xl font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide">Paderborn</h2>
                  <div className="flex-1 h-px bg-[#1e3a5f]/20 dark:bg-blue-400/30" />
                </div>
              )}
              {showEFHeader && (
                <div className="flex items-center gap-3 mt-6 mb-1">
                  <div className="h-1 w-8 rounded-full bg-[#1e3a5f] dark:bg-blue-400" />
                  <h2 className="text-xl font-bold text-[#1e3a5f] dark:text-blue-300 uppercase tracking-wide">Erfurt</h2>
                  <div className="flex-1 h-px bg-[#1e3a5f]/20 dark:bg-blue-400/30" />
                </div>
              )}
              <Card className="border-0 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
                <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d4a6f] dark:from-blue-900 dark:to-blue-800 p-4 lg:p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                    <div className="flex items-center gap-4">
                      {projectLeader && (
                        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-white font-bold text-lg">
                          {projectLeader.abbreviation || projectLeader.full_name?.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h3 className="text-lg lg:text-xl font-bold text-white">
                          {project.name}
                        </h3>
                        <p className="text-white/70 text-sm flex items-center gap-1">
                          <MapPin className="w-4 h-4" />
                          {project.address || project.city || 'Keine Adresse'}
                        </p>
                      </div>
                    </div>
                    {group.departureTime && (
                      <Badge className="bg-white/20 text-white border-0 text-base px-4 py-1 w-fit">
                        <Clock className="w-4 h-4 mr-2" />
                        Abfahrt: {group.departureTime}
                      </Badge>
                    )}
                  </div>
                </div>
                
                <CardContent className="p-4 lg:p-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Employees */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Monteure ({group.assignments.length})
                      </h4>
                      <div className="space-y-2">
                        {group.assignments.map(assignment => {
                          const employee = getEmployee(assignment.employee_id);
                          if (!employee) return null;
                          
                          let displayName = employee.employee_type === 'azubi' 
                            ? `${employee.full_name?.split(' ').pop()} ${employee.apprentice_year || ''}`
                            : employee.full_name;
                          
                          if (employee.remark) {
                            displayName = `${displayName} (${employee.remark})`;
                          }
                          
                          const overnight = hasOvernightStay(employee);
                          return (
                           <div 
                             key={assignment.id}
                             className={`flex items-center justify-between p-3 rounded-xl ${
                               overnight
                                 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
                                 : 'bg-gray-50 dark:bg-gray-700'
                             }`}
                           >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                                  overnight
                                    ? 'bg-red-500 text-white' 
                                    : 'bg-[#1e3a5f]/10 dark:bg-blue-600/30 text-[#1e3a5f] dark:text-blue-300'
                                }`}>
                                  {employee.full_name?.charAt(0)}
                                </div>
                                {employee.phone ? (
                                  <a 
                                    href={`tel:${employee.phone}`}
                                    className={`font-medium hover:underline ${
                                      overnight ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'
                                    }`}
                                  >
                                    {displayName}
                                  </a>
                                ) : (
                                  <span className={`font-medium ${
                                    overnight ? 'text-red-700 dark:text-red-400' : 'text-gray-900 dark:text-white'
                                  }`}>
                                    {displayName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {assignment.is_supervisor && (
                                  <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                                    Bauleitung
                                  </Badge>
                                )}
                                {employee.employee_type === 'azubi' && (
                                  <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                                    Azubi
                                  </Badge>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Vehicles */}
                    <div>
                      <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Car className="w-4 h-4" />
                        Fahrzeuge ({group.vehicles.size})
                      </h4>
                      <div className="space-y-2">
                        {Array.from(group.vehicles).map(vehicleId => {
                          const vehicle = getVehicle(vehicleId);
                          if (!vehicle) return null;
                          return (
                            <div key={vehicleId} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl">
                              <div className="w-8 h-8 bg-[#1e3a5f]/10 dark:bg-blue-600/30 rounded-full flex items-center justify-center">
                                <Car className="w-4 h-4 text-[#1e3a5f] dark:text-blue-300" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-white">
                                  {vehicle.license_plate}
                                </p>
                                {vehicle.vehicle_number && (
                                  <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Nr. {vehicle.vehicle_number}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {group.vehicles.size === 0 && (
                          <p className="text-gray-400 dark:text-gray-500 text-sm">Kein Fahrzeug zugewiesen</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Absences */}
      {Object.keys(absencesByType).length > 0 && noLocationSet && (
        <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <CardHeader>
            <CardTitle className="text-lg dark:text-white">Abwesenheiten</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {Object.entries(absencesByType).map(([type, absences]) => (
                <div key={type} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
                  <h4 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
                    {absenceLabels[type] || type}
                  </h4>
                  <div className="space-y-1">
                    {absences.map(a => {
                      const employee = getEmployee(a.employee_id);
                      let displayName = employee?.full_name || 'Unbekannt';
                      if (employee?.remark) {
                        displayName = `${displayName} (${employee.remark})`;
                      }
                      if (SHOW_END_DATE_TYPES.includes(type)) {
                        const endDate = getAbsenceEndDate(a.employee_id, type);
                        if (endDate) {
                          const ed = new Date(endDate);
                          displayName = `${displayName} (${ed.getDate()}.${ed.getMonth() + 1}.)`;
                        }
                      }
                      return (
                        <p key={a.id} className="text-sm text-gray-800 dark:text-gray-300">
                          {displayName}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1cm; }
          body { font-size: 12px; }
          .shadow-sm { box-shadow: none !important; }
        }
      `}</style>
    </div>
    </PullToRefresh>
  );
}