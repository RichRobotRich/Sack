import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  HardHat,
  Plus,
  Search,
  Edit2,
  Trash2,
  Filter,
  MapPin,
  Calendar,
  User,
  Zap,
  X
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import MobileSelect from '../components/MobileSelect';
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
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
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
import { Checkbox } from '@/components/ui/checkbox';

export default function ProjectManagement() {
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [submitting, setSubmitting] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');
  const [typeFilter, setTypeFilter] = useState('alle');
  const [duplicateDialog, setDuplicateDialog] = useState({ open: false, similar: [], pendingData: null });

  const [form, setForm] = useState({
    name: '',
    cost_center_number: '',
    address: '',
    city: '',
    project_leader_id: '',
    completion_date: null,
    completion_date_text: '',
    default_departure_time: '',
    default_work_start_time: '',
    default_work_end_time: '',
    status: 'aktiv',
    notes: '',
    is_ts_project: false,
    is_ef_project: false,
    accommodation_name: '',
    accommodation_address: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [projectsData, employeesData] = await Promise.all([
        base44.entities.Project.list(),
        base44.entities.Employee.filter({ employee_type: 'projektleiter' })
      ]);
      setProjects(projectsData);
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEmployee = (id) => employees.find(e => e.id === id);

  const filteredProjects = projects
    .filter(p => {
      const matchesSearch = p.name?.toLowerCase().includes(search.toLowerCase()) ||
                            p.address?.toLowerCase().includes(search.toLowerCase()) ||
                            p.city?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'alle' || p.status === statusFilter;
      
      let matchesType = true;
      if (typeFilter === 'PB') {
        matchesType = !p.is_ef_project && !p.is_ts_project;
      } else if (typeFilter === 'EF') {
        matchesType = p.is_ef_project === true;
      } else if (typeFilter === 'TS') {
        matchesType = p.is_ts_project === true;
      }
      
      return matchesSearch && matchesStatus && matchesType;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Prüft auf ähnliche Baustellennamen
  const findSimilarProjects = (name) => {
    if (!name || name.trim().length < 3) return [];
    
    const input = name.trim().toLowerCase();
    const inputWords = input.split(/\s+/).filter(w => w.length > 1);
    
    return projects.filter(p => {
      const existing = (p.name || '').toLowerCase();
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
    if (!form.name) return;
    
    // Bei Neuanlage: auf ähnliche Namen prüfen
    if (!editingProject) {
      const similar = findSimilarProjects(form.name);
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
        completion_date: form.completion_date ? format(form.completion_date, 'yyyy-MM-dd') : null
      };
      
      if (editingProject) {
        await base44.entities.Project.update(editingProject.id, data);
      } else {
        await base44.entities.Project.create(data);
      }
      
      setDialogOpen(false);
      setDuplicateDialog({ open: false, similar: [], pendingData: null });
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving project:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    
    try {
      await base44.entities.Project.delete(deleteDialog.id);
      setDeleteDialog({ open: false, id: null });
      loadData();
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      cost_center_number: '',
      address: '',
      city: '',
      project_leader_id: '',
      completion_date: null,
      completion_date_text: '',
      default_departure_time: '',
      default_work_start_time: '',
      default_work_end_time: '',
      status: 'aktiv',
      notes: '',
      is_ts_project: false,
      is_ef_project: false,
      is_planpro: false,
      accommodation_name: '',
      accommodation_address: ''
    });
    setEditingProject(null);
  };

  const openEditDialog = (project) => {
    setEditingProject(project);
    setForm({
      name: project.name || '',
      cost_center_number: project.cost_center_number || '',
      address: project.address || '',
      city: project.city || '',
      project_leader_id: project.project_leader_id || '',
      completion_date: project.completion_date ? new Date(project.completion_date) : null,
      completion_date_text: project.completion_date_text || '',
      default_departure_time: project.default_departure_time || '',
      default_work_start_time: project.default_work_start_time || '',
      default_work_end_time: project.default_work_end_time || '',
      status: project.status || 'aktiv',
      notes: project.notes || '',
      is_ts_project: project.is_ts_project || false,
      is_ef_project: project.is_ef_project || false,
      is_planpro: project.is_planpro || false,
      accommodation_name: project.accommodation_name || '',
      accommodation_address: project.accommodation_address || ''
    });
    setDialogOpen(true);
  };

  const getStatusBadge = (status) => {
    const config = {
      aktiv: { class: 'bg-green-100 text-green-700 border-green-200', label: 'Aktiv' },
      pausiert: { class: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Pausiert' },
      abgeschlossen: { class: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Abgeschlossen' }
    };
    const { class: className, label } = config[status] || config.aktiv;
    return <Badge variant="outline" className={className}>{label}</Badge>;
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
            <HardHat className="w-8 h-8 dark:text-blue-300" />
            Baustellenverwaltung
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {projects.length} Baustellen
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
          Baustelle anlegen
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Suchen nach Name, Adresse..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full sm:w-40 h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
          style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
        >
          <option value="alle">Alle Typen</option>
          <option value="PB">PB</option>
          <option value="EF">EF</option>
          <option value="TS">TS</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-40 h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
          style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
        >
          <option value="alle">Alle Status</option>
          <option value="aktiv">Aktiv</option>
          <option value="pausiert">Pausiert</option>
          <option value="abgeschlossen">Abgeschlossen</option>
        </select>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm overflow-hidden dark:bg-gray-800 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900">
              <TableHead className="dark:text-gray-300">Baustellenname</TableHead>
              <TableHead className="dark:text-gray-300">Adresse</TableHead>
              <TableHead className="dark:text-gray-300">Projektleiter</TableHead>
              <TableHead className="dark:text-gray-300">Fertigstellung</TableHead>
              <TableHead className="dark:text-gray-300">Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Keine Baustellen gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredProjects.map((project) => {
                const leader = getEmployee(project.project_leader_id);
                
                return (
                  <TableRow key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <TableCell className="font-medium dark:text-white">{project.name}</TableCell>
                    <TableCell>
                      {(project.address || project.city) ? (
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                          <MapPin className="w-3 h-3" />
                          {project.address}{project.address && project.city ? ', ' : ''}{project.city}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="dark:text-gray-300">
                      {leader ? (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                          {leader.abbreviation || leader.full_name}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {project.completion_date || project.completion_date_text ? (
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                          <Calendar className="w-3 h-3 flex-shrink-0" />
                          <span>
                            {project.completion_date ? format(new Date(project.completion_date), 'd.M.yyyy') : ''}
                            {project.completion_date && project.completion_date_text ? ' · ' : ''}
                            {project.completion_date_text || ''}
                          </span>
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                       <div className="flex items-center gap-2">
                         {getStatusBadge(project.status)}
                         {project.is_ts_project && (
                           <Zap className="w-4 h-4 text-amber-500 dark:text-amber-400" title="TS Projekt" />
                         )}
                       </div>
                     </TableCell>
                     <TableCell>
                       <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(project)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => setDeleteDialog({ open: true, id: project.id })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col" style={{ maxHeight: '90dvh', overflow: 'hidden' }}>
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingProject ? 'Baustelle bearbeiten' : 'Neue Baustelle'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto overflow-x-hidden flex-1" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}>
            <div className="space-y-2">
              <Label>Baustellenname *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="z.B. Neubau Halle 3"
              />
            </div>

            <div className="space-y-2">
              <Label>Kostenträger</Label>
              <Input
                value={form.cost_center_number}
                onChange={(e) => setForm({...form, cost_center_number: e.target.value})}
                placeholder="z.B. 12345"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Adresse</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({...form, address: e.target.value})}
                  placeholder="Straße Nr."
                />
              </div>
              <div className="space-y-2">
                <Label>Stadt</Label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm({...form, city: e.target.value})}
                  placeholder="PLZ Stadt"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Projektleiter</Label>
                <Select
                  value={form.project_leader_id}
                  onValueChange={(value) => setForm({...form, project_leader_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.abbreviation || emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Fertigstellungstermin</Label>
                  {(form.completion_date || form.completion_date_text) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-gray-500 hover:text-red-600"
                      onClick={() => setForm({...form, completion_date: null, completion_date_text: ''})}
                    >
                      <X className="w-3 h-3 mr-1" />
                      Zurücksetzen
                    </Button>
                  )}
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {form.completion_date ? format(form.completion_date, 'd.M.yyyy') : 'Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={form.completion_date}
                      onSelect={(date) => setForm({...form, completion_date: date})}
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  value={form.completion_date_text}
                  onChange={(e) => setForm({...form, completion_date_text: e.target.value})}
                  placeholder='oder Text, z.B. "KW 20", "Ende Juli"'
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Standard-Abfahrtszeit</Label>
                <Input
                  type="time"
                  value={form.default_departure_time}
                  onChange={(e) => setForm({...form, default_departure_time: e.target.value})}
                  placeholder="06:30"
                />
              </div>
              <div className="space-y-2">
                <Label>Arbeitszeit von</Label>
                <Input
                  type="time"
                  value={form.default_work_start_time}
                  onChange={(e) => setForm({...form, default_work_start_time: e.target.value})}
                  placeholder="07:00"
                />
              </div>
              <div className="space-y-2">
                <Label>Arbeitszeit bis</Label>
                <Input
                  type="time"
                  value={form.default_work_end_time}
                  onChange={(e) => setForm({...form, default_work_end_time: e.target.value})}
                  placeholder="16:00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({...form, status: value})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="pausiert">Pausiert</SelectItem>
                  <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Bemerkungen</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
                placeholder="Zusätzliche Informationen..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unterkunft Name</Label>
                <Input
                  value={form.accommodation_name}
                  onChange={(e) => setForm({...form, accommodation_name: e.target.value})}
                  placeholder="z.B. Hotel Müller"
                />
              </div>
              <div className="space-y-2">
                <Label>Unterkunft Adresse</Label>
                <Input
                  value={form.accommodation_address}
                  onChange={(e) => setForm({...form, accommodation_address: e.target.value})}
                  placeholder="Straße, PLZ Stadt"
                />
              </div>
            </div>

            <div className="space-y-2">
               <div className="flex items-center space-x-2 p-4 bg-amber-50 rounded-lg">
                 <Checkbox
                   id="is_ts_project"
                   checked={form.is_ts_project}
                   onCheckedChange={(checked) => setForm({...form, is_ts_project: checked})}
                 />
                 <Label htmlFor="is_ts_project" className="flex items-center gap-2 cursor-pointer mb-0">
                   <Zap className="w-4 h-4 text-amber-600" />
                   <span className="text-amber-900">TS Projekt</span>
                 </Label>
               </div>
               
               <div className="flex items-center space-x-2 p-4 bg-blue-50 rounded-lg">
                 <Checkbox
                   id="is_ef_project"
                   checked={form.is_ef_project}
                   onCheckedChange={(checked) => setForm({...form, is_ef_project: checked})}
                 />
                 <Label htmlFor="is_ef_project" className="flex items-center gap-2 cursor-pointer mb-0">
                   <span className="text-blue-900">EF Projekt</span>
                 </Label>
               </div>

               <div className="flex items-center space-x-2 p-4 bg-green-50 rounded-lg">
                 <Checkbox
                   id="is_planpro"
                   checked={form.is_planpro}
                   onCheckedChange={(checked) => setForm({...form, is_planpro: checked})}
                 />
                 <Label htmlFor="is_planpro" className="flex items-center gap-2 cursor-pointer mb-0">
                   <span className="text-green-900 font-medium">PlanPro</span>
                   <span className="text-green-700 text-xs">(in PlanPro App anzeigen)</span>
                 </Label>
               </div>
             </div>
            </div>
          
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.name || submitting}
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
              <HardHat className="w-5 h-5" />
              Ähnliche Baustellen gefunden
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Der Name <strong>"{duplicateDialog.pendingData?.name}"</strong> ähnelt folgenden existierenden Baustellen:</p>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 max-h-48 overflow-y-auto">
                <ul className="space-y-1.5">
                  {duplicateDialog.similar.map((p) => (
                    <li key={p.id} className="text-sm text-gray-800 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="font-medium">{p.name}</span>
                      {p.city && <span className="text-gray-500 text-xs">- {p.city}</span>}
                      {p.is_ts_project && <Zap className="w-3 h-3 text-amber-500" />}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm">Möchten Sie die Baustelle trotzdem anlegen?</p>
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
            <AlertDialogTitle>Baustelle löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diese Baustelle wirklich löschen? Bestehende Einsätze werden nicht gelöscht.
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
    </div>
  );
}