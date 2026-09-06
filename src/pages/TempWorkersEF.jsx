import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, startOfWeek, addWeeks, getWeek, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import jsPDF from 'jspdf';
import {
  UserPlus,
  Plus,
  Building2,
  X,
  Edit2,
  Phone,
  Briefcase,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export default function TempWorkersEF() {
  const [tempWorkers, setTempWorkers] = useState([]);
  const [tempAssignments, setTempAssignments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectRows, setProjectRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addProjectDialogOpen, setAddProjectDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [weekDialogOpen, setWeekDialogOpen] = useState(false);
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(null);
  const [selectedProjectRow, setSelectedProjectRow] = useState(null);
  const [selectedWorkers, setSelectedWorkers] = useState([]);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState({ projectId: null, notes: '' });
  const [workerDialogOpen, setWorkerDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [workerForm, setWorkerForm] = useState({ full_name: '', agency: '', phone: '', skills: '', is_ef: true });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [workersData, assignmentsData, projectsData, rowsData] = await Promise.all([
        api.entities.TempWorker.filter({ is_active: true, is_ef: true }),
        api.entities.TempAssignment.list(),
        api.entities.Project.filter({ status: 'aktiv', is_ef_project: true }),
        api.entities.TempWorkerProjectRow.list()
      ]);
      
      // Filter nur EF-Projekt-Zeilen
      const efProjectIds = projectsData.map(p => p.id);
      const efRows = rowsData.filter(row => efProjectIds.includes(row.project_id));
      
      setTempWorkers(workersData);
      setTempAssignments(assignmentsData);
      setProjects(projectsData);
      setProjectRows(efRows);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProject = (id) => projects.find(p => p.id === id);
  const getTempWorker = (id) => tempWorkers.find(w => w.id === id);

  const currentWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weeks = Array.from({ length: 9 }, (_, i) => {
    const weekStart = addWeeks(currentWeek, i);
    const weekEnd = addDays(weekStart, 4);
    return {
      weekStart,
      weekEnd,
      weekNumber: getWeek(weekStart, { weekStartsOn: 1, firstWeekContainsDate: 4 }),
      weekStartStr: format(weekStart, 'yyyy-MM-dd')
    };
  });

  const handleAddProject = async () => {
    if (!selectedProject) return;
    
    try {
      await api.entities.TempWorkerProjectRow.create({
        project_id: selectedProject,
        notes: ''
      });
      setAddProjectDialogOpen(false);
      setSelectedProject('');
      loadData();
    } catch (error) {
      console.error('Error adding project:', error);
    }
  };

  const handleRemoveProjectRow = async (rowId) => {
    try {
      await api.entities.TempWorkerProjectRow.delete(rowId);
      loadData();
    } catch (error) {
      console.error('Error removing project row:', error);
    }
  };

  const openWeekDialog = (projectRow, weekIndex) => {
    setSelectedProjectRow(projectRow);
    setSelectedWeekIndex(weekIndex);
    
    const weekStr = weeks[weekIndex].weekStartStr;
    const existingAssignments = tempAssignments.filter(
      a => a.project_id === projectRow.project_id && a.week_start === weekStr
    );
    setSelectedWorkers(existingAssignments.map(a => a.temp_worker_id));
    setWeekDialogOpen(true);
  };

  const handleSaveWeekAssignments = async () => {
    if (selectedProjectRow === null || selectedWeekIndex === null) return;
    
    try {
      const weekStr = weeks[selectedWeekIndex].weekStartStr;
      const projectId = selectedProjectRow.project_id;
      
      const existingAssignments = tempAssignments.filter(
        a => a.project_id === projectId && a.week_start === weekStr
      );
      
      for (const assignment of existingAssignments) {
        if (!selectedWorkers.includes(assignment.temp_worker_id)) {
          await api.entities.TempAssignment.delete(assignment.id);
        }
      }
      
      for (const workerId of selectedWorkers) {
        const exists = existingAssignments.find(a => a.temp_worker_id === workerId);
        if (!exists) {
          await api.entities.TempAssignment.create({
            temp_worker_id: workerId,
            project_id: projectId,
            week_start: weekStr,
            days: []
          });
        }
      }
      
      setWeekDialogOpen(false);
      setSelectedWorkers([]);
      loadData();
    } catch (error) {
      console.error('Error saving week assignments:', error);
    }
  };

  const toggleWorkerSelection = (workerId) => {
    setSelectedWorkers(prev => 
      prev.includes(workerId) 
        ? prev.filter(id => id !== workerId)
        : [...prev, workerId]
    );
  };

  const openNotesDialog = (projectRow) => {
    setEditingNotes({ projectId: projectRow.id, notes: projectRow.notes || '' });
    setNotesDialogOpen(true);
  };

  const handleSaveNotes = async () => {
    try {
      await api.entities.TempWorkerProjectRow.update(editingNotes.projectId, {
        notes: editingNotes.notes
      });
      setNotesDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  };

  const generatePDF = () => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const margin = 10;
    let y = margin;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - 2 * margin;

    // Title
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Zusatzpersonal EF - Planung', margin, y);
    y += 8;

    // Week range
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    const firstWeek = weeks[0];
    const lastWeek = weeks[weeks.length - 1];
    doc.text(`${format(firstWeek.weekStart, 'dd.MM.yyyy')} - ${format(lastWeek.weekEnd, 'dd.MM.yyyy')}`, margin, y);
    y += 8;

    // Table
    const colWidth = contentWidth / (weeks.length + 2);
    const rowHeight = 6;

    // Header row
    doc.setFontSize(8);
    doc.setFont(undefined, 'bold');
    doc.rect(margin, y, colWidth * 2, rowHeight);
    doc.text('Baustelle', margin + 2, y + 4);

    weeks.forEach((week, idx) => {
      const x = margin + colWidth * (2 + idx);
      doc.rect(x, y, colWidth, rowHeight);
      doc.text(`KW ${week.weekNumber}`, x + 2, y + 4, { maxWidth: colWidth - 4 });
    });

    y += rowHeight;

    // Data rows
    doc.setFont(undefined, 'normal');
    projectRows.forEach((projectRow) => {
      const project = getProject(projectRow.project_id);
      if (!project) return;

      // Project name
      doc.rect(margin, y, colWidth * 2, rowHeight);
      doc.text(project.name, margin + 2, y + 4, { maxWidth: colWidth * 2 - 4 });

      // Week assignments
      weeks.forEach((week, idx) => {
        const x = margin + colWidth * (2 + idx);
        doc.rect(x, y, colWidth, rowHeight);
        
        const weekAssignments = tempAssignments.filter(
          a => a.project_id === projectRow.project_id && a.week_start === week.weekStartStr
        );
        
        const workerNames = weekAssignments
          .map(a => getTempWorker(a.temp_worker_id)?.full_name || 'Unbekannt')
          .join(', ');
        
        doc.setFontSize(7);
        doc.text(workerNames, x + 2, y + 4, { maxWidth: colWidth - 4 });
        doc.setFontSize(8);
      });

      y += rowHeight;

      // Check for new page
      if (y > pageHeight - margin - rowHeight) {
        doc.addPage();
        y = margin;
      }
    });

    doc.save(`Zusatzpersonal_EF_${format(weeks[0].weekStart, 'yyyy-MM-dd')}.pdf`);
  };

  const openWorkerDialog = (worker = null) => {
    setEditingWorker(worker);
    setWorkerForm(worker ? {
      full_name: worker.full_name || '',
      agency: worker.agency || '',
      phone: worker.phone || '',
      skills: worker.skills || '',
      is_ef: worker.is_ef !== false
    } : { full_name: '', agency: '', phone: '', skills: '', is_ef: true });
    setWorkerDialogOpen(true);
  };

  const handleSaveWorker = async () => {
    if (!workerForm.full_name) return;
    
    try {
      if (editingWorker) {
        await api.entities.TempWorker.update(editingWorker.id, workerForm);
      } else {
        await api.entities.TempWorker.create({ ...workerForm, is_active: true });
      }
      setWorkerDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Error saving worker:', error);
    }
  };

  const handleDeactivateWorker = async (workerId) => {
    try {
      await api.entities.TempWorker.update(workerId, { is_active: false });
      loadData();
    } catch (error) {
      console.error('Error deactivating worker:', error);
    }
  };

  const handleRemoveWorkerFromWeek = async (assignmentId, e) => {
    e.stopPropagation();
    try {
      await api.entities.TempAssignment.delete(assignmentId);
      loadData();
    } catch (error) {
      console.error('Error removing worker from week:', error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
            <UserPlus className="w-8 h-8 dark:text-blue-300" />
            Zusatzpersonal EF
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Leiharbeiter verwalten und einplanen (nur EF)
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => openWorkerDialog()}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
          >
            <UserPlus className="w-4 h-4 mr-2" />
            EF Leiharbeiter anlegen
          </Button>
          <Button 
            onClick={() => setAddProjectDialogOpen(true)}
            variant="outline"
            className="hidden lg:flex"
          >
            <Plus className="w-4 h-4 mr-2" />
            EF Baustelle hinzufügen
          </Button>
          <Button 
            onClick={() => setAddProjectDialogOpen(true)}
            variant="outline"
            size="sm"
            className="lg:hidden"
          >
            <Plus className="w-4 h-4 mr-1" />
            Baustelle
          </Button>
          <Button 
            onClick={generatePDF}
            variant="outline"
            className="hidden lg:flex"
          >
            <FileText className="w-4 h-4 mr-2" />
            PDF Export
          </Button>
          <Button 
            onClick={generatePDF}
            variant="outline"
            size="icon"
            className="lg:hidden"
          >
            <FileText className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="hidden print-only text-center mb-4">
        <h1 className="text-xl font-bold">Zusatzpersonal EF - Planung</h1>
        <p className="text-sm">9-Wochen-Übersicht</p>
      </div>

      <Card className="border-0 shadow-sm no-print dark:bg-gray-800 dark:border-gray-700">
        <CardHeader>
          <CardTitle className="text-lg dark:text-white">Verfügbare EF Leiharbeiter</CardTitle>
        </CardHeader>
        <CardContent>
          {tempWorkers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <UserPlus className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>Keine EF Leiharbeiter angelegt</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {tempWorkers.map((worker) => (
                <div 
                  key={worker.id} 
                  className="p-4 bg-gray-50 dark:bg-gray-700 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{worker.full_name}</h3>
                      {worker.agency && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                          <Briefcase className="w-3 h-3" />
                          {worker.agency}
                        </p>
                      )}
                      {worker.phone && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {worker.phone}
                        </p>
                      )}
                      {worker.skills && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{worker.skills}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openWorkerDialog(worker)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500"
                        onClick={() => handleDeactivateWorker(worker.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm overflow-x-auto dark:bg-gray-800 dark:border-gray-700">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50 dark:bg-gray-900">
              <TableHead className="w-48 sticky left-0 bg-gray-50 dark:bg-gray-900 z-10 dark:text-gray-300">EF Baustelle</TableHead>
              {weeks.map((week, idx) => (
                <TableHead key={idx} className="text-center min-w-32 dark:text-gray-300">
                  <div className="text-xs">
                    <div>{format(week.weekStart, 'MMM', { locale: de })}</div>
                    <div className="font-bold">KW {week.weekNumber}</div>
                    <div className="text-gray-500 dark:text-gray-400">
                      {format(week.weekStart, 'dd.MM')} - {format(week.weekEnd, 'dd.MM')}
                    </div>
                  </div>
                </TableHead>
              ))}
              <TableHead className="w-48 dark:text-gray-300">Bemerkung</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projectRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8 text-gray-500 dark:text-gray-400">
                  <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Keine EF Baustellen hinzugefügt</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2"
                    onClick={() => setAddProjectDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    EF Baustelle hinzufügen
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              projectRows.map((projectRow) => {
                const project = getProject(projectRow.project_id);
                if (!project) return null;
                
                return (
                  <TableRow key={projectRow.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
                    <TableCell className="sticky left-0 bg-white dark:bg-gray-800 z-10">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-gray-900 dark:text-white">{project.name}</div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-red-500 no-print"
                          onClick={() => handleRemoveProjectRow(projectRow.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    {weeks.map((week, weekIdx) => {
                      const weekAssignments = tempAssignments.filter(
                        a => a.project_id === projectRow.project_id && a.week_start === week.weekStartStr
                      );
                      
                      return (
                        <TableCell 
                          key={weekIdx} 
                          className="cursor-pointer hover:bg-blue-50 no-print-hover"
                          onClick={() => openWeekDialog(projectRow, weekIdx)}
                        >
                          <div className="flex flex-wrap gap-1">
                            {weekAssignments.map((assignment) => {
                              const worker = getTempWorker(assignment.temp_worker_id);
                              return (
                                <Badge 
                                  key={assignment.id} 
                                  variant="outline" 
                                  className="text-xs bg-blue-50 flex items-center gap-1 pr-1 no-print-badge"
                                >
                                  <span>{worker?.full_name || 'Unbekannt'}</span>
                                  <button
                                    className="hover:bg-red-100 rounded-full p-0.5 no-print"
                                    onClick={(e) => handleRemoveWorkerFromWeek(assignment.id, e)}
                                  >
                                    <X className="w-3 h-3 text-red-500" />
                                  </button>
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                      );
                    })}
                    <TableCell 
                      className="cursor-pointer hover:bg-amber-50 no-print-hover"
                      onClick={() => openNotesDialog(projectRow)}
                    >
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {projectRow.notes || <span className="text-gray-400 dark:text-gray-500 no-print">Klicken zum Bearbeiten</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={addProjectDialogOpen} onOpenChange={setAddProjectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>EF Baustelle hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
              style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
            >
              <option value="">EF Baustelle auswählen...</option>
              {projects
                .filter(p => !projectRows.some(row => row.project_id === p.id))
                .map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAddProjectDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleAddProject}
              disabled={!selectedProject}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              Hinzufügen
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={weekDialogOpen} onOpenChange={setWeekDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              EF Leiharbeiter für KW {selectedWeekIndex !== null ? weeks[selectedWeekIndex].weekNumber : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-2 max-h-96 overflow-y-auto">
            {tempWorkers.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                Keine EF Leiharbeiter verfügbar
              </p>
            ) : (
              tempWorkers.map(worker => (
                <div
                  key={worker.id}
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedWorkers.includes(worker.id)
                      ? 'border-[#1e3a5f] bg-[#1e3a5f]/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => toggleWorkerSelection(worker.id)}
                >
                  <div className="font-medium">{worker.full_name}</div>
                  {worker.agency && (
                    <div className="text-sm text-gray-500">{worker.agency}</div>
                  )}
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWeekDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSaveWeekAssignments}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bemerkung</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={editingNotes.notes}
              onChange={(e) => setEditingNotes({ ...editingNotes, notes: e.target.value })}
              placeholder="Bemerkungen eingeben..."
              rows={4}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSaveNotes}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={workerDialogOpen} onOpenChange={setWorkerDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingWorker ? 'EF Leiharbeiter bearbeiten' : 'Neuer EF Leiharbeiter'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={workerForm.full_name}
                onChange={(e) => setWorkerForm({...workerForm, full_name: e.target.value})}
                placeholder="Vollständiger Name"
              />
            </div>
            <div className="space-y-2">
              <Label>Leiharbeitsfirma</Label>
              <Input
                value={workerForm.agency}
                onChange={(e) => setWorkerForm({...workerForm, agency: e.target.value})}
                placeholder="z.B. Randstad, Adecco"
              />
            </div>
            <div className="space-y-2">
              <Label>Telefon</Label>
              <Input
                value={workerForm.phone}
                onChange={(e) => setWorkerForm({...workerForm, phone: e.target.value})}
                placeholder="Telefonnummer"
              />
            </div>
            <div className="space-y-2">
              <Label>Qualifikationen</Label>
              <Textarea
                value={workerForm.skills}
                onChange={(e) => setWorkerForm({...workerForm, skills: e.target.value})}
                placeholder="z.B. Elektrofachkraft, Führerschein BE"
                rows={2}
              />
            </div>
            <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl">
              <div>
                <Label className="text-blue-700">EF Leiharbeiter</Label>
                <p className="text-sm text-blue-600">Leiharbeiter ist als EF gekennzeichnet</p>
              </div>
              <Switch
                checked={workerForm.is_ef}
                onCheckedChange={(checked) => setWorkerForm({...workerForm, is_ef: checked})}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWorkerDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSaveWorker}
              disabled={!workerForm.full_name}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              Speichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 1cm; }
          body { font-size: 10px; }
          .shadow-sm { box-shadow: none !important; }
          table { font-size: 9px; }
          th, td { padding: 4px !important; }
          .print-only { display: block !important; }
          .no-print-hover:hover { background: none !important; }
          .no-print-badge { padding-right: 0.5rem !important; }
        }
        .print-only { display: none; }
      `}</style>
    </div>
  );
}