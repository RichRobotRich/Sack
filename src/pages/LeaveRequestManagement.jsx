import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format, differenceInDays, isWeekend, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { isPublicHoliday } from '@/utils/publicHolidays';
import {
  Plane,
  Thermometer,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  Filter,
  Plus,
  Trash2,
  Settings,
  BarChart2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import AnnualLeaveOverview from '@/components/AnnualLeaveOverview';

export default function LeaveRequestManagement() {
  const [mainTab, setMainTab] = useState('urlaub');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
          <Plane className="w-8 h-8" />
          Urlaubsverwaltung
        </h1>
        <p className="text-gray-500 mt-1">Verwalten Sie Urlaubsanträge, Krankmeldungen und die Jahresübersicht</p>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="urlaub">
            <Plane className="w-4 h-4 mr-2" />
            Urlaubsverwaltung
          </TabsTrigger>
          <TabsTrigger value="krankmeldung">
            <Thermometer className="w-4 h-4 mr-2" />
            Krankmeldungsverwaltung
          </TabsTrigger>
          <TabsTrigger value="jahresuebersicht">
            <BarChart2 className="w-4 h-4 mr-2" />
            Jahresübersicht
          </TabsTrigger>
        </TabsList>

        <TabsContent value="urlaub">
          <RequestManagementPanel requestType="urlaub" />
        </TabsContent>

        <TabsContent value="krankmeldung">
          <RequestManagementPanel requestType="krankmeldung" />
        </TabsContent>

        <TabsContent value="jahresuebersicht">
          <AnnualLeaveOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Prüft, ob zwei Arbeitstage aufeinanderfolgen
function isWorkdayAfter(date1Str, date2Str) {
  const d1 = new Date(date1Str + 'T12:00:00Z');
  const d2 = new Date(date2Str + 'T12:00:00Z');
  
  let current = new Date(d1);
  current.setDate(current.getDate() + 1);
  
  while (current < d2) {
    if (!isWeekend(current) && !isPublicHoliday(current, 'TH')) {
      return false;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return true;
}

// Gruppiert Aufhebungsanträge die aufeinanderfolgende Arbeitstage haben
function groupRevokeRequests(reqs) {
  const revokeReqs = reqs.filter(r => r.notes?.includes('__revoke_of_') || r.notes?.includes('__partial_revoke_of_'));
  if (!revokeReqs.length) return [];
  
  const sorted = [...revokeReqs].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const groups = [[sorted[0]]];
  
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    
    const prevRevoke = extractOriginalRequestId(prev.notes);
    const currRevoke = extractOriginalRequestId(curr.notes);
    
    // Gleicher Original-Request und aufeinanderfolgende Arbeitstage?
    if (prevRevoke === currRevoke && prev.employee_id === curr.employee_id && isWorkdayAfter(prev.end_date, curr.start_date)) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }
  
  return groups;
}

// Extrahiert Original-Request-ID aus einer Aufhebungs-Notiz
function extractOriginalRequestId(notesStr) {
  const match = notesStr?.match(/__(?:revoke_of|partial_revoke_of)_([^_]+)__/);
  return match?.[1] || null;
}

// Generiert alle Arbeitstage in einem Zeitraum
function getWorkdaysInRange(startStr, endStr) {
  const startDate = new Date(startStr + 'T12:00:00Z');
  const endDate = new Date(endStr + 'T12:00:00Z');
  
  let current = new Date(startDate);
  let final = new Date(endDate);
  if (final < current) {
    const temp = new Date(current);
    current = new Date(final);
    final = temp;
  }
  
  const workdays = [];
  while (current <= final) {
    if (!isWeekend(current) && !isPublicHoliday(current, 'TH')) {
      workdays.push(format(current, 'yyyy-MM-dd'));
    }
    current.setDate(current.getDate() + 1);
  }
  return workdays;
}

function RequestManagementPanel({ requestType }) {
  const [requests, setRequests] = useState([]);
  const [filteredRequests, setFilteredRequests] = useState([]);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState(null);
  const [notes, setNotes] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [submitting, setSubmitting] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ user_email: '', can_view_roles: [] });

  useEffect(() => {
    loadData();
  }, [requestType]);

  useEffect(() => {
    applyFilters();
  }, [requests, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const currentUser = await api.auth.me();

      const [allRequests, allRoles, allRules, usersResponse] = await Promise.all([
        api.entities.LeaveRequest.filter({ request_type: requestType }, '-created_date'),
        api.entities.Role.filter({ is_active: true }),
        api.entities.LeaveApprovalRule.filter({ is_active: true }),
        api.functions.invoke('listAllUsers', {})
      ]);

      setUser(currentUser);
      setRoles(allRoles);
      setUsers(usersResponse.data.users || []);
      setRules(allRules);

      const currentUserRole = allRoles.find(r => r.id === currentUser.role_id);
      setUserRole(currentUserRole);

      const visibleRequests = filterRequestsByRules(allRequests, currentUser, currentUserRole, allRules);
      setRequests(visibleRequests);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterRequestsByRules = (allRequests, currentUser, currentUserRole, allRules) => {
    if (currentUser?.role === 'admin' || currentUserRole?.is_admin) {
      return allRequests;
    }

    const myRules = allRules.filter(rule => rule.user_email === currentUser.email && rule.is_active);
    if (myRules.length === 0) return [];

    const allowedRoleIds = new Set();
    myRules.forEach(rule => {
      if (rule.can_view_roles && Array.isArray(rule.can_view_roles)) {
        rule.can_view_roles.forEach(roleId => allowedRoleIds.add(roleId));
      }
    });

    return allRequests.filter(request => {
      if (request.status === 'genehmigt' || request.status === 'abgelehnt') {
        return request.approved_by === (currentUser.full_name || currentUser.email);
      }
      const requesterRoleId = request.requester_role_id;
      if (!requesterRoleId) return false;
      return allowedRoleIds.has(requesterRoleId);
    });
  };

  const applyFilters = () => {
    let filtered = [...requests];
    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    setFilteredRequests(filtered);
  };

  const handleSaveRule = async () => {
    if (!ruleForm.user_email || ruleForm.can_view_roles.length === 0) return;
    setSubmitting(true);
    try {
      await api.entities.LeaveApprovalRule.create({
        user_email: ruleForm.user_email,
        can_view_roles: ruleForm.can_view_roles,
        is_active: true
      });
      setRuleDialogOpen(false);
      setRuleForm({ user_email: '', can_view_roles: [] });
      await loadData();
    } catch (error) {
      console.error('Error saving rule:', error);
      alert('Fehler beim Speichern der Regel');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Regel wirklich löschen?')) return;
    try {
      await api.entities.LeaveApprovalRule.update(ruleId, { is_active: false });
      await loadData();
    } catch (error) {
      console.error('Error deleting rule:', error);
      alert('Fehler beim Löschen der Regel');
    }
  };

  const toggleRoleInRule = (roleId) => {
    setRuleForm(prev => ({
      ...prev,
      can_view_roles: prev.can_view_roles.includes(roleId)
        ? prev.can_view_roles.filter(id => id !== roleId)
        : [...prev.can_view_roles, roleId]
    }));
  };

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return;
    setSubmitting(true);
    try {
      const newStatus = actionType === 'approve' ? 'genehmigt' :
                       actionType === 'reject' ? 'abgelehnt' : 'in_pruefung';

      // Spezial: Wenn das ein Aufhebungs-Request ist und genehmigt wird
      if (newStatus === 'genehmigt' && selectedRequest.notes?.includes('__')) {
        const originalRequestId = extractOriginalRequestId(selectedRequest.notes);
        if (originalRequestId) {
          // Lade Original-Request
          const allRequests = await api.entities.LeaveRequest.list();
          const originalRequest = allRequests.find(r => r.id === originalRequestId);
          
          if (originalRequest && originalRequest.status === 'genehmigt') {
            // Finde ALLE genehmigten + ALLE zu genehmigenden Aufhebungs-Requests
            const daysToRevoke = new Set();
            
            // Sammle Tage aus BEREITS genehmigten Aufhebungs-Requests
            const approvedRevokeRequests = allRequests.filter(r => 
              extractOriginalRequestId(r.notes) === originalRequestId && 
              r.status === 'genehmigt'
            );
            approvedRevokeRequests.forEach(revokeReq => {
              const workdays = getWorkdaysInRange(revokeReq.start_date, revokeReq.end_date);
              workdays.forEach(day => daysToRevoke.add(day));
            });
            
            // Sammle auch Tage aus dem AKTUELL zu genehmigenden Request
            const workdaysToRevoke = getWorkdaysInRange(selectedRequest.start_date, selectedRequest.end_date);
            workdaysToRevoke.forEach(day => daysToRevoke.add(day));
            
            // Berechne verbleibende Arbeitstage
            const originalWorkdays = getWorkdaysInRange(originalRequest.start_date, originalRequest.end_date);
            const remainingWorkdays = originalWorkdays.filter(day => !daysToRevoke.has(day));
            
            // Lösche Assignments für die aufgehobenen Tage
            const requesterUser = users.find(u => u.id === originalRequest.created_by_id);
            if (requesterUser?.employee_id) {
              const allAssignments = await api.entities.Assignment.list();
              const assignmentsToDelete = allAssignments.filter(a =>
                a.employee_id === requesterUser.employee_id &&
                daysToRevoke.has(a.date)
              );
              for (const assignment of assignmentsToDelete) {
                await api.entities.Assignment.delete(assignment.id);
              }
            }
            
            if (remainingWorkdays.length === 0) {
              // Alle Tage aufgehoben: Original-Request löschen
              await api.entities.LeaveRequest.delete(originalRequestId);
            } else {
              // Finde zusammenhängende Blöcke von Arbeitstagen
              const blocks = [];
              let currentBlock = [remainingWorkdays[0]];
              
              for (let i = 1; i < remainingWorkdays.length; i++) {
                const prevDay = new Date(remainingWorkdays[i - 1] + 'T12:00:00Z');
                const currDay = new Date(remainingWorkdays[i] + 'T12:00:00Z');
                
                // Prüfe ob das nächste Arbeitstag ist
                if (isWorkdayAfter(remainingWorkdays[i - 1], remainingWorkdays[i])) {
                  currentBlock.push(remainingWorkdays[i]);
                } else {
                  blocks.push(currentBlock);
                  currentBlock = [remainingWorkdays[i]];
                }
              }
              blocks.push(currentBlock);
              
              if (blocks.length === 1) {
                // Ein Block: Update Original-Request
                await api.entities.LeaveRequest.update(originalRequestId, {
                  start_date: blocks[0][0],
                  end_date: blocks[0][blocks[0].length - 1]
                });
              } else {
                // Mehrere Blöcke: Update ersten Block, erstelle neue für die anderen
                await api.entities.LeaveRequest.update(originalRequestId, {
                  start_date: blocks[0][0],
                  end_date: blocks[0][blocks[0].length - 1]
                });
                
                for (let i = 1; i < blocks.length; i++) {
                  await api.entities.LeaveRequest.create({
                    employee_id: originalRequest.employee_id,
                    employee_name: originalRequest.employee_name,
                    requester_role_id: originalRequest.requester_role_id,
                    request_type: 'urlaub',
                    start_date: blocks[i][0],
                    end_date: blocks[i][blocks[i].length - 1],
                    status: 'genehmigt',
                    approved_by: originalRequest.approved_by,
                    approved_at: originalRequest.approved_at
                  });
                  
                  // Erstelle auch Assignments für diesen Block
                  if (requesterUser?.employee_id) {
                    const assignmentsToCreate = blocks[i].map(day => ({
                      date: day,
                      employee_id: requesterUser.employee_id,
                      assignment_type: 'urlaub'
                    }));
                    await api.entities.Assignment.bulkCreate(assignmentsToCreate);
                  }
                }
              }
            }
          }
        }
      }

      // Wenn Aufhebungs-Request genehmigt: lösche ihn nach Verarbeitung
      if (newStatus === 'genehmigt' && selectedRequest.notes?.includes('__')) {
        // Lösche den Aufhebungs-Request selbst
        await api.entities.LeaveRequest.delete(selectedRequest.id);
      } else {
        // Normale Requests: update status
        await api.entities.LeaveRequest.update(selectedRequest.id, {
          status: newStatus,
          notes: notes,
          approved_by: user.full_name || user.email,
          approved_at: new Date().toISOString()
        });
      }

      if (newStatus === 'genehmigt' && !selectedRequest.notes?.includes('__')) {
        // Find the requester's employee record
        const requesterEmail = selectedRequest.created_by;
        const requesterUser = users.find(u => u.email === requesterEmail);
        
        if (requesterUser?.employee_id) {
          const assignmentType = selectedRequest.request_type === 'urlaub' ? 'urlaub' : 'krank';
          const startDate = new Date(selectedRequest.start_date);
          const endDate = new Date(selectedRequest.end_date);

          const assignmentsToCreate = [];
          for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();
            if (dayOfWeek >= 1 && dayOfWeek <= 5) {
              assignmentsToCreate.push({
                date: format(d, 'yyyy-MM-dd'),
                employee_id: requesterUser.employee_id,
                assignment_type: assignmentType
              });
            }
          }
          if (assignmentsToCreate.length > 0) {
            await api.entities.Assignment.bulkCreate(assignmentsToCreate);
          }
        }
      }

      const requester = users.find(u => u.email === selectedRequest.created_by);
      if (requester && requester.email) {
        const days = differenceInDays(new Date(selectedRequest.end_date), new Date(selectedRequest.start_date)) + 1;
        const statusText = newStatus === 'genehmigt' ? 'genehmigt' :
                          newStatus === 'abgelehnt' ? 'abgelehnt' : 'in Prüfung';
        try {
          const subject = selectedRequest.request_type === 'urlaub'
            ? `Urlaubsantrag ${statusText}`
            : `Krankmeldung ${statusText === 'genehmigt' ? 'anerkannt' : statusText}`;
          const greeting = selectedRequest.request_type === 'urlaub'
            ? 'Ihr Urlaubsantrag'
            : 'Ihre Krankmeldung';

          await api.integrations.Core.SendEmail({
            to: requester.email,
            subject: subject,
            body: `
Hallo ${selectedRequest.employee_id},

${greeting} wurde ${statusText === 'genehmigt' && selectedRequest.request_type === 'krankmeldung' ? 'anerkannt' : statusText}.

Zeitraum: ${format(new Date(selectedRequest.start_date), 'd.M.yyyy')} - ${format(new Date(selectedRequest.end_date), 'd.M.yyyy')} (${days} Tag${days !== 1 ? 'e' : ''})
${notes ? `\nBemerkung: ${notes}` : ''}

Bearbeitet von: ${user.full_name || user.email}
Bearbeitet am: ${format(new Date(), 'd.M.yyyy HH:mm')} Uhr

Mit freundlichen Grüßen
Ihr Leniger Team
            `.trim()
          });
        } catch (emailError) {
          console.warn('E-Mail konnte nicht gesendet werden:', emailError);
        }
      }

      setDialogOpen(false);
      setSelectedRequest(null);
      setActionType(null);
      setNotes('');
      loadData();
    } catch (error) {
      console.error('Error processing request:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const openActionDialog = (request, action) => {
    setSelectedRequest(request);
    setActionType(action);
    setNotes(request.notes || '');
    setDialogOpen(true);
  };

  const getActionTitle = () => {
    const type = requestType === 'urlaub' ? 'Urlaubsantrag' : 'Krankmeldung';
    if (actionType === 'approve') return `${type} ${requestType === 'krankmeldung' ? 'anerkennen' : 'genehmigen'}`;
    if (actionType === 'reject') return `${type} ablehnen`;
    return `${type} in Prüfung setzen`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border-0 shadow-sm dark:bg-gray-800">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              <Label className="text-sm text-gray-600 dark:text-gray-400">Status:</Label>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="eingereicht">Eingereicht</SelectItem>
                <SelectItem value="in_pruefung">In Prüfung</SelectItem>
                <SelectItem value="genehmigt">Genehmigt</SelectItem>
                <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Admin Settings */}
      {userRole?.is_admin && (
        <Card className="border-0 shadow-sm dark:bg-gray-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h3 className="font-semibold text-gray-900 dark:text-white">Genehmigungsregeln</h3>
              </div>
              <Button size="sm" onClick={() => setRuleDialogOpen(true)} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">
                <Plus className="w-4 h-4 mr-1" />
                Neue Regel
              </Button>
            </div>
            {rules.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Keine Regeln konfiguriert</p>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <div key={rule.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex-1">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{rule.user_email}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.can_view_roles && rule.can_view_roles.map(roleId => {
                          const role = roles.find(r => r.id === roleId);
                          return role ? (
                            <Badge key={roleId} variant="outline" className="text-xs dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600">
                              {role.name}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Requests by Status */}
      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="pending">
            Ausstehend ({filteredRequests.filter(r => r.status === 'eingereicht').length})
          </TabsTrigger>
          <TabsTrigger value="processing">
            In Prüfung ({filteredRequests.filter(r => r.status === 'in_pruefung').length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            Abgeschlossen ({filteredRequests.filter(r => ['genehmigt', 'abgelehnt'].includes(r.status)).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {filteredRequests.filter(r => r.status === 'eingereicht').length === 0 ? (
            <Card className="border-0 shadow-sm dark:bg-gray-800">
              <CardContent className="py-12 text-center">
                <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">Keine ausstehenden Anträge</p>
              </CardContent>
            </Card>
          ) : (() => {
            const pendingReqs = filteredRequests.filter(r => r.status === 'eingereicht');
            const revokeGroups = groupRevokeRequests(pendingReqs);
            const otherReqs = pendingReqs.filter(r => !r.notes?.includes('__revoke_of_') && !r.notes?.includes('__partial_revoke_of_'));
            
            return (
              <>
                {revokeGroups.map((group, idx) => (
                  <RequestCard key={`group-${idx}`} request={group[0]} group={group} onAction={openActionDialog} showActions={true} users={users} />
                ))}
                {otherReqs.map(request => (
                  <RequestCard key={request.id} request={request} onAction={openActionDialog} showActions={true} users={users} />
                ))}
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="processing" className="space-y-4">
          {filteredRequests.filter(r => r.status === 'in_pruefung').length === 0 ? (
            <Card className="border-0 shadow-sm dark:bg-gray-800">
              <CardContent className="py-12 text-center">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">Keine Anträge in Prüfung</p>
              </CardContent>
            </Card>
          ) : (() => {
            const processingReqs = filteredRequests.filter(r => r.status === 'in_pruefung');
            const revokeGroups = groupRevokeRequests(processingReqs);
            const otherReqs = processingReqs.filter(r => !r.notes?.includes('__revoke_of_') && !r.notes?.includes('__partial_revoke_of_'));
            
            return (
              <>
                {revokeGroups.map((group, idx) => (
                  <RequestCard key={`group-${idx}`} request={group[0]} group={group} onAction={openActionDialog} showActions={true} users={users} />
                ))}
                {otherReqs.map(request => (
                  <RequestCard key={request.id} request={request} onAction={openActionDialog} showActions={true} users={users} />
                ))}
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {filteredRequests.filter(r => ['genehmigt', 'abgelehnt'].includes(r.status)).length === 0 ? (
            <Card className="border-0 shadow-sm dark:bg-gray-800">
              <CardContent className="py-12 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-gray-500 dark:text-gray-400">Keine abgeschlossenen Anträge</p>
              </CardContent>
            </Card>
          ) : (() => {
            const completedReqs = filteredRequests.filter(r => ['genehmigt', 'abgelehnt'].includes(r.status));
            const revokeGroups = groupRevokeRequests(completedReqs);
            const otherReqs = completedReqs.filter(r => !r.notes?.includes('__revoke_of_') && !r.notes?.includes('__partial_revoke_of_'));
            
            return (
              <>
                {revokeGroups.map((group, idx) => (
                  <RequestCard key={`group-${idx}`} request={group[0]} group={group} onAction={openActionDialog} showActions={false} users={users} />
                ))}
                {otherReqs.map(request => (
                  <RequestCard key={request.id} request={request} onAction={openActionDialog} showActions={false} users={users} />
                ))}
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* Rule Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Neue Genehmigungsregel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Benutzer</Label>
              <Select value={ruleForm.user_email} onValueChange={(value) => setRuleForm({...ruleForm, user_email: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Benutzer auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.email).map(u => (
                    <SelectItem key={u.email} value={u.email}>
                      {u.full_name || u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Wählen Sie den Benutzer, der Anträge sehen darf</p>
            </div>
            <div className="space-y-2">
              <Label>Kann Anträge sehen von folgenden Rollen</Label>
              <div className="border dark:border-gray-600 rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto bg-white dark:bg-gray-800">
                {roles.map(role => (
                  <div key={role.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                    <input
                      type="checkbox"
                      checked={ruleForm.can_view_roles.includes(role.id)}
                      onChange={() => toggleRoleInRule(role.id)}
                      id={`rule-role-${requestType}-${role.id}`}
                      className="rounded"
                    />
                    <Label htmlFor={`rule-role-${requestType}-${role.id}`} className="cursor-pointer flex-1 text-sm dark:text-gray-200">
                      {role.name}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>Abbrechen</Button>
            <Button
              onClick={handleSaveRule}
              disabled={!ruleForm.user_email || ruleForm.can_view_roles.length === 0 || submitting}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              {submitting ? 'Wird gespeichert...' : 'Regel erstellen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{getActionTitle()}</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="font-medium">{selectedRequest.employee_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {format(new Date(selectedRequest.start_date), 'd.M.yyyy')} - {format(new Date(selectedRequest.end_date), 'd.M.yyyy')}
                  </span>
                </div>
                {selectedRequest.reason && (
                  <p className="text-sm text-gray-600 mt-2"><strong>Grund:</strong> {selectedRequest.reason}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Bemerkung (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Fügen Sie eine Bemerkung hinzu..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button
              onClick={handleAction}
              disabled={submitting}
              className={
                actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' :
                actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' :
                'bg-amber-600 hover:bg-amber-700'
              }
            >
              {submitting ? 'Wird bearbeitet...' :
               actionType === 'approve' ? 'Genehmigen' :
               actionType === 'reject' ? 'Ablehnen' : 'In Prüfung'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RequestCard({ request, group, onAction, showActions, users = [] }) {
  const isGroup = group && group.length > 1;
  const firstReq = isGroup ? group[0] : request;
  const lastReq = isGroup ? group[group.length - 1] : request;
  
  // Zähle Arbeitstage
  let totalDays = 0;
  if (isGroup) {
    for (const req of group) {
      let current = new Date(req.start_date + 'T12:00:00Z');
      const end = new Date(req.end_date + 'T12:00:00Z');
      while (current <= end) {
        if (!isWeekend(current) && !isPublicHoliday(current, 'TH')) {
          totalDays++;
        }
        current.setDate(current.getDate() + 1);
      }
    }
  } else {
    totalDays = differenceInDays(new Date(request.end_date), new Date(request.start_date)) + 1;
  }
  
  const isVacation = firstReq.request_type === 'urlaub';
  const requester = users?.find(u => u.id === firstReq.created_by_id);

  const getStatusBadge = (status) => {
    const isSick = firstReq.request_type === 'krankmeldung';
    const config = {
      eingereicht: { icon: Clock, class: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Eingereicht' },
      in_pruefung: { icon: AlertCircle, class: 'bg-amber-100 text-amber-700 border-amber-200', label: 'In Prüfung' },
      genehmigt: { icon: CheckCircle, class: 'bg-green-100 text-green-700 border-green-200', label: isSick ? 'Anerkannt' : 'Genehmigt' },
      abgelehnt: { icon: XCircle, class: 'bg-red-100 text-red-700 border-red-200', label: 'Abgelehnt' }
    };
    const { icon: Icon, class: className, label } = config[status] || config.eingereicht;
    return (
      <Badge variant="outline" className={className}>
        <Icon className="w-3 h-3 mr-1" />
        {label}
      </Badge>
    );
  };

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow dark:bg-gray-800">
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className={`w-12 h-12 ${isVacation ? 'bg-emerald-100 dark:bg-emerald-900/40' : 'bg-red-100 dark:bg-red-900/40'} rounded-xl flex items-center justify-center flex-shrink-0`}>
              {isVacation ? <Plane className="w-6 h-6 text-emerald-600" /> : <Thermometer className="w-6 h-6 text-red-600" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {totalDays} Tag{totalDays !== 1 ? 'e' : ''} {isVacation ? 'Urlaub' : 'Krankmeldung'}
                  {isGroup && <Badge variant="secondary" className="text-xs">Gruppiert ({group.length})</Badge>}
                </h3>
                {getStatusBadge(firstReq.status)}
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                <User className="w-3 h-3 inline mr-1" />
                {firstReq.employee_name || firstReq.employee_id}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Angefragt von: {requester?.full_name || firstReq.created_by || 'Unbekannt'}
              </p>
              <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {format(new Date(firstReq.start_date), 'd. MMM', { locale: de })} – {format(new Date(lastReq.end_date), 'd. MMM yyyy', { locale: de })}
              </p>
              {firstReq.reason && (
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">{firstReq.reason}</p>
              )}
              {firstReq.notes && !firstReq.notes.includes('__revoke_of_') && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-gray-700 rounded p-2">
                  <strong>Bemerkung:</strong> {firstReq.notes}
                </p>
              )}
              {firstReq.approved_by && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                  Bearbeitet von {firstReq.approved_by} am {format(new Date(firstReq.approved_at), 'd.M.yyyy HH:mm')} Uhr
                </p>
              )}
            </div>
          </div>
          {showActions && (
            <div className="flex flex-wrap gap-2 lg:flex-col lg:items-end">
              <Button size="sm" onClick={() => onAction(firstReq, 'approve')} className="bg-green-600 hover:bg-green-700 text-white">
                <CheckCircle className="w-4 h-4 mr-1" />
                {isVacation ? 'Genehmigen' : 'Anerkennen'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction(firstReq, 'review')} className="border-amber-600 text-amber-600 hover:bg-amber-50">
                <AlertCircle className="w-4 h-4 mr-1" />
                In Prüfung
              </Button>
              <Button size="sm" variant="outline" onClick={() => onAction(firstReq, 'reject')} className="border-red-600 text-red-600 hover:bg-red-50">
                <XCircle className="w-4 h-4 mr-1" />
                Ablehnen
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}