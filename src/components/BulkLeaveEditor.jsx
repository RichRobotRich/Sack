import React, { useState } from 'react';
import { api } from '@/api/client';
import { format, eachDayOfInterval, parseISO, isWeekend } from 'date-fns';
import { isPublicHoliday } from '../utils/publicHolidays';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const TYPE_OPTIONS = [
  { value: 'urlaub', label: 'Urlaub', color: 'bg-amber-400' },
  { value: 'krank', label: 'Krank', color: 'bg-red-500' },
  { value: 'beurlaubung', label: 'Beurlaubt', color: 'bg-purple-500' },
  { value: 'schule', label: 'Schule', color: 'bg-green-500' },
  { value: 'tbz', label: 'TBZ', color: 'bg-cyan-500' },
  { value: 'pruefung', label: 'Prüfung', color: 'bg-orange-500' },
  { value: 'loeschen', label: 'Löschen', color: 'bg-gray-400' },
];

export default function BulkLeaveEditor({ employees, year, onSaved, currentUser, onAssignmentsChange }) {
   const [isOpen, setIsOpen] = useState(false);
   const [searchTerm, setSearchTerm] = useState('');
   const [selectedEmployee, setSelectedEmployee] = useState(null);
   const [startDate, setStartDate] = useState('');
   const [endDate, setEndDate] = useState('');
   const [selectedType, setSelectedType] = useState('urlaub');
   const [saving, setSaving] = useState(false);

  const filteredEmployees = employees.filter(emp =>
    emp.full_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSave = async () => {
    if (!selectedEmployee || !startDate || !endDate || !selectedType) {
      toast.error('Bitte alle Felder ausfüllen');
      return;
    }

    setSaving(true);
    try {
      const start = parseISO(startDate);
      const end = parseISO(endDate);
      const days = eachDayOfInterval({ start, end });
      const startStr = format(start, 'yyyy-MM-dd');
      const endStr = format(end, 'yyyy-MM-dd');

      // --- LÖSCHEN-Modus ---
      if (selectedType === 'loeschen') {
        const [existingAssignments, existingLeaveReqs] = await Promise.all([
          api.entities.Assignment.filter({ employee_id: selectedEmployee.id }),
          api.entities.LeaveRequest.filter({ employee_id: selectedEmployee.id }),
        ]);

        const assignmentTypes = ['urlaub', 'krank', 'beurlaubung', 'schule', 'tbz', 'pruefung', 'override_leer'];
        const toDeleteAssign = existingAssignments.filter(a => {
          const aDate = parseISO(a.date);
          return aDate >= start && aDate <= end && assignmentTypes.includes(a.assignment_type);
        });

        // LeaveRequests die den Zeitraum überlappen (ganz oder teilweise)
        const overlappingLeaveReqs = existingLeaveReqs.filter(r =>
          !r.notes?.includes('__revoke_request_for_') &&
          r.start_date <= endStr && r.end_date >= startStr
        );

        await Promise.all([
          ...toDeleteAssign.map(a => api.entities.Assignment.delete(a.id)),
          ...overlappingLeaveReqs.map(r => api.entities.LeaveRequest.delete(r.id)),
        ]);

        // Für überlappende Multi-Day-Requests: Teile außerhalb des Löschzeitraums neu anlegen
        for (const req of overlappingLeaveReqs) {
          const splits = [];
          // Teil vor dem Löschzeitraum
          if (req.start_date < startStr) {
            const beforeEnd = new Date(startStr);
            beforeEnd.setDate(beforeEnd.getDate() - 1);
            splits.push({ ...req, end_date: format(beforeEnd, 'yyyy-MM-dd') });
          }
          // Teil nach dem Löschzeitraum
          if (req.end_date > endStr) {
            const afterStart = new Date(endStr);
            afterStart.setDate(afterStart.getDate() + 1);
            splits.push({ ...req, start_date: format(afterStart, 'yyyy-MM-dd') });
          }
          await Promise.all(splits.map(split => api.entities.LeaveRequest.create({
            employee_id: split.employee_id,
            employee_name: split.employee_name,
            request_type: split.request_type,
            start_date: split.start_date,
            end_date: split.end_date,
            status: split.status,
            approved_by: split.approved_by,
            approved_at: split.approved_at,
            notes: split.notes,
          })));
        }

        toast.success(`Einträge im Zeitraum gelöscht`);
        if (onAssignmentsChange) onAssignmentsChange([], selectedEmployee.id, startStr, endStr);
        setSelectedEmployee(null);
        setStartDate('');
        setEndDate('');
        setSelectedType('urlaub');
        setSearchTerm('');
        setIsOpen(false);
        onSaved?.();
        return;
      }

      // --- NORMALER Eintrag-Modus ---
      // Delete existing assignments for this period
      const existingAssignments = await api.entities.Assignment.filter({
        employee_id: selectedEmployee.id,
      });

      const toDelete = existingAssignments.filter(a => {
        const aDate = parseISO(a.date);
        return aDate >= start && aDate <= end && ['urlaub', 'krank', 'beurlaubung', 'schule', 'tbz', 'pruefung'].includes(a.assignment_type);
      });

      // Delete old ones
      await Promise.all(toDelete.map(a => api.entities.Assignment.delete(a.id)));

      // Create new assignments – for urlaub/krank only on working days (no weekends, no holidays)
      const assignments = days
        .filter(day => {
          if (selectedType === 'urlaub' || selectedType === 'krank') {
            return !isWeekend(day) && !isPublicHoliday(day, 'TH');
          }
          return true;
        })
        .map(day => ({
          employee_id: selectedEmployee.id,
          date: format(day, 'yyyy-MM-dd'),
          assignment_type: selectedType,
        }));

      await api.entities.Assignment.bulkCreate(assignments);

      // For urlaub/krank: also create LeaveRequests
      if (selectedType === 'urlaub' || selectedType === 'krank') {
        const requestType = selectedType === 'urlaub' ? 'urlaub' : 'krankmeldung';
        
        // Delete existing single-day leave requests in this range
        const existingLeaveReqs = await api.entities.LeaveRequest.filter({
          employee_id: selectedEmployee.id,
        });

        const toDeleteLeave = existingLeaveReqs.filter(r => {
          const rStart = parseISO(r.start_date);
          const rEnd = parseISO(r.end_date);
          return rStart >= start && rEnd <= end && r.notes === '__manual_overview__';
        });

        await Promise.all(toDeleteLeave.map(r => api.entities.LeaveRequest.delete(r.id)));

        // Create one LeaveRequest for the entire range
        await api.entities.LeaveRequest.create({
          employee_id: selectedEmployee.id,
          employee_name: selectedEmployee.full_name,
          request_type: requestType,
          start_date: format(start, 'yyyy-MM-dd'),
          end_date: format(end, 'yyyy-MM-dd'),
          status: 'genehmigt',
          approved_by: currentUser?.full_name || currentUser?.email || 'Admin',
          approved_at: new Date().toISOString(),
          notes: '__manual_overview__',
        });
      }

      toast.success(`${days.length} Tage hinzugefügt`);

       // Optimistisch Zuweisungen aktualisieren
       if (onAssignmentsChange) {
         const newAssignments = assignments.map(a => ({ ...a, id: `temp_${Math.random()}` }));
         onAssignmentsChange(newAssignments, selectedEmployee.id, startStr, endStr);
       }

       // Reset
       setSelectedEmployee(null);
       setStartDate('');
       setEndDate('');
       setSelectedType('urlaub');
       setSearchTerm('');
       setIsOpen(false);
    } catch (error) {
      console.error(error);
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 p-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors w-full"
      >
        <span>⚡ Schnelleintrag</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="mt-4 space-y-4 pt-4 border-t border-gray-300 dark:border-gray-600">
          {/* Mitarbeiter-Suche */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
              Mitarbeiter
            </label>
            <div className="relative">
              {selectedEmployee ? (
                <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-900 dark:text-white">{selectedEmployee.full_name}</span>
                  <button
                    onClick={() => setSelectedEmployee(null)}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <Input
                  type="text"
                  placeholder="Mitarbeiter suchen..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="rounded-lg"
                />
              )}
              {searchTerm && !selectedEmployee && filteredEmployees.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {filteredEmployees.map(emp => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setSearchTerm('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-sm text-gray-700 dark:text-gray-200 border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      {emp.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Zeitraum */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
                Von
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
                Bis
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg"
              />
            </div>
          </div>

          {/* Typ */}
          <div>
            <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 block">
              Typ
            </label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <span className="flex items-center gap-2">
                      <span className={`inline-block w-3 h-3 rounded ${opt.color}`} />
                      {opt.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Button */}
          <Button
            onClick={handleSave}
            disabled={!selectedEmployee || !startDate || !endDate || saving}
            className={`w-full text-white ${selectedType === 'loeschen' ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {saving ? 'Wird verarbeitet...' : selectedType === 'loeschen' ? (
              <>
                <span className="mr-2">🗑</span>
                Einträge löschen
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Speichern
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}