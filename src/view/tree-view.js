// Ёлка в сцене кампании (0.11): игрушки в любой точке, мишура, призрак под мышью, падение и подъём ёлки, игрушки на полу.
// Только читает KitchenSession (session.toys, .tinsel, .treeFall); состояние не меняет. Выбор мышью — лучом в координатах ёлки (tree-geo.js).
import * as THREE from 'three';
import { toyModel, ghostify } from './toys.js';
import { TinselView } from './tinsel.js';
import { TOYS, TINSEL } from '../campaign/data.js';
import { TREE } from '../campaign/layout.js';
import { rayHitTree, normalAt, hookPos, liftZone } from '../campaign/tree-geo.js';

export const TOY_SCALE = 2.3; // игрушки на ёлке крупнее «натуральных»: в крупном плане ёлка целиком, мелочь теряется
const DEG = Math.PI / 180;
// Куда падает ёлка: от +z к +x (вбок от камеры — лежащая ёлка читается, а не смотрит в объектив); основание съезжает вперёд,
// чтобы ёлка легла на свободный пол, а не в тумбу.
const FALL_AZ = 70 * DEG;
export const FALL_DIR = new THREE.Vector3(Math.sin(FALL_AZ), 0, Math.cos(FALL_AZ));
const FALL_AXIS = new THREE.Vector3(FALL_DIR.z, 0, -FALL_DIR.x); // вверх × направление падения: поворот на +угол кладёт ёлку к FALL_DIR
const FALL_SLIDE = new THREE.Vector3(0.15, 0, 0.7);
const FALL_G = 560; // °/с²: с вертикали до 75° — ~0,5 с
const GRAVITY = 9.8;
const ROLL_R = 0.08; // «радиус» игрушки на полу для раската, м
const RED = new THREE.Color(0xff5a4a);

// Модель игрушки ушла насовсем (новый день, разбилась, заменена): у каждой игрушки свои геометрии и материалы (toys.js) —
// освобождаем их, иначе за неделю на видеокарте копятся сотни мешей. Переезд с ёлки на пол сюда не относится.
function dropToy(m) {
  if (!m) return;
  m.removeFromParent();
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    o.material?.dispose?.();
  });
}

// Луч попал в видимый объект: Raycaster сам видимость не проверяет
const shown = (o) => {
  for (let q = o; q; q = q.parent) if (q.visible === false) return false;
  return true;
};

