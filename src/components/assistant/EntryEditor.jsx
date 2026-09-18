import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Loader2, Trash2, CheckCircle2, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

/**
 * Einen Eintrag ansehen, korrigieren und freigeben.
 *
 * Die Freigabe ist der eigentliche Zweck: was die Verarbeitung erzeugt hat,
 * ist ein Vorschlag. Erst wenn jemand ihn gesehen hat, verschwindet der
 * Eintrag aus "Zu prüfen".
 *
 * Anhänge liegen im privaten Bucket, deshalb werden die Adressen beim Öffnen
 * einzeln und befristet geholt.
 */

const TYPES = [
  { value: 'protokoll', label: 'Protokoll' },
  { value: 'bericht', label: 'Bericht' },
  { value: 'notiz', label: 'Notiz' },
  { value: 'todo', label: 'ToDo' },
];

const STATUS = [
  { value: 'entwurf', label: 'Entwurf' },
  { value: 'offen', label: 'Offen' },
  { value: 'erledigt', label: 'Erledigt' },
  { value: 'archiviert', label: 'Archiviert' },
];

const PRIORITIES = [
  { value: 'niedrig', label: 'Niedrig' },
  { value: 'normal', label: 'Normal' },
  { value: 'hoch', label: 'Hoch' },
  { value: 'dringend', label: 'Dringend' },
];

const NO_PROJECT = '__ohne__';

export default function EntryEditor({ entry, projects, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: entry.title ?? '',
    body_md: entry.body_md ?? '',
    type: entry.type,
    status: entry.status,
    project_id: entry.project_id ?? NO_PROJECT,
    due_date: entry.due_date ?? '',
    priority: entry.priority ?? 'normal',
  });
  const [attachments, setAttachments] = useState([]);
  const [urls, setUrls] = useState({});
  const [loadingAttachments, setLoadingAttachments] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const rows = await api.entities.EntryAttachment.filter({ entry_id: entry.id }, 'sort_order');
        if (cancelled) return;
        setAttachments(rows);

        const paths = rows.map((row) => row.storage_path);
        const signed = paths.length ? await api.assistant.signedUrls(paths) : {};
        if (!cancelled) setUrls(signed);
      } catch (error) {
        if (!cancelled) toast.error(`Anhänge nicht geladen: ${error.message}`);
      } finally {
        if (!cancelled) setLoadingAttachments(false);
      }
    })();

    return () => { cancelled = true; };
  }, [entry.id]);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = async ({ approve }) => {
    setSaving(true);
    try {
      const values = {
        title: form.title.trim() || null,
        body_md: form.body_md.trim() || null,
        type: form.type,
        status: form.status,
        project_id: form.project_id === NO_PROJECT ? null : form.project_id,
        due_date: form.type === 'todo' && form.due_date ? form.due_date : null,
        priority: form.type === 'todo' ? form.priority : null,
      };

      // Wird die Baustelle hier gesetzt, ist sie von Hand gewählt – die
      // ursprüngliche Methode wäre danach irreführend.
      if (values.project_id !== entry.project_id) {
        values.project_match_method = values.project_id ? 'manuell' : 'keine';
        values.project_match_confidence = values.project_id ? 1 : 0;
      }

      if (approve) {
        const me = await api.auth.me();
        values.needs_review = false;
        values.reviewed_by = me.email;
        values.reviewed_at = new Date().toISOString();
      }

      const updated = await api.entities.Entry.update(entry.id, values);
      toast.success(approve ? 'Freigegeben' : 'Gespeichert');
      onSaved(updated);
    } catch (error) {
      toast.error(`Speichern fehlgeschlagen: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Diesen Eintrag wirklich löschen?')) return;
    setSaving(true);
    try {
      await api.entities.Entry.delete(entry.id);
      toast.success('Gelöscht');
      onSaved({ ...entry, status: 'archiviert', _deleted: true });
    } catch (error) {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
      setSaving(false);
    }
  };

  const maengel = entry.structured?.maengel ?? [];
  const arbeiten = entry.structured?.arbeiten ?? [];
  const feststellungen = entry.structured?.feststellungen ?? [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Eintrag bearbeiten</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {entry.needs_review && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Automatisch erzeugt und noch nicht geprüft.
                {entry.ai_notes ? ` Hinweis der Auswertung: ${entry.ai_notes}` : ''}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="titel">Titel</Label>
            <Input id="titel" value={form.title} onChange={(event) => update('title', event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="text">Text</Label>
            <Textarea
              id="text"
              rows={7}
              value={form.body_md}
              onChange={(event) => update('body_md', event.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Art</Label>
              <Select value={form.type} onValueChange={(value) => update('type', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(value) => update('status', value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Baustelle</Label>
            <Select value={form.project_id} onValueChange={(value) => update('project_id', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Ohne Projekt</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.cost_center_number
                      ? `${project.cost_center_number} – ${project.name}`
                      : project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!entry.project_id && entry.project_match_candidates?.length > 0 && (
              <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                <p className="mb-1 font-medium">Kam in Frage:</p>
                <ul className="space-y-0.5">
                  {entry.project_match_candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        className="text-blue-700 underline"
                        onClick={() => update('project_id', candidate.id)}
                      >
                        {candidate.name}
                      </button>
                      {candidate.reason ? ` – ${candidate.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {form.type === 'todo' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="faellig">Fällig am</Label>
                <Input
                  id="faellig"
                  type="date"
                  value={form.due_date ?? ''}
                  onChange={(event) => update('due_date', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Priorität</Label>
                <Select value={form.priority} onValueChange={(value) => update('priority', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {(arbeiten.length > 0 || feststellungen.length > 0 || maengel.length > 0) && (
            <div className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Erkannte Punkte
              </p>
              <StructuredList title="Arbeiten" items={arbeiten} />
              <StructuredList title="Feststellungen" items={feststellungen} />
              {maengel.length > 0 && (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-700">Mängel</p>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {maengel.map((mangel, index) => (
                      <li key={index} className="flex flex-wrap items-baseline gap-x-2">
                        <span>{mangel.beschreibung}</span>
                        {mangel.gewerk && <Badge variant="outline">{mangel.gewerk}</Badge>}
                        {mangel.frist && <span className="text-xs text-slate-500">bis {mangel.frist}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Anhänge</Label>
            {loadingAttachments ? (
              <p className="text-sm text-slate-500">Wird geladen …</p>
            ) : attachments.length === 0 ? (
              <p className="text-sm text-slate-500">Keine Anhänge.</p>
            ) : (
              <div className="space-y-3">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="space-y-1">
                    {attachment.kind === 'foto' && urls[attachment.storage_path] && (
                      <img
                        src={urls[attachment.storage_path]}
                        alt={attachment.caption ?? 'Foto'}
                        className="max-h-64 w-full rounded-lg object-contain"
                      />
                    )}
                    {attachment.kind === 'sprachnachricht' && urls[attachment.storage_path] && (
                      <audio controls src={urls[attachment.storage_path]} className="w-full" />
                    )}
                    {attachment.transcript && (
                      <p className="rounded bg-slate-50 p-2 text-sm italic text-slate-600">
                        „{attachment.transcript}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={remove} disabled={saving} className="text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Löschen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => save({ approve: false })} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Speichern
            </Button>
            {entry.needs_review && (
              <Button onClick={() => save({ approve: true })} disabled={saving}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Freigeben
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StructuredList({ title, items }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-slate-700">{title}</p>
      <ul className="list-inside list-disc space-y-0.5 text-sm text-slate-600">
        {items.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    </div>
  );
}
