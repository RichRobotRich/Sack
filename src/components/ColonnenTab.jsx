import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Plus, Edit2, Trash2, Users, X, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function ColonnenTab({ employees }) {
  const [crews, setCrews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCrew, setEditingCrew] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [crewName, setCrewName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');

  const monteure = employees
    .filter(e => e.employee_type === 'monteur' && e.is_active !== false && !e.is_ef)
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de'));

  useEffect(() => {
    loadCrews();
  }, []);

  const loadCrews = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.Crew.list();
      setCrews(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingCrew(null);
    setCrewName('');
    setSelectedIds([]);
    setSearch('');
    setDialogOpen(true);
  };

  const openEdit = (crew) => {
    setEditingCrew(crew);
    setCrewName(crew.name || '');
    setSelectedIds(crew.member_ids || []);
    setSearch('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!crewName.trim()) return;
    try {
      if (editingCrew) {
        await base44.entities.Crew.update(editingCrew.id, { name: crewName.trim(), member_ids: selectedIds });
      } else {
        await base44.entities.Crew.create({ name: crewName.trim(), member_ids: selectedIds });
      }
      setDialogOpen(false);
      loadCrews();
      toast.success('Kolonne gespeichert');
    } catch {
      toast.error('Fehler beim Speichern');
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    try {
      await base44.entities.Crew.delete(deleteDialog.id);
      setDeleteDialog({ open: false, id: null });
      loadCrews();
      toast.success('Kolonne gelöscht');
    } catch {
      toast.error('Fehler beim Löschen');
    }
  };

  const toggleMember = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getEmployeeName = (id) => employees.find(e => e.id === id)?.full_name || id;

  const filteredMonteure = monteure.filter(e =>
    e.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-gray-500 dark:text-gray-400 text-sm">{crews.length} Kolonnen</p>
        <Button onClick={openCreate} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
          <Plus className="w-4 h-4 mr-2" />
          Kolonne anlegen
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-xl animate-pulse" />)}
        </div>
      ) : crews.length === 0 ? (
        <Card className="border-0 shadow-sm dark:bg-gray-800">
          <CardContent className="py-16 text-center">
            <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">Noch keine Kolonnen angelegt</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {crews.map(crew => {
            const members = (crew.member_ids || []).map(id => getEmployeeName(id));
            return (
              <Card key={crew.id} className="border-0 shadow-sm dark:bg-gray-800">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-gray-900 dark:text-white">{crew.name}</p>
                        <Badge variant="outline" className="text-xs">{members.length} Monteure</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {members.map((name, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-700 dark:text-gray-300">
                            {name}
                          </span>
                        ))}
                        {members.length === 0 && <span className="text-xs text-gray-400">Keine Mitglieder</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(crew)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => setDeleteDialog({ open: true, id: crew.id })}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingCrew ? 'Kolonne bearbeiten' : 'Neue Kolonne'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label>Name der Kolonne *</Label>
              <Input
                value={crewName}
                onChange={(e) => setCrewName(e.target.value)}
                placeholder="z.B. Kolonne Müller"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Mitglieder ({selectedIds.length} ausgewählt)</Label>
              <Input
                placeholder="Suchen..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <div className="max-h-64 overflow-y-auto space-y-1 border rounded-lg p-2">
                {filteredMonteure.map(emp => {
                  const selected = selectedIds.includes(emp.id);
                  return (
                    <button
                      key={emp.id}
                      onClick={() => toggleMember(emp.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        selected
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span>{emp.full_name}</span>
                    </button>
                  );
                })}
                {filteredMonteure.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Keine Monteure gefunden</p>}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSave} disabled={!crewName.trim()} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kolonne löschen?</AlertDialogTitle>
            <AlertDialogDescription>Möchten Sie diese Kolonne wirklich löschen? Bestehende Einsätze bleiben unverändert.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Löschen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}