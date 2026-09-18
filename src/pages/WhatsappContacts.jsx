import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Plus, Trash2, Check, X, Smartphone, Loader2, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
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
import { toast } from 'sonner';
import { normalizePhone, formatPhone } from '@/lib/phone';

/**
 * Freigabe der Rufnummern für den WhatsApp-Eingang.
 *
 * Der Webhook ist öffentlich erreichbar – jeder kann an die Nummer schreiben.
 * Was hier nicht freigegeben ist, wird abgewiesen. Das ist die einzige
 * Zugangskontrolle des Kanals, nicht bloß eine Bequemlichkeit.
 */

const NO_EMPLOYEE = '__keiner__';

export default function WhatsappContacts() {
  const [contacts, setContacts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ phone: '', employee_id: NO_EMPLOYEE, display_name: '', note: '' });

  const loadData = async () => {
    try {
      const [contactRows, employeeRows] = await Promise.all([
        api.entities.WhatsappContact.list('-created_date'),
        api.entities.Employee.filter({ is_active: true }, 'full_name'),
      ]);
      setContacts(contactRows);
      setEmployees(employeeRows);
    } catch (error) {
      toast.error(`Nicht geladen: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const employeesById = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const toggle = async (contact) => {
    try {
      const me = await api.auth.me();
      const updated = await api.entities.WhatsappContact.update(contact.id, {
        is_enabled: !contact.is_enabled,
        approved_by: !contact.is_enabled ? me.email : null,
        approved_at: !contact.is_enabled ? new Date().toISOString() : null,
      });
      setContacts((current) => current.map((item) => (item.id === contact.id ? updated : item)));
    } catch (error) {
      toast.error(`Änderung fehlgeschlagen: ${error.message}`);
    }
  };

  const remove = async (contact) => {
    if (!window.confirm(`${formatPhone(contact.phone)} wirklich entfernen?`)) return;
    try {
      await api.entities.WhatsappContact.delete(contact.id);
      setContacts((current) => current.filter((item) => item.id !== contact.id));
      toast.success('Entfernt');
    } catch (error) {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
    }
  };

  const add = async () => {
    const phone = normalizePhone(form.phone);
    if (!phone) {
      toast.error('Bitte eine Rufnummer eingeben.');
      return;
    }
    if (contacts.some((contact) => contact.phone === phone)) {
      toast.error('Diese Nummer ist bereits eingetragen.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.entities.WhatsappContact.create({
        phone,
        employee_id: form.employee_id === NO_EMPLOYEE ? null : form.employee_id,
        display_name: form.display_name.trim() || null,
        note: form.note.trim() || null,
        is_enabled: false,
      });
      setContacts((current) => [created, ...current]);
      setDialogOpen(false);
      setForm({ phone: '', employee_id: NO_EMPLOYEE, display_name: '', note: '' });
      toast.success('Angelegt – noch nicht freigegeben');
    } catch (error) {
      toast.error(`Anlegen fehlgeschlagen: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Übernimmt die Nummern aus dem Mitarbeiterstamm. Bewusst ohne Freigabe:
   * wer schreiben darf, entscheidet ein Mensch, nicht ein Import.
   */
  const importFromEmployees = async () => {
    const vorhanden = new Set(contacts.map((contact) => contact.phone));
    const neu = employees
      .map((employee) => ({ employee, phone: normalizePhone(employee.phone) }))
      .filter(({ phone }) => phone && !vorhanden.has(phone));

    if (neu.length === 0) {
      toast.info('Keine neuen Nummern im Mitarbeiterstamm.');
      return;
    }

    setSaving(true);
    try {
      const created = await api.entities.WhatsappContact.bulkCreate(
        neu.map(({ employee, phone }) => ({
          phone,
          employee_id: employee.id,
          display_name: employee.full_name,
          is_enabled: false,
        })),
      );
      setContacts((current) => [...created, ...current]);
      toast.success(`${created.length} Nummern übernommen – bitte einzeln freigeben`);
    } catch (error) {
      toast.error(`Übernahme fehlgeschlagen: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const freigegeben = contacts.filter((contact) => contact.is_enabled).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">WhatsApp-Nummern</h1>
          <p className="text-sm text-slate-500">
            {freigegeben} von {contacts.length} freigegeben. Nicht freigegebene Nummern werden abgewiesen.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={importFromEmployees} disabled={saving || loading}>
            <Download className="mr-2 h-4 w-4" />
            Aus Mitarbeitern
          </Button>
          <Button onClick={() => setDialogOpen(true)} disabled={saving}>
            <Plus className="mr-2 h-4 w-4" />
            Nummer
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => <Skeleton key={index} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : contacts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Noch keine Nummer eingetragen. „Aus Mitarbeitern" übernimmt alle hinterlegten
            Telefonnummern auf einmal.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const employee = employeesById[contact.employee_id];
            return (
              <Card key={contact.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  <Smartphone className={`h-5 w-5 shrink-0 ${contact.is_enabled ? 'text-green-600' : 'text-slate-300'}`} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {employee?.full_name ?? contact.display_name ?? 'Ohne Namen'}
                    </p>
                    <p className="text-sm text-slate-500">{formatPhone(contact.phone)}</p>
                    {contact.last_message_at && (
                      <p className="text-xs text-slate-400">
                        zuletzt {format(parseISO(contact.last_message_at), 'd. MMM, HH:mm', { locale: de })}
                      </p>
                    )}
                  </div>

                  {contact.is_enabled ? (
                    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                      <Check className="mr-1 h-3 w-3" /> frei
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-slate-200 text-slate-500">
                      <X className="mr-1 h-3 w-3" /> gesperrt
                    </Badge>
                  )}

                  <Switch checked={contact.is_enabled} onCheckedChange={() => toggle(contact)} />

                  <Button variant="ghost" size="icon" onClick={() => remove(contact)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nummer eintragen</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nummer">Rufnummer</Label>
              <Input
                id="nummer"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="0170 1234567"
              />
              {form.phone && (
                <p className="text-xs text-slate-500">
                  Wird gespeichert als {normalizePhone(form.phone) ?? '–'}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Mitarbeiter</Label>
              <Select
                value={form.employee_id}
                onValueChange={(value) => setForm({ ...form, employee_id: value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_EMPLOYEE}>Keiner</SelectItem>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>{employee.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="anzeigename">Anzeigename</Label>
              <Input
                id="anzeigename"
                value={form.display_name}
                onChange={(event) => setForm({ ...form, display_name: event.target.value })}
                placeholder="nur nötig, wenn kein Mitarbeiter verknüpft ist"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bemerkung">Bemerkung</Label>
              <Input
                id="bemerkung"
                value={form.note}
                onChange={(event) => setForm({ ...form, note: event.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={add} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
