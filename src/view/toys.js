// Ёлочные игрушки (0.9): модели по TOYS[id].shape. Начало координат — точка подвеса (ниточка вверх), игрушка висит ниже.
import * as THREE from 'three';
import { TOYS } from '../campaign/data.js';

const mat = (color, { metal = 0.35, rough = 0.3, emissive = 0 } = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive: color, emissiveIntensity: emissive });

function cap(g, y) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 10), mat(0xd9c27a, { metal: 0.8, rough: 0.25 }));
  c.position.y = y;
  g.add(c);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.005, 0.0012, 6, 12), c.material);
  loop.position.y = y + 0.009;
  g.add(loop);
}

const SHAPES = {
  ball(g, c) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 14), mat(c, { emissive: 0.12 }));
    b.position.y = -0.05;
    g.add(b);
    // блик-полоска, чтобы шар читался как стеклянный
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0035, 6, 24), mat(0xffffff, { metal: 0.6 }));
    band.rotation.x = Math.PI / 2;
    band.position.y = -0.05;
    g.add(band);
    cap(g, -0.012);
  },
  icicle(g, c) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.11, 10), new THREE.MeshStandardMaterial({ color: c, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.85, emissive: 0x88c8ff, emissiveIntensity: 0.25 }));
    m.rotation.x = Math.PI;
    m.position.y = -0.068;
    g.add(m);
    cap(g, -0.008);
  },
  cone(g, c) {
    const m = mat(c, { metal: 0.1, rough: 0.7 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.022 - i * 0.004, 0.026, 8), m);
      s.rotation.x = Math.PI;
      s.position.y = -0.03 - i * 0.014;
      g.add(s);
    }
    cap(g, -0.012);
  },
  flake(g, c) {
    const m = mat(c, { metal: 0.5, rough: 0.2, emissive: 0.35 });
    for (let k = 0; k < 3; k++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.004), m);
      arm.rotation.z = (k * Math.PI) / 3;
      arm.position.y = -0.05;
      g.add(arm);
    }
    cap(g, -0.008);
  },
  bell(g, c) {
    const pts = [[0, 0], [0.012, -0.002], [0.016, -0.02], [0.022, -0.04], [0.032, -0.05], [0, -0.05]].map(([x, y]) => new THREE.Vector2(x, y));
    const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), mat(c, { metal: 0.85, rough: 0.2 }));
    b.position.y = -0.012;
    g.add(b);
    const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), mat(0x7a5a20));
    tongue.position.y = -0.064;
    g.add(tongue);
    cap(g, -0.008);
  },
  bird(g, c) {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), mat(c, { metal: 0.3, rough: 0.35 }));
    body.scale.set(1.5, 1, 1);
    body.position.y = -0.03;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), body.material);
    head.position.set(0.03, -0.018, 0);
    g.add(head);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.04, 6), mat(0xffe08a, { metal: 0.6 }));
    tail.rotation.z = -Math.PI / 2 - 0.4;
    tail.position.set(-0.045, -0.02, 0);
    g.add(tail);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.004, 0.012, 6), mat(0xffc400));
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.046, -0.018, 0);
    g.add(beak);
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.008), mat(0xd9c27a, { metal: 0.8 }));
    clip.position.y = -0.008;
    g.add(clip);
  },
  figure(g, c) {
    const coat = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.06, 14), mat(c, { metal: 0.2, rough: 0.4, emissive: 0.08 }));
    coat.position.y = -0.06;
    g.add(coat);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 10), mat(0xf6d2b8, { metal: 0, rough: 0.6 }));
    face.position.y = -0.024;
    g.add(face);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.02, 12), coat.material);
    hat.position.y = -0.006;
    g.add(hat);
    const trim = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.004, 6, 16), mat(0xffffff, { metal: 0, rough: 0.8 }));
    trim.rotation.x = Math.PI / 2;
    trim.position.y = -0.088;
    g.add(trim);
    cap(g, 0.006);
  },
};

/** Модель игрушки id (группа; ниточка вверх от начала координат). */
export function toyModel(id) {
  const t = TOYS[id];
  const g = new THREE.Group();
  (SHAPES[t?.shape] ?? SHAPES.ball)(g, t?.color ?? 0xd7262b);
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.02, 4), new THREE.MeshBasicMaterial({ color: 0xd9c27a }));
  thread.position.y = 0.012;
  g.add(thread);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

/** Полупрозрачная «примерка» игрушки в руке над свободной веткой. */
export function ghostify(g) {
  g.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.55;
    o.castShadow = false;
  });
  return g;
}
