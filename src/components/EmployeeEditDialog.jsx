import React, { useState, useEffect } from 'react';
import { format, addWeeks, startOfWeek, getWeek, addDays, isWeekend } from 'date-fns';
import { isPublicHoliday } from '../utils/publicHolidays';
import { de } from 'date-fns/locale';
import { Check, X, Plus, Calendar } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';

export default function EmployeeEditDialog({ open, onOpenChange, employee, onSave, submitting, assignments = [] }) {
  const [form, setForm] = useState(() => ({
    full_name: employee?.full_name || '',
    employee_type: employee?.employee_type || 'monteur',
    abbreviation: employee?.abbreviation || '',
    overnight_stay_weeks: employee?.overnight_stay_weeks || [],
    overnight_stay_days: employee?.overnight_stay_days || [],
    friday_exceptions: employee?.friday_exceptions || [],
    apprentice_year: employee?.apprentice_year?.toString() || '',
    school_days: employee?.school_days || [],
    vacation_periods: employee?.vacation_periods || [],
    tbz_periods: employee?.tbz_periods || [],
    exam_periods: employee?.exam_periods || [],
    phone: employee?.phone || '',
    email: employee?.email || '',
    is_active: employee?.is_active !== false,
    remark: employee?.remark || '',
    is_independent: employee?.is_independent || false,
    has_workshop: employee?.has_workshop || false,
  }));

  React.useEffect(() => {
    if (employee) {
      setForm({
        full_name: employee.full_name || '',
        employee_type: employee.employee_type || 'monteur',
        abbreviation: employee.abbreviation || '',
        overnight_stay_weeks: employee.overnight_stay_weeks || [],
        overnight_stay_days: employee.overnight_stay_days || [],
        friday_exceptions: employee.friday_exceptions || [],
        apprentice_year: employee.apprentice_year?.toString() || '',
        school_days: employee.school_days || [],
        vacation_periods: employee.vacation_periods || [],
        tbz_periods: employee.tbz_periods || [],
        exam_periods: employee.exam_periods || [],
        phone: employee.phone || '',
        email: employee.email || '',
        is_active: employee.is_active !== false,
        remark: employee.remark || '',
        is_independent: employee.is_independent || false,
        has_workshop: employee.has_workshop || false,
      });
    }
  }, [employee?.id]);

  const [vacationDialog, setVacationDialog] = useState(false);
  const [vacationForm, setVacationForm] = useState({ start_date: null, end_date: null });
  const [tbzDialog, setTbzDialog] = useState(false);
  const [tbzForm, setTbzForm] = useState({ start_date: null, end_date: null });
  const [examDialog, setExamDialog] = useState(false);
  const [examForm, setExamForm] = useState({ start_date: null, end_date: null });

  const handleSubmit = () => {
    onSave(form);
  };

  // Urlaubs- und Kranktage im aktuellen Jahr zählen (nur Arbeitstage: kein WE, kein Feiertag)
  const currentYear = new Date().getFullYear();
  const yearPrefix = `${currentYear}-`;
  const isWorkday = (dateStr) => {
    const d = new Date(dateStr);
    return !isWeekend(d) && !isPublicHoliday(d, 'NRW');
  };
  const vacationDays = employee ? assignments.filter(a =>
    a.employee_id === employee.id &&
    a.assignment_type === 'urlaub' &&
    a.date?.startsWith(yearPrefix) &&
    isWorkday(a.date)
  ).length : 0;
  const sickDays = employee ? assignments.filter(a =>
    a.employee_id === employee.id &&
    a.assignment_type === 'krank' &&
    a.date?.startsWith(yearPrefix) &&
    isWorkday(a.date)
  ).length : 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Mitarbeiter bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Vollständiger Name" />
            </div>

            <div className="space-y-2">
              <Label>Typ *</Label>
              <Select value={form.employee_type} onValueChange={(value) => setForm({ ...form, employee_type: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="projektleiter">Projektleiter</SelectItem>
                  <SelectItem value="monteur">Monteur</SelectItem>
                  <SelectItem value="azubi">Azubi</SelectItem>
                  <SelectItem value="praktikant">Praktikant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.employee_type === 'projektleiter' && (
              <div className="space-y-2">
                <Label>Kürzel</Label>
                <Input value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })} placeholder="z.B. MÜ, SCH" maxLength={4} />
              </div>
            )}

            {form.employee_type === 'azubi' && (
              <>
                <div className="space-y-2">
                  <Label>Lehrjahr</Label>
                  <Select value={form.apprentice_year} onValueChange={(value) => setForm({ ...form, apprentice_year: value })}>
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
                      <Button key={day.value} type="button" variant={form.school_days.includes(day.value) ? 'default' : 'outline'}
                        className={form.school_days.includes(day.value) ? 'bg-[#1e3a5f] hover:bg-[#1e3a5f]/90' : ''}
                        onClick={() => {
                          const newDays = form.school_days.includes(day.value)
                            ? form.school_days.filter(d => d !== day.value)
                            : [...form.school_days, day.value];
                          setForm({ ...form, school_days: newDays });
                        }}>
                        {form.school_days.includes(day.value) && <Check className="w-3 h-3 mr-1" />}
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Ferien */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Ferien</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => { setVacationForm({ start_date: null, end_date: null }); setVacationDialog(true); }}>
                      <Plus className="w-3 h-3 mr-1" />Hinzufügen
                    </Button>
                  </div>
                  {form.vacation_periods.length > 0 ? (
                    <div className="space-y-2">
                      {form.vacation_periods.map((period, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-200">
                          <span className="text-sm">{format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}</span>
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
                      {form.tbz_periods.map((period, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
                          <span className="text-sm">{format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}</span>
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
                  {(form.exam_periods || []).length > 0 ? (
                    <div className="space-y-2">
                      {form.exam_periods.map((period, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-purple-50 rounded-lg border border-purple-200">
                          <span className="text-sm">{format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}</span>
                          <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setForm({ ...form, exam_periods: form.exam_periods.filter((_, i) => i !== idx) })}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-xs text-gray-500">Keine Prüfungszeiträume eingetragen</p>}
                </div>
              </>
            )}

            {form.employee_type === 'monteur' && (
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                <div>
                  <Label className="text-blue-800">Werkstatt</Label>
                  <p className="text-sm text-blue-600">Mitarbeiter arbeitet in der Werkstatt</p>
                </div>
                <Switch checked={form.has_workshop} onCheckedChange={(checked) => setForm({ ...form, has_workshop: checked })} />
              </div>
            )}

            {/* Übernachtung per KW */}
            {(form.employee_type === 'monteur' || form.employee_type === 'azubi' || form.employee_type === 'praktikant') && (
              <div className="p-4 bg-red-50 rounded-xl space-y-3">
                <Label className="text-red-700">Übernachtung (KW auswählen)</Label>
                <p className="text-xs text-red-600">KW aktivieren, dann Montage-Tage wählen. Wenn Mo–Do gewählt: optional Fr. arbeitet aktivieren.</p>
                <div className="space-y-3 mt-2">
                  {Array.from({ length: 5 }, (_, i) => {
                    const mon = startOfWeek(addWeeks(new Date(), i), { weekStartsOn: 1 });
                    const monStr = format(mon, 'yyyy-MM-dd');
                    const fri = addDays(mon, 4);
                    const friStr = format(fri, 'yyyy-MM-dd');
                    const kw = getWeek(mon);
                    const isSelected = (form.overnight_stay_weeks || []).includes(monStr);

                    const kwDaysEntry = (form.overnight_stay_days || []).find(e => e.week_start === monStr);
                    const selectedDays = kwDaysEntry ? kwDaysEntry.days : [];
                    const hasFridayException = (form.friday_exceptions || []).includes(friStr);
                    const hasMoToDo = [0,1,2,3].every(d => selectedDays.includes(d));
                    const fridaySelected = selectedDays.includes(4);

                    const mondayOfWeekIsHoliday = isPublicHoliday(mon, 'NRW');
                    const toggleKW = () => {
                      const current = form.overnight_stay_weeks || [];
                      if (isSelected) {
                        // Deaktivieren: KW, Tage und Fr-Ausnahme entfernen
                        setForm({
                          ...form,
                          overnight_stay_weeks: current.filter(d => d !== monStr),
                          overnight_stay_days: (form.overnight_stay_days || []).filter(e => e.week_start !== monStr),
                          friday_exceptions: (form.friday_exceptions || []).filter(d => d !== friStr),
                        });
                      } else {
                        // Aktivieren: KW hinzufügen + Standardtage setzen
                        // Mo Feiertag → Di-Fr (1,2,3,4), sonst → Mo-Do (0,1,2,3)
                        const defaultDays = mondayOfWeekIsHoliday ? [1, 2, 3, 4] : [0, 1, 2, 3];
                        const existingDays = form.overnight_stay_days || [];
                        const alreadyHasEntry = existingDays.some(e => e.week_start === monStr);
                        const updatedDays = alreadyHasEntry
                          ? existingDays.map(e => e.week_start === monStr ? { ...e, days: defaultDays } : e)
                          : [...existingDays, { week_start: monStr, days: defaultDays }];
                        setForm({
                          ...form,
                          overnight_stay_weeks: [...current, monStr],
                          overnight_stay_days: updatedDays,
                        });
                      }
                    };

                    const toggleDay = (dayIdx) => {
                      const current = form.overnight_stay_days || [];
                      const existingEntry = current.find(e => e.week_start === monStr);
                      let newDays;
                      if (existingEntry) {
                        newDays = existingEntry.days.includes(dayIdx)
                          ? existingEntry.days.filter(d => d !== dayIdx)
                          : [...existingEntry.days, dayIdx].sort();
                      } else {
                        newDays = [dayIdx];
                      }
                      const updated = existingEntry
                        ? current.map(e => e.week_start === monStr ? { ...e, days: newDays } : e)
                        : [...current, { week_start: monStr, days: newDays }];
                      const updatedFriExc = dayIdx === 4 && existingEntry?.days.includes(4)
                        ? (form.friday_exceptions || []).filter(d => d !== friStr)
                        : form.friday_exceptions || [];
                      setForm({ ...form, overnight_stay_days: updated, friday_exceptions: updatedFriExc });
                    };

                    const dayLabels = ['Mo', 'Di', 'Mi', 'Do', 'Fr'];

                    return (
                      <div key={monStr} className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            type="button"
                            onClick={toggleKW}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors min-w-[72px] ${
                              isSelected
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                            }`}
                          >
                            KW {kw}
                          </button>

                          {isSelected && (
                            <div className="flex items-center gap-1.5">
                              {dayLabels.map((label, dayIdx) => {
                                const isActive = selectedDays.includes(dayIdx);
                                return (
                                  <button
                                    key={dayIdx}
                                    type="button"
                                    onClick={() => toggleDay(dayIdx)}
                                    className={`w-9 h-9 rounded-full text-xs font-semibold border-2 transition-all ${
                                      isActive
                                        ? 'bg-red-600 text-white border-red-600'
                                        : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {isSelected && hasMoToDo && !fridaySelected && (
                          <div className="ml-[84px]">
                            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={hasFridayException}
                                onChange={(e) => {
                                  const current = form.friday_exceptions || [];
                                  const updated = e.target.checked
                                    ? [...current, friStr]
                                    : current.filter(d => d !== friStr);
                                  setForm({ ...form, friday_exceptions: updated });
                                }}
                                className="w-4 h-4 accent-green-600"
                              />
                              <span className="text-green-700 font-medium">Fr. arbeitet ({format(fri, 'd.M.')})</span>
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

            <div className="space-y-2">
              <Label>Bemerkung</Label>
              <Input value={form.remark} onChange={(e) => setForm({ ...form, remark: e.target.value })} placeholder="z.B. Führerschein, Zertifikat, etc." />
            </div>

            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl">
              <div>
                <Label className="text-purple-800">Eigenständig</Label>
                <p className="text-sm text-purple-600">Wird lila in der Wocheneinteilung angezeigt</p>
              </div>
              <Switch checked={form.is_independent} onCheckedChange={(checked) => setForm({ ...form, is_independent: checked })} />
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <Label>Aktiv</Label>
                <p className="text-sm text-gray-500">Mitarbeiter wird in der Planung angezeigt</p>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mr-auto">
              <span className="font-medium">U: <span className="text-blue-600 dark:text-blue-400 font-semibold">{vacationDays}</span></span>
              <span className="font-medium">K: <span className="text-red-600 dark:text-red-400 font-semibold">{sickDays}</span></span>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
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
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {[['Von', 'start_date', vacationForm, setVacationForm], ['Bis', 'end_date', vacationForm, setVacationForm]].map(([lbl, field, frm, setFrm]) => (
                <div key={field} className="space-y-2">
                  <Label>{lbl}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <Calendar className="w-4 h-4 mr-2" />
                        {frm[field] ? format(frm[field], 'd.M.yyyy') : 'Datum wählen'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={frm[field]} onSelect={(date) => setFrm({ ...frm, [field]: date })} />
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVacationDialog(false)}>Abbrechen</Button>
            <Button onClick={() => {
              if (vacationForm.start_date && vacationForm.end_date) {
                setForm({ ...form, vacation_periods: [...form.vacation_periods, { start_date: format(vacationForm.start_date, 'yyyy-MM-dd'), end_date: format(vacationForm.end_date, 'yyyy-MM-dd') }] });
                setVacationDialog(false);
              }
            }} disabled={!vacationForm.start_date || !vacationForm.end_date} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TBZ Dialog */}
      <Dialog open={tbzDialog} onOpenChange={setTbzDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>TBZ-Zeitraum hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {[['Von', 'start_date'], ['Bis', 'end_date']].map(([lbl, field]) => (
                <div key={field} className="space-y-2">
                  <Label>{lbl}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <Calendar className="w-4 h-4 mr-2" />
                        {tbzForm[field] ? format(tbzForm[field], 'd.M.yyyy') : 'Datum wählen'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={tbzForm[field]} onSelect={(date) => setTbzForm({ ...tbzForm, [field]: date })} />
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTbzDialog(false)}>Abbrechen</Button>
            <Button onClick={() => {
              if (tbzForm.start_date && tbzForm.end_date) {
                setForm({ ...form, tbz_periods: [...form.tbz_periods, { start_date: format(tbzForm.start_date, 'yyyy-MM-dd'), end_date: format(tbzForm.end_date, 'yyyy-MM-dd') }] });
                setTbzDialog(false);
              }
            }} disabled={!tbzForm.start_date || !tbzForm.end_date} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exam Dialog */}
      <Dialog open={examDialog} onOpenChange={setExamDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Prüfungszeitraum hinzufügen</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              {[['Von', 'start_date'], ['Bis', 'end_date']].map(([lbl, field]) => (
                <div key={field} className="space-y-2">
                  <Label>{lbl}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <Calendar className="w-4 h-4 mr-2" />
                        {examForm[field] ? format(examForm[field], 'd.M.yyyy') : 'Datum wählen'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent mode="single" selected={examForm[field]} onSelect={(date) => setExamForm({ ...examForm, [field]: date })} />
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExamDialog(false)}>Abbrechen</Button>
            <Button onClick={() => {
              if (examForm.start_date && examForm.end_date) {
                setForm({ ...form, exam_periods: [...(form.exam_periods || []), { start_date: format(examForm.start_date, 'yyyy-MM-dd'), end_date: format(examForm.end_date, 'yyyy-MM-dd') }] });
                setExamDialog(false);
              }
            }} disabled={!examForm.start_date || !examForm.end_date} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}