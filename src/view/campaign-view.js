// Отображение дня кампании поверх общей сцены (кухня, героиня, кот, доска).
// Только читает KitchenSession; ничего не начисляет.
import * as THREE from 'three';
import { CLAYOUT, ISLAND_H, TRAY, trayItems, CANAPE_PILES, SKEWER_JAR, FRUIT_PILES, TABLE_SLOTS, SINK, PUDDLE, BOWL } from '../campaign/layout.js';
import { PRODUCTS, DISH_ORDER } from '../campaign/data.js';
import { BOARD_UNIT } from '../campaign/st-board.js';
import { roundSlices } from '../campaign/mechanics.js';
import { animateHeroine, setExpression } from './heroine.js';
import { animateCat } from './cat.js';
import { tex } from './textures.js';
import * as F from './food.js';
import { CutBoardView } from './cutboard.js';
import { BowlView } from './bowl3d.js';
import { DecorView } from './decor.js';
import { RadioView } from './radio3d.js';
import { RADIO } from '../campaign/radio-data.js';

const ease = (k) => k * k * (3 - 2 * k);
const UNIT = BOARD_UNIT;

export class CampaignView {
  constructor(sv) {
    this.catVis = { segs: [], seg: 0, t: 0, mode: 'home' };
    this.sv = sv;
    this.scene = sv.scene;
    this.k = sv.k;
    this.root = new THREE.Group();
    this.root.name = 'campaign';
    this.scene.add(this.root);
    this.time = 0;
    this.session = null;
    this.pointerLocal = null;
    this.clickables = [];
    this._buildProps();
    this._buildRings();
    sv.cameraHook = (mode, pos, look, aspect) => this._camera(mode, pos, look, aspect);
    this.setActive(false);
  }

  setActive(on) {
    this.active = on;
    this.root.visible = on;
    this.sv.board.group.visible = !on;
    // реквизит старого раунда, который в кампании не нужен
    for (const r of Object.values(this.k.rings)) r.visible = false;
  }

