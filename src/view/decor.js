// Декор кухни, купленный за баллы в «Банке» (DECOR в data.js). Видимость — по session.decor.
// Модели процедурные и лёгкие; при появлении GLB художника заменяются по asset-contract.
import * as THREE from 'three';
import { LAYOUT } from '../game/layout.js';
import { CLAYOUT } from '../campaign/layout.js';

const mat = (color, rough = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

function wreath() {
  const g = new THREE.Group();
  const pine = mat(0x1f6b3a, 0.8);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 10, 36), pine);
  g.add(ring);
  // хвоинки — короткие конусы по кругу
  const needle = new THREE.ConeGeometry(0.022, 0.07, 5);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    const m = new THREE.Mesh(needle, i % 3 ? pine : mat(0x2c8a4a, 0.8));
    m.position.set(Math.cos(a) * (0.16 + ((i % 2) - 0.5) * 0.03), Math.sin(a) * (0.16 + ((i % 2) - 0.5) * 0.03), 0.02);
    m.rotation.z = a + Math.PI / 2 + (i % 2 ? 0.5 : -0.5);
    g.add(m);
  }
  const berry = mat(0xd23c3c, 0.35);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 8), berry);
    b.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.05);
    g.add(b);
  }
  // бант снизу
  const bow = mat(0xc62f35, 0.5);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 16), bow);
    loop.scale.set(1.3, 0.8, 0.5);
    loop.position.set(s * 0.04, -0.17, 0.06);
    g.add(loop);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.006), bow);
    tail.position.set(s * 0.025, -0.23, 0.06);
    tail.rotation.z = s * 0.25;
    g.add(tail);
  }
  return g;
}

function snowman() {
  const g = new THREE.Group();
  const white = mat(0xfafcff, 0.45);
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), white);
  b1.scale.z = 0.35;
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.036, 18, 12), white);
  b2.scale.z = 0.35;
  b2.position.y = 0.075;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 8), mat(0xf28c28, 0.5));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.075, 0.02);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 18), mat(0xd23c3c, 0.7));
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.045;
  scarf.scale.z = 0.5;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.035, 14), mat(0x2b221c, 0.6));
  hat.position.y = 0.118;
  hat.scale.z = 0.5;
  const eyeM = mat(0x1a1410, 0.4);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), eyeM);
    e.position.set(s * 0.012, 0.085, 0.013);
    g.add(e);
  }
  g.add(b1, b2, nose, scarf, hat);
  return g;
}

function ballLights(length = 2.6) {
  const g = new THREE.Group();
  const wire = mat(0x2b4a2f, 0.7);
  const n = 16;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    pts.push(new THREE.Vector3((t - 0.5) * length, -(Math.sin(t * Math.PI * 4) ** 2) * 0.08 - Math.sin(t * Math.PI) * 0.05, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.004, 5, false), wire));
  const colors = [0xffc36b, 0xff7b6b, 0xfff1c9, 0x9fe3b4];
  g.userData.bulbs = [];
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt((i + 0.5) / n);
    const c = colors[i % colors.length];
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), mat(c, 0.3, { emissive: c, emissiveIntensity: 0.9, transparent: true, opacity: 0.92 }));
    b.position.copy(p).add(new THREE.Vector3(0, -0.045, 0));
    g.add(b);
    g.userData.bulbs.push(b);
  }
  return g;
}

function checkCloth(w, d) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#fbf3e6';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(200,40,50,0.55)';
  for (let i = 0; i < 8; i += 2) {
    x.fillRect(i * 32, 0, 32, 256);
    x.fillRect(0, i * 32, 256, 32);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.006, d + 0.1), mat(0xffffff, 0.85, { map: t }));
  top.receiveShadow = true;
  g.add(top);
  // свисающие края
  for (const [sx, sz, rw, rd] of [[0, 1, w + 0.1, 0.005], [0, -1, w + 0.1, 0.005], [1, 0, 0.005, d + 0.1], [-1, 0, 0.005, d + 0.1]]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.18, rd), mat(0xffffff, 0.85, { map: t }));
    edge.position.set(sx * (w / 2 + 0.05), -0.09, sz * (d / 2 + 0.05));
    g.add(edge);
  }
  return g;
}

function starCandles() {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.03 : 0.065;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
  starGeo.rotateX(-Math.PI / 2);
  g.userData.flames = [];
  for (const [x, s] of [[-0.18, 1], [0, 1.2], [0.18, 1]]) {
    const holder = new THREE.Mesh(starGeo, mat(0xe6b548, 0.3, { metalness: 0.6 }));
    holder.position.set(x, 0, 0);
    holder.scale.setScalar(s);
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06 * s, 12), mat(0xfff6e6, 0.5));
    candle.position.set(x, 0.03 * s + 0.02, 0);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.024, 10), new THREE.MeshBasicMaterial({ color: 0xffc24a }));
    flame.position.set(x, 0.06 * s + 0.034, 0);
    g.add(holder, candle, flame);
    g.userData.flames.push(flame);
  }
  const glow = new THREE.PointLight(0xffb36b, 0.6, 1.4, 2);
  glow.position.set(0, 0.15, 0.05);
  g.add(glow);
  return g;
}

export class DecorView {
  constructor(parent) {
    this.root = new THREE.Group();
    parent.add(this.root);
    const T = CLAYOUT.table;
    this.items = {
      wreath: wreath(),
      snowman: snowman(),
      lights: ballLights(2.6),
      cloth: checkCloth(T.w, T.d),
      candles: starCandles(),
    };
    // венок — на окне, снеговик — на дверце холодильника, гирлянда — над задней столешницей
    this.items.wreath.position.set(-1.25, 1.66, -2.52);
    this.items.snowman.position.set(3.05 - 0.2, 1.25, -2.15 + 0.39);
    this.items.snowman.scale.setScalar(1.7);
    this.items.lights.position.set(1.1, 1.95, LAYOUT.backCounter.z - 0.25);
    this.items.cloth.position.set(T.x, T.h + 0.004, T.z);
    this.items.candles.position.set(-1.25, 1.115, -2.5);
    for (const it of Object.values(this.items)) {
      it.visible = false;
      it.traverse((o) => o.isMesh && (o.castShadow = true));
      this.root.add(it);
    }
    this.key = '';
  }

  sync(decor, t) {
    const key = (decor ?? []).join();
    if (key !== this.key) {
      this.key = key;
      for (const [id, it] of Object.entries(this.items)) it.visible = decor.includes(id);
    }
    if (this.items.lights.visible) this.items.lights.userData.bulbs.forEach((b, i) => (b.material.emissiveIntensity = 0.6 + 0.5 * Math.max(0, Math.sin(t * 2 + i * 1.3))));
    if (this.items.candles.visible) this.items.candles.userData.flames.forEach((f, i) => (f.scale.y = 1 + Math.sin(t * 13 + i * 2) * 0.15));
  }
}
