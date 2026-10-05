// Рыжий кот: узнаваемая морда, полоски, пушистый хвост.
import * as THREE from 'three';
import { tex, toon } from './textures.js';

function sphere(r, mat, ws = 16, hs = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);
  m.castShadow = true;
  return m;
}

export function buildCat() {
  const root = new THREE.Group();
  root.name = 'cat';
  const fur = toon(0xffffff, { map: tex.catFur });
  const orange = toon(0xf0923a);
  const cream = toon(0xfff1dc);
  const pink = toon(0xf48fa0);

  const body = new THREE.Group();
  root.add(body);
  const torso = sphere(0.13, fur, 20, 14);
  torso.scale.set(0.95, 0.85, 1.55);
  torso.position.set(0, 0.2, 0);
  body.add(torso);
  const belly = sphere(0.1, cream);
  belly.scale.set(0.9, 0.7, 1.3);
  belly.position.set(0, 0.15, 0.03);
  body.add(belly);

  // голова
  const head = new THREE.Group();
  head.position.set(0, 0.32, 0.2);
  body.add(head);
  const skull = sphere(0.11, orange, 20, 16);
  skull.scale.set(1.12, 0.95, 0.95);
  head.add(skull);
  const muzzle = sphere(0.055, cream);
  muzzle.scale.set(1.3, 0.8, 0.8);
  muzzle.position.set(0, -0.035, 0.085);
  head.add(muzzle);
  const nose = sphere(0.014, pink, 8, 6);
  nose.position.set(0, -0.01, 0.13);
  head.add(nose);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), orange);
    ear.position.set(0.065 * s, 0.1, -0.005);
    ear.rotation.z = -0.35 * s;
    ear.castShadow = true;
    head.add(ear);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 4), pink);
    inner.position.set(0.064 * s, 0.095, 0.012);
    inner.rotation.z = -0.35 * s;
    head.add(inner);
    const eye = sphere(0.026, toon(0xb7e36b), 12, 10);
    eye.scale.set(1, 1.1, 0.6);
    eye.position.set(0.045 * s, 0.025, 0.088);
    head.add(eye);
    const pupil = sphere(0.012, toon(0x111111), 8, 6);
    pupil.scale.set(0.6, 1.4, 0.5);
    pupil.position.set(0.045 * s, 0.025, 0.103);
    head.add(pupil);
    const glint = sphere(0.005, toon(0xffffff), 6, 4);
    glint.position.set(0.05 * s, 0.035, 0.108);
    head.add(glint);
    for (let k = 0; k < 2; k++) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.09, 4), toon(0xffffff));
      wh.rotation.z = Math.PI / 2 + (k ? 0.15 : -0.1) * s;
      wh.position.set(0.075 * s, -0.035 - k * 0.012, 0.11);
      head.add(wh);
    }
  }

  // лапы
  const legs = [];
  for (const [x, z] of [[-0.07, 0.12], [0.07, 0.12], [-0.07, -0.12], [0.07, -0.12]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.17, z);
    const g = new THREE.CylinderGeometry(0.028, 0.025, 0.16, 8);
    g.translate(0, -0.08, 0);
    const leg = new THREE.Mesh(g, orange);
    leg.castShadow = true;
    hip.add(leg);
    const paw = sphere(0.03, cream, 8, 6);
    paw.scale.set(1, 0.6, 1.2);
    paw.position.y = -0.16;
    hip.add(paw);
    body.add(hip);
    legs.push(hip);
  }

  // хвост
  const tailPts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    tailPts.push(new THREE.Vector3(Math.sin(t * 2.2) * 0.06, 0.2 + t * 0.3, -0.18 - t * 0.12 + t * t * 0.12));
  }
  const tailCurve = new THREE.CatmullRomCurve3(tailPts);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 20, 0.03, 8), fur);
  tail.castShadow = true;
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, 0);
  tailPivot.add(tail);
  body.add(tailPivot);

  // украденный кусочек колбасы
  const loot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.04), toon(0xffffff, { map: tex.sausage }));
  loot.position.set(0, -0.07, 0.12);
  loot.visible = false;
  head.add(loot);

  root.userData = { body, head, legs, tailPivot, loot };
  root.scale.setScalar(1.1);
  return root;
}

export function animateCat(cat, mode, time, speed = 0) {
  const { body, head, legs, tailPivot } = cat.userData;
  const ph = time * 14;
  const walking = speed > 0.01;
  legs.forEach((l, i) => (l.rotation.x = walking ? Math.sin(ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.7 : 0));
  tailPivot.rotation.z = Math.sin(time * 4) * 0.25;
  body.rotation.x = 0;
  body.position.y = walking ? Math.abs(Math.sin(ph)) * 0.015 : 0;
  head.rotation.x = 0;
  if (mode === 'reach') {
    // встаёт и тянет лапу
    body.rotation.x = -0.55;
    body.position.y = 0.06;
    legs[0].rotation.x = -1.6 + Math.sin(time * 9) * 0.35;
    legs[1].rotation.x = -0.4;
    head.rotation.x = 0.45;
  }
  if (mode === 'sit') {
    body.rotation.x = -0.35;
    legs[2].rotation.x = -0.9;
    legs[3].rotation.x = -0.9;
    head.rotation.x = 0.25 + Math.sin(time * 1.4) * 0.05;
  }
}
