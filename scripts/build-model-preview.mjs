// A single HTML file: double-click it locally, no server or external CDN required.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(resolve(root, 'public/assets/models/manifest.json'), 'utf8'));
const files = Object.fromEntries(await Promise.all(manifest.models.map(async (m) => [m.id, (await readFile(resolve(root, 'public/assets/models', m.path))).toString('base64')])));
const source = await readFile(resolve(root, 'src/model-gallery.js'), 'utf8');
const imports = source.split('\n').filter((line) => line.startsWith('import ')).join('\n');
const body = source.split('\n').filter((line) => !line.startsWith('import ')).join('\n');
const bundle = await build({ stdin: { contents: `${imports}\n(async()=>{${body}\n})().catch(e=>{document.querySelector('#error').textContent=e.message;});`, resolveDir: resolve(root, 'src'), sourcefile:'model-preview.js' }, bundle:true, format:'iife', minify:true, write:false, target:'es2020', define:{ 'import.meta.env.BASE_URL':'""' } });
let html = await readFile(resolve(root, 'model-gallery.html'), 'utf8');
const icon = (await readFile(resolve(root, 'public/assets/logo-neutral.svg'))).toString('base64');
html = html.replace('./assets/logo-neutral.svg', `data:image/svg+xml;base64,${icon}`)
  .replace('<a href="./index.html">← Играть</a>', '<span>Предварительная 3D-версия</span>')
  .replace('<script type="module" src="/src/model-gallery.js"></script>', () => `<script>window.__COZY_PACK__=${JSON.stringify({manifest,files}).replaceAll('<','\\u003c')};</script><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
const out = process.argv[2] ?? resolve(root, '../novogodnyaya-sueta-3d-preview.html');
await writeFile(out, html);
console.log(`Offline preview: ${out} (${(Buffer.byteLength(html)/1048576).toFixed(1)} MiB), ${manifest.models.length} models.`);
