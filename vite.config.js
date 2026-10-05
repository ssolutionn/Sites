import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: true },
  preview: { open: false },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
