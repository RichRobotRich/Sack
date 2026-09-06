import React from 'react';
import { ShieldAlert } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

/**
 * Hinweis für ein angemeldetes, aber noch nicht freigegebenes Konto.
 *
 * Zeigt bewusst die angemeldete Adresse: der häufigste Grund für diesen
 * Bildschirm ist eine Anmeldung mit dem falschen Konto. Der Abmelde-Knopf
 * gehört dazu, sonst führt der Hinweis in eine Sackgasse.
 */
export default function UserNotRegisteredError() {
  const { user, logout } = useAuth();

  return (
    <AuthLayout
      icon={ShieldAlert}
      title="Konto noch nicht freigegeben"
      subtitle="Ein Administrator muss den Zugang freischalten."
    >
      <div className="space-y-6">
        {user?.email && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="text-muted-foreground">Angemeldet als</p>
            <p className="font-medium text-foreground break-all">{user.email}</p>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Dein Konto wurde angelegt. Sobald es freigegeben ist, kommst du mit
          denselben Zugangsdaten in die App – melde dich einfach erneut an.
        </p>

        <Button variant="outline" className="w-full" onClick={() => logout()}>
          Abmelden und anderes Konto verwenden
        </Button>
      </div>
    </AuthLayout>
  );
}
