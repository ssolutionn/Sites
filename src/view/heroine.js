// Героиня из примитивов: каштановые кудри, красная повязка со снежинками,
// красно-белый свитер, красный фартук с белой «5». Стиль — мультяшный, мягкие формы.
import * as THREE from 'three';
import { tex, toon } from './textures.js';

const SKIN = 0xf3c29b;
const HAIR = 0x6e3a1f;
const HAIR_LIGHT = 0x8a4b27;

function sphere(r, mat, ws = 20, hs = 14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.castShadow = true;
  return m;
}

function limb(rTop, rBottom, len, mat) {
  // Цилиндр, подвешенный за верхний конец (поворот вокруг плеча/бедра).
  const g = new THREE.CylinderGeometry(rTop, rBottom, len, 14);
  g.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

export function buildHeroine() {
  const root = new THREE.Group();
  root.name = 'heroine';
  const body = new THREE.Group(); // для покачивания
  root.add(body);

  const skin = toon(SKIN);
  const sweater = toon(0xffffff, { map: tex.sweater });
  const red = toon(0xd7262b);
  const dark = toon(0x2b2b3a);
  const hairMat = toon(HAIR);
  const hairLight = toon(HAIR_LIGHT);
  const white = toon(0xffffff);

  // --- ноги ---
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.075 * s, 0.68, 0);
    const leg = limb(0.055, 0.045, 0.6, dark);
    hip.add(leg);
    const shoe = sphere(0.065, red);
    shoe.scale.set(1, 0.6, 1.5);
    shoe.position.set(0, -0.62, 0.03);
    hip.add(shoe);
    body.add(hip);
    legs.push(hip);
  }

  // --- туловище ---
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.55, 22), sweater);
  torso.position.y = 0.95;
  torso.castShadow = true;
  body.add(torso);
  const shoulders = sphere(0.165, sweater);
  shoulders.scale.set(1.05, 0.55, 0.85);
  shoulders.position.y = 1.2;
  body.add(shoulders);
  // юбка-фартук
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.32, 22), red);
  skirt.position.y = 0.6;
  skirt.castShadow = true;
  body.add(skirt);
  // фартук спереди (часть цилиндра) с логотипом
  const apronGeo = new THREE.CylinderGeometry(0.168, 0.24, 0.72, 24, 1, true, -Math.PI * 0.36, Math.PI * 0.72);
  const apron = new THREE.Mesh(apronGeo, toon(0xffffff, { map: tex.apron, side: THREE.DoubleSide }));
  apron.position.set(0, 0.84, 0.012);
  body.add(apron);
  // завязки
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.012, 6, 30), red);
  tie.rotation.x = Math.PI / 2;
  tie.position.y = 0.86;
  body.add(tie);
  const bow = sphere(0.04, red);
  bow.scale.set(1.6, 0.8, 0.6);
  bow.position.set(0, 0.86, -0.21);
  body.add(bow);

  // --- руки ---
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.19 * s, 1.18, 0);
    shoulder.rotation.z = 0.12 * s;
    const upper = limb(0.055, 0.05, 0.27, sweater);
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.27;
    shoulder.add(elbow);
    const fore = limb(0.05, 0.045, 0.24, sweater);
    elbow.add(fore);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 14), red);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.y = -0.22;
    elbow.add(cuff);
    const hand = sphere(0.05, skin);
    hand.position.y = -0.27;
    elbow.add(hand);
    body.add(shoulder);
    arms.push({ shoulder, elbow, hand });
  }

  // нож в правой руке (виден при нарезке)
  const knife = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.09, 0.03), toon(0x3a2a20));
  handle.position.y = -0.03;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.16, 0.045), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.8, roughness: 0.25 }));
  blade.position.y = -0.14;
  knife.add(handle, blade);
  knife.position.y = -0.27;
  knife.rotation.x = -1.2;
  knife.visible = false;
  arms[1].elbow.add(knife);

  // телефон в левой руке
  const phoneProp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.012), toon(0x222233));
  phoneProp.position.set(0, -0.3, 0.03);
  phoneProp.visible = false;
  arms[0].elbow.add(phoneProp);

  // --- голова ---
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skin);
  neck.position.y = 1.27;
  body.add(neck);
  const head = new THREE.Group();
  head.position.y = 1.47;
  body.add(head);
  const skull = sphere(0.175, skin, 28, 20);
  skull.scale.set(1, 1.02, 0.95);
  head.add(skull);

  // глаза
  const eyes = [];
  for (const s of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(0.065 * s, 0.0, 0.145);
    const ball = sphere(0.042, white, 16, 12);
    ball.scale.set(0.9, 1.15, 0.5);
    const iris = sphere(0.026, toon(0x5a3214), 14, 10);
    iris.scale.set(1, 1.15, 0.5);
    iris.position.set(0.004 * s, -0.004, 0.017);
    const pupil = sphere(0.014, toon(0x111111), 10, 8);
    pupil.scale.set(1, 1.1, 0.5);
    pupil.position.set(0.004 * s, -0.004, 0.026);
    const glint = sphere(0.007, white, 8, 6);
    glint.position.set(0.012 * s, 0.01, 0.031);
    eye.add(ball, iris, pupil, glint);
    head.add(eye);
    eyes.push(eye);
    // ресницы
    const lash = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.01), toon(0x1a1010));
    lash.position.set(0.068 * s, 0.045, 0.165);
    lash.rotation.z = -0.25 * s;
    head.add(lash);
  }
  const brows = [];
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.008, 0.045, 4, 8), toon(0x4a2414));
    brow.rotation.z = Math.PI / 2;
    brow.position.set(0.066 * s, 0.075, 0.158);
    head.add(brow);
    brows.push({ mesh: brow, side: s });
  }
  const nose = sphere(0.018, toon(0xeaae88), 10, 8);
  nose.position.set(0, -0.035, 0.172);
  head.add(nose);
  for (const s of [-1, 1]) {
    const cheek = sphere(0.025, toon(0xf3958c), 10, 8);
    cheek.scale.set(1.2, 0.7, 0.3);
    cheek.position.set(0.1 * s, -0.045, 0.135);
    head.add(cheek);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 16, Math.PI), toon(0xb3333b));
  mouth.position.set(0, -0.085, 0.158);
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  for (const s of [-1, 1]) {
    const ear = sphere(0.03, skin, 10, 8);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(0.172 * s, -0.01, 0);
    head.add(ear);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 6, 16), new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.9, roughness: 0.3 }));
    ring.position.set(0.176 * s, -0.06, 0.005);
    ring.rotation.y = Math.PI / 2;
    head.add(ring);
  }

  // волосы: основа + много кудряшек
  const hairBase = sphere(0.19, hairMat, 24, 18);
  hairBase.scale.set(1.05, 1.0, 1.0);
  hairBase.position.set(0, 0.04, -0.035);
  head.add(hairBase);
  const curls = new THREE.Group();
  head.add(curls);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // пышная копна сверху
  for (let i = 0; i < 38; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.06 + rnd() * 0.09;
    const c = sphere(0.045 + rnd() * 0.035, rnd() > 0.5 ? hairMat : hairLight, 10, 8);
    c.position.set(Math.cos(a) * r, 0.2 + rnd() * 0.1, Math.sin(a) * r - 0.04);
    curls.add(c);
  }
  // кудри по бокам и сзади
  for (let i = 0; i < 46; i++) {
    const a = Math.PI * 0.1 + rnd() * Math.PI * 0.8; // задняя полусфера
    const side = rnd() > 0.5 ? 1 : -1;
    const y = -0.12 + rnd() * 0.24;
    const rr = 0.17 + rnd() * 0.03;
    const c = sphere(0.04 + rnd() * 0.025, rnd() > 0.4 ? hairMat : hairLight, 10, 8);
    c.position.set(Math.cos(a) * rr * side, y, -Math.sin(a) * rr * 0.9 + 0.02);
    curls.add(c);
  }
  // локоны у лица
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const lock = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.011, 6, 12), hairMat);
      lock.position.set(0.15 * s, -0.06 - k * 0.04, 0.09 - k * 0.015);
      lock.rotation.y = Math.PI / 2;
      head.add(lock);
    }
  }
  // чёлка-кудряшки
  for (let i = 0; i < 6; i++) {
    const c = sphere(0.035, hairMat, 10, 8);
    c.position.set(-0.11 + i * 0.045, 0.13 + Math.sin(i) * 0.01, 0.11);
    head.add(c);
  }

  // повязка со снежинками
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.193, 0.197, 0.06, 32, 1, true), toon(0xffffff, { map: tex.headband, side: THREE.DoubleSide }));
  band.position.set(0, 0.1, -0.01);
  band.rotation.x = -0.32;
  head.add(band);
  const knot = new THREE.Group();
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10), toon(0xd7262b));
    wing.rotation.z = (Math.PI / 2) * s;
    wing.position.x = -0.05 * s;
    knot.add(wing);
  }
  knot.add(sphere(0.025, toon(0xb71c1c)));
  knot.position.set(0.11, 0.21, 0.04);
  knot.rotation.set(0.3, 0, 0.5);
  head.add(knot);

  const mouthO = sphere(0.02, toon(0x8e2430), 10, 8);
  mouthO.scale.set(1, 1.2, 0.4);
  mouthO.position.set(0, -0.088, 0.16);
  mouthO.visible = false;
  head.add(mouthO);

  root.userData = { body, legs, arms, head, eyes, brows, mouth, mouthO, knife, phoneProp };
  return root;
}