  // ---------- реквизит ----------
  _buildProps() {
    const k = this.k;
    const S = CLAYOUT.stations;
    const tag = (obj, id) => {
      obj.traverse((o) => {
        if (o.isMesh) {
          o.userData.cstation = id;
          this.clickables.push(o);
        }
      });
    };
    // запасная тарелка — к краю острова
    k.plate.group.position.x = -1.66;
    k.plate.group.visible = false;

    // поднос
    this.trayGroup = new THREE.Group();
    this.trayGroup.position.set(S.tray.anchor.x, ISLAND_H, S.tray.anchor.z);
    const trayM = F.trayModel(TRAY.w, TRAY.d);
    this.trayGroup.add(trayM);
    tag(trayM, 'tray');
    this.trayWork = new THREE.Group();
    this.trayWork.position.y = 0.009;
    this.trayGroup.add(this.trayWork);
    this.workPlate = F.workPlate();
    this.workPlate.position.set(TRAY.workPlate.x, 0.0, TRAY.workPlate.z);
    this.trayGroup.add(this.workPlate);
    this.trayDirt = new THREE.Mesh(new THREE.PlaneGeometry(TRAY.w * 0.9, TRAY.d * 0.9), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, transparent: true, opacity: 0.35, depthWrite: false }));
    this.trayDirt.rotation.x = -Math.PI / 2;
    this.trayDirt.position.y = 0.0105;
    this.trayGroup.add(this.trayDirt);
    // инструменты и продукты у подноса
    this.butter = F.butterBlock();
    this.butter.position.set(-0.36, 0.0, -0.13);
    this.caviarJar = F.jar(0xe8461f, 0xffffff, 0.05, 0.028);
    this.caviarJar.position.set(0.36, 0, -0.13);
    this.greens = F.greensBunch();
    this.greens.position.set(0.33, 0, 0.14);
    this.trayGroup.add(this.butter, this.caviarJar, this.greens);
    this.root.add(this.trayGroup);

    // тёрка у доски
    this.grater = F.grater();
    this.grater.position.copy(k.boardCenter).add(new THREE.Vector3(0, 0, -0.03));
    this.grater.visible = false;
    this.root.add(this.grater);
    this.grateProduct = new THREE.Mesh(F.rbox(0.05, 0.035, 0.04, 0.008), F.m(0xffffff, 0.6));
    this.grateProduct.visible = false;
    this.root.add(this.grateProduct);
    this.shreds = new THREE.Group();
    this.shreds.position.copy(k.boardCenter).add(new THREE.Vector3(0, 0, 0.06));
    this.root.add(this.shreds);
    this.roundGroup = new THREE.Group();
    this.roundGroup.position.copy(k.boardCenter);
    this.root.add(this.roundGroup);
    this.cutBoard = new CutBoardView(this.root, k.boardCenter);

    // раковина
    const sk = S.sink.anchor;
    const sink = new THREE.Group();
    sink.position.set(sk.x, ISLAND_H, sk.z);
    const basin = new THREE.Mesh(F.rbox(SINK.w + 0.06, 0.012, SINK.d + 0.06, 0.03), F.m(0xc9d1d8, 0.25, 0.7));
    basin.position.y = 0.002;
    sink.add(basin);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(SINK.w, SINK.d), F.m(0x7d868f, 0.3, 0.6));
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.0145;
    sink.add(inner);
    const tap = new THREE.Group();
    const pipe = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 8, 16, Math.PI), F.m(0xdde3e8, 0.2, 0.85));
    pipe.rotation.y = Math.PI / 2;
    pipe.position.set(0, 0.07, -0.16);
    tap.add(pipe);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.08, 10), F.m(0xdde3e8, 0.2, 0.85));
    stem.position.set(0, 0.04, -0.22);
    tap.add(stem);
    sink.add(tap);
    this.root.add(sink);
    tag(sink, 'sink');
    this.sinkItem = new THREE.Group();
    this.sinkItem.position.set(sk.x, ISLAND_H + 0.016, sk.z);
    this.root.add(this.sinkItem);
    this.sponge = F.sponge();
    this.sponge.visible = false;
    this.root.add(this.sponge);
    this.foam = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012 + (i % 3) * 0.005, 8, 6), F.m(0xffffff, 0.3));
      b.position.set(Math.cos(i * 2.3) * 0.08, 0.02, Math.sin(i * 1.7) * 0.06);
      this.foam.add(b);
    }
    this.foam.position.set(sk.x, ISLAND_H, sk.z);
    this.foam.visible = false;
    this.root.add(this.foam);
    this.washTex = null;

    // духовка: свечение дверцы
    this.ovenGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.22), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0 }));
    this.ovenGlow.position.set(1.45, 0.45, -1.888);
    this.root.add(this.ovenGlow);
    const ovenHit = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), new THREE.MeshBasicMaterial({ visible: false }));
    ovenHit.position.set(1.45, 0.45, -1.88);
    this.root.add(ovenHit);
    tag(ovenHit, 'oven');
    this.ovenChicken = F.chicken();
    this.ovenChicken.scale.setScalar(0.8);
    this.ovenChicken.position.set(1.45, 0.36, -1.99);
    this.ovenChicken.visible = false;
    this.root.add(this.ovenChicken);
    for (const o of k.stations.stove) o.traverse((q) => q.isMesh && (q.userData.cstation = 'stove', this.clickables.push(q)));

    // холодильник, радио, гирлянда, телефон, миска, доска — существующие модели
    const fridgeHit = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2, 0.75), new THREE.MeshBasicMaterial({ visible: false }));
    fridgeHit.position.set(3.05, 1, -2.15);
    this.root.add(fridgeHit);
    tag(fridgeHit, 'fridge');
    for (const id of ['radio', 'garland', 'phone', 'bowl', 'board']) for (const o of k.stations[id] ?? []) o.traverse((q) => q.isMesh && (q.userData.cstation = id, this.clickables.push(q)));
    this.radioView = new RadioView(k.radio);

    // кукуруза у миски
    this.cornJar = F.jar(0xf4c430, 0x2f8f3a, 0.09, 0.034);
    this.cornJar.position.set(S.bowl.anchor.x + 0.34, ISLAND_H, S.bowl.anchor.z + 0.02);
    this.root.add(this.cornJar);

    // содержимое миски кампании
    this.bowlContent = new THREE.Group();
    k.bowl.content.add(this.bowlContent);
    this.bowlView = new BowlView(k);
    this.decorView = new DecorView(this.root);
    this.bowlSpoon = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8), F.m(0xd9a066, 0.6));
    stick.position.y = 0.13;
    stick.rotation.z = 0.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), F.m(0xd9a066, 0.6));
    head.scale.set(1, 0.4, 1.4);
    head.position.set(0.04, 0.02, 0);
    this.bowlSpoon.add(stick, head);
    this.bowlSpoon.visible = false;
    k.bowl.group.add(this.bowlSpoon);
    this.bowlDirt = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshStandardMaterial({ color: 0xc9b88a, transparent: true, opacity: 0.55, depthWrite: false }));
    this.bowlDirt.rotation.x = -Math.PI / 2;
    this.bowlDirt.position.y = 0.03;
    k.bowl.group.add(this.bowlDirt);

    // стакан компота
    this.glass = F.glassOfCompote();
    this.glass.position.set(CLAYOUT.glass.x, CLAYOUT.glass.y, CLAYOUT.glass.z);
    this.root.add(this.glass);

    // пакет доставки
    this.bag = F.paperBag();
    this.bag.position.set(S.bag.anchor.x, ISLAND_H, S.bag.anchor.z);
    this.root.add(this.bag);
    tag(this.bag, 'bag');

    // праздничный стол
    const T = CLAYOUT.table;
    const table = new THREE.Group();
    table.position.set(T.x, 0, T.z);
    const top = new THREE.Mesh(F.rbox(T.w, 0.04, T.d, 0.04), F.m(0x8a5a35, 0.6));
    top.position.y = T.h - 0.04;
    table.add(top);
    const cloth = new THREE.Mesh(F.rbox(T.w + 0.08, 0.006, T.d + 0.08, 0.05), F.m(0xc8252f, 0.85));
    cloth.position.y = T.h;
    table.add(cloth);
    const runner = new THREE.Mesh(F.rbox(T.w * 0.35, 0.002, T.d + 0.09, 0.01), F.m(0xf5f0e6, 0.8));
    runner.position.y = T.h + 0.006;
    table.add(runner);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, T.h - 0.04, 10), F.m(0x6e4426, 0.6));
      leg.position.set((x * T.w) / 2.4, (T.h - 0.04) / 2, (z * T.d) / 2.4);
      table.add(leg);
    }
    for (const x of [-0.42, 0.42]) {
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 12), F.m(0xfff6e0, 0.6));
      candle.position.set(x, T.h + 0.066, 0.47);
      table.add(candle);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.01, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
      flame.scale.y = 1.8;
      flame.position.set(x, T.h + 0.14, 0.47);
      table.add(flame);
    }
    this.tableLight = new THREE.PointLight(0xffc27a, 0.0, 2.5, 1.5);
    this.tableLight.position.set(0, T.h + 0.6, 0);
    table.add(this.tableLight);
    this.root.add(table);
    tag(table, 'table');
    this.tableDishes = new THREE.Group();
    this.tableDishes.position.set(T.x, T.h + 0.006, T.z);
    this.root.add(this.tableDishes);
    this.tableDishMeshes = new Map();
    this.slotMarks = new THREE.Group();
    for (const s of TABLE_SLOTS) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(s.r * 0.86, s.r * 0.95, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.x, 0.003, s.z);
      this.slotMarks.add(ring);
    }
    this.tableDishes.add(this.slotMarks);

    // лужи
    this.puddleMeshes = new Map();
    this.ragModel = F.rag();
    this.ragModel.visible = false;
    this.root.add(this.ragModel);

    // курица на подносе (до духовки)
    this.trayChicken = null;

    // вторая кастрюля (вторая конфорка) — копия первой, своё содержимое и пар
    const pot0 = k.pot;
    const g2 = pot0.group.clone(true);
    this.scene.add(g2);
    const ch = g2.children;
    this.pots = [
      { group: pot0.group, lid: pot0.lid, foam: pot0.foam, content: pot0.potatoes, steam: pot0.steam, home: k.potHome.clone(), on: k.potOnStove.clone(), move: null, hideHome: false },
      // ковшик поменьше — на задней левой конфорке, по диагонали: кастрюли не касаются друг друга
      { group: g2, lid: ch[5], foam: ch[4], content: ch[3], steam: pot0.steam.map((st) => { const c = st.clone(); c.material = st.material.clone(); this.scene.add(c); return c; }), home: k.potHome.clone().add(new THREE.Vector3(0, 0, -0.28)), on: k.potOnStove.clone().add(new THREE.Vector3(-0.3, 0, -0.28)), move: null, hideHome: true },
    ];
    g2.scale.setScalar(0.8);
    for (const p of this.pots) p.content.traverse((o) => o.isMesh && (o.material = o.material.clone()));
    g2.visible = false;
    tag(g2, 'stove');
    // огонь под кастрюлей и пузыри в воде; крутилка конфорки 0 — правая передняя (3), конфорки 1 — левая задняя (0)
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x4f8dff, transparent: true, opacity: 0.85, depthWrite: false });
    const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
    this.pots.forEach((pot, bi) => {
      pot.knob = k.stoveKnobs?.[bi === 0 ? 3 : 0] ?? null;
      pot.flame = new THREE.Group();
      for (let i = 0; i < 14; i++) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, 6), flameMat);
        const a = (i / 14) * Math.PI * 2;
        f.position.set(Math.cos(a) * 0.075, 0.015, Math.sin(a) * 0.075);
        f.userData.ph = i * 1.7;
        pot.flame.add(f);
      }
      pot.flame.position.set(pot.on.x, pot.on.y - 0.025, pot.on.z);
      pot.flame.visible = false;
      this.scene.add(pot.flame);
      pot.water = pot.group.children[2];
      pot.bubbles = [];
      for (let i = 0; i < 8; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), bubbleMat);
        b.visible = false;
        b.userData.ph = i / 8;
        pot.group.add(b);
        pot.bubbles.push(b);
      }
    });

    // доска грязная после сельди/свёклы
    this.boardDirt = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshStandardMaterial({ color: 0x7a1d3c, transparent: true, opacity: 0.4, depthWrite: false }));
    this.boardDirt.rotation.x = -Math.PI / 2;
    this.boardDirt.scale.set(1.6, 1, 1);
    this.boardDirt.position.copy(k.boardCenter).add(new THREE.Vector3(0.05, 0.003, 0.02));
    this.boardDirt.visible = false;
    this.root.add(this.boardDirt);

    // миска кота и мячик
    const cb = CLAYOUT.catBowl;
    this.catBowl = new THREE.Group();
    this.catBowl.position.set(cb.x, 0, cb.z);
    const dish = new THREE.Mesh(new THREE.LatheGeometry([0.05, 0.075, 0.085, 0.09].map((r, i) => new THREE.Vector2(r, i * 0.014)), 24), F.m(0x2f7fd0, 0.4));
    this.catBowl.add(dish);
    this.kibble = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), F.m(0x9a5b2a, 0.7));
      b.position.set(Math.cos(i * 2.1) * 0.035 * (i % 3) / 2, 0.03 + (i % 2) * 0.006, Math.sin(i * 2.1) * 0.035 * (i % 3) / 2);
      this.kibble.add(b);
    }
    this.kibble.visible = false;
    this.catBowl.add(this.kibble);
    this.root.add(this.catBowl);
    tag(this.catBowl, 'catbowl');
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), F.m(0xe8443a, 0.5));
    this.ball.position.set(cb.x + 0.3, 0.035, cb.z - 0.12);
    this.root.add(this.ball);
    tag(this.ball, 'catbowl');
    this.ballHome = this.ball.position.clone();

    this.particles = new Particles(this.root);
  }

  _buildRings() {
    this.rings = {};
    const geo = new THREE.RingGeometry(0.2, 0.26, 40);
    for (const [id, s] of Object.entries(CLAYOUT.stations)) {
      const ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x2fbf5a, transparent: true, opacity: 0.45, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(s.stand.x, 0.012, s.stand.z);
      ring.userData.cstation = id;
      this.root.add(ring);
      this.rings[id] = ring;
      this.clickables.push(ring);
    }
    this.targetMark = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
    this.targetMark.rotation.x = -Math.PI / 2;
    this.targetMark.visible = false;
    this.root.add(this.targetMark);
    this.failMark = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.09, 24), new THREE.MeshBasicMaterial({ color: 0xe53935, transparent: true, opacity: 0.9, depthWrite: false }));
    this.failMark.rotation.x = -Math.PI / 2;
    this.failMark.visible = false;
    this.failT = 0;
    this.root.add(this.failMark);
  }

  // ---------- камеры ----------
  _camera(mode, pos, look, aspect) {
    const back = aspect < 1.45 ? 1.2 : 1;
    const S = CLAYOUT.stations;
    switch (mode) {
      case 'c-overview': {
        look.set(-0.45, 0.6, -0.55);
        const f = Math.max(1, 1.7 / aspect);
        pos.set(-0.45, 0.6 + 3.9 * f, -0.55 + 5.9 * f);
        return true;
      }
      case 'c-board':
        return false; // базовый крупный план доски
      case 'c-tray': {
        const a = S.tray.anchor;
        // стопки, рабочая тарелка и выкладка у ближнего края должны оставаться выше нижней панели
        look.set(a.x, ISLAND_H, a.z + 0.06);
        pos.set(a.x, ISLAND_H + 0.66 * back, a.z + 0.06 + 0.36 * back);
        return true;
      }
      case 'c-bowl': {
        const a = S.bowl.anchor;
        look.set(a.x, ISLAND_H + 0.04, a.z + 0.05);
        pos.set(a.x, ISLAND_H + 0.72 * back, a.z + 0.46 * back);
        return true;
      }
      case 'c-stove': {
        // плита крупно: кастрюли, огонь и крутилки на передней панели
        const a = S.stove.anchor;
        // вся плита в кадре над доком: обе кастрюли и передняя панель с крутилками
        look.set(a.x, 0.74, a.z + 0.08);
        pos.set(a.x + 0.05, 0.74 + 1.0 * back, a.z + 1.45 * back);
        return true;
      }
      case 'c-sink': {
        const a = S.sink.anchor;
        look.set(a.x, ISLAND_H, a.z + 0.02);
        pos.set(a.x, ISLAND_H + 0.55 * back, a.z + 0.42 * back);
        return true;
      }
      case 'c-radio': {
        // лицевая панель радио выше дока и левее колонки уведомлений: смотрим чуть ниже и правее центра корпуса
        const a = S.radio.anchor;
        const fz = a.z + RADIO.face.z;
        look.set(a.x + 0.06, a.y - 0.04, fz);
        pos.set(a.x + 0.06, a.y + 0.06 * back, fz + 0.78 * back);
        return true;
      }
      case 'c-puddle': {
        const p = this.session?._activePuddle();
        const c = p ?? { x: 0, z: 0 };
        look.set(c.x, 0, c.z);
        pos.set(c.x, 0.95 * back, c.z + 0.6 * back);
        return true;
      }
      case 'c-table': {
        const T = CLAYOUT.table;
        // ближний ряд мест должен оставаться выше нижней панели сервировки
        look.set(T.x, T.h, T.z + 0.15);
        pos.set(T.x + 0.02, T.h + 1.5 * back, T.z + 0.15 + 1.1 * back);
        return true;
      }
      case 'c-final': {
        const T = CLAYOUT.table;
        const a = this.time * 0.15;
        // в кадре стол и героиня за ним (лицо не обрезано)
        look.set(T.x + 0.2, T.h + 0.32, T.z - 0.1);
        pos.set(T.x + 0.2 + Math.sin(a) * 0.6, T.h + 1.0, T.z + 1.75 + Math.cos(a) * 0.2);
        return true;
      }
      default:
        return false;
    }
  }

  cameraModeFor(session, mode) {
    if (mode === 'final') return 'c-final';
    if (!session || session.heroine.away) return 'c-overview';
    const p = session.panel;
    if (p === 'board') return 'board';
    if (p === 'tray' || p === 'bowl' || p === 'sink' || p === 'puddle' || p === 'table' || p === 'stove' || p === 'radio') return 'c-' + p;
    return 'c-overview';
  }

  // ---------- выбор мышью ----------
  pick(ndc) {
    const rc = this.sv._ray(ndc);
    const hits = rc.intersectObjects(this.clickables, false);
    for (const h of hits) {
      if (!h.object.visible) continue;
      const id = h.object.userData.cstation;
      if (id) return { station: id };
    }
    // лужа
    for (const [id, mesh] of this.puddleMeshes) {
      const hit = rc.intersectObject(mesh.userData.hit, false)[0];
      if (hit) return { station: 'puddle' };
    }
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const p = new THREE.Vector3();
    if (rc.ray.intersectPlane(floor, p)) return { floor: { x: p.x, z: p.z } };
    return null;
  }

  // Локальные координаты рабочей плоскости станции (метры).
  workPlane(station) {
    const S = CLAYOUT.stations;
    switch (station) {
      case 'board':
        return { c: this.k.boardCenter.clone(), y: this.k.boardTop + UNIT };
      case 'tray':
        return { c: new THREE.Vector3(S.tray.anchor.x, ISLAND_H + 0.02, S.tray.anchor.z), y: ISLAND_H + 0.02 };
      case 'bowl':
        return { c: new THREE.Vector3(S.bowl.anchor.x, ISLAND_H + 0.06, S.bowl.anchor.z), y: ISLAND_H + 0.06 };
      case 'sink':
        return { c: new THREE.Vector3(S.sink.anchor.x, ISLAND_H + 0.02, S.sink.anchor.z), y: ISLAND_H + 0.02 };
      case 'puddle': {
        const p = this.session?._activePuddle();
        return p ? { c: new THREE.Vector3(p.x, 0.01, p.z), y: 0.01 } : null;
      }
      case 'table': {
        const T = CLAYOUT.table;
        return { c: new THREE.Vector3(T.x, T.h, T.z), y: T.h };
      }
      case 'radio': {
        // вертикальная лицевая панель: x — вправо, z — вниз по панели (как на экране)
        const a = S.radio.anchor;
        return { c: new THREE.Vector3(a.x, a.y, a.z + RADIO.face.z), y: a.y, vertical: true };
      }
      default:
        return null;
    }
  }

  pickLocal(ndc, station) {
    const wp = this.workPlane(station);
    if (!wp) return null;
    const rc = this.sv._ray(ndc);
    const p = new THREE.Vector3();
    if (wp.vertical) {
      if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -wp.c.z), p)) return null;
      return { x: p.x - wp.c.x, z: wp.c.y - p.y };
    }
    if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -wp.y), p)) return null;
    return { x: p.x - wp.c.x, z: p.z - wp.c.z };
  }

  localToScreen(station, x, z, dy = 0) {
    const wp = this.workPlane(station);
    if (!wp) return null;
    const v = (wp.vertical ? new THREE.Vector3(wp.c.x + x, wp.c.y - z, wp.c.z + dy) : new THREE.Vector3(wp.c.x + x, wp.y + dy, wp.c.z + z)).project(this.sv.camera);
    const c = this.sv.canvas;
    return { x: (v.x * 0.5 + 0.5) * c.clientWidth, y: (-v.y * 0.5 + 0.5) * c.clientHeight };
  }

  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.sv.camera);
    return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100, visible: v.z < 1 && v.z > -1 };
  }

  stationScreen(id) {
    if (id === 'puddle') {
      const p = this.session?._activePuddle();
      return p ? this.worldToScreen(p.x, 0.25, p.z) : { visible: false };
    }
    const a = CLAYOUT.stations[id].anchor;
    return this.worldToScreen(a.x, a.y + 0.26, a.z);
  }

  // ---------- события ----------
  reset() {
    for (const g of this.tableDishMeshes.values()) F.disposeGroup(g);
    this.tableDishMeshes.clear();
    this._clearTray();
    this._clearBowl();
    for (const mesh of this.puddleMeshes.values()) {
      mesh.userData.tex.dispose();
      F.disposeGroup(mesh);
    }
    this.puddleMeshes.clear();
    this.washTex?.dispose();
    this.washTex = null;
    this.washKey = null;
    this.sinkItem.clear();
    this.shreds.clear();
    this.roundGroup.clear();
    this.cutBoard.reset();
    this.catVis = { segs: [], seg: 0, t: 0, mode: 'home' };
    this.sv.reset();
    this.sv.cat.visible = true;
    for (const p of this.pots) {
      p.group.position.copy(p.home);
      p.group.visible = !p.hideHome;
      p.content.visible = true;
      p.move = null;
    }
    this.k.pot.puddle.scale.setScalar(0.001);
    this.potMove = null;
    this.particles?.clear();
    this.kibble.visible = false;
    this.ball.position.copy(this.ballHome);
    this.facing = Math.PI;
    this.tableKey = null;
  }

  onEvent(e) {
    switch (e.type) {
      case 'navFail':
        this.failMark.position.set(e.x, 0.015, e.z);
        this.failMark.visible = true;
        this.failT = 0.8;
        break;
      case 'potPlaced': {
        const p = this.pots[e.burner ?? 0];
        p.group.visible = true;
        p.move = { from: p.group.position.clone(), to: p.on.clone(), t: 0 };
        p.content.visible = true;
        // варится в кожуре: картофель в мундире, яйца в скорлупе
        const col = PRODUCTS[e.product]?.peel ?? { beet: 0x5a1530 }[e.product] ?? PRODUCTS[e.product]?.color ?? 0xe8c77a;
        const egg = e.product === 'egg';
        p.content.traverse((o) => o.isMesh && o.material.color.setHex(col));
        p.content.children.forEach((o) => o.scale.set(egg ? 0.85 : 1.2, egg ? 0.75 : 0.9, egg ? 1.15 : 1));
        break;
      }
      case 'potatoTaken': {
        const p = this.pots[e.burner ?? 0];
        p.content.visible = false;
        p.move = { from: p.group.position.clone(), to: p.home.clone(), t: 0, hideAfter: p.hideHome };
        this.particles.emit(p.on.clone().add(new THREE.Vector3(0, 0.3, 0)), 0xffffff, 14, { spread: 0.08, up: 0.5, life: 1.2, size: 0.03, gravity: -0.3 });
        break;
      }
      case 'catFed':
        this.kibble.visible = true;
        this._catTo(new THREE.Vector3(CLAYOUT.catBowl.x + 0.17, 0, CLAYOUT.catBowl.z - 0.02), 'eat', -Math.PI / 2);
        break;
      case 'catPlay':
        this._catTo(new THREE.Vector3(CLAYOUT.catBowl.x + 0.1, 0, CLAYOUT.catBowl.z - 0.25), 'play', 0.6);
        this.playT = 0;
        break;
      case 'cut': {
        const it = this.session?.board.items[e.key];
        if (it) this.particles.emit(this.k.boardCenter.clone().add(new THREE.Vector3((e.x ?? 0) * UNIT, 0.03, (e.z ?? 0) * UNIT)), PRODUCTS[it.product]?.color ?? 0xffffff, 6, { spread: 0.03, up: 0.35, life: 0.6, size: 0.008 });
        break;
      }
      case 'pinch': {
        const bp = new THREE.Vector3();
        this.k.bowl.group.getWorldPosition(bp);
        this.particles.emit(bp.add(new THREE.Vector3(0, 0.25, 0)), e.kind === 'salt' ? 0xffffff : 0x2a2a2a, 16, { spread: 0.03, up: -0.2, life: 0.8, size: 0.006, gravity: 1.5 });
        break;
      }
      case 'dishDone': {
        const st = CLAYOUT.stations[this.session?.dishes[e.dishId]?.recipe.uses.includes('tray') ? 'tray' : 'bowl'];
        const at = new THREE.Vector3(st.anchor.x, ISLAND_H + 0.15, st.anchor.z);
        for (const c of [0xf4b400, 0xe8443a, 0x3fae49, 0x2f7fd0, 0xffffff]) this.particles.emit(at, c, 10, { spread: 0.1, up: 1.3, life: 1.4, size: 0.012, gravity: 2.2 });
        break;
      }
      case 'washed':
      case 'cooled': {
        const a = CLAYOUT.stations.sink.anchor;
        this.particles.emit(new THREE.Vector3(a.x, ISLAND_H + 0.1, a.z), 0xdff3ff, 18, { spread: 0.1, up: 0.6, life: 1, size: 0.016, gravity: -0.2 });
        break;
      }
      case 'catSpill':
      case 'spill': {
        const at = e.type === 'spill' ? CLAYOUT.potPuddle : CLAYOUT.spillPuddle;
        this.particles.emit(new THREE.Vector3(at.x, 0.1, at.z), e.type === 'spill' ? 0x9fd3ef : 0xb0304a, 24, { spread: 0.15, up: 0.9, life: 0.9, size: 0.014, gravity: 3 });
        if (e.type === 'catSpill') this._catFlee(false);
        break;
      }
      case 'served': {
        const T = CLAYOUT.table;
        this.particles.emit(new THREE.Vector3(T.x, T.h + 0.2, T.z), 0xffe08a, 16, { spread: 0.25, up: 0.6, life: 1, size: 0.01, gravity: 0.5 });
        break;
      }
      case 'catStart':
        this._catPath(e.kind === 'spill' ? 'spill' : 'theft');
        break;
      case 'catVisit':
        this._catPath('visit');
        break;
      case 'catShooed':
      case 'catGone':
      case 'catStole':
      case 'catSpill':
        this._catFlee(e.type === 'catStole');
        break;
      default:
    }
  }

  _catPath(kind) {
    const cat = this.sv.cat;
    const from = cat.position.clone();
    const S = CLAYOUT.stations;
    let floor, top, face;
    if (kind === 'theft') {
      floor = new THREE.Vector3(-0.45, 0, 1.25);
      top = new THREE.Vector3(-0.2, ISLAND_H, 0.9);
      face = Math.PI;
    } else if (kind === 'spill') {
      floor = new THREE.Vector3(CLAYOUT.glass.x + 0.3, 0, 1.3);
      top = new THREE.Vector3(CLAYOUT.glass.x + 0.18, ISLAND_H, 0.9);
      face = -Math.PI / 2 - 0.4;
    } else {
      floor = new THREE.Vector3(0.6, 0, 1.4);
      this.catVis = { mode: 'visit', t: 0, seg: 0, segs: [{ from, to: floor, dur: 2 }, { from: floor, to: floor, dur: 999, mode: 'sit', face: 0.3 }] };
      return;
    }
    this.catVis = {
      mode: kind,
      t: 0,
      seg: 0,
      segs: [
        { from, to: floor.clone(), dur: Math.max(0.8, from.distanceTo(floor) / 1.6) },
        { from: floor.clone(), to: top.clone(), dur: 0.35, arc: 0.3 },
        { from: top.clone(), to: top.clone(), dur: 999, mode: 'reach', face },
      ],
    };
  }

  _catTo(target, mode, face) {
    const from = this.sv.cat.position.clone();
    from.y = 0;
    const segs = [];
    if (this.sv.cat.position.y > 0.05) {
      const down = new THREE.Vector3(from.x, 0, 1.3);
      segs.push({ from: this.sv.cat.position.clone(), to: down, dur: 0.3, arc: 0.2 });
      segs.push({ from: down.clone(), to: target.clone(), dur: Math.max(0.6, down.distanceTo(target) / 1.8) });
    } else segs.push({ from, to: target.clone(), dur: Math.max(0.6, from.distanceTo(target) / 1.8) });
    segs.push({ from: target.clone(), to: target.clone(), dur: 999, mode, face });
    this.sv.cat.userData.loot.visible = false;
    this.catVis = { mode, t: 0, seg: 0, segs };
  }

  _catFlee(loot) {
    const cat = this.sv.cat;
    const cur = cat.position.clone();
    const home = new THREE.Vector3(CLAYOUT.catHome.x, 0, CLAYOUT.catHome.z);
    const segs = [];
    if (cur.y > 0.05) {
      const down = new THREE.Vector3(cur.x, 0, 1.3);
      segs.push({ from: cur.clone(), to: down, dur: 0.3, arc: 0.2 });
      segs.push({ from: down.clone(), to: home.clone(), dur: Math.max(0.6, down.distanceTo(home) / 2.6) });
    } else segs.push({ from: cur.clone(), to: home.clone(), dur: Math.max(0.6, cur.distanceTo(home) / 2.6) });
    segs.push({ from: home.clone(), to: home.clone(), dur: 999, mode: 'sit', face: -0.6 });
    cat.userData.loot.visible = !!loot;
    this.catVis = { mode: 'flee', t: 0, seg: 0, segs, loot };
  }

  _updateCat(dt, time) {
    const cat = this.sv.cat;
    cat.visible = true;
    const cv = this.catVis;
    if (!cv.segs.length) {
      cat.position.set(CLAYOUT.catHome.x, 0, CLAYOUT.catHome.z);
      cat.rotation.y = -0.6;
      animateCat(cat, this.session?.catCalm?.() ? 'sleep' : 'sit', time, 0);
      return;
    }
    cv.t += dt;
    let seg = cv.segs[cv.seg];
    while (seg && seg.dur < 100 && cv.t >= seg.dur) {
      cv.t -= seg.dur;
      cv.seg++;
      seg = cv.segs[cv.seg];
      if (cv.mode === 'flee' && cv.seg >= 1 && cv.loot) {
        cat.userData.loot.visible = cv.seg < cv.segs.length - 1;
      }
    }
    if (!seg) return;
    const k = seg.dur > 100 ? 1 : cv.t / seg.dur;
    const p = new THREE.Vector3().lerpVectors(seg.from, seg.to, k);
    if (seg.arc) p.y += Math.sin(k * Math.PI) * seg.arc;
    const moving = seg.from.distanceToSquared(seg.to) > 1e-6;
    if (moving) cat.rotation.y = Math.atan2(seg.to.x - seg.from.x, seg.to.z - seg.from.z);
    else if (seg.face != null) cat.rotation.y = seg.face;
    cat.position.copy(p);
    if (seg.mode === 'sit' && cat.userData.loot.visible) cat.userData.loot.visible = false;
    const sleepy = seg.mode === 'sit' && this.session?.cat.state === 'home' && this.session.catCalm?.();
    animateCat(cat, sleepy ? 'sleep' : seg.mode ?? 'walk', time, moving ? 1 : 0);
  }

  // ---------- кадр ----------
  _pose(s) {
    if (!s) return { pose: 'menu' };
    const a = s.action;
    if (s.heroine.target) return { pose: 'walk' };
    if (a?.type === 'shoo') return { pose: 'shoo' };
    if (a?.type === 'cut') return { pose: 'cut', progress: a.elapsed / a.duration };
    if (a) return { pose: 'work' };
    if (s.holds.garland) return { pose: 'reach' };
    if (s.holds.radio) return { pose: 'work' };
    if (s.panel === 'sink' && s.pointerDown) return { pose: 'wash' };
    if (s.panel === 'puddle') return { pose: 'wipe' };
    if (s.panel === 'board' && s.boardCur()?.grater) return { pose: 'grate' };
    if (s.panel === 'bag') return { pose: 'unpack' };
    if (s.panel === 'stove' || s.panel === 'oven') return { pose: 'stove' };
    if (s.panel === 'catbowl') return { pose: 'unpack' };
    if (s.panel === 'bowl' && s.pointerDown) return { pose: 'mix' };
    if (s.panel === 'board') return { pose: 'cut', progress: 0 };
    if (s.panel === 'phone') return { pose: 'phone' };
    if (s.panel && s.pointerDown) return { pose: 'work' };
    if (s.phase === 'ready' || s.phase === 'finished') return { pose: 'joy' };
    return { pose: 'idle' };
  }

  update(s, dt, mode) {
    this.session = s;
    this.time += dt;
    const t = this.time;
    const sv = this.sv;
    const camMode = this.cameraModeFor(s, mode);
    sv.setCameraMode(camMode);
    sv._updateCamera(dt);
    const closeup = camMode !== 'c-overview' && camMode !== 'c-final';

    // героиня
    const hr = s.heroine;
    sv.heroine.position.set(hr.x, 0, hr.z);
    const diff = ((hr.facing - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.facing += diff * Math.min(1, dt * 10);
    sv.heroine.rotation.y = this.facing;
    sv.heroine.visible = !hr.away && !(closeup && sv.camT > 0.35);
    const worried = s.urgentCount() > 0 || s.alerts.length >= 3;
    setExpression(sv.heroine, worried);
    const hp = this._pose(s);
    animateHeroine(sv.heroine, hp.pose, t, hp.progress);
    if (mode === 'final') {
      sv.heroine.visible = true;
      // за дальним краем стола, лицом к камере: стол и героиня в кадре, камера её не задевает
      sv.heroine.position.set(CLAYOUT.table.x + 0.3, 0, CLAYOUT.table.z - 0.85);
      sv.heroine.rotation.y = 0.15;
      setExpression(sv.heroine, false);
      animateHeroine(sv.heroine, 'joy', t);
    }

    // метка цели
    const tgt = hr.target?.point ?? (hr.target?.station ? s.stationStand(hr.target.station) : null);
    this.targetMark.visible = !!tgt && !closeup;
    if (tgt) {
      this.targetMark.position.set(tgt.x, 0.014, tgt.z);
      this.targetMark.material.opacity = 0.5 + Math.sin(t * 8) * 0.3;
    }
    if (this.failT > 0) {
      this.failT -= dt;
      this.failMark.material.opacity = Math.max(0, this.failT);
      if (this.failT <= 0) this.failMark.visible = false;
    }

    this._updateCat(dt, t);
    this._updateStove(s, dt, t);
    this._updateHome(s, dt, t);
    this._updateRings(s, t, closeup);
    this._updateBoard(s, dt, camMode === 'board');
    this._updateTray(s, dt, t);
    this._updateBowl(s, dt, t);
    this.decorView.sync(s.decor, t);
    this._updateSink(s, t);
    this._updatePuddles(s, t);
    this._updateTable(s, mode);
  }

  _updateRings(s, t, closeup) {
    const urgentStations = new Set(s.alerts.filter((a) => a.urgent && a.station).map((a) => a.station));
    for (const [id, ring] of Object.entries(this.rings)) {
      let show = !closeup && !s.heroine.away && s.phase !== 'finished';
      if (id === 'bag') show = show && !!s.delivery.bag;
      if (id === 'table') show = show && (s.day.finalServe || s.phase === 'ready');
      ring.visible = show;
      const hover = this.hover === id;
      const urgent = urgentStations.has(id);
      ring.material.color.setHex(urgent ? 0xe53935 : 0x2fbf5a);
      ring.material.opacity = (hover ? 0.85 : 0.35) + (urgent ? Math.sin(t * 6) * 0.25 : 0);
      ring.scale.setScalar(hover ? 1.15 : 1);
    }
  }

  _updateStove(s, dt, t) {
    this.pots.forEach((pot, bi) => {
      const b = s.burners[bi];
      if (pot.move) {
        pot.move.t = Math.min(1, pot.move.t + dt / 0.5);
        pot.group.position.lerpVectors(pot.move.from, pot.move.to, ease(pot.move.t));
        pot.group.position.y += Math.sin(pot.move.t * Math.PI) * 0.12;
        if (pot.move.t >= 1) {
          if (pot.move.hideAfter) pot.group.visible = false;
          pot.move = null;
        }
      }
      // огонь и крутилка: метка поворачивается на 30° за деление, пламя растёт с огнём
      const heat = b?.heat ?? 0;
      if (pot.knob) pot.knob.rotation.y += (-(heat * Math.PI) / 6 - pot.knob.rotation.y) * (1 - Math.exp(-dt * 12));
      pot.flame.visible = heat > 0;
      if (heat > 0) {
        for (const f of pot.flame.children) f.scale.set(1, 0.4 + (heat / 9) * 1.4 * (0.85 + 0.15 * Math.sin(t * 18 + f.userData.ph)), 1);
      }
      // вода: греется — редкие пузырьки со дна, кипит — бурлит
      const temp = b?.temp ?? 20;
      const bubbling = b?.state === 'boiling' && temp > 70;
      pot.bubbles.forEach((bb, i) => {
        bb.visible = bubbling && (temp > 98 || i < 3);
        if (!bb.visible) return;
        const sp = temp > 98 ? 1.6 : 0.5;
        const ph = (t * sp + bb.userData.ph) % 1;
        const a = i * 2.4 + Math.floor(t * sp + bb.userData.ph) * 1.3;
        bb.position.set(Math.cos(a) * 0.08 * ((i % 3) / 3 + 0.3), 0.06 + ph * 0.09, Math.sin(a) * 0.08 * ((i % 3) / 3 + 0.3));
        bb.scale.setScalar(0.6 + ph);
      });
      if (pot.water) pot.water.position.y = 0.15 + (temp > 98 ? Math.sin(t * 20 + bi) * 0.003 : 0);
      const boiling = !!b && ((b.state === 'boiling' && (b.water == null || b.water === 'boil')) || b.state === 'ready');
      const over = !!b?.overflow;
      pot.foam.visible = over;
      pot.lid.position.y = 0.21 + (over ? Math.abs(Math.sin(t * 22 + bi)) * 0.03 : boiling ? Math.abs(Math.sin(t * 6 + bi)) * 0.004 : 0);
      pot.lid.rotation.z = over ? Math.sin(t * 17) * 0.08 : 0;
      pot.steam.forEach((st, i) => {
        st.visible = boiling;
        if (!boiling) return;
        const ph = (t * (over ? 0.9 : 0.45) + st.userData.phase) % 1;
        st.position.set(pot.group.position.x + Math.sin(i * 2 + t) * 0.06, pot.group.position.y + 0.25 + ph * 0.6, pot.group.position.z + Math.cos(i * 3) * 0.05);
        st.scale.setScalar(0.6 + ph * 1.6);
        st.material.opacity = (1 - ph) * (over ? 0.6 : 0.3);
      });
    });
    // доска, миска кота, мячик
    const bd = s.equipment.board;
    this.boardDirt.visible = !!bd && !bd.clean;
    if (this.boardDirt.visible) this.boardDirt.material.color.setHex(bd.by === 'beet' ? 0x7a1d3c : 0x8a7a66);
    if (s.cat.state !== 'eat' && this.kibble.visible && s.catNeeds.hunger > 5) this.kibble.visible = false;
    if (s.cat.state === 'play') {
      this.playT = (this.playT ?? 0) + dt;
      const cb = CLAYOUT.catBowl;
      this.ball.position.set(cb.x + 0.1 + Math.sin(this.playT * 2.2) * 0.35, 0.035 + Math.abs(Math.sin(this.playT * 5)) * 0.12, cb.z - 0.25 + Math.cos(this.playT * 1.7) * 0.2);
      this.sv.cat.position.x += (this.ball.position.x - 0.12 - this.sv.cat.position.x) * Math.min(1, dt * 3);
      this.sv.cat.position.z += (this.ball.position.z - this.sv.cat.position.z) * Math.min(1, dt * 3);
    } else this.ball.position.lerp(this.ballHome, Math.min(1, dt * 2));
    this.particles.update(dt);
    // духовка
    const o = s.oven;
    const on = o.state !== 'empty';
    this.ovenGlow.material.opacity = on ? 0.35 + Math.sin(t * 3) * 0.08 : 0;
    this.ovenGlow.material.color.setHex(o.state === 'burnt' ? 0x552200 : o.state === 'over' ? 0xff5a1a : 0xff8a2a);
    this.ovenChicken.visible = on;
    if (on) F.chickenColor(this.ovenChicken, o.state, o.doneness);
  }

  _updateHome(s, dt, t) {
    const g = this.k.garland;
    const broken = s.garland.broken;
    const fixing = s.holds.garland;
    g.bulbs.forEach((b, i) => {
      let on = 1.3 + Math.sin(t * 3 + i * 1.7) * 0.5;
      if (broken && i % 2 === 0) on = 0;
      if (fixing) on = Math.random() > 0.6 ? 1.5 : 0.2;
      b.material.emissiveIntensity = on;
    });
    g.light.intensity = broken && !fixing ? 0.9 : 2.2;
    const rb = s.radio.broken;
    const ron = s.radio.enabled && !rb;
    const r = this.k.radio;
    r.led.material.color.setHex(rb ? 0xd65037 : ron ? 0x64d48b : 0x6c7367);
    r.led.material.emissive.setHex(rb ? 0x9a180b : ron ? 0x2faa64 : 0x000000);
    r.led.material.emissiveIntensity = rb ? 0.3 + Math.abs(Math.sin(t * 5)) * 0.5 : ron ? 0.8 : 0;
    this.radioView.sync(s, dt, t, s.panel === 'radio' ? this.pointerLocal : null);
    const unread = s.phone.unread > 0 || s.alerts.some((a) => a.phone);
    this.k.phone.screen.material.color.setScalar(unread ? 0.75 + Math.sin(t * 8) * 0.25 : s.panel === 'phone' ? 1 : 0.35);
    // стакан
    this.glass.visible = s.glass.present || s.glass.spilled;
    if (s.glass.spilled) {
      this.glass.rotation.z = Math.PI / 2;
      this.glass.position.set(CLAYOUT.glass.x, ISLAND_H + 0.03, CLAYOUT.glass.z);
    } else {
      this.glass.rotation.z = s.cat.state === 'spill' ? Math.sin(t * 20) * 0.06 : 0;
      this.glass.position.set(CLAYOUT.glass.x, CLAYOUT.glass.y, CLAYOUT.glass.z);
    }
    this.bag.visible = !!s.delivery.bag;
    // посуда: грязь
    this.trayDirt.visible = !s.equipment.tray.clean;
    this.bowlDirt.visible = !s.equipment.bowl.clean;
    // продукты у подноса
    const own = s.tray.owner ? s.trayLayoutId(s.tray.owner) : null;
    this.butter.visible = own === 'sandwiches';
    this.caviarJar.visible = own === 'sandwiches' && (s.inventory.count('caviar') > 0 || s.stepDone(s.tray.owner, 'dose'));
    this.greens.visible = ['tartlets', 'tomatoes', 'eggs'].includes(own);
    this.cornJar.visible = !!s.dishes.crab && !s.stepDone('crab', 'corn');
  }

  // ---------- доска ----------
  _updateBoard(s, dt, closeup) {
    const it = s.boardCur();
    // старая доска базового режима в кампании не рисуется: нож, руки и образец — в CutBoardView
    this.sv.board.group.visible = false;
    this.cutBoard.sync(s, dt, closeup, closeup && s.panel === 'board' ? this.pointerLocal : null);
    // кружочки
    const key = it?.log ? it.key + ':' + it.log.segments.map((q) => q.a.toFixed(4)).join(',') : null;
    if (key !== this.roundKey) {
      this.roundKey = key;
      for (const c of this.roundGroup.children.slice()) F.disposeGroup(c);
      if (it?.log) {
        const col = PRODUCTS[it.product].color;
        const slices = roundSlices(it.log);
        const remainderIdx = slices.reduce((bi, q, i, arr) => (q.t > arr[bi].t ? i : bi), 0);
        slices.forEach((q, i) => {
          const len = q.t * UNIT;
          const geo = new THREE.CylinderGeometry(it.radius * UNIT, it.radius * UNIT, Math.max(0.001, len - 0.0015), 24);
          geo.rotateZ(Math.PI / 2);
          const mat = new THREE.MeshStandardMaterial({ color: it.product === 'sausage' ? 0xffffff : col, map: it.product === 'sausage' ? tex.sausage : null, roughness: 0.55 });
          const mesh = new THREE.Mesh(geo, mat);
          const spread = i === remainderIdx ? 0 : (i - remainderIdx) * 0.002;
          mesh.position.set(((q.a + q.b) / 2) * UNIT + spread, it.radius * UNIT, 0);
          mesh.castShadow = true;
          this.roundGroup.add(mesh);
          if (it.product === 'cucumber') {
            for (const side of [-1, 1]) {
              const cap = new THREE.Mesh(new THREE.CircleGeometry(it.radius * UNIT * 0.82, 20), F.m(0xd8eeb0, 0.6));
              cap.rotation.y = (side * Math.PI) / 2;
              cap.position.set(((side < 0 ? q.a : q.b) * UNIT) + side * 0.0003 + spread, it.radius * UNIT, 0);
              this.roundGroup.add(cap);
            }
          }
        });
      }
    }
    // тёрка
    const grating = !!it?.grater && s.panel === 'board';
    this.grater.visible = grating || (!!it?.grater && !closeup);
    this.grateProduct.visible = !!it?.grater && !it.grater.complete;
    if (it?.grater) {
      const left = it.grater.remaining;
      this.grateProduct.material.color.setHex(PRODUCTS[it.product].color);
      const z = this.pointerLocal && s.pointerDown && s.panel === 'board' ? THREE.MathUtils.clamp(this.pointerLocal.z, -0.06, 0.06) : 0;
      this.grateProduct.position.copy(this.k.boardCenter).add(new THREE.Vector3(0, 0.1 - z * 0.9, -0.03 + z * 0.35 + 0.02));
      this.grateProduct.rotation.x = -0.35;
      this.grateProduct.scale.set(1, Math.max(0.15, left), 1);
      const want = Math.round((1 - left) * 40);
      while (this.shreds.children.length < want) {
        const i = this.shreds.children.length;
        const sh = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.003, 0.016), F.m(PRODUCTS[it.product].color, 0.7));
        const a = i * 2.4, r = Math.sqrt(i / 40) * 0.04;
        sh.position.set(Math.cos(a) * r, 0.004 + (1 - r / 0.04) * 0.012, Math.sin(a) * r);
        sh.rotation.set(0, a, 0.3);
        this.shreds.add(sh);
      }
      if (this.shredsKey !== it.key) {
        this.shredsKey = it.key;
        for (const c of this.shreds.children.slice()) F.disposeGroup(c);
      }
    } else if (this.shreds.children.length) {
      for (const c of this.shreds.children.slice()) F.disposeGroup(c);
      this.shredsKey = null;
    }
  }

  // ---------- миска ----------
  _clearBowl() {
    for (const c of this.bowlContent.children.slice()) F.disposeGroup(c);
    this.bowlKey = null;
    this.bowlView?.reset();
  }

  _updateBowl(s, dt, t) {
    const active = s.panel === 'bowl' && this.sv.camT > 0.9;
    this.bowlView.sync(s, dt, active, active ? this.pointerLocal : null, t);
    const st = s.bowl.stirrer;
    const hand = s.bowlHand?.() ?? 'spoon';
    this.bowlSpoon.visible = s.panel === 'bowl' && hand === 'spoon' && (s.pointerDown || (st && st.turns > 0) || !!s.mixTarget()?.ok);
    if (this.bowlSpoon.visible && this.pointerLocal && s.panel === 'bowl') {
      const p = this.pointerLocal;
      const r = Math.min(BOWL.r * 0.75, Math.hypot(p.x, p.z));
      const a = Math.atan2(p.z, p.x);
      this.bowlSpoon.position.set(Math.cos(a) * r, 0.03, Math.sin(a) * r);
      this.bowlSpoon.rotation.y = -a;
    }
  }

  // ---------- поднос ----------
  _clearTray() {
    for (const c of this.trayWork.children.slice()) F.disposeGroup(c);
    if (this.trayTex) for (const tx of this.trayTex) tx.dispose();
    this.trayTex = [];
    this.trayKey = null;
    this.trayObjs = null;
    this.dragGhost = null;
  }

  _updateTray(s, dt, t) {
    const id = s.tray.owner;
    const dish = id ? s.dishes[id] : null;
    const lay = id ? s.trayLayoutId(id) : null;
    const key = id ? `${id}:${dish.attempt}` : null;
    if (key !== this.trayKey) {
      this._clearTray();
      this.trayKey = key;
      if (dish?.work) this._buildTray(s, id, lay, dish.work);
    }
    if (!this.trayObjs && dish?.work) this._buildTray(s, id, lay, dish.work);
    const o = this.trayObjs;
    // рабочая тарелка
    const wp = s.workPlate;
    this.workPlate.visible = !!wp.owner && wp.owner === id;
    this.workPlate.userData.mound.scale.set(0.05, Math.max(0.001, Math.min(0.03, wp.amount * 0.004)), 0.05);
    this.workPlate.userData.mound.visible = wp.amount > 0.02;
    if (!o) return;
    const w = dish.work;
    switch (lay) {
      case 'sandwiches': {
        let n = 0;
        const mtx = new THREE.Matrix4();
        w.breads.forEach((b, i) => {
          o.butter[i].update();
          for (let k = 0; k < b.doses * 22 && n < o.caviar.instanceMatrix.count; k++) {
            const a = k * 2.399, r = Math.sqrt(k / (b.doses * 22)) * (0.012 + b.doses * 0.006);
            mtx.makeTranslation(b.x + Math.cos(a) * r, 0.016 + (k % 3) * 0.002, b.z + Math.sin(a) * r);
            o.caviar.setMatrixAt(n++, mtx);
          }
        });
        o.caviar.count = n;
        o.caviar.instanceMatrix.needsUpdate = true;
        break;
      }
      case 'eggs':
        w.eggs.forEach((e, i) => {
          o.whole[i].visible = !e.split;
          e.halves.forEach((h, j) => {
            const hm = o.halves[i][j];
            hm.visible = e.split;
            hm.userData.yolk.visible = h.yolk;
            hm.userData.fill.visible = h.fill > 0.02;
            hm.userData.fill.scale.set(0.017, Math.max(0.002, h.fill * 0.012), 0.024);
          });
        });
        break;
      case 'tartlets':
        w.cups.forEach((c, i) => {
          const cm = o.cups[i];
          cm.userData.fill.visible = c.fill > 0.02;
          cm.userData.fill.scale.set(0.028, Math.max(0.002, c.fill * 0.014), 0.028);
          cm.userData.sprig.visible = c.garnish;
        });
        break;
      case 'tomatoes':
        w.toms.forEach((q, i) => {
          const tm = o.toms[i];
          tm.userData.cap.visible = q.cap;
          tm.userData.cut.visible = !q.cap;
          tm.userData.hollow.visible = !q.cap;
          tm.userData.pulp.visible = !q.cap && q.core > 0;
          const oR = tm.userData.openR;
          tm.userData.pulp.scale.set(oR * 0.7 * Math.max(0.3, q.core), 0.008 * q.core + 0.001, oR * 0.7 * Math.max(0.3, q.core));
          tm.userData.fill.visible = q.fill > 0.02;
          tm.userData.fill.scale.set(oR * 0.95, Math.max(0.002, q.fill * 0.014), oR * 0.95);
          tm.userData.sprig.visible = q.garnish;
        });
        break;
      case 'shuba':
        this._syncShuba(s, w, o);
        break;
      case 'canape':
        this._syncCanape(s, w, o);
        break;
      case 'fruit':
        this._syncFruit(s, w, o);
        break;
      case 'chicken':
        o.tex.update();
        o.chicken.visible = !w.inOven;
        o.form.visible = !w.inOven;
        break;
      default:
    }
    this._syncDrag(s);
  }

  _buildTray(s, id, lay, w) {
    const g = this.trayWork;
    const o = {};
    switch (lay) {
      case 'sandwiches': {
        o.butter = [];
        for (const b of w.breads) {
          const bm = F.breadSlice();
          bm.position.set(b.x, 0, b.z);
          g.add(bm);
          const tx = new F.MaskTexture(b.mask, F.COL.butter);
          this.trayTex.push(tx);
          const pl = F.maskPlane(tx, b.w * 0.92, b.d * 0.92, 0.0145);
          pl.position.x = b.x;
          pl.position.z = b.z;
          g.add(pl);
          o.butter.push(tx);
        }
        o.caviar = F.caviarInstances(6 * 4 * 22);
        g.add(o.caviar);
        break;
      }
      case 'eggs':
        o.whole = [];
        o.halves = [];
        for (const e of w.eggs) {
          const wm = F.eggWhole();
          wm.position.set(e.x, 0, e.z);
          g.add(wm);
          o.whole.push(wm);
          o.halves.push(
            e.halves.map((h) => {
              const hm = F.eggHalf();
              hm.position.set(h.x, 0, h.z);
              g.add(hm);
              return hm;
            }),
          );
        }
        break;
      case 'tartlets':
        o.cups = w.cups.map((c) => {
          const cm = F.tartlet();
          cm.position.set(c.x, 0, c.z);
          g.add(cm);
          return cm;
        });
        break;
      case 'tomatoes':
        o.toms = w.toms.map((q) => {
          const tm = F.tomato();
          tm.position.set(q.x, 0, q.z);
          g.add(tm);
          return tm;
        });
        break;
      case 'shuba': {
        const p = F.plate(0.16, 0xffffff, 0x2b5aa8);
        p.position.set(w.dish.x, 0, w.dish.z);
        g.add(p);
        o.layers = new THREE.Group();
        o.layers.position.set(w.dish.x, 0.004, w.dish.z);
        g.add(o.layers);
        o.layerKey = null;
        // миски с компонентами вдоль задней кромки
        o.comps = new THREE.Group();
        g.add(o.comps);
        break;
      }
      case 'canape': {
        // блюдо с местами под хлеб: собирают снизу вверх, сверху — шпажка
        const dish = new THREE.Mesh(F.rbox(0.48, 0.008, 0.21, 0.03), F.m(0xf7f3ea, 0.35));
        dish.position.set(0.0, 0.004, -0.0525);
        dish.receiveShadow = true;
        g.add(dish);
        o.spots = w.stacks.map((b) => {
          const ring = new THREE.Mesh(new THREE.RingGeometry(b.r * 0.82, b.r, 28), new THREE.MeshBasicMaterial({ color: 0xc9a46a, transparent: true, opacity: 0.55, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(b.x, 0.0085, b.z);
          g.add(ring);
          return ring;
        });
        o.piles = CANAPE_PILES.map((p) => {
          const pg = new THREE.Group();
          pg.position.set(p.x, 0, p.z);
          const pl = F.plate(0.045);
          pg.add(pl);
          g.add(pg);
          return pg;
        });
        // стакан со шпажками
        const jar = new THREE.Group();
        jar.position.set(SKEWER_JAR.x, 0, SKEWER_JAR.z);
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.019, 0.06, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xdff1ff, transparent: true, opacity: 0.45, roughness: 0.08, side: THREE.DoubleSide }));
        glass.position.y = 0.03;
        jar.add(glass);
        for (let i = 0; i < 9; i++) {
          const sk = F.skewer();
          sk.scale.set(1, 1, 0.5);
          sk.rotation.x = Math.PI / 2 + Math.cos(i * 2.1) * 0.12;
          sk.rotation.z = Math.sin(i * 1.7) * 0.12;
          sk.position.set(Math.cos(i * 2.4) * 0.01, 0.055, Math.sin(i * 2.4) * 0.01);
          jar.add(sk);
        }
        g.add(jar);
        o.jar = jar;
        o.stackPieces = new THREE.Group();
        g.add(o.stackPieces);
        // шпажка в руке: идёт за мышью, при проколе входит в стопку сверху
        o.handSkewer = F.skewer();
        o.handSkewer.scale.set(1, 1, 0.5);
        o.handSkewer.visible = false;
        g.add(o.handSkewer);
        o.key = null;
        break;
      }
      case 'fruit': {
        const p = F.plate(w.plate.r + 0.01);
        p.position.set(w.plate.x, 0, w.plate.z);
        g.add(p);
        o.mandarins = w.mandarins.map((md) => {
          const mm = F.mandarin(md.peel);
          mm.position.set(md.x, 0, md.z);
          g.add(mm);
          return mm;
        });
        o.segPiles = w.mandarins.map((md) => {
          const sg = new THREE.Group();
          sg.position.set(md.x, 0, md.z);
          g.add(sg);
          return sg;
        });
        o.apple = new THREE.Group();
        o.apple.position.set(FRUIT_PILES.apple.x, 0, FRUIT_PILES.apple.z);
        g.add(o.apple);
        o.grapes = F.grapeBunch();
        o.grapes.position.set(FRUIT_PILES.grapes.x, 0, FRUIT_PILES.grapes.z);
        g.add(o.grapes);
        o.placed = new THREE.Group();
        g.add(o.placed);
        o.key = null;
        break;
      }
      case 'chicken': {
        o.form = F.bakingForm();
        g.add(o.form);
        o.chicken = F.chicken();
        o.chicken.position.y = 0.004;
        g.add(o.chicken);
        // маринад окрашивает саму кожу: белый фон маски не меняет цвет, след кисти — тёплый оранжево-коричневый
        o.tex = new F.MaskTexture(w.mask, 0xe0883a, { alphaMax: 0.85, base: 0xffffff });
        this.trayTex.push(o.tex);
        F.chickenMarinadeMap(o.chicken, o.tex, 0.26, 0.17);
        break;
      }
      default:
    }
    this.trayObjs = o;
  }

  _syncShuba(s, w, o) {
    const key = w.layers.map((l) => l.comp).join(',') + '|' + (w.current ? w.current.comp + (w.current.placed ? '+' : '') : '');
    if (key !== o.layerKey) {
      o.layerKey = key;
      for (const c of o.layers.children.slice()) F.disposeGroup(c);
      if (o.curTex) o.curTex.dispose();
      o.curTex = null;
      w.layers.forEach((l, i) => {
        const col = l.comp === 'mayo' ? F.COL.mayo : PRODUCTS[l.product]?.color ?? 0xffffff;
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(w.dish.r * (0.98 - i * 0.012), w.dish.r * (0.99 - i * 0.012), 0.009, 40), F.m(col, l.comp === 'mayo' ? 0.5 : 0.8));
        disc.position.y = 0.006 + i * 0.009;
        disc.castShadow = true;
        o.layers.add(disc);
      });
      if (w.current) {
        const col = w.current.comp === 'mayo' ? F.COL.mayo : PRODUCTS[w.current.product]?.color ?? 0xffffff;
        o.curTex = new F.MaskTexture(w.current.mask, col);
        const pl = F.maskPlane(o.curTex, w.dish.r * 2, w.dish.r * 2, 0.012 + w.layers.length * 0.009, true);
        o.layers.add(pl);
        o.curPlane = pl;
      }
      // компоненты у задней кромки
      for (const c of o.comps.children.slice()) F.disposeGroup(c);
      const comps = s.shubaComponents('shuba');
      comps.forEach((c, i) => {
        const bowl = F.plate(0.035);
        bowl.position.set(-0.24 + i * 0.08, 0, -0.165);
        if (c.available) {
          const mound = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), F.m(c.comp === 'mayo' ? F.COL.mayo : PRODUCTS[c.product]?.color ?? 0xffffff, 0.8));
          mound.scale.y = 0.6;
          bowl.add(mound);
        }
        o.comps.add(bowl);
      });
    }
    o.curTex?.update();
  }

  // Высота кусочка канапе на стопке: кубик хлеба и сыра — 2 см, кружок колбасы и огурца — 0,7 см.
  _canapeH(product) {
    return product === 'sausage' || product === 'cucumber' ? 0.007 : 0.02;
  }

  _syncCanape(s, w, o) {
    const sup = s.canapeSupply('canape');
    const key = w.stacks.map((b) => b.pieces.map((p) => p.product[0]).join('') + (b.pierced ? '*' + b.tilt.toFixed(1) : '')).join('|') + JSON.stringify(sup);
    if (key !== o.key) {
      o.key = key;
      for (const c of o.stackPieces.children.slice()) F.disposeGroup(c);
      for (const b of w.stacks) {
        const sg = new THREE.Group();
        sg.position.set(b.x, 0.008, b.z);
        let y = 0;
        // проколотое канапе чуть кренится, если шпажка вошла вкось
        if (b.pierced) sg.rotation.z = -(b.tilt * Math.PI) / 180 * 0.35;
        for (const p of b.pieces) {
          const pm = F.canapePiece(p.product);
          const h = this._canapeH(p.product);
          if (h < 0.01) {
            pm.rotation.x = Math.PI / 2;
            pm.position.y = y + h / 2;
          } else pm.position.y = y + h;
          y += h;
          sg.add(pm);
        }
        if (b.pierced) {
          const sk = F.skewer();
          sk.scale.set(1, 1, 0.5);
          sk.rotation.x = Math.PI / 2;
          sk.position.y = 0.004 + 0.0525;
          sg.add(sk);
        }
        b._top = y;
        o.stackPieces.add(sg);
      }
      CANAPE_PILES.forEach((p, i) => {
        const pg = o.piles[i];
        for (const c of pg.children.slice(1)) F.disposeGroup(c);
        const n = Math.min(8, sup[p.product] ?? 0);
        for (let k = 0; k < n; k++) {
          const pm = F.canapePiece(p.product);
          const a = k * 2.4, r = Math.sqrt(k / 8) * 0.025;
          pm.position.set(Math.cos(a) * r, 0.02 + (k % 2) * 0.006, Math.sin(a) * r);
          pm.scale.setScalar(0.85);
          pg.add(pm);
        }
      });
    }
    // места без хлеба подсвечены, пока стопка не начата
    w.stacks.forEach((b, i) => (o.spots[i].visible = !b.pieces.length));
    // шпажка в руке
    const pr = s.tray.pierce;
    const hs = o.handSkewer;
    hs.visible = s.tool === 'skewer' && (!!pr || !!this.pointerLocal);
    if (!hs.visible) return;
    hs.rotation.set(Math.PI / 2, 0, 0);
    if (pr) {
      const b = w.stacks[pr.stack];
      const top = 0.008 + (b._top ?? 0.05);
      const tip = top + 0.03 - pr.depth * (top + 0.03 - 0.012);
      hs.position.set(b.x + THREE.MathUtils.clamp(pr.dx, -0.03, 0.03) * 0.4, tip + 0.0525, b.z);
      hs.rotation.z = -THREE.MathUtils.clamp(pr.dx * 8, -0.5, 0.5);
    } else {
      const p = this.pointerLocal;
      hs.position.set(p.x, 0.12, p.z);
    }
  }

  _syncFruit(s, w, o) {
    w.mandarins.forEach((md, i) => {
      F.setMandarinPeel(o.mandarins[i], md.peel);
      o.mandarins[i].visible = !md.split;
    });
    const key = w.placed.length + '|' + w.mandarins.map((m) => m.left + (m.split ? 's' : '')).join(',') + '|' + w.apple + '|' + w.grapes + '|' + w.placed.map((p) => p.x.toFixed(3)).join(',');
    if (key === o.key) return;
    o.key = key;
    for (const c of o.placed.children.slice()) F.disposeGroup(c);
    for (const p of w.placed) {
      const pm = p.fruit === 'mandarin' ? F.mandarinSegment() : p.fruit === 'apple' ? F.appleSlice() : F.grapes();
      pm.position.set(p.x, 0.014, p.z);
      pm.rotation.y = p.rot;
      o.placed.add(pm);
    }
    w.mandarins.forEach((md, i) => {
      const sg = o.segPiles[i];
      for (const c of sg.children.slice()) F.disposeGroup(c);
      for (let k = 0; k < md.left; k++) {
        const seg = F.mandarinSegment();
        seg.position.set(Math.cos(k * 0.8) * 0.02, 0, Math.sin(k * 0.8) * 0.02);
        seg.rotation.y = k * 0.8;
        sg.add(seg);
      }
    });
    for (const c of o.apple.children.slice()) F.disposeGroup(c);
    for (let k = 0; k < w.apple; k++) {
      const sl = F.appleSlice();
      sl.position.set(0, k * 0.003, 0);
      sl.rotation.y = k * 0.3;
      o.apple.add(sl);
    }
    o.grapes.visible = w.grapes > 0;
  }

  _syncDrag(s) {
    const d = s.tray.drag;
    if (!d) {
      if (this.dragGhost) {
        F.disposeGroup(this.dragGhost);
        this.dragGhost = null;
        this.dragKind = null;
      }
      return;
    }
    const kind = d.kind === 'canape' ? d.product : d.fruit;
    if (this.dragKind !== kind) {
      if (this.dragGhost) F.disposeGroup(this.dragGhost);
      this.dragGhost = d.kind === 'canape' ? F.canapePiece(kind) : kind === 'mandarin' ? F.mandarinSegment() : kind === 'apple' ? F.appleSlice() : F.grapes();
      this.dragKind = kind;
      this.trayWork.add(this.dragGhost);
    }
    this.dragGhost.position.set(d.x, 0.05, d.z);
  }

  // ---------- раковина и лужи ----------
  _updateSink(s, t) {
    // остужаем под краном: горячее в дуршлаге, струя из крана, пар уходит
    const cool = s.sinkCool;
    const ckey = cool ? cool.product : null;
    if (ckey !== this.coolKey) {
      this.coolKey = ckey;
      if (this.coolFood) {
        F.disposeGroup(this.coolFood);
        this.coolFood = null;
      }
      if (cool) {
        const g = new THREE.Group();
        const colander = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdfe5ea, metalness: 0.6, roughness: 0.3, side: THREE.DoubleSide }));
        colander.position.y = 0.11;
        g.add(colander);
        const egg = cool.product === 'egg';
        const col = PRODUCTS[cool.product]?.peel ?? PRODUCTS[cool.product]?.color ?? 0xe0c080;
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(egg ? 0.024 : 0.032, 12, 9), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }));
          m.scale.set(egg ? 0.85 : 1.2, egg ? 1.15 : 0.85, 1);
          m.position.set(Math.cos(i * 1.3) * 0.045, 0.035 + (i % 2) * 0.02, Math.sin(i * 1.3) * 0.045);
          g.add(m);
        }
        g.scale.setScalar(0.85);
        g.position.set(0, 0, 0.06);
        this.sinkItem.add(g);
        this.coolFood = g;
        if (!this.tapStream) {
          this.tapStream = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.012, 0.13, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xa8dcff, transparent: true, opacity: 0.75, roughness: 0.05, metalness: 0.1, emissive: 0x16384f }));
          this.tapStream.position.set(0, 0.075, -0.1);
          this.sinkItem.add(this.tapStream);
          this.coolSteam = [];
          for (let i = 0; i < 7; i++) {
            const st = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
            st.userData.ph = i / 7;
            this.sinkItem.add(st);
            this.coolSteam.push(st);
          }
        }
      }
    }
    if (this.tapStream) {
      const open = !!cool?.open;
      this.tapStream.visible = open;
      if (open) this.tapStream.scale.set(1 + Math.sin(t * 40) * 0.08, 1, 1 + Math.cos(t * 37) * 0.08);
      const heatLeft = cool ? 1 - Math.min(1, cool.run / s.cfg.cool.underTap) : 0;
      this.coolSteam.forEach((st, i) => {
        st.visible = !!cool && heatLeft > 0.05;
        if (!st.visible) return;
        const ph = (t * 0.5 + st.userData.ph) % 1;
        st.position.set(Math.sin(i * 2.1 + t) * 0.04, 0.08 + ph * 0.22, 0.02 + Math.cos(i * 1.7) * 0.03);
        st.scale.setScalar(0.6 + ph * 1.5);
        st.material.opacity = (1 - ph) * 0.35 * heatLeft;
      });
    }
    const job = s.sinkJob;
    const key = job ? job.item : null;
    if (key !== this.washKey) {
      this.washKey = key;
      for (const c of this.sinkItem.children.slice()) F.disposeGroup(c);
      this.washTex?.dispose();
      this.washTex = null;
      if (job) {
        let model;
        if (job.item === 'bowl') {
          model = new THREE.Mesh(new THREE.LatheGeometry([0.03, 0.09, 0.12, 0.13].map((r, i) => new THREE.Vector2(r, i * 0.025)), 28), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
        } else if (job.item === 'tray') {
          model = F.trayModel(0.32, 0.22);
        } else if (job.item === 'board') {
          model = new THREE.Mesh(F.rbox(0.3, 0.02, 0.2, 0.015), F.m(0xd9a866, 0.7));
        } else model = F.bakingForm();
        if (job.item === 'form') model.scale.setScalar(0.9);
        this.sinkItem.add(model);
        this.washTex = new F.MaskTexture(job.mask, 0x8a6a3a, { invert: true, alphaMax: 0.75 });
        const pl = F.maskPlane(this.washTex, SINK.w, SINK.d, job.item === 'bowl' ? 0.02 : 0.02);
        this.sinkItem.add(pl);
      }
    }
    this.washTex?.update();
    const washing = s.panel === 'sink' && !!job;
    this.sponge.visible = washing;
    this.foam.visible = washing && job.mask.coverage() > 0.05;
    if (washing && this.pointerLocal) {
      const a = CLAYOUT.stations.sink.anchor;
      this.sponge.position.set(a.x + this.pointerLocal.x, ISLAND_H + 0.04 + (s.pointerDown ? 0 : 0.02), a.z + this.pointerLocal.z);
    }
    if (this.foam.visible) this.foam.children.forEach((b, i) => (b.scale.setScalar(0.7 + Math.sin(t * 3 + i) * 0.2)));
  }

  _updatePuddles(s, t) {
    const alive = new Set();
    for (const p of s.puddles) {
      alive.add(p.id);
      let mesh = this.puddleMeshes.get(p.id);
      if (!mesh) {
        mesh = new THREE.Group();
        const tx = new F.MaskTexture(p.mask, p.source === 'spill' ? 0xb02844 : 0x9fd3ef, { invert: true, alphaMax: 0.75 });
        const pl = F.maskPlane(tx, PUDDLE.w, PUDDLE.d, 0.006, true);
        mesh.add(pl);
        const hit = new THREE.Mesh(new THREE.CircleGeometry(p.r + 0.1, 20), new THREE.MeshBasicMaterial({ visible: false }));
        hit.rotation.x = -Math.PI / 2;
        hit.position.y = 0.01;
        mesh.add(hit);
        mesh.userData = { tex: tx, hit };
        mesh.position.set(p.x, 0, p.z);
        this.root.add(mesh);
        this.puddleMeshes.set(p.id, mesh);
      }
      mesh.userData.tex.update();
    }
    for (const [id, mesh] of this.puddleMeshes) {
      if (!alive.has(id)) {
        mesh.userData.tex.dispose();
        F.disposeGroup(mesh);
        this.puddleMeshes.delete(id);
      }
    }
    const wiping = s.panel === 'puddle';
    this.ragModel.visible = wiping;
    const p = s._activePuddle();
    if (wiping && p && this.pointerLocal) this.ragModel.position.set(p.x + this.pointerLocal.x, s.pointerDown ? 0.004 : 0.02, p.z + this.pointerLocal.z);
  }

  // ---------- праздничный стол ----------
  setTableDishes(list) {
    this.tableBase = list;
  }

  _updateTable(s, mode) {
    const base = this.tableBase ?? [];
    // в финале без только что сделанной расстановки (открыт из меню) — все блюда на местах по порядку
    const fresh = s.day.finalServe && (mode !== 'final' || Object.keys(s.table.placed).length === DISH_ORDER.length);
    const placed = fresh ? s.table.placed : null;
    const entries = [];
    if (placed) for (const [id, slot] of Object.entries(placed)) entries.push([id, slot]);
    else {
      for (const id of DISH_ORDER) if (base.includes(id) || s.dishes[id]?.done) entries.push([id, DISH_ORDER.indexOf(id)]);
    }
    const key = entries.map((e) => e.join(':')).join(',');
    if (key !== this.tableKey) {
      this.tableKey = key;
      const want = new Map(entries);
      for (const [id, g] of this.tableDishMeshes) {
        if (!want.has(id)) {
          F.disposeGroup(g);
          this.tableDishMeshes.delete(id);
        }
      }
      for (const [id, slot] of entries) {
        let g = this.tableDishMeshes.get(id);
        if (!g) {
          g = F.servedDish(id);
          g.scale.setScalar(0.9);
          this.tableDishes.add(g);
          this.tableDishMeshes.set(id, g);
        }
        const sl = TABLE_SLOTS[slot];
        g.position.set(sl.x, 0, sl.z);
      }
    }
    this.slotMarks.visible = !!placed && s.panel === 'table';
    this.tableLight.intensity = mode === 'final' ? 2.5 : entries.length ? 0.6 : 0;
  }
}

