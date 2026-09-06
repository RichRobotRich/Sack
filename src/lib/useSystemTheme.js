import { useEffect } from 'react';

/**
 * Übernimmt die Hell/Dunkel-Einstellung des Betriebssystems.
 *
 * Tailwind ist auf darkMode: 'class' eingestellt, also muss die Klasse 'dark'
 * am <html>-Element gesetzt werden. Der Aufruf gehört in die Wurzel der App
 * und nicht ins Layout: die Anmeldeseite liegt außerhalb des Layouts und
 * bliebe sonst immer hell, während der Rest der App umschaltet.
 */
export function useSystemTheme() {
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = (isDark) => {
      document.documentElement.classList.toggle('dark', isDark);
    };

    apply(mediaQuery.matches);

    const handleChange = (event) => apply(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
}
