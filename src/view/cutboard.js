// Доска кампании: продукты как объёмные тела, нож в руке идёт за мышью.
// Только читает состояние KitchenSession (board.items, board.stroke, action), ничего не начисляет.
// Нарезка кубиком — сетка raster-cut.js: куски из контуров собираются в одну геометрию, доска вращается (A/D).
//
// Кусок продукта — вертикальная призма по его контуру (логика cutting.js) с куполом сверху:
// высота купола повторяет исходный продукт, поэтому кубик из середины морковки
// сверху круглый, как настоящий. Боковые стенки — кожура (исходный контур) или мякоть (срез);
// рисунок мякоти (желток, семечки, сердцевина, шпик) считается в шейдере по координатам
// внутри исходного продукта — каждый срез показывает своё сечение.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PRODUCTS } from '../campaign/data.js';
import { BOARD_UNIT } from '../campaign/st-board.js';
import { classifyCut, CUT_RULES } from '../campaign/gestures.js';
import { bounds } from '../game/cutting.js';

const UNIT = BOARD_UNIT;
const INSET = 0.05; // визуальный зазор между соседними кусками, u (см)
const SPREAD = 0.05; // куски чуть расходятся от центра своей штуки после разрезов — видно срез
const STEP = 0.32; // шаг дробления контура, u
const CUBE_H = 1.1; // мелкий кусок не выше 1.1·√площади — кубик, а не столбик
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

/** Внешний вид продуктов на доске: kind — рисунок в шейдере, h — высота купола (кубиков). */
export const LOOK = {
  carrot: { kind: 0, h: 1.9, base: 0.48, k: 1, rough: 0.55, lean: 0.1 },
  pickle: { kind: 1, h: 1.9, base: 0.48, k: 0.3, rough: 0.42, lean: 0.12 },
  cucumber: { kind: 10, h: 1.9, base: 0.48, k: 0.3, rough: 0.32, lean: 0.12 },
  potato: { kind: 2, h: 2.4, base: 0.6, k: 1, rough: 0.78, bumps: 0.08, lean: 0.12 },
  egg: { kind: 3, h: 2.4, base: 0.6, k: 1, rough: 0.28, lean: 0.2 },
  sausage: { kind: 4, h: 2.3, base: 0.6, k: 0, rough: 0.5, lean: 0.08 },
  crab: { kind: 5, h: 1.8, base: 0.6, k: 0, rough: 0.5 },
  cheese: { kind: 6, h: 2.0, flat: true, rough: 0.6 },
  bread: { kind: 7, h: 2.0, flat: true, rough: 0.85 },
  herring: { kind: 8, h: 1.2, base: 0.5, k: 0.2, rough: 0.35 },
  onion: { kind: 9, h: 2.1, base: 0.56, k: 1, rough: 0.4 },
};

const TAPER = {
  carrot: (a) => 0.8 + 0.2 * Math.cos(a),
  egg: (a) => 0.9 + 0.1 * Math.cos(a),
};

// Форма исходного продукта: полуширина контура R(px) и высота купола H(px, pz).
function shapeOf(product) {
  const cut = PRODUCTS[product]?.cut ?? { w: 1, d: 1, profile: 'rectangle' };
  const look = LOOK[product] ?? { kind: 10, h: 1, flat: true, rough: 0.6 };
  const W = cut.w / 2, D = cut.d / 2;
  const profile = cut.profile ?? 'rectangle';
  const taper = TAPER[profile] ?? (() => 1);
  const R = (px) => {
    if (profile === 'rectangle') return Math.abs(px) <= W + 1e-6 ? D : 0;
    const c = THREE.MathUtils.clamp(px / W, -1, 1);
    const a = Math.acos(c);
    return Math.sin(a) * D * taper(a);
  };
  let Rmax = 1e-6;
  for (let i = -50; i <= 50; i++) Rmax = Math.max(Rmax, R((i / 50) * W));
  const bump = look.bumps ?? 0;
  const H = (px, pz) => {
    if (look.flat) return look.h;
    const r = R(px);
    if (r < 1e-4) return look.base;
    const q = Math.max(0, 1 - (pz / r) ** 2);
    const h = look.base + (look.h - look.base) * Math.pow(r / Rmax, look.k) * Math.sqrt(q);
    // клубень неровный: мягкие бугры, не ломающие силуэт
    return bump ? h * (1 + bump * Math.sin(px * 2.3 + pz * 1.1) * Math.sin(pz * 2.7 - px * 0.8)) : h;
  };
  return { W, D, R, H, look, profile };
}

