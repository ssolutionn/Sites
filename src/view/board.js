// Отображение доски и миски. Только читает состояние игры, ничего не начисляет.
import * as THREE from 'three';
import { tex, toon } from './textures.js';

export const UNIT = 0.042; // метров на один целевой кубик
const GAP = 0.0025; // визуальный зазор между частями, геометрия при этом точная

const COLORS = {
  carrot: 0xf28c28,
  sausage: null,
  cucumber: 0x8cc84b,
  egg: 0xfff6dc,
  potato: 0xf0d28a,
};

const baseMats = {};
function matFor(ing) {
  if (!baseMats[ing]) {
    baseMats[ing] = ing === 'sausage' ? toon(0xffffff, { map: tex.sausage }) : toon(COLORS[ing] ?? 0xffffff);
  }
  return baseMats[ing];
}

export class BoardView {
  constructor(scene, kitchen) {
    this.scene = scene;
    this.k = kitchen;
    this.center = kitchen.boardCenter.clone();
    this.group = new THREE.Group();
    this.group.position.copy(this.center);
    scene.add(this.group);
    this.meshes = new Map();
    this.currentIng = null;
    this.hover = null; // {x, z} в координатах продукта

    // нож с наклоном лезвия, чтобы была видна его плоскость
    this.knife = new THREE.Group();
    const tilt = new THREE.Group();
    tilt.rotation.z = -0.28;
    this.knife.add(tilt);
    const steel = new THREE.MeshStandardMaterial({ color: 0xe7edf3, metalness: 0.75, roughness: 0.22 });
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.0025, 0.034, 0.12), steel);
    blade.position.set(0, 0.017, 0.0);
    blade.castShadow = true;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.12), new THREE.MeshStandardMaterial({ color: 0xaab4be, metalness: 0.8, roughness: 0.3 }));
    spine.position.set(0, 0.034, 0.0);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.0025, 16, 1, false, 0, Math.PI / 2), steel);
    tip.rotation.set(0, 0, Math.PI / 2);
    tip.position.set(0, 0.017, 0.06);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.075), toon(0x3a2a20));
    handle.position.set(0, 0.026, -0.097);
    for (const z of [-0.08, -0.115]) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.003, 6, 4), toon(0xd8d8d8));
      rivet.position.set(0.0065, 0.026, z);
      tilt.add(rivet);
    }
    tilt.add(blade, spine, tip, handle);
    // рука с ножом и рукав
    const skin = toon(0xf3c29b);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 10), skin);
    hand.scale.set(1.1, 0.9, 1.4);
    hand.position.set(0.003, 0.04, -0.1);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.023, 0.12, 12), toon(0xffffff, { map: tex.sweater }));
    sleeve.rotation.x = Math.PI / 2 - 0.55;
    sleeve.position.set(0.006, 0.075, -0.17);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 14), toon(0xd7262b));
    cuff.position.set(0.004, 0.052, -0.122);
    cuff.rotation.x = 0.5;
    tilt.add(hand, sleeve, cuff);
    this.knife.visible = false;
    this.group.add(this.knife);

    // вторая рука придерживает продукт слева
    this.leftHand = new THREE.Group();
    const lh = new THREE.Mesh(new THREE.SphereGeometry(0.018, 14, 10), skin);
    lh.scale.set(1.0, 0.6, 1.4);
    lh.position.set(0, 0, 0.01);
    for (let i = 0; i < 3; i++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.016, 4, 8), skin);
      finger.rotation.x = Math.PI / 2;
      finger.position.set(0.014, -0.003, -0.008 + i * 0.01);
      this.leftHand.add(finger);
    }
    const lsleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.02, 0.07, 12), sleeve.material);
    lsleeve.position.set(-0.03, 0.022, -0.04);
    lsleeve.rotation.set(Math.PI / 2 - 0.35, 0, 0.75);
    const lcuff = cuff.clone();
    lcuff.position.set(-0.012, 0.01, -0.016);
    lcuff.rotation.set(0.35, 0, 0.75);
    this.leftHand.add(lh, lsleeve, lcuff);
    this.leftHand.visible = false;
    this.group.add(this.leftHand);

    // рамка выбранного кусочка
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x1f9a3e, depthTest: false, transparent: true }),
    );
    this.outline.renderOrder = 5;
    this.outline.visible = false;
    this.group.add(this.outline);

    // линия, куда опустится нож (только на выбранной части)
    this.cutLine = new THREE.Mesh(new THREE.PlaneGeometry(0.0025, 1), new THREE.MeshBasicMaterial({ color: 0x1b5e20, transparent: true, opacity: 0.55, depthWrite: false }));
    this.cutLine.rotation.x = -Math.PI / 2;
    this.cutLine.visible = false;
    this.group.add(this.cutLine);

    // образец целевого размера
    this.sample = new THREE.Group();
    const sampleCube = new THREE.Mesh(new THREE.BoxGeometry(UNIT, UNIT, UNIT), toon(0xfff3c4, { transparent: true, opacity: 0.9 }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(sampleCube.geometry), new THREE.LineBasicMaterial({ color: 0x2e7d32 }));
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.006, 20), toon(0x2fbf5a));
    dish.position.y = -UNIT / 2 - 0.003;
    this.sample.add(sampleCube, edges, dish);
    this.sample.position.set(0.2, UNIT / 2 + 0.006, -0.03);
    this.group.add(this.sample);

    // миска: кусочки, горошек, майонез
    this.bowl = kitchen.bowl;
    this.bowlMeshes = [];
    this.flying = [];
    this.peasGroup = new THREE.Group();
    const peaGeo = new THREE.SphereGeometry(0.009, 8, 6);
    const peaMat = toon(0x6dbb3a);
    for (let i = 0; i < 46; i++) {
      const p = new THREE.Mesh(peaGeo, peaMat);
      const a = i * 2.39996;
      const r = 0.02 + Math.sqrt(i / 46) * 0.13;
      p.position.set(Math.cos(a) * r, 0.05 + (i % 4) * 0.012, Math.sin(a) * r);
      this.peasGroup.add(p);
    }
    this.peasGroup.visible = false;
    this.bowl.content.add(this.peasGroup);
    this.mayoGroup = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), toon(0xfffbea));
      m.scale.set(1, 0.4, 1);
      m.position.set(Math.cos(i * 1.3) * 0.06, 0.09, Math.sin(i * 1.3) * 0.06);
      this.mayoGroup.add(m);
    }
    this.mayoGroup.visible = false;
    this.bowl.content.add(this.mayoGroup);
  }

  reset() {
    for (const m of this.meshes.values()) this._disposeMesh(m);
    this.meshes.clear();
    for (const m of this.bowlMeshes) this._disposeMesh(m);
    this.bowlMeshes = [];
    this.flying = [];
    this.peasGroup.visible = false;
    this.mayoGroup.visible = false;
    this.bowl.content.rotation.set(0, 0, 0);
    this.bowl.spoon.visible = false;
    this.currentIng = null;
    this.hover = null;
  }

  _disposeMesh(m) {
    m.parent?.remove(m);
    m.geometry.dispose();
    if (m.material && !Object.values(baseMats).includes(m.material)) m.material.dispose();
  }

  // Точка мира -> координаты продукта
  worldToBoard(p) {
    return { x: (p.x - this.center.x) / UNIT, z: (p.z - this.center.z) / UNIT };
  }

  _pieceMesh(piece, ing) {
    const g = new THREE.BoxGeometry(Math.max(piece.w * UNIT - GAP, 0.001), UNIT, Math.max(piece.d * UNIT - GAP, 0.001));
    const mat = matFor(ing).clone();
    mat.emissive = new THREE.Color(0x000000);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    m.userData = { w: piece.w, d: piece.d, ing };
    return m;
  }

  sync(game, dt, closeup) {
    const ing = game ? game.board : null;
    const id = ing?.id ?? null;
    if (id !== this.currentIng) {
      for (const m of this.meshes.values()) this._disposeMesh(m);
      this.meshes.clear();
      this.currentIng = id;
    }
    const alive = new Set();
    if (ing) {
      for (const p of ing.pieces) {
        alive.add(p.id);
        let m = this.meshes.get(p.id);
        if (m && (Math.abs(m.userData.w - p.w) > 1e-9 || Math.abs(m.userData.d - p.d) > 1e-9)) {
          this._disposeMesh(m);
          m = null;
        }
        if (!m) {
          m = this._pieceMesh(p, ing.id);
          this.group.add(m);
          this.meshes.set(p.id, m);
        }
        const selected = p.id === ing.selectedId;
        const hovered = closeup && this.hover && this.hover.pieceId === p.id && !selected;
        m.position.set((p.x + p.w / 2) * UNIT, UNIT / 2 + (selected ? 0.003 : 0), (p.z + p.d / 2) * UNIT);
        m.material.emissive.setHex(selected ? 0x3a5a00 : hovered ? 0x2a2a10 : 0x000000);
      }
    }
    for (const [pid, m] of this.meshes) {
      if (!alive.has(pid)) {
        this._disposeMesh(m);
        this.meshes.delete(pid);
      }
    }

    // нож, руки и линия разреза — только в крупном плане
    const showTools = closeup && !!ing;
    this.knife.visible = showTools;
    this.leftHand.visible = showTools && ing.pieces.length > 0;
    this.sample.visible = !!game && game.phase !== 'prestart';
    this.cutLine.visible = false;
    if (showTools) {
      const act = game.action?.type === 'cut' ? game.action : null;
      let kx = this.hover ? this.hover.x : 0;
      const up = UNIT + 0.012;
      let lift = up;
      if (act) {
        kx = act.data.x;
        const p = Math.min(1, act.elapsed / act.duration);
        lift = up * (1 - Math.sin(p * Math.PI));
      }
      kx = THREE.MathUtils.clamp(kx, -6.8, 6.8);
      this.knife.position.set(kx * UNIT, lift, 0);
      const sel = ing.pieces.find((p) => p.id === ing.selectedId);
      // левая рука придерживает продукт у левого края
      if (ing.pieces.length) {
        let minX = Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const q of ing.pieces) {
          minX = Math.min(minX, q.x);
          minZ = Math.min(minZ, q.z);
          maxZ = Math.max(maxZ, q.z + q.d);
        }
        this.leftHand.position.set(minX * UNIT - 0.018, UNIT * 0.4, ((minZ + maxZ) / 2) * UNIT);
      }
      this.outline.visible = !!sel;
      if (sel) {
        this.outline.scale.set(sel.w * UNIT, UNIT, sel.d * UNIT);
        this.outline.position.set((sel.x + sel.w / 2) * UNIT, UNIT / 2 + 0.003, (sel.z + sel.d / 2) * UNIT);
        if (!act && this.hover && this.hover.pieceId === sel.id) {
          this.cutLine.visible = true;
          this.cutLine.scale.y = sel.d * UNIT;
          this.cutLine.position.set(this.hover.x * UNIT, UNIT + 0.0035, (sel.z + sel.d / 2) * UNIT);
        }
      }
    } else {
      this.outline.visible = false;
    }

    this._syncBowl(game, dt);
  }

  _syncBowl(game, dt) {
    const bowl = game?.bowl;
    const pieces = bowl ? bowl.pieces : [];
    // новые кусочки летят с доски в миску
    while (this.bowlMeshes.length < pieces.length && this.bowlMeshes.length < 400) {
      const i = this.bowlMeshes.length;
      const p = pieces[i];
      const m = this._pieceMesh(p, p.ing);
      const a = i * 2.39996;
      const r = 0.015 + Math.sqrt((i % 60) / 60) * 0.12;
      const target = new THREE.Vector3(Math.cos(a) * r, 0.03 + Math.floor(i / 60) * 0.025 + (i % 3) * 0.008, Math.sin(a) * r);
      m.rotation.set((i % 5) * 0.4, (i % 7) * 0.9, (i % 3) * 0.5);
      this.bowl.content.add(m);
      this.bowlMeshes.push(m);
      // старт: позиция на доске в координатах миски
      const startWorld = this.center.clone().add(new THREE.Vector3((p.x + p.w / 2) * UNIT, UNIT, (p.z + p.d / 2) * UNIT));
      const start = this.bowl.content.worldToLocal(startWorld.clone());
      m.position.copy(start);
      this.flying.push({ m, start, target, t: -(i % 12) * 0.03 });
    }
    if (this.bowlMeshes.length > pieces.length) {
      for (const m of this.bowlMeshes.splice(pieces.length)) this._disposeMesh(m);
    }
    for (const f of this.flying) {
      f.t += dt;
      const k = THREE.MathUtils.clamp(f.t / 0.5, 0, 1);
      const e = k * k * (3 - 2 * k);
      f.m.position.lerpVectors(f.start, f.target, e);
      f.m.position.y += Math.sin(k * Math.PI) * 0.12;
    }
    this.flying = this.flying.filter((f) => f.t < 0.5);
    this.peasGroup.visible = !!game?.added.peas;
    this.mayoGroup.visible = !!game?.added.mayo;
    // перемешивание
    const mixing = !!game?.holds.mix;
    this.bowl.spoon.visible = mixing || (game?.bowl.mixProgress > 0 && !game?.bowl.mixed && game?.panel === 'bowl');
    if (mixing) {
      this.bowl.content.rotation.y += dt * 4;
      this.bowl.spoon.rotation.y += dt * 7;
      this.bowl.spoon.position.set(Math.cos(this.bowl.spoon.rotation.y) * 0.07, 0.03, -Math.sin(this.bowl.spoon.rotation.y) * 0.07);
    }
  }
}