// Лёгкие частицы для обратной связи: крошки при нарезке, соль, брызги, конфетти. Один InstancedMesh на всё.
class Particles {
  constructor(parent, max = 260) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
    this.list = [];
    this.m = new THREE.Matrix4();
    this.c = new THREE.Color();
  }
  emit(pos, color, n, { spread = 0.05, up = 0.5, life = 1, size = 0.01, gravity = 1 } = {}) {
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.list.push({
        p: pos.clone().add(new THREE.Vector3(Math.cos(a) * r, Math.random() * spread * 0.5, Math.sin(a) * r)),
        v: new THREE.Vector3(Math.cos(a) * r * 3, up * (0.6 + Math.random() * 0.6), Math.sin(a) * r * 3),
        life, max: life, size: size * (0.7 + Math.random() * 0.6), color, gravity,
      });
    }
  }
  update(dt) {
    let k = 0;
    this.list = this.list.filter((q) => (q.life -= dt) > 0);
    for (const q of this.list) {
      q.v.y -= q.gravity * dt;
      q.p.addScaledVector(q.v, dt);
      const sc = q.size * Math.min(1, q.life / q.max + 0.3);
      this.m.makeScale(sc, sc, sc).setPosition(q.p);
      this.mesh.setMatrixAt(k, this.m);
      this.mesh.setColorAt(k, this.c.setHex(q.color));
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() {
    this.list = [];
    this.mesh.count = 0;
  }
}
