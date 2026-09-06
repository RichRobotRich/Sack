import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Trash2,
  Moon,
  GraduationCap,
  Briefcase,
  Filter,
  Check,
  Calendar,
  X,
  Zap
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MobileSelect from '../components/MobileSelect';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, addWeeks, startOfWeek, getWeek } from 'date-fns';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [submitting, setSubmitting] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('alle');

  const [form, setForm] = useState({
    full_name: '',
    employee_type: 'monteur',
    abbreviation: '',
    overnight_stay: false,
    overnight_stay_weeks: [],
    has_drivers_license: false,
    has_trailer_license: false,
    apprentice_year: '',
    school_days: [],
    vacation_periods: [],
    tbz_periods: [],
    exam_periods: [],
    phone: '',
    email: '',
    is_active: true,
    is_ef: false,
    is_independent: false,
    early_shift: false,
    has_workshop: false,
    always_own_vehicle: false
  });
  const [vacationDialog, setVacationDialog] = useState(false);
  const [vacationForm, setVacationForm] = useState({ start_date: null, end_date: null });
  const [tbzDialog, setTbzDialog] = useState(false);
  const [tbzForm, setTbzForm] = useState({ start_date: null, end_date: null });
  const [examDialog, setExamDialog] = useState(false);
  const [examForm, setExamForm] = useState({ start_date: null, end_date: null });
  const [duplicateDialog, setDuplicateDialog] = useState({ open: false, similar: [], pendingData: null });

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

  const filteredEmployees = employees
    .filter(emp => {
      const matchesSearch = emp.full_name?.toLowerCase().includes(search.toLowerCase()) ||
                            emp.email?.toLowerCase().includes(search.toLowerCase());
      
      let matchesType = true;
      if (typeFilter === 'monteur_ef') {
        matchesType = emp.employee_type === 'monteur' && emp.is_ef === true;
      } else if (typeFilter === 'monteur') {
        matchesType = emp.employee_type === 'monteur' && emp.is_ef !== true;
      } else if (typeFilter !== 'alle') {
        matchesType = emp.employee_type === typeFilter;
      }
      
      return matchesSearch && matchesType;
    })
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  // Prüft auf ähnliche Mitarbeiternamen
  const findSimilarEmployees = (name) => {
    if (!name || name.trim().length < 3) return [];
    
    const input = name.trim().toLowerCase();
    const inputWords = input.split(/\s+/).filter(w => w.length > 1);
    
    return employees.filter(emp => {
      const existing = (emp.full_name || '').toLowerCase();
      if (!existing) return false;

      // Exakte Übereinstimmung
      if (existing === input) return true;

      // Der neue Name ist komplett im bestehenden enthalten oder umgekehrt
      if (existing.includes(input) || input.includes(existing)) return true;

      // Wort-basierte Ähnlichkeit: mindestens 2 Wörter stimmen überein
      const existingWords = existing.split(/\s+/).filter(w => w.length > 1);
      const matchingWords = inputWords.filter(w => existingWords.some(ew => ew.includes(w) || w.includes(ew)));
      if (matchingWords.length >= 2 && inputWords.length > 0) return true;

      // Ein Wort matcht, wenn es mehr als 3 Zeichen hat und in beiden Namen vorkommt
      if (inputWords.length === 1 && existingWords.length >= 1) {
        const word = inputWords[0];
        if (word.length >= 5 && existingWords.some(ew => ew.includes(word) || word.includes(ew))) return true;
      }

      return false;
    });
  };

  const handleSubmit = async () => {
    if (!form.full_name || !form.employee_type) return;
    
    // Bei Neuanlage: auf ähnliche Namen prüfen
    if (!editingEmployee) {
      const similar = findSimilarEmployees(form.full_name);
      if (similar.length > 0) {
        setDuplicateDialog({
          open: true,
          similar,
          pendingData: { ...form }
        });
        return;
      }
    }
    
    await doSubmit();
  };

  const doSubmit = async () => {
    setSubmitting(true);
    try {
      const data = {
        ...form,
        apprentice_year: form.apprentice_year ? parseInt(form.apprentice_year) : null
      };
      
      if (editingEmployee) {
        await api.entities.Employee.update(editingEmployee.id, data);
      } else {
        await api.entities.Employee.create(data);
      }

      // Wenn Azubi: vacation_periods auf alle anderen Azubis übertragen
      if (form.employee_type === 'azubi') {
        const allAzubis = employees.filter(
          e => e.employee_type === 'azubi' && e.id !== editingEmployee?.id
        );
        await Promise.all(
          allAzubis.map(azubi =>
            api.entities.Employee.update(azubi.id, { vacation_periods: form.vacation_periods })
          )
        );
      }
      
      setDialogOpen(false);
      setDuplicateDialog({ open: false, similar: [], pendingData: null });
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving employee:', error);
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
    } catch (error) {
      console.error('Error deleting employee:', error);
    }
  };

  const resetForm = () => {
    setForm({
      full_name: '',
      employee_type: 'monteur',
      abbreviation: '',
      overnight_stay: false,
      overnight_stay_weeks: [],
      has_drivers_license: false,
      has_trailer_license: false,
      apprentice_year: '',
      school_days: [],
      vacation_periods: [],
      tbz_periods: [],
      exam_periods: [],
      phone: '',
      email: '',
      is_active: true,
      is_ef: false,
      is_independent: false,
      early_shift: false,
      has_workshop: false,
      always_own_vehicle: false
      });
      setEditingEmployee(null);
      };

  const openEditDialog = (employee) => {
    setEditingEmployee(employee);
    setForm({
      full_name: employee.full_name || '',
      employee_type: employee.employee_type || 'monteur',
      abbreviation: employee.abbreviation || '',
      overnight_stay: employee.overnight_stay || false,
      overnight_stay_weeks: employee.overnight_stay_weeks || [],
      has_drivers_license: employee.has_drivers_license || false,
      has_trailer_license: employee.has_trailer_license || false,
      apprentice_year: employee.apprentice_year?.toString() || '',
      school_days: employee.school_days || [],
      vacation_periods: employee.vacation_periods || [],
      tbz_periods: employee.tbz_periods || [],
      exam_periods: employee.exam_periods || [],
      phone: employee.phone || '',
      email: employee.email || '',
      is_active: employee.is_active !== false,
      is_ef: employee.is_ef || false,
      is_independent: employee.is_independent || false,
      early_shift: employee.early_shift || false,
      has_workshop: employee.has_workshop || false,
      always_own_vehicle: employee.always_own_vehicle || false
    });
    setDialogOpen(true);
  };

  const getTypeBadge = (type) => {
    const config = {
      projektleiter: { class: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Projektleiter', icon: Briefcase },
      monteur: { class: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Monteur', icon: Users },
      azubi: { class: 'bg-green-100 text-green-700 border-green-200', label: 'Azubi', icon: GraduationCap },
      praktikant: { class: 'bg-emerald-100 text-emerald-700 border-emerald-200', label: 'Praktikant', icon: Users },
      buerokraft: { class: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Bürokraft', icon: Briefcase },
      lagerist: { class: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Lagerist', icon: Briefcase }
    };
    const { class: className, label, icon: Icon } = config[type] || config.monteur;
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
            Mitarbeiterverwaltung
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {employees.length} Mitarbeiter
          </p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Mitarbeiter anlegen
        </Button>
      </div>

      <div className="space-y-4">

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full sm:w-40 h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
          style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
        >
          <option value="alle">Alle Typen</option>
          <option value="projektleiter">Projektleiter</option>
          <option value="monteur">Monteure PB</option>
          <option value="monteur_ef">Monteure EF</option>
          <option value="azubi">Azubis</option>
          <option value="praktikant">Praktikanten</option>
          <option value="buerokraft">Bürokräfte</option>
          <option value="lagerist">Lageristen</option>
        </select>
      </div>

      {/* Mobile Card List */}
      <div className="lg:hidden space-y-3">
        {filteredEmployees.length === 0 ? (
          <Card className="border-0 shadow-sm dark:bg-gray-800">
            <CardContent className="py-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400">Keine Mitarbeiter gefunden</p>
            </CardContent>
          </Card>
        ) : (
          filteredEmployees.map((employee) => (
            <Card key={employee.id} className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{employee.full_name}</h3>
                    {employee.employee_type === 'projektleiter' && employee.abbreviation && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Kürzel: {employee.abbreviation}</p>
                    )}
                    {employee.employee_type === 'azubi' && employee.apprentice_year && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">{employee.apprentice_year}. Lehrjahr</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(employee)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setDeleteDialog({ open: true, id: employee.id })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getTypeBadge(employee.employee_type)}
                    {employee.is_active !== false ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">Aktiv</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Inaktiv</Badge>
                    )}
                    {employee.overnight_stay && (
                      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400">
                        <Moon className="w-3 h-3 mr-1" />
                        Übernachtung
                      </Badge>
                    )}
                    {employee.is_ef && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                        <Zap className="w-3 h-3 mr-1" />
                        EF
                      </Badge>
                    )}
                  </div>
                  {(employee.phone || employee.email) && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 space-y-0.5">
                      {employee.phone && <p>{employee.phone}</p>}
                      {employee.email && <p>{employee.email}</p>}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <Card className="hidden lg:block border-0 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900">
              <TableHead className="dark:text-gray-300">Name</TableHead>
              <TableHead className="dark:text-gray-300">Typ</TableHead>
              <TableHead className="dark:text-gray-300">Kürzel / Lehrjahr</TableHead>
              <TableHead className="text-center dark:text-gray-300">Übernachtung</TableHead>
              <TableHead className="dark:text-gray-300">Kontakt</TableHead>
              <TableHead className="dark:text-gray-300">Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Keine Mitarbeiter gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((employee) => (
                <TableRow key={employee.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <TableCell className="font-medium dark:text-white">{employee.full_name}</TableCell>
                  <TableCell>{getTypeBadge(employee.employee_type)}</TableCell>
                  <TableCell className="dark:text-gray-300">
                    {employee.employee_type === 'projektleiter' && employee.abbreviation}
                    {employee.employee_type === 'azubi' && employee.apprentice_year && `${employee.apprentice_year}. Lehrjahr`}
                    {employee.employee_type === 'monteur' && '-'}
                  </TableCell>
                  <TableCell className="text-center">
                    {employee.overnight_stay ? (
                      <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400">
                        <Moon className="w-3 h-3 mr-1" />
                        Ja
                      </Badge>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm dark:text-gray-300">
                      {employee.phone && <p>{employee.phone}</p>}
                      {employee.email && <p className="text-gray-500 dark:text-gray-400">{employee.email}</p>}
                      {!employee.phone && !employee.email && <span className="text-gray-400 dark:text-gray-500">-</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {employee.is_active !== false ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">Aktiv</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Inaktiv</Badge>
                      )}
                      {employee.is_ef && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">
                          <Zap className="w-3 h-3 mr-1" />
                          EF
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(employee)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeleteDialog({ open: true, id: employee.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto flex-1 pr-1">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({...form, full_name: e.target.value})}
                placeholder="Vollständiger Name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Typ *</Label>
              <Select
                value={form.employee_type}
                onValueChange={(value) => {
                  const autoEarlyShift = value === 'projektleiter' && !form.is_ef;
                  setForm({...form, employee_type: value, early_shift: autoEarlyShift});
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                 <SelectItem value="projektleiter">Projektleiter</SelectItem>
                 <SelectItem value="monteur">Monteur</SelectItem>
                 <SelectItem value="azubi">Azubi</SelectItem>
                 <SelectItem value="praktikant">Praktikant</SelectItem>
                 <SelectItem value="buerokraft">Bürokraft</SelectItem>
                 <SelectItem value="lagerist">Lagerist</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.employee_type === 'projektleiter' && (
              <div className="space-y-2">
                <Label>Kürzel</Label>
                <Input
                  value={form.abbreviation}
                  onChange={(e) => setForm({...form, abbreviation: e.target.value})}
                  placeholder="z.B. MÜ, SCH"
                  maxLength={4}
                />
              </div>
            )}

            {form.employee_type === 'azubi' && (
              <>
                <div className="space-y-2">
                  <Label>Lehrjahr</Label>
                  <Select
                    value={form.apprentice_year}
                    onValueChange={(value) => setForm({...form, apprentice_year: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auswählen..." />
                    </SelectTrigger>
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
                    {[
                      { value: 0, label: 'Mo' },
                      { value: 1, label: 'Di' },
                      { value: 2, label: 'Mi' },
                      { value: 3, label: 'Do' },
                      { value: 4, label: 'Fr' }
                    ].map(day => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={form.school_days.includes(day.value) ? 'default' : 'outline'}
                        className={form.school_days.includes(day.value) ? 'bg-[#1e3a5f] hover:bg-[#1e3a5f]/90' : ''}
                        onClick={() => {
                          const newDays = form.school_days.includes(day.value)
                            ? form.school_days.filter(d => d !== day.value)
                            : [...form.school_days, day.value];
                          setForm({...form, school_days: newDays});
                        }}
                      >
                        {form.school_days.includes(day.value) && <Check className="w-3 h-3 mr-1" />}
                        {day.label}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500">
                    Azubis werden automatisch an diesen Tagen in die Berufsschule-Zeile eingeplant
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ferien</Label>
                      <p className="text-xs text-amber-600 font-medium">Gilt für alle Azubis</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setVacationForm({ start_date: null, end_date: null });
                        setVacationDialog(true);
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Hinzufügen
                    </Button>
                  </div>
                  {form.vacation_periods.length > 0 ? (
                    <div className="space-y-2">
                      {form.vacation_periods.map((period, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-amber-50 rounded-lg border border-amber-200">
                          <span className="text-sm">
                            {format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              const newPeriods = form.vacation_periods.filter((_, i) => i !== idx);
                              setForm({...form, vacation_periods: newPeriods});
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Keine Ferien eingetragen</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>TBZ-Zeiträume</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setTbzForm({ start_date: null, end_date: null });
                        setTbzDialog(true);
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Hinzufügen
                    </Button>
                  </div>
                  {form.tbz_periods.length > 0 ? (
                    <div className="space-y-2">
                      {form.tbz_periods.map((period, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded-lg border border-blue-200">
                          <span className="text-sm">
                            {format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              const newPeriods = form.tbz_periods.filter((_, i) => i !== idx);
                              setForm({...form, tbz_periods: newPeriods});
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Keine TBZ-Zeiträume eingetragen</p>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Prüfungszeiträume</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setExamForm({ start_date: null, end_date: null });
                        setExamDialog(true);
                      }}
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Hinzufügen
                    </Button>
                  </div>
                  {form.exam_periods?.length > 0 ? (
                    <div className="space-y-2">
                      {form.exam_periods.map((period, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-purple-50 rounded-lg border border-purple-200">
                          <span className="text-sm">
                            {format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => {
                              const newPeriods = form.exam_periods.filter((_, i) => i !== idx);
                              setForm({...form, exam_periods: newPeriods});
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-500">Keine Prüfungszeiträume eingetragen</p>
                  )}
                </div>
              </>
            )}

            {(form.employee_type === 'monteur' || form.employee_type === 'azubi' || form.employee_type === 'praktikant') && (
              <div className="p-4 bg-red-50 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-red-700">Übernachtung (dauerhaft)</Label>
                    <p className="text-sm text-red-600">Immer auf Baustelle übernachtend (Mo–Do)</p>
                  </div>
                  <Switch
                    checked={form.overnight_stay}
                    onCheckedChange={(checked) => setForm({...form, overnight_stay: checked})}
                  />
                </div>
                {!form.overnight_stay && (
                  <div className="space-y-2">
                    <Label className="text-red-700 text-xs">Übernachtung nur in bestimmten KW:</Label>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: 6 }, (_, i) => {
                        const mon = startOfWeek(addWeeks(new Date(), i), { weekStartsOn: 1 });
                        const monStr = format(mon, 'yyyy-MM-dd');
                        const kw = getWeek(mon);
                        const isSelected = (form.overnight_stay_weeks || []).includes(monStr);
                        return (
                          <button
                            key={monStr}
                            type="button"
                            onClick={() => {
                              const current = form.overnight_stay_weeks || [];
                              const updated = isSelected
                                ? current.filter(d => d !== monStr)
                                : [...current, monStr];
                              setForm({ ...form, overnight_stay_weeks: updated });
                            }}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                              isSelected
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                            }`}
                          >
                            KW {kw}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Telefon</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({...form, phone: e.target.value})}
                  placeholder="Telefonnummer"
                />
              </div>
              <div className="space-y-2">
                <Label>E-Mail</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  placeholder="E-Mail-Adresse"
                  type="email"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                <div>
                  <Label className="text-green-700">Führerschein</Label>
                  <p className="text-xs text-green-600">Klasse B</p>
                </div>
                <Switch
                  checked={form.has_drivers_license}
                  onCheckedChange={(checked) => setForm({...form, has_drivers_license: checked})}
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                <div>
                  <Label className="text-green-700">Anhänger-FS</Label>
                  <p className="text-xs text-green-600">BE / CE</p>
                </div>
                <Switch
                  checked={form.has_trailer_license}
                  onCheckedChange={(checked) => setForm({...form, has_trailer_license: checked})}
                />
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
              <div>
                <Label className="text-blue-700">EF Mitarbeiter</Label>
                <p className="text-sm text-blue-600">Mitarbeiter ist als EF gekennzeichnet</p>
              </div>
              <Switch
                checked={form.is_ef}
                onCheckedChange={(checked) => {
                  const autoEarlyShift = form.employee_type === 'projektleiter' && !checked;
                  setForm({...form, is_ef: checked, early_shift: autoEarlyShift ? true : (checked ? false : form.early_shift)});
                }}
              />
            </div>

            {form.employee_type === 'monteur' && (
              <>
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
                  <div>
                    <Label className="text-blue-800">Werkstatt</Label>
                    <p className="text-sm text-blue-600">Mitarbeiter arbeitet in der Werkstatt</p>
                  </div>
                  <Switch
                    checked={form.has_workshop}
                    onCheckedChange={(checked) => setForm({...form, has_workshop: checked})}
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl">
                  <div>
                    <Label className="text-purple-800">Eigenständig</Label>
                    <p className="text-sm text-purple-600">Wird lila in der Wocheneinteilung angezeigt</p>
                  </div>
                  <Switch
                    checked={form.is_independent}
                    onCheckedChange={(checked) => setForm({...form, is_independent: checked})}
                  />
                </div>
                <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl">
                  <div>
                    <Label className="text-orange-800">Eigenfahrer / Kolonne</Label>
                    <p className="text-sm text-orange-600">Fährt immer mit eigenem Fahrzeug – wird automatisch auf die Baustelle gesetzt</p>
                  </div>
                  <Switch
                    checked={form.always_own_vehicle}
                    onCheckedChange={(checked) => setForm({...form, always_own_vehicle: checked})}
                  />
                </div>
              </>
            )}

            {(form.employee_type === 'projektleiter' || form.employee_type === 'buerokraft') && (
              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl">
                <div>
                  <Label className="text-yellow-800">Frühschicht</Label>
                  <p className="text-sm text-yellow-600">Wird in der Frühschicht-Jahresübersicht angezeigt</p>
                </div>
                <Switch
                  checked={form.early_shift}
                  onCheckedChange={(checked) => setForm({...form, early_shift: checked})}
                />
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <Label>Aktiv</Label>
                <p className="text-sm text-gray-500">Mitarbeiter wird in der Planung angezeigt</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({...form, is_active: checked})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.full_name || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={duplicateDialog.open} onOpenChange={(open) => {
        if (!open) setDuplicateDialog({ open: false, similar: [], pendingData: null });
      }}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <Users className="w-5 h-5" />
              Ähnliche Mitarbeiter gefunden
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Der Name <strong>"{duplicateDialog.pendingData?.full_name}"</strong> ähnelt folgenden existierenden Mitarbeitern:</p>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 max-h-48 overflow-y-auto">
                <ul className="space-y-1.5">
                  {duplicateDialog.similar.map((emp) => (
                    <li key={emp.id} className="text-sm text-gray-800 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="font-medium">{emp.full_name}</span>
                      <span className="text-gray-500 text-xs">- {emp.employee_type}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm">Möchten Sie den Mitarbeiter trotzdem anlegen?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateDialog({ open: false, similar: [], pendingData: null })}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={doSubmit} className="bg-amber-600 hover:bg-amber-700">
              Trotzdem anlegen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mitarbeiter löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diesen Mitarbeiter wirklich löschen? Bestehende Einsätze bleiben erhalten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vacation Period Dialog */}
      <Dialog open={vacationDialog} onOpenChange={setVacationDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ferienzeit hinzufügen</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Von</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {vacationForm.start_date ? format(vacationForm.start_date, 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={vacationForm.start_date}
                      onSelect={(date) => setVacationForm({...vacationForm, start_date: date})}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label>Bis</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {vacationForm.end_date ? format(vacationForm.end_date, 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={vacationForm.end_date}
                      onSelect={(date) => setVacationForm({...vacationForm, end_date: date})}
                      disabled={(date) => date < (vacationForm.start_date || new Date())}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setVacationDialog(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={() => {
                if (vacationForm.start_date && vacationForm.end_date) {
                  setForm({
                    ...form,
                    vacation_periods: [
                      ...form.vacation_periods,
                      {
                        start_date: format(vacationForm.start_date, 'yyyy-MM-dd'),
                        end_date: format(vacationForm.end_date, 'yyyy-MM-dd')
                      }
                    ]
                  });
                  setVacationDialog(false);
                  setVacationForm({ start_date: null, end_date: null });
                }
              }}
              disabled={!vacationForm.start_date || !vacationForm.end_date}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TBZ Period Dialog */}
      <Dialog open={tbzDialog} onOpenChange={setTbzDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>TBZ-Zeitraum hinzufügen</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Von</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {tbzForm.start_date ? format(tbzForm.start_date, 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={tbzForm.start_date}
                      onSelect={(date) => setTbzForm({...tbzForm, start_date: date})}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <Label>Bis</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {tbzForm.end_date ? format(tbzForm.end_date, 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={tbzForm.end_date}
                      onSelect={(date) => setTbzForm({...tbzForm, end_date: date})}
                      disabled={(date) => date < (tbzForm.start_date || new Date())}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setTbzDialog(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={() => {
                if (tbzForm.start_date && tbzForm.end_date) {
                  setForm({
                    ...form,
                    tbz_periods: [
                      ...form.tbz_periods,
                      {
                        start_date: format(tbzForm.start_date, 'yyyy-MM-dd'),
                        end_date: format(tbzForm.end_date, 'yyyy-MM-dd')
                      }
                    ]
                  });
                  setTbzDialog(false);
                  setTbzForm({ start_date: null, end_date: null });
                }
              }}
              disabled={!tbzForm.start_date || !tbzForm.end_date}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exam Period Dialog */}
      <Dialog open={examDialog} onOpenChange={setExamDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prüfungszeitraum hinzufügen</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Von</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="w-4 h-4 mr-2" />
                      {examForm.start_date ? format(examForm.start_date, 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={examForm.start_date}
                      onSelect={(date) => setExamForm({...examForm, start_date: date})}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Bis</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <Calendar className="w-4 h-4 mr-2" />
                      {examForm.end_date ? format(examForm.end_date, 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={examForm.end_date}
                      onSelect={(date) => setExamForm({...examForm, end_date: date})}
                      disabled={(date) => date < (examForm.start_date || new Date())}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setExamDialog(false)}>Abbrechen</Button>
            <Button 
              onClick={() => {
                if (examForm.start_date && examForm.end_date) {
                  setForm({
                    ...form,
                    exam_periods: [
                      ...(form.exam_periods || []),
                      {
                        start_date: format(examForm.start_date, 'yyyy-MM-dd'),
                        end_date: format(examForm.end_date, 'yyyy-MM-dd')
                      }
                    ]
                  });
                  setExamDialog(false);
                  setExamForm({ start_date: null, end_date: null });
                }
              }}
              disabled={!examForm.start_date || !examForm.end_date}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              Hinzufügen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}