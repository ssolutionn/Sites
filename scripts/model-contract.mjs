import { validateBytes } from 'gltf-validator';

export function parseGlb(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 20 || b.readUInt32LE(0) !== 0x46546c67 || b.readUInt32LE(4) !== 2 || b.readUInt32LE(8) !== b.length) throw new Error('Invalid GLB header');
  if (b.readUInt32LE(16) !== 0x4e4f534a) throw new Error('Missing GLB JSON chunk');
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}
export function budgetFor(id, category) {
  if (id === 'girl') return { triangles: 30000, materials: 4, bones: 60, bytes: 8000000 };
  if (id === 'cat') return { triangles: 15000, materials: 3, bones: 40, bytes: 4000000 };
  if (category === 'kitchen') return { triangles: 8000, materials: 2, bones: 0, bytes: 2000000 };
  if (category === 'food' || id.endsWith('_ornament')) return { triangles: 1000, materials: 1, bones: 0, bytes: 300000 };
  return { triangles: 3000, materials: 2, bones: 0, bytes: 1000000 };
}
export async function inspectModel(bytes, id, category) {
  if (Buffer.from(bytes).subarray(0,80).toString('ascii').startsWith('version https://git-lfs.github.com/spec/')) throw new Error(`${id}: Git LFS pointer; run git lfs pull before building`);
  const d = parseGlb(bytes), budget = budgetFor(id, category);
  if (d.extensionsRequired?.length) throw new Error(`${id}: runtime does not support required extensions`);
  const materials = new Set(); let triangles = 0;
  for (const mesh of d.meshes ?? []) for (const p of mesh.primitives) {
    if ((p.mode ?? 4) !== 4) throw new Error(`${id}: non-triangle primitive`);
    triangles += d.accessors[p.indices ?? p.attributes.POSITION].count / 3;
    if (p.material !== undefined) materials.add(p.material);
    if (p.attributes.JOINTS_1 !== undefined) throw new Error(`${id}: more than four skin influences`);
  }
  const bones = Math.max(0, ...(d.skins ?? []).map((s) => s.joints.length));
  const prefix = category.startsWith('characters') ? 'char' : category === 'kitchen' ? 'kit' : category === 'props' ? 'prop' : 'food';
  if (!d.nodes.some((n) => n.name === `${prefix}_${id}`)) throw new Error(`${id}: missing category root`);
  const row = { id, category, triangles, materials: materials.size, bones, bytes: bytes.length, clips: (d.animations ?? []).map((a) => a.name) };
  for (const key of ['triangles', 'materials', 'bones', 'bytes']) if (row[key] > budget[key]) throw new Error(`${id}: ${key} ${row[key]} > ${budget[key]}`);
  const result = await validateBytes(new Uint8Array(bytes), { uri: `${id}.glb` });
  if (result.issues.numErrors || result.issues.numWarnings) throw new Error(`${id}: glTF validation: ${JSON.stringify(result.issues)}`);
  return row;
}
