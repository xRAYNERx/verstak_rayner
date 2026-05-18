import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: [], include: ['electron'] })],
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'electron/main.ts'),
        external: ['electron', 'better-sqlite3', 'node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ include: ['electron'] })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload.ts'),
        external: ['electron']
      }
    }
  },
  renderer: {
    root: '.',
    build: { outDir: 'out/renderer', rollupOptions: { input: resolve(__dirname, 'index.html') } },
    plugins: [react()]
  }
})
