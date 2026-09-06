import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  FileText,
  User,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Search,
  Filter,
  Download
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export default function WeeklyReportManagement() {
  const [reports, setReports] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewingReport, setReviewingReport] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedUsers, setExpandedUsers] = useState({});
  const [expandedReports, setExpandedReports] = useState({});
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('alle');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [user, reportsData] = await Promise.all([
        api.auth.me(),
        api.entities.WeeklyReport.list('-created_date')
      ]);
      
      setCurrentUser(user);
      setReports(reportsData);

      // Try to load users, but don't fail if it doesn't work
      try {
        const usersResponse = await api.functions.invoke('listAllUsers', {});
        setUsers(usersResponse.data.users || []);
      } catch (userError) {
        console.warn('Could not load users:', userError);
        setUsers([]);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const groupByUser = () => {
    const grouped = {};
    reports.forEach(report => {
      const userKey = report.user_email;
      if (!grouped[userKey]) {
        const userDetails = users.find(u => u.email === report.user_email);
        grouped[userKey] = {
          email: report.user_email,
          name: report.user_name,
          location: userDetails?.location || null,
          reports: []
        };
      }
      grouped[userKey].reports.push(report);
    });
    
    // Filter by search and location
    return Object.values(grouped).filter(userGroup => {
      const matchesSearch = userGroup.name?.toLowerCase().includes(search.toLowerCase()) ||
                           userGroup.email?.toLowerCase().includes(search.toLowerCase());
      const matchesLocation = locationFilter === 'alle' || userGroup.location === locationFilter;
      return matchesSearch && matchesLocation;
    });
  };

  const handleReview = async (status) => {
    if (!reviewingReport) return;
    
    setSubmitting(true);
    try {
      await api.entities.WeeklyReport.update(reviewingReport.id, {
        status,
        reviewed_by: currentUser?.email,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote.trim() || null
      });
      
      setReviewDialogOpen(false);
      setReviewingReport(null);
      setReviewNote('');
      await loadData();
    } catch (error) {
      console.error('Error reviewing report:', error);
      alert('Fehler beim Prüfen des Berichts');
    } finally {
      setSubmitting(false);
    }
  };

  const openReviewDialog = (report) => {
    setReviewingReport(report);
    setReviewNote(report.review_note || '');
    setReviewDialogOpen(true);
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

  const toggleUserExpand = (userEmail) => {
    setExpandedUsers(prev => ({
      ...prev,
      [userEmail]: !prev[userEmail]
    }));
  };

  const toggleReportExpand = (reportId) => {
    setExpandedReports(prev => ({
      ...prev,
      [reportId]: !prev[reportId]
    }));
  };

  const handleDownloadPDF = async (report) => {
    try {
      const { data } = await api.functions.invoke('downloadWeeklyReport', { reportId: report.id });
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Wochenbericht_${report.user_name}_KW_${format(parseISO(report.week_start), 'dd-MM-yyyy')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error('Error downloading PDF:', error);
      alert('Fehler beim Herunterladen der PDF');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const userGroups = groupByUser();
  const pendingCount = reports.filter(r => r.status === 'in_pruefung').length;
  const weekDays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
          <FileText className="w-8 h-8" />
          Montageberichte
        </h1>
        <p className="text-gray-500 mt-1">
          {reports.length} Berichte • {pendingCount} warten auf Prüfung
        </p>
      </div>

      {pendingCount > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <p className="font-medium text-amber-800">
                {pendingCount} Berichte warten auf Prüfung
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Suchen nach Name oder E-Mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="w-full sm:w-40 h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
          style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
        >
          <option value="alle">Alle Standorte</option>
          <option value="PB">PB</option>
          <option value="EF">EF</option>
        </select>
      </div>

      {userGroups.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-center">
              Noch keine Berichte vorhanden
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {userGroups.map((userGroup) => {
            const isUserExpanded = expandedUsers[userGroup.email];
            const pendingReports = userGroup.reports.filter(r => r.status === 'in_pruefung').length;
            
            return (
              <Card key={userGroup.email} className="border-0 shadow-sm">
                <Collapsible open={isUserExpanded} onOpenChange={() => toggleUserExpand(userGroup.email)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#1e3a5f]/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-[#1e3a5f]" />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{userGroup.name}</CardTitle>
                            <p className="text-sm text-gray-500">{userGroup.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-700">
                              {userGroup.reports.length} Berichte
                            </p>
                            {pendingReports > 0 && (
                              <p className="text-xs text-amber-600">
                                {pendingReports} in Prüfung
                              </p>
                            )}
                          </div>
                          {isUserExpanded ? (
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <CardContent className="pt-0 space-y-3">
                      {userGroup.reports.map((report) => {
                        const isReportExpanded = expandedReports[report.id];
                        
                        return (
                          <Card key={report.id} className="border">
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-medium">
                                      KW {format(parseISO(report.week_start), 'I', { locale: de })} - {format(parseISO(report.week_start), 'dd.MM.yyyy')}
                                    </h3>
                                    {getStatusBadge(report.status)}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-4 h-4" />
                                      {report.total_hours?.toFixed(2)} Stunden
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-4 h-4" />
                                      {format(new Date(report.submitted_at), 'dd.MM.yyyy HH:mm')}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleDownloadPDF(report)}
                                  >
                                    <Download className="w-4 h-4" />
                                  </Button>
                                  {report.status === 'in_pruefung' && (
                                    <Button
                                      size="sm"
                                      onClick={() => openReviewDialog(report)}
                                      className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
                                    >
                                      Prüfen
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleReportExpand(report.id)}
                                  >
                                    {isReportExpanded ? (
                                      <ChevronUp className="w-4 h-4" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            
                            {isReportExpanded && (
                              <CardContent className="pt-0">
                                <div className="space-y-3">
                                  {report.days?.map((day, idx) => (
                                    <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                                      <div className="flex items-center justify-between mb-2">
                                        <p className="font-medium text-[#1e3a5f]">
                                          {weekDays[idx]} - {format(parseISO(day.date), 'dd.MM.yyyy')}
                                        </p>
                                        <span className="text-sm font-medium text-gray-700">
                                          {day.work_hours?.toFixed(2)}h
                                        </span>
                                      </div>
                                      <div className="space-y-1 text-sm text-gray-600">
                                        <p>
                                          <strong>Baustelle:</strong> {day.project_name || 'Nicht angegeben'}
                                        </p>
                                        {day.cost_center_number && (
                                          <p>
                                            <strong>Kostenträger:</strong> {day.cost_center_number}
                                          </p>
                                        )}
                                        <p><strong>Arbeitszeit:</strong> {day.start_time} - {day.end_time} (Pause: {day.break_minutes}min)</p>
                                        {day.description && (
                                          <p><strong>Tätigkeit:</strong> {day.description}</p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                  
                                  {report.review_note && (
                                    <div className={`p-4 rounded-lg ${
                                      report.status === 'abgelehnt' ? 'bg-red-50' : 'bg-green-50'
                                    }`}>
                                      <p className="text-sm font-medium mb-1">Bemerkung:</p>
                                      <p className="text-sm">{report.review_note}</p>
                                      {report.reviewed_by && (
                                        <p className="text-xs text-gray-500 mt-2">
                                          Geprüft von {report.reviewed_by} am {format(new Date(report.reviewed_at), 'dd.MM.yyyy HH:mm')}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Wochenbericht prüfen</DialogTitle>
          </DialogHeader>
          
          {reviewingReport && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="font-medium">{reviewingReport.user_name}</p>
                <p className="text-sm text-gray-500">
                  KW {format(parseISO(reviewingReport.week_start), 'I', { locale: de })} - 
                  {format(parseISO(reviewingReport.week_start), 'dd.MM.yyyy')} • 
                  {reviewingReport.total_hours?.toFixed(2)} Stunden
                </p>
              </div>

              <div className="space-y-3">
                {reviewingReport.days?.map((day, idx) => (
                  <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium text-[#1e3a5f]">
                        {weekDays[idx]} - {format(parseISO(day.date), 'dd.MM.yyyy')}
                      </p>
                      <span className="text-sm font-medium text-gray-700">
                        {day.work_hours?.toFixed(2)}h
                      </span>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p><strong>Baustelle:</strong> {day.project_name || 'Nicht angegeben'}</p>
                      <p><strong>Arbeitszeit:</strong> {day.start_time} - {day.end_time} (Pause: {day.break_minutes}min)</p>
                      {day.description && (
                        <p><strong>Tätigkeit:</strong> {day.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label>Bemerkung (optional)</Label>
                <Textarea
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Fügen Sie eine Bemerkung hinzu..."
                  rows={3}
                />
              </div>
            </div>
          )}
          
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setReviewDialogOpen(false)}
              disabled={submitting}
            >
              Abbrechen
            </Button>
            <Button 
              variant="outline"
              onClick={() => handleReview('abgelehnt')}
              disabled={submitting}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Ablehnen
            </Button>
            <Button 
              onClick={() => handleReview('anerkannt')}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {submitting ? 'Wird gespeichert...' : 'Anerkennen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}