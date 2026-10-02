import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function copyMapLibreWorkerDependency() {
  return {
    name: 'copy-maplibre-worker-dependency',
    writeBundle(options: { dir?: string }) {
      const outputDirectory = options.dir ?? resolve('dist')
      copyFileSync(
        resolve('node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs'),
        resolve(outputDirectory, 'assets/maplibre-gl-shared.mjs'),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyMapLibreWorkerDependency()],
  base: process.env.VITE_BASE_PATH ?? '/',
})
