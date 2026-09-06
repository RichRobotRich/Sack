import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Calendar, Thermometer, Plane } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

export default function DailyAbsences() {
  const [sickToday, setSickToday] = useState([]);
  const [vacationToday, setVacationToday] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    loadAbsences();
  }, []);

  const loadAbsences = async () => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');

      // Fetch leave requests (approved) AND today's assignments AND employees in parallel
      const [allRequests, todayAssignments, allEmployees] = await Promise.all([
        api.entities.LeaveRequest.filter({ status: 'genehmigt' }, '-created_date'),
        api.entities.Assignment.filter({ date: today }),
        api.entities.Employee.list(),
      ]);

      setEmployees(allEmployees);
      setUsers([]);

      // Helper: get employee name by id
      const getNameById = (id) => allEmployees.find(e => e.id === id)?.full_name || id;

      // LeaveRequest-based absences for today
      const todaysSickFromRequests = allRequests.filter(r =>
        r.request_type === 'krankmeldung' && today >= r.start_date && today <= r.end_date
      );
      const todaysVacationFromRequests = allRequests.filter(r =>
        r.request_type === 'urlaub' && today >= r.start_date && today <= r.end_date
      );

      // Assignment-based absences (from Jahresübersicht / Wochenplanung)
      // only add if not already covered by a LeaveRequest for this employee
      const sickEmployeeIds = new Set(todaysSickFromRequests.map(r => r.employee_id));
      const vacationEmployeeIds = new Set(todaysVacationFromRequests.map(r => r.employee_id));

      // Fetch ALL assignments of type krank/urlaub starting from today to find end dates
      const futureAbsenceAssignments = await api.entities.Assignment.filter({});
      const allAbsenceAssignments = futureAbsenceAssignments.filter(
        a => (a.assignment_type === 'krank' || a.assignment_type === 'urlaub') && a.date >= today
      );

      // Find the last consecutive day an employee is absent
      const findEndDate = (employeeId, type, startDate) => {
        const days = allAbsenceAssignments
          .filter(a => a.employee_id === employeeId && a.assignment_type === type)
          .map(a => a.date)
          .sort();
        
        let end = startDate;
        for (const day of days) {
          if (day <= end) continue;
          // Check if this day is consecutive (next weekday, allow gaps for weekends)
          const prev = new Date(end);
          const curr = new Date(day);
          const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);
          if (diffDays <= 3) { // allow weekend gaps (Sa+So = max 3 days gap)
            end = day;
          } else {
            break;
          }
        }
        return end;
      };

      const assignmentSick = todayAssignments
        .filter(a => a.assignment_type === 'krank' && a.employee_id && !sickEmployeeIds.has(a.employee_id))
        .map(a => ({
          id: a.id,
          employee_id: a.employee_id,
          employee_name: getNameById(a.employee_id),
          start_date: today,
          end_date: findEndDate(a.employee_id, 'krank', today),
          request_type: 'krankmeldung',
          _from_assignment: true,
        }));

      const assignmentVacation = todayAssignments
        .filter(a => a.assignment_type === 'urlaub' && a.employee_id && !vacationEmployeeIds.has(a.employee_id))
        .map(a => ({
          id: a.id,
          employee_id: a.employee_id,
          employee_name: getNameById(a.employee_id),
          start_date: today,
          end_date: findEndDate(a.employee_id, 'urlaub', today),
          request_type: 'urlaub',
          _from_assignment: true,
        }));

      setSickToday([...todaysSickFromRequests, ...assignmentSick]);
      setVacationToday([...todaysVacationFromRequests, ...assignmentVacation]);
    } catch (error) {
      console.error('Error loading absences:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeName = (request) => {
    // Use stored employee_name if available (verknüpfter Mitarbeiter)
    if (request.employee_name) {
      return request.employee_name;
    }
    // Fallback to employee_id
    return request.employee_id || 'Unbekannt';
  };

  const formatEndDate = (end) => {
    if (!end) return null;
    return `bis ${format(new Date(end), 'd. MMMM yyyy', { locale: de })}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Calendar className="w-8 h-8 text-[#1e3a5f]" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tagesübersicht Abwesenheiten</h1>
            <p className="text-gray-500">Heute, {format(new Date(), 'd. MMMM yyyy', { locale: de })}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-gray-200 rounded w-32"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-16 bg-gray-100 rounded"></div>
                <div className="h-16 bg-gray-100 rounded"></div>
              </div>
            </CardContent>
          </Card>
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-6 bg-gray-200 rounded w-32"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-16 bg-gray-100 rounded"></div>
                <div className="h-16 bg-gray-100 rounded"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Calendar className="w-8 h-8 text-[#1e3a5f]" />
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tagesübersicht Abwesenheiten</h1>
          <p className="text-gray-500">Heute, {format(new Date(), 'd. MMMM yyyy', { locale: de })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Krankmeldungen */}
        <Card>
          <CardHeader className="bg-red-50 border-b border-red-100">
            <CardTitle className="flex items-center gap-2 text-red-700">
              <Thermometer className="w-5 h-5" />
              Krankmeldungen
              <span className="ml-auto text-sm font-normal">
                {sickToday.length} {sickToday.length === 1 ? 'Person' : 'Personen'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {sickToday.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Keine Krankmeldungen heute
              </div>
            ) : (
              <div className="space-y-3">
                {sickToday.map((request) => (
                   <div
                    key={request.id}
                    className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                   >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {getEmployeeName(request)}
                        </p>
                        {formatEndDate(request.end_date) && (
                          <p className="text-sm text-gray-500 mt-1">
                            {formatEndDate(request.end_date)}
                          </p>
                        )}
                        </div>
                        <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                        Krank
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Urlaubsanträge */}
        <Card>
          <CardHeader className="bg-blue-50 border-b border-blue-100">
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Plane className="w-5 h-5" />
              Im Urlaub
              <span className="ml-auto text-sm font-normal">
                {vacationToday.length} {vacationToday.length === 1 ? 'Person' : 'Personen'}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {vacationToday.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Niemand im Urlaub heute
              </div>
            ) : (
              <div className="space-y-3">
                {vacationToday.map((request) => (
                   <div
                    key={request.id}
                    className="p-4 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                   >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">
                          {getEmployeeName(request)}
                        </p>
                        {formatEndDate(request.end_date) && (
                          <p className="text-sm text-gray-500 mt-1">
                            {formatEndDate(request.end_date)}
                          </p>
                        )}
                        </div>
                        <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        Urlaub
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}