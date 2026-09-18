import React, { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '@/api/client';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Upload, FileText, RefreshCw, Trash2, CheckCircle2, AlertTriangle, Clock, Loader2, HelpCircle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

/**
 * Verwaltung der Wissensdatenbank.
 *
 * Zwei Ansichten. *Dokumente* zeigt, was hinterlegt ist und ob es eingelesen
 * werden konnte. *Ohne Antwort* zeigt die Fragen, auf die das System nichts
 * gefunden hat – das sind die Lücken in der Ablage, und die interessantere
 * der beiden Listen: sie sagt, welches Dokument als Nächstes fehlt.
 */

const ERLAUBT = '.pdf,.docx,.xlsx,.xlsm,.csv,.txt,.md';

const STATUS = {
  neu: { label: 'wartet', icon: Clock, className: 'border-slate-200 text-slate-600' },
  indiziert: { label: 'eingelesen', icon: CheckCircle2, className: 'border-green-200 bg-green-50 text-green-700' },
  fehler: { label: 'Fehler', icon: AlertTriangle, className: 'border-red-200 bg-red-50 text-red-700' },
  veraltet: { label: 'veraltet', icon: Clock, className: 'border-amber-200 bg-amber-50 text-amber-700' },
};

const lesbareGroesse = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState([]);
  const [offeneFragen, setOffeneFragen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState('dokumente');
  const fileInputRef = useRef(null);

  const loadData = async () => {
    try {
      const [documentRows, queryRows] = await Promise.all([
        api.entities.KnowledgeDocument.list('-created_date'),
        api.entities.KnowledgeQuery.filter({ answered: false }, '-created_date'),
      ]);
      setDocuments(documentRows);
      setOffeneFragen(queryRows.slice(0, 50));
    } catch (error) {
      toast.error(`Nicht geladen: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const zahlen = useMemo(() => ({
    indiziert: documents.filter((document) => document.status === 'indiziert').length,
    fehler: documents.filter((document) => document.status === 'fehler').length,
    abschnitte: documents.reduce((summe, document) => summe + (document.chunk_count ?? 0), 0),
  }), [documents]);

  const upload = async (event) => {
    const dateien = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (dateien.length === 0) return;

    setBusy(true);
    try {
      for (const datei of dateien) {
        const abgelegt = await api.assistant.uploadFile(datei, { prefix: 'wissen' });
        const angelegt = await api.entities.KnowledgeDocument.create({
          title: datei.name.replace(/\.[^.]+$/, ''),
          file_name: datei.name,
          mime_type: datei.type || null,
          byte_size: datei.size,
          storage_path: abgelegt.path,
          status: 'neu',
        });
        setDocuments((current) => [angelegt, ...current]);
      }

      toast.success(`${dateien.length} Dokument(e) hochgeladen – wird eingelesen`);

      // Direkt anstoßen, statt auf den Zeitplan zu warten: ein gerade
      // hochgeladenes Dokument soll in Sekunden auffindbar sein, nicht in
      // fünf Minuten.
      await api.functions.invoke('indexKnowledge', {});
      await loadData();
    } catch (error) {
      toast.error(`Upload fehlgeschlagen: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const neuEinlesen = async (document) => {
    setBusy(true);
    try {
      await api.entities.KnowledgeDocument.update(document.id, { status: 'neu', error: null });
      await api.functions.invoke('indexKnowledge', { document_id: document.id });
      await loadData();
      toast.success('Neu eingelesen');
    } catch (error) {
      toast.error(`Einlesen fehlgeschlagen: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const entfernen = async (document) => {
    if (!window.confirm(`„${document.title}" wirklich entfernen? Die Abschnitte werden mitgelöscht.`)) return;
    try {
      await api.entities.KnowledgeDocument.delete(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      toast.success('Entfernt');
    } catch (error) {
      toast.error(`Löschen fehlgeschlagen: ${error.message}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Wissensdatenbank</h1>
          <p className="text-sm text-slate-500">
            {zahlen.indiziert} eingelesen, {zahlen.abschnitte} Abschnitte
            {zahlen.fehler > 0 && `, ${zahlen.fehler} mit Fehler`}
          </p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ERLAUBT}
            multiple
            onChange={upload}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Hochladen
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={setView}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dokumente">Dokumente</TabsTrigger>
          <TabsTrigger value="luecken">
            Ohne Antwort
            {offeneFragen.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[10px] text-white">
                {offeneFragen.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => <Skeleton key={index} className="h-20 w-full rounded-lg" />)}
        </div>
      ) : view === 'dokumente' ? (
        documents.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              Noch nichts hinterlegt. Möglich sind PDF, Word, Excel, CSV und Textdateien.
              <br />
              Gescannte PDFs ohne Textebene werden erkannt und ausdrücklich abgelehnt –
              dafür wäre Texterkennung nötig.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {documents.map((document) => {
              const status = STATUS[document.status] ?? STATUS.neu;
              const StatusIcon = status.icon;
              return (
                <Card key={document.id}>
                  <CardContent className="space-y-2 py-3">
                    <div className="flex items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-900">{document.title}</p>
                        <p className="text-xs text-slate-500">
                          {[
                            document.file_name,
                            lesbareGroesse(document.byte_size),
                            document.chunk_count ? `${document.chunk_count} Abschnitte` : null,
                            document.page_count ? `${document.page_count} Seiten` : null,
                          ].filter(Boolean).join(' · ')}
                        </p>
                        {document.indexed_at && (
                          <p className="text-xs text-slate-400">
                            eingelesen {format(parseISO(document.indexed_at), 'd. MMM, HH:mm', { locale: de })}
                          </p>
                        )}
                      </div>

                      <Badge variant="outline" className={`shrink-0 ${status.className}`}>
                        <StatusIcon className="mr-1 h-3 w-3" />
                        {status.label}
                      </Badge>

                      <Button variant="ghost" size="icon" onClick={() => neuEinlesen(document)} disabled={busy}>
                        <RefreshCw className="h-4 w-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => entfernen(document)}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>

                    {document.error && (
                      <p className="rounded bg-red-50 p-2 text-xs text-red-700">{document.error}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : offeneFragen.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-slate-500">
            Auf jede gestellte Frage gab es eine belegte Antwort.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Auf diese Fragen wurde nichts gefunden. Jede Zeile ist ein Hinweis darauf,
            welches Dokument in der Ablage fehlt.
          </p>
          {offeneFragen.map((frage) => (
            <Card key={frage.id}>
              <CardContent className="flex items-start gap-3 py-3">
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{frage.question}</p>
                  <p className="text-xs text-slate-400">
                    {format(parseISO(frage.created_date), 'd. MMM, HH:mm', { locale: de })}
                    {frage.channel === 'whatsapp' ? ' · WhatsApp' : ''}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
