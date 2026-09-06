import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format } from 'date-fns';
import {
  UserCog,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  ShieldCheck,
  Filter,
  Plus,
  Edit,
  Trash2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ALL_PAGES } from '@/lib/allPages';

export default function UserManagement() {

  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [deleteRoleDialogOpen, setDeleteRoleDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('alle');

  const [form, setForm] = useState({
    role_id: '',
    employee_id: '',
    is_approved: false,
    location: '',
    planpro: false
  });

  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    allowed_pages: [],
    is_admin: false
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const me = await api.auth.me();
      setCurrentUser(me);
      
      const [usersResponse, employeesData, rolesData] = await Promise.all([
        api.functions.invoke('listAllUsers', {}),
        api.entities.Employee.list(),
        api.entities.Role.filter({ is_active: true })
      ]);
      
      setUsers(usersResponse.data.users || []);
      setEmployees(employeesData);
      setRoles(rolesData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEmployee = (id) => employees.find(e => e.id === id);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email?.toLowerCase().includes(search.toLowerCase()) ||
                          user.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'alle' || 
                          (statusFilter === 'pending' && !user.is_approved) ||
                          (statusFilter === 'approved' && user.is_approved);
    return matchesSearch && matchesStatus;
  });

  const handleSubmit = async () => {
    if (!editingUser) return;
    
    setSubmitting(true);
    try {
      // Check if assigned role is admin
      const assignedRole = roles.find(r => r.id === form.role_id);
      const isAdminRole = assignedRole?.is_admin || false;
      
      await api.functions.invoke('updateUser', {
        user_id: editingUser.id,
        role_id: form.role_id || null,
        role: isAdminRole ? 'admin' : 'user',
        employee_id: form.employee_id || null,
        is_approved: form.is_approved,
        location: form.location || null,
        planpro: form.planpro
      });
      
      setDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Fehler beim Aktualisieren: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleSubmit = async () => {
    if (!roleForm.name.trim()) return;
    
    setSubmitting(true);
    try {
      const roleData = {
        name: roleForm.name.trim(),
        description: roleForm.description.trim(),
        allowed_pages: roleForm.is_admin ? ALL_PAGES.map(p => p.id) : roleForm.allowed_pages,
        is_admin: roleForm.is_admin,
        is_active: true
      };

      if (editingRole) {
        await api.entities.Role.update(editingRole.id, roleData);
      } else {
        await api.entities.Role.create(roleData);
      }
      
      setRoleDialogOpen(false);
      await loadData();
    } catch (error) {
      console.error('Error saving role:', error);
      alert('Fehler beim Speichern: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    
    try {
      await api.entities.Role.update(roleToDelete.id, { is_active: false });
      setDeleteRoleDialogOpen(false);
      setRoleToDelete(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting role:', error);
      alert('Fehler beim Löschen: ' + error.message);
    }
  };

  const handleQuickApprove = async (user) => {
    try {
      let role = 'user';
      
      // If user has admin role, set role to admin
      if (user.role_id) {
        const userRole = roles.find(r => r.id === user.role_id);
        if (userRole?.is_admin) {
          role = 'admin';
        }
      }
      
      await api.functions.invoke('updateUser', {
        user_id: user.id,
        is_approved: true,
        role: role
      });
      
      loadData();
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Fehler beim Freigeben: ' + error.message);
    }
  };

  const openEditDialog = (user) => {
    setEditingUser(user);
    setForm({
      role_id: user.role_id || '',
      employee_id: user.employee_id || '',
      is_approved: user.is_approved || false,
      location: user.location || '',
      planpro: user.planpro || false
    });
    setDialogOpen(true);
  };

  const openRoleDialog = (role = null) => {
    if (role) {
      setEditingRole(role);
      setRoleForm({
        name: role.name,
        description: role.description || '',
        allowed_pages: role.allowed_pages || [],
        is_admin: role.is_admin || false
      });
    } else {
      setEditingRole(null);
      setRoleForm({
        name: '',
        description: '',
        allowed_pages: [],
        is_admin: false
      });
    }
    setRoleDialogOpen(true);
  };

  const togglePage = (pageId) => {
    setRoleForm(prev => ({
      ...prev,
      allowed_pages: prev.allowed_pages.includes(pageId)
        ? prev.allowed_pages.filter(id => id !== pageId)
        : [...prev.allowed_pages, pageId]
    }));
  };

  const getRoleById = (roleId) => roles.find(r => r.id === roleId);

  const getRoleBadge = (roleId) => {
    const role = getRoleById(roleId);
    if (!role) return <Badge variant="outline">Keine Rolle</Badge>;
    
    const colors = role.is_admin ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200';
    return (
      <Badge variant="outline" className={colors}>
        <Shield className="w-3 h-3 mr-1" />
        {role.name}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const pendingUsers = users.filter(u => !u.is_approved);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
            <UserCog className="w-8 h-8" />
            Benutzerverwaltung
          </h1>
          <p className="text-gray-500 mt-1">
            {users.length} Benutzer • {pendingUsers.length} warten auf Freigabe
          </p>
        </div>
        <Button 
          onClick={() => openRoleDialog()}
          className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neue Rolle
        </Button>
      </div>

      {/* Roles Section */}
      {roles.length > 0 && (
        <Card className="border-0 shadow-sm bg-blue-50 dark:bg-blue-950/30 dark:border dark:border-blue-800">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-3">Verfügbare Rollen ({roles.length})</p>
            <div className="flex flex-wrap gap-2">
              {roles.map(role => (
                <div key={role.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700">
                  <Shield className={`w-4 h-4 ${role.is_admin ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`} />
                  <span className="text-sm font-medium dark:text-white">{role.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 dark:hover:bg-gray-700"
                    onClick={() => openRoleDialog(role)}
                  >
                    <Edit className="w-3 h-3 dark:text-gray-300" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 dark:hover:bg-gray-700"
                    onClick={() => {
                      setRoleToDelete(role);
                      setDeleteRoleDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-3 h-3 text-red-500 dark:text-red-400" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Users Alert */}
      {pendingUsers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div className="flex-1">
                <p className="font-medium text-amber-800">
                  {pendingUsers.length} Benutzer warten auf Freigabe
                </p>
                <p className="text-sm text-amber-600">
                  {pendingUsers.map(u => u.email).join(', ')}
                </p>
              </div>
              {pendingUsers.length === 1 && (
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700"
                  onClick={() => handleQuickApprove(pendingUsers[0])}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Freigeben
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Suchen nach Name oder E-Mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full sm:w-40 h-11 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
          style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
        >
          <option value="alle">Alle Status</option>
          <option value="pending">Ausstehend</option>
          <option value="approved">Freigegeben</option>
        </select>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Benutzer</TableHead>
              <TableHead>Rolle</TableHead>
              <TableHead>Verknüpfter Mitarbeiter</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Registriert am</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  Keine Benutzer gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => {
                const linkedEmployee = getEmployee(user.employee_id);
                
                return (
                  <TableRow key={user.id} className={`hover:bg-gray-50 ${!user.is_approved ? 'bg-amber-50/50' : ''}`}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.full_name || 'Kein Name'}</p>
                        <p className="text-sm text-gray-500">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role_id)}</TableCell>
                    <TableCell>
                      {linkedEmployee ? (
                        <span className="text-gray-700">{linkedEmployee.full_name}</span>
                      ) : (
                        <span className="text-gray-400">Nicht verknüpft</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_approved ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Freigegeben
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                          <Clock className="w-3 h-3 mr-1" />
                          Ausstehend
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500">
                      {user.created_date ? format(new Date(user.created_date), 'd.M.yyyy') : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!user.is_approved && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-green-600 border-green-200 hover:bg-green-50"
                            onClick={() => handleQuickApprove(user)}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(user)}
                        >
                          Bearbeiten
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Benutzer bearbeiten</DialogTitle>
          </DialogHeader>
          
          {editingUser && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gray-50 rounded-xl">
                <p className="font-medium">{editingUser.full_name || 'Kein Name'}</p>
                <p className="text-sm text-gray-500">{editingUser.email}</p>
              </div>
              
              <div className="space-y-2">
                <Label>Rolle</Label>
                <Select
                  value={form.role_id}
                  onValueChange={(value) => setForm({...form, role_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Keine Rolle" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Keine Rolle</SelectItem>
                    {roles.map(role => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Mit Mitarbeiter verknüpfen</Label>
                <Select
                  value={form.employee_id}
                  onValueChange={(value) => setForm({...form, employee_id: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nicht verknüpft" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Nicht verknüpft</SelectItem>
                    {[...employees].sort((a, b) => a.full_name.localeCompare(b.full_name, 'de')).map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Verknüpft den Benutzer mit einem Mitarbeiter für persönliche Anträge
                </p>
              </div>

              <div className="space-y-2">
                <Label>Standort</Label>
                <Select
                  value={form.location}
                  onValueChange={(value) => setForm({...form, location: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Standort wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Kein Standort</SelectItem>
                    <SelectItem value="PB">PB</SelectItem>
                    <SelectItem value="EF">EF</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Wählen Sie den Standort des Benutzers
                </p>
              </div>

              <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
                <div>
                  <Label className="text-green-700">Freigabe</Label>
                  <p className="text-sm text-green-600">Benutzer kann sich anmelden</p>
                </div>
                <Button
                  variant={form.is_approved ? 'default' : 'outline'}
                  className={form.is_approved ? 'bg-green-600 hover:bg-green-700' : ''}
                  onClick={() => setForm({...form, is_approved: !form.is_approved})}
                >
                  {form.is_approved ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Freigegeben
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4 mr-2" />
                      Nicht freigegeben
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl">
                <Checkbox
                  id="planpro"
                  checked={form.planpro}
                  onCheckedChange={(checked) => setForm({...form, planpro: checked})}
                />
                <Label htmlFor="planpro" className="text-blue-700 cursor-pointer">
                  PlanPro Zugriff
                </Label>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Management Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Rolle bearbeiten' : 'Neue Rolle'}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rollenname</Label>
              <Input
                value={roleForm.name}
                onChange={(e) => setRoleForm({...roleForm, name: e.target.value})}
                placeholder="z.B. Disposition, Werkstatt, etc."
              />
            </div>

            <div className="space-y-2">
              <Label>Beschreibung (optional)</Label>
              <Textarea
                value={roleForm.description}
                onChange={(e) => setRoleForm({...roleForm, description: e.target.value})}
                placeholder="Kurze Beschreibung der Rolle"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={roleForm.is_admin}
                  onCheckedChange={(checked) => setRoleForm({...roleForm, is_admin: checked})}
                  id="is_admin"
                />
                <Label htmlFor="is_admin" className="cursor-pointer">
                  Administrator (Zugriff auf alle Reiter)
                </Label>
              </div>
            </div>

            {!roleForm.is_admin && (
              <div className="space-y-3">
                <Label>Erlaubte Reiter</Label>
                <div className="border rounded-lg p-4 space-y-3 max-h-72 overflow-y-auto bg-white">
                  {[...new Set(ALL_PAGES.map(p => p.group))].map(group => (
                    <div key={group}>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{group}</p>
                      {ALL_PAGES.filter(p => p.group === group).map(page => (
                        <div key={page.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded">
                          <Checkbox
                            checked={roleForm.allowed_pages.includes(page.id)}
                            onCheckedChange={() => togglePage(page.id)}
                            id={`um-${page.id}`}
                          />
                          <Label htmlFor={`um-${page.id}`} className="cursor-pointer flex-1 text-sm">
                            {page.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleRoleSubmit}
              disabled={!roleForm.name.trim() || (!roleForm.is_admin && roleForm.allowed_pages.length === 0) || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : editingRole ? 'Speichern' : 'Erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Role Confirmation */}
      <AlertDialog open={deleteRoleDialogOpen} onOpenChange={setDeleteRoleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rolle löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie die Rolle "{roleToDelete?.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRole} className="bg-red-600 hover:bg-red-700">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}