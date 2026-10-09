import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { rmSync } from 'node:fs';

// VITE_NEUTRAL=1 — сборка без бренда партнёра (публичные ссылки и превью): нейтральная иконка вкладки,
// логотип партнёра не попадает в dist. Тот же флаг читает игра (src/view/textures.js).
const NEUTRAL = ['1', 'true'].includes(String(process.env.VITE_NEUTRAL ?? ''));

function neutralBrand() {
  let outDir = 'dist';
  return {
    name: 'neutral-brand',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    transformIndexHtml(html) {
      return NEUTRAL ? html.replaceAll('logo-5.svg', 'logo-neutral.svg') : html;
    },
    closeBundle() {
      if (NEUTRAL) rmSync(resolve(outDir, 'assets/logo-5.svg'), { force: true });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [neutralBrand()],
  server: { open: true },
  preview: { open: false },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200, rollupOptions: { input: { game: resolve('index.html'), classic: resolve('classic.html'), gallery: resolve('gallery.html') } } },
});
