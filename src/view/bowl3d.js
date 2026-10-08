// Миска кампании: содержимое кучками, которые при перемешивании расходятся и покрываются заправкой;
// в руке — ложка, банка горошка, пачка майонеза или солонка. Только читает состояние сессии.
import * as THREE from 'three';
import { PRODUCTS } from '../campaign/data.js';
import { CAMPAIGN } from '../campaign/data.js';

const MAXP = 360; // кусочков в миске
const MAXD = 160; // капель и частиц

// Цвет мякоти кубиков в миске (то, что видно после нарезки), sRGB.
const FLESH = {
  carrot: 0xf39a3a,
  potato: 0xf4dfa2,
  egg: 0xfbf7ee,
  cucumber: 0xb9cf7a,
  sausage: 0xf2a9a6,
  crab: 0xf6f1ea,
  cheese: 0xf7d55b,
  onion: 0xf2efe0,
  herring: 0xd9b8a8,
  beet: 0x8e1b4a,
};
const CREAM = new THREE.Color(0xfff6dc);

// Детерминированный «случай» для раскладки — картинка не прыгает между кадрами.
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
// Внутренний радиус миски на высоте y (профиль из kitchen.js: 0.06 + sin(t·π/2)·0.15, t = y/0.14).
const innerR = (y) => 0.06 + Math.sin(Math.min(1, Math.max(0, y / 0.14)) * Math.PI * 0.5) * 0.15 - 0.016;

function mat(color, rough = 0.6) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
}

function peasCan() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.075, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9d1d6, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0345, 0.0345, 0.05, 24, 1, true), mat(0x3f8f3a, 0.5));
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), mat(0x8fd45a, 0.5));
  dot.position.set(0, 0, 0.032);
  dot.scale.set(1, 1, 0.3);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.034, 24), new THREE.MeshStandardMaterial({ color: 0xb0b8bd, metalness: 0.6, roughness: 0.4 }));
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = -0.0375;
  const inside = new THREE.Mesh(new THREE.CircleGeometry(0.031, 24), mat(0x6dbb3a, 0.5));
  inside.rotation.x = -Math.PI / 2;
  inside.position.y = 0.03;
  g.add(body, label, dot, bottom, inside);
  return g;
}

function mayoPack() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.07, 6, 16), mat(0xfbfaf4, 0.35));
  body.scale.set(1, 1, 0.55);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0262, 0.0262, 0.03, 20, 1, true), mat(0x2f6fb7, 0.45));
  band.scale.set(1, 1, 0.55);
  band.position.y = 0.005;
  const sun = new THREE.Mesh(new THREE.CircleGeometry(0.009, 16), mat(0xf6c33b, 0.5));
  sun.position.set(0, 0.03, 0.0148);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.022, 14), mat(0x2f6fb7, 0.4));
  cap.rotation.x = Math.PI;
  cap.position.y = -0.07;
  g.add(body, band, sun, cap);
  return g;
}

function shaker(kind) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 0.055, 18), new THREE.MeshStandardMaterial({ color: kind === 'salt' ? 0xf4f6f7 : 0x3a2c25, roughness: kind === 'salt' ? 0.15 : 0.5, transparent: kind === 'salt', opacity: 0.85 }));
  const capM = new THREE.MeshStandardMaterial({ color: 0xc9cfd4, metalness: 0.7, roughness: 0.3 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capM);
  cap.position.y = 0.027;
  cap.scale.y = 0.6;
  g.add(glass, cap);
  // отверстия смотрят вниз, когда солонку переворачивают
  g.userData.capDown = true;
  return g;
}

