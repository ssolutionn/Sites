import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  server: { open: true },
  preview: { open: false },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, rollupOptions: { input: { game: resolve('index.html'), gallery: resolve('gallery.html') } } },
});
