import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * Wird gezeigt wenn ein Monteur auf eine andere Baustelle gezogen wird
 * und er Teil einer Kolonne ist.
 * 
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   movedEmployee: Employee
 *   crewMembers: Employee[] – die anderen Mitglieder der Kolonne (ohne den gerade gezogenen)
 *   destProjectName: string
 *   dateStr: string
 *   onConfirm: (additionalEmployeeIds: string[]) => void
 */
export default function CrewMoveDialog({ open, onClose, movedEmployee, crewMembers, destProjectName, dateStr, onConfirm }) {
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    if (open) {
      // Standardmäßig alle auswählen
      setSelected(crewMembers.map(e => e.id));
    }
  }, [open, crewMembers]);

  const toggle = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Kolonne mitbewegen?
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="font-semibold">{movedEmployee?.full_name}</span> gehört zu einer Kolonne.
            Sollen diese Mitglieder ebenfalls nach <span className="font-semibold">{destProjectName}</span> verschoben werden?
          </p>
          <div className="space-y-2 border rounded-lg p-3">
            {crewMembers.map(emp => (
              <label key={emp.id} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={selected.includes(emp.id)}
                  onCheckedChange={() => toggle(emp.id)}
                />
                <span className="text-sm">{emp.full_name}</span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onConfirm([])}>Nein, nur {movedEmployee?.full_name?.split(' ')[0]}</Button>
          <Button
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
          >
            Ja, {selected.length} weitere mitbewegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}