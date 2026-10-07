// Еда, посуда и инструменты кампании. Одинаковые принципы: мягкие скругления,
// матовые материалы, узнаваемый силуэт каждого блюда (шуба не похожа на оливье и т. д.).
import * as THREE from 'three';
import { material } from './model-utils.js';
import { PRODUCTS } from '../campaign/data.js';

const mats = new Map();
export function m(color, rough = 0.62, metal = 0) {
  const key = `${color}:${rough}:${metal}`;
  if (!mats.has(key)) mats.set(key, material(color, rough, metal));
  return mats.get(key);
}

export const COL = {
  bread: 0xe8c58f,
  crust: 0xa8692f,
  butter: 0xfff0a0,
  caviar: 0xe8461f,
  eggWhite: 0xfffaf0,
  yolk: 0xffc83a,
  filling: 0xfff0b8,
  tart: 0xd9a35a,
  tomato: 0xe23b2e,
  pulp: 0xf57d4f,
  green: 0x3f9b3a,
  plate: 0xfdfbf6,
  rim: 0xd7262b,
  herring: 0xc9b6a6,
  onion: 0xf3ecd6,
  potato: 0xf0d28a,
  carrot: 0xf28c28,
  beet: 0x8e1b4a,
  mayo: 0xfffbea,
  cheese: 0xf7d55b,
  sausage: 0xe7909a,
  cucumber: 0x8cc84b,
  mandarin: 0xff8c1a,
  mandarinIn: 0xffb347,
  apple: 0xf4ecc0,
  appleSkin: 0xc8402e,
  grape: 0x6b2d8c,
  chickenRaw: 0xf6d7b0,
  chickenGold: 0xd98b2b,
  chickenDark: 0x7a3d12,
  metal: 0x5a5f68,
};

export function rbox(w, h, d, r = 0.004) {
  const shape = new THREE.Shape();
  const x = w / 2, z = d / 2, rr = Math.min(r, x * 0.9, z * 0.9);
  shape.moveTo(-x + rr, -z);
  shape.lineTo(x - rr, -z);
  shape.quadraticCurveTo(x, -z, x, -z + rr);
  shape.lineTo(x, z - rr);
  shape.quadraticCurveTo(x, z, x - rr, z);
  shape.lineTo(-x + rr, z);
  shape.quadraticCurveTo(-x, z, -x, z - rr);
  shape.lineTo(-x, -z + rr);
  shape.quadraticCurveTo(-x, -z, -x + rr, -z);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelSize: Math.min(0.002, h / 4), bevelThickness: Math.min(0.002, h / 4), bevelSegments: 2, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 0);
  return g;
}

function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}

