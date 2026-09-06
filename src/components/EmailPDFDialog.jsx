import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Mail, Plus, Trash2, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';

const STORAGE_KEY = 'dailyview_email_recipients';

export default function EmailPDFDialog({
  isOpen,
  onClose,
  selectedDate,
}) {
  const [emailList, setEmailList] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch { return []; }
  });
  const [newEmail, setNewEmail] = useState('');
  const [sending, setSending] = useState(false);

  if (!isOpen) return null;

  const saveAndSet = (list) => {
    setEmailList(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  };

  const handleAddEmail = () => {
    const trimmed = newEmail.trim();
    if (!trimmed) {
      toast.error('E-Mail-Adresse eingeben');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Ungültige E-Mail-Adresse');
      return;
    }
    if (emailList.includes(trimmed)) {
      toast.error('E-Mail-Adresse existiert bereits');
      return;
    }
    saveAndSet([...emailList, trimmed]);
    setNewEmail('');
  };

  const handleRemoveEmail = (email) => {
    saveAndSet(emailList.filter(e => e !== email));
  };

  const handleSendEmail = async () => {
    if (emailList.length === 0) {
      toast.error('Mindestens eine E-Mail-Adresse erforderlich');
      return;
    }

    setSending(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const dateFormatted = format(selectedDate, 'dd.MM.yyyy');

      // Rufe Backend-Funktion auf um Email zu versenden
      const response = await base44.functions.invoke('sendDailyViewPDFEmail', {
        emails: emailList,
        selectedDate: dateStr,
        emailContent: `Tageseinteilung für den ${dateFormatted}\n\nMit freundlichen Grüßen\nLeniger`,
      });

      toast.success(`E-Mail an ${emailList.length} Empfänger versendet`);

      // Dialog schließen (Empfänger bleiben gespeichert)
      onClose();
      setNewEmail('');
    } catch (error) {
      console.error('Error sending email:', error);
      toast.error('Fehler beim Versenden der E-Mail');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-96 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Mail className="w-5 h-5" />
            PDF per E-Mail versenden
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* E-Mail-Eingabe */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            E-Mail-Adresse
          </label>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="info@beispiel.de"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
              className="rounded-lg"
            />
            <Button
              onClick={handleAddEmail}
              size="sm"
              variant="outline"
              className="px-3"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* E-Mail-Liste */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Empfänger ({emailList.length})
          </label>
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-gray-50 dark:bg-gray-900">
            {emailList.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                Keine Empfänger hinzugefügt
              </p>
            ) : (
              emailList.map((email, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-white dark:bg-gray-800 rounded px-3 py-2 border border-gray-200 dark:border-gray-700"
                >
                  <span className="text-sm text-gray-700 dark:text-gray-300">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleSendEmail}
            disabled={emailList.length === 0 || sending}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            {sending ? (
              <>
                <span className="animate-spin">⌛</span> Wird versendet...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Versenden
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}