// ---------- шейдер мякоти и кожуры ----------
const NOISE = /* glsl */ `
uniform float uKind;
uniform vec4 uDim;
uniform vec3 uBase;
varying vec3 vPP;
varying float vSkin;
float h31(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float spots(vec3 p, float scale, float size) {
  vec3 c = floor(p * scale); vec3 f = fract(p * scale) - .5;
  vec3 o = vec3(h31(c), h31(c + 7.1), h31(c + 3.7)) - .5;
  return smoothstep(size, size * .55, length(f - o * .5));
}
vec3 productColor(vec3 p, float skin) {
  float W = uDim.x, D = uDim.y, H = uDim.z;
  float yc = H * .42;
  float n = vnoise(p * 6.);
  float r = length(vec2(p.z / max(D, .01), (p.y - yc) / (H * .62)));
  vec3 c = uBase * (.9 + .1 * n);
  if (uKind < .5) { // морковь: тёмная кожица с кольцами, светлая сердцевина
    float rings = smoothstep(.78, .96, vnoise(vec3(p.x * 7.5, p.y * .4, p.z * .4)));
    vec3 sk = vec3(.95, .43, .07) * (.93 + .07 * vnoise(p * 1.7)) * (1. - .28 * rings) * (1. - .25 * spots(p, 5., .07));
    vec3 fl = mix(vec3(1., .68, .22), vec3(.99, .5, .1), smoothstep(.26, .38, r));
    fl *= 1. - .14 * smoothstep(.025, .0, abs(r - .32));
    c = mix(fl * (.97 + .03 * n), sk, skin);
  } else if (uKind < 1.5) { // огурец: полосатая кожура, семенная камера
    // солёный огурец: оливковая кожица с тонкими светлыми полосками и пупырышками
    float ang = atan(p.y - yc * .6, p.z);
    float stripe = smoothstep(.82, .97, sin(ang * 6. + n * 1.2 + p.x * .15));
    vec3 sk = mix(vec3(.24, .36, .1), vec3(.48, .56, .22), stripe * .7);
    sk *= (.9 + .1 * vnoise(p * 3.)) * (1. - .3 * spots(vec3(p.x * 1.3, p.y, p.z), 3.2, .09));
    vec3 fl = mix(vec3(.8, .82, .5), vec3(.55, .64, .26), smoothstep(.6, .97, r));
    float seed = spots(vec3(p.x, p.y * 1.4, p.z), 3., .24) * smoothstep(.5, .36, r);
    fl = mix(fl, vec3(.9, .88, .66), seed * .8);
    c = mix(fl, sk, skin);
  } else if (uKind < 2.5) { // варёный очищенный картофель
    vec3 sk = vec3(.93, .82, .52) * (.92 + .08 * vnoise(p * 2.5)) * (1. - .35 * spots(p, 1.4, .07));
    vec3 fl = vec3(.99, .92, .66) * (.93 + .07 * vnoise(p * 18.));
    c = mix(fl, sk, skin);
  } else if (uKind < 3.5) { // варёное яйцо: белок и желток
    float e = length(vec3(p.x / max(W, .01), (p.y - H * .45) / (H * .5), p.z / max(D, .01)));
    vec3 white = vec3(.98, .97, .93);
    vec3 yolk = mix(vec3(1., .8, .22), vec3(.97, .68, .12), smoothstep(.1, .5, e));
    vec3 fl = mix(yolk, white, smoothstep(.5, .57, e));
    c = mix(fl, white * (.97 + .03 * n), skin);
  } else if (uKind < 4.5) { // докторская: розовая, с крапинками
    vec3 fl = vec3(.96, .7, .7) * (.96 + .04 * n);
    fl = mix(fl, vec3(1., .95, .92), spots(p, 4.5, .1) * .8);
    vec3 sk = vec3(.88, .56, .55) * (.93 + .07 * n);
    c = mix(fl, sk, skin);
  } else if (uKind < 5.5) { // крабовая палочка: белая, красная сверху
    vec3 white = vec3(.98, .96, .93) * (.96 + .04 * sin(p.z * 40. + n * 3.));
    vec3 sk = mix(white, vec3(.92, .3, .18) * (.9 + .1 * n), smoothstep(H * .5, H * .68, p.y));
    c = mix(white, sk, skin);
  } else if (uKind < 6.5) { // сыр: дырочки
    c = vec3(.98, .84, .36) * (.93 + .07 * n) * (1. - .2 * spots(p, 1.6, .16));
  } else if (uKind < 7.5) { // хлеб: корочка по краю
    c = mix(vec3(.95, .86, .68) * (.9 + .1 * vnoise(p * 20.)), vec3(.66, .4, .18), skin);
  } else if (uKind < 8.5) { // сельдь: серебристая спинка, розоватое филе
    vec3 fl = vec3(.86, .7, .62) * (.94 + .06 * sin(p.x * 25. + n * 4.));
    c = mix(fl, vec3(.62, .64, .66) * (.85 + .15 * n), skin);
  } else if (uKind < 9.5) { // лук: кольца
    c = vec3(.96, .95, .86) * (1. - .1 * smoothstep(.04, .0, abs(fract(r * 5.) - .5) - .45));
  } else if (uKind < 10.5) { // свежий огурец: тёмно-зелёная глянцевая кожица со светлыми штрихами, сочная мякоть
    float ang = atan(p.y - yc * .6, p.z);
    float streak = smoothstep(.7, .95, sin(ang * 9. + vnoise(vec3(p.x * 2., 0., 0.)) * 3.));
    vec3 sk = mix(vec3(.12, .38, .1), vec3(.42, .64, .22), streak * .55) * (.92 + .08 * vnoise(p * 4.));
    vec3 fl = mix(vec3(.9, .96, .74), vec3(.66, .84, .44), smoothstep(.62, .97, r));
    float seed = spots(vec3(p.x, p.y * 1.4, p.z), 3.2, .22) * smoothstep(.48, .34, r);
    fl = mix(fl, vec3(.97, .98, .9), seed * .9);
    c = mix(fl, sk, skin);
  }
  // палитра задана в sRGB, освещение считается в линейном пространстве
  return pow(c, vec3(2.2));
}
`;

// Кожура при чистке: мундир картофеля, скорлупа яйца (трещинки появляются после первого движения ножом).
const JACKET = /* glsl */ `
uniform sampler2D uPeel;
uniform vec2 uPeelSize;
uniform vec3 uJacket;
uniform float uCrack;
varying vec2 vBoard;
vec3 withJacket(vec3 c, vec3 p, float skin) {
  float peeled = texture2D(uPeel, vBoard / uPeelSize + .5).r;
  float n = vnoise(p * 5.);
  vec3 j = uJacket * (.88 + .12 * n);
  if (uKind > 2.5 && uKind < 3.5) { // яичная скорлупа: мелкие крапинки и трещины
    j *= 1. - .08 * spots(p, 9., .06);
    float crack = smoothstep(.035, .0, abs(vnoise(p * 3.1) - .5)) * uCrack;
    j = mix(j, vec3(.55, .48, .4), crack * .8);
  } else { // мундир: тёмные «глазки» и землистые пятна
    j *= (1. - .35 * spots(p, 1.6, .06)) * (.9 + .1 * vnoise(p * 11.));
  }
  return mix(c, pow(j, vec3(2.2)), skin * (1. - smoothstep(.25, .6, peeled)));
}
`;

