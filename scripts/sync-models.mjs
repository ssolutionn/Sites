// Only exports reach public/; Blender sources and texture working files stay in assets/.
import { readdir, readFile, mkdir, rm, copyFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectModel, parseGlb } from './model-contract.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'assets'), destination = join(root, 'public/assets/models');
const runtime = new Set(['girl', 'cat', 'knife', 'board', 'cat_bowl', 'back_counter', 'island', 'fridge', 'egg', 'potato', 'potato_peeled', 'beet']);
async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else if (e.name.endsWith('.glb')) out.push(p);
  }
  return out;
}
const models = [], ids = new Set();
for (const file of (await walk(source)).sort()) {
  const path = relative(source, file).replaceAll('\\', '/');
  const id = path.split('/').at(-1).replace(/\.glb$/, ''), category = path.startsWith('characters/') ? path.split('/').slice(0, 2).join('/') : path.split('/')[0];
  if (ids.has(id)) throw new Error(`Duplicate model ID: ${id}`);
  ids.add(id);
  const data = await readFile(file);
  const row = await inspectModel(data,id,category), gltf = parseGlb(data);
  let markers = {};
  try { markers = JSON.parse(await readFile(file.replace(/\.glb$/,'.clips.json'),'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  for (const [name,events] of Object.entries(markers)) {
    const clip = gltf.animations?.find((a) => a.name === name);
    if (!clip || !events || typeof events !== 'object') throw new Error(`${id}: invalid clip markers for ${name}`);
    const duration = Math.max(...clip.samplers.map((s) => gltf.accessors[s.input].max[0]));
    for (const time of Object.values(events)) if (!Number.isFinite(time) || time < 0 || time > duration) throw new Error(`${id}: marker outside ${name}`);
  }
  models.push({ ...row, markers, path, runtime: runtime.has(id) });
}
for (const id of runtime) if (!ids.has(id)) throw new Error(`Missing runtime asset: ${id}`);
// Keep the watched directory alive: deleting it makes Vite lose its public-file
// registry until restart. Validate first, then refresh files and prune old GLBs.
await mkdir(destination, { recursive: true });
for (const m of models) { const to = join(destination, m.path); await mkdir(dirname(to), { recursive: true }); await copyFile(join(source, m.path), to); }
await writeFile(join(destination, 'manifest.json'), JSON.stringify({ version: 1, models }, null, 2) + '\n');
const liveFiles = new Set(models.map((m) => join(destination, m.path)));
for (const file of await walk(destination)) if (!liveFiles.has(file)) await rm(file);
await writeFile(join(root, 'docs/cozy-model-stats.json'), JSON.stringify(models, null, 2) + '\n');
console.log(`Models: ${models.length} validated; ${models.filter((m) => m.runtime).length} runtime; ${(models.reduce((n, m) => n + m.bytes, 0) / 1048576).toFixed(2)} MiB GLB; zero errors/warnings.`);