export class BowlView {
  constructor(k) {
    this.k = k;
    this.root = new THREE.Group();
    k.bowl.content.add(this.root);
    const cube = new THREE.BoxGeometry(1, 1, 1);
    cube.translate(0, 0.5, 0);
    this.pieces = new THREE.InstancedMesh(cube, new THREE.MeshStandardMaterial({ roughness: 0.55 }), MAXP);
    this.pieces.count = 0;
    this.pieces.castShadow = true;
    this.pieces.frustumCulled = false;
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 9), new THREE.MeshStandardMaterial({ roughness: 0.45 }), MAXP);
    this.balls.count = 0;
    this.balls.frustumCulled = false;
    this.mayo = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff7e2, roughness: 0.28 }), 260);
    this.mayo.count = 0;
    this.mayo.frustumCulled = false;
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.5 }), MAXD);
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    this.root.add(this.pieces, this.balls, this.mayo, this.drops);
    this.key = null;
    this.items = []; // { kind: 'cube'|'ball', start, mixed, size, color }
    this.mayoPts = [];
    this.particles = [];
    this.lastPinch = { salt: 0, pepper: 0 };
    // в руке
    this.tools = { peas: peasCan(), corn: peasCan(), mayo: mayoPack(), salt: shaker('salt'), pepper: shaker('pepper') };
    this.tools.corn.children[1].material = mat(0xe8b923, 0.5);
    this.toolRoot = new THREE.Group();
    for (const t of Object.values(this.tools)) {
      t.visible = false;
      t.traverse((o) => o.isMesh && (o.castShadow = true));
      this.toolRoot.add(t);
    }
    k.bowl.group.add(this.toolRoot);
    this.toolPos = new THREE.Vector3(0.12, 0.2, 0.08);
  }

  reset() {
    this.key = null;
    this.items = [];
    this.mayoPts = [];
    this.particles = [];
    this.pieces.count = this.balls.count = this.mayo.count = this.drops.count = 0;
  }

  // Раскладка: каждая добавка — своя кучка (сектор), после перемешивания — равномерно по миске.
  _build(s) {
    this.items = [];
    this.mayoPts = [];
    let seed = 1;
    s.bowl.contents.forEach((c, ci) => {
      const ang = ci * 2.4 + 0.6;
      const cx = Math.cos(ang) * 0.06, cz = Math.sin(ang) * 0.06;
      const layer = ci * 0.006;
      const push = (kind, size, color, near = null) => {
        const n = seed++;
        const a = hash(n) * Math.PI * 2, r = Math.sqrt(hash(n + 0.5)) * 0.05;
        const px = (near ? near.x : cx) + Math.cos(a) * r * (near ? 0.5 : 1);
        const pz = (near ? near.z : cz) + Math.sin(a) * r * (near ? 0.5 : 1);
        const y0 = 0.012 + layer + hash(n + 0.3) * 0.016;
        const ma = hash(n + 0.7) * Math.PI * 2, my = 0.016 + hash(n + 0.9) * 0.04;
        const mr = Math.sqrt(hash(n + 0.2)) * innerR(my);
        const lim = innerR(y0);
        const l = Math.hypot(px, pz);
        const k = l > lim ? lim / l : 1;
        this.items.push({ kind, size, color: new THREE.Color(color), start: new THREE.Vector3(px * k, y0, pz * k), mixed: new THREE.Vector3(Math.cos(ma) * mr, my, Math.sin(ma) * mr), rot: new THREE.Euler(hash(n + 1) * 3, hash(n + 2) * 3, hash(n + 3) * 3) });
      };
      if (c.kind === 'pieces') {
        const list = (c.pieces ?? []).slice(0, 48);
        for (const p of list) {
          const sz = THREE.MathUtils.clamp(Math.cbrt((p.w ?? 1) * (p.d ?? 1)) * 0.016, 0.01, 0.022);
          let col = FLESH[c.product] ?? PRODUCTS[c.product]?.color ?? 0xffffff;
          if (c.product === 'egg' && hash(seed + 0.4) < 0.33) col = 0xffc83a; // кубики с желтком
          if (c.product === 'cucumber' && hash(seed + 0.6) < 0.4) col = 0x6f8f35; // с кожурой
          push('cube', sz, col);
        }
      } else if (c.kind === 'grated') {
        for (let i = 0; i < 40; i++) push('cube', 0.006, FLESH[c.product] ?? PRODUCTS[c.product]?.color ?? 0xffffff);
      } else if (c.product === 'peas' || c.product === 'corn') {
        const pts = c.path?.length ? c.path : null;
        for (let i = 0; i < 56; i++) push('ball', 0.0085, c.product === 'peas' ? 0x6dbb3a : 0xf4c430, pts ? pts[i % pts.length] : null);
      } else if (c.product === 'mayo') {
        const pts = c.path?.length ? c.path : Array.from({ length: 18 }, (_, i) => ({ x: Math.cos(i * 0.9) * 0.05 * (1 + (i % 3) * 0.3), z: Math.sin(i * 0.9) * 0.05 * (1 + (i % 3) * 0.3) }));
        for (const p of pts) this.mayoPts.push({ x: p.x, z: p.z, y: 0.045 + layer, s: 0.011 + hash(seed++) * 0.006 });
      } else if (c.kind === 'yolk') {
        push('ball', 0.016, 0xffc83a);
      } else if (c.product === 'greens') {
        for (let i = 0; i < 24; i++) push('cube', 0.005, 0x3f9b3a);
      }
    });
  }

  /** Кадр миски. active — крупный план миски; pointer — {x, z} в метрах над миской. */
  sync(s, dt, active, pointer, t) {
    const key = s.bowl.owner + ':' + s.bowl.contents.map((c) => c.product + c.kind + (c.pieces?.length ?? '') + (c.path?.length ?? '')).join(',');
    if (key !== this.key) {
      this.key = key;
      this._build(s);
    }
    const st = s.bowl.stirrer;
    const mixed = st ? Math.min(1, st.turns / CAMPAIGN.mix.turnsRequired) : 0;
    const e = mixed * mixed * (3 - 2 * mixed);
    // содержимое медленно идёт за ложкой
    this.root.rotation.y = -(st?.angle ?? 0) * 0.25;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const hasMayo = this.mayoPts.length > 0;
    let nc = 0, nb = 0;
    for (const it of this.items) {
      p.lerpVectors(it.start, it.mixed, e);
      // во время перемешивания кусочки «перекатываются»
      const wob = st && s.pointerDown ? Math.sin(t * 9 + it.start.x * 90) * 0.002 : 0;
      p.y += wob;
      q.setFromEuler(it.rot);
      col.copy(it.color);
      if (hasMayo) col.lerp(CREAM, e * 0.32); // заправка обволакивает
      if (it.kind === 'cube') {
        sc.setScalar(it.size);
        mtx.compose(p, q, sc);
        this.pieces.setMatrixAt(nc, mtx);
        this.pieces.setColorAt(nc, col);
        nc++;
      } else {
        sc.setScalar(it.size);
        mtx.compose(p, q, sc);
        this.balls.setMatrixAt(nb, mtx);
        this.balls.setColorAt(nb, col);
        nb++;
      }
      if (nc >= MAXP || nb >= MAXP) break;
    }
    this.pieces.count = nc;
    this.balls.count = nb;
    this.pieces.instanceMatrix.needsUpdate = this.balls.instanceMatrix.needsUpdate = true;
    if (this.pieces.instanceColor) this.pieces.instanceColor.needsUpdate = true;
    if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
    this.pieces.material.roughness = 0.55 - e * 0.25 * (hasMayo ? 1 : 0);

    // майонез: зигзаг там, где выдавливали; при перемешивании расходится по салату
    const live = s.bowl.pouring?.product === 'mayo' ? s.bowl.pouring.path : [];
    const mpts = [...this.mayoPts, ...live.map((v, i) => ({ x: v.x, z: v.z, y: 0.05, s: 0.012 + hash(i) * 0.005 }))];
    let nm = 0;
    for (const m of mpts.slice(0, 260)) {
      p.set(m.x * (1 - e * 0.3), m.y - e * 0.012, m.z * (1 - e * 0.3));
      const l = Math.hypot(p.x, p.z), lim = innerR(p.y);
      if (l > lim) p.multiplyScalar(lim / l);
      sc.set(m.s * (1 - e * 0.85), m.s * 0.55 * (1 - e * 0.85), m.s * (1 - e * 0.85));
      q.identity();
      mtx.compose(p, q, sc);
      this.mayo.setMatrixAt(nm++, mtx);
    }
    this.mayo.count = nm;
    this.mayo.instanceMatrix.needsUpdate = true;

    this._syncTools(s, dt, active, pointer, t);
    this._updateParticles(dt);
  }

  _syncTools(s, dt, active, pointer, t) {
    const hand = s.bowlHand?.() ?? 'spoon';
    // банка и пачка у миски: в руке или уже израсходованы — на столе их нет
    const used = (product) => Object.values(s.dishes).some((d) => d.recipe.steps.some((st) => st.type === 'add' && st.product === product && d.steps[st.id]?.done));
    if (this.k.bowl.peas) this.k.bowl.peas.visible = hand !== 'peas' && !used('peas');
    if (this.k.bowl.mayo) this.k.bowl.mayo.visible = hand !== 'mayo' && !used('mayo');
    for (const [id, tool] of Object.entries(this.tools)) tool.visible = active && hand === id;
    if (!active || hand === 'spoon') return;
    const tool = this.tools[hand];
    const tgt = pointer ? new THREE.Vector3(pointer.x, 0.17, pointer.z) : new THREE.Vector3(0.14, 0.2, 0.1);
    this.toolPos.lerp(tgt, 1 - Math.exp(-dt * 18));
    tool.position.copy(this.toolPos);
    const down = s.pointerDown;
    if (hand === 'peas' || hand === 'corn') {
      // банку наклоняют над миской
      tool.rotation.set(0, 0, down ? -1.9 : -0.25);
      if (down && s.bowl.pouring && Math.random() < dt * 40) this._spawn(this.toolPos.x - 0.03, this.toolPos.y - 0.01, this.toolPos.z, hand === 'peas' ? 0x6dbb3a : 0xf4c430, 0.007);
    } else if (hand === 'mayo') {
      // пачку переворачивают носиком вниз и сжимают
      tool.rotation.set(0, 0, down ? 0.25 : 0.9);
      const squeeze = down ? 0.82 + Math.sin(t * 20) * 0.03 : 1;
      tool.scale.set(squeeze, 1, 1);
      tool.position.y = this.toolPos.y + 0.03;
    } else {
      // солонка: дном вверх, трясётся вслед за мышью
      tool.rotation.set(Math.PI, 0, 0.2);
      tool.position.y = this.toolPos.y + 0.02;
      const n = s.bowl.shaker ? s.dishes[s.bowl.shaker.dishId]?.season?.[hand] ?? 0 : 0;
      if (n > this.lastPinch[hand]) for (let i = 0; i < 10; i++) this._spawn(this.toolPos.x + (Math.random() - 0.5) * 0.02, this.toolPos.y - 0.04, this.toolPos.z + (Math.random() - 0.5) * 0.02, hand === 'salt' ? 0xffffff : 0x2a1e18, 0.0022);
      this.lastPinch[hand] = n;
    }
  }

  _spawn(x, y, z, color, size) {
    if (this.particles.length >= MAXD) this.particles.shift();
    this.particles.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3((Math.random() - 0.5) * 0.08, -0.05, (Math.random() - 0.5) * 0.08), c: new THREE.Color(color), s: size, life: 1.2 });
  }

  _updateParticles(dt) {
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let n = 0;
    for (const d of this.particles) {
      d.life -= dt;
      d.v.y -= 1.4 * dt;
      d.p.addScaledVector(d.v, dt);
      const floor = 0.035;
      if (d.p.y < floor) {
        d.p.y = floor;
        d.v.set(0, 0, 0);
      }
      sc.setScalar(d.s * Math.min(1, d.life * 3));
      mtx.compose(d.p, q, sc);
      this.drops.setMatrixAt(n, mtx);
      this.drops.setColorAt(n, d.c);
      n++;
    }
    this.particles = this.particles.filter((d) => d.life > 0);
    this.drops.count = n;
    this.drops.instanceMatrix.needsUpdate = true;
    if (this.drops.instanceColor) this.drops.instanceColor.needsUpdate = true;
  }
}