const mats = new Map();
/** Материал продукта: один шейдер, разные параметры. peel — отдельный материал с маской чистки. */
export function productMaterial(product, peel = null) {
  const key = product + (peel ? ':peel' : '');
  if (mats.has(key)) return mats.get(key);
  const sh = shapeOf(product);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: sh.look.rough ?? 0.6, metalness: 0 });
  const uniforms = {
    uKind: { value: sh.look.kind },
    uDim: { value: new THREE.Vector4(sh.W, sh.D, sh.look.h, sh.look.base ?? 0) },
    uBase: { value: new THREE.Color().setHex(PRODUCTS[product]?.color ?? 0xdddddd, THREE.LinearSRGBColorSpace) },
  };
  if (peel) {
    uniforms.uPeel = { value: peel.texture };
    uniforms.uPeelSize = { value: peel.size };
    uniforms.uJacket = { value: new THREE.Color().setHex(PRODUCTS[product]?.peel ?? 0x9a7448, THREE.LinearSRGBColorSpace) };
    uniforms.uCrack = peel.crack;
  }
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 pp;\nattribute float skin;\nvarying vec3 vPP;\nvarying float vSkin;' + (peel ? '\nvarying vec2 vBoard;' : ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPP = pp;\nvSkin = skin;' + (peel ? '\nvBoard = position.xz;' : ''));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE + (peel ? JACKET : ''))
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', peel ? 'vec4 diffuseColor = vec4( withJacket(productColor(vPP, vSkin), vPP, vSkin) * diffuse, opacity );' : 'vec4 diffuseColor = vec4( productColor(vPP, vSkin) * diffuse, opacity );');
  };
  mat.customProgramCacheKey = () => (peel ? 'product-peel-v1' : 'product-v1');
  mats.set(key, mat);
  return mat;
}

// ---------- геометрия куска ----------
function outlineOf(piece) {
  if (piece.polygon) return piece.polygon.map((q) => ({ x: q.x, z: q.z, o: !!q.o }));
  return [
    { x: piece.x, z: piece.z },
    { x: piece.x + piece.w, z: piece.z },
    { x: piece.x + piece.w, z: piece.z + piece.d },
    { x: piece.x, z: piece.z + piece.d },
  ];
}

/**
 * Геометрия куска в метрах относительно центра доски.
 * Атрибуты: pp — точка внутри исходного продукта (кубики), skin — 1 кожура, 0 мякоть.
 */
export function pieceGeometry(piece, product) {
  const sh = shapeOf(product);
  const m = piece.m ?? { cx: piece.x + piece.w / 2, cz: piece.z + piece.d / 2 };
  const pts = outlineOf(piece);
  // какие рёбра — кожура: у контура исходные вершины, у прямоугольника — край исходного продукта
  const onEdge = (a, b) => {
    if (piece.polygon) return a.o && b.o;
    const ex = (v) => Math.abs(v - (m.cx - sh.W)) < 1e-6 || Math.abs(v - (m.cx + sh.W)) < 1e-6;
    const ez = (v) => Math.abs(v - (m.cz - sh.D)) < 1e-6 || Math.abs(v - (m.cz + sh.D)) < 1e-6;
    return (Math.abs(a.x - b.x) < 1e-9 && ex(a.x)) || (Math.abs(a.z - b.z) < 1e-9 && ez(a.z));
  };
  // дробим рёбра, чтобы купол и кожура были гладкими
  const ring = [];
  let cx = 0, cz = 0;
  for (const p of pts) {
    cx += p.x;
    cz += p.z;
  }
  cx /= pts.length;
  cz /= pts.length;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const skin = onEdge(a, b);
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
    for (let k = 0; k < n; k++) ring.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, skin });
  }
  // визуальный зазор: контур чуть сжимается к центру
  for (const p of ring) {
    const dx = p.x - cx, dz = p.z - cz, l = Math.hypot(dx, dz) || 1;
    const s = Math.min(INSET, l * 0.15);
    p.vx = p.x - (dx / l) * s;
    p.vz = p.z - (dz / l) * s;
  }
  const Hat = (x, z) => Math.min(sh.H(x - m.cx, z - m.cz), piece.hmax ?? Infinity);
  // направление обхода контура: от него зависит, куда смотрят грани (иначе стенки смотрят внутрь и кусок «пустой»)
  let area2 = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    area2 += a.x * b.z - b.x * a.z;
  }
  const ccw = area2 > 0;
  const tri = (arr, a, b, c) => (ccw ? arr.push(a, b, c) : arr.push(a, c, b));

  // крышка: кольца от центра к краю
  const T = [0, 0.4, 0.7, 0.9, 1];
  const top = { pos: [], pp: [], skin: [], idx: [] };
  const N = ring.length;
  const addTop = (x, z) => {
    const h = Hat(x, z);
    top.pos.push(x * UNIT, h * UNIT, z * UNIT);
    top.pp.push(x - m.cx, h, z - m.cz);
    top.skin.push(1);
  };
  addTop(cx, cz);
  for (let r = 1; r < T.length; r++) for (const p of ring) addTop(cx + (p.vx - cx) * T[r], cz + (p.vz - cz) * T[r]);
  for (let i = 0; i < N; i++) tri(top.idx, 0, 1 + ((i + 1) % N), 1 + i);
  for (let r = 1; r < T.length - 1; r++) {
    const a0 = 1 + (r - 1) * N, b0 = 1 + r * N;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      tri(top.idx, a0 + i, a0 + j, b0 + i);
      tri(top.idx, a0 + j, b0 + j, b0 + i);
    }
  }
  const gTop = new THREE.BufferGeometry();
  gTop.setAttribute('position', new THREE.Float32BufferAttribute(top.pos, 3));
  gTop.setAttribute('pp', new THREE.Float32BufferAttribute(top.pp, 3));
  gTop.setAttribute('skin', new THREE.Float32BufferAttribute(top.skin, 1));
  gTop.setIndex(top.idx);
  gTop.computeVertexNormals();

  // стенки: срез плоский, кожура скруглена (нормали усреднены и чуть смотрят вверх)
  const segN = ring.map((p, i) => {
    const q = ring[(i + 1) % N];
    const dx = q.vx - p.vx, dz = q.vz - p.vz, l = Math.hypot(dx, dz) || 1;
    // наружу — от центра куска
    let nx = dz / l, nz = -dx / l;
    if ((p.vx - cx) * nx + (p.vz - cz) * nz < 0) {
      nx = -nx;
      nz = -nz;
    }
    return { x: nx, z: nz };
  });
  const wall = { pos: [], pp: [], skin: [], nrm: [], idx: [] };
  for (let i = 0; i < N; i++) {
    const p = ring[i], q = ring[(i + 1) % N];
    const sk = p.skin ? 1 : 0;
    const base = wall.pos.length / 3;
    const vn = (k) => {
      if (!sk) return [segN[i].x, 0, segN[i].z];
      const nb = k === 0 ? (ring[(i - 1 + N) % N].skin ? segN[(i - 1 + N) % N] : segN[i]) : q.skin ? segN[(i + 1) % N] : segN[i];
      const v = new THREE.Vector3(segN[i].x + nb.x, 0.6, segN[i].z + nb.z).normalize();
      return [v.x, v.y, v.z];
    };
    for (const [k, v] of [[0, p], [1, q]]) {
      const h = Hat(v.vx, v.vz);
      const n = vn(k);
      for (const y of [0, h]) {
        wall.pos.push(v.vx * UNIT, y * UNIT, v.vz * UNIT);
        wall.pp.push(v.vx - m.cx, y, v.vz - m.cz);
        wall.skin.push(sk);
        wall.nrm.push(...n);
      }
    }
    // наружу: (низ p, верх p, низ q) при обходе против часовой стрелки
    tri(wall.idx, base, base + 1, base + 2);
    tri(wall.idx, base + 2, base + 1, base + 3);
  }
  const gWall = new THREE.BufferGeometry();
  gWall.setAttribute('position', new THREE.Float32BufferAttribute(wall.pos, 3));
  gWall.setAttribute('normal', new THREE.Float32BufferAttribute(wall.nrm, 3));
  gWall.setAttribute('pp', new THREE.Float32BufferAttribute(wall.pp, 3));
  gWall.setAttribute('skin', new THREE.Float32BufferAttribute(wall.skin, 1));
  gWall.setIndex(wall.idx);
  // донышко: видно, когда кусок наклоняется
  const bot = { pos: [], pp: [], skin: [], nrm: [], idx: [] };
  bot.pos.push(cx * UNIT, 0, cz * UNIT);
  bot.pp.push(cx - m.cx, 0, cz - m.cz);
  for (const p of ring) {
    bot.pos.push(p.vx * UNIT, 0, p.vz * UNIT);
    bot.pp.push(p.vx - m.cx, 0, p.vz - m.cz);
  }
  for (let i = 0; i <= N; i++) {
    bot.skin.push(0);
    bot.nrm.push(0, -1, 0);
  }
  for (let i = 0; i < N; i++) tri(bot.idx, 0, 1 + i, 1 + ((i + 1) % N));
  const gBot = new THREE.BufferGeometry();
  gBot.setAttribute('position', new THREE.Float32BufferAttribute(bot.pos, 3));
  gBot.setAttribute('normal', new THREE.Float32BufferAttribute(bot.nrm, 3));
  gBot.setAttribute('pp', new THREE.Float32BufferAttribute(bot.pp, 3));
  gBot.setAttribute('skin', new THREE.Float32BufferAttribute(bot.skin, 1));
  gBot.setIndex(bot.idx);
  const g = mergeGeometries([gTop, gWall, gBot]);
  gTop.dispose();
  gWall.dispose();
  gBot.dispose();
  g.userData.center = { x: cx, z: cz };
  return g;
}