// Позы: на основе игрового состояния, время — только игровое/анимационное.
export function animateHeroine(h, pose, time, progress = 0) {
  const { body, legs, arms, head, brows, mouth, knife, phoneProp } = h.userData;
  const [L, R] = arms;
  // базовые значения
  let legSwing = 0;
  let bob = Math.sin(time * 2.2) * 0.006;
  let la = { x: 0, z: -0.12, ex: -0.15 };
  let ra = { x: 0, z: 0.12, ex: -0.15 };
  let headTilt = Math.sin(time * 1.3) * 0.03;
  knife.visible = false;
  phoneProp.visible = false;

  switch (pose) {
    case 'walk': {
      const ph = time * 11;
      legSwing = Math.sin(ph) * 0.55;
      bob = Math.abs(Math.cos(ph)) * 0.03;
      la.x = -Math.sin(ph) * 0.5;
      ra.x = Math.sin(ph) * 0.5;
      break;
    }
    case 'cut': {
      // правая рука с ножом над доской, удар по прогрессу ножа
      const chop = progress > 0 ? Math.sin(Math.min(progress, 1) * Math.PI) : 0;
      ra = { x: -0.9 + chop * 0.35, z: 0.05, ex: -0.9 - chop * 0.2 };
      la = { x: -1.0, z: -0.25, ex: -0.6 };
      knife.visible = true;
      headTilt = 0.35;
      break;
    }
    case 'work': {
      const w = Math.sin(time * 9) * 0.12;
      la = { x: -1.0 + w, z: -0.2, ex: -0.5 };
      ra = { x: -1.0 - w, z: 0.2, ex: -0.5 };
      headTilt = 0.3;
      break;
    }
    case 'mix': {
      const a = time * 9;
      ra = { x: -1.1 + Math.sin(a) * 0.15, z: 0.15 + Math.cos(a) * 0.15, ex: -0.7 };
      la = { x: -0.8, z: -0.35, ex: -0.9 };
      headTilt = 0.3;
      break;
    }
    case 'reach': {
      // гирлянда: руки вверх
      const w = Math.sin(time * 14) * 0.08;
      la = { x: -2.6 + w, z: -0.1, ex: -0.3 };
      ra = { x: -2.6 - w, z: 0.1, ex: -0.3 };
      headTilt = -0.35;
      break;
    }
    case 'phone': {
      la = { x: -1.3, z: 0.25, ex: -1.6 };
      phoneProp.visible = true;
      headTilt = 0.25;
      break;
    }
    case 'shoo': {
      const w = Math.sin(time * 22) * 0.4;
      la = { x: -2.3, z: -0.4 + w, ex: -0.4 };
      ra = { x: -2.3, z: 0.4 - w, ex: -0.4 };
      bob = Math.abs(Math.sin(time * 14)) * 0.04;
      break;
    }
    case 'menu': {
      la = { x: -0.3, z: -0.35, ex: -1.4 };
      ra = { x: -0.5, z: 0.3, ex: -1.2 };
      headTilt = Math.sin(time * 1.5) * 0.06;
      break;
    }
    default:
  }

  body.position.y = bob;
  legs[0].rotation.x = legSwing;
  legs[1].rotation.x = -legSwing;
  L.shoulder.rotation.x = la.x;
  L.shoulder.rotation.z = la.z;
  L.elbow.rotation.x = la.ex;
  R.shoulder.rotation.x = ra.x;
  R.shoulder.rotation.z = ra.z;
  R.elbow.rotation.x = ra.ex;
  head.rotation.x = headTilt;
}

// Выражение лица: worried — брови домиком, рот «о».
export function setExpression(h, worried) {
  const { brows, mouth, mouthO } = h.userData;
  for (const b of brows) b.mesh.rotation.z = Math.PI / 2 + (worried ? -0.35 * b.side : 0.08 * b.side);
  mouth.visible = !worried;
  mouthO.visible = worried;
}