export class TreeView {
  /** @param view CampaignView: нужны sv (камера, луч), root, particles и k.tree */
  constructor(view) {
    this.view = view;
    this.sv = view.sv;
    this.root = view.root;
    this.g = view.k.tree.group;
    this.base = this.g.position.clone();
    this.meshes = new Map(); // uid → группа игрушки
    this.anim = new Map(); // uid → { kind: 'ride' | 'hop' | 'fly', … }
    this.floor = new Map(); // uid → где игрушка лежит на полу (мир)
    this.dying = new Map(); // uid → группа разбитой игрушки: едет с ёлкой до удара
    this.swing = new Map(); // uid → время повеса (затухающий маятник)
    this.tinsel = new TinselView(this.g);
    this.pointer = null; // ndc мыши, пока она над крупным планом ёлки (ставит main.js)
    this.hover = null; // { p, n } — точка на ёлке под мышью
    this.hoverToy = null;
    this.hoverFloor = null;
    this.hoverThread = null;
    this.ang = 0; // показанный наклон, °
    this.vel = 0;
    this.falling = false;
    this.bounceT = null;
    this.ghost = null;
    this.pen = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false }));
    this.pen.renderOrder = 7;
    this.pen.visible = false;
    this.g.add(this.pen);
    this.target = new THREE.Vector3();
  }

  reset() {
    for (const m of this.meshes.values()) dropToy(m);
    for (const m of this.dying.values()) dropToy(m);
    dropToy(this.ghost);
    this.ghost = null;
    this.meshes.clear();
    this.dying.clear();
    this.anim.clear();
    this.floor.clear();
    this.swing.clear();
    this.tinsel.clear();
    this.ang = this.vel = 0;
    this.falling = false;
    this.bounceT = null;
    this._applyPose(0, 0);
    this.hover = this.hoverToy = this.hoverFloor = this.hoverThread = null;
  }

  // ---------- мышь ----------
  _local(ndc) {
    const rc = this.sv._ray(ndc);
    this.g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.g.matrixWorld).invert();
    const o = rc.ray.origin.clone().applyMatrix4(inv);
    const d = rc.ray.direction.clone().transformDirection(inv);
    return { rc, o, d };
  }

  /** Точка на поверхности ёлки под мышью (координаты ёлки): { p, n } или null — мимо. Лежащая ёлка точек не даёт. */
  hit(ndc) {
    if (!ndc || this.ang > 1) return null;
    const { o, d } = this._local(ndc);
    const h = rayHitTree(o, d);
    return h ? { p: h.p, n: h.n } : null;
  }

  _meshAt(ndc, list) {
    if (!ndc || !list.length) return null;
    const rc = this.sv._ray(ndc);
    this.g.updateMatrixWorld(true);
    let best = null, bd = Infinity;
    for (const m of list) {
      const h = rc.intersectObject(m, true).find((q) => shown(q.object));
      if (h && h.distance < bd) [best, bd] = [m.userData.uid, h.distance];
    }
    return best;
  }

  /** Висящая игрушка под мышью (uid) или null. */
  toyAt(ndc) {
    const list = [];
    for (const [uid, m] of this.meshes) if (m.visible && m.parent === this.g && !this.anim.has(uid)) list.push(m);
    return this._meshAt(ndc, list);
  }

  /** Игрушка на полу под мышью (uid) или null. */
  floorToyAt(ndc) {
    const list = [];
    for (const [uid, m] of this.meshes) if (m.visible && m.parent === this.root && !this.anim.has(uid) && this.session?.toys.find((t) => t.uid === uid)?.fallen) list.push(m);
    return this._meshAt(ndc, list);
  }

  /** Нитка мишуры рядом с мышью (id) или null — для «ножниц»: расстояние на экране до ломаной, с запасом. */
  threadAt(ndc, maxDist = 0.04) {
    if (!ndc || !this.session) return null;
    const aspect = this.sv.camera.aspect || 16 / 9;
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    let best = null, bd = maxDist;
    this.g.updateMatrixWorld(true);
    const proj = (p, out) => out.set(p.x, p.y, p.z).applyMatrix4(this.g.matrixWorld).project(this.sv.camera);
    for (const th of this.session.tinsel.threads) {
      for (let i = 1; i < th.pts.length; i++) {
        proj(th.pts[i - 1], A);
        proj(th.pts[i], B);
        const ax = A.x * aspect, ay = A.y, bx = B.x * aspect, by = B.y, px = ndc.x * aspect, py = ndc.y;
        const dx = bx - ax, dy = by - ay;
        const k = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
        const d = Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
        if (d < bd) [best, bd] = [th.id, d];
      }
    }
    return best;
  }

  /** Упавшую ёлку зажали: { zone: 'trunk' | 'tip' | null, angle } — угол мыши вокруг основания (град от вертикали к стороне падения). */
  liftGrab(ndc) {
    if (!ndc) return null;
    const rc = this.sv._ray(ndc);
    this.g.updateMatrixWorld(true);
    const hits = rc.intersectObject(this.g, true).filter((h) => shown(h.object) && !this._isToy(h.object));
    const angle = this.liftAngle(ndc);
    if (!hits.length) return { zone: null, angle };
    const local = this.g.worldToLocal(hits[0].point.clone());
    return { zone: liftZone(local.y), angle };
  }

  _isToy(o) {
    for (let q = o; q; q = q.parent) if (q.userData?.uid != null) return true;
    return false;
  }

  /** Угол мыши вокруг основания ёлки в вертикальной плоскости падения: 0 — вертикаль, 90 — вдоль пола. null — луч параллелен плоскости. */
  liftAngle(ndc) {
    if (!ndc) return null;
    const rc = this.sv._ray(ndc);
    const pivot = this.g.position;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(FALL_AXIS, pivot);
    const pt = new THREE.Vector3();
    if (!rc.ray.intersectPlane(plane, pt)) return null;
    pt.sub(pivot);
    return Math.atan2(pt.dot(FALL_DIR), pt.y) / DEG;
  }

  /** Точка ёлки (координаты ёлки) на экране, пиксели — для проверок мышью. */
  pointScreen(p) {
    const v = new THREE.Vector3(p.x, p.y, p.z);
    this.g.updateMatrixWorld(true);
    this.g.localToWorld(v).project(this.sv.camera);
    const r = this.sv.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  /** Курсор над крупным планом ёлки: 'pointer' над игрушкой, ниткой, лежащей игрушкой; 'grab' над лежащей ёлкой. */
  cursor(s) {
    if (!s || s.panel !== 'tree' || s.gift) return null;
    if (s.treeFall.down) return this.hoverFloor != null ? 'pointer' : 'grab';
    const tool = s.tinsel.tool;
    if (tool === 'cut') return this.hoverThread != null ? 'pointer' : 'default';
    if (tool) return this.hover ? 'crosshair' : 'default';
    if (s.treeHand != null) return this.hover ? 'copy' : 'default';
    return this.hoverToy != null || this.hoverFloor != null ? 'pointer' : 'default';
  }

  // ---------- события ----------
  _world(local) {
    return this.g.localToWorld(new THREE.Vector3(local.x, local.y, local.z));
  }

  _hookWorld(at) {
    const hp = hookPos(at, this.session?.cfg.tree.hookOut ?? 0.08);
    return this._world(hp);
  }

  onEvent(e) {
    const P = this.view.particles;
    switch (e.type) {
      case 'toyHung': {
        this.swing.set(e.uid, null);
        if (!e.at) break;
        const at = this._hookWorld(e.at);
        P.emit(at, TOYS[e.id]?.color ?? 0xffffff, 8, { spread: 0.04, up: 0.35, life: 0.8, size: 0.01, gravity: 0.4 });
        P.emit(at, 0xffe08a, 8, { spread: 0.05, up: 0.5, life: 1, size: 0.008, gravity: -0.1 });
        break;
      }
      case 'toysKnocked': {
        // кот сбил: игрушка отскакивает от ветки наружу и падает на пол
        for (const it of e.items ?? []) {
          const m = this.meshes.get(it.uid);
          if (!m) continue;
          const w = this._hookWorld(it.from);
          const n = normalAt(it.from);
          const out = new THREE.Vector3(n.x, 0, n.z).transformDirection(this.g.matrixWorld).normalize();
          m.removeFromParent();
          this.root.add(m);
          m.position.copy(w);
          this.anim.set(it.uid, { kind: 'hop', p: w.clone(), v: new THREE.Vector3(out.x * 0.8, 1.1, out.z * 0.8), roll: new THREE.Vector3(2 + (it.uid % 3), 0, 3) });
        }
        break;
      }
      case 'treeFell': {
        // игрушки едут с ёлкой до удара об пол; разбитые — тоже, и рассыпаются осколками на ударе
        this.falling = true;
        this.vel = 0;
        this.bounceT = null;
        for (const it of e.fallen ?? []) this.anim.set(it.uid, { kind: 'ride', from: it.from });
        for (const it of e.broken ?? []) {
          const m = this.meshes.get(it.uid);
          if (!m) continue;
          this.meshes.delete(it.uid);
          this.dying.set(it.uid, m);
          m.userData.from = it.from;
        }
        break;
      }
      case 'toyPicked': {
        const m = this.meshes.get(e.uid);
        if (!m) break;
        // в коробку: взлетает по дуге к низу экрана (там док с коробкой), уменьшаясь
        const to = this.sv._ray({ x: 0, y: -0.78 }).ray.at(2.2, new THREE.Vector3());
        this.anim.set(e.uid, { kind: 'fly', from: m.position.clone(), to, t: 0 });
        break;
      }
      case 'treeUp':
        this.falling = false;
        P.emit(this._world({ x: 0, y: 1.0, z: 0 }), 0xffe08a, 16, { spread: 0.3, up: 0.8, life: 1.2, size: 0.012, gravity: 0.8 });
        break;
      default:
    }
  }

  // ---------- кадр ----------
  /** Каждый кадр: поза ёлки, игрушки, мишура, призрак и подсветка под мышью. */
  sync(s, dt, t) {
    this.session = s;
    this._pose(s, dt, t);
    this._hover(s);
    this._toys(s, dt, t);
    this.tinsel.sync(s.tinsel.threads, s.tinsel.tool === 'cut' ? this.hoverThread : null);
    this._ghost(s, t);
  }

  _applyPose(angDeg, wobble) {
    const k = Math.max(0, Math.min(1, angDeg / 75));
    this.g.position.copy(this.base).addScaledVector(FALL_SLIDE, k);
    this.g.quaternion.setFromAxisAngle(FALL_AXIS, angDeg * DEG + wobble);
  }

  _pose(s, dt, t) {
    const f = s.treeFall;
    const tgt = f.down ? f.tilt : 0;
    let wob = 0;
    if (this.falling && this.ang < tgt) {
      this.vel += FALL_G * dt;
      this.ang += this.vel * dt;
      if (this.ang >= tgt) {
        this.ang = tgt;
        this.falling = false;
        this.bounceT = 0;
        this._impact(s);
      }
    } else if (!this.falling) {
      this.ang += (tgt - this.ang) * Math.min(1, dt * (f.grab ? 16 : 7));
      if (Math.abs(tgt - this.ang) < 0.02) this.ang = tgt;
    }
    if (this.bounceT != null) {
      this.bounceT += dt;
      wob = -Math.exp(-5 * this.bounceT) * Math.sin(this.bounceT * 20) * 0.05;
      if (this.bounceT > 1.2) this.bounceT = null;
    }
    // кот лезет на ёлку: качается (звезда, игрушки), а перед падением раскачивает всё сильнее и кренится в сторону падения
    const c = s.cat;
    if (c.state === 'mischief' && !f.down) {
      if (c.kind === 'tree') {
        const prog = Math.max(0, Math.min(1, (s.t - c.startedAt) / Math.max(1, c.deadline - c.startedAt)));
        wob = Math.sin(t * 15) * (0.012 + 0.05 * prog) + prog * 0.07;
      } else if (c.kind === 'star' || c.kind === 'toys') wob = Math.sin(t * 17) * 0.035;
    }
    this._applyPose(this.ang, wob);
  }

  // Удар об пол: пыль, игрушки отцепляются от ёлки и катятся, разбитые — осколками.
  _impact(s) {
    const P = this.view.particles;
    this.g.updateMatrixWorld(true);
    P.emit(this._world({ x: 0.2, y: 0.05, z: 0.1 }), 0xd8c8a8, 18, { spread: 0.4, up: 0.5, life: 0.9, size: 0.03, gravity: -0.1 });
    for (const [uid, a] of [...this.anim]) {
      if (a.kind !== 'ride') continue;
      const m = this.meshes.get(uid);
      if (!m) {
        this.anim.delete(uid);
        continue;
      }
      const w = m.getWorldPosition(new THREE.Vector3());
      m.removeFromParent();
      this.root.add(m);
      m.position.copy(w);
      const k = uid * 2.399;
      this.anim.set(uid, { kind: 'hop', p: w.clone(), v: new THREE.Vector3(Math.sin(k) * 0.55 + FALL_DIR.x * 0.3, 0.5 + (uid % 3) * 0.12, Math.cos(k) * 0.55 + FALL_DIR.z * 0.3), roll: new THREE.Vector3(3, 0, 4) });
    }
    for (const [uid, m] of this.dying) {
      const w = m.getWorldPosition(new THREE.Vector3());
      const col = TOYS[m.userData.id]?.color ?? 0xffffff;
      P.emit(w, col, 16, { spread: 0.1, up: 1.2, life: 1, size: 0.008, gravity: 3.5 });
      P.emit(w, 0xffffff, 8, { spread: 0.08, up: 1.0, life: 0.8, size: 0.006, gravity: 3.5 });
      dropToy(m);
      this.dying.delete(uid);
    }
  }

  _hover(s) {
    const live = s.panel === 'tree' && !s.gift && this.pointer;
    this.hover = live ? this.hit(this.pointer) : null;
    this.hoverToy = live && !s.treeFall.down && s.treeHand == null && !s.tinsel.tool ? this.toyAt(this.pointer) : null;
    this.hoverFloor = live ? this.floorToyAt(this.pointer) : null;
    this.hoverThread = live && s.tinsel.tool === 'cut' ? this.threadAt(this.pointer) : null;
  }

  _toys(s, dt, t) {
    const live = new Set();
    const fallPos = (uid) => new THREE.Vector3(TREE.x + 0.62 + (uid % 3) * 0.13, 0.03, TREE.z + 0.55 + (uid % 2) * 0.12);
    for (const toy of s.toys) {
      live.add(toy.uid);
      let m = this.meshes.get(toy.uid);
      if (!m || m.userData.id !== toy.id) {
        dropToy(m);
        m = toyModel(toy.id);
        m.userData.id = toy.id;
        m.userData.uid = toy.uid;
        this.meshes.set(toy.uid, m);
        m.scale.setScalar(TOY_SCALE);
      }
      const a = this.anim.get(toy.uid);
      if (a?.kind === 'ride') {
        // едет с ёлкой: висит там же, где висела, пока ёлка не ударится об пол
        if (m.parent !== this.g) this.g.add(m);
        const hp = hookPos(a.from, s.cfg.tree.hookOut), n = normalAt(a.from);
        m.position.set(hp.x, hp.y, hp.z);
        m.rotation.set(0, Math.atan2(n.x, n.z), 0);
        m.visible = true;
        continue;
      }
      if (a?.kind === 'hop') {
        this._hop(m, a, toy.uid, dt);
        continue;
      }
      if (a?.kind === 'fly') {
        a.t += dt / 0.5;
        const k = Math.min(1, a.t);
        const e = k * k * (3 - 2 * k);
        if (m.parent !== this.root) this.root.add(m);
        m.position.lerpVectors(a.from, a.to, e);
        m.position.y += Math.sin(k * Math.PI) * 0.35;
        m.scale.setScalar(TOY_SCALE * (1 - 0.6 * e));
        m.rotation.set(Math.PI / 2 * (1 - e), 0, 0);
        m.visible = k < 1;
        if (k >= 1) {
          this.anim.delete(toy.uid);
          this.floor.delete(toy.uid);
        }
        continue;
      }
      if (toy.at) {
        if (m.parent !== this.g) this.g.add(m);
        const hp = hookPos(toy.at, s.cfg.tree.hookOut), n = normalAt(toy.at);
        m.position.set(hp.x, hp.y, hp.z);
        // только что повешенная качается и успокаивается (затухающий маятник ~2 с)
        let swing = 0;
        if (this.swing.has(toy.uid)) {
          if (this.swing.get(toy.uid) == null) this.swing.set(toy.uid, t);
          const dtS = t - this.swing.get(toy.uid);
          swing = 0.5 * Math.exp(-2.4 * dtS) * Math.sin(dtS * 11);
          if (dtS > 2.5) this.swing.delete(toy.uid);
        }
        m.rotation.set(0, Math.atan2(n.x, n.z), Math.sin(t * 1.3 + toy.uid) * 0.08 + swing);
        const hot = this.hoverToy === toy.uid;
        m.scale.setScalar(TOY_SCALE * (hot ? 1.18 : 1));
        m.visible = true;
      } else if (toy.fallen) {
        // на полу: лежит на боку там, где остановилась; без полёта (загрузка, тест) — у ёлки
        if (m.parent !== this.root) this.root.add(m);
        let p = this.floor.get(toy.uid);
        if (!p) this.floor.set(toy.uid, (p = fallPos(toy.uid)));
        m.position.copy(p);
        m.rotation.set(Math.PI / 2, 0, toy.uid);
        const hot = this.hoverFloor === toy.uid;
        m.scale.setScalar(TOY_SCALE * (hot ? 1.2 : 1));
        m.visible = true;
      } else {
        if (m.parent !== this.g) this.g.add(m);
        m.visible = false;
      }
    }
    // игрушки, которых в игре уже нет (разбиты; новая игра)
    for (const [uid, m] of this.meshes)
      if (!live.has(uid)) {
        dropToy(m);
        this.meshes.delete(uid);
        this.anim.delete(uid);
        this.floor.delete(uid);
      }
    // разбитые едут с ёлкой до удара
    for (const m of this.dying.values()) {
      if (m.parent !== this.g) this.g.add(m);
      const from = m.userData.from, hp = hookPos(from, s.cfg.tree.hookOut), n = normalAt(from);
      m.position.set(hp.x, hp.y, hp.z);
      m.rotation.set(0, Math.atan2(n.x, n.z), 0);
      m.visible = true;
    }
  }

  // Полёт игрушки на пол: падает, пару раз подпрыгивает и катится, пока не остановится.
  _hop(m, a, uid, dt) {
    a.v.y -= GRAVITY * dt;
    a.p.addScaledVector(a.v, dt);
    if (a.p.y <= 0.035) {
      a.p.y = 0.035;
      if (Math.abs(a.v.y) > 0.9) {
        a.v.y = -a.v.y * 0.35;
        a.v.x *= 0.7;
        a.v.z *= 0.7;
        this.view.particles.emit(a.p.clone(), 0xffffff, 3, { spread: 0.03, up: 0.2, life: 0.4, size: 0.006, gravity: 1 });
      } else {
        a.v.y = 0;
        a.v.x *= Math.max(0, 1 - 4 * dt);
        a.v.z *= Math.max(0, 1 - 4 * dt);
      }
    }
    if (m.parent !== this.root) this.root.add(m);
    m.position.copy(a.p);
    const sp = Math.hypot(a.v.x, a.v.z);
    m.rotation.x = Math.PI / 2;
    m.rotation.z += (sp / ROLL_R) * dt; // раскат
    m.visible = true;
    if (a.p.y <= 0.036 && sp < 0.03) {
      this.floor.set(uid, a.p.clone());
      this.anim.delete(uid);
    }
  }

  _ghost(s, t) {
    const tr = this.g;
    const hand = s.treeHand != null ? s.toys.find((x) => x.uid === s.treeHand) : null;
    const show = !!hand && s.panel === 'tree' && !!this.hover && !s.treeFall.down;
    if (show) {
      if (this.ghost?.userData.id !== hand.id) {
        dropToy(this.ghost);
        this.ghost = ghostify(toyModel(hand.id));
        this.ghost.userData.id = hand.id;
        this.ghost.scale.setScalar(TOY_SCALE);
        tr.add(this.ghost);
      }
      const ok = s.hangCheck(this.hover.p).ok;
      const hp = hookPos(this.hover.p, s.cfg.tree.hookOut);
      this.ghost.position.set(hp.x, hp.y, hp.z);
      this.ghost.rotation.set(0, Math.atan2(this.hover.n.x, this.hover.n.z), 0);
      // свободное место — полупрозрачная игрушка как есть, занятое или слишком тесное — красноватая
      this.ghost.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.base ??= o.material.color.clone();
        o.material.opacity = ok ? 0.6 : 0.35;
        o.material.color.copy(ok ? o.userData.base : RED);
      });
      this.ghost.visible = true;
    } else if (this.ghost) this.ghost.visible = false;
    // моток в руке: кружок цвета мишуры под мышью — «отсюда потянется»
    const tool = s.tinsel.tool;
    const pen = tool && tool !== 'cut' && this.hover && !s.treeFall.down;
    this.pen.visible = !!pen;
    if (pen) {
      const n = this.hover.n;
      this.pen.position.set(this.hover.p.x + n.x * 0.03, this.hover.p.y + n.y * 0.03, this.hover.p.z + n.z * 0.03);
      this.pen.material.color.setHex(TINSEL[tool]?.color ?? 0xffffff);
      this.pen.scale.setScalar(1 + 0.2 * Math.sin(t * 8));
    }
  }
}
