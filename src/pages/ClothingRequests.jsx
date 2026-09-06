import React, { useState, useEffect } from 'react';
import { api } from '@/api/client';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Shirt,
  Plus,
  Clock,
  CheckCircle,
  Package,
  Truck,
  XCircle,
  Trash2,
  RotateCcw
} from 'lucide-react';
import PullToRefresh from '@/components/PullToRefresh';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

export default function ClothingRequests() {
  const [requests, setRequests] = useState([]);
  const [returns, setReturns] = useState([]);
  const [myIssues, setMyIssues] = useState([]);
  const [user, setUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [clothingItems, setClothingItems] = useState([]);
  const [items, setItems] = useState([{ clothing_item_id: '', quantity: 1 }]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [currentUser, allRequests, allReturns, clothingItemsData, allIssues] = await Promise.all([
        api.auth.me(),
        api.entities.ClothingRequest.list('-created_date'),
        api.entities.ClothingReturn.list('-created_date'),
        api.entities.ClothingItem.filter({ is_active: true }),
        api.entities.ClothingIssue.list('-issue_date')
      ]);

      setUser(currentUser);
      setClothingItems(clothingItemsData.filter(i => !i.is_used));

      // Filter requests created by current user
      const userRequests = allRequests.filter(r => r.created_by_id === currentUser.id);
      setRequests(userRequests);

      // Filter returns created by current user
      const userReturns = allReturns.filter(r => r.created_by_id === currentUser.id);
      setReturns(userReturns);

      // Manuelle Ausgaben: employee_id über listAllUsers-Funktion holen (auth.me() gibt custom Felder nicht immer zurück)
      try {
        const usersResponse = await api.functions.invoke('listAllUsers', {});
        const allUsers = usersResponse?.data?.users || [];
        const userEntity = allUsers.find(u => u.id === currentUser.id);
        const employeeId = userEntity?.employee_id || currentUser.employee_id;

        if (employeeId) {
          const employeeIssues = allIssues.filter(i => i.employee_id === employeeId);
          setMyIssues(employeeIssues);
        } else {
          setMyIssues([]);
        }
      } catch {
        // Wenn Funktion nicht erreichbar, employee_id direkt von currentUser versuchen
        const employeeId = currentUser.employee_id;
        if (employeeId) {
          setMyIssues(allIssues.filter(i => i.employee_id === employeeId));
        } else {
          setMyIssues([]);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const addItem = () => {
    setItems([...items, { clothing_item_id: '', quantity: 1 }]);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    if (field === 'quantity') {
      const qty = parseInt(value) || 1;
      newItems[index][field] = Math.min(Math.max(1, qty), 10);
    } else {
      newItems[index][field] = value;
    }
    setItems(newItems);
  };

  const handleSubmit = async () => {
    const validItems = items.filter(item => item.clothing_item_id);
    if (validItems.length === 0) {
      return;
    }

    setSubmitting(true);
    try {
      const requestItems = validItems.map(item => {
        const clothingItem = clothingItems.find(ci => ci.id === item.clothing_item_id);
        return {
          clothing_item_id: item.clothing_item_id,
          article: clothingItem?.article_name || '',
          size: clothingItem?.size || '',
          quantity: item.quantity
        };
      });

      const newRequest = {
        id: `temp-${Date.now()}`,
        employee_id: user.full_name || user.email,
        items: requestItems,
        status: 'eingereicht',
        created_date: new Date().toISOString(),
        created_by: user.email,
        _pending: true
      };

      // Optimistic update
      setRequests(prev => [newRequest, ...prev]);
      setDialogOpen(false);
      setItems([{ clothing_item_id: '', quantity: 1 }]);

      // API call
      await api.entities.ClothingRequest.create({
        employee_id: user.full_name || user.email,
        items: requestItems,
        status: 'eingereicht'
      });

      // E-Mail senden
      const recipients = await api.entities.EmailRecipient.filter({ 
        is_active: true 
      });

      const clothingRecipients = recipients.filter(r => {
        const hasNotificationType = r.notification_types?.includes('arbeitskleidung');
        const hasAllowedRole = !r.allowed_roles || r.allowed_roles.length === 0 || r.allowed_roles.includes(user.role_id);
        return hasNotificationType && hasAllowedRole;
      });

      const emailBody = `
      Arbeitskleidungsanfrage eingereicht

      Mitarbeiter: ${user.display_name || user.full_name || user.email}
      Artikel: ${requestItems.map(i => `${i.quantity}x ${i.article} - ${i.size}`).join(', ')}

      Angefragt am: ${format(new Date(), 'd.M.yyyy HH:mm')} Uhr
      `.trim();

      try {
        for (const recipient of clothingRecipients) {
          await api.integrations.Core.SendEmail({
            to: recipient.email,
            subject: `Arbeitskleidungsanfrage: ${user.display_name || user.full_name || user.email}`,
            body: emailBody
          });
        }
      } catch (adminEmailError) {
        console.warn('Admin-E-Mails konnten nicht gesendet werden:', adminEmailError);
      }

      // Bestätigungs-E-Mail an Antragsteller
      try {
        await api.integrations.Core.SendEmail({
          to: user.email,
          subject: 'Arbeitskleidungsanfrage erfolgreich eingereicht',
          body: `
Hallo ${user.display_name || user.full_name || user.email},

Ihre Arbeitskleidungsanfrage wurde erfolgreich eingereicht.

Artikel: ${requestItems.map(i => `${i.quantity}x ${i.article} - ${i.size}`).join(', ')}

Sie werden benachrichtigt, sobald Ihre Anfrage bearbeitet wurde.

Mit freundlichen Grüßen
Ihr Leniger Team
          `.trim()
        });
      } catch (confirmEmailError) {
        console.warn('Bestätigungs-E-Mail konnte nicht gesendet werden:', confirmEmailError);
      }

      // Reload to sync
      await loadData();
      } catch (error) {
      console.error('Error submitting request:', error);
      await loadData();
      } finally {
      setSubmitting(false);
      }
      };

      const sendStatusChangeEmail = async (request, newStatus) => {
      const statusLabels = {
      eingereicht: 'Eingereicht',
      in_bearbeitung: 'In Bearbeitung',
      bestellt: 'Bestellt',
      geliefert: 'Geliefert',
      abgelehnt: 'Abgelehnt'
      };

      await api.integrations.Core.SendEmail({
      to: user.email,
      subject: `Arbeitskleidungsanfrage ${statusLabels[newStatus]}`,
      body: `
      Hallo ${user.display_name || user.full_name || user.email},

      Ihre Arbeitskleidungsanfrage wurde bearbeitet.

      Status: ${statusLabels[newStatus]}
      Artikel: ${request.items.map(i => `${i.quantity}x ${i.article} - ${i.size}`).join(', ')}

      Mit freundlichen Grüßen
      Ihr Leniger Team
      `.trim()
      });
      };

  const handleWithdraw = async (requestId) => {
    if (!confirm('Möchten Sie diese Anfrage wirklich zurückziehen?')) return;
    
    try {
      const request = requests.find(r => r.id === requestId);
      await api.entities.ClothingRequest.delete(requestId);

      // Bestätigungs-E-Mail an Antragsteller
      await api.integrations.Core.SendEmail({
        to: user.email,
        subject: 'Arbeitskleidungsanfrage erfolgreich zurückgezogen',
        body: `
Hallo ${user.display_name || user.full_name || user.email},

Ihre Arbeitskleidungsanfrage wurde erfolgreich zurückgezogen.

${request?.items ? `Artikel: ${request.items.map(i => `${i.quantity}x ${i.article} - ${i.size}`).join(', ')}` : ''}

Mit freundlichen Grüßen
Ihr Leniger Team
        `.trim()
      });

      loadData();
    } catch (error) {
      console.error('Error withdrawing request:', error);
      alert('Fehler beim Zurückziehen der Anfrage: ' + error.message);
    }
  };

  const openReturnDialog = (request) => {
    setSelectedRequest(request);
    setReturnReason('');
    setReturnDialogOpen(true);
  };

  const handleSubmitReturn = async () => {
    if (!selectedRequest || !returnReason.trim()) return;

    setSubmitting(true);
    try {
      // Add clothing_item_id to each item
      const itemsWithIds = selectedRequest.items.map(item => ({
        article: item.article,
        size: item.size,
        quantity: item.quantity,
        clothing_item_id: item.clothing_item_id
      }));

      await api.entities.ClothingReturn.create({
        request_id: selectedRequest.id,
        employee_id: selectedRequest.employee_id,
        items: itemsWithIds,
        reason: returnReason,
        status: 'eingereicht'
      });

      // Delete original request
      await api.entities.ClothingRequest.delete(selectedRequest.id);

      // E-Mail-Benachrichtigung senden
      try {
        const recipients = await api.entities.EmailRecipient.filter({ 
          is_active: true 
        });
        
        const notificationRecipients = recipients.filter(r => 
          r.notification_types?.includes('arbeitskleidung')
        );
        
        for (const recipient of notificationRecipients) {
          try {
            await api.integrations.Core.SendEmail({
              to: recipient.email,
              subject: 'Neue Rückgabeanfrage für Arbeitskleidung',
              body: `
Hallo ${recipient.name},

eine neue Rückgabeanfrage für Arbeitskleidung wurde eingereicht.

Mitarbeiter: ${selectedRequest.employee_id}
Artikel: ${selectedRequest.items.map(i => `${i.quantity}x ${i.article} - ${i.size}`).join(', ')}
Grund: ${returnReason}

Bitte bearbeiten Sie die Anfrage in der Verwaltung.

Mit freundlichen Grüßen
Ihr Disposition System
              `.trim()
            });
          } catch (emailError) {
            console.warn('E-Mail konnte nicht gesendet werden:', emailError);
          }
        }
      } catch (error) {
        console.warn('Fehler beim Laden der E-Mail-Empfänger:', error);
      }
      
      setReturnDialogOpen(false);
      setSelectedRequest(null);
      setReturnReason('');
      await loadData();
    } catch (error) {
      console.error('Error submitting return:', error);
      alert('Fehler beim Einreichen der Rückgabe: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const config = {
      eingereicht: { icon: Clock, class: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Eingereicht' },
      in_bearbeitung: { icon: Package, class: 'bg-amber-100 text-amber-700 border-amber-200', label: 'In Bearbeitung' },
      bestellt: { icon: Truck, class: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Bestellt' },
      geliefert: { icon: CheckCircle, class: 'bg-green-100 text-green-700 border-green-200', label: 'Geliefert' },
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

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-40" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={loadData}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
            <Shirt className="w-8 h-8" />
            Arbeitskleidung
          </h1>
          <p className="text-gray-500 mt-1">
            Arbeitskleidung anfragen
          </p>
        </div>
        <Button 
          onClick={() => setDialogOpen(true)}
          className="bg-violet-500 hover:bg-violet-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Neue Anfrage
        </Button>
      </div>

      {/* Returns List */}
      {returns.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Meine Rückgabeanträge</h2>
          {returns.map((returnItem) => {
            const originalRequest = requests.find(r => r.id === returnItem.request_id);
            const statusConfig = {
              eingereicht: { 
                icon: Clock, 
                class: 'bg-blue-100 text-blue-700 border-blue-200', 
                label: 'In Prüfung' 
              },
              akzeptiert: { 
                icon: CheckCircle, 
                class: 'bg-green-100 text-green-700 border-green-200', 
                label: 'Akzeptiert' 
              },
              abgelehnt: { 
                icon: XCircle, 
                class: 'bg-red-100 text-red-700 border-red-200', 
                label: 'Abgelehnt' 
              }
            };
            const { icon: StatusIcon, class: statusClass, label: statusLabel } = statusConfig[returnItem.status] || statusConfig.eingereicht;
            
            return (
              <Card key={returnItem.id} className="border-0 shadow-sm">
                <CardContent className="p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                        <RotateCcw className="w-6 h-6 text-orange-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-900">Rückgabeanfrage</h3>
                          <Badge variant="outline" className={statusClass}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {statusLabel}
                          </Badge>
                        </div>
                        <div className="space-y-1 mb-2">
                          {returnItem.items?.map((item, i) => (
                            <p key={i} className="text-sm text-gray-600">
                              {item.quantity}x {item.article} (Größe {item.size})
                            </p>
                          ))}
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 mt-2">
                          <p className="text-xs text-gray-500 mb-1">Grund:</p>
                          <p className="text-sm text-gray-700">{returnItem.reason}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-400">
                      {format(new Date(returnItem.created_date), 'd.M.yyyy')}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}



      {/* Requests List */}
      {requests.length === 0 && returns.length === 0 && myIssues.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-12 text-center">
            <Shirt className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500 mb-4">Keine Anfragen vorhanden</p>
            <Button 
              onClick={() => setDialogOpen(true)}
              variant="outline"
            >
              Erste Anfrage stellen
            </Button>
          </CardContent>
        </Card>
      ) : (requests.length > 0 || myIssues.length > 0) ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Meine Anfragen</h2>
          {[
            ...requests.map(r => ({ ...r, _type: 'request', _sortDate: r.created_date })),
            ...myIssues.map(i => ({ ...i, _type: 'issue', _sortDate: i.issue_date }))
          ]
            .sort((a, b) => new Date(b._sortDate) - new Date(a._sortDate))
            .map((entry) => entry._type === 'issue' ? (
            <Card key={`issue-${entry.id}`} className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {entry.quantity}x {entry.article_name} - {entry.size}
                      </p>
                      {entry.notes && (
                        <p className="text-xs text-gray-500">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 mb-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Ausgegeben
                    </Badge>
                    <p className="text-xs text-gray-400">
                      {format(new Date(entry.issue_date), 'd.M.yyyy')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card key={`request-${entry.id}`} className={`border-0 shadow-sm ${entry._pending ? 'opacity-70' : ''}`}>
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center">
                      <Shirt className="w-6 h-6 text-violet-600" />
                    </div>
                    <div>
                     <div className="flex items-center gap-2 mb-2">
                       <h3 className="font-semibold text-gray-900">
                         {entry.items?.length || 0} Artikel
                       </h3>
                       {entry._pending ? (
                         <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">
                           <Clock className="w-3 h-3 mr-1" />
                           Wird gesendet...
                         </Badge>
                       ) : (
                         getStatusBadge(entry.status)
                       )}
                     </div>
                     {entry.employee_id && (
                       <p className="text-sm text-gray-500 mb-1">
                         {entry.employee_id}
                       </p>
                     )}
                     <div className="space-y-1">
                       {entry.items?.map((item, i) => (
                         <p key={i} className="text-sm text-gray-600">
                           {item.quantity}x {item.article} (Größe {item.size})
                         </p>
                       ))}
                     </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                   <div className="text-sm text-gray-400">
                     Angefragt am {format(new Date(entry.created_date), 'd.M.yyyy')}
                   </div>
                   {(entry.status === 'eingereicht' || entry.status === 'in_bearbeitung') && (
                     <Button
                       variant="ghost"
                       size="sm"
                       onClick={() => handleWithdraw(entry.id)}
                       className="text-red-500 hover:text-red-600 hover:bg-red-50"
                     >
                       <XCircle className="w-4 h-4 mr-1" />
                       Zurückziehen
                     </Button>
                   )}
                   {entry.status === 'geliefert' && !returns.some(r => r.request_id === entry.id && r.status === 'akzeptiert') && (
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => openReturnDialog(entry)}
                       className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                     >
                       <RotateCcw className="w-4 h-4 mr-1" />
                       Rückgabe beantragen
                     </Button>
                   )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      {/* Return Request Dialog */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rückgabe beantragen</DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Artikel:</p>
                <div className="space-y-1">
                  {selectedRequest.items?.map((item, i) => (
                    <p key={i} className="text-sm font-medium">
                      {item.quantity}x {item.article} (Größe {item.size})
                    </p>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Grund der Rückgabe / Bemerkung *</Label>
                <Textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Bitte geben Sie den Grund für die Rückgabe an..."
                  rows={4}
                />
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmitReturn}
              disabled={!returnReason.trim() || submitting}
              className="bg-orange-500 hover:bg-orange-600"
            >
              {submitting ? 'Wird eingereicht...' : 'Rückgabe beantragen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Request Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Arbeitskleidung anfragen</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4 max-h-96 overflow-y-auto">
            {items.map((item, index) => {
              const selectedItem = clothingItems.find(ci => ci.id === item.clothing_item_id);
              
              return (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-xs">Artikel</Label>
                    <select
                      value={item.clothing_item_id}
                      onChange={(e) => updateItem(index, 'clothing_item_id', e.target.value)}
                      className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
                      style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
                    >
                      <option value="">Wählen...</option>
                      {[...clothingItems]
                        .sort((a, b) => {
                          const nameCompare = a.article_name.localeCompare(b.article_name);
                          if (nameCompare !== 0) return nameCompare;
                          
                          const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '23', '24', '25', '26', '27', '28', '29', '30', '40', '42', '44', '46', '48', '50', '52', '54', '56', '58', '60', '62', '88', '90', '94', '98', '102', '106', '110', '114'];
                          const sizeIndexA = sizeOrder.indexOf(a.size);
                          const sizeIndexB = sizeOrder.indexOf(b.size);
                          return sizeIndexA - sizeIndexB;
                        })
                        .map(clothingItem => (
                          <option key={clothingItem.id} value={clothingItem.id}>
                            {clothingItem.article_name} - {clothingItem.size}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="w-20">
                    <Label className="text-xs">Anzahl</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                      className="h-10"
                    />
                  </div>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-red-500"
                      onClick={() => removeItem(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })}
            
            <Button
              variant="outline"
              size="sm"
              onClick={addItem}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Weiteren Artikel hinzufügen
            </Button>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={items.every(i => !i.clothing_item_id) || submitting}
              className="bg-violet-500 hover:bg-violet-600"
            >
              {submitting ? 'Wird eingereicht...' : 'Anfrage senden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PullToRefresh>
  );
}