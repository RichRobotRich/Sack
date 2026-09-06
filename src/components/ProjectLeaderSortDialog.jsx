import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, ArrowUpDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const STORAGE_KEY = 'pl_sort_order';

export function loadPlSortOrder() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function savePlSortOrder(order) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
}

/**
 * Gibt den Index zurück, an dem die Pool-Zeile eingefügt werden soll
 * (Anzahl PL-Gruppen vor der Pool-Position).
 * plSortOrder enthält '__pool__' als speziellen Eintrag.
 * getAbbr: Funktion (project) => string
 */
export function getPoolSplitIndex(projects, plSortOrder, getAbbr) {
  if (!plSortOrder || plSortOrder.length === 0) {
    // Default: nach dem 3. PL
    const seen = new Set();
    for (let i = 0; i < projects.length; i++) {
      const abbr = getAbbr(projects[i]) || '-';
      seen.add(abbr);
      if (seen.size === 3) {
        let idx = i + 1;
        while (idx < projects.length && (getAbbr(projects[idx]) || '-') === abbr) idx++;
        return idx;
      }
    }
    return projects.length;
  }
  const poolPos = plSortOrder.indexOf('__pool__');
  if (poolPos === -1) {
    // Pool nicht in Reihenfolge → ans Ende
    return projects.length;
  }
  // PL-Kürzel vor __pool__
  const plsBefore = plSortOrder.slice(0, poolPos).filter(k => k !== '__pool__');
  // Finde letzten Projekt-Index der zu einem PL-Kürzel aus plsBefore gehört
  let lastIdx = 0;
  for (let i = 0; i < projects.length; i++) {
    const abbr = getAbbr(projects[i]) || '';
    if (plsBefore.includes(abbr)) lastIdx = i + 1;
  }
  return lastIdx;
}

/**
 * Sortiert Projekte nach gespeicherter PL-Reihenfolge.
 * plSortOrder: Array von PL-Kürzeln (und '__pool__') in gewünschter Reihenfolge
 * getAbbr: Funktion (project) => string
 */
export function sortProjectsByPlOrder(projects, plSortOrder, getAbbr) {
  if (!plSortOrder || plSortOrder.length === 0) return projects;
  const order = plSortOrder.filter(k => k !== '__pool__');
  return [...projects].sort((a, b) => {
    const abbrA = getAbbr(a) || '';
    const abbrB = getAbbr(b) || '';
    const idxA = order.indexOf(abbrA);
    const idxB = order.indexOf(abbrB);
    const rankA = idxA === -1 ? 9999 : idxA;
    const rankB = idxB === -1 ? 9999 : idxB;
    if (rankA !== rankB) return rankA - rankB;
    return abbrA.localeCompare(abbrB);
  });
}

const POOL_ITEM = { abbreviation: '__pool__', full_name: 'POOL (Nicht eingeplant)', isPool: true };

export default function ProjectLeaderSortDialog({ open, onOpenChange, projectLeaders, onSave }) {
  // projectLeaders: Array von { abbreviation, full_name }
  // items enthält auch das spezielle POOL_ITEM
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!open) return;
    const stored = loadPlSortOrder();
    const allAbbrs = [...projectLeaders.map(pl => pl.abbreviation), '__pool__'];
    if (stored && stored.length > 0) {
      // Merge: stored order first, then new PLs not yet in stored (Pool bleibt an gespeicherter Position)
      const ordered = [
        ...stored.filter(abbr => allAbbrs.includes(abbr)),
        ...projectLeaders
          .filter(pl => !stored.includes(pl.abbreviation))
          .map(pl => pl.abbreviation),
        // Pool hinzufügen falls nicht in stored
        ...(!stored.includes('__pool__') ? ['__pool__'] : [])
      ];
      setItems(ordered.map(abbr => {
        if (abbr === '__pool__') return POOL_ITEM;
        return projectLeaders.find(pl => pl.abbreviation === abbr);
      }).filter(Boolean));
    } else {
      // Kein gespeicherter State: PLs + Pool am Ende
      setItems([...projectLeaders, POOL_ITEM]);
    }
  }, [open, projectLeaders]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;
    const reordered = Array.from(items);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    setItems(reordered);
  };

  const handleSave = () => {
    const order = items.map(pl => pl.abbreviation);
    savePlSortOrder(order);
    onSave(order);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpDown className="w-5 h-5" />
            Projektleiter-Reihenfolge
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500 -mt-2 mb-2">
          Ziehen Sie die Projektleiter und die Pool-Zeile in die gewünschte Reihenfolge.
        </p>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="pl-sort">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-1 max-h-96 overflow-y-auto"
              >
                {items.map((pl, index) => (
                  <Draggable key={pl.abbreviation} draggableId={pl.abbreviation} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors select-none ${
                          snapshot.isDragging
                            ? 'bg-blue-50 border-blue-300 shadow-md'
                            : pl.isPool
                              ? 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100'
                              : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600'
                        }`}
                      >
                        <GripVertical className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-xs font-bold flex-shrink-0 ${
                          pl.isPool ? 'bg-yellow-400 text-yellow-900' : 'bg-[#1e3a5f] text-white'
                        }`}>
                          {pl.isPool ? 'P' : pl.abbreviation}
                        </span>
                        <span className="text-sm text-gray-700 dark:text-gray-200 truncate">
                          {pl.full_name}
                        </span>
                        <span className="ml-auto text-xs text-gray-400">{index + 1}</span>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleSave} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
            Reihenfolge speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}