/**
 * Ориентация лезвия по последнему участку следа (≥ 0.6 u): лезвие вдоль движения,
 * рукоять всегда к себе или вправо — на зигзаге «рубки» нож не переворачивается.
 */
function strokeYaw(stroke) {
  const pts = stroke?.pts;
  if (!pts || pts.length < 2) return null;
  const b = pts[pts.length - 1];
  for (let i = pts.length - 2; i >= 0; i--) {
    const dx = b.x - pts[i].x, dz = b.z - pts[i].z, l = Math.hypot(dx, dz);
    if (l < 0.6) continue;
    const ux = dx / l, uz = dz / l;
    const flip = uz < -0.3 || (Math.abs(uz) <= 0.3 && ux < 0);
    return Math.atan2(flip ? -ux : ux, flip ? -uz : uz);
  }
  return null;
}

/** Высота продукта (кубиков) в точке доски или null, если там пусто. */
function heightAt(pieces, product, x, z) {
  const sh = shapeOf(product);
  for (const p of pieces) {
    if (x < p.x || x > p.x + p.w || z < p.z || z > p.z + p.d) continue;
    const m = p.m ?? { cx: p.x + p.w / 2, cz: p.z + p.d / 2 };
    return sh.H(x - m.cx, z - m.cz);
  }
  return null;
}

// ---------- нож и руки ----------
function buildKnife() {
  const knife = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xdfe6ec, metalness: 0.55, roughness: 0.22 });
  // лезвие: профиль в плоскости (z, y), остриё к -z, режущая кромка внизу
  const s = new THREE.Shape();
  s.moveTo(0.07, 0);
  s.lineTo(-0.035, 0);
  s.quadraticCurveTo(-0.07, 0.002, -0.085, 0.022);
  s.lineTo(-0.05, 0.03);
  s.lineTo(0.07, 0.034);
  s.lineTo(0.07, 0);
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.0018, bevelEnabled: false });
  bg.rotateY(Math.PI / 2);
  bg.translate(-0.0009, 0, 0);
  const blade = new THREE.Mesh(bg, steel);
  blade.castShadow = true;
  // кромка-фаска светлее
  const edge = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0035, 0.105), new THREE.MeshStandardMaterial({ color: 0xf7fbff, metalness: 0.4, roughness: 0.15 }));
  edge.position.set(0, 0.0018, 0.015);
  const grip = new THREE.Group();
  const bolster = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.026, 0.008), steel);
  bolster.position.set(0, 0.02, 0.074);
  const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.085, 6, 12), new THREE.MeshStandardMaterial({ color: 0x2b1d16, roughness: 0.55 }));
  handle.rotation.x = Math.PI / 2;
  handle.scale.set(0.85, 1, 1.25);
  handle.position.set(0, 0.024, 0.125);
  grip.add(bolster, handle);
  for (const z of [0.105, 0.135]) {
    const rivet = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.0155, 10), steel);
    rivet.rotation.z = Math.PI / 2;
    rivet.position.set(0, 0.024, z);
    grip.add(rivet);
  }
  // рука в свитере держит рукоять
  const skin = new THREE.MeshStandardMaterial({ color: 0xf1b992, roughness: 0.65 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), skin);
  fist.scale.set(1.15, 0.95, 1.5);
  fist.position.set(0.004, 0.032, 0.122);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.0055, 0.018, 4, 8), skin);
  thumb.rotation.set(Math.PI / 2 - 0.3, 0, -0.4);
  thumb.position.set(-0.009, 0.036, 0.1);
  // короткий рукав свитера: длинный цилиндр у камеры перекрывал продукт
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.035, 14), new THREE.MeshStandardMaterial({ color: 0xc62f35, roughness: 0.9 }));
  sleeve.rotation.x = Math.PI / 2 - 0.75;
  sleeve.position.set(0.005, 0.062, 0.162);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.006, 8, 18), new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.95 }));
  cuff.rotation.x = -0.5 + Math.PI / 2;
  cuff.position.set(0.005, 0.05, 0.143);
  // только кисть: рукав у камеры закрывал продукт
  grip.add(fist, thumb);
  sleeve.geometry.dispose();
  cuff.geometry.dispose();
  // лёгкий крен: плоскость лезвия видна сверху, как у ножа в руке
  const roll = new THREE.Group();
  roll.rotation.z = -0.32;
  roll.add(blade, edge, grip);
  roll.scale.setScalar(0.82);
  knife.add(roll);
  knife.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return knife;
}