// ---------- маска покрытия как текстура ----------
export class MaskTexture {
  constructor(mask, color, { soft = true, invert = false, alphaMax = 1 } = {}) {
    this.mask = mask;
    this.invert = invert;
    this.alphaMax = alphaMax;
    const s = 6;
    this.canvas = document.createElement('canvas');
    this.canvas.width = mask.cols * s;
    this.canvas.height = mask.rows * s;
    this.s = s;
    this.ctx = this.canvas.getContext('2d');
    this.color = new THREE.Color(color);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = this.texture.magFilter = soft ? THREE.LinearFilter : THREE.NearestFilter;
    this.version = -1;
    this.update();
  }
  update() {
    if (this.version === this.mask.version) return;
    this.version = this.mask.version;
    const { ctx, s, mask } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const c = this.color;
    const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
    for (let r = 0; r < mask.rows; r++)
      for (let k = 0; k < mask.cols; k++) {
        const i = r * mask.cols + k;
        if (!mask.valid[i]) continue;
        let a = Math.min(1, mask.level[i]);
        if (this.invert) a = 1 - a;
        if (a <= 0.01) continue;
        ctx.fillStyle = `rgba(${rgb},${(a * this.alphaMax).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc((k + 0.5) * s, (r + 0.5) * s, s * 0.85, 0, Math.PI * 2);
        ctx.fill();
      }
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
  }
}

// Плоскость с маской поверх поверхности (ширина/глубина в метрах).
export function maskPlane(maskTex, w, d, y, ellipse = false) {
  const geo = ellipse ? new THREE.CircleGeometry(0.5, 40) : new THREE.PlaneGeometry(1, 1);
  if (ellipse) {
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) + 0.5, 0.5 - pos.getY(i));
  } else {
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  }
  const mat = new THREE.MeshStandardMaterial({ map: maskTex.texture, transparent: true, roughness: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const o = new THREE.Mesh(geo, mat);
  o.rotation.x = -Math.PI / 2;
  o.scale.set(w, d, 1);
  o.position.y = y;
  o.receiveShadow = true;
  return o;
}

// ---------- базовые продукты ----------
export function breadSlice() {
  const g = new THREE.Group();
  add(g, rbox(0.1, 0.012, 0.078, 0.012), m(COL.crust, 0.8));
  add(g, rbox(0.092, 0.002, 0.07, 0.01), m(COL.bread, 0.9), 0, 0.0115, 0);
  return g;
}

// Икра: инстансы мелких шариков (пул на весь поднос).
export function caviarInstances(max = 600) {
  const geo = new THREE.SphereGeometry(0.0034, 8, 6);
  const mat = new THREE.MeshStandardMaterial({ color: COL.caviar, roughness: 0.15, metalness: 0.05, emissive: 0x3a0800 });
  const inst = new THREE.InstancedMesh(geo, mat, max);
  inst.count = 0;
  inst.castShadow = true;
  inst.frustumCulled = false; // число и положение шариков меняются; сфера по пустому набору отсекала бы икру
  return inst;
}

export function eggWhole() {
  const g = new THREE.Group();
  const o = add(g, new THREE.SphereGeometry(1, 24, 16), m(COL.eggWhite, 0.4));
  o.scale.set(0.026, 0.023, 0.04);
  o.position.y = 0.023;
  return g;
}

export function eggHalf() {
  const g = new THREE.Group();
  const shell = add(g, new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m(COL.eggWhite, 0.4));
  shell.scale.set(0.026, 0.022, 0.04);
  shell.position.y = 0.022;
  const top = add(g, new THREE.CircleGeometry(1, 28), m(COL.eggWhite, 0.45), 0, 0.0221, 0);
  top.rotation.x = -Math.PI / 2;
  top.scale.set(0.025, 0.039, 1);
  const yolk = add(g, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(COL.yolk, 0.55), 0, 0.021, 0);
  yolk.scale.set(0.014, 0.008, 0.019);
  const fill = add(g, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(COL.filling, 0.8), 0, 0.022, 0);
  fill.scale.set(0.017, 0.012, 0.024);
  g.userData = { yolk, fill };
  return g;
}

export function tartlet() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.018 + t * 0.016 + Math.sin(t * Math.PI) * 0.002, 0.003 + t * 0.022));
  }
  const cup = add(g, new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: COL.tart, roughness: 0.75, side: THREE.DoubleSide }));
  const base = add(g, new THREE.CircleGeometry(0.018, 20), m(0xc48a44, 0.8), 0, 0.004, 0);
  base.rotation.x = -Math.PI / 2;
  const rim = add(g, new THREE.TorusGeometry(0.034, 0.0032, 6, 24), m(0xc98e46, 0.7), 0, 0.025, 0);
  rim.rotation.x = Math.PI / 2;
  const fill = add(g, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(COL.filling, 0.85), 0, 0.012, 0);
  fill.scale.set(0.028, 0.012, 0.028);
  const sprig = herbSprig();
  sprig.position.y = 0.03;
  g.add(sprig);
  g.userData = { cup, fill, sprig };
  return g;
}

export function herbSprig() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const leaf = add(g, new THREE.SphereGeometry(1, 8, 6), m(COL.green, 0.7));
    leaf.scale.set(0.006, 0.0025, 0.011);
    leaf.rotation.y = i * 1.6;
    leaf.position.set(Math.cos(i * 1.6) * 0.005, i * 0.001, Math.sin(i * 1.6) * 0.005);
  }
  return g;
}

export function tomato() {
  const g = new THREE.Group();
  const R = 0.042, H = 0.036, TH = 0.62; // радиус, полувысота, угол среза крышечки
  const topY = H + Math.cos(TH) * H;
  const openR = Math.sin(TH) * R;
  // тело с открытой верхушкой: после среза крышечки видна полость
  const body = add(g, new THREE.SphereGeometry(1, 28, 18, 0, Math.PI * 2, TH, Math.PI - TH), new THREE.MeshStandardMaterial({ color: COL.tomato, roughness: 0.35, side: THREE.DoubleSide }));
  body.scale.set(R, H, R);
  body.position.y = H;
  const cut = add(g, new THREE.RingGeometry(openR * 0.72, openR, 28), m(0xd9473a, 0.6), 0, topY - 0.0005, 0);
  cut.rotation.x = -Math.PI / 2;
  const hollow = add(g, new THREE.CircleGeometry(openR * 0.74, 24), m(0x6e130d, 0.9), 0, topY - 0.006, 0);
  hollow.rotation.x = -Math.PI / 2;
  const pulp = add(g, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(COL.pulp, 0.4), 0, topY - 0.008, 0);
  pulp.scale.set(openR * 0.7, 0.008, openR * 0.7);
  // крышечка — верхний сегмент той же сферы с плодоножкой
  const cap = new THREE.Group();
  const capBody = add(cap, new THREE.SphereGeometry(1, 28, 8, 0, Math.PI * 2, 0, TH), m(COL.tomato, 0.35));
  capBody.scale.set(R, H, R);
  capBody.position.y = H;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const sl = add(cap, new THREE.ConeGeometry(0.004, 0.018, 4), m(0x2f7d32, 0.7));
    sl.rotation.z = Math.PI / 2;
    sl.rotation.y = a;
    sl.position.set(Math.cos(a) * 0.008, H * 2 + 0.001, -Math.sin(a) * 0.008);
  }
  add(cap, new THREE.CylinderGeometry(0.0018, 0.0022, 0.012, 6), m(0x2f7d32, 0.7), 0, H * 2 + 0.006, 0);
  g.add(cap);
  const fill = add(g, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(COL.filling, 0.85), 0, topY - 0.004, 0);
  fill.scale.set(openR * 0.95, 0.012, openR * 0.95);
  const sprig = herbSprig();
  sprig.position.y = topY + 0.012;
  g.add(sprig);
  g.userData = { cap, cut, hollow, pulp, fill, sprig, body, openR };
  return g;
}

export function plate(r = 0.15, color = COL.plate, rim = 0xe2d7c4) {
  const g = new THREE.Group();
  const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 0.72, 0), new THREE.Vector2(r * 0.8, 0.006), new THREE.Vector2(r, 0.016), new THREE.Vector2(r * 0.98, 0.018)];
  add(g, new THREE.LatheGeometry(pts, 40), new THREE.MeshStandardMaterial({ color, roughness: 0.35, side: THREE.DoubleSide }));
  const ring = add(g, new THREE.TorusGeometry(r * 0.99, 0.002, 6, 48), m(rim, 0.4), 0, 0.017, 0);
  ring.rotation.x = Math.PI / 2;
  return g;
}

export function workPlate() {
  const g = plate(0.065);
  const mound = add(g, new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m(COL.filling, 0.85), 0, 0.006, 0);
  mound.scale.set(0.05, 0.02, 0.05);
  g.userData.mound = mound;
  return g;
}

export function canapePiece(product) {
  const g = new THREE.Group();
  if (product === 'sausage' || product === 'cucumber') {
    const col = PRODUCTS[product].color;
    const disc = add(g, new THREE.CylinderGeometry(0.016, 0.016, 0.007, 20), m(col, 0.55));
    disc.rotation.x = Math.PI / 2;
    if (product === 'cucumber') {
      const inner = add(g, new THREE.CircleGeometry(0.012, 18), m(0xd8eeb0, 0.6), 0, 0, 0.0036);
      const inner2 = inner.clone();
      inner2.position.z = -0.0036;
      inner2.rotation.y = Math.PI;
      g.add(inner2);
    } else {
      for (let i = 0; i < 5; i++) {
        const fat = add(g, new THREE.CircleGeometry(0.002, 8), m(0xfbe3e3, 0.6), Math.cos(i * 2.1) * 0.008, Math.sin(i * 2.1) * 0.008, 0.0036);
        fat.userData.fat = true;
      }
    }
  } else {
    const col = product === 'bread' ? COL.bread : COL.cheese;
    add(g, rbox(0.022, 0.02, 0.022, 0.003), m(col, 0.75), 0, -0.01, 0);
    if (product === 'bread') add(g, rbox(0.022, 0.004, 0.022, 0.003), m(COL.crust, 0.8), 0, -0.012, 0);
  }
  return g;
}

export function skewer() {
  const g = new THREE.Group();
  const stick = add(g, new THREE.CylinderGeometry(0.0016, 0.0016, 0.2, 6), m(0xd8b07a, 0.8));
  stick.rotation.x = Math.PI / 2;
  const tip = add(g, new THREE.ConeGeometry(0.0016, 0.01, 6), m(0xd8b07a, 0.8), 0, 0, 0.105);
  tip.rotation.x = Math.PI / 2;
  const knob = add(g, new THREE.SphereGeometry(0.004, 8, 6), m(0xd7262b, 0.5), 0, 0, -0.1);
  return g;
}

export function mandarin(peel = 0) {
  const g = new THREE.Group();
  const inner = add(g, new THREE.SphereGeometry(0.03, 20, 14), m(COL.mandarinIn, 0.7), 0, 0.028, 0);
  inner.scale.y = 0.85;
  for (let i = 0; i < 8; i++) {
    const line = add(g, new THREE.TorusGeometry(0.03, 0.0008, 4, 24, Math.PI), m(0xffd9a0, 0.8), 0, 0.028, 0);
    line.rotation.y = (i / 8) * Math.PI;
    line.scale.y = 0.85;
  }
  // кожура — три сектора, снимаются по одному
  const shells = [];
  for (let k = 0; k < 3; k++) {
    const sh = add(g, new THREE.SphereGeometry(0.0315, 20, 14, (k * Math.PI * 2) / 3, (Math.PI * 2) / 3), m(COL.mandarin, 0.55), 0, 0.028, 0);
    sh.scale.y = 0.86;
    shells.push(sh);
  }
  add(g, new THREE.SphereGeometry(0.004, 6, 6), m(0x2f7d32, 0.7), 0, 0.054, 0);
  g.userData = { shells };
  setMandarinPeel(g, peel);
  return g;
}
export function setMandarinPeel(g, peel) {
  g.userData.shells.forEach((s, i) => (s.visible = i >= peel));
}

export function mandarinSegment() {
  const g = new THREE.Group();
  const o = add(g, new THREE.SphereGeometry(1, 14, 10, 0, Math.PI), m(COL.mandarinIn, 0.55));
  o.scale.set(0.009, 0.011, 0.02);
  o.position.y = 0.006;
  o.rotation.z = Math.PI / 2;
  return g;
}

export function appleSlice() {
  const g = new THREE.Group();
  const o = add(g, new THREE.CylinderGeometry(0.024, 0.024, 0.008, 16, 1, false, 0, Math.PI * 0.55), m(COL.apple, 0.6));
  o.position.y = 0.004;
  const skin = add(g, new THREE.CylinderGeometry(0.0245, 0.0245, 0.0085, 16, 1, true, 0, Math.PI * 0.55), m(COL.appleSkin, 0.5));
  skin.position.y = 0.004;
  return g;
}

export function grapes() {
  const g = new THREE.Group();
  for (const [x, z] of [[0, 0], [0.012, 0.004], [0.005, -0.011]]) add(g, new THREE.SphereGeometry(0.008, 12, 10), m(COL.grape, 0.25), x, 0.008, z);
  return g;
}

export function grapeBunch() {
  const g = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4, r = 0.006 + (i % 4) * 0.006;
    add(g, new THREE.SphereGeometry(0.009, 10, 8), m(COL.grape, 0.25), Math.cos(a) * r, 0.01 + (i % 3) * 0.006, Math.sin(a) * r - i * 0.0015);
  }
  return g;
}

export function chicken() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: COL.chickenRaw, roughness: 0.55 });
  const body = add(g, new THREE.SphereGeometry(1, 28, 18), skin, 0, 0.04, -0.005);
  body.scale.set(0.085, 0.048, 0.07);
  for (const s of [-1, 1]) {
    const thigh = add(g, new THREE.SphereGeometry(1, 16, 12), skin, s * 0.068, 0.03, 0.045);
    thigh.scale.set(0.035, 0.028, 0.034);
    const drum = add(g, new THREE.CapsuleGeometry(0.013, 0.03, 4, 10), skin, s * 0.075, 0.03, 0.078);
    drum.rotation.x = Math.PI / 2.4;
    const bone = add(g, new THREE.CylinderGeometry(0.004, 0.004, 0.014, 6), m(0xfff6e8, 0.5), s * 0.075, 0.036, 0.1);
    bone.rotation.x = Math.PI / 2.4;
    const wing = add(g, new THREE.SphereGeometry(1, 12, 10), skin, s * 0.086, 0.032, -0.04);
    wing.scale.set(0.024, 0.016, 0.03);
  }
  g.userData = { skin };
  return g;
}

export function chickenColor(g, stage, doneness = 0) {
  const c = new THREE.Color(COL.chickenRaw);
  if (stage === 'baking') c.lerp(new THREE.Color(COL.chickenGold), Math.min(1, doneness));
  else if (stage === 'ready') c.set(COL.chickenGold);
  else if (stage === 'over') c.set(0xa85a1c);
  else if (stage === 'burnt') c.set(0x2d1a0e);
  g.userData.skin.color.copy(c);
}

export function bakingForm() {
  const g = new THREE.Group();
  add(g, rbox(0.3, 0.004, 0.21, 0.02), m(COL.metal, 0.35, 0.6));
  for (const [w, d, x, z] of [[0.3, 0.006, 0, -0.105], [0.3, 0.006, 0, 0.105], [0.006, 0.21, -0.15, 0], [0.006, 0.21, 0.15, 0]]) add(g, rbox(w, 0.035, d, 0.002), m(COL.metal, 0.35, 0.6), x, 0, z);
  return g;
}

export function trayModel(w = 0.56, d = 0.4) {
  const g = new THREE.Group();
  add(g, rbox(w, 0.008, d, 0.03), m(0xb3262f, 0.5));
  for (const [ww, dd, x, z] of [[w, 0.012, 0, -d / 2], [w, 0.012, 0, d / 2], [0.012, d, -w / 2, 0], [0.012, d, w / 2, 0]]) add(g, rbox(ww, 0.018, dd, 0.004), m(0x9c1f27, 0.5), x, 0, z);
  return g;
}

export function jar(color, label = 0xffffff, h = 0.07, r = 0.03) {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(r, r, h, 20), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55, roughness: 0.1 }), 0, h / 2, 0);
  add(g, new THREE.CylinderGeometry(r * 0.92, r * 0.92, h * 0.8, 20), m(color, 0.4), 0, h * 0.42, 0);
  add(g, new THREE.CylinderGeometry(r * 1.02, r * 1.02, h * 0.3, 20), m(label, 0.7), 0, h * 0.5, 0);
  add(g, new THREE.CylinderGeometry(r * 1.05, r * 1.05, 0.008, 20), m(0xc0c6cc, 0.3, 0.7), 0, h + 0.004, 0);
  return g;
}

export function butterBlock() {
  const g = new THREE.Group();
  add(g, rbox(0.07, 0.025, 0.04, 0.004), m(COL.butter, 0.45));
  add(g, rbox(0.075, 0.005, 0.045, 0.004), m(0x2f6fbf, 0.6), 0, -0.001, 0);
  return g;
}

export function greensBunch() {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const st = add(g, new THREE.CylinderGeometry(0.0015, 0.0015, 0.06, 4), m(0x4a8f3a, 0.7));
    st.rotation.z = Math.PI / 2 + (i - 4) * 0.08;
    st.position.set(0, 0.004, (i - 4) * 0.004);
    const top = herbSprig();
    top.position.set(0.035, 0.005, (i - 4) * 0.006);
    top.scale.setScalar(1.4);
    g.add(top);
  }
  return g;
}

export function glassOfCompote() {
  const g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(0.03, 0.026, 0.1, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }), 0, 0.05, 0);
  add(g, new THREE.CylinderGeometry(0.028, 0.025, 0.075, 20), new THREE.MeshStandardMaterial({ color: 0xb02844, transparent: true, opacity: 0.85, roughness: 0.2 }), 0, 0.04, 0);
  return g;
}

export function paperBag() {
  const g = new THREE.Group();
  add(g, rbox(0.22, 0.26, 0.14, 0.01), m(0xc8a274, 0.95));
  add(g, rbox(0.22, 0.02, 0.14, 0.01), m(0xb18a5c, 0.95), 0, 0.25, 0);
  const logo = add(g, new THREE.CircleGeometry(0.04, 24), m(0xd7262b, 0.6), 0, 0.14, 0.0705);
  add(g, new THREE.SphereGeometry(0.03, 10, 8), m(0x3f9b3a, 0.6), -0.04, 0.27, 0);
  add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.08, 10), m(0xfffbea, 0.5), 0.05, 0.28, 0.01);
  return g;
}

export function sponge() {
  const g = new THREE.Group();
  add(g, rbox(0.06, 0.02, 0.04, 0.006), m(0xffd43b, 0.9));
  add(g, rbox(0.06, 0.008, 0.04, 0.004), m(0x2f9e44, 0.9), 0, 0.02, 0);
  return g;
}

export function rag() {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(0.16, 0.12, 6, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 50) * 0.004 + Math.cos(pos.getY(i) * 60) * 0.003);
  geo.computeVertexNormals();
  const o = add(g, geo, new THREE.MeshStandardMaterial({ color: 0x5c9fd6, roughness: 0.95, side: THREE.DoubleSide }));
  o.rotation.x = -Math.PI / 2;
  o.position.y = 0.01;
  return g;
}

export function grater() {
  const g = new THREE.Group();
  const steel = m(0xc9d1d8, 0.3, 0.75);
  const face = add(g, new THREE.BoxGeometry(0.11, 0.2, 0.004), steel, 0, 0.1, 0);
  face.rotation.x = -0.35;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 4; c++) {
      const hole = add(g, new THREE.BoxGeometry(0.014, 0.004, 0.003), m(0x6c757d, 0.5, 0.4), -0.036 + c * 0.024, 0.025 + r * 0.019, 0.004 + r * 0.0065);
      hole.rotation.x = -0.35;
    }
  const handle = add(g, new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI), m(0x2d2d33, 0.5), 0, 0.2, -0.07);
  return g;
}

// ---------- сервировочные версии блюд для праздничного стола ----------
function bitsMound(parent, colors, n, r, y, size = 0.012, seed = 1) {
  let s = seed * 9301;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * r;
    const h = (1 - (rr / r) ** 2) * r * 0.45;
    const col = colors[i % colors.length];
    const b = add(parent, new THREE.BoxGeometry(size, size, size), m(col, 0.6), Math.cos(a) * rr, y + h, Math.sin(a) * rr);
    b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  }
}

export function servedDish(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'olivier':
    case 'crab': {
      const bowl = new THREE.Mesh(new THREE.LatheGeometry([0.05, 0.08, 0.1, 0.11].map((r, i) => new THREE.Vector2(r, i * 0.02)), 32), new THREE.MeshStandardMaterial({ color: id === 'olivier' ? 0xffffff : 0xdfeef8, roughness: 0.3, side: THREE.DoubleSide }));
      g.add(bowl);
      const cream = add(g, new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m(COL.mayo, 0.8), 0, 0.045, 0);
      cream.scale.set(0.095, 0.04, 0.095);
      const colors = id === 'olivier' ? [COL.carrot, COL.sausage, COL.cucumber, COL.potato, COL.eggWhite, 0x6dbb3a] : [0xf3f0ea, 0xe3442f, 0xf4c430, COL.cucumber, COL.eggWhite];
      bitsMound(g, colors, 70, 0.085, 0.05, 0.013, id === 'olivier' ? 1 : 2);
      const sprig = herbSprig();
      sprig.position.y = 0.09;
      sprig.scale.setScalar(2);
      g.add(sprig);
      break;
    }
    case 'sandwiches': {
      g.add(plate(0.13));
      for (let i = 0; i < 6; i++) {
        const b = breadSlice();
        b.scale.setScalar(0.62);
        b.position.set((i % 3 - 1) * 0.07, 0.012, (Math.floor(i / 3) - 0.5) * 0.06);
        add(b, rbox(0.088, 0.003, 0.066, 0.01), m(COL.butter, 0.45), 0, 0.013, 0);
        bitsMoundCaviar(b);
        g.add(b);
      }
      break;
    }
    case 'eggs': {
      g.add(plate(0.13, 0xfdfbf6, 0x3f9b3a));
      for (let i = 0; i < 6; i++) {
        const e = eggHalf();
        e.userData.yolk.visible = false;
        const a = (i / 6) * Math.PI * 2;
        e.position.set(Math.cos(a) * 0.075, 0.008, Math.sin(a) * 0.075);
        e.rotation.y = -a;
        g.add(e);
      }
      break;
    }
    case 'tartlets': {
      add(g, rbox(0.26, 0.01, 0.16, 0.02), m(0xfdfbf6, 0.4));
      for (let i = 0; i < 8; i++) {
        const t = tartlet();
        t.scale.setScalar(0.85);
        t.position.set((i % 4 - 1.5) * 0.062, 0.01, (Math.floor(i / 4) - 0.5) * 0.065);
        g.add(t);
      }
      break;
    }
    case 'tomatoes': {
      g.add(plate(0.13));
      for (let i = 0; i < 4; i++) {
        const t = tomato();
        t.userData.cap.visible = false;
        t.userData.pulp.visible = false;
        t.position.set((i % 2 - 0.5) * 0.09, 0.006, (Math.floor(i / 2) - 0.5) * 0.09);
        g.add(t);
      }
      break;
    }
    case 'shuba': {
      g.add(plate(0.14, 0xffffff, 0x2b5aa8));
      const layers = [COL.herring, COL.potato, COL.mayo, COL.carrot, COL.mayo, COL.beet];
      layers.forEach((c, i) => add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 32), m(c, 0.7), 0, 0.012 + i * 0.012, 0));
      const top = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.004, 32), m(0xf6eef0, 0.6), 0, 0.086, 0);
      for (let i = 0; i < 8; i++) {
        const dot = add(g, new THREE.SphereGeometry(0.006, 8, 6), m(0xfffbea, 0.6), Math.cos(i * 0.8) * 0.06, 0.09, Math.sin(i * 0.8) * 0.06);
      }
      top.material = m(COL.beet, 0.5);
      break;
    }
    case 'canape': {
      g.add(plate(0.13));
      const order = ['bread', 'cheese', 'sausage', 'cucumber'];
      for (let i = 0; i < 8; i++) {
        const s = new THREE.Group();
        const stick = add(s, new THREE.CylinderGeometry(0.0016, 0.0016, 0.1, 6), m(0xd8b07a, 0.8), 0, 0.05, 0);
        order.forEach((p, k) => {
          const pc = canapePiece(p);
          pc.position.y = 0.014 + k * 0.02;
          pc.rotation.x = p === 'sausage' || p === 'cucumber' ? Math.PI / 2 : 0;
          s.add(pc);
        });
        add(s, new THREE.SphereGeometry(0.004, 8, 6), m(0xd7262b, 0.5), 0, 0.1, 0);
        const a = (i / 8) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.08, 0.008, Math.sin(a) * 0.08);
        g.add(s);
      }
      break;
    }
    case 'fruit': {
      g.add(plate(0.14));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const kind = i % 3;
        const pc = kind === 0 ? mandarinSegment() : kind === 1 ? appleSlice() : grapes();
        pc.position.set(Math.cos(a) * 0.09, 0.008, Math.sin(a) * 0.09);
        pc.rotation.y = -a;
        g.add(pc);
      }
      const center = grapeBunch();
      center.position.y = 0.005;
      g.add(center);
      break;
    }
    case 'chicken': {
      const p = plate(0.16, 0xffffff, 0xd7a23a);
      p.scale.z = 0.8;
      g.add(p);
      const c = chicken();
      chickenColor(c, 'ready');
      c.position.y = 0.006;
      g.add(c);
      for (let i = 0; i < 6; i++) {
        const sp = herbSprig();
        sp.scale.setScalar(2);
        sp.position.set(Math.cos(i) * 0.12, 0.012, Math.sin(i) * 0.09);
        g.add(sp);
      }
      break;
    }
    default:
  }
  return g;
}

function bitsMoundCaviar(parent) {
  for (let i = 0; i < 18; i++) {
    const a = i * 2.4, r = Math.sqrt(i / 18) * 0.022;
    add(parent, new THREE.SphereGeometry(0.0034, 6, 5), m(COL.caviar, 0.15), Math.cos(a) * r, 0.018, Math.sin(a) * r);
  }
}

export function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) {
      o.geometry?.dispose();
      const mm = o.material;
      if (mm && ![...mats.values()].includes(mm)) {
        if (mm.map && mm.map.isCanvasTexture && !mm.userData?.sharedMap) {
          /* текстура маски освобождается её владельцем */
        }
        mm.dispose?.();
      }
    }
  });
  g.parent?.remove(g);
}
