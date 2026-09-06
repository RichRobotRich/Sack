import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { Shield, Plus, Edit, Trash2, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import MobileSelect from '../components/MobileSelect';
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

import { ALL_PAGES } from '@/lib/allPages';

export default function RoleManagement() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    allowed_pages: [],
    is_admin: false,
    can_approve_leave_for_roles: []
  });

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const data = await api.entities.Role.filter({ is_active: true });
      setRoles(data);
    } catch (error) {
      console.error('Error loading roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (role = null) => {
    if (role) {
      setEditingRole(role);
      setForm({
        name: role.name,
        description: role.description || '',
        allowed_pages: role.allowed_pages || [],
        is_admin: role.is_admin || false,
        can_approve_leave_for_roles: role.can_approve_leave_for_roles || []
      });
    } else {
      setEditingRole(null);
      setForm({
        name: '',
        description: '',
        allowed_pages: [],
        is_admin: false,
        can_approve_leave_for_roles: []
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    
    setSubmitting(true);
    try {
      const roleData = {
        name: form.name.trim(),
        description: form.description.trim(),
        allowed_pages: form.is_admin ? ALL_PAGES.map(p => p.id) : form.allowed_pages,
        is_admin: form.is_admin,
        is_active: true,
        can_approve_leave_for_roles: form.can_approve_leave_for_roles
      };

      if (editingRole) {
        await api.entities.Role.update(editingRole.id, roleData);
      } else {
        await api.entities.Role.create(roleData);
      }
      
      setDialogOpen(false);
      await loadRoles();
    } catch (error) {
      console.error('Error saving role:', error);
      alert('Fehler beim Speichern: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!roleToDelete) return;
    
    try {
      await api.entities.Role.update(roleToDelete.id, { is_active: false });
      setDeleteDialogOpen(false);
      setRoleToDelete(null);
      await loadRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
      alert('Fehler beim Löschen: ' + error.message);
    }
  };

  const togglePage = (pageId) => {
    setForm(prev => ({
      ...prev,
      allowed_pages: prev.allowed_pages.includes(pageId)
        ? prev.allowed_pages.filter(id => id !== pageId)
        : [...prev.allowed_pages, pageId]
    }));
  };

  const toggleApproveRole = (roleId) => {
    setForm(prev => ({
      ...prev,
      can_approve_leave_for_roles: prev.can_approve_leave_for_roles.includes(roleId)
        ? prev.can_approve_leave_for_roles.filter(id => id !== roleId)
        : [...prev.can_approve_leave_for_roles, roleId]
    }));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
            <Shield className="w-8 h-8" />
            Rollenverwaltung
          </h1>
          <p className="text-gray-500 mt-1">
            Verwalten Sie Benutzerrollen und Berechtigungen
          </p>
        </div>
        <Button 
          onClick={() => handleOpenDialog()}
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neue Rolle
        </Button>
      </div>

      {/* Roles Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id} className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    role.is_admin ? 'bg-purple-100' : 'bg-blue-100'
                  }`}>
                    <Shield className={`w-5 h-5 ${
                      role.is_admin ? 'text-purple-600' : 'text-blue-600'
                    }`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{role.name}</CardTitle>
                    {role.is_admin && (
                      <Badge className="mt-1 bg-purple-100 text-purple-700">Admin</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenDialog(role)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setRoleToDelete(role);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {role.description && (
                <p className="text-sm text-gray-600 mb-3">{role.description}</p>
              )}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">
                  Berechtigungen ({role.is_admin ? 'Alle' : role.allowed_pages?.length || 0})
                </p>
                {!role.is_admin && role.allowed_pages && role.allowed_pages.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {role.allowed_pages.slice(0, 3).map(pageId => {
                      const page = ALL_PAGES.find(p => p.id === pageId);
                      return page ? (
                        <Badge key={pageId} variant="outline" className="text-xs">
                          {page.name}
                        </Badge>
                      ) : null;
                    })}
                    {role.allowed_pages.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{role.allowed_pages.length - 3} weitere
                      </Badge>
                    )}
                  </div>
                )}
                {role.can_approve_leave_for_roles && role.can_approve_leave_for_roles.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Kann Urlaubsanträge genehmigen von:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {role.can_approve_leave_for_roles.slice(0, 2).map(roleId => {
                        const approveRole = roles.find(r => r.id === roleId);
                        return approveRole ? (
                          <Badge key={roleId} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            {approveRole.name}
                          </Badge>
                        ) : null;
                      })}
                      {role.can_approve_leave_for_roles.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{role.can_approve_leave_for_roles.length - 2} weitere
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Rolle bearbeiten' : 'Neue Rolle'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto pr-2" style={{ maxHeight: 'calc(95vh - 200px)' }}>
            <div className="space-y-2">
              <Label>Rollenname</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({...form, name: e.target.value})}
                placeholder="z.B. Projektleiter, Monteur, etc."
              />
            </div>

            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({...form, description: e.target.value})}
                placeholder="Kurze Beschreibung der Rolle"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={form.is_admin}
                  onCheckedChange={(checked) => setForm({...form, is_admin: checked})}
                  id="is_admin"
                />
                <Label htmlFor="is_admin" className="cursor-pointer">
                  Administrator (Zugriff auf alle Seiten)
                </Label>
              </div>
            </div>

            {!form.is_admin && (
              <div className="space-y-3">
                <Label>Erlaubte Seiten</Label>
                <div className="border rounded-lg p-4 space-y-3 max-h-80 overflow-y-auto bg-white">
                  {[...new Set(ALL_PAGES.map(p => p.group))].map(group => (
                    <div key={group}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{group}</p>
                      {ALL_PAGES.filter(p => p.group === group).map(page => (
                        <div key={page.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                          <Checkbox
                            checked={form.allowed_pages.includes(page.id)}
                            onCheckedChange={() => togglePage(page.id)}
                            id={`page-${page.id}`}
                          />
                          <Label htmlFor={`page-${page.id}`} className="cursor-pointer flex-1 text-sm">
                            {page.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <Label>Kann Urlaubsanträge genehmigen von</Label>
              <p className="text-xs text-gray-500">
                Wählen Sie die Rollen aus, deren Urlaubsanträge diese Rolle genehmigen kann
              </p>
              <div className="border rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto bg-white">
                {roles.filter(r => r.id !== editingRole?.id).map(role => (
                  <div key={role.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                    <Checkbox
                      checked={form.can_approve_leave_for_roles.includes(role.id)}
                      onCheckedChange={() => toggleApproveRole(role.id)}
                      id={`approve-${role.id}`}
                    />
                    <Label htmlFor={`approve-${role.id}`} className="cursor-pointer flex-1 text-sm">
                      {role.name}
                    </Label>
                  </div>
                ))}
                {roles.filter(r => r.id !== editingRole?.id).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-2">
                    Keine anderen Rollen verfügbar
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!form.name.trim() || (!form.is_admin && form.allowed_pages.length === 0) || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : editingRole ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rolle löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Rolle "{roleToDelete?.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}