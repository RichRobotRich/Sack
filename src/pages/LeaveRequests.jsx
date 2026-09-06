import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, differenceInDays, parseISO, isWeekend } from 'date-fns';
import { isPublicHoliday } from '@/utils/publicHolidays';
import { de } from 'date-fns/locale';
import {
  Plane,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';
import PullToRefresh from '@/components/PullToRefresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

function countWorkdays(start, end) {
  // Strings (yyyy-MM-dd) zu ISO-Format konvertieren
  let startStr = '', endStr = '';
  
  if (typeof start === 'string') {
    startStr = String(start).trim();
  } else if (start instanceof Date && !isNaN(start.getTime())) {
    startStr = format(start, 'yyyy-MM-dd');
  } else {
    return 0;
  }
  
  if (typeof end === 'string') {
    endStr = String(end).trim();
  } else if (end instanceof Date && !isNaN(end.getTime())) {
    endStr = format(end, 'yyyy-MM-dd');
  } else {
    return 0;
  }
  
  if (!startStr || !endStr) return 0;
  
  // UTC-Mittag für sichere Verarbeitung
  const startDate = new Date(startStr + 'T12:00:00Z');
  const endDate = new Date(endStr + 'T12:00:00Z');
  
  // Sicherstellen, dass Daten gültig sind
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 0;
  
  // Wenn end vor start, tauschen
  let current = new Date(startDate);
  let final = new Date(endDate);
  if (final < current) {
    const temp = new Date(current);
    current = new Date(final);
    final = temp;
  }
  
  let count = 0;
  while (current <= final) {
    if (!isWeekend(current) && !isPublicHoliday(current, 'TH')) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

// Prüft, ob zwei Arbeitstage aufeinanderfolgen (ignoriert Wochenende/Feiertage)
function isWorkdayAfter(date1Str, date2Str) {
  const d1 = new Date(date1Str + 'T12:00:00Z');
  const d2 = new Date(date2Str + 'T12:00:00Z');
  
  let current = new Date(d1);
  current.setDate(current.getDate() + 1);
  
  while (current < d2) {
    if (!isWeekend(current) && !isPublicHoliday(current, 'TH')) {
      return false; // Es gibt einen Arbeitstag dazwischen
    }
    current.setDate(current.getDate() + 1);
  }
  
  return true; // Nur Wochenende/Feiertage dazwischen
}

// Gruppiert Requests die aufeinanderfolgende Arbeitstage haben
// Aufhebungsanträge werden NIEMALS gruppiert
function groupConsecutiveRequests(reqs) {
  if (!reqs.length) return [];

  const sorted = [...reqs].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const groups = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];

    const prevIsRevoke = prev.notes?.includes('__revoke_request_for_');
    const currIsRevoke = curr.notes?.includes('__revoke_request_for_');

    // Aufhebungsanträge niemals zusammenführen
    if (!prevIsRevoke && !currIsRevoke && prev.employee_id === curr.employee_id && isWorkdayAfter(prev.end_date, curr.start_date)) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }

  return groups;
}

// Gruppiert eine Liste von Datums-Strings (yyyy-MM-dd) in aufeinanderfolgende Arbeitstag-Ranges
function groupConsecutiveDays(days) {
  if (!days.length) return [];
  const sorted = [...days].sort();
  const ranges = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (isWorkdayAfter(prev, curr)) {
      ranges[ranges.length - 1].push(curr);
    } else {
      ranges.push([curr]);
    }
  }
  return ranges;
}

