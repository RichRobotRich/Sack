import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

/**
 * Hinweis, wenn eine neue Version bereitliegt.
 *
 * Eine installierte PWA behält ihre zwischengespeicherte Fassung, bis der
 * Service Worker wechselt. Ohne diesen Hinweis würde jemand mit der App auf
 * dem Home-Bildschirm unbemerkt eine veraltete Einteilung sehen – bei einer
 * Planungsanwendung der schlimmere Fehler. Deshalb "prompt" statt
 * automatischer Aktualisierung: der Neustart soll nicht mitten in einer
 * Eingabe passieren.
 */
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error('Service Worker konnte nicht registriert werden:', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-lg border border-border bg-card p-4 shadow-lg">
      <p className="text-sm text-foreground">
        Eine neue Version ist verfügbar.
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => updateServiceWorker(true)}>
          Jetzt aktualisieren
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
          Später
        </Button>
      </div>
    </div>
  );
}
