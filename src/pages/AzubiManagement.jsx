import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import ColonnenTab from '@/components/ColonnenTab';
import {
  GraduationCap,
  Plus,
  Search,
  Edit2,
  Trash2,
  UserCheck,
  Check,
  Calendar,
  X,
  Users
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
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
import { toast } from 'sonner';

export default function AzubiManagement() {
  const [activeTab, setActiveTab] = useState('azubi');
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [submitting, setSubmitting] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [savingMentor, setSavingMentor] = useState(null);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    apprentice_year: '',
    school_days: [],
    vacation_periods: [],
    tbz_periods: [],
    exam_periods: [],
    phone: '',
    email: '',
    is_active: true,
    overnight_stay: false,
    overnight_stay_weeks: [],
    has_drivers_license: false,
    has_trailer_license: false,
    is_ef: false,
    is_independent: false,
    early_shift: false,
  });

  const [vacationDialog, setVacationDialog] = useState(false);
  const [vacationForm, setVacationForm] = useState({ start_date: null, end_date: null });
  const [tbzDialog, setTbzDialog] = useState(false);
  const [tbzForm, setTbzForm] = useState({ start_date: null, end_date: null });
  const [examDialog, setExamDialog] = useState(false);
  const [examForm, setExamForm] = useState({ start_date: null, end_date: null });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.entities.Employee.list();
      setEmployees(data);
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const azubis = employees
    .filter(e => e.employee_type === 'azubi')
    .filter(e => !search || e.full_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const yearDiff = (a.apprentice_year || 0) - (b.apprentice_year || 0);
      if (yearDiff !== 0) return yearDiff;
      return (a.full_name || '').localeCompare(b.full_name || '', 'de');
    });

  const monteure = employees
    .filter(e => e.employee_type === 'monteur' && e.is_active !== false && !e.is_ef)
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de'));

  const years = [...new Set(azubis.map(a => a.apprentice_year || 0))].sort((a, b) => a - b);

  const resetForm = () => {
    setForm({
      full_name: '',
      apprentice_year: '',
      school_days: [],
      vacation_periods: [],
      tbz_periods: [],
      exam_periods: [],
      phone: '',
      email: '',
      is_active: true,
      overnight_stay: false,
      overnight_stay_weeks: [],
      has_drivers_license: false,
      has_trailer_license: false,
      is_ef: false,
      is_independent: false,
      early_shift: false,
    });
    setEditingEmployee(null);
  };

  const openEditDialog = (employee) => {
    setEditingEmployee(employee);
    setForm({
      full_name: employee.full_name || '',
      apprentice_year: employee.apprentice_year?.toString() || '',
      school_days: employee.school_days || [],
      vacation_periods: employee.vacation_periods || [],
      tbz_periods: employee.tbz_periods || [],
      exam_periods: employee.exam_periods || [],
      phone: employee.phone || '',
      email: employee.email || '',
      is_active: employee.is_active !== false,
      overnight_stay: employee.overnight_stay || false,
      overnight_stay_weeks: employee.overnight_stay_weeks || [],
      has_drivers_license: employee.has_drivers_license || false,
      has_trailer_license: employee.has_trailer_license || false,
      is_ef: employee.is_ef || false,
      is_independent: employee.is_independent || false,
      early_shift: employee.early_shift || false,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.full_name) return;
    setSubmitting(true);
    try {
      const data = {
        ...form,
        employee_type: 'azubi',
        apprentice_year: form.apprentice_year ? parseInt(form.apprentice_year) : null,
      };
      if (editingEmployee) {
        await api.entities.Employee.update(editingEmployee.id, data);
      } else {
        // Ferien von vorhandenem Azubi übernehmen
        const existingAzubi = employees.find(e => e.employee_type === 'azubi');
        if (existingAzubi && existingAzubi.vacation_periods?.length > 0 && form.vacation_periods.length === 0) {
          data.vacation_periods = existingAzubi.vacation_periods;
        }
        await api.entities.Employee.create(data);
      }

      // Wenn Azubi: vacation_periods auf alle anderen Azubis übertragen
      if (form.vacation_periods.length > 0) {
        const allAzubis = employees.filter(e => e.employee_type === 'azubi' && e.id !== editingEmployee?.id);
        await Promise.all(allAzubis.map(azubi =>
          api.entities.Employee.update(azubi.id, { vacation_periods: form.vacation_periods })
        ));
      }

      setDialogOpen(false);
      resetForm();
      loadData();
      toast.success('Azubi gespeichert');
    } catch (error) {
      console.error('Error saving azubi:', error);
      toast.error('Fehler beim Speichern');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    try {
      await api.entities.Employee.delete(deleteDialog.id);
      setDeleteDialog({ open: false, id: null });
      loadData();
      toast.success('Azubi gelöscht');
    } catch (error) {
      console.error('Error deleting azubi:', error);
    }
  };

  const handleMentorChange = async (azubiId, mentorId) => {
    setSavingMentor(azubiId);
    try {
      const value = mentorId === '__none__' ? null : mentorId;
      await api.entities.Employee.update(azubiId, { mentor_id: value });
      setEmployees(prev => prev.map(e => e.id === azubiId ? { ...e, mentor_id: value } : e));
      toast.success('Betreuer gespeichert');
    } catch {
      toast.error('Fehler beim Speichern');
    } finally {
      setSavingMentor(null);
    }
  };

  const getMentorName = (mentorId) => {
    if (!mentorId) return null;
    return monteure.find(m => m.id === mentorId)?.full_name || null;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
            <Users className="w-8 h-8 dark:text-blue-300" />
            Mitarbeiter Zuordnung
          </h1>
        </div>
        {activeTab === 'azubi' && (
          <Button
            onClick={() => { resetForm(); setDialogOpen(true); }}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Azubi anlegen
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('azubi')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'azubi'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4" />
            Azubi-Betreuung
          </span>
        </button>
        <button
          onClick={() => setActiveTab('kolonnen')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'kolonnen'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <span className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Kolonnen
          </span>
        </button>
      </div>

      {/* Kolonnen Tab */}
      {activeTab === 'kolonnen' && (
        <ColonnenTab employees={employees} />
      )}

      {/* Azubi Tab */}
      {activeTab === 'azubi' && <>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          placeholder="Suchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11"
        />
      </div>

      {/* Azubi list grouped by year */}
      {azubis.length === 0 ? (
        <Card className="border-0 shadow-sm dark:bg-gray-800">
          <CardContent className="py-16 text-center">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">Keine Azubis gefunden</p>
          </CardContent>
        </Card>
      ) : (
        years.map(year => (
          <div key={year}>
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-4 h-4 text-green-600" />
              <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                {year ? `${year}. Lehrjahr` : 'Kein Lehrjahr'}
              </h3>
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                {azubis.filter(a => (a.apprentice_year || 0) === year).length}
              </Badge>
            </div>

            <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-0">
                <div className="divide-y dark:divide-gray-700">
                  {azubis
                    .filter(a => (a.apprentice_year || 0) === year)
                    .map(azubi => {
                      const mentor = getMentorName(azubi.mentor_id);
                      return (
                        <div key={azubi.id} className="flex items-center gap-4 px-4 py-3">
                          {/* Avatar */}
                          <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                              {azubi.full_name?.charAt(0) || '?'}
                            </span>
                          </div>

                          {/* Name + status */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-gray-900 dark:text-white">{azubi.full_name}</p>
                              {azubi.is_active === false && (
                                <Badge variant="outline" className="bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400 text-xs">Inaktiv</Badge>
                              )}
                            </div>
                            {mentor && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                                <UserCheck className="w-3 h-3" />
                                {mentor}
                              </p>
                            )}
                          </div>

                          {/* Mentor select */}
                          <div className="w-44 flex-shrink-0">
                            <Select
                              value={azubi.mentor_id || '__none__'}
                              onValueChange={(val) => handleMentorChange(azubi.id, val)}
                              disabled={savingMentor === azubi.id}
                            >
                              <SelectTrigger className="h-9 text-sm">
                                <SelectValue placeholder="Betreuer wählen..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">— Kein Betreuer —</SelectItem>
                                {monteure.map(m => (
                                  <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-1 flex-shrink-0">
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(azubi)}>
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => setDeleteDialog({ open: true, id: azubi.id })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          </div>
        ))
      )}

      </> /* Ende Azubi Tab */ }

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Azubi bearbeiten' : 'Neuer Azubi'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Vollständiger Name"
              />
            </div>

            <div className="space-y-2">
              <Label>Lehrjahr</Label>
              <Select value={form.apprentice_year} onValueChange={(v) => setForm({ ...form, apprentice_year: v })}>
                <SelectTrigger><SelectValue placeholder="Auswählen..." /></SelectTrigger>
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
                {[{ value: 0, label: 'Mo' }, { value: 1, label: 'Di' }, { value: 2, label: 'Mi' }, { value: 3, label: 'Do' }, { value: 4, label: 'Fr' }].map(day => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={form.school_days.includes(day.value) ? 'default' : 'outline'}
                    className={form.school_days.includes(day.value) ? 'bg-[#1e3a5f] hover:bg-[#1e3a5f]/90' : ''}
                    onClick={() => {
                      const newDays = form.school_days.includes(day.value)
                        ? form.school_days.filter(d => d !== day.value)
                        : [...form.school_days, day.value];
                      setForm({ ...form, school_days: newDays });
                    }}
                  >
                    {form.school_days.includes(day.value) && <Check className="w-3 h-3 mr-1" />}
                    {day.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Ferien */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ferien</Label>
                  <p className="text-xs text-amber-600 font-medium">Gilt für alle Azubis</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => { setVacationForm({ start_date: null, end_date: null }); setVacationDialog(true); }}>
                  <Plus className="w-3 h-3 mr-1" />Hinzufügen
                </Button>
              </div>
              {form.vacation_periods.length > 0 ? (
                <div className="space-y-2">
                  {form.vacation_periods.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-200">
                      <span className="text-sm">{format(new Date(p.start_date), 'd.M.yyyy', { locale: de })} – {format(new Date(p.end_date), 'd.M.yyyy', { locale: de })}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...form, vacation_periods: form.vacation_periods.filter((_, i) => i !== idx) })}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-500">Keine Ferien eingetragen</p>}
            </div>

            {/* TBZ */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>TBZ-Zeiträume</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => { setTbzForm({ start_date: null, end_date: null }); setTbzDialog(true); }}>
                  <Plus className="w-3 h-3 mr-1" />Hinzufügen
                </Button>
              </div>
              {form.tbz_periods.length > 0 ? (
                <div className="space-y-2">
                  {form.tbz_periods.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <span className="text-sm">{format(new Date(p.start_date), 'd.M.yyyy', { locale: de })} – {format(new Date(p.end_date), 'd.M.yyyy', { locale: de })}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...form, tbz_periods: form.tbz_periods.filter((_, i) => i !== idx) })}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-500">Keine TBZ-Zeiträume eingetragen</p>}
            </div>

            {/* Prüfungen */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Prüfungszeiträume</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => { setExamForm({ start_date: null, end_date: null }); setExamDialog(true); }}>
                  <Plus className="w-3 h-3 mr-1" />Hinzufügen
                </Button>
              </div>
              {form.exam_periods?.length > 0 ? (
                <div className="space-y-2">
                  {form.exam_periods.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-purple-50 rounded-lg border border-purple-200">
                      <span className="text-sm">{format(new Date(p.start_date), 'd.M.yyyy', { locale: de })} – {format(new Date(p.end_date), 'd.M.yyyy', { locale: de })}</span>
                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...form, exam_periods: form.exam_periods.filter((_, i) => i !== idx) })}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-500">Keine Prüfungszeiträume eingetragen</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefonnummer" />
              </div>
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-Mail-Adresse" type="email" />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <Label>Aktiv</Label>
                <p className="text-sm text-gray-500">Wird in der Planung angezeigt</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSubmit} disabled={!form.full_name || submitting} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
              {submitting ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vacation Dialog */}
      <Dialog open={vacationDialog} onOpenChange={setVacationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Ferienzeit hinzufügen</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {[
              { label: 'Von', key: 'start_date', state: vacationForm, setter: setVacationForm },
              { label: 'Bis', key: 'end_date', state: vacationForm, setter: setVacationForm },
            ].map(({ label, key }) => (
              <div key={key} className="space-y-2">
                <Label>{label}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="w-4 h-4 mr-2" />
                      {vacationForm[key] ? format(vacationForm[key], 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={vacationForm[key]}
                      onSelect={(date) => setVacationForm({ ...vacationForm, [key]: date })}
                      disabled={key === 'end_date' ? (date) => date < (vacationForm.start_date || new Date()) : undefined}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVacationDialog(false)}>Abbrechen</Button>
            <Button
              onClick={() => {
                if (vacationForm.start_date && vacationForm.end_date) {
                  setForm({ ...form, vacation_periods: [...form.vacation_periods, { start_date: format(vacationForm.start_date, 'yyyy-MM-dd'), end_date: format(vacationForm.end_date, 'yyyy-MM-dd') }] });
                  setVacationDialog(false);
                }
              }}
              disabled={!vacationForm.start_date || !vacationForm.end_date}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TBZ Dialog */}
      <Dialog open={tbzDialog} onOpenChange={setTbzDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>TBZ-Zeitraum hinzufügen</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {['start_date', 'end_date'].map((key) => (
              <div key={key} className="space-y-2">
                <Label>{key === 'start_date' ? 'Von' : 'Bis'}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="w-4 h-4 mr-2" />
                      {tbzForm[key] ? format(tbzForm[key], 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={tbzForm[key]} onSelect={(date) => setTbzForm({ ...tbzForm, [key]: date })} disabled={key === 'end_date' ? (date) => date < (tbzForm.start_date || new Date()) : undefined} />
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTbzDialog(false)}>Abbrechen</Button>
            <Button onClick={() => { if (tbzForm.start_date && tbzForm.end_date) { setForm({ ...form, tbz_periods: [...form.tbz_periods, { start_date: format(tbzForm.start_date, 'yyyy-MM-dd'), end_date: format(tbzForm.end_date, 'yyyy-MM-dd') }] }); setTbzDialog(false); } }} disabled={!tbzForm.start_date || !tbzForm.end_date} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exam Dialog */}
      <Dialog open={examDialog} onOpenChange={setExamDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Prüfungszeitraum hinzufügen</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            {['start_date', 'end_date'].map((key) => (
              <div key={key} className="space-y-2">
                <Label>{key === 'start_date' ? 'Von' : 'Bis'}</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="w-4 h-4 mr-2" />
                      {examForm[key] ? format(examForm[key], 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent mode="single" selected={examForm[key]} onSelect={(date) => setExamForm({ ...examForm, [key]: date })} disabled={key === 'end_date' ? (date) => date < (examForm.start_date || new Date()) : undefined} />
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExamDialog(false)}>Abbrechen</Button>
            <Button onClick={() => { if (examForm.start_date && examForm.end_date) { setForm({ ...form, exam_periods: [...(form.exam_periods || []), { start_date: format(examForm.start_date, 'yyyy-MM-dd'), end_date: format(examForm.end_date, 'yyyy-MM-dd') }] }); setExamDialog(false); } }} disabled={!examForm.start_date || !examForm.end_date} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">Hinzufügen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Azubi löschen?</AlertDialogTitle>
            <AlertDialogDescription>Möchten Sie diesen Azubi wirklich löschen? Bestehende Einsätze bleiben erhalten.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}