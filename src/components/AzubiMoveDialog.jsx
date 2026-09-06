import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Fragt ob ein Azubi (der dem verschobenen Monteur zugeordnet ist) mit verschoben werden soll.
 * Props:
 *  - open
 *  - onClose
 *  - mentor: Employee (der Monteur der bewegt wird)
 *  - azubis: Employee[] (die Azubis dieses Monteurs, die an diesem Tag NICHT abwesend sind)
 *  - destProjectName: string
 *  - dateStr: string (Datum der Verschiebung)
 *  - onConfirm(moveAzubiIds: string[])
 */
export default function AzubiMoveDialog({ open, onClose, mentor, azubis, destProjectName, dateStr, onConfirm }) {
  const [selected, setSelected] = React.useState([]);

  React.useEffect(() => {
    if (open) {
      // Standardmäßig alle auswählen
      setSelected(azubis.map(a => a.id));
    }
  }, [open, azubis]);

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleConfirm = (withAzubis) => {
    onConfirm(withAzubis ? selected : []);
  };

  if (!mentor || !azubis?.length) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Azubi mitverschieben?</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-gray-600">
            <span className="font-medium">{mentor.full_name}</span> hat folgende Azubi{azubis.length > 1 ? 's' : ''} zugeordnet.
            Soll{azubis.length > 1 ? 'en' : ''} der Azubi ebenfalls nach <span className="font-medium">{destProjectName}</span> verschoben werden?
          </p>
          <div className="space-y-2">
            {azubis.map(azubi => (
              <label key={azubi.id} className="flex items-center gap-3 p-2 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.includes(azubi.id)}
                  onChange={() => toggle(azubi.id)}
                  className="w-4 h-4 accent-blue-500"
                />
                <span className="text-sm font-medium">{azubi.full_name}</span>
                {azubi.apprentice_year && (
                  <span className="text-xs text-gray-400 ml-auto">{azubi.apprentice_year}. Lehrjahr</span>
                )}
              </label>
            ))}
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => handleConfirm(false)} className="flex-1">
            Nur Monteur
          </Button>
          <Button onClick={() => handleConfirm(true)} disabled={selected.length === 0} className="flex-1">
            Ja, mit verschoben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}