// Встроить 3D-модели в сборку одним скриптом — для хостингов, которые не отдают .glb (публичная ссылка claude.ai).
//   node scripts/embed-models.mjs <dist> [--all]
// Пишет <dist>/assets/models/pack.js (window.__COZY_PACK__: манифест + GLB в base64; src/view/assets.js читает его
// вместо сети) и подключает его в index.html и model-gallery.html до модулей игры. По умолчанию — только модели,
// которые использует игра (runtime); --all — все, для галереи.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dist = process.argv[2];
if (!dist) throw new Error('usage: node scripts/embed-models.mjs <dist> [--all]');
const all = process.argv.includes('--all');
const dir = join(dist, 'assets/models');
const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
const models = manifest.models.filter((m) => all || m.runtime);
const files = {};
for (const m of models) files[m.id] = (await readFile(join(dir, m.path))).toString('base64');
const pack = { manifest: { ...manifest, models }, files };
await writeFile(join(dir, 'pack.js'), `window.__COZY_PACK__=${JSON.stringify(pack)};\n`);
const tag = '<script src="./assets/models/pack.js"></script>';
for (const page of ['index.html', 'model-gallery.html']) {
  const p = join(dist, page);
  let html;
  try {
    html = await readFile(p, 'utf8');
  } catch {
    continue;
  }
  if (html.includes(tag)) continue;
  // до первого скрипта-модуля: классический скрипт выполняется раньше отложенных модулей
  html = html.replace(/<script type="module"/, `${tag}\n    <script type="module"`);
  await writeFile(p, html);
}
const bytes = Object.values(files).reduce((s, b) => s + b.length, 0);
console.log(`Встроено моделей: ${models.length}, pack.js ≈ ${(bytes / 1048576).toFixed(2)} МБ`);
