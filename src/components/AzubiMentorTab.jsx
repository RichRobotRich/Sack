import React, { useState } from 'react';
import { api } from '@/api/client';
import { GraduationCap, UserCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AzubiMentorTab({ employees, onEmployeesChange }) {
  const [saving, setSaving] = useState(null);

  const azubis = employees
    .filter(e => e.employee_type === 'azubi')
    .sort((a, b) => {
      const yearDiff = (a.apprentice_year || 0) - (b.apprentice_year || 0);
      if (yearDiff !== 0) return yearDiff;
      return (a.full_name || '').localeCompare(b.full_name || '', 'de');
    });

  const monteure = employees
    .filter(e => e.employee_type === 'monteur' && e.is_active !== false && !e.is_ef)
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'de'));

  const handleMentorChange = async (azubiId, mentorId) => {
    setSaving(azubiId);
    try {
      const value = mentorId === '__none__' ? null : mentorId;
      await api.entities.Employee.update(azubiId, { mentor_id: value });
      onEmployeesChange(prev =>
        prev.map(e => e.id === azubiId ? { ...e, mentor_id: value } : e)
      );
      toast.success('Zuordnung gespeichert');
    } catch {
      toast.error('Fehler beim Speichern');
    } finally {
      setSaving(null);
    }
  };

  const getMentorName = (mentorId) => {
    if (!mentorId) return null;
    return monteure.find(m => m.id === mentorId)?.full_name || null;
  };

  // Gruppiere nach Lehrjahr
  const years = [...new Set(azubis.map(a => a.apprentice_year || 0))].sort((a, b) => a - b);

  if (azubis.length === 0) {
    return (
      <div className="py-16 text-center text-gray-400">
        <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>Keine Azubis vorhanden</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Jedem Azubi kann hier ein Monteur als Betreuer zugeordnet werden.
      </p>

      {years.map(year => (
        <div key={year}>
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-green-600" />
            <h3 className="font-semibold text-gray-700 dark:text-gray-300">
              {year ? `${year}. Lehrjahr` : 'Kein Lehrjahr'}
            </h3>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
              {azubis.filter(a => (a.apprentice_year || 0) === year).length} Azubis
            </Badge>
          </div>

          <Card className="border-0 shadow-sm dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="p-0">
              <div className="divide-y dark:divide-gray-700">
                {azubis
                  .filter(a => (a.apprentice_year || 0) === year)
                  .map(azubi => {
                    const mentor = getMentorName(azubi.mentor_id);
                    return (
                      <div key={azubi.id} className="flex items-center justify-between px-4 py-3 gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-semibold text-green-700 dark:text-green-400">
                              {azubi.full_name?.charAt(0) || '?'}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">{azubi.full_name}</p>
                            {mentor && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <UserCheck className="w-3 h-3" />
                                {mentor}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="w-48 flex-shrink-0">
                          <Select
                            value={azubi.mentor_id || '__none__'}
                            onValueChange={(val) => handleMentorChange(azubi.id, val)}
                            disabled={saving === azubi.id}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue placeholder="Monteur wählen..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Kein Betreuer —</SelectItem>
                              {monteure.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}