import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/client';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import {
  Camera,
  Send,
  X,
  Loader2,
  CheckCircle2,
  HelpCircle,
  Building2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import VoiceRecorder from '@/components/assistant/VoiceRecorder';

/**
 * Erfassen einer Meldung.
 *
 * Bewusst eine einzige Seite ohne Formularfelder pro Eintragsart: auf der
 * Baustelle wird erzählt, nicht ausgefüllt. Was daraus ein Protokoll, ein
 * Mängelbericht, eine Notiz oder eine Aufgabe wird, entscheidet die
 * Verarbeitung – korrigieren lässt es sich hinterher unter Einträge.
 */

const TYPE_OPTIONS = [
  { value: 'auto', label: 'Automatisch erkennen' },
  { value: 'protokoll', label: 'Protokoll' },
  { value: 'bericht', label: 'Bericht (Mängel)' },
  { value: 'notiz', label: 'Notiz' },
  { value: 'todo', label: 'ToDo' },
];

export default function AssistantCapture() {
  const navigate = useNavigate();
  const photoInputRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [text, setText] = useState('');
  const [voiceFile, setVoiceFile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [projectId, setProjectId] = useState('auto');
  const [type, setType] = useState('auto');
  const [result, setResult] = useState(null);

  useEffect(() => {
    api.entities.Project.filter({ status: 'aktiv' }, 'name')
      .then(setProjects)
      .catch((error) => toast.error(`Baustellen nicht geladen: ${error.message}`))
      .finally(() => setLoading(false));
  }, []);

  // Vorschauadressen am Lebenszyklus der Auswahl: direkt im JSX erzeugt
  // entstünde bei jedem Render eine neue, die nie freigegeben wird.
  useEffect(() => {
    const urls = photos.map((photo) => URL.createObjectURL(photo));
    setPhotoPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  const addPhotos = (event) => {
    const chosen = Array.from(event.target.files ?? []);
    setPhotos((current) => [...current, ...chosen]);
    event.target.value = '';
  };

  const removePhoto = (index) => {
    setPhotos((current) => current.filter((_, position) => position !== index));
  };

  const reset = () => {
    setText('');
    setVoiceFile(null);
    setPhotos([]);
    setType('auto');
    setResult(null);
  };

  const submit = async () => {
    if (!text.trim() && !voiceFile && photos.length === 0) {
      toast.error('Bitte etwas eintippen, aufnehmen oder fotografieren.');
      return;
    }

    setSending(true);
    try {
      // Die Dateien gehen direkt in den Storage; die Edge Function bekommt nur
      // die Pfade. So läuft kein Foto durch die Funktion und deren Zeitlimit.
      const attachments = [];

      if (voiceFile) {
        const uploaded = await api.assistant.uploadFile(voiceFile);
        attachments.push({ ...uploaded, storage_path: uploaded.path, kind: 'sprachnachricht' });
      }

      for (const photo of photos) {
        const uploaded = await api.assistant.uploadFile(photo);
        attachments.push({ ...uploaded, storage_path: uploaded.path, kind: 'foto' });
      }

      const response = await api.functions.invoke('processEntry', {
        text: text.trim() || null,
        attachments,
        project_id: projectId === 'auto' ? null : projectId,
        type: type === 'auto' ? null : type,
        entry_date: format(new Date(), 'yyyy-MM-dd'),
      });

      setResult(response.data);
      toast.success('Eintrag erstellt');
    } catch (error) {
      console.error(error);
      toast.error(error.message ?? 'Die Erfassung ist fehlgeschlagen.');
    } finally {
      setSending(false);
    }
  };

  if (result) {
    const project = projects.find((item) => item.id === result.projectId);

    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Eintrag erstellt</h2>
                <p className="text-sm text-slate-500">
                  Er wartet unter Einträge auf Prüfung.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              {result.projectId ? (
                <p className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">{project?.name ?? 'Baustelle zugeordnet'}</span>
                  <Badge variant="outline">{describeMatch(result.matchMethod, result.confidence)}</Badge>
                </p>
              ) : (
                <p className="flex items-start gap-2 text-sm text-amber-700">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Keine Baustelle erkannt. Der Eintrag liegt unter <em>Ohne Projekt</em> und
                    wartet auf Zuordnung.
                  </span>
                </p>
              )}
            </div>

            {result.todoIds?.length > 0 && (
              <p className="text-sm text-slate-600">
                Dazu {result.todoIds.length === 1 ? 'wurde 1 Aufgabe' : `wurden ${result.todoIds.length} Aufgaben`} angelegt.
              </p>
            )}

            {result.transcripts?.some((item) => item.text) && (
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Abgetippt
                </p>
                <p className="whitespace-pre-wrap text-sm text-slate-700">
                  {result.transcripts.map((item) => item.text).filter(Boolean).join('\n')}
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={reset} className="flex-1">Nächste Meldung</Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigate(createPageUrl('AssistantEntries'))}
              >
                Zu den Einträgen
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Erfassen</h1>
        <p className="text-sm text-slate-500">
          Sprechen, tippen oder fotografieren – der Rest passiert automatisch.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <VoiceRecorder file={voiceFile} onChange={setVoiceFile} disabled={sending} />

          <div className="space-y-2">
            <Label htmlFor="meldung">Text</Label>
            <Textarea
              id="meldung"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Heute Steigleitung im 2. OG fertig, DN 32. Zwei Absperrventile fehlen noch, bitte bestellen."
              rows={5}
              disabled={sending}
            />
            <p className="text-xs text-slate-500">
              Steht eine Kostenträger-Nummer im Text, wird die Baustelle daraus erkannt.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Fotos</Label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={addPhotos}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => photoInputRef.current?.click()}
              disabled={sending}
              className="h-14 w-full text-base"
            >
              <Camera className="mr-2 h-5 w-5" />
              Foto aufnehmen oder auswählen
            </Button>

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                {photos.map((photo, index) => (
                  <div key={`${photo.name}-${index}`} className="relative">
                    <img
                      src={photoPreviews[index]}
                      alt={`Foto ${index + 1}`}
                      className="h-24 w-full rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      disabled={sending}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 p-1 text-white shadow"
                      aria-label="Foto entfernen"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Baustelle</Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={sending || loading}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Automatisch erkennen</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.cost_center_number
                        ? `${project.cost_center_number} – ${project.name}`
                        : project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Art</Label>
              <Select value={type} onValueChange={setType} disabled={sending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={submit} disabled={sending} className="h-14 w-full text-base">
            {sending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Wird verarbeitet …
              </>
            ) : (
              <>
                <Send className="mr-2 h-5 w-5" />
                Senden
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function describeMatch(method, confidence) {
  if (method === 'kostentraeger') return 'per Kostenträger-Nummer';
  if (method === 'manuell') return 'von Hand gewählt';
  if (method === 'sitzung') return 'aus dem Chat-Kontext';
  if (method === 'ki') return `erkannt (${Math.round((confidence ?? 0) * 100)} %)`;
  return 'zugeordnet';
}
