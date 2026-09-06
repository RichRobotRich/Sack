import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Download, Filter, X, TrendingUp, CheckCircle, Undo2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import * as XLSX from 'xlsx';

export default function ClothingIssueHistory({ issues, deliveries = [], items = [], users, currentUser, isUsed = null, onRefresh }) {
  const [filterUser, setFilterUser] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'ausgabe' | 'lieferung'
  const [filterStartDate, setFilterStartDate] = useState(null);
  const [filterEndDate, setFilterEndDate] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [returningId, setReturningId] = useState(null);

  const getUserName = (emailOrId) => {
    if (!emailOrId) return '-';
    const user = (users || []).find(u => u.email === emailOrId || u.id === emailOrId);
    if (user?.full_name) return user.full_name;
    if (currentUser && (currentUser.email === emailOrId || currentUser.id === emailOrId)) {
      return currentUser.full_name || emailOrId;
    }
    return emailOrId;
  };

  // Filter issues/deliveries by isUsed (null = alle, true/false = nur matching items)
  const itemIdsByUsed = useMemo(() => {
    if (isUsed === null) return null;
    return new Set(items.filter(i => !!i.is_used === isUsed).map(i => i.id));
  }, [items, isUsed]);

  // Combine issues and deliveries into a unified list
  const combinedEntries = useMemo(() => {
    const filteredIssues = isUsed === null ? issues : issues.filter(i => itemIdsByUsed.has(i.clothing_item_id));
    const filteredDeliveries = isUsed === null ? deliveries : deliveries.filter(d => itemIdsByUsed.has(d.clothing_item_id));

    const issueEntries = filteredIssues.map(issue => ({
      ...issue,
      _type: 'ausgabe',
      _date: issue.issue_date,
      _displayDate: issue.issue_date,
    }));

    const deliveryEntries = filteredDeliveries.map(delivery => {
      const clothingItem = items.find(i => i.id === delivery.clothing_item_id);
      return {
        ...delivery,
        _type: 'lieferung',
        _date: delivery.delivery_date,
        _displayDate: delivery.delivery_date,
        article_name: clothingItem?.article_name || '-',
        size: clothingItem?.size || '-',
      };
    });

    return [...issueEntries, ...deliveryEntries].sort((a, b) => {
      // Primär: created_date (exakter Timestamp), Fallback: _date
      const dateA = new Date(a.created_date || a._date);
      const dateB = new Date(b.created_date || b._date);
      return dateB - dateA;
    });
  }, [issues, deliveries, items]);

  // Build filter options: all unique names from "Benutzer" and "Mitarbeiter/Lieferant" columns
  const filterOptions = useMemo(() => {
    const names = new Set();
    combinedEntries.forEach(entry => {
      // Benutzer (erfassende Person)
      const benutzer = entry.recorded_by_name || getUserName(entry.created_by);
      if (benutzer && benutzer !== '-') names.add(benutzer);
      // Mitarbeiter / Lieferant
      if (entry._type === 'ausgabe' && entry.employee_name) names.add(entry.employee_name);
      if (entry._type === 'lieferung' && entry.supplier) names.add(entry.supplier);
    });
    return [...names].sort();
  }, [combinedEntries, users, currentUser]);

  const filteredEntries = useMemo(() => {
    return combinedEntries.filter(entry => {
      // Type filter
      if (filterType !== 'all' && entry._type !== filterType) return false;

      // Filter: column depends on type
      if (filterUser) {
        const benutzer = entry.recorded_by_name || getUserName(entry.created_by);
        const mitarbeiter = entry._type === 'ausgabe'
          ? (entry.employee_name || benutzer)
          : (entry.supplier || '');

        if (filterType === 'all') {
          // Beide Spalten prüfen
          if (benutzer !== filterUser && mitarbeiter !== filterUser) return false;
        } else if (filterType === 'ausgabe') {
          // Nur Mitarbeiter/Lieferant-Spalte
          if (mitarbeiter !== filterUser) return false;
        } else if (filterType === 'lieferung') {
          // Nur Benutzer-Spalte
          if (benutzer !== filterUser) return false;
        }
      }

      // Date range filter
      if (filterStartDate) {
        const d = new Date(entry._date);
        if (d < filterStartDate) return false;
      }
      if (filterEndDate) {
        const d = new Date(entry._date);
        if (d > filterEndDate) return false;
      }

      // Search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          entry.article_name?.toLowerCase().includes(term) ||
          entry.size?.toLowerCase().includes(term) ||
          entry.employee_name?.toLowerCase().includes(term) ||
          entry.supplier?.toLowerCase().includes(term)
        );
      }

      return true;
    });
  }, [combinedEntries, filterType, filterUser, filterStartDate, filterEndDate, searchTerm]);



  const handleExcelDownload = () => {
    const data = filteredEntries.map(entry => {
      if (entry._type === 'ausgabe') {
        return {
          'Typ': 'Ausgabe',
          'Benutzer': entry.recorded_by_name || getUserName(entry.created_by),
          'Mitarbeiter': entry.employee_name || getUserName(entry.created_by),
          'Artikel': entry.article_name,
          'Größe': entry.size,
          'Menge': entry.quantity,
          'Datum': format(new Date(entry._date), 'd.M.yyyy'),
          'Lieferant/Bemerkung': entry.notes || '',
        };
      } else {
        return {
          'Typ': 'Lieferung',
          'Benutzer': (entry.recorded_by_name || getUserName(entry.created_by)),
          'Mitarbeiter': '-',
          'Artikel': entry.article_name,
          'Größe': entry.size,
          'Menge': entry.quantity,
          'Datum': format(new Date(entry._date), 'd.M.yyyy'),
          'Lieferant/Bemerkung': [entry.supplier, entry.notes].filter(Boolean).join(' – ') || '',
        };
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historie');
    worksheet['!cols'] = [
      { wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 30 }
    ];
    XLSX.writeFile(workbook, `Arbeitskleidung_Historie_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const clearFilters = () => {
    setFilterUser('');
    setFilterType('all');
    setFilterStartDate(null);
    setFilterEndDate(null);
    setSearchTerm('');
  };

  const hasActiveFilters = filterUser || filterType !== 'all' || filterStartDate || filterEndDate || searchTerm;

  const handleReturnIssue = async (issue) => {
    if (!confirm(`Möchten Sie die Ausgabe von ${issue.quantity}x ${issue.article_name} (${issue.size}) an ${issue.employee_name} wirklich zurücknehmen?`)) return;
    setReturningId(issue.id);
    try {
      const clothingItem = items.find(i => i.id === issue.clothing_item_id);
      if (clothingItem) {
        await base44.entities.ClothingItem.update(clothingItem.id, { current_stock: clothingItem.current_stock + issue.quantity });
      }
      await base44.entities.ClothingIssue.update(issue.id, {
        is_returned: true,
        returned_date: new Date().toISOString().split('T')[0],
      });
      if (onRefresh) onRefresh();
    } finally {
      setReturningId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </h3>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="w-4 h-4 mr-1" />
              Zurücksetzen
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label>Suche</Label>
            <Input
              placeholder="Artikel, Name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Typ</Label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
              style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
            >
              <option value="all">Alle</option>
              <option value="ausgabe">Ausgaben</option>
              <option value="lieferung">Lieferungen</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>Person</Label>
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md dark:bg-gray-800 dark:text-white"
              style={{ WebkitAppearance: 'menulist', appearance: 'auto' }}
            >
              <option value="">Alle Personen</option>
              {filterOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>Von Datum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  {filterStartDate ? format(filterStartDate, 'd.M.yyyy') : 'Datum wählen'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={filterStartDate} onSelect={setFilterStartDate} />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Bis Datum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  {filterEndDate ? format(filterEndDate, 'd.M.yyyy') : 'Datum wählen'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent mode="single" selected={filterEndDate} onSelect={setFilterEndDate} />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          {filteredEntries.length} {filteredEntries.length === 1 ? 'Eintrag' : 'Einträge'}
        </p>
        <Button onClick={handleExcelDownload} variant="outline" disabled={filteredEntries.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Excel herunterladen
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Typ</TableHead>
              <TableHead>Benutzer</TableHead>
              <TableHead>Mitarbeiter / Lieferant</TableHead>
              <TableHead>Artikel</TableHead>
              <TableHead>Größe</TableHead>
              <TableHead className="text-right">Menge</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead>Bemerkung</TableHead>
              {isUsed && <TableHead></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isUsed ? 9 : 8} className="text-center py-8 text-gray-500">
                  Keine Einträge gefunden
                </TableCell>
              </TableRow>
            ) : (
              filteredEntries.map((entry) => (
                <TableRow key={`${entry._type}-${entry.id}`}>
                  <TableCell>
                    {entry._type === 'ausgabe' ? (
                      entry.is_returned ? (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 whitespace-nowrap">
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Zurückgegeben
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 whitespace-nowrap">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Ausgabe
                        </Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        Lieferung
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {entry.recorded_by_name || getUserName(entry.created_by) || '-'}
                  </TableCell>
                  <TableCell>
                    {entry._type === 'ausgabe'
                      ? (entry.employee_name || getUserName(entry.created_by))
                      : (entry.supplier || '-')}
                  </TableCell>
                  <TableCell>{entry.article_name}</TableCell>
                  <TableCell>{entry.size}</TableCell>
                  <TableCell className="text-right font-medium">
                    <span className={entry._type === 'lieferung' ? 'text-blue-600' : 'text-green-600'}>
                      {entry._type === 'lieferung' ? '+' : '-'}{entry.quantity}
                    </span>
                  </TableCell>
                  <TableCell>
                    {format(new Date(entry._date), 'd. MMM yyyy', { locale: de })}
                  </TableCell>
                  <TableCell className="text-sm text-gray-500 max-w-xs truncate">
                    {entry.notes || '-'}
                  </TableCell>
                  {isUsed && (
                    <TableCell>
                      {entry._type === 'ausgabe' && !entry.is_returned && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={returningId === entry.id}
                          onClick={() => handleReturnIssue(entry)}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 whitespace-nowrap"
                        >
                          <Undo2 className="w-3 h-3 mr-1" />
                          Zurückgeben
                        </Button>
                      )}
                      {entry._type === 'ausgabe' && entry.is_returned && entry.returned_date && (
                        <span className="text-xs text-gray-400">
                          {format(new Date(entry.returned_date), 'd. MMM yyyy', { locale: de })}
                        </span>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}