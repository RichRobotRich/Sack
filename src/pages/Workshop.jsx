import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, isPast, isToday, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Wrench,
  Plus,
  Calendar,
  Building2,
  Clock,
  CheckCircle,
  Circle,
  AlertTriangle,
  Truck,
  Edit2,
  Trash2,
  Filter,
  FileText
} from 'lucide-react';
import jsPDF from 'jspdf';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Workshop() {
  const [tasks, setTasks] = useState([]);
   const [projects, setProjects] = useState([]);
   const [employees, setEmployees] = useState([]);
   const [assignments, setAssignments] = useState([]);
   const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [submitting, setSubmitting] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [statusFilter, setStatusFilter] = useState('offen');

  const [form, setForm] = useState({
    title: '',
    project_id: '',
    due_date: null,
    due_date_text: '',
    priority: 'normal',
    assigned_to: '',
    notes: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tasksData, projectsData, employeesData, assignmentsData] = await Promise.all([
        api.entities.WorkshopTask.list('-due_date'),
        api.entities.Project.list(),
        api.entities.Employee.list(),
        api.entities.Assignment.filter({})
      ]);
      setTasks(tasksData);
      setProjects(projectsData);
      setEmployees(employeesData);
      setAssignments(assignmentsData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProject = (id) => projects.find(p => p.id === id);
  const getEmployee = (id) => employees.find(e => e.id === id);

  const filteredTasks = tasks.filter(task => {
    if (statusFilter === 'alle') return true;
    return task.status === statusFilter;
  }).sort((a, b) => {
    // Sort by due date, then by priority
    const dateA = new Date(a.due_date);
    const dateB = new Date(b.due_date);
    if (dateA < dateB) return -1;
    if (dateA > dateB) return 1;
    
    const priorityOrder = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const handleSubmit = async () => {
    if (!form.title || (!form.due_date && !form.due_date_text)) return;
    
    setSubmitting(true);
    try {
      const data = {
        ...form,
        due_date: form.due_date ? format(form.due_date, 'yyyy-MM-dd') : null,
      };
      
      if (editingTask) {
        await api.entities.WorkshopTask.update(editingTask.id, data);
      } else {
        // Optimistic update
        const newTask = {
          id: `temp-${Date.now()}`,
          ...data,
          status: 'offen',
          created_date: new Date().toISOString(),
          _pending: true
        };
        setTasks(prev => [newTask, ...prev]);
        setDialogOpen(false);
        resetForm();

        // API call
        await api.entities.WorkshopTask.create({
          ...data,
          status: 'offen'
        });
      }
      
      if (editingTask) {
        setDialogOpen(false);
        resetForm();
      }
      loadData();
    } catch (error) {
      console.error('Error saving task:', error);
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await api.entities.WorkshopTask.update(taskId, { status: newStatus });
      loadData();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    
    try {
      await api.entities.WorkshopTask.delete(deleteDialog.id);
      setDeleteDialog({ open: false, id: null });
      loadData();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  const resetForm = () => {
    setForm({
      title: '',
      project_id: '',
      due_date: null,
      due_date_text: '',
      priority: 'normal',
      assigned_to: '',
      notes: ''
    });
    setEditingTask(null);
  };

  const openEditDialog = (task) => {
    setEditingTask(task);
    setForm({
      title: task.title || '',
      project_id: task.project_id || '',
      due_date: task.due_date ? new Date(task.due_date) : null,
      due_date_text: task.due_date_text || '',
      priority: task.priority || 'normal',
      assigned_to: task.assigned_to || '',
      notes: task.notes || ''
    });
    setDialogOpen(true);
  };

  const getStatusBadge = (status) => {
    const config = {
      offen: { icon: Circle, class: 'bg-gray-100 text-gray-700 border-gray-200', label: 'Offen' },
      bereit: { icon: Clock, class: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Bereit' },
      fertig: { icon: CheckCircle, class: 'bg-green-100 text-green-700 border-green-200', label: 'Fertig' }
    };
    const { icon: Icon, class: className, label } = config[status] || config.offen;
    return (
      <Badge variant="outline" className={className}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
    );
  };

  const getStatusLabel = (status) => {
    const labels = {
      offen: 'Offen',
      bereit: 'Bereit',
      fertig: 'Fertig'
    };
    return labels[status] || status;
  };

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNum;
  };

  const getPriorityBadge = (priority) => {
    const config = {
      niedrig: { class: 'bg-gray-50 text-gray-600', label: 'Niedrig' },
      normal: { class: 'bg-blue-50 text-blue-600', label: 'Normal' },
      hoch: { class: 'bg-amber-50 text-amber-600', label: 'Hoch' },
      dringend: { class: 'bg-red-50 text-red-600', label: 'Dringend' }
    };
    const { class: className, label } = config[priority] || config.normal;
    return <Badge variant="outline" className={className}>{label}</Badge>;
  };

  // Parses KW references from free text and returns the Monday of the last KW mentioned
  const parseKWDeadline = (text) => {
    if (!text) return null;
    // Match patterns: "KW 24", "24. KW", "24.KW", "KW24", "24-25 KW", "KW 24-25", "KW 24/25"
    const rangeMatch = text.match(/(?:KW\s*)?(\d{1,2})\s*[-\/]\s*(\d{1,2})\s*(?:KW)?/i);
    if (rangeMatch) {
      const lastKW = parseInt(rangeMatch[2], 10);
      return getEndOfKW(lastKW);
    }
    const singleMatch = text.match(/(?:KW\s*\.?\s*(\d{1,2})|(\d{1,2})\s*\.?\s*KW)/i);
    if (singleMatch) {
      const kw = parseInt(singleMatch[1] || singleMatch[2], 10);
      return getEndOfKW(kw);
    }
    return null;
  };

  // Returns the Sunday (end of week) for a given KW number in the current year
  const getEndOfKW = (kw) => {
    const year = new Date().getFullYear();
    // ISO week: Jan 4th is always in week 1
    const jan4 = new Date(year, 0, 4);
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (kw - 1) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 0);
    return sunday;
  };

  const isTaskOverdue = (task) => {
    if (task.status === 'fertig') return false;
    if (task.due_date) {
      const d = new Date(task.due_date);
      return isPast(d) && !isToday(d);
    }
    if (task.due_date_text) {
      const deadline = parseKWDeadline(task.due_date_text);
      if (deadline) return isPast(deadline);
    }
    return false;
  };

  const getDueDateStyle = (task) => {
    if (task.due_date) {
      const date = new Date(task.due_date);
      if (isPast(date) && !isToday(date)) return 'text-red-600 font-semibold';
      if (isToday(date)) return 'text-amber-600 font-semibold';
      if (date <= addDays(new Date(), 3)) return 'text-amber-500';
      return 'text-gray-600';
    }
    if (task.due_date_text) {
      const deadline = parseKWDeadline(task.due_date_text);
      if (deadline) {
        if (isPast(deadline)) return 'text-red-600 font-semibold';
        if (deadline <= addDays(new Date(), 3 * 7)) return 'text-amber-500';
      }
    }
    return 'text-gray-600';
  };

  const getEffectiveDeadline = (task) => {
    if (task.due_date) return new Date(task.due_date);
    if (task.due_date_text) return parseKWDeadline(task.due_date_text);
    return null;
  };

  const generatePDF = () => {
    // Always export all non-finished tasks (offen, bereit, overdue)
    const pdfTasks = tasks
      .filter(t => t.status !== 'fertig')
      .sort((a, b) => {
        const dateA = getEffectiveDeadline(a);
        const dateB = getEffectiveDeadline(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        if (dateA < dateB) return -1;
        if (dateA > dateB) return 1;
        const priorityOrder = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

    const workshopEmployees = employees
      .filter(e => e.has_workshop && e.is_active !== false)
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const margin = 10;
    let y = margin;
    const pageHeight = doc.internal.pageSize.getHeight();

    // Title
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('Werkstatt - Offene Aufgaben', margin, y);
    y += 8;

    // Date + count
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(
      `Gedruckt am ${format(new Date(), 'd. MMMM yyyy', { locale: de })} · ${pdfTasks.length} Aufgabe${pdfTasks.length !== 1 ? 'n' : ''}`,
      margin, y
    );
    y += 12;

    // Table header
    const columns = ['PL', 'Bauvorhaben', 'Bauteil', 'Datum', 'Status'];
    const columnWidths = [12, 42, 68, 25, 22];
    const startX = margin;
    let tableY = y;

    // Draw header background
    doc.setFillColor(230, 235, 245);
    doc.rect(startX, tableY - 5, columnWidths.reduce((a, b) => a + b, 0), 7, 'F');

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    let xPos = startX;
    columns.forEach((col, idx) => {
      doc.text(col, xPos + 1, tableY);
      xPos += columnWidths[idx];
    });
    tableY += 4;

    // Separator line
    doc.setDrawColor(180, 180, 180);
    doc.line(startX, tableY, startX + columnWidths.reduce((a, b) => a + b, 0), tableY);
    tableY += 4;

    // Data rows
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    pdfTasks.forEach((task, i) => {
      const project = getProject(task.project_id);
      const projectLeader = project?.project_leader_id ? getEmployee(project.project_leader_id) : null;
      const isOverdue = isTaskOverdue(task);

      if (tableY > pageHeight - margin - 10) {
        doc.addPage();
        tableY = margin + 4;
      }

      // Alternating row background
      if (i % 2 === 0) {
        doc.setFillColor(248, 249, 252);
        doc.rect(startX, tableY - 4, columnWidths.reduce((a, b) => a + b, 0), 6.5, 'F');
      }

      // Red text for overdue
      if (isOverdue) {
        doc.setTextColor(200, 0, 0);
      }

      const statusLabel = isOverdue ? 'Überfällig' : getStatusLabel(task.status);

      const dueDateDisplay = task.due_date
        ? format(new Date(task.due_date), 'd.M.yyyy')
        : (task.due_date_text || '-');

      const rowData = [
        projectLeader?.abbreviation || '-',
        project?.name || '-',
        task.title,
        dueDateDisplay,
        statusLabel
      ];

      xPos = startX;
      rowData.forEach((data, idx) => {
        const cellWidth = columnWidths[idx];
        doc.text(String(data), xPos + 1, tableY, { maxWidth: cellWidth - 2 });
        xPos += cellWidth;
      });

      doc.setTextColor(0, 0, 0);
      tableY += 6.5;
    });

    // Add workshop employees section below tasks
    y = tableY;
    if (workshopEmployees.length > 0) {
      y += 8;

      // Check for page break
      if (y > pageHeight - margin - 50) {
        doc.addPage();
        y = margin;
      }

      // Section title
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      doc.text('Werkstatt - Mitarbeiter & Urlaub', margin, y);
      y += 8;

      // List employees and their vacation periods
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');

      workshopEmployees.forEach((emp) => {
        // Check for page break
        if (y > pageHeight - margin - 20) {
          doc.addPage();
          y = margin;
        }

        // Employee name
        doc.setFont(undefined, 'bold');
        doc.setFontSize(9);
        doc.text(emp.full_name, margin, y);
        y += 5;

        // Collect vacation periods
        const vacationPeriods = [];
        if (emp.vacation_periods && emp.vacation_periods.length > 0) {
          vacationPeriods.push(...emp.vacation_periods);
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const empAssignments = assignments.filter(a => 
          a.employee_id === emp.id && 
          a.assignment_type === 'urlaub' &&
          new Date(a.date) >= today
        );

        if (empAssignments.length > 0) {
          const sortedDates = empAssignments.map(a => new Date(a.date)).sort((a, b) => a - b);
          let periodStart = sortedDates[0];
          let periodEnd = sortedDates[0];

          for (let i = 1; i < sortedDates.length; i++) {
            const curr = sortedDates[i];
            const prev = sortedDates[i - 1];
            const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

            if (diffDays > 1) {
              vacationPeriods.push({
                start_date: format(periodStart, 'yyyy-MM-dd'),
                end_date: format(periodEnd, 'yyyy-MM-dd')
              });
              periodStart = curr;
              periodEnd = curr;
            } else {
              periodEnd = curr;
            }
          }

          vacationPeriods.push({
            start_date: format(periodStart, 'yyyy-MM-dd'),
            end_date: format(periodEnd, 'yyyy-MM-dd')
          });
        }

        // List vacation periods
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);

        if (vacationPeriods.length > 0) {
          vacationPeriods.forEach((period) => {
            doc.setFillColor(255, 245, 230);
            doc.rect(margin + 2, y - 3, 160, 4, 'F');
            const startKW = getWeekNumber(new Date(period.start_date));
            const endKW = getWeekNumber(new Date(period.end_date));
            const kwDisplay = startKW === endKW ? `KW ${startKW}` : `KW ${startKW}-${endKW}`;
            doc.text(
              `${format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - ${format(new Date(period.end_date), 'd.M.yyyy', { locale: de })} (${kwDisplay})`,
              margin + 3,
              y
            );
            y += 4.5;
          });
        } else {
          doc.setTextColor(150, 150, 150);
          doc.text('Keine Urlaubszeiträume', margin + 3, y);
          doc.setTextColor(0, 0, 0);
          y += 4.5;
        }

        y += 2;
      });
    }

    doc.save(`Werkstatt_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] dark:text-white flex items-center gap-3">
            <Wrench className="w-8 h-8 dark:text-blue-300" />
            Werkstatt
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Bauteile & Aufgaben verwalten
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-40 h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
            style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
          >
            <option value="alle">Alle Status</option>
            <option value="offen">Offen</option>
            <option value="bereit">Bereit</option>
            <option value="fertig">Fertig</option>
          </select>
          <Button 
            onClick={generatePDF}
            variant="outline"
          >
            <FileText className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">PDF Export</span>
          </Button>
          <Button 
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
          >
            <Plus className="w-4 h-4 lg:mr-2" />
            <span className="hidden lg:inline">Neue Aufgabe</span>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        {[
          { label: 'Offen', count: tasks.filter(t => t.status === 'offen').length, color: 'bg-gray-100' },
          { label: 'Bereit', count: tasks.filter(t => t.status === 'bereit').length, color: 'bg-blue-100' },
          { label: 'Fertig', count: tasks.filter(t => t.status === 'fertig').length, color: 'bg-green-100' },
          { label: 'Überfällig', count: tasks.filter(t => isTaskOverdue(t)).length, color: 'bg-red-100' }
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${stat.color} dark:bg-gray-700 rounded-xl flex items-center justify-center`}>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">{stat.count}</span>
                </div>
                <span className="text-gray-600 dark:text-gray-300">{stat.label}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Print Header */}
      <div className="hidden print-only text-center mb-6">
        <h1 className="text-2xl font-bold">Werkstatt - Aufgabenliste</h1>
        <p className="text-sm text-gray-600">Gedruckt am {format(new Date(), 'd. MMMM yyyy', { locale: de })}</p>
      </div>

      {/* Print Table */}
      <div className="hidden print-only">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-800">
              <th className="text-left py-2 px-2">PL-Kürzel</th>
              <th className="text-left py-2 px-2">Bauvorhaben</th>
              <th className="text-left py-2 px-2">Bauteil</th>
              <th className="text-left py-2 px-2">Datum</th>
              <th className="text-left py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.map((task) => {
              const project = getProject(task.project_id);
              const projectLeader = project?.project_leader_id ? getEmployee(project.project_leader_id) : null;
              
              return (
                <tr key={task.id} className="border-b border-gray-300">
                  <td className="py-2 px-2">{projectLeader?.abbreviation || '-'}</td>
                  <td className="py-2 px-2">{project?.name || '-'}</td>
                  <td className="py-2 px-2">{task.title}</td>
                  <td className="py-2 px-2">{format(new Date(task.due_date), 'd.M.yyyy')}</td>
                  <td className="py-2 px-2">{getStatusLabel(task.status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tasks Grid */}
      {filteredTasks.length === 0 ? (
        <Card className="border-0 shadow-sm no-print dark:bg-gray-800 dark:border-gray-700">
          <CardContent className="py-12 text-center">
            <Wrench className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-500 dark:text-gray-400">Keine Aufgaben gefunden</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 no-print">
          {filteredTasks.map((task) => {
            const project = getProject(task.project_id);
            const assignee = getEmployee(task.assigned_to);

            return (
              <Card key={task.id} className={`border-0 shadow-sm hover:shadow-lg transition-shadow dark:bg-gray-800 dark:border-gray-700 ${task._pending ? 'opacity-70' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    {getStatusBadge(task.status)}
                    {getPriorityBadge(task.priority)}
                  </div>

                  <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{task.title}</h3>

                  {project && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-2">
                      <Building2 className="w-3 h-3" />
                      {project.name}
                    </p>
                  )}

                  <p className={`text-sm flex items-center gap-1 mb-3 ${getDueDateStyle(task)}`}>
                    <Calendar className="w-3 h-3" />
                    Fällig: {task.due_date ? format(new Date(task.due_date), 'd. MMM yyyy', { locale: de }) : (task.due_date_text || '-')}
                    {isTaskOverdue(task) && (
                      <AlertTriangle className="w-3 h-3 text-red-500" />
                    )}
                  </p>

                  {task.notes && (
                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-3 line-clamp-2">{task.notes}</p>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex gap-1 flex-1">
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value)}
                        className="h-9 text-xs w-28 px-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                        style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
                      >
                        <option value="offen">Offen</option>
                        <option value="bereit">Bereit</option>
                        <option value="fertig">Fertig</option>
                      </select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(task)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeleteDialog({ open: true, id: task.id })}
                      >
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

      {/* Werkstatt Mitarbeiter Section */}
      <div className="no-print">
       <h2 className="text-xl font-bold text-[#1e3a5f] dark:text-white mb-4">Werkstatt Mitarbeiter</h2>
       {employees.filter(e => e.has_workshop && e.is_active !== false).length === 0 ? (
         <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
           <CardContent className="py-8 text-center">
             <p className="text-gray-500 dark:text-gray-400">Keine Werkstatt-Mitarbeiter erfasst</p>
           </CardContent>
         </Card>
       ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {employees
             .filter(e => e.has_workshop && e.is_active !== false)
             .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
             .map((emp) => {
               // Collect vacation periods from both vacation_periods and Assignment records
               const vacationPeriods = [];

               // Add direct vacation_periods that are not in the past
               if (emp.vacation_periods && emp.vacation_periods.length > 0) {
                 const futureOrCurrentVacations = emp.vacation_periods.filter(period => {
                   const endDate = new Date(period.end_date);
                   endDate.setHours(23, 59, 59, 999);
                   return endDate >= new Date();
                 });
                 vacationPeriods.push(...futureOrCurrentVacations);
               }

               // Add vacation periods from assignments (group consecutive urlaub days) - only future/current
               const today = new Date();
               today.setHours(0, 0, 0, 0);
               const empAssignments = assignments.filter(a => a.employee_id === emp.id && a.assignment_type === 'urlaub' && new Date(a.date) >= today);
               if (empAssignments.length > 0) {
                 const sortedDates = empAssignments.map(a => new Date(a.date)).sort((a, b) => a - b);
                 let periodStart = sortedDates[0];
                 let periodEnd = sortedDates[0];

                 for (let i = 1; i < sortedDates.length; i++) {
                   const curr = sortedDates[i];
                   const prev = sortedDates[i - 1];
                   const diffDays = (curr - prev) / (1000 * 60 * 60 * 24);

                   // If there's a gap > 1 day, start a new period
                   if (diffDays > 1) {
                     vacationPeriods.push({
                       start_date: format(periodStart, 'yyyy-MM-dd'),
                       end_date: format(periodEnd, 'yyyy-MM-dd')
                     });
                     periodStart = curr;
                     periodEnd = curr;
                   } else {
                     periodEnd = curr;
                   }
                 }

                 // Add the last period
                 vacationPeriods.push({
                   start_date: format(periodStart, 'yyyy-MM-dd'),
                   end_date: format(periodEnd, 'yyyy-MM-dd')
                 });
               }

               return (
                 <Card key={emp.id} className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
                   <CardContent className="p-5">
                     <h3 className="font-semibold text-gray-900 dark:text-white mb-3">{emp.full_name}</h3>

                     {vacationPeriods.length > 0 ? (
                       <div className="space-y-2">
                         <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Urlaubszeiträume</p>
                         {vacationPeriods.map((period, idx) => (
                           <div key={idx} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                             <p className="text-sm text-amber-900 dark:text-amber-200">
                               {format(new Date(period.start_date), 'd.M.yyyy', { locale: de })} - {format(new Date(period.end_date), 'd.M.yyyy', { locale: de })}
                               <span className="text-xs ml-1">(KW {getWeekNumber(new Date(period.start_date))}-{getWeekNumber(new Date(period.end_date))})</span>
                             </p>
                           </div>
                         ))}
                       </div>
                     ) : (
                       <p className="text-sm text-gray-500 dark:text-gray-400">Keine Urlaubszeiträume eingetragen</p>
                     )}
                   </CardContent>
                 </Card>
               );
             })}
         </div>
       )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTask ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Bauteil/Aufgabe *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({...form, title: e.target.value})}
                placeholder="z.B. Schaltschrank für Halle 3"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Baustelle</Label>
                <select
                  value={form.project_id}
                  onChange={(e) => setForm({...form, project_id: e.target.value})}
                  className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                  style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
                >
                  <option value="">Auswählen...</option>
                  {[...projects].sort((a, b) => a.name.localeCompare(b.name, 'de')).map(project => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="space-y-2">
                <Label>Fälligkeitsdatum *</Label>
                <Input
                  value={form.due_date_text}
                  onChange={(e) => setForm({ ...form, due_date_text: e.target.value, due_date: null })}
                  placeholder="z.B. KW 22, Ende Mai, 15.06.2026"
                />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left font-normal text-gray-500"
                    >
                      <Calendar className="w-4 h-4 mr-2" />
                      {form.due_date ? format(form.due_date, 'd.M.yyyy') : 'Oder genaues Datum wählen'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={form.due_date}
                      onSelect={(date) => setForm({ ...form, due_date: date, due_date_text: format(date, 'd.M.yyyy') })}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Priorität</Label>
              <select
                value={form.priority}
                onChange={(e) => setForm({...form, priority: e.target.value})}
                className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
              >
                <option value="niedrig">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="hoch">Hoch</option>
                <option value="dringend">Dringend</option>
              </select>
            </div>
            
            <div className="space-y-2">
              <Label>Bemerkungen</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({...form, notes: e.target.value})}
                placeholder="Zusätzliche Informationen..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.title || (!form.due_date && !form.due_date_text) || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aufgabe löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diese Aufgabe wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 1.5cm; }
          body { font-size: 11px; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
        .print-only { display: none; }
      `}</style>
    </div>
  );
}