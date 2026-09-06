import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, differenceInDays, parseISO, isWeekend } from 'date-fns';
import { isPublicHoliday } from '@/utils/publicHolidays';
import { de } from 'date-fns/locale';
import {
  Thermometer,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Paperclip,
  Upload
} from 'lucide-react';
import PullToRefresh from '@/components/PullToRefresh';
import { Card, CardContent } from '@/components/ui/card';
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
  DialogFooter,
} from '@/components/ui/dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

function countWorkdays(start, end) {
  let count = 0;
  const d = new Date(start);
  const e = new Date(end);
  d.setHours(0, 0, 0, 0);
  e.setHours(0, 0, 0, 0);
  for (; d <= e; d.setDate(d.getDate() + 1)) {
    if (!isWeekend(d) && !isPublicHoliday(d, 'TH')) count++;
  }
  return count;
}

export default function SickReports() {
  const [requests, setRequests] = useState([]);
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    start_date: new Date(),
    end_date: new Date(),
    reason: '',
    attachment: null,
    attachment_url: null
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await api.auth.me();
      const employees = await api.entities.Employee.list();

      // Find linked employee via employee_id stored on user profile
      const linkedEmployee = currentUser.employee_id
        ? employees.find(e => e.id === currentUser.employee_id)
        : employees.find(e => e.email === currentUser.email);
      setEmployee(linkedEmployee);
      setUser(currentUser);

      // Load only requests relevant to this user
      let requests;
      if (linkedEmployee) {
        // Only load requests for the linked employee
        requests = await api.entities.LeaveRequest.filter({
          request_type: 'krankmeldung',
          employee_id: linkedEmployee.id
        }, '-created_date');
      } else {
        // Only load requests created by this user
        requests = await api.entities.LeaveRequest.filter({
          request_type: 'krankmeldung',
          created_by: currentUser.email
        }, '-created_date');
      }

      setRequests(requests);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await api.integrations.Core.UploadFile({ file });
      setForm({ ...form, attachment: file, attachment_url: file_url });
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleWithdraw = async (request) => {
    if (!confirm('Möchten Sie diese Krankmeldung wirklich zurückziehen?')) return;

    try {
      await api.entities.LeaveRequest.delete(request.id);
      await loadData();

      // E-Mail senden
      const recipients = await api.entities.EmailRecipient.filter({ 
        is_active: true 
      });

      const krankmeldungRecipients = recipients.filter(r => {
        const hasNotificationType = r.notification_types?.includes('krankmeldung');
        const hasAllowedRole = !r.allowed_roles || r.allowed_roles.length === 0 || r.allowed_roles.includes(user.role_id);
        return hasNotificationType && hasAllowedRole;
      });

      const days = countWorkdays(new Date(request.start_date), new Date(request.end_date));
      const emailBody = `
Krankmeldung zurückgezogen

Mitarbeiter: ${request.employee_name || employee?.full_name || request.employee_id || ''}
Zeitraum: ${format(new Date(request.start_date), 'd.M.yyyy')} - ${format(new Date(request.end_date), 'd.M.yyyy')} (${days} Tag${days !== 1 ? 'e' : ''})

Die Krankmeldung wurde vom Mitarbeiter zurückgezogen.

Zurückgezogen am: ${format(new Date(), 'd.M.yyyy HH:mm')} Uhr
      `.trim();

      try {
        for (const recipient of krankmeldungRecipients) {
          await api.integrations.Core.SendEmail({
            to: recipient.email,
            subject: `Krankmeldung zurückgezogen: ${request.employee_name || employee?.full_name || request.employee_id || ''}`,
            body: emailBody
          });
        }
      } catch (adminEmailError) {
        console.warn('Admin-E-Mails konnten nicht gesendet werden:', adminEmailError);
      }

      // Bestätigungs-E-Mail an Antragsteller
      try {
        await api.integrations.Core.SendEmail({
          to: user.email,
          subject: 'Krankmeldung erfolgreich zurückgezogen',
          body: `
Hallo ${user.display_name || user.full_name || user.email},

Ihre Krankmeldung wurde erfolgreich zurückgezogen.

Zeitraum: ${format(new Date(request.start_date), 'd.M.yyyy')} - ${format(new Date(request.end_date), 'd.M.yyyy')} (${days} Tag${days !== 1 ? 'e' : ''})

Mit freundlichen Grüßen
Ihr Leniger Team
          `.trim()
        });
      } catch (confirmEmailError) {
        console.warn('Bestätigungs-E-Mail konnte nicht gesendet werden:', confirmEmailError);
      }
    } catch (error) {
      console.error('Error withdrawing request:', error);
    }
  };

  const handleSubmit = async () => {
    if (!form.start_date || !form.end_date) return;

    setSubmitting(true);
    const days = countWorkdays(form.start_date, form.end_date);

    try {
      // Store linked employee info if available
      const employeeId = employee?.id || null;
      const employeeName = employee?.full_name || null;

      // Optimistic update
      const newRequest = {
        id: `temp-${Date.now()}`,
        employee_id: employeeId,
        requester_role_id: user.role_id,
        request_type: 'krankmeldung',
        start_date: format(form.start_date, 'yyyy-MM-dd'),
        end_date: format(form.end_date, 'yyyy-MM-dd'),
        reason: form.reason,
        attachment_url: form.attachment_url,
        status: 'eingereicht',
        created_date: new Date().toISOString(),
        created_by_id: user.id,
        _pending: true
      };

      setRequests(prev => [newRequest, ...prev]);
      setDialogOpen(false);
      setForm({ start_date: new Date(), end_date: new Date(), reason: '', attachment: null, attachment_url: null });

      // API call
      await api.entities.LeaveRequest.create({
        employee_id: employeeId,
        employee_name: employeeName,
        requester_role_id: user.role_id,
        request_type: 'krankmeldung',
        start_date: format(form.start_date, 'yyyy-MM-dd'),
        end_date: format(form.end_date, 'yyyy-MM-dd'),
        reason: form.reason,
        attachment_url: form.attachment_url,
        status: 'eingereicht'
      });

      // E-Mail senden
      const recipients = await api.entities.EmailRecipient.filter({ 
        is_active: true 
      });

      const krankmeldungRecipients = recipients.filter(r => {
        const hasNotificationType = r.notification_types?.includes('krankmeldung');
        const hasAllowedRole = !r.allowed_roles || r.allowed_roles.length === 0 || r.allowed_roles.includes(user.role_id);
        return hasNotificationType && hasAllowedRole;
      });

      const emailBody = `
      Krankmeldung eingereicht

      Mitarbeiter: ${user.display_name || user.full_name || user.email}
      Zeitraum: ${format(form.start_date, 'd.M.yyyy')} - ${format(form.end_date, 'd.M.yyyy')} (${days} Tag${days !== 1 ? 'e' : ''})
      ${form.reason ? `Bemerkung: ${form.reason}` : ''}
      ${form.attachment_url ? `Anhang: ${form.attachment_url}` : ''}

      Gemeldet am: ${format(new Date(), 'd.M.yyyy HH:mm')} Uhr
      `.trim();

      try {
        for (const recipient of krankmeldungRecipients) {
          await api.integrations.Core.SendEmail({
            to: recipient.email,
            subject: `Krankmeldung: ${user.display_name || user.full_name || user.email}`,
            body: emailBody
          });
        }
      } catch (adminEmailError) {
        console.warn('Admin-E-Mails konnten nicht gesendet werden:', adminEmailError);
      }

      // Bestätigungs-E-Mail an Antragsteller
      try {
        await api.integrations.Core.SendEmail({
          to: user.email,
          subject: 'Krankmeldung erfolgreich eingereicht',
          body: `
Hallo ${user.display_name || user.full_name || user.email},

Ihre Krankmeldung wurde erfolgreich eingereicht.

Zeitraum: ${format(form.start_date, 'd.M.yyyy')} - ${format(form.end_date, 'd.M.yyyy')} (${days} Tag${days !== 1 ? 'e' : ''})
${form.reason ? `Bemerkung: ${form.reason}` : ''}

Sie werden benachrichtigt, sobald Ihre Meldung bearbeitet wurde.

Mit freundlichen Grüßen
Ihr Leniger Team
          `.trim()
        });
      } catch (confirmEmailError) {
        console.warn('Bestätigungs-E-Mail konnte nicht gesendet werden:', confirmEmailError);
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

      const sendStatusChangeEmail = async (request, newStatus) => {
      const statusLabels = {
      eingereicht: 'Eingereicht',
      in_pruefung: 'In Prüfung',
      genehmigt: 'Bestätigt',
      abgelehnt: 'Abgelehnt'
      };

      const days = countWorkdays(new Date(request.start_date), new Date(request.end_date));

      await api.integrations.Core.SendEmail({
      to: user.email,
      subject: `Krankmeldung ${statusLabels[newStatus]} - ${format(new Date(request.start_date), 'd.M.yyyy')}`,
      body: `
      Hallo ${user.display_name || user.full_name || user.email},

      Ihre Krankmeldung wurde bearbeitet.

      Status: ${statusLabels[newStatus]}
      Zeitraum: ${format(new Date(request.start_date), 'd.M.yyyy')} - ${format(new Date(request.end_date), 'd.M.yyyy')} (${days} Tag${days !== 1 ? 'e' : ''})

      Mit freundlichen Grüßen
      Ihr Leniger Team
      `.trim()
      });
      };

  const getStatusBadge = (status) => {
    const config = {
      eingereicht: { icon: Clock, class: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Eingereicht' },
      in_pruefung: { icon: AlertCircle, class: 'bg-amber-100 text-amber-700 border-amber-200', label: 'In Prüfung' },
      genehmigt: { icon: CheckCircle, class: 'bg-green-100 text-green-700 border-green-200', label: 'Bestätigt' },
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
            <Thermometer className="w-8 h-8 dark:text-amber-400" />
            Krankmeldungen
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Melden Sie sich krank
          </p>
        </div>
        <Button 
          onClick={() => setDialogOpen(true)}
          className="bg-amber-500 hover:bg-amber-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Krankmeldung einreichen
        </Button>
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="py-12 text-center">
            <Thermometer className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">Keine Krankmeldungen vorhanden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const days = countWorkdays(new Date(request.start_date), new Date(request.end_date));

            return (
              <Card key={request.id} className={`border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700 ${request._pending ? 'opacity-70' : ''}`}>
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
                        <Thermometer className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {days} Tag{days !== 1 ? 'e' : ''} krank
                          </h3>
                          {request._pending ? (
                            <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">
                              <Clock className="w-3 h-3 mr-1" />
                              Wird gesendet...
                            </Badge>
                          ) : (
                            getStatusBadge(request.status)
                          )}
                        </div>
                        {(request.employee_name || request.employee_id) && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                            {request.employee_name || employee?.full_name || ''}
                          </p>
                        )}
                        <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(request.start_date), 'd. MMM', { locale: de })} – {format(new Date(request.end_date), 'd. MMM yyyy', { locale: de })}
                        </p>
                        {request.reason && (
                          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                            {request.reason}
                          </p>
                        )}
                        {(request.status === 'genehmigt' || request.status === 'abgelehnt') && request.approved_by && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            {request.status === 'genehmigt' ? 'Bestätigt' : 'Abgelehnt'} von {request.approved_by}
                            {request.approved_at && ` am ${format(new Date(request.approved_at), 'd.M.yyyy HH:mm')} Uhr`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                        <div>Gemeldet am {format(new Date(request.created_date), 'd.M.yyyy HH:mm')} Uhr</div>
                        {request.attachment_url && (
                          <a 
                            href={request.attachment_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-end gap-1 mt-1"
                          >
                            <Paperclip className="w-3 h-3" />
                            Anhang ansehen
                          </a>
                        )}
                      </div>
                      {request._fromAdmin ? (
                        <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                          Von Verwaltung eingetragen
                        </Badge>
                      ) : (request.status === 'eingereicht' || request.status === 'in_pruefung') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleWithdraw(request)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Zurückziehen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Report Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Krankmeldung einreichen</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Von</Label>
                <input
                  type="date"
                  value={form.start_date ? format(form.start_date, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setForm({...form, start_date: e.target.value ? new Date(e.target.value) : null})}
                  className="w-full h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                  style={{ WebkitAppearance: 'auto', appearance: 'auto' }}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Bis (voraussichtlich)</Label>
                <input
                  type="date"
                  value={form.end_date ? format(form.end_date, 'yyyy-MM-dd') : ''}
                  onChange={(e) => setForm({...form, end_date: e.target.value ? new Date(e.target.value) : null})}
                  min={form.start_date ? format(form.start_date, 'yyyy-MM-dd') : ''}
                  className="w-full h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                  style={{ WebkitAppearance: 'auto', appearance: 'auto' }}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Bemerkung (optional)</Label>
              <Textarea
                value={form.reason}
                onChange={(e) => setForm({...form, reason: e.target.value})}
                placeholder="Zusätzliche Informationen..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Krankmeldung/Attest (optional)</Label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => document.getElementById('file-upload').click()}
                  disabled={uploading}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploading ? 'Wird hochgeladen...' : form.attachment ? form.attachment.name : 'Datei hochladen'}
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.start_date || !form.end_date || submitting}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {submitting ? 'Wird eingereicht...' : 'Krankmeldung senden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PullToRefresh>
  );
}