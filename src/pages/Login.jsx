import React, { useState } from 'react';
import { LogIn, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/api/client';
import { APP_NAME } from '@/lib/branding';

/**
 * Anmeldung. Unter Base44 lag dieser Schritt beim Anbieter – jetzt gehört er
 * zur App. Nach erfolgreicher Anmeldung übernimmt der AuthProvider: er lädt
 * das Profil und prüft die Freigabe.
 */
export default function Login() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /** Zielseite aus ?redirect=, sonst Startseite. */
  const redirectTarget = () => {
    const target = new URLSearchParams(window.location.search).get('redirect');
    if (!target) return '/';
    // Nur Ziele innerhalb dieser App zulassen, damit der Parameter nicht auf
    // eine fremde Seite umleiten kann.
    try {
      const url = new URL(target, window.location.origin);
      return url.origin === window.location.origin ? `${url.pathname}${url.search}` : '/';
    } catch {
      return '/';
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');

    try {
      if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (signUpError) throw signUpError;
        setNotice(
          'Konto angelegt. Es muss noch von einem Administrator freigegeben werden, ' +
            'bevor die Anmeldung funktioniert.',
        );
        setMode('signin');
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      window.location.href = redirectTarget();
    } catch (submitError) {
      setError(submitError.message || 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${redirectTarget()}` },
    });
    if (oauthError) setError(oauthError.message);
  };

  return (
    <AuthLayout
      icon={LogIn}
      title={APP_NAME}
      subtitle={mode === 'signin' ? 'Bitte anmelden' : 'Konto anlegen'}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div className="space-y-2">
            <Label htmlFor="fullName">Name</Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Passwort</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {notice && <p className="text-sm text-green-700">{notice}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {mode === 'signin' ? 'Anmelden' : 'Konto anlegen'}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">oder</span>
        </div>
      </div>

      <Button type="button" variant="outline" className="w-full" onClick={handleGoogle}>
        Mit Google anmelden
      </Button>

      <p className="text-center text-sm text-muted-foreground mt-6">
        {mode === 'signin' ? 'Noch kein Konto?' : 'Bereits registriert?'}{' '}
        <button
          type="button"
          className="underline"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError('');
            setNotice('');
          }}
        >
          {mode === 'signin' ? 'Registrieren' : 'Anmelden'}
        </button>
      </p>
    </AuthLayout>
  );
}
