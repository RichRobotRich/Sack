import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Macht die App auf Rechner und Telefon installierbar. Auf iPhone/iPad
    // läuft die Installation über "Zum Home-Bildschirm" in Safari; einen
    // App-Store-Eintrag ersetzt das nicht.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon-32.png', 'favicon-48.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Leniger Planung',
        short_name: 'Leniger',
        description: 'Einsatzplanung, Urlaub und Berichte',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#1e293b',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Der Hauptbundle liegt über der Vorgabe von 2 MB.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Planungsdaten nie aus dem Cache beantworten: eine veraltete
        // Einteilung anzuzeigen wäre schlimmer als eine Fehlermeldung.
        navigateFallbackDenylist: [/^\/api/, /^\/rest/, /^\/auth/],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    // Ersetzt die Pfad-Auflösung, die vorher das Base44-Vite-Plugin mitbrachte.
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
