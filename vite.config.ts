import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

// "base" = nazwa repozytorium na GitHubie (https://<konto>.github.io/greenart-3d/)
export default defineConfig({
  base: '/greenart-3d/',
  plugins: [tailwindcss()],
  worker: { format: 'es' },
  // scena 3D ładuje się osobno, po pokazaniu treści
  build: { chunkSizeWarningLimit: 700 },
})
