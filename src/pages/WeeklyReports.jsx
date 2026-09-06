import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, startOfWeek, addDays, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  FileText,
  Plus,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import PullToRefresh from '@/components/PullToRefresh';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function WeeklyReports() {
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [reportToWithdraw, setReportToWithdraw] = useState(null);
  const [expandedReports, setExpandedReports] = useState({});

  const [weekStart, setWeekStart] = useState(() => {
    const today = new Date();
    return startOfWeek(today, { weekStartsOn: 1 });
  });

  const [days, setDays] = useState(() => 
    Array.from({ length: 5 }, (_, i) => ({
      date: format(addDays(weekStart, i), 'yyyy-MM-dd'),
      project_id: '',
      project_name: '',
      cost_center_number: '',
      start_time: '07:00',
      end_time: '16:00',
      break_minutes: 30,
      work_hours: 0,
      description: ''
    }))
  );

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const newDays = Array.from({ length: 5 }, (_, i) => ({
      date: format(addDays(weekStart, i), 'yyyy-MM-dd'),
      project_id: '',
      project_name: '',
      cost_center_number: '',
      start_time: '07:00',
      end_time: '16:00',
      break_minutes: 30,
      work_hours: 0,
      description: ''
    }));
    setDays(newDays);
  }, [weekStart]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentUser = await api.auth.me();
      const [reportsData, projectsData] = await Promise.all([
        api.entities.WeeklyReport.filter({ user_email: currentUser.email }, '-created_date'),
        api.entities.Project.filter({ status: 'aktiv' })
      ]);
      
      setUser(currentUser);
      setReports(reportsData);
      setProjects(projectsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateWorkHours = (startTime, endTime, breakMinutes) => {
    if (!startTime || !endTime) return 0;
    
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    const totalMinutes = endMinutes - startMinutes - (breakMinutes || 0);
    return Math.max(0, totalMinutes / 60);
  };

  const updateDay = (index, field, value) => {
    const newDays = [...days];
    newDays[index] = { ...newDays[index], [field]: value };
    
    if (field === 'project_id') {
      const project = projects.find(p => p.id === value);
      newDays[index].project_name = project?.name || '';
      newDays[index].cost_center_number = project?.cost_center_number || '';
    }
    
    if (field === 'start_time' || field === 'end_time' || field === 'break_minutes') {
      newDays[index].work_hours = calculateWorkHours(
        newDays[index].start_time,
        newDays[index].end_time,
        newDays[index].break_minutes
      );
    }
    
    setDays(newDays);
  };

  const getTotalHours = () => {
    return days.reduce((sum, day) => sum + (day.work_hours || 0), 0);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const totalHours = getTotalHours();
      
      await api.entities.WeeklyReport.create({
        user_email: user.email,
        user_name: user.full_name || user.email,
        week_start: format(weekStart, 'yyyy-MM-dd'),
        days: days,
        total_hours: totalHours,
        status: 'in_pruefung',
        submitted_at: new Date().toISOString()
      });
      
      // Bestätigungs-E-Mail an Benutzer
      await api.integrations.Core.SendEmail({
        to: user.email,
        subject: 'Wochenbericht erfolgreich eingereicht',
        body: `
Hallo ${user.full_name || user.email},

Ihr Wochenbericht wurde erfolgreich eingereicht.

Woche: ${format(weekStart, 'dd.MM.yyyy')}
Gesamtstunden: ${totalHours.toFixed(2)}h

Sie werden benachrichtigt, sobald Ihr Bericht geprüft wurde.

Mit freundlichen Grüßen
Ihr Leniger Team
        `.trim()
      });

      setDialogOpen(false);
      await loadData();
      
      // Reset form
      const newDays = Array.from({ length: 5 }, (_, i) => ({
        date: format(addDays(weekStart, i), 'yyyy-MM-dd'),
        project_id: '',
        project_name: '',
        cost_center_number: '',
        start_time: '07:00',
        end_time: '16:00',
        break_minutes: 30,
        work_hours: 0,
        description: ''
      }));
      setDays(newDays);
    } catch (error) {
      console.error('Error submitting report:', error);
      alert('Fehler beim Einreichen des Berichts');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    if (!reportToWithdraw) return;
    
    try {
      await api.entities.WeeklyReport.delete(reportToWithdraw.id);

      // Bestätigungs-E-Mail an Benutzer
      await api.integrations.Core.SendEmail({
        to: user.email,
        subject: 'Wochenbericht erfolgreich zurückgezogen',
        body: `
Hallo ${user.full_name || user.email},

Ihr Wochenbericht wurde erfolgreich zurückgezogen.

Woche: ${format(parseISO(reportToWithdraw.week_start), 'dd.MM.yyyy')}

Mit freundlichen Grüßen
Ihr Leniger Team
        `.trim()
      });

      setWithdrawDialogOpen(false);
      setReportToWithdraw(null);
      await loadData();
    } catch (error) {
      console.error('Error withdrawing report:', error);
      alert('Fehler beim Zurückziehen des Berichts');
    }
  };

  const sendStatusChangeEmail = async (report, newStatus) => {
    const statusLabels = {
      in_pruefung: 'In Prüfung',
      anerkannt: 'Anerkannt',
      abgelehnt: 'Abgelehnt'
    };

    const statusEmojis = {
      anerkannt: '✓',
      abgelehnt: '✗'
    };

    await api.integrations.Core.SendEmail({
      to: user.email,
      subject: `Wochenbericht ${statusLabels[newStatus]} - KW ${format(parseISO(report.week_start), 'I')}`,
      body: `
Hallo ${user.full_name || user.email},

Ihr Wochenbericht wurde geprüft.

Status: ${statusEmojis[newStatus] || ''} ${statusLabels[newStatus]}
Woche: ${format(parseISO(report.week_start), 'dd.MM.yyyy')}
Gesamtstunden: ${report.total_hours?.toFixed(2)}h

${report.review_note ? `Bemerkung: ${report.review_note}` : ''}

Mit freundlichen Grüßen
Ihr Leniger Team
      `.trim()
    });
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      in_pruefung: {
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: AlertCircle,
        text: 'In Prüfung'
      },
      anerkannt: {
        color: 'bg-green-50 text-green-700 border-green-200',
        icon: CheckCircle,
        text: 'Anerkannt'
      },
      abgelehnt: {
        color: 'bg-red-50 text-red-700 border-red-200',
        icon: XCircle,
        text: 'Abgelehnt'
      }
    };
    
    const config = statusConfig[status] || statusConfig.in_pruefung;
    const Icon = config.icon;
    
    return (
      <Badge variant="outline" className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {config.text}
      </Badge>
    );
  };

  const toggleReportExpand = (reportId) => {
    setExpandedReports(prev => ({
      ...prev,
      [reportId]: !prev[reportId]
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const weekDays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-semibold text-gray-900 dark:text-white tracking-tight">
            Wochenberichte
          </h1>
          <p className="text-[15px] text-gray-600 dark:text-gray-400 mt-2">
            {reports.length} Berichte eingereicht
          </p>
        </div>
        <Button 
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" />
          Neuer Wochenbericht
        </Button>
      </div>

      {reports.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-[15px] text-gray-600 dark:text-gray-400 text-center">
              Noch keine Wochenberichte eingereicht
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const isExpanded = expandedReports[report.id];
            
            return (
              <Card key={report.id} className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="pb-3">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg dark:text-white">
                        KW {format(parseISO(report.week_start), 'I', { locale: de })} - {format(parseISO(report.week_start), 'dd.MM.yyyy')}
                      </CardTitle>
                      {report.status === 'in_pruefung' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => {
                            setReportToWithdraw(report);
                            setWithdrawDialogOpen(true);
                          }}
                        >
                          Zurückziehen
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {getStatusBadge(report.status)}
                        <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                          <Clock className="w-4 h-4" />
                          {report.total_hours?.toFixed(2)}h
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(report.submitted_at), 'dd.MM.yyyy')}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleReportExpand(report.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                
                {isExpanded && (
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {report.days?.map((day, idx) => (
                        <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <p className="font-medium text-[#1e3a5f] dark:text-blue-300">
                              {weekDays[idx]} - {format(parseISO(day.date), 'dd.MM.yyyy')}
                            </p>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {day.work_hours?.toFixed(2)}h
                            </span>
                          </div>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                            <p>
                              <strong>Baustelle:</strong> {day.project_name || 'Nicht angegeben'}
                              {day.cost_center_number && ` (${day.cost_center_number})`}
                            </p>
                            <p><strong>Arbeitszeit:</strong> {day.start_time} - {day.end_time} (Pause: {day.break_minutes}min)</p>
                            {day.description && (
                              <p><strong>Tätigkeit:</strong> {day.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      {report.review_note && (
                        <div className={`p-4 rounded-lg ${
                          report.status === 'abgelehnt' 
                            ? 'bg-red-50 dark:bg-red-900/20' 
                            : 'bg-green-50 dark:bg-green-900/20'
                        }`}>
                          <p className="text-sm font-medium mb-1 dark:text-white">Bemerkung:</p>
                          <p className="text-sm dark:text-gray-300">{report.review_note}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Neuer Wochenbericht</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Kalenderwoche</Label>
              <Input
                type="date"
                value={format(weekStart, 'yyyy-MM-dd')}
                onChange={(e) => {
                  const date = new Date(e.target.value);
                  setWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
                }}
              />
              <p className="text-xs text-gray-500">
                Wählen Sie ein Datum, die Woche beginnt automatisch am Montag
              </p>
            </div>

            <div className="space-y-3">
              {days.map((day, index) => (
                <div key={index} className="bg-gray-50 dark:bg-white/5 rounded-2xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {weekDays[index]}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {format(parseISO(day.date), 'dd.MM.yyyy')}
                      </span>
                      <span className="text-sm font-medium text-blue-500">
                        {day.work_hours.toFixed(2)}h
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Baustelle</Label>
                      <select
                        value={day.project_id}
                        onChange={(e) => updateDay(index, 'project_id', e.target.value)}
                        className="w-full h-11 px-4 py-2.5 text-[15px] border border-gray-300 dark:border-white/10 rounded-xl bg-white dark:bg-white/5 text-gray-900 dark:text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Baustelle wählen</option>
                        {projects.sort((a, b) => a.name.localeCompare(b.name)).map(project => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-sm">Beginn</Label>
                        <input
                          type="time"
                          value={day.start_time}
                          onChange={(e) => updateDay(index, 'start_time', e.target.value)}
                          className="w-full h-11 px-3 py-2.5 text-[15px] border border-gray-300 dark:border-white/10 rounded-xl bg-white dark:bg-white/5 text-gray-900 dark:text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Ende</Label>
                        <input
                          type="time"
                          value={day.end_time}
                          onChange={(e) => updateDay(index, 'end_time', e.target.value)}
                          className="w-full h-11 px-3 py-2.5 text-[15px] border border-gray-300 dark:border-white/10 rounded-xl bg-white dark:bg-white/5 text-gray-900 dark:text-white transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm">Pause (Min.)</Label>
                        <Input
                          type="number"
                          value={day.break_minutes}
                          onChange={(e) => updateDay(index, 'break_minutes', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-sm">Tätigkeitsbeschreibung</Label>
                      <Textarea
                        value={day.description}
                        onChange={(e) => updateDay(index, 'description', e.target.value)}
                        placeholder="Was haben Sie an diesem Tag gemacht?"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Card className="border-[#1e3a5f] dark:border-blue-600 bg-blue-50 dark:bg-blue-950">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-[#1e3a5f] dark:text-blue-300">Gesamtstunden der Woche</p>
                  <p className="text-2xl font-bold text-[#1e3a5f] dark:text-blue-300">{getTotalHours().toFixed(2)}h</p>
                </div>
              </CardContent>
            </Card>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={submitting || getTotalHours() === 0}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird eingereicht...' : 'Einreichen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <AlertDialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bericht zurückziehen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diesen Wochenbericht wirklich zurückziehen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleWithdraw} className="bg-red-600 hover:bg-red-700">
              Zurückziehen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </PullToRefresh>
  );
}