// Generiert alle Arbeitstage in einem Zeitraum
function getWorkdaysInRange(startStr, endStr) {
  if (!startStr || !endStr) return [];
  
  const startDate = new Date(startStr + 'T12:00:00Z');
  const endDate = new Date(endStr + 'T12:00:00Z');
  
  if (isNaN(startDate) || isNaN(endDate)) return [];
  
  let current = new Date(startDate);
  let final = new Date(endDate);
  if (final < current) {
    const temp = new Date(current);
    current = new Date(final);
    final = temp;
  }
  
  const workdays = [];
  while (current <= final) {
    if (!isWeekend(current) && !isPublicHoliday(current, 'TH')) {
      const dateStr = `${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}-${String(current.getUTCDate()).padStart(2, '0')}`;
      workdays.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }
  return workdays;
}

export default function LeaveRequests() {
  const [requests, setRequests] = useState([]);
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeRequest, setRevokeRequest] = useState(null);
  const [revokeGroup, setRevokeGroup] = useState(null);
  const [selectedRevokeDays, setSelectedRevokeDays] = useState([]);
  const [availableRevokeDays, setAvailableRevokeDays] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    start_date: null,
    end_date: null,
    is_half_day: false,
    half_day_type: 'vormittag',
    reason: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await api.auth.me();
      const employees = await api.entities.Employee.list();

      // Find linked employee via employee_id stored on user profile
      let linkedEmployee = null;
      if (currentUser.employee_id) {
        linkedEmployee = employees.find(e => e.id === currentUser.employee_id);
      }
      setEmployee(linkedEmployee);
      setUser(currentUser);

      // Load only requests relevant to this user
      let requests = [];
      const allRequests = await api.entities.LeaveRequest.filter({
        request_type: 'urlaub'
      }, '-created_date');

      // Filter: show only requests created by user OR for linked employee
      requests = allRequests.filter(req => 
        req.created_by === currentUser.email ||
        (linkedEmployee?.id && req.employee_id === linkedEmployee.id)
      );

      setRequests(requests);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.start_date || !form.end_date) return;

    setSubmitting(true);
    let days = countWorkdays(form.start_date, form.end_date);
    if (form.is_half_day && form.start_date.getTime() === form.end_date.getTime()) {
      days = 0.5;
    }
    
    try {
      // Store linked employee info if available
      const employeeId = employee?.id || null;
      const employeeName = employee?.full_name || null;

      // Optimistic update
      const newRequest = {
        id: `temp-${Date.now()}`,
        employee_id: employeeId,
        requester_role_id: user.role_id,
        request_type: 'urlaub',
        start_date: format(form.start_date, 'yyyy-MM-dd'),
        end_date: format(form.end_date, 'yyyy-MM-dd'),
        reason: form.reason,
        status: 'eingereicht',
        created_date: new Date().toISOString(),
        created_by_id: user.id,
        _pending: true
      };

      setRequests(prev => [newRequest, ...prev]);

      // Send to admin/HR
      const recipients = await api.entities.EmailRecipient.filter({ 
        is_active: true 
      });

      const leaveRecipients = recipients.filter(r => {
        const hasNotificationType = r.notification_types?.includes('urlaub');
        const hasAllowedRole = !r.allowed_roles || r.allowed_roles.length === 0 || r.allowed_roles.includes(user.role_id);
        return hasNotificationType && hasAllowedRole;
      });

      const safeFormatDate = (date, formatStr) => {
        try {
          if (!date) return '—';
          if (date instanceof Date && isNaN(date)) return '—';
          return format(date, formatStr);
        } catch {
          return '—';
        }
      };

      const adminEmailBody = `
      Urlaubsantrag eingereicht

      Mitarbeiter: ${user.display_name || user.full_name || user.email}
      Zeitraum: ${safeFormatDate(form.start_date, 'd.M.yyyy')} - ${safeFormatDate(form.end_date, 'd.M.yyyy')}${form.is_half_day ? ` (${form.half_day_type === 'vormittag' ? 'Vormittag' : 'Nachmittag'})` : ''}
      ${form.reason ? `Bemerkung: ${form.reason}` : ''}

      Eingereicht am: ${safeFormatDate(new Date(), 'd.M.yyyy HH:mm')} Uhr
      `.trim();

      try {
        for (const recipient of leaveRecipients) {
          await api.integrations.Core.SendEmail({
            to: recipient.email,
            subject: `Urlaubsantrag: ${user.display_name || user.full_name || user.email}`,
            body: adminEmailBody
          });
        }
      } catch (adminEmailError) {
        console.warn('Admin-E-Mails konnten nicht gesendet werden:', adminEmailError);
      }

      // Send confirmation email to requester
      try {
        const safeFormatDate = (date, formatStr) => {
          try {
            if (!date) return '—';
            if (date instanceof Date && isNaN(date)) return '—';
            return format(date, formatStr);
          } catch {
            return '—';
          }
        };

        await api.integrations.Core.SendEmail({
          to: user.email,
          subject: 'Urlaubsantrag erfolgreich eingereicht',
          body: `
      Hallo ${user.display_name || user.full_name || user.email},

      Ihr Urlaubsantrag wurde erfolgreich eingereicht.

      Zeitraum: ${safeFormatDate(form.start_date, 'd.M.yyyy')} - ${safeFormatDate(form.end_date, 'd.M.yyyy')}${form.is_half_day ? ` (${form.half_day_type === 'vormittag' ? 'Vormittag' : 'Nachmittag'})` : ''}
      ${form.reason ? `Bemerkung: ${form.reason}` : ''}

      Sie werden benachrichtigt, sobald Ihr Antrag bearbeitet wurde.

      Mit freundlichen Grüßen
      Ihr Leniger Team
        `.trim()
        });
      } catch (confirmEmailError) {
        console.warn('Bestätigungs-E-Mail konnte nicht gesendet werden:', confirmEmailError);
      }

      setDialogOpen(false);
      setForm({ start_date: null, end_date: null, is_half_day: false, half_day_type: 'vormittag', reason: '' });

      // API call
       await api.entities.LeaveRequest.create({
         employee_id: employeeId,
         employee_name: employeeName,
         requester_role_id: user.role_id,
         request_type: 'urlaub',
         start_date: format(form.start_date, 'yyyy-MM-dd'),
         end_date: format(form.end_date, 'yyyy-MM-dd'),
         is_half_day: form.is_half_day,
         half_day_type: form.is_half_day ? form.half_day_type : null,
         reason: form.reason,
         status: 'eingereicht'
       });

      // Genehmigte Aufhebungsanträge für überlappende Tage löschen
      // (damit der ursprüngliche Urlaub wieder vollständig angezeigt wird)
      const newStartStr = format(form.start_date, 'yyyy-MM-dd');
      const newEndStr = format(form.end_date, 'yyyy-MM-dd');
      const newWorkdays = new Set(getWorkdaysInRange(newStartStr, newEndStr));

      const allCurrentRequests = await api.entities.LeaveRequest.filter({ request_type: 'urlaub' });
      const overlappingRevokeRequests = allCurrentRequests.filter(r => {
        if (!r.notes?.includes('__revoke_request_for_')) return false;
        // Alle Aufhebungsanträge (egal ob genehmigt oder eingereicht) löschen
        const revokeDays = getWorkdaysInRange(r.start_date, r.end_date);
        return revokeDays.some(d => newWorkdays.has(d));
      });

      if (overlappingRevokeRequests.length > 0) {
        await Promise.all(overlappingRevokeRequests.map(r =>
          api.entities.LeaveRequest.delete(r.id).catch(() => {/* already deleted */})
        ));
      }

      // Reload to sync
      await loadData();
    } catch (error) {
      console.error('Error submitting request:', error);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (request, group = null) => {
    if (request.status === 'eingereicht') {
      // Einfach löschen
      if (!confirm('Möchten Sie diesen Urlaubsantrag wirklich zurückziehen?')) return;
      try {
        await api.entities.LeaveRequest.delete(request.id);
        await loadData();
      } catch (error) {
        console.error('Error withdrawing request:', error);
      }
    } else if (request.status === 'genehmigt') {
      // Bereits aufgehobene Tage ermitteln und aus der Auswahl ausschließen
      const groupReqs = group || [request];
      const groupIds = groupReqs.map(r => r.id);
      const existingRevokeReqs = requests.filter(r =>
        r.notes?.includes('__revoke_request_for_') &&
        groupIds.some(id => r.notes.includes(id))
      );
      const alreadyRevokedDays = new Set(
        existingRevokeReqs.flatMap(r => getWorkdaysInRange(r.start_date, r.end_date))
      );
      // Nur noch verbleibende Tage zur Auswahl anbieten
      const availableDays = groupReqs
        .flatMap(r => getWorkdaysInRange(r.start_date, r.end_date))
        .filter(d => !alreadyRevokedDays.has(d));

      setRevokeRequest(request);
      setRevokeGroup(group);
      setAvailableRevokeDays(availableDays);
      setSelectedRevokeDays([]);
      setRevokeDialogOpen(true);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeRequest || selectedRevokeDays.length === 0) return;

    try {
      const groupReqs = revokeGroup || [revokeRequest];
      // Alle referenzierten Request-IDs (für das notes-Tag)
      const refIds = groupReqs.map(r => r.id).join(',');
      const noteTag = `__revoke_request_for_${refIds}__`;

      // Aufeinanderfolgende Tage zu Ranges zusammenfassen
      const ranges = groupConsecutiveDays(selectedRevokeDays);

      // Pro Range einen Aufhebungsantrag erstellen
      await Promise.all(ranges.map(range => {
        const startDay = range[0];
        const endDay = range[range.length - 1];
        return api.entities.LeaveRequest.create({
          employee_id: revokeRequest.employee_id,
          employee_name: revokeRequest.employee_name,
          requester_role_id: user.role_id,
          request_type: 'urlaub',
          start_date: startDay,
          end_date: endDay,
          reason: `Aufhebung Urlaub`,
          status: 'eingereicht',
          notes: noteTag
        });
      }));

      setRevokeDialogOpen(false);
      setRevokeRequest(null);
      setRevokeGroup(null);
      setSelectedRevokeDays([]);
      setAvailableRevokeDays([]);
      await loadData();
      toast.success('Aufhebungsantrag eingereicht');
    } catch (error) {
      console.error('Error creating revoke request:', error);
      toast.error('Fehler beim Erstellen des Aufhebungsantrags');
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      eingereicht: { icon: Clock, class: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Eingereicht' },
      in_pruefung: { icon: AlertCircle, class: 'bg-amber-100 text-amber-700 border-amber-200', label: 'In Prüfung' },
      genehmigt: { icon: CheckCircle, class: 'bg-green-100 text-green-700 border-green-200', label: 'Genehmigt' },
      abgelehnt: { icon: XCircle, class: 'bg-red-100 text-red-700 border-red-200', label: 'Abgelehnt' }
    };
    const { icon: Icon, class: className, label } = config[status] || config.eingereicht;
    return (
      <Badge variant="outline" className={className}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-40" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
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
            <Plane className="w-8 h-8 dark:text-blue-300" />
            Urlaubsanträge
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Verwalten Sie Ihre Urlaubsanträge
          </p>
        </div>
        <Button 
          onClick={() => setDialogOpen(true)}
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Antrag
        </Button>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="py-12 text-center">
            <Plane className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400 mb-4">Noch keine Urlaubsanträge</p>
            <Button 
              onClick={() => setDialogOpen(true)}
              variant="outline"
            >
              Ersten Antrag stellen
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {(() => {
            const safeDate = (str) => {
              try { const d = new Date(`${str}T12:00:00Z`); return isNaN(d) ? null : d; } catch { return null; }
            };

            // Für jede Gruppe: entweder direkt rendern (Aufhebung) oder in Teilblöcke aufsplitten
            const cards = [];

            groupConsecutiveRequests(requests).forEach((group, groupIdx) => {
              const firstReq = group[0];
              const allSameStatus = group.every(r => r.status === firstReq.status);
              const isRevokeRequest = firstReq.notes?.includes('__revoke_request_for_');

              if (isRevokeRequest) {
                // Aufhebungsantrag: direkt als eine Karte
                const totalDays = group.reduce((sum, req) => sum + countWorkdays(req.start_date, req.end_date), 0);
                const lastReq = group[group.length - 1];
                const startD = safeDate(firstReq.start_date);
                const endD = safeDate(lastReq.end_date);
                const dateLabel = startD && endD
                  ? startD.getTime() === endD.getTime()
                    ? format(startD, 'd. MMM yyyy', { locale: de })
                    : `${format(startD, 'd. MMM', { locale: de })} – ${format(endD, 'd. MMM yyyy', { locale: de })}`
                  : '—';
                const cardTitle = totalDays === 0.5 ? 'Aufhebung: Halber Tag' : `Aufhebung: ${totalDays} Tag${totalDays !== 1 ? 'e' : ''} Urlaub`;

                cards.push(
                  <Card key={`revoke-${groupIdx}`} className={`border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700 border-l-4 border-l-red-400`}>
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-100 dark:bg-red-900/30">
                            <Plane className="w-6 h-6 text-red-500" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900 dark:text-white">{cardTitle}</h3>
                              {getStatusBadge(firstReq.status)}
                            </div>
                            {firstReq.employee_name && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{firstReq.employee_name}</p>}
                            <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Calendar className="w-4 h-4" />{dateLabel}</p>
                            {allSameStatus && firstReq.approved_by && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                {firstReq.status === 'genehmigt' ? 'Genehmigt' : 'Abgelehnt'} von {firstReq.approved_by}
                                {firstReq.approved_at && (() => { try { const d = new Date(firstReq.approved_at); return isNaN(d) ? '' : ` am ${format(d, 'd.M.yyyy HH:mm', { locale: de })} Uhr`; } catch { return ''; } })()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                            Gesendet am {(() => { try { if (!firstReq.created_date) return '—'; const d = new Date(firstReq.created_date); return isNaN(d) ? '—' : format(d, 'd.M.yyyy HH:mm'); } catch { return '—'; } })()} Uhr
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
                return;
              }

              // Normaler Urlaubsantrag: aufgehobene Tage abziehen und in aufeinanderfolgende Blöcke aufteilen
              const groupIds = group.map(r => r.id);
              const groupWorkdays = new Set(group.flatMap(r => getWorkdaysInRange(r.start_date, r.end_date)));
              const revokeReqs = requests.filter(r => {
                if (!r.notes?.includes('__revoke_request_for_')) return false;
                // Per ID-Referenz ODER per Datums-Überschneidung mit der Gruppe
                const refById = groupIds.some(id => r.notes.includes(id));
                const refByDate = getWorkdaysInRange(r.start_date, r.end_date).some(d => groupWorkdays.has(d));
                return refById || refByDate;
              });
              const revokedDays = new Set(
                revokeReqs.flatMap(r => getWorkdaysInRange(r.start_date, r.end_date))
              );
              const allWorkdays = group.flatMap(r => getWorkdaysInRange(r.start_date, r.end_date));
              const remainingWorkdays = allWorkdays.filter(d => !revokedDays.has(d));

              // In aufeinanderfolgende Blöcke aufteilen
              const blocks = groupConsecutiveDays(remainingWorkdays);

              blocks.forEach((block, blockIdx) => {
                const blockStart = block[0];
                const blockEnd = block[block.length - 1];
                const totalDays = block.length;
                const startD = safeDate(blockStart);
                const endD = safeDate(blockEnd);
                const dateLabel = startD && endD
                  ? startD.getTime() === endD.getTime()
                    ? format(startD, 'd. MMM yyyy', { locale: de })
                    : `${format(startD, 'd. MMM', { locale: de })} – ${format(endD, 'd. MMM yyyy', { locale: de })}`
                  : '—';
                const cardTitle = firstReq.is_half_day
                  ? `Halber Tag (${firstReq.half_day_type === 'vormittag' ? 'Vormittag' : 'Nachmittag'})`
                  : `${totalDays} Tag${totalDays !== 1 ? 'e' : ''} Urlaub`;

                cards.push(
                  <Card key={`group-${groupIdx}-block-${blockIdx}`} className={`border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700 ${firstReq._pending ? 'opacity-70' : ''}`}>
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-100 dark:bg-emerald-900/30">
                            <Plane className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900 dark:text-white">{cardTitle}</h3>
                              {firstReq._pending ? (
                                <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />Wird gesendet...</Badge>
                              ) : getStatusBadge(firstReq.status)}
                            </div>
                            {firstReq.employee_name && <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{firstReq.employee_name}</p>}
                            <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2"><Calendar className="w-4 h-4" />{dateLabel}</p>
                            {firstReq.reason && !firstReq.reason.startsWith('Aufhebung') && (
                              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">{firstReq.reason}</p>
                            )}
                            {allSameStatus && (firstReq.status === 'genehmigt' || firstReq.status === 'abgelehnt') && firstReq.approved_by && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                {firstReq.status === 'genehmigt' ? 'Genehmigt' : 'Abgelehnt'} von {firstReq.approved_by}
                                {firstReq.approved_at && (() => { try { const d = new Date(firstReq.approved_at); return isNaN(d) ? '' : ` am ${format(d, 'd.M.yyyy HH:mm', { locale: de })} Uhr`; } catch { return ''; } })()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                            Gesendet am {(() => { try { if (!firstReq.created_date) return '—'; const d = new Date(firstReq.created_date); return isNaN(d) ? '—' : format(d, 'd.M.yyyy HH:mm'); } catch { return '—'; } })()} Uhr
                          </div>
                          {firstReq._fromAdmin ? (
                            <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">Von Verwaltung eingetragen</Badge>
                          ) : allSameStatus && (firstReq.status === 'eingereicht' || firstReq.status === 'genehmigt') && (
                            <Button variant="outline" size="sm" onClick={() => handleWithdraw(firstReq, group)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
                              {firstReq.status === 'eingereicht' ? 'Zurückziehen' : 'Aufheben'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              });
            });

            return cards;
          })()}
        </div>
      )}

      {/* Revoke Days Dialog */}
      <Dialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Urlaubstage zur Aufhebung auswählen</DialogTitle>
            <DialogDescription>
              Klicken Sie auf die Tage, die Sie aufheben möchten.
            </DialogDescription>
          </DialogHeader>
          
          {revokeRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {availableRevokeDays.map(dayStr => {
                  const dayDate = new Date(dayStr + 'T12:00:00Z');
                  const isSelected = selectedRevokeDays.includes(dayStr);
                  if (isNaN(dayDate)) return null;
                  return (
                    <button
                      key={dayStr}
                      onClick={() => {
                        setSelectedRevokeDays(prev =>
                          isSelected ? prev.filter(d => d !== dayStr) : [...prev, dayStr]
                        );
                      }}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-semibold text-sm">{format(dayDate, 'd')}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{format(dayDate, 'EEE', { locale: de })}</div>
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedRevokeDays.length} von {availableRevokeDays.length} Tagen ausgewählt
              </p>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleConfirmRevoke}
              disabled={selectedRevokeDays.length === 0}
              className="bg-red-600 hover:bg-red-700"
            >
              Aufhebung einreichen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Neuer Urlaubsantrag</DialogTitle>
            <DialogDescription>
              Tragen Sie den Zeitraum Ihres Urlaubs ein.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Von</Label>
                <input
                  type="date"
                  value={form.start_date ? format(form.start_date, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setForm({...form, start_date: e.target.value ? new Date(e.target.value + 'T12:00:00Z') : null})}
                  min={format(new Date(), 'yyyy-MM-dd')}
                  className="w-full h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                  style={{ WebkitAppearance: 'auto', appearance: 'auto' }}
                />
              </div>

              <div className="space-y-2">
                <Label>Bis</Label>
                <input
                  type="date"
                  value={form.end_date ? format(form.end_date, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setForm({...form, end_date: e.target.value ? new Date(e.target.value + 'T12:00:00Z') : null})}
                  min={form.start_date ? format(form.start_date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')}
                  className="w-full h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                  style={{ WebkitAppearance: 'auto', appearance: 'auto' }}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_half_day}
                  onChange={(e) => setForm({...form, is_half_day: e.target.checked})}
                  className="w-4 h-4 border-gray-300 rounded dark:border-gray-600"
                />
                Halber Tag
              </Label>
            </div>

            {form.is_half_day && (
              <div className="space-y-2">
                <Label>Tageszeit</Label>
                <select
                  value={form.half_day_type}
                  onChange={(e) => setForm({...form, half_day_type: e.target.value})}
                  className="w-full h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                  style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
                >
                  <option value="vormittag">Vormittag</option>
                  <option value="nachmittag">Nachmittag</option>
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Bemerkung (optional)</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({...form, reason: e.target.value})}
                placeholder="Z.B. Familienurlaub, Hochzeit, etc."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.start_date || !form.end_date || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird eingereicht...' : 'Antrag einreichen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PullToRefresh>
  );
}