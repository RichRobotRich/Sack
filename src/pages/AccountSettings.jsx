import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { User, Mail, Lock, Trash2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import MobileSelect from '@/components/MobileSelect';
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
import { toast } from 'sonner';

export default function AccountSettings() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [nameForm, setNameForm] = useState('');
  const [emailForm, setEmailForm] = useState('');
  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      setNameForm(currentUser.full_name || '');
      setEmailForm(currentUser.email || '');
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (!nameForm.trim()) {
      toast.error('Bitte geben Sie einen Namen ein');
      return;
    }

    if (nameForm.trim() === user?.full_name) {
      return;
    }

    setSaving(true);
    try {
      await base44.auth.updateMe({ full_name: nameForm.trim() });
      const freshUser = await base44.auth.me();
      setUser(freshUser);
      setNameForm(freshUser.full_name || '');
      toast.success('Name gespeichert');
    } catch (error) {
      console.error('Error updating name:', error);
      toast.error('Fehler beim Speichern');
      setNameForm(user?.full_name || '');
    } finally {
      setSaving(false);
    }
  };



  const handleUpdateEmail = async () => {
    if (!emailForm.trim() || !emailForm.includes('@')) {
      toast.error('Bitte geben Sie eine gültige E-Mail-Adresse ein');
      return;
    }

    setSaving(true);
    try {
      await base44.auth.updateEmail(emailForm.trim());
      toast.success('E-Mail-Adresse erfolgreich aktualisiert. Bitte überprüfen Sie Ihre E-Mails zur Bestätigung.');
      setTimeout(() => {
        base44.auth.logout();
      }, 2000);
    } catch (error) {
      console.error('Error updating email:', error);
      toast.error('Fehler beim Aktualisieren der E-Mail-Adresse');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
      toast.error('Bitte füllen Sie alle Passwortfelder aus');
      return;
    }

    if (passwordForm.new !== passwordForm.confirm) {
      toast.error('Die neuen Passwörter stimmen nicht überein');
      return;
    }

    if (passwordForm.new.length < 6) {
      toast.error('Das neue Passwort muss mindestens 6 Zeichen lang sein');
      return;
    }

    setSaving(true);
    try {
      await base44.auth.updatePassword(passwordForm.current, passwordForm.new);
      toast.success('Passwort erfolgreich aktualisiert');
      setPasswordForm({ current: '', new: '', confirm: '' });
    } catch (error) {
      console.error('Error updating password:', error);
      toast.error('Fehler beim Aktualisieren des Passworts. Überprüfen Sie Ihr aktuelles Passwort.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await base44.auth.deleteAccount();
      toast.success('Konto wurde gelöscht');
      setTimeout(() => {
        base44.auth.logout();
      }, 1000);
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error('Fehler beim Löschen des Kontos');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-pulse">Lädt...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[#1e3a5f] flex items-center gap-3">
          <User className="w-8 h-8" />
          Kontoverwaltung
        </h1>
        <p className="text-gray-500 mt-1">
          Verwalten Sie Ihre persönlichen Daten und Kontoeinstellungen
        </p>
      </div>

      {/* Name */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="w-5 h-5" />
            Name
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Vollständiger Name</Label>
            <Input
              id="name"
              value={nameForm}
              onChange={(e) => setNameForm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleUpdateName()}
              placeholder="Max Mustermann"
              disabled={saving}
            />
            <p className="text-sm text-gray-500">
              {saving ? 'Wird gespeichert...' : 'Drücken Sie Enter zum Speichern'}
            </p>
          </div>
          {nameForm.trim() !== user?.full_name && (
            <Button 
              onClick={handleUpdateName}
              disabled={saving}
              className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
            >
              <Save className="w-4 h-4 mr-2" />
              Namen speichern
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="w-5 h-5" />
            E-Mail-Adresse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-Mail-Adresse</Label>
            <Input
              id="email"
              type="email"
              value={emailForm}
              onChange={(e) => setEmailForm(e.target.value)}
              placeholder="mail@beispiel.de"
            />
            <p className="text-sm text-gray-500">
              Nach der Änderung müssen Sie Ihre neue E-Mail-Adresse bestätigen.
            </p>
          </div>
          <Button 
            onClick={handleUpdateEmail}
            disabled={saving || emailForm === user.email}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
          >
            <Save className="w-4 h-4 mr-2" />
            E-Mail ändern
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Passwort ändern
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Aktuelles Passwort</Label>
            <Input
              id="current-password"
              type="password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">Neues Passwort</Label>
            <Input
              id="new-password"
              type="password"
              value={passwordForm.new}
              onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
            <Input
              id="confirm-password"
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <Button 
            onClick={handleUpdatePassword}
            disabled={saving || !passwordForm.current || !passwordForm.new || !passwordForm.confirm}
            className="bg-[#1e3a5f] hover:bg-[#1e3a5f]/90"
          >
            <Save className="w-4 h-4 mr-2" />
            Passwort ändern
          </Button>
        </CardContent>
      </Card>

      {/* Delete Account */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-red-600">
            <Trash2 className="w-5 h-5" />
            Gefahrenzone
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Das Löschen Ihres Kontos ist permanent und kann nicht rückgängig gemacht werden. 
            Alle Ihre Daten werden gelöscht.
          </p>
          <Button 
            onClick={() => setShowDeleteDialog(true)}
            variant="destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Konto löschen
          </Button>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sind Sie absolut sicher?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden. Ihr Konto wird permanent gelöscht 
              und alle Ihre Daten werden entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} className="bg-red-600 hover:bg-red-700">
              Konto unwiderruflich löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}