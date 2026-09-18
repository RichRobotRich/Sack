import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  FileText,
  ClipboardCheck,
  StickyNote,
  CheckSquare,
  Building2,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import PullToRefresh from '@/components/PullToRefresh';
import EntryEditor from '@/components/assistant/EntryEditor';

/**
 * Liste der erzeugten Einträge.
 *
 * Die Ansicht "Zu prüfen" ist die wichtigste und deshalb die erste: alles
 * Automatische ist ein Vorschlag, bis ihn jemand gesehen hat. Gleich daneben
 * "Ohne Projekt" – das sind die Fälle, bei denen die Zuordnung nicht griff und
 * die sonst unbemerkt liegen bleiben.
 */

const TYPE_META = {
  protokoll: { label: 'Protokoll', icon: FileText, className: 'bg-blue-50 text-blue-700 border-blue-200' },
  bericht: { label: 'Bericht', icon: ClipboardCheck, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  notiz: { label: 'Notiz', icon: StickyNote, className: 'bg-slate-50 text-slate-700 border-slate-200' },
  todo: { label: 'ToDo', icon: CheckSquare, className: 'bg-green-50 text-green-700 border-green-200' },
};

const VIEWS = [
  { id: 'review', label: 'Zu prüfen' },
  { id: 'unassigned', label: 'Ohne Projekt' },
  { id: 'todo', label: 'ToDos' },
  { id: 'all', label: 'Alle' },
];

export default function AssistantEntries() {
  const [entries, setEntries] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('review');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const loadData = async () => {
    try {
      const [entryRows, projectRows] = await Promise.all([
        api.entities.Entry.list('-created_date'),
        api.entities.Project.list('name'),
      ]);
      setEntries(entryRows);
      setProjects(projectRows);
    } catch (error) {
      toast.error(`Einträge nicht geladen: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project])),
    [projects],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (entry.status === 'archiviert' && view !== 'all') return false;
      if (view === 'review' && !entry.needs_review) return false;
      if (view === 'unassigned' && entry.project_id) return false;
      if (view === 'todo' && entry.type !== 'todo') return false;

      if (!needle) return true;
      const haystack = [
        entry.title,
        entry.body_md,
        projectsById[entry.project_id]?.name,
        projectsById[entry.project_id]?.cost_center_number,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, view, search, projectsById]);

  const counts = useMemo(() => ({
    review: entries.filter((entry) => entry.needs_review && entry.status !== 'archiviert').length,
    unassigned: entries.filter((entry) => !entry.project_id && entry.status !== 'archiviert').length,
  }), [entries]);

  const applyUpdate = (updated) => {
    setEntries((current) => (updated._deleted
      ? current.filter((entry) => entry.id !== updated.id)
      : current.map((entry) => (entry.id === updated.id ? updated : entry))));
    setSelected(null);
  };

  return (
    <PullToRefresh onRefresh={loadData}>
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Einträge</h1>
          <p className="text-sm text-slate-500">
            Protokolle, Berichte, Notizen und Aufgaben aus den eingegangenen Meldungen.
          </p>
        </div>

        <Tabs value={view} onValueChange={setView}>
          <TabsList className="grid w-full grid-cols-4">
            {VIEWS.map((item) => (
              <TabsTrigger key={item.id} value={item.id} className="text-xs sm:text-sm">
                {item.label}
                {counts[item.id] > 0 && (
                  <span className="ml-1.5 rounded-full bg-slate-900 px-1.5 text-[10px] text-white">
                    {counts[item.id]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Suchen in Titel, Text und Baustelle"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((index) => <Skeleton key={index} className="h-24 w-full rounded-lg" />)}
          </div>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              {view === 'review'
                ? 'Nichts zu prüfen – alle Einträge sind freigegeben.'
                : 'Keine Einträge in dieser Ansicht.'}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visible.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                project={projectsById[entry.project_id]}
                onOpen={() => setSelected(entry)}
              />
            ))}
          </div>
        )}
      </div>

      {selected && (
        <EntryEditor
          entry={selected}
          projects={projects}
          onClose={() => setSelected(null)}
          onSaved={applyUpdate}
        />
      )}
    </PullToRefresh>
  );
}

function EntryCard({ entry, project, onOpen }) {
  const meta = TYPE_META[entry.type] ?? TYPE_META.notiz;
  const Icon = meta.icon;

  return (
    <Card className="cursor-pointer transition hover:shadow-md" onClick={onOpen}>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <h3 className="truncate font-medium text-slate-900">
              {entry.title || 'Ohne Titel'}
            </h3>
          </div>
          <Badge variant="outline" className={`shrink-0 ${meta.className}`}>{meta.label}</Badge>
        </div>

        {entry.body_md && (
          <p className="line-clamp-2 text-sm text-slate-600">{entry.body_md}</p>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>
            {entry.entry_date
              ? format(parseISO(entry.entry_date), 'EEEEEE, d. MMM yyyy', { locale: de })
              : '–'}
          </span>

          {project ? (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {project.name}
            </span>
          ) : (
            <span className="flex items-center gap-1 font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              ohne Projekt
            </span>
          )}

          {entry.source === 'whatsapp' && <span>WhatsApp</span>}
          {entry.needs_review && (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">
              zu prüfen
            </Badge>
          )}
          {entry.type === 'todo' && entry.due_date && (
            <span>fällig {format(parseISO(entry.due_date), 'd. MMM', { locale: de })}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
