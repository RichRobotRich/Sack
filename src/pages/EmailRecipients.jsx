import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import {
  Mail,
  Plus,
  Edit2,
  Trash2,
  Plane,
  Thermometer,
  Shirt,
  Check,
  Shield
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const NOTIFICATION_TYPES = [
  { key: 'urlaub', label: 'Urlaubsanträge', icon: Plane, color: 'bg-emerald-100 text-emerald-700' },
  { key: 'krankmeldung', label: 'Krankmeldungen', icon: Thermometer, color: 'bg-amber-100 text-amber-700' },
  { key: 'arbeitskleidung', label: 'Arbeitskleidung', icon: Shirt, color: 'bg-violet-100 text-violet-700' }
];

export default function EmailRecipients() {
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [submitting, setSubmitting] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    notification_types: [],
    allowed_roles: [],
    is_active: true
  });

  const [roles, setRoles] = useState([]);

  useEffect(() => {
    loadData();
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      const data = await base44.entities.Role.list();
      setRoles(data.filter(r => r.is_active !== false));
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.EmailRecipient.list();
      setRecipients(data);
    } catch (error) {
      console.error('Error loading recipients:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.name || !form.email) return;
    
    setSubmitting(true);
    try {
      if (editingRecipient) {
        await base44.entities.EmailRecipient.update(editingRecipient.id, form);
      } else {
        await base44.entities.EmailRecipient.create(form);
      }
      
      setDialogOpen(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving recipient:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    
    try {
      await base44.entities.EmailRecipient.delete(deleteDialog.id);
      setDeleteDialog({ open: false, id: null });
      loadData();
    } catch (error) {
      console.error('Error deleting recipient:', error);
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      email: '',
      notification_types: [],
      allowed_roles: [],
      is_active: true
    });
    setEditingRecipient(null);
  };

  const openEditDialog = (recipient) => {
    setEditingRecipient(recipient);
    setForm({
      name: recipient.name || '',
      email: recipient.email || '',
      notification_types: recipient.notification_types || [],
      allowed_roles: recipient.allowed_roles || [],
      is_active: recipient.is_active !== false
    });
    setDialogOpen(true);
  };

  const toggleNotificationType = (type) => {
    setForm(prev => ({
      ...prev,
      notification_types: prev.notification_types.includes(type)
        ? prev.notification_types.filter(t => t !== type)
        : [...prev.notification_types, type]
    }));
  };

  const toggleRole = (roleId) => {
    setForm(prev => ({
      ...prev,
      allowed_roles: prev.allowed_roles.includes(roleId)
        ? prev.allowed_roles.filter(r => r !== roleId)
        : [...prev.allowed_roles, roleId]
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
            <Mail className="w-8 h-8" />
            E-Mail-Empfänger
          </h1>
          <p className="text-gray-500 mt-1">
            Benachrichtigungen für Anträge konfigurieren
          </p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setDialogOpen(true);
          }}
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Empfänger hinzufügen
        </Button>
      </div>

      {/* Info Card */}
      <Card className="border-blue-200 bg-blue-50">
      <CardContent className="p-4">
       <p className="text-blue-700 text-sm">
         <strong>Hinweis:</strong> Hier konfigurierte Empfänger erhalten automatisch E-Mail-Benachrichtigungen für 
         Anträge von ausgewählten Rollen. Wenn keine Rolle ausgewählt ist, werden Anträge von allen Rollen weitergeleitet.
       </p>
      </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>Antragsarten</TableHead>
              <TableHead>Rollen</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  Keine E-Mail-Empfänger konfiguriert
                </TableCell>
              </TableRow>
            ) : (
              recipients.map((recipient) => (
                <TableRow key={recipient.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{recipient.name}</TableCell>
                  <TableCell className="text-gray-600">{recipient.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {NOTIFICATION_TYPES.filter(t => recipient.notification_types?.includes(t.key)).map(type => (
                        <Badge key={type.key} variant="outline" className={type.color}>
                          <type.icon className="w-3 h-3 mr-1" />
                          {type.label}
                        </Badge>
                      ))}
                      {(!recipient.notification_types || recipient.notification_types.length === 0) && (
                        <span className="text-gray-400 text-sm">Keine</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {recipient.allowed_roles?.map(roleId => {
                        const role = roles.find(r => r.id === roleId);
                        return role ? (
                          <Badge key={roleId} variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                            <Shield className="w-3 h-3 mr-1" />
                            {role.name}
                          </Badge>
                        ) : null;
                      })}
                      {(!recipient.allowed_roles || recipient.allowed_roles.length === 0) && (
                        <span className="text-gray-400 text-sm">Alle Rollen</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {recipient.is_active !== false ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Aktiv</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-50 text-gray-500">Inaktiv</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(recipient)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeleteDialog({ open: true, id: recipient.id })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRecipient ? 'Empfänger bearbeiten' : 'Neuer Empfänger'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({...form, name: e.target.value})}
                  placeholder="z.B. Max Mustermann"
                />
              </div>
              <div className="space-y-2">
                <Label>E-Mail *</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm({...form, email: e.target.value})}
                  placeholder="email@firma.de"
                  type="email"
                />
              </div>
            </div>
            
            <div className="space-y-3">
               <Label>Antragsarten</Label>
               {NOTIFICATION_TYPES.map(type => (
                 <div 
                   key={type.key}
                   className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-colors ${
                     form.notification_types.includes(type.key)
                       ? 'bg-[#1e3a5f]/5 border-[#1e3a5f]/20'
                       : 'bg-gray-50 border-transparent hover:bg-gray-100'
                   }`}
                   onClick={() => toggleNotificationType(type.key)}
                 >
                   <div className="flex items-center gap-3">
                     <type.icon className={`w-5 h-5 ${form.notification_types.includes(type.key) ? 'text-[#1e3a5f]' : 'text-gray-400'}`} />
                     <span className={form.notification_types.includes(type.key) ? 'font-medium text-[#1e3a5f]' : 'text-gray-600'}>
                       {type.label}
                     </span>
                   </div>
                   <Checkbox 
                     checked={form.notification_types.includes(type.key)}
                     onCheckedChange={() => toggleNotificationType(type.key)}
                   />
                 </div>
               ))}
             </div>

             <div className="space-y-3">
               <Label>Rollen (nur von diesen Rollen werden Anträge weitergeleitet)</Label>
               <div className="border rounded-xl p-3 space-y-2 max-h-64 overflow-y-auto bg-gray-50">
                 {roles.length === 0 ? (
                   <p className="text-gray-400 text-sm">Keine Rollen verfügbar</p>
                 ) : (
                   roles.map(role => (
                     <div 
                       key={role.id}
                       className="flex items-center gap-3 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors"
                       onClick={() => toggleRole(role.id)}
                     >
                       <Checkbox 
                         checked={form.allowed_roles.includes(role.id)}
                         onCheckedChange={() => toggleRole(role.id)}
                       />
                       <span className="text-sm text-gray-700">{role.name}</span>
                     </div>
                   ))
                 )}
               </div>
               <p className="text-xs text-gray-500">Wenn keine Rolle ausgewählt: Anträge von allen Rollen werden weitergeleitet</p>
             </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <Label>Aktiv</Label>
                <p className="text-sm text-gray-500">Empfänger erhält E-Mails</p>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({...form, is_active: checked})}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.name || !form.email || submitting}
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
            <AlertDialogTitle>Empfänger löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie diesen Empfänger wirklich löschen? Er wird keine Benachrichtigungen mehr erhalten.
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
    </div>
  );
}