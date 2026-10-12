// Контрольная модель плиты для 3D-художника: тот же код, что строит плиту в игре (src/view/stove-model.js),
// пишется в production/previews/stove-reference.glb. Это ЭТАЛОН размеров и деталей, а не ассет игры:
// в assets/ и public/assets/models/ ничего не кладём (счётчик «27 моделей» не меняется).
//   node scripts/export-stove.mjs
import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildStove, STOVE_DIMS } from '../src/view/stove-model.js';
import { STOVE } from '../src/campaign/layout.js';

// GLTFExporter в node: читает Blob через FileReader
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((v) => { this.result = v; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((v) => { this.result = `data:${blob.type};base64,${Buffer.from(v).toString('base64')}`; this.onloadend?.(); }); }
};

const out = 'production/previews/stove-reference.glb';
const m = buildStove(THREE, { burners: STOVE.burners, burnerR: STOVE.r });
const root = m.group;
// объект.clone() сериализует userData вместе со ссылками на меши: чистим всё, кроме описания модели
root.traverse((o) => { o.userData = {}; if (o.material?.side === THREE.BackSide) o.material.side = THREE.DoubleSide; }); // glTF не знает BackSide: внутренность камеры духовки — двусторонняя
root.userData = {
  unit: 'm',
  axes: 'x вправо, y вверх, z к игроку',
  origin: 'пол, центр передней кромки (передняя плоскость дверцы и панели z = 0, корпус уходит в -z)',
  body: [STOVE_DIMS.w, STOVE_DIMS.deckY, STOVE_DIMS.d],
  burnersFromHobCenter: STOVE.burners.map((b) => [b.x, b.z]),
  burnerCenterRowZ: -STOVE_DIMS.burnerZ,
  potRestY: STOVE_DIMS.gridY,
  knobs: 'knob_0..knob_3 слева направо = конфорки 0..3; ось на игрока; метка вверх при нуле; поворот по часовой, 30° на деление, до 9',
  ovenDoor: 'oven_door: петли на нижней кромке (rotation.x > 0 — открывается на игрока)',
};
root.updateMatrixWorld(true);
const buffer = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
await fs.mkdir('production/previews', { recursive: true });
await fs.writeFile(out, Buffer.from(buffer));
let meshes = 0, tris = 0;
root.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; } });
console.log(`${out}: ${(buffer.byteLength / 1024).toFixed(1)} КБ, мешей ${meshes}, треугольников ${Math.round(tris)}`);
