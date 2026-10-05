import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { open: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
