import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { mcAssetsPlugin } from './vite-plugin-mc-assets'

export default defineConfig({
  plugins: [react(), mcAssetsPlugin()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  worker: {
    format: 'es',
  },
})