function buildLeftHand() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xf1b992, roughness: 0.65 });
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), skin);
  palm.scale.set(1.05, 0.55, 1.3);
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0048, 0.017 - Math.abs(i - 1.5) * 0.002, 4, 8), skin);
    f.rotation.set(0, 0, Math.PI / 2 + 0.25);
    f.position.set(0.02, -0.004 - i * 0.0005, -0.012 + i * 0.0085);
    g.add(f);
  }
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.028, 14), new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: 0.95 }));
  sleeve.position.set(-0.026, 0.014, 0.004);
  sleeve.rotation.set(0, 0, 1.1);
  g.add(sleeve);
  g.scale.setScalar(0.75);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

// Пунктирная полоса (подсказка и будущий разрез).
function dashTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const x = c.getContext('2d');
  x.fillStyle = '#fff';
  x.fillRect(0, 0, 40, 8);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export class CutBoardView {
  constructor(parent, center) {
    this.group = new THREE.Group();
    this.group.position.copy(center);
    parent.add(this.group);
    // продукт на доске (поворачивается A/D); куски — одна геометрия bodyMesh
    this.prod = new THREE.Group();
    this.group.add(this.prod);
    this.bodyMesh = null;
    this.bodyVersion = -1;
    this.rebuildT = 0;
    this.itemKey = null;
    this.lastCuts = 0;
    this.knife = buildKnife();
    this.knife.visible = false;
    this.group.add(this.knife);
    this.leftHand = buildLeftHand();
    this.leftHand.visible = false;
    this.group.add(this.leftHand);
    this.knifeYaw = 0;
    this.knifePos = new THREE.Vector3();
    this.lastLine = null;
    this.idleT = 0;
    this.successCuts = 0;

    const dash = dashTexture();
    const lineMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, map: dash, transparent: true, opacity, depthWrite: false, depthTest: false });
    this.preview = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lineMat(0x34c759, 0.85));
    this.preview.rotation.x = -Math.PI / 2;
    this.preview.renderOrder = 6;
    this.preview.visible = false;
    this.group.add(this.preview);
    this.guide = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), lineMat(0xffffff, 0.75));
    this.guide.rotation.x = -Math.PI / 2;
    this.guide.renderOrder = 6;
    this.guide.visible = false;
    this.prod.add(this.guide);
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.02, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
    this.arrow.renderOrder = 7;
    this.arrow.visible = false;
    this.prod.add(this.arrow);

    // крошки после разреза
    this.crumbs = [];
    this.crumbMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), 96);
    this.crumbMesh.count = 0;
    this.crumbMesh.frustumCulled = false;
    this.crumbMesh.castShadow = true;
    this.group.add(this.crumbMesh);

    // образец: кубик этого же продукта на блюдце
    this.sample = new THREE.Group();
    const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.028, 0.005, 28), new THREE.MeshStandardMaterial({ color: 0x2fbf5a, roughness: 0.4 }));
    saucer.position.y = 0.0025;
    saucer.receiveShadow = true;
    this.sample.add(saucer);
    this.sample.position.set(0.215, 0, -0.1);
    // подпись, чтобы образец не принимали за ещё один продукт
    const tagC = document.createElement('canvas');
    tagC.width = 256;
    tagC.height = 64;
    const tg = tagC.getContext('2d');
    tg.fillStyle = 'rgba(26,21,18,0.78)';
    tg.beginPath();
    tg.roundRect(4, 8, 248, 48, 24);
    tg.fill();
    tg.fillStyle = '#ffd06a';
    tg.font = '800 28px Nunito, sans-serif';
    tg.textAlign = 'center';
    tg.fillText('образец кубика', 128, 42);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tagC), depthTest: false, transparent: true }));
    tag.scale.set(0.07, 0.0175, 1);
    tag.position.set(0, 0.07, 0);
    tag.renderOrder = 8;
    this.sample.add(tag);
    this.sampleCube = null;
    this.sampleProduct = null;
    this.group.add(this.sample);
  }

  reset() {
    this._clearBody();
    this.itemKey = null;
    this.crumbs = [];
    this.crumbMesh.count = 0;
  }

  _setSample(product, round) {
    const key = product + (round ? ':r' : '');
    if (this.sampleProduct === key) return;
    this.sampleProduct = key;
    if (this.sampleCube) {
      this.sample.remove(this.sampleCube);
      this.sampleCube.geometry.dispose();
      this.sampleCube = null;
    }
    if (!product || !PRODUCTS[product]?.cut) return;
    const sh = shapeOf(product);
    // кусочек из середины продукта: те же купол, мякоть и кожура, что получатся при нарезке
    const w = round ? 0.5 : 1;
    const piece = { id: -1, x: sh.W * 0.25, z: -0.5, w, d: 1, m: { cx: 0, cz: 0 }, hmax: round ? undefined : CUBE_H };
    const g = pieceGeometry(piece, product);
    g.translate(-(piece.x + w / 2) * UNIT, 0.005, 0);
    this.sampleCube = new THREE.Mesh(g, productMaterial(product));
    this.sampleCube.castShadow = true;
    this.sample.add(this.sampleCube);
  }

  /**
   * Кадр доски. s — KitchenSession, pointer — {x, z} в метрах рабочей плоскости или null,
   * closeup — камера в крупном плане доски.
   */
  sync(s, dt, closeup, pointer) {
    const it = s?.boardCur?.() ?? null;
    const body = it?.body ?? null;
    const key = it?.key ?? null;
    if (key !== this.itemKey) {
      this._clearBody();
      this.itemKey = key;
      this.lastCuts = it?.cuts ?? 0;
    }
    // продукт на доске — одна геометрия из контуров кусков; доска поворачивается вместе с ним (A/D)
    const ang = body ? it.angle ?? 0 : 0;
    this.prod.rotation.y = ang;
    if (body) {
      this.rebuildT -= dt;
      if (body.version !== this.bodyVersion && (this.rebuildT <= 0 || !s.pointerDown)) this._buildBody(it);
    }
    const pieces = body ? it.pieces : [];
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const toBody = (x, z) => ({ x: x * ca - z * sa, z: x * sa + z * ca });

    // крошки на свежий разрез
    if (it && it.cuts > this.lastCuts) {
      if (body && pointer) this._spawnCrumbsAt(it, pointer.x / UNIT, pointer.z / UNIT, it.cuts - this.lastCuts);
      else if (it.log && this.lastLine) this._spawnCrumbs(it, this.lastLine);
    }
    this.lastCuts = it?.cuts ?? 0;
    this._updateCrumbs(dt);

    this._setSample(it && !it.grater && !it.peel ? it.product : null, !!it?.log);
    this.sample.visible = !!it && !it.grater && !it.peel;
    if (body && it.peel) this._syncPeel(it, pointer);

    // нож, рука, подсказка
    const showTools = closeup && !!it && !it.grater && s.panel === 'board';
    this.knife.visible = showTools;
    this.leftHand.visible = showTools && (pieces.length > 0 || !!it?.log);
    this.preview.visible = false;
    this.guide.visible = false;
    this.arrow.visible = false;
    if (!showTools) return;

    const topH = (x, z) => {
      if (it.log) return Math.abs(z) <= it.radius && x >= -it.log.length / 2 && x <= it.log.length / 2 ? it.radius * 2 : null;
      const p = toBody(x, z);
      return this._bodyHeight(it, p.x, p.z);
    };
    let kx, kz, ky, yaw = this.knifeYaw;
    const act = it.log && s.action?.type === 'cut' ? s.action : null;
    const stroke = s.board.stroke;
    if (body) {
      // нож идёт за мышью; зажата кнопка — лезвие в продукте и режет по следу
      kx = pointer ? pointer.x / UNIT : 0;
      kz = pointer ? pointer.z / UNIT : 0;
      const pressed = s.pointerDown && (!!s.board.knife || (it.peel && s.board.peelLast));
      const dir = strokeYaw(stroke);
      if (dir != null) yaw = dir;
      const h = topH(kx, kz) ?? 0;
      ky = pressed ? (it.peel ? h * UNIT + 0.002 : 0.0015) : (h + 0.7) * UNIT + 0.006;
      this.idleT = pressed ? 0 : this.idleT + dt;
    } else if (act) {
      // кружочки: нажим — лезвие проходит до доски по линии разреза
      const d = act.data;
      this.lastLine = d;
      const along = THREE.MathUtils.clamp(this.knifeAlong ?? (d.from + d.to) / 2, Math.min(d.from, d.to), Math.max(d.from, d.to));
      kx = d.pos;
      kz = along;
      yaw = 0;
      const p = Math.min(1, act.elapsed / act.duration);
      const h0 = (topH(kx, kz) ?? 0.3) * UNIT;
      ky = p < 0.55 ? h0 * (1 - p / 0.55) : 0.012 * ((p - 0.55) / 0.45);
      this._showLine(this.preview, 'x', d.pos, d.from, d.to, 0x34c759, (1 - p) * 0.85, it);
      this.idleT = 0;
    } else if (stroke && stroke.pts.length && pointer) {
      const ux = pointer.x / UNIT, uz = pointer.z / UNIT;
      const line = stroke.pts.length > 1 ? classifyCut(stroke, { allow: 'x', rules: { ...CUT_RULES, ...(s.cfg.cutRules ?? {}) } }) : null;
      if (line?.ok) {
        yaw = 0;
        kx = line.pos;
        kz = uz;
        this._showLine(this.preview, 'x', line.pos, line.from, line.to, 0x34c759, 0.8, it);
      } else {
        const dir = strokeYaw(stroke);
        if (dir != null) yaw = dir;
        kx = ux;
        kz = uz;
        if (line && !line.ok && line.reason !== 'short') this._showRaw(stroke, 0xff9f0a, it);
      }
      this.knifeAlong = line?.ok ? uz : null;
      ky = (topH(kx, kz) ?? 0) * UNIT * 0.55 + 0.002;
      this.idleT = 0;
    } else {
      kx = pointer ? pointer.x / UNIT : 0;
      kz = pointer ? pointer.z / UNIT : 0;
      ky = ((topH(kx, kz) ?? 0) + 0.7) * UNIT + 0.006;
      this.idleT += dt;
      this.knifeAlong = null;
    }
    this.knifeYaw += (yaw - this.knifeYaw) * (1 - Math.exp(-dt * 14));
    this.knife.rotation.y = this.knifeYaw;
    const kk = 1 - Math.exp(-dt * 30);
    const area = body ? this._boardBounds(it) : it.log ? { minX: -it.log.length / 2, maxX: it.log.length / 2, minZ: -it.radius, maxZ: it.radius } : { minX: -6, maxX: 6, minZ: -6, maxZ: 6 };
    this.knifePos.x += (THREE.MathUtils.clamp(kx, area.minX - 3, area.maxX + 3) * UNIT - this.knifePos.x) * kk;
    this.knifePos.z += (THREE.MathUtils.clamp(kz, area.minZ - 2.4, area.maxZ + 2.4) * UNIT - this.knifePos.z) * kk;
    this.knifePos.y += (ky - this.knifePos.y) * (1 - Math.exp(-dt * 40));
    this.knife.position.copy(this.knifePos);

    // левая рука придерживает продукт слева от ножа
    if (pieces.length || it.log) {
      const b = area;
      const hx = Math.max(b.minX + 0.7, Math.min(b.minX + 1.8, kx - 3.2));
      const hz = THREE.MathUtils.clamp(kz, b.minZ + 0.8, b.maxZ - 0.8);
      const hh = topH(hx + 0.6, hz) ?? topH(hx, hz) ?? 0.8;
      this.leftHand.position.set((hx - 1.1) * UNIT, (hh + 0.24) * UNIT, hz * UNIT);
    }

    // подсказка: куда вести нож дальше (первый день или если замешкалась) — в системе продукта
    const wantGuide = body && !it.peel && !s.pointerDown && (s.dayIndex === 0 || this.idleT > 4) && this.idleT > 0.6;
    if (wantGuide) {
      const g = suggestCut(pieces);
      if (g) {
        this._showLine(this.guide, g.axis, g.pos, g.from, g.to, 0xffffff, 0.45 + Math.sin(this.idleT * 4) * 0.2, it);
        const u = (this.idleT * 0.6) % 1;
        const along = g.from + (g.to - g.from) * u;
        const ax = g.axis === 'x' ? g.pos : along, az = g.axis === 'x' ? along : g.pos;
        this.arrow.visible = true;
        this.arrow.position.set(ax * UNIT, ((this._bodyHeight(it, ax, az) ?? 0) + 0.3) * UNIT + 0.004, az * UNIT);
        this.arrow.rotation.set(g.axis === 'x' ? Math.PI / 2 : 0, 0, g.axis === 'x' ? 0 : -Math.PI / 2);
      }
    }
  }

  // Высота продукта (u) в точке системы продукта или null.
  _bodyHeight(it, px, pz) {
    const b = it.body;
    const i = b.cellAt(px, pz);
    if (i == null || !b.mask[i]) return null;
    const cp = b.copies[b.owner[i]];
    return shapeOf(it.product).H(px - cp.cx, pz - cp.cz);
  }

  // Рамка продукта в координатах доски (с учётом поворота).
  _boardBounds(it) {
    const b = bounds(it.pieces);
    const a = it.angle ?? 0, ca = Math.cos(a), sa = Math.sin(a);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]]) {
      const X = x * ca + z * sa, Z = -x * sa + z * ca;
      minX = Math.min(minX, X);
      maxX = Math.max(maxX, X);
      minZ = Math.min(minZ, Z);
      maxZ = Math.max(maxZ, Z);
    }
    return { minX, maxX, minZ, maxZ };
  }

  // Куски с сетки → одна геометрия. Кусок чуть отходит от центра своей штуки — видны срезы.
  _buildBody(it) {
    this.bodyVersion = it.body.version;
    this.rebuildT = 0.07;
    const geos = [];
    for (const p of it.pieces) {
      const poly = it.body.contour(p);
      if (poly.length < 3) continue;
      const g = pieceGeometry({ polygon: poly, x: p.x, z: p.z, w: p.w, d: p.d, m: p.m, hmax: CUBE_H * Math.sqrt(p.area) }, it.product);
      g.translate((p.cx - p.m.cx) * SPREAD * UNIT, 0, (p.cz - p.m.cz) * SPREAD * UNIT);
      geos.push(g);
    }
    const merged = geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry();
    for (const g of geos) g.dispose();
    const mat = it.peel ? productMaterial(it.product, this._peelState(it.peel)) : productMaterial(it.product);
    if (!this.bodyMesh) {
      this.bodyMesh = new THREE.Mesh(merged, mat);
      this.bodyMesh.castShadow = true;
      this.bodyMesh.receiveShadow = true;
      this.prod.add(this.bodyMesh);
    } else {
      this.bodyMesh.geometry.dispose();
      this.bodyMesh.geometry = merged;
      this.bodyMesh.material = mat;
    }
  }

  _clearBody() {
    if (this.bodyMesh) {
      this.prod.remove(this.bodyMesh);
      this.bodyMesh.geometry.dispose();
      this.bodyMesh = null;
    }
    this.bodyVersion = -1;
    this.rebuildT = 0;
  }

  // Маска чистки → текстура для шейдера кожуры (одна на доску, материал общий по продукту).
  _peelState(mask) {
    if (!this.peel || this.peel.cols !== mask.cols || this.peel.rows !== mask.rows) {
      const data = new Uint8Array(mask.cols * mask.rows);
      const texture = new THREE.DataTexture(data, mask.cols, mask.rows, THREE.RedFormat, THREE.UnsignedByteType);
      texture.magFilter = texture.minFilter = THREE.LinearFilter;
      texture.needsUpdate = true;
      this.peel = { cols: mask.cols, rows: mask.rows, data, texture, size: new THREE.Vector2(mask.width, mask.depth), crack: { value: 0 }, version: -1 };
    }
    this.peel.size.set(mask.width, mask.depth);
    return this.peel;
  }

  _syncPeel(it, pointer) {
    const st = this._peelState(it.peel);
    const mask = it.peel;
    if (st.version === mask.version && st.key === it.key) return;
    const grew = st.key === it.key && mask.version > st.version;
    st.version = mask.version;
    st.key = it.key;
    for (let i = 0; i < st.data.length; i++) st.data[i] = Math.min(255, Math.round(Math.min(1, mask.level[i] * 2) * 255));
    st.texture.needsUpdate = true;
    st.crack.value = mask.coverage() > 0 ? 1 : 0;
    // очистки летят из-под ножа: полоски мундира или осколки скорлупы
    if (grew && pointer) {
      const col = new THREE.Color(PRODUCTS[it.product]?.peel ?? 0x9a7448);
      for (let i = 0; i < 3; i++) {
        this.crumbs.push({
          p: new THREE.Vector3(pointer.x + (Math.random() - 0.5) * 0.01, 0.8 * UNIT, pointer.z + (Math.random() - 0.5) * 0.01),
          v: new THREE.Vector3((Math.random() - 0.5) * 0.12, 0.1 + Math.random() * 0.08, (Math.random() - 0.5) * 0.12),
          s: (it.product === 'egg' ? 0.11 : 0.13) * UNIT,
          sh: it.product === 'egg' ? [1.1, 0.16, 0.9] : [1.8, 0.2, 0.7], // осколок скорлупы / тонкая полоска мундира
          r: Math.random() * 6,
          life: 4 + Math.random(),
          col,
        });
      }
      if (this.crumbs.length > 96) this.crumbs.splice(0, this.crumbs.length - 96);
    }
  }

  _showLine(mesh, axis, pos, from, to, color, opacity, it) {
    const lo = Math.min(from, to), hi = Math.max(from, to);
    const len = Math.max(0.2, hi - lo);
    const mid = (lo + hi) / 2;
    const top = (it.log ? it.radius * 2 : LOOK[it.product]?.h ?? 1) + 0.08;
    mesh.visible = true;
    mesh.material.color.setHex(color);
    mesh.material.opacity = Math.max(0, opacity);
    mesh.material.map.repeat.set(len * 1.6, 1);
    if (axis === 'x') {
      mesh.scale.set(len * UNIT, 0.0032, 1);
      mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      mesh.position.set(pos * UNIT, top * UNIT, mid * UNIT);
    } else {
      mesh.scale.set(len * UNIT, 0.0032, 1);
      mesh.rotation.set(-Math.PI / 2, 0, 0);
      mesh.position.set(mid * UNIT, top * UNIT, pos * UNIT);
    }
  }

  _showRaw(stroke, color, it) {
    const a = stroke.pts[0], b = stroke.pts[stroke.pts.length - 1];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (len < 0.2) return;
    const top = (it.log ? it.radius * 2 : LOOK[it.product]?.h ?? 1) + 0.08;
    const m = this.preview;
    m.visible = true;
    m.material.color.setHex(color);
    m.material.opacity = 0.7;
    m.material.map.repeat.set(len * 1.6, 1);
    m.scale.set(len * UNIT, 0.0032, 1);
    m.rotation.set(-Math.PI / 2, 0, -Math.atan2(b.z - a.z, b.x - a.x));
    m.position.set(((a.x + b.x) / 2) * UNIT, top * UNIT, ((a.z + b.z) / 2) * UNIT);
  }

  // Крошки из-под ножа там, где кусок только что отделился (координаты доски, u).
  _spawnCrumbsAt(it, x, z, n) {
    const col = new THREE.Color(PRODUCTS[it.product].color).lerp(new THREE.Color(0xffffff), 0.25);
    for (let i = 0; i < Math.min(6, 2 + n * 2); i++) {
      this.crumbs.push({
        p: new THREE.Vector3(x * UNIT, 0.8 * UNIT, z * UNIT),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.14, 0.1 + Math.random() * 0.1, (Math.random() - 0.5) * 0.14),
        s: (0.08 + Math.random() * 0.1) * UNIT,
        r: Math.random() * 6,
        life: 3 + Math.random(),
        col,
      });
    }
    if (this.crumbs.length > 96) this.crumbs.splice(0, this.crumbs.length - 96);
  }

  _spawnCrumbs(it, line) {
    const col = new THREE.Color(it.log ? PRODUCTS[it.product].color : PRODUCTS[it.product].color).lerp(new THREE.Color(0xffffff), 0.25);
    const lo = Math.min(line.from, line.to), hi = Math.max(line.from, line.to);
    for (let i = 0; i < 9; i++) {
      const along = lo + Math.random() * (hi - lo);
      const x = line.axis === 'x' ? line.pos : along;
      const z = line.axis === 'x' ? along : line.pos;
      const sgn = Math.random() < 0.5 ? -1 : 1;
      this.crumbs.push({
        p: new THREE.Vector3(x * UNIT, 0.6 * UNIT, z * UNIT),
        v: new THREE.Vector3(line.axis === 'x' ? sgn * (0.05 + Math.random() * 0.08) : (Math.random() - 0.5) * 0.06, 0.12 + Math.random() * 0.1, line.axis === 'z' ? sgn * (0.05 + Math.random() * 0.08) : (Math.random() - 0.5) * 0.06),
        s: (0.05 + Math.random() * 0.07) * UNIT,
        r: Math.random() * 6,
        life: 3.5 + Math.random(),
        col,
      });
    }
    if (this.crumbs.length > 96) this.crumbs.splice(0, this.crumbs.length - 96);
  }

  _updateCrumbs(dt) {
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let n = 0;
    for (const c of this.crumbs) {
      c.life -= dt;
      const sh = c.sh ?? [1, 1, 1];
      const hy = (c.s * sh[1]) / 2;
      if (c.p.y > hy) {
        c.v.y -= 1.6 * dt;
        c.p.addScaledVector(c.v, dt);
        c.r += dt * 8;
        if (c.p.y < hy) {
          c.p.y = hy;
          c.v.set(0, 0, 0);
          c.landed = true;
        }
      }
      const k = Math.max(0, Math.min(1, c.life / 0.6));
      // плоские очистки ложатся на доску, кубики-крошки остаются как упали
      q.setFromEuler(c.landed && c.sh ? new THREE.Euler(0, c.r, 0) : new THREE.Euler(c.r, c.r * 0.7, 0));
      sc.set(c.s * k * sh[0], c.s * k * sh[1], c.s * k * sh[2]);
      mtx.compose(c.p, q, sc);
      this.crumbMesh.setMatrixAt(n, mtx);
      this.crumbMesh.setColorAt(n, c.col);
      n++;
    }
    this.crumbs = this.crumbs.filter((c) => c.life > 0);
    this.crumbMesh.count = n;
    this.crumbMesh.instanceMatrix.needsUpdate = true;
    if (this.crumbMesh.instanceColor) this.crumbMesh.instanceColor.needsUpdate = true;
  }
}

/** Следующий разумный разрез: сначала полоски сверху вниз, потом поперёк. */
export function suggestCut(pieces) {
  const wideX = pieces.filter((p) => p.w > 1.3).sort((a, b) => a.x - b.x)[0];
  if (wideX) {
    const pos = wideX.x + 1;
    const under = pieces.filter((p) => pos > p.x && pos < p.x + p.w);
    const b = bounds(under);
    return { axis: 'x', pos, from: b.minZ - 0.5, to: b.maxZ + 0.5 };
  }
  const wideZ = pieces.filter((p) => p.d > 1.3).sort((a, b) => a.z - b.z)[0];
  if (wideZ) {
    const pos = wideZ.z + 1;
    const under = pieces.filter((p) => pos > p.z && pos < p.z + p.d);
    const b = bounds(under);
    return { axis: 'z', pos, from: b.minX - 0.5, to: b.maxX + 0.5 };
  }
  return null;
}
