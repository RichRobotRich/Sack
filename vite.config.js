import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Ersetzt die Pfad-Auflösung, die vorher das Base44-Vite-Plugin mitbrachte.
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
