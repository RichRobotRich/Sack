import { useState, forwardRef, useImperativeHandle } from 'react';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  Plus, Package, TrendingUp, AlertTriangle, Edit2, Trash2,
  History, ClipboardList, User, CheckCircle, X
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ShieldAlert } from 'lucide-react';

// isUsed: false = Neue Kleidung, true = Gebrauchte Kleidung
const ClothingInventoryPanel = forwardRef(function ClothingInventoryPanel({
  isUsed, items, deliveries, requests, returns, employees, issues, users, currentUser, onRefresh
}, ref) {
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [manualIssueDialogOpen, setManualIssueDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, type: null });
  const [duplicateDialog, setDuplicateDialog] = useState({ open: false, similar: [], pendingData: null });
  const [editingItem, setEditingItem] = useState(null);
  const [selectedItemForDelivery, setSelectedItemForDelivery] = useState(null);
  const [selectedItemHistory, setSelectedItemHistory] = useState(null);
  const [selectedRequestItem, setSelectedRequestItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [itemForm, setItemForm] = useState({ article_name: '', size: '', current_stock: 0, minimum_stock: 0 });
  const [deliveryForm, setDeliveryForm] = useState({
    clothing_item_id: '', quantity: 0, delivery_date: new Date(), supplier: '', notes: ''
  });
  const [issueForm, setIssueForm] = useState({ quantity: 0 });
  const [manualIssueForm, setManualIssueForm] = useState({ employee_id: '', employee_name_free: '', notes: '' });
  const [manualIssueLines, setManualIssueLines] = useState([{ clothing_item_id: '', quantity: 1 }]);

  // Filter items by is_used flag
  const panelItems = items.filter(i => !!i.is_used === isUsed);

  const sizeOrder = ['XS','S','M','L','XL','XXL','XXXL','4XL','23','24','25','26','27','28','29','30','40','42','44','46','48','50','52','54','56','58','60','62','64','88','90','94','98','102','106','110','114'];

  const filteredAndSortedItems = panelItems
    .filter(item => item.article_name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const nameCompare = a.article_name.localeCompare(b.article_name);
      if (nameCompare !== 0) return nameCompare;
      return sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size);
    });

  const lowStockItems = panelItems.filter(item => item.current_stock <= item.minimum_stock && item.minimum_stock > 0);

  // Only requests for items of this panel
  const panelItemIds = new Set(panelItems.map(i => i.id));
  const pendingRequests = requests.filter(r =>
    ['eingereicht', 'in_bearbeitung'].includes(r.status) &&
    r.items?.some(i => panelItemIds.has(i.clothing_item_id))
  );
  const pendingReturns = returns.filter(r =>
    r.status === 'eingereicht' &&
    r.items?.some(i => panelItemIds.has(i.clothing_item_id))
  );

  const getClothingItem = (id) => items.find(i => i.id === id);
  const getItemDeliveries = (itemId) => deliveries.filter(d => d.clothing_item_id === itemId);

  const resetItemForm = () => {
    setItemForm({ article_name: '', size: '', current_stock: 0, minimum_stock: 0 });
    setEditingItem(null);
  };

  const resetDeliveryForm = () => {
    setDeliveryForm({ clothing_item_id: '', quantity: 0, delivery_date: new Date(), supplier: '', notes: '' });
    setSelectedItemForDelivery(null);
  };

  // Prüft auf gleichen Artikel und Größe
  const findSimilarItems = (articleName, size) => {
    if (!articleName || !size) return [];
    const inputName = articleName.trim().toLowerCase();
    return panelItems.filter(i => {
      const existingName = (i.article_name || '').toLowerCase();
      return existingName === inputName && i.size === size;
    });
  };

  const handleSubmitItem = async () => {
    if (!itemForm.article_name || !itemForm.size) return;

    // Bei Neuanlage: auf gleichen Artikel + Größe prüfen
    if (!editingItem) {
      const similar = findSimilarItems(itemForm.article_name, itemForm.size);
      if (similar.length > 0) {
        setDuplicateDialog({ open: true, similar, pendingData: { ...itemForm } });
        return;
      }
    }

    await doSubmitItem();
  };

  const doSubmitItem = async () => {
    if (editingItem) {
      await base44.entities.ClothingItem.update(editingItem.id, itemForm);
    } else {
      await base44.entities.ClothingItem.create({ ...itemForm, is_active: true, is_used: isUsed });
    }
    setItemDialogOpen(false);
    setDuplicateDialog({ open: false, similar: [], pendingData: null });
    resetItemForm();
    onRefresh();
  };

  const handleSubmitDelivery = async () => {
    if (!deliveryForm.clothing_item_id || !deliveryForm.quantity) return;
    await base44.entities.ClothingDelivery.create({
      ...deliveryForm,
      delivery_date: format(deliveryForm.delivery_date, 'yyyy-MM-dd'),
      recorded_by_name: currentUser?.full_name || currentUser?.email || ''
    });
    const item = items.find(i => i.id === deliveryForm.clothing_item_id);
    if (item) {
      await base44.entities.ClothingItem.update(item.id, { current_stock: item.current_stock + parseInt(deliveryForm.quantity) });
    }
    setDeliveryDialogOpen(false);
    resetDeliveryForm();
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteDialog.id) return;
    if (deleteDialog.type === 'item') {
      await base44.entities.ClothingItem.update(deleteDialog.id, { is_active: false });
    } else {
      await base44.entities.ClothingDelivery.delete(deleteDialog.id);
    }
    setDeleteDialog({ open: false, id: null, type: null });
    onRefresh();
  };

  const openDeliveryDialog = (item = null) => {
    if (item) {
      setDeliveryForm(f => ({ ...f, clothing_item_id: item.id }));
      setSelectedItemForDelivery(item);
    }
    setDeliveryDialogOpen(true);
  };

  const openEditDialog = (item) => {
    setEditingItem(item);
    setItemForm({ article_name: item.article_name || '', size: item.size || '', current_stock: item.current_stock || 0, minimum_stock: item.minimum_stock || 0 });
    setItemDialogOpen(true);
  };

  const openHistoryDialog = (item) => {
    setSelectedItemHistory(item);
    setHistoryDialogOpen(true);
  };

  const openIssueDialog = (request, item) => {
    setSelectedRequestItem({ request, item });
    const maxQuantity = Math.min(item.quantity, getClothingItem(item.clothing_item_id)?.current_stock || 0);
    setIssueForm({ quantity: maxQuantity });
    setIssueDialogOpen(true);
  };

  const handleIssueItems = async () => {
    if (!selectedRequestItem || !issueForm.quantity) return;
    const { request, item } = selectedRequestItem;
    const clothingItem = items.find(i => i.id === item.clothing_item_id);
    const employee = employees.find(e => e.id === request.employee_id);
    if (!clothingItem || clothingItem.current_stock < issueForm.quantity) return;

    await base44.entities.ClothingIssue.create({
      employee_id: request.employee_id,
      employee_name: employee?.full_name || request.employee_id,
      clothing_item_id: item.clothing_item_id,
      article_name: item.article,
      size: item.size,
      quantity: issueForm.quantity,
      request_date: format(new Date(request.created_date), 'yyyy-MM-dd'),
      issue_date: format(new Date(), 'yyyy-MM-dd'),
      request_id: request.id,
      notes: request.notes || '',
      recorded_by_name: currentUser?.full_name || currentUser?.email || ''
    });
    await base44.entities.ClothingItem.update(clothingItem.id, { current_stock: clothingItem.current_stock - issueForm.quantity });

    const updatedItems = request.items.map(i => {
      if (i.clothing_item_id === item.clothing_item_id) {
        const newQuantity = i.quantity - issueForm.quantity;
        return newQuantity > 0 ? { ...i, quantity: newQuantity } : null;
      }
      return i;
    }).filter(Boolean);

    if (updatedItems.length > 0) {
      await base44.entities.ClothingRequest.update(request.id, { items: updatedItems, status: 'in_bearbeitung' });
    } else {
      await base44.entities.ClothingRequest.update(request.id, { status: 'geliefert' });
    }
    setIssueDialogOpen(false);
    setSelectedRequestItem(null);
    onRefresh();
  };

  const handleManualIssue = async () => {
    const { employee_id, employee_name_free, notes } = manualIssueForm;
    const resolvedName = isUsed ? employee_name_free : (employees.find(e => e.id === employee_id)?.full_name || '');
    const resolvedId = isUsed ? (employee_name_free || 'manuell') : employee_id;
    if ((!isUsed && !employee_id) || (isUsed && !employee_name_free)) return;
    const validLines = manualIssueLines.filter(l => l.clothing_item_id && l.quantity > 0);
    if (validLines.length === 0) return;

    for (const line of validLines) {
      const clothingItem = items.find(i => i.id === line.clothing_item_id);
      if (!clothingItem || clothingItem.current_stock < line.quantity) continue;
      await base44.entities.ClothingIssue.create({
        employee_id: resolvedId, employee_name: resolvedName,
        clothing_item_id: line.clothing_item_id, article_name: clothingItem.article_name, size: clothingItem.size,
        quantity: line.quantity, request_date: format(new Date(), 'yyyy-MM-dd'), issue_date: format(new Date(), 'yyyy-MM-dd'),
        notes: notes || '',
        recorded_by_name: currentUser?.full_name || currentUser?.email || ''
      });
      await base44.entities.ClothingItem.update(clothingItem.id, { current_stock: clothingItem.current_stock - line.quantity });
    }
    setManualIssueDialogOpen(false);
    setManualIssueForm({ employee_id: '', employee_name_free: '', notes: '' });
    setManualIssueLines([{ clothing_item_id: '', quantity: 1 }]);
    onRefresh();
  };

  const handleAcceptReturn = async (returnRequest) => {
    if (!confirm('Möchten Sie diese Rückgabe akzeptieren? Der Bestand wird entsprechend erhöht.')) return;
    const relatedIssues = issues.filter(issue => issue.request_id === returnRequest.request_id);
    for (const issue of relatedIssues) await base44.entities.ClothingIssue.delete(issue.id);
    for (const item of returnRequest.items) {
      if (item.clothing_item_id) {
        const clothingItem = items.find(i => i.id === item.clothing_item_id);
        if (clothingItem) await base44.entities.ClothingItem.update(clothingItem.id, { current_stock: clothingItem.current_stock + item.quantity });
      }
    }
    await base44.entities.ClothingReturn.delete(returnRequest.id);
    onRefresh();
  };

  const handleRejectReturn = async (returnRequest) => {
    if (!confirm('Möchten Sie diese Rückgabe ablehnen?')) return;
    await base44.entities.ClothingReturn.update(returnRequest.id, { status: 'abgelehnt' });
    onRefresh();
  };

  const sizeOptions = ['XS','S','M','L','XL','XXL','XXXL','4XL','23','24','25','26','27','28','29','30','40','42','44','46','48','50','52','54','56','58','60','62','64','88','90','94','98','102','106','110','114'];

  useImperativeHandle(ref, () => ({
    openManualIssue: () => setManualIssueDialogOpen(true),
    openDelivery: () => openDeliveryDialog(),
    openNewItem: () => { resetItemForm(); setItemDialogOpen(true); },
  }));

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="border-0 shadow-sm"><CardContent className="p-3 lg:p-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center"><Package className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold">{panelItems.length}</p><p className="text-xs text-gray-500">Artikel</p></div>
          </div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-3 lg:p-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center"><TrendingUp className="w-4 h-4 text-green-600" /></div>
            <div><p className="text-xl font-bold">{panelItems.reduce((s, i) => s + i.current_stock, 0)}</p><p className="text-xs text-gray-500">Bestand</p></div>
          </div>
        </CardContent></Card>
        <Card className="border-0 shadow-sm"><CardContent className="p-3 lg:p-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold">{lowStockItems.length}</p><p className="text-xs text-gray-500">Niedrig</p></div>
          </div>
        </CardContent></Card>
      </div>

      {/* Pending Returns */}
      {pendingReturns.length > 0 && (
        <Card className="border-0 shadow-sm border-l-4 border-l-orange-500">
          <CardHeader><CardTitle className="flex items-center gap-2"><span className="text-orange-600">↩</span> Rückgabeanfragen</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingReturns.map(returnRequest => (
                <div key={returnRequest.id} className="border rounded-lg p-4 bg-orange-50/30">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{returnRequest.employee_id || 'Unbekannt'}</span>
                      <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-200">Rückgabe beantragt</Badge>
                    </div>
                    <span className="text-xs text-gray-400">{format(new Date(returnRequest.created_date), 'd.M.yyyy')}</span>
                  </div>
                  <div className="space-y-1 mb-3">
                    {returnRequest.items?.map((item, idx) => <p key={idx} className="text-sm text-gray-600 ml-2">• {item.quantity}x {item.article} - {item.size}</p>)}
                  </div>
                  <div className="bg-white rounded-lg p-3 mb-3">
                    <p className="text-xs font-medium text-gray-500 mb-1">Grund der Rückgabe:</p>
                    <p className="text-sm text-gray-700">{returnRequest.reason}</p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleRejectReturn(returnRequest)} className="text-red-600 hover:bg-red-50"><X className="w-4 h-4 mr-1" />Ablehnen</Button>
                    <Button size="sm" onClick={() => handleAcceptReturn(returnRequest)} className="bg-green-600 hover:bg-green-700"><CheckCircle className="w-4 h-4 mr-1" />Akzeptieren</Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5" /> Offene Anfragen</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingRequests.map(request => (
                <div key={request.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-medium">{request.employee_id || 'Unbekannt'}</span>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700">{request.status === 'eingereicht' ? 'Eingereicht' : 'In Bearbeitung'}</Badge>
                    </div>
                    <span className="text-xs text-gray-400">{format(new Date(request.created_date), 'd.M.yyyy')}</span>
                  </div>
                  <div className="space-y-2">
                    {request.items?.filter(i => panelItemIds.has(i.clothing_item_id)).map((item, idx) => {
                      const clothingItem = getClothingItem(item.clothing_item_id);
                      const availableStock = clothingItem?.current_stock || 0;
                      return (
                        <div key={idx} className="flex items-center justify-between py-2 border-t">
                          <div className="flex-1">
                            <p className="text-sm"><span className="font-medium">{item.quantity}x</span> {item.article} - {item.size}</p>
                            <p className="text-xs text-gray-500">Lagerbestand: {availableStock}</p>
                          </div>
                          <Button size="sm" onClick={() => openIssueDialog(request, item)} disabled={availableStock === 0} className="bg-green-600 hover:bg-green-700">
                            <CheckCircle className="w-4 h-4 mr-1" />Ausgeben
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Low Stock Warning */}
      {lowStockItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50"><CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">Niedriger Bestand</h3>
              <p className="text-sm text-amber-700 mt-1">{lowStockItems.length} Artikel {lowStockItems.length === 1 ? 'liegt' : 'liegen'} unter dem Mindestbestand</p>
            </div>
          </div>
        </CardContent></Card>
      )}

      {/* Inventory Table */}
      <Card className="border-0 shadow-sm">
        <CardHeader><CardTitle>Bestandsübersicht</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input placeholder="Artikel suchen..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-sm" />
          </div>
          {panelItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500"><Package className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Keine Artikel angelegt</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Artikel</TableHead>
                  <TableHead>Größe</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Bestand</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">Mindestbestand</TableHead>
                  <TableHead className="text-right lg:hidden text-xs">Menge</TableHead>
                  <TableHead className="text-right lg:hidden text-xs">Min</TableHead>
                  <TableHead className="hidden lg:table-cell">Status</TableHead>
                  <TableHead className="text-right">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedItems.map(item => {
                  const isLowStock = item.minimum_stock > 0 && item.current_stock <= item.minimum_stock;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-sm lg:text-base">{item.article_name}</TableCell>
                      <TableCell className="text-sm lg:text-base">{item.size}</TableCell>
                      <TableCell className="text-right text-sm lg:text-base"><span className={isLowStock ? 'text-amber-600 font-semibold' : ''}>{item.current_stock}</span></TableCell>
                      <TableCell className="text-right text-sm lg:text-base">{item.minimum_stock}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {isLowStock
                          ? <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200"><AlertTriangle className="w-3 h-3 mr-1" />Niedrig</Badge>
                          : <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">OK</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openDeliveryDialog(item)}><TrendingUp className="w-3 h-3 lg:w-4 lg:h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openHistoryDialog(item)}><History className="w-3 h-3 lg:w-4 lg:h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(item)}><Edit2 className="w-3 h-3 lg:w-4 lg:h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => setDeleteDialog({ open: true, id: item.id, type: 'item' })}><Trash2 className="w-3 h-3 lg:w-4 lg:h-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingItem ? 'Artikel bearbeiten' : 'Neuer Artikel'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Artikelbezeichnung *</Label>
              <Input value={itemForm.article_name} onChange={(e) => setItemForm({ ...itemForm, article_name: e.target.value })} placeholder="z.B. Arbeitsjacke, T-Shirt" />
            </div>
            <div className="space-y-2">
              <Label>Größe *</Label>
              <select value={itemForm.size} onChange={(e) => setItemForm({ ...itemForm, size: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="">Größe auswählen...</option>
                {sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {!editingItem && (
              <div className="space-y-2">
                <Label>Anfangsbestand</Label>
                <Input type="number" min="0" value={itemForm.current_stock} onChange={(e) => setItemForm({ ...itemForm, current_stock: parseInt(e.target.value) || 0 })} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Mindestbestand</Label>
              <Input type="number" min="0" value={itemForm.minimum_stock} onChange={(e) => setItemForm({ ...itemForm, minimum_stock: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSubmitItem} disabled={!itemForm.article_name || !itemForm.size} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">Speichern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery Dialog */}
      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Lieferung erfassen</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Artikel *</Label>
              <select value={deliveryForm.clothing_item_id} onChange={(e) => setDeliveryForm({ ...deliveryForm, clothing_item_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                <option value="">Artikel auswählen...</option>
                {panelItems.map(item => <option key={item.id} value={item.id}>{item.article_name} - {item.size}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Menge *</Label>
              <Input type="number" min="1" value={deliveryForm.quantity} onChange={(e) => setDeliveryForm({ ...deliveryForm, quantity: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Lieferdatum *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Package className="w-4 h-4 mr-2" />{format(deliveryForm.delivery_date, 'd.M.yyyy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent mode="single" selected={deliveryForm.delivery_date} onSelect={(date) => setDeliveryForm({ ...deliveryForm, delivery_date: date })} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Lieferant</Label>
              <Input value={deliveryForm.supplier} onChange={(e) => setDeliveryForm({ ...deliveryForm, supplier: e.target.value })} placeholder="Name des Lieferanten" />
            </div>
            <div className="space-y-2">
              <Label>Bemerkungen</Label>
              <Textarea value={deliveryForm.notes} onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeliveryDialogOpen(false); resetDeliveryForm(); }}>Abbrechen</Button>
            <Button onClick={handleSubmitDelivery} disabled={!deliveryForm.clothing_item_id || !deliveryForm.quantity} className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90">Lieferung erfassen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Lieferhistorie: {selectedItemHistory?.article_name} - {selectedItemHistory?.size}</DialogTitle></DialogHeader>
          <div className="py-4">
            {selectedItemHistory && getItemDeliveries(selectedItemHistory.id).length === 0 ? (
              <div className="text-center py-8 text-gray-500"><History className="w-10 h-10 mx-auto mb-2 opacity-50" /><p>Keine Lieferungen vorhanden</p></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Menge</TableHead><TableHead>Lieferant</TableHead><TableHead>Bemerkungen</TableHead></TableRow></TableHeader>
                <TableBody>
                  {selectedItemHistory && getItemDeliveries(selectedItemHistory.id).map(delivery => (
                    <TableRow key={delivery.id}>
                      <TableCell>{format(new Date(delivery.delivery_date), 'd. MMM yyyy', { locale: de })}</TableCell>
                      <TableCell><Badge variant="outline" className="bg-green-50 text-green-700">+{delivery.quantity}</Badge></TableCell>
                      <TableCell>{delivery.supplier || '-'}</TableCell>
                      <TableCell className="text-sm text-gray-500">{delivery.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Issue Dialog */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Artikel ausgeben</DialogTitle></DialogHeader>
          {selectedRequestItem && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Anfrage von:</p>
                <p className="font-medium">{selectedRequestItem.request.employee_id || 'Unbekannt'}</p>
                <p className="text-sm text-gray-600 mt-3 mb-1">Artikel:</p>
                <p className="font-medium">{selectedRequestItem.item.article} - {selectedRequestItem.item.size}</p>
                <div className="mt-3 pt-3 border-t flex justify-between text-sm">
                  <span className="text-gray-600">Angefragt:</span><span className="font-medium">{selectedRequestItem.item.quantity} Stück</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Lagerbestand:</span>
                  <span className="font-medium">{getClothingItem(selectedRequestItem.item.clothing_item_id)?.current_stock || 0} Stück</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Auszugebende Menge *</Label>
                <Input type="number" min="1"
                  max={Math.min(selectedRequestItem.item.quantity, getClothingItem(selectedRequestItem.item.clothing_item_id)?.current_stock || 0)}
                  value={issueForm.quantity} onChange={(e) => setIssueForm({ quantity: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIssueDialogOpen(false); setSelectedRequestItem(null); }}>Abbrechen</Button>
            <Button onClick={handleIssueItems} disabled={!issueForm.quantity} className="bg-green-600 hover:bg-green-700">Ausgeben</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Issue Dialog */}
      <Dialog open={manualIssueDialogOpen} onOpenChange={(open) => {
        setManualIssueDialogOpen(open);
        if (!open) { setManualIssueForm({ employee_id: '', employee_name_free: '', notes: '' }); setManualIssueLines([{ clothing_item_id: '', quantity: 1 }]); }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Manuelle Ausgabe</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {/* Mitarbeiter */}
            <div className="space-y-2">
              <Label>{isUsed ? 'Name *' : 'Mitarbeiter *'}</Label>
              {isUsed ? (
                <Input placeholder="Name eingeben..." value={manualIssueForm.employee_name_free}
                  onChange={(e) => setManualIssueForm({ ...manualIssueForm, employee_name_free: e.target.value })} />
              ) : (
                <select value={manualIssueForm.employee_id} onChange={(e) => setManualIssueForm({ ...manualIssueForm, employee_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md">
                  <option value="">Mitarbeiter auswählen...</option>
                  {[...employees].filter(e => e.is_active !== false).sort((a, b) => a.full_name.localeCompare(b.full_name)).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Artikel-Zeilen */}
            <div className="space-y-2">
              <Label>Artikel *</Label>
              <div className="space-y-2">
                {manualIssueLines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <select
                      value={line.clothing_item_id}
                      onChange={(e) => {
                        const updated = [...manualIssueLines];
                        updated[idx] = { ...updated[idx], clothing_item_id: e.target.value };
                        setManualIssueLines(updated);
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      <option value="">Artikel auswählen...</option>
                      {filteredAndSortedItems.map(item => (
                        <option key={item.id} value={item.id} disabled={item.current_stock === 0}>
                          {item.article_name} - {item.size} (Bestand: {item.current_stock})
                        </option>
                      ))}
                    </select>
                    <Input
                      type="number" min="1"
                      max={line.clothing_item_id ? (items.find(i => i.id === line.clothing_item_id)?.current_stock || 1) : 99}
                      value={line.quantity}
                      onChange={(e) => {
                        const updated = [...manualIssueLines];
                        updated[idx] = { ...updated[idx], quantity: parseInt(e.target.value) || 1 };
                        setManualIssueLines(updated);
                      }}
                      className="w-20 text-sm"
                    />
                    {manualIssueLines.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-red-500 shrink-0"
                        onClick={() => setManualIssueLines(manualIssueLines.filter((_, i) => i !== idx))}>
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="mt-1"
                onClick={() => setManualIssueLines([...manualIssueLines, { clothing_item_id: '', quantity: 1 }])}>
                <Plus className="w-3 h-3 mr-1" /> Weitere Zeile
              </Button>
            </div>

            {/* Bemerkung */}
            <div className="space-y-2">
              <Label>Bemerkung</Label>
              <Textarea value={manualIssueForm.notes} onChange={(e) => setManualIssueForm({ ...manualIssueForm, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setManualIssueDialogOpen(false); setManualIssueForm({ employee_id: '', employee_name_free: '', notes: '' }); setManualIssueLines([{ clothing_item_id: '', quantity: 1 }]); }}>Abbrechen</Button>
            <Button
              onClick={handleManualIssue}
              disabled={(!isUsed && !manualIssueForm.employee_id) || (isUsed && !manualIssueForm.employee_name_free) || !manualIssueLines.some(l => l.clothing_item_id && l.quantity > 0)}
              className="bg-green-600 hover:bg-green-700"
            >
              Ausgabe erfassen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={duplicateDialog.open} onOpenChange={(open) => {
        if (!open) setDuplicateDialog({ open: false, similar: [], pendingData: null });
      }}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-700">
              <ShieldAlert className="w-5 h-5" />
              Artikel bereits vorhanden
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>Der Artikel <strong>"{duplicateDialog.pendingData?.article_name}"</strong> in Größe <strong>{duplicateDialog.pendingData?.size}</strong> existiert bereits:</p>
              <div className="bg-amber-50 rounded-lg border border-amber-200 p-3 max-h-48 overflow-y-auto">
                <ul className="space-y-1.5">
                  {duplicateDialog.similar.map((item) => (
                    <li key={item.id} className="text-sm text-gray-800 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="font-medium">{item.article_name}</span>
                      <span className="text-gray-500">Gr. {item.size}</span>
                      <span className="text-gray-400 text-xs">(Bestand: {item.current_stock})</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-sm">Möchten Sie den Artikel trotzdem anlegen?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDuplicateDialog({ open: false, similar: [], pendingData: null })}>
              Abbrechen
            </AlertDialogCancel>
            <AlertDialogAction onClick={doSubmitItem} className="bg-amber-600 hover:bg-amber-700">
              Trotzdem anlegen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialog.type === 'item' ? 'Artikel entfernen?' : 'Lieferung löschen?'}</AlertDialogTitle>
            <AlertDialogDescription>{deleteDialog.type === 'item' ? 'Der Artikel wird deaktiviert.' : 'Möchten Sie diese Lieferung wirklich löschen?'}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">{deleteDialog.type === 'item' ? 'Deaktivieren' : 'Löschen'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export default ClothingInventoryPanel;