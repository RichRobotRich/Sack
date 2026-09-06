import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Car,
  Plus,
  Search,
  Edit2,
  Trash2,
  Filter,
  Users2,
  UserCheck
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

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
import { ShieldAlert } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [duplicateDialog, setDuplicateDialog] = useState({ open: false, similar: [], pendingData: null });
  const [submitting, setSubmitting] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('alle');
  const [locationFilter, setLocationFilter] = useState('alle');
  const [pullDistance, setPullDistance] = useState(0);

  const [form, setForm] = useState({
    license_plate: '',
    vehicle_number: '',
    vehicle_type: 'transporter',
    seats: '',
    notes: '',
    is_active: true,
    is_ef: false,
    next_tuev_date: '',
    next_inspection_date: '',
    assigned_employee_id: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setPullDistance(0);
    try {
      const [data, empData] = await Promise.all([
        base44.entities.Vehicle.list(),
        base44.entities.Employee.filter({ is_active: true })
      ]);
      setVehicles(data);
      setEmployees(empData.filter(e => e.employee_type === 'monteur'));
    } catch (error) {
      console.error('Error loading vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTouchStart = (e) => {
    if (window.scrollY === 0) {
      setPullDistance(0);
    }
  };

  const handleTouchMove = (e) => {
    if (window.scrollY === 0) {
      setPullDistance(Math.max(0, e.touches[0].clientY - (e.touches[0].clientY - 20)));
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 100) {
      loadData();
    }
    setPullDistance(0);
  };

  const filteredVehicles = vehicles
    .filter(v => {
      const matchesSearch = v.license_plate?.toLowerCase().includes(search.toLowerCase()) ||
                            v.vehicle_number?.toLowerCase().includes(search.toLowerCase());
      const matchesType = typeFilter === 'alle' || v.vehicle_type === typeFilter;
      const matchesLocation = locationFilter === 'alle' || 
                             (locationFilter === 'pb' && !v.is_ef) ||
                             (locationFilter === 'ef' && v.is_ef);
      return matchesSearch && matchesType && matchesLocation;
    })
    .sort((a, b) => (a.license_plate || '').localeCompare(b.license_plate || ''));

  // Prüft auf ähnliche Kennzeichen
  const findSimilarVehicles = (plate) => {
    if (!plate || plate.trim().length < 2) return [];
    const input = plate.trim().replace(/\s+/g, '').toLowerCase();
    return vehicles.filter(v => {
      const existing = (v.license_plate || '').replace(/\s+/g, '').toLowerCase();
      if (!existing) return false;
      return existing === input || existing.includes(input) || input.includes(existing);
    });
  };

  const handleSubmit = async () => {
    if (!form.license_plate) return;
    
    // Bei Neuanlage: auf ähnliche Kennzeichen prüfen
    if (!editingVehicle) {
      const similar = findSimilarVehicles(form.license_plate);
      if (similar.length > 0) {
        setDuplicateDialog({ open: true, similar, pendingData: { ...form } });
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
        seats: form.seats ? parseInt(form.seats) : null
      };
      
      if (editingVehicle) {
        await base44.entities.Vehicle.update(editingVehicle.id, data);
      } else {
        await base44.entities.Vehicle.create(data);
      }
      
      setDialogOpen(false);
      setDuplicateDialog({ open: false, similar: [], pendingData: null });
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving vehicle:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    
    try {
      await base44.entities.Vehicle.delete(deleteDialog.id);
      setDeleteDialog({ open: false, id: null });
      loadData();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
    }
  };

  const resetForm = () => {
    setForm({
      license_plate: '',
      vehicle_number: '',
      vehicle_type: 'transporter',
      seats: '',
      notes: '',
      is_active: true,
      is_ef: false,
      next_tuev_date: '',
      next_inspection_date: '',
      assigned_employee_id: ''
      });
      setEditingVehicle(null);
      };

  const openEditDialog = (vehicle) => {
    setEditingVehicle(vehicle);
    setForm({
      license_plate: vehicle.license_plate || '',
      vehicle_number: vehicle.vehicle_number || '',
      vehicle_type: vehicle.vehicle_type || 'transporter',
      seats: vehicle.seats?.toString() || '',
      notes: vehicle.notes || '',
      is_active: vehicle.is_active !== false,
      is_ef: vehicle.is_ef || false,
      next_tuev_date: vehicle.next_tuev_date || '',
      next_inspection_date: vehicle.next_inspection_date || '',
      assigned_employee_id: vehicle.assigned_employee_id || ''
    });
    setDialogOpen(true);
  };

  const getTypeBadge = (type) => {
    const config = {
      transporter: { class: 'bg-blue-100 text-blue-700', label: 'Transporter' },
      pkw: { class: 'bg-green-100 text-green-700', label: 'PKW' },
      lkw: { class: 'bg-amber-100 text-amber-700', label: 'LKW' },
      anhaenger: { class: 'bg-purple-100 text-purple-700', label: 'Anhänger' }
    };
    const { class: className, label } = config[type] || config.transporter;
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
            <Car className="w-8 h-8 dark:text-blue-300" />
            Fahrzeugverwaltung
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {vehicles.length} Fahrzeuge
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
          Fahrzeug anlegen
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Suchen nach Kennzeichen..."
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
          <option value="transporter">Transporter</option>
          <option value="pkw">PKW</option>
          <option value="lkw">LKW</option>
          <option value="anhaenger">Anhänger</option>
        </select>
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="w-full sm:w-40 h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
          style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
        >
          <option value="alle">Alle Standorte</option>
          <option value="pb">PB</option>
          <option value="ef">EF</option>
        </select>
      </div>

      {/* Mobile Card List */}
      <div className="lg:hidden space-y-3">
        {filteredVehicles.length === 0 ? (
          <Card className="border-0 shadow-sm dark:bg-gray-800">
            <CardContent className="py-12 text-center">
              <Car className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400">Keine Fahrzeuge gefunden</p>
            </CardContent>
          </Card>
        ) : (
          filteredVehicles.map((vehicle) => (
            <Card key={vehicle.id} className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{vehicle.license_plate}</h3>
                    {vehicle.vehicle_number && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">Nr. {vehicle.vehicle_number}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(vehicle)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setDeleteDialog({ open: true, id: vehicle.id })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getTypeBadge(vehicle.vehicle_type)}
                    {vehicle.is_active !== false ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">Verfügbar</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Nicht verfügbar</Badge>
                    )}
                    {vehicle.is_ef && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400">EF</Badge>
                    )}
                  </div>
                  {vehicle.seats && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                      <Users2 className="w-4 h-4" />
                      {vehicle.seats} Sitzplätze
                    </p>
                  )}
                  {vehicle.notes && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{vehicle.notes}</p>
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
              <TableHead className="dark:text-gray-300">Kennzeichen</TableHead>
              <TableHead className="dark:text-gray-300">Nummer</TableHead>
              <TableHead className="dark:text-gray-300">Typ</TableHead>
              <TableHead className="dark:text-gray-300">Sitzplätze</TableHead>
              <TableHead className="dark:text-gray-300">Bemerkungen</TableHead>
              <TableHead className="dark:text-gray-300">Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVehicles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  Keine Fahrzeuge gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredVehicles.map((vehicle) => (
                <TableRow key={vehicle.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <TableCell className="font-medium dark:text-white">{vehicle.license_plate}</TableCell>
                  <TableCell className="dark:text-gray-300">{vehicle.vehicle_number || '-'}</TableCell>
                  <TableCell>{getTypeBadge(vehicle.vehicle_type)}</TableCell>
                  <TableCell className="dark:text-gray-300">
                    {vehicle.seats ? (
                      <span className="flex items-center gap-1">
                        <Users2 className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        {vehicle.seats}
                      </span>
                    ) : '-'}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-gray-500 dark:text-gray-400">
                    {vehicle.notes || '-'}
                  </TableCell>
                  <TableCell>
                    {vehicle.is_active !== false ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400">Verfügbar</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Nicht verfügbar</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(vehicle)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeleteDialog({ open: true, id: vehicle.id })}
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingVehicle ? 'Fahrzeug bearbeiten' : 'Neues Fahrzeug'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Kennzeichen *</Label>
                <Input
                  value={form.license_plate}
                  onChange={(e) => setForm({...form, license_plate: e.target.value})}
                  placeholder="z.B. M-AB 1234"
                />
              </div>
              <div className="space-y-2">
                <Label>Fahrzeugnummer</Label>
                <Input
                  value={form.vehicle_number}
                  onChange={(e) => setForm({...form, vehicle_number: e.target.value})}
                  placeholder="z.B. 01, 02"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fahrzeugtyp</Label>
                <select
                  value={form.vehicle_type}
                  onChange={(e) => setForm({...form, vehicle_type: e.target.value})}
                  className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                  style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
                >
                  <option value="transporter">Transporter</option>
                  <option value="pkw">PKW</option>
                  <option value="lkw">LKW</option>
                  <option value="anhaenger">Anhänger</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Sitzplätze</Label>
                <Input
                  type="number"
                  min="1"
                  value={form.seats}
                  onChange={(e) => setForm({...form, seats: e.target.value})}
                  placeholder="z.B. 3, 5, 9"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nächster TÜV</Label>
                <Input
                  type="date"
                  value={form.next_tuev_date}
                  onChange={(e) => setForm({...form, next_tuev_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>Nächste Inspektion</Label>
                <Input
                  type="date"
                  value={form.next_inspection_date}
                  onChange={(e) => setForm({...form, next_inspection_date: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bemerkungen</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
                placeholder="z.B. Werkzeugausstattung, besondere Merkmale"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <Label>Verfügbar</Label>
                <p className="text-sm text-gray-500">Fahrzeug kann eingeplant werden</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({...form, is_active: checked})}
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl">
              <div>
                <Label className="text-purple-700">EF Fahrzeug</Label>
                <p className="text-sm text-purple-600">Fahrzeug gehört zu EF</p>
              </div>
              <Switch
                checked={form.is_ef}
                onCheckedChange={(checked) => setForm({...form, is_ef: checked})}
              />
            </div>

            {(form.vehicle_type === 'transporter' || form.vehicle_type === 'pkw') && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-xl">
                <Label className="flex items-center gap-2 text-blue-700">
                  <UserCheck className="w-4 h-4" />
                  Zugeordneter Monteur
                </Label>
                <p className="text-xs text-blue-600 mb-2">Fahrzeug wird automatisch der Baustelle des Monteurs zugeordnet</p>
                <select
                  value={form.assigned_employee_id}
                  onChange={(e) => setForm({...form, assigned_employee_id: e.target.value})}
                  className="w-full h-10 px-3 py-2 border border-blue-200 bg-white dark:bg-gray-800 dark:text-white rounded-md text-sm"
                  style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
                >
                  <option value="">— Kein Monteur zugeordnet —</option>
                  {employees
                    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'de'))
                    .map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.license_plate || submitting}
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
              <ShieldAlert className="w-5 h-5" />
              Ähnliche Kennzeichen gefunden
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Das Kennzeichen <strong>"{duplicateDialog.pendingData?.license_plate}"</strong> ähnelt folgenden existierenden Fahrzeugen:</p>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 max-h-48 overflow-y-auto">
                <ul className="space-y-1.5">
                  {duplicateDialog.similar.map((v) => (
                    <li key={v.id} className="text-sm text-gray-800 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="font-medium">{v.license_plate}</span>
                      {v.vehicle_number && <span className="text-gray-500 text-xs">Nr. {v.vehicle_number}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm">Möchten Sie das Fahrzeug trotzdem anlegen?</p>
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
            <AlertDialogTitle>Fahrzeug löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie dieses Fahrzeug wirklich löschen?
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