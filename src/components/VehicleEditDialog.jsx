import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function VehicleEditDialog({ vehicle, onClose, onSaved }) {
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    base44.entities.Employee.filter({ is_active: true })
      .then(data => setEmployees(data.filter(e => !e.is_ef && ['monteur', 'projektleiter'].includes(e.employee_type))))
      .catch(() => {});
  }, []);
  const [form, setForm] = useState({
    license_plate: vehicle.license_plate || '',
    vehicle_number: vehicle.vehicle_number || '',
    vehicle_type: vehicle.vehicle_type || 'transporter',
    seats: vehicle.seats?.toString() || '',
    notes: vehicle.notes || '',
    is_active: vehicle.is_active !== false,
    is_ef: vehicle.is_ef || false,
    next_tuev_date: vehicle.next_tuev_date || '',
    next_inspection_date: vehicle.next_inspection_date || '',
    assigned_employee_id: vehicle.assigned_employee_id || '',
    always_assign: vehicle.always_assign || false,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await base44.entities.Vehicle.update(vehicle.id, {
        ...form,
        seats: form.seats ? parseInt(form.seats) : null,
        assigned_employee_id: form.assigned_employee_id || null,
        always_assign: form.always_assign,
      });
      toast.success('Fahrzeug gespeichert');
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error('Fehler beim Speichern');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fahrzeug bearbeiten — {vehicle.license_plate}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Kennzeichen *</Label>
              <Input value={form.license_plate} onChange={(e) => setForm({ ...form, license_plate: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Fahrzeugnummer</Label>
              <Input value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} placeholder="z.B. 01, 02" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Fahrzeugtyp</Label>
              <select
                value={form.vehicle_type}
                onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
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
              <Input type="number" min="1" value={form.seats} onChange={(e) => setForm({ ...form, seats: e.target.value })} placeholder="z.B. 3, 5, 9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nächster TÜV</Label>
              <Input type="date" value={form.next_tuev_date} onChange={(e) => setForm({ ...form, next_tuev_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Nächste Inspektion</Label>
              <Input type="date" value={form.next_inspection_date} onChange={(e) => setForm({ ...form, next_inspection_date: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Bemerkungen</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
          </div>

          <div className="space-y-2">
            <Label>Verknüpfter Monteur</Label>
            <select
              value={form.assigned_employee_id}
              onChange={(e) => setForm({ ...form, assigned_employee_id: e.target.value })}
              className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
              style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
            >
              <option value="">— kein Monteur —</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </select>
          </div>

          {form.assigned_employee_id && (
            <div className="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
              <div>
                <Label>Fährt immer mit diesem Fahrzeug</Label>
                <p className="text-sm text-gray-500">Fahrzeug wird automatisch immer auf die Baustelle des Monteurs zugeteilt</p>
              </div>
              <Switch checked={form.always_assign} onCheckedChange={(checked) => setForm({ ...form, always_assign: checked })} />
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-xl">
            <div>
              <Label>Verfügbar</Label>
              <p className="text-sm text-gray-500">Fahrzeug kann eingeplant werden</p>
            </div>
            <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={handleSubmit} disabled={!form.license_plate || submitting} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
            {submitting ? 'Wird gespeichert...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}