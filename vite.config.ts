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
  // Don't esbuild-prebundle the wasm-bindgen package: that breaks its
  // `new URL('nucleation_bg.wasm', import.meta.url)` asset resolution in dev
  // (the fetch falls back to index.html). Excluding it lets Vite's normal
  // asset pipeline rewrite the URL correctly.
  optimizeDeps: {
    exclude: ['nucleation'],
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  build: {
    target: 'esnext',
  },
})
