// Мишура на ёлке (0.11): пушистая лента вдоль точек нитки. Один меш (трубка и ворсинки в одной геометрии, металлический
// материал) и один Points (блёстки) на нитку — не больше двух вызовов отрисовки. Нитки живут в группе ёлки, точки — в её координатах.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TINSEL } from '../campaign/data.js';
import { normalAt } from '../campaign/tree-geo.js';

const TUBE_R = 0.011; // толщина жилы, м
const FUZZ_STEP = 0.0075; // ворсинки — каждые 7,5 мм нитки
const FUZZ_PER = 3;

// Детерминированный «случайный» ряд: нитка выглядит одинаково при каждой перерисовке.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Геометрия нитки: трубка по сплайну через точки (чуть над веткой) плюс ворсинки-«лучики» вокруг неё.
 * @returns {{ geo: THREE.BufferGeometry, glitter: THREE.BufferGeometry }}
 */
export function buildThreadGeometry(pts, seed = 1) {
  const lifted = pts.map((p) => {
    const n = normalAt(p);
    return new THREE.Vector3(p.x + n.x * TUBE_R * 0.9, p.y + n.y * TUBE_R * 0.9, p.z + n.z * TUBE_R * 0.9);
  });
  const curve = new THREE.CatmullRomCurve3(lifted, false, 'centripetal');
  const length = curve.getLength();
  const tube = new THREE.TubeGeometry(curve, Math.max(2, (pts.length - 1) * 2), TUBE_R, 5, false).toNonIndexed();
  const rand = rng(seed);
  const m = Math.max(2, Math.ceil(length / FUZZ_STEP));
  const pos = [], nor = [], uv = [];
  const gl = [];
  const tan = new THREE.Vector3(), r = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), tip = new THREE.Vector3();
  for (let i = 0; i < m; i++) {
    const u = i / (m - 1);
    curve.getPointAt(u, c);
    curve.getTangentAt(u, tan);
    for (let k = 0; k < FUZZ_PER; k++) {
      r.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      d.copy(r).addScaledVector(tan, -r.dot(tan)).normalize();
      const len = 0.014 + rand() * 0.014;
      a.copy(c).addScaledVector(tan, -0.0022);
      b.copy(c).addScaledVector(tan, 0.0022);
      tip.copy(c).addScaledVector(d, len).addScaledVector(tan, (rand() - 0.5) * 0.008);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, tip.x, tip.y, tip.z);
      for (let q = 0; q < 3; q++) nor.push(d.x, d.y, d.z);
      uv.push(0, 0, 1, 0, 0.5, 1);
    }
    if (i % 5 === 0) {
      d.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      gl.push(c.x + d.x * 0.02, c.y + d.y * 0.02, c.z + d.z * 0.02);
    }
  }
  const fuzz = new THREE.BufferGeometry();
  fuzz.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  fuzz.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  fuzz.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const geo = mergeGeometries([tube, fuzz], false);
  tube.dispose();
  fuzz.dispose();
  const glitter = new THREE.BufferGeometry();
  glitter.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3));
  return { geo, glitter, length };
}

/** Нитки мишуры на ёлке. sync(threads) вызывается каждый кадр: меняет только то, что изменилось. */
export class TinselView {
  /** @param parent группа ёлки (THREE.Group) */
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'tinsel';
    parent.add(this.group);
    this.items = new Map(); // id нитки → { mesh, glitter, n, color }
    this.mats = {};
    for (const [id, t] of Object.entries(TINSEL)) {
      this.mats[id] = {
        calm: new THREE.MeshStandardMaterial({ color: t.color, metalness: 0.85, roughness: 0.34, emissive: t.color, emissiveIntensity: 0.2, side: THREE.DoubleSide }),
        hot: new THREE.MeshStandardMaterial({ color: t.color, metalness: 0.85, roughness: 0.34, emissive: 0xffffff, emissiveIntensity: 0.55, side: THREE.DoubleSide }),
      };
    }
    this.glitterMat = new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.016, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  }

  /** Число мешей-вызовов отрисовки (для проверки лимита: не больше двух на нитку). */
  drawCalls() {
    let n = 0;
    for (const it of this.items.values()) n += (it.mesh.visible ? 1 : 0) + (it.glitter.visible ? 1 : 0);
    return n;
  }

  /** @param threads [{ id, color, pts: [{x,y,z}] }]; hotId — нитка под «ножницами» (подсвечивается). */
  sync(threads, hotId = null) {
    const live = new Set();
    for (const th of threads) {
      live.add(th.id);
      let it = this.items.get(th.id);
      if (th.pts.length < 2) {
        if (it) it.mesh.visible = it.glitter.visible = false;
        continue;
      }
      if (!it || it.n !== th.pts.length || it.color !== th.color) {
        if (it) this._drop(it);
        const { geo, glitter } = buildThreadGeometry(th.pts, th.id * 7919);
        const mesh = new THREE.Mesh(geo, this.mats[th.color].calm);
        const gl = new THREE.Points(glitter, this.glitterMat);
        mesh.frustumCulled = gl.frustumCulled = false; // геометрия растёт — границы не пересчитываем
        this.group.add(mesh, gl);
        it = { mesh, glitter: gl, n: th.pts.length, color: th.color };
        this.items.set(th.id, it);
      }
      it.mesh.visible = it.glitter.visible = true;
      it.mesh.material = th.id === hotId ? this.mats[th.color].hot : this.mats[th.color].calm;
    }
    for (const [id, it] of this.items)
      if (!live.has(id)) {
        this._drop(it);
        this.items.delete(id);
      }
  }

  _drop(it) {
    it.mesh.removeFromParent();
    it.glitter.removeFromParent();
    it.mesh.geometry.dispose();
    it.glitter.geometry.dispose();
  }

  clear() {
    for (const it of this.items.values()) this._drop(it);
    this.items.clear();
  }
}
