// Сцена Three.js: свет, камеры, кухня, персонажи. Читает состояние игры и
// получает события из outbox для чисто визуальных реакций.
import * as THREE from 'three';
import { LAYOUT } from '../game/layout.js';
import { buildTextures } from './textures.js';
import { buildKitchen } from './kitchen.js';
import { buildHeroine, animateHeroine, setExpression } from './heroine.js';
import { buildCat, animateCat } from './cat.js';
import { BoardView } from './board.js';
import { pieceAt } from '../game/cutting.js';

const ease = (k) => k * k * (3 - 2 * k);

export class SceneView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf6dfb8);
    buildTextures();

    // свет: тёплый, как в референсе
    this.hemi = new THREE.HemisphereLight(0xfff3df, 0x9a7650, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffe2b3, 1.9);
    this.sun.position.set(-3, 6, 3.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -5;
    sc.right = 5;
    sc.top = 5;
    sc.bottom = -5;
    sc.near = 1;
    sc.far = 16;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun);
    const fill = new THREE.DirectionalLight(0xffd7a8, 0.45);
    fill.position.set(4, 3, 5);
    this.scene.add(fill);

    this.k = buildKitchen(this.scene);
    this.heroine = buildHeroine();
    this.scene.add(this.heroine);
    this.cat = buildCat();
    this.cat.visible = false;
    this.scene.add(this.cat);
    this.board = new BoardView(this.scene, this.k);

    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.05, 60);
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camFrom = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.camMode = null;
    this.camT = 1;
    this.raycaster = new THREE.Raycaster();
    this.boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hoverStation = null;
    this.time = 0;
    this.reset();
    this.resize();
  }

  reset() {
    this.board.reset();
    this.catVis = { segs: [], seg: 0, t: 0, mode: 'hidden', loot: false };
    this.cat.visible = false;
    this.cat.userData.loot.visible = false;
    this.k.plate.slices.forEach((s) => (s.visible = true));
    this.k.pot.group.position.copy(this.k.potHome);
    this.k.pot.puddle.scale.setScalar(0.001);
    this.k.pot.potatoes.visible = true;
    this.potMove = null;
    this.puddleTarget = 0.001;
    const s = LAYOUT.heroineStart;
    this.heroine.position.set(s.x, 0, s.z);
    this.heroine.rotation.y = Math.PI;
    this.facing = Math.PI;
    this.shake = 0;
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.camMode) this._cameraTarget(this.camMode, this.camPos, this.camLook);
  }

  // Целевая позиция камеры для режима.
  _cameraTarget(mode, pos, look) {
    const aspect = this.camera.aspect;
    if (mode === 'board') {
      const c = this.k.boardCenter;
      const back = aspect < 1.4 ? 1.25 : 1;
      look.set(c.x, c.y, c.z + 0.035);
      pos.set(c.x, c.y + 0.5 * back, c.z + 0.33 * back);
    } else if (mode === 'menu') {
      look.set(-0.35, 1.1, -0.5);
      pos.set(0.15, 1.55, 2.4);
      if (aspect < 1.5) pos.z += 0.8;
    } else {
      look.set(0, 0.72, -0.85);
      const dir = new THREE.Vector3(0, 3.55, 5.45);
      const f = Math.max(1, 1.62 / aspect);
      pos.copy(look).addScaledVector(dir, f);
    }
  }

  setCameraMode(mode, instant = false) {
    if (mode === this.camMode) return;
    this.camFrom.pos.copy(this.camera.position);
    this.camFrom.look.copy(this.camLook);
    this.camMode = mode;
    this._cameraTarget(mode, this.camPos, this.camLook);
    this.camTargetLook = this.camLook.clone();
    this.camT = instant ? 1 : 0;
    if (instant) {
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.camFrom.look.copy(this.camLook);
    }
  }

  _updateCamera(dt) {
    this._cameraTarget(this.camMode, this.camPos, this.camTargetLook ?? this.camLook);
    if (this.camT < 1) this.camT = Math.min(1, this.camT + dt / 0.6);
    const e = ease(this.camT);
    const look = new THREE.Vector3().lerpVectors(this.camFrom.look, this.camTargetLook, e);
    this.camera.position.lerpVectors(this.camFrom.pos, this.camPos, e);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.03;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
    this.camera.lookAt(look);
    this.camLook.copy(look);
  }

  // --- выбор мышью ---
  _ray(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  pickStation(ndc) {
    const hits = this._ray(ndc).intersectObjects(this.k.clickables, false);
    for (const h of hits) if (h.object.userData.station) return h.object.userData.station;
    return null;
  }

  pickBoard(ndc, game) {
    const r = this._ray(ndc);
    this.boardPlane.constant = -(this.k.boardTop + 0.042);
    const p = new THREE.Vector3();
    if (!r.ray.intersectPlane(this.boardPlane, p)) return null;
    const b = this.board.worldToBoard(p);
    const ing = game?.board;
    let pieceId = null;
    if (ing) {
      pieceId = pieceAt(ing.pieces,b.x,b.z)?.id ?? null;
    }
    return { ...b, pieceId };
  }

  setBoardHover(h) {
    this.board.hover = h;
  }

  stationScreen(id) {
    const a = LAYOUT.stations[id].anchor;
    const v = new THREE.Vector3(a.x, a.y + 0.28, a.z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100, visible: v.z < 1 };
  }

  boardToScreen(bx, bz, y = 0.042) {
    const c = this.k.boardCenter;
    const v = new THREE.Vector3(c.x + bx * 0.042, c.y + y, c.z + bz * 0.042).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * this.canvas.clientHeight };
  }

  boardSampleScreen() {
    const v = this.board.sample.getWorldPosition(new THREE.Vector3()).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * 100, y: (-v.y * 0.5 + 0.5) * 100 };
  }

  // --- визуальные реакции на события игры ---
  onEvent(e) {
    const exitP = new THREE.Vector3(-3.9, 0, 2.3);
    const floorP = new THREE.Vector3(-2.2, 0, 0.62);
    const topP = new THREE.Vector3(-1.66, LAYOUT.island.h, 0.48);
    switch (e.type) {
      case 'catStart':
        this.cat.visible = true;
        this.cat.userData.loot.visible = false;
        this.catVis = {
          mode: 'enter',
          t: 0,
          seg: 0,
          segs: [
            { from: new THREE.Vector3(-3.6, 0, 1.7), to: floorP.clone(), dur: 1.3 },
            { from: floorP.clone(), to: topP.clone(), dur: 0.35, arc: 0.35 },
            { from: topP.clone(), to: topP.clone(), dur: 999, mode: 'reach', face: Math.PI / 2 },
          ],
        };
        break;
      case 'catShooed':
      case 'catGone':
      case 'catStole': {
        const cur = this.cat.position.clone();
        const segs = [];
        if (cur.y > 0.05) segs.push({ from: cur.clone(), to: floorP.clone(), dur: 0.3, arc: 0.25 });
        segs.push({ from: segs.length ? floorP.clone() : cur.clone(), to: exitP.clone(), dur: e.type === 'catStole' ? 0.9 : 0.7 });
        this.catVis = { mode: 'flee', t: 0, seg: 0, segs };
        if (e.type === 'catStole') {
          this.cat.userData.loot.visible = true;
          if (e.from === 'plate') {
            const s = this.k.plate.slices.find((x) => x.visible);
            if (s) s.visible = false;
          }
        }
        break;
      }
      case 'potPlaced':
        this.potMove = { from: this.k.pot.group.position.clone(), to: this.k.potOnStove.clone(), t: 0 };
        break;
      case 'spill':
        this.puddleTarget = 1;
        this.shake = 0.6;
        break;
      case 'potatoTaken':
        this.k.pot.potatoes.visible = false;
        break;
      default:
    }
  }

  _updateCat(dt, time) {
    const cv = this.catVis;
    if (!this.cat.visible || !cv.segs.length) return;
    cv.t += dt;
    let seg = cv.segs[cv.seg];
    while (seg && cv.t >= seg.dur) {
      cv.t -= seg.dur;
      cv.seg++;
      seg = cv.segs[cv.seg];
    }
    if (!seg) {
      if (cv.mode === 'flee') {
        this.cat.visible = false;
        this.cat.userData.loot.visible = false;
      }
      cv.segs = [];
      return;
    }
    const k = seg.dur > 100 ? 1 : cv.t / seg.dur;
    const p = new THREE.Vector3().lerpVectors(seg.from, seg.to, k);
    if (seg.arc) p.y += Math.sin(k * Math.PI) * seg.arc;
    const moving = seg.from.distanceToSquared(seg.to) > 1e-6;
    if (moving) this.cat.rotation.y = Math.atan2(seg.to.x - seg.from.x, seg.to.z - seg.from.z);
    else if (seg.face != null) this.cat.rotation.y = seg.face;
    this.cat.position.copy(p);
    animateCat(this.cat, seg.mode ?? 'walk', time, moving ? 1 : 0);
  }

  _heroinePose(game) {
    if (!game) return { pose: 'menu' };
    const a = game.action;
    if (game.heroine.target) return { pose: 'walk' };
    if (a?.type === 'shoo') return { pose: 'shoo' };
    if (a?.type === 'cut') return { pose: 'cut', progress: a.elapsed / a.duration };
    if (a) return { pose: 'work' };
    if (game.holds.mix) return { pose: 'mix' };
    if (game.holds.garland) return { pose: 'reach' };
    if (game.holds.radio) return { pose: 'work' };
    if (game.panel === 'board') return { pose: 'cut', progress: 0 };
    if (game.panel === 'phone') return { pose: 'phone' };
    return { pose: 'idle' };
  }

  update(game, dt, mode) {
    this.time += dt;
    const t = this.time;
    // камера
    let camMode = 'overview';
    if (mode === 'menu') camMode = 'menu';
    else if (game && game.panel === 'board' && !game.isOver()) camMode = 'board';
    this.setCameraMode(camMode);
    this._updateCamera(dt);

    // героиня
    if (game) {
      this.heroine.position.set(game.heroine.x, 0, game.heroine.z);
      let target = game.heroine.facing;
      let diff = ((target - this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      this.facing += diff * Math.min(1, dt * 12);
      this.heroine.rotation.y = this.facing;
      const urgent = game.alerts.some((a) => ['cat', 'pot', 'garland'].includes(a.type)) || (game.phase === 'running' && game.remaining < 30);
      setExpression(this.heroine, urgent || game.phase === 'fail');
    } else {
      this.heroine.position.set(0.25, 0, -0.35);
      this.heroine.rotation.y = -0.15;
      setExpression(this.heroine, true);
    }
    // в крупном плане видны только руки у доски, сама героиня скрыта
    this.heroine.visible = !(camMode === 'board' && this.camT > 0.35);
    const hp = this._heroinePose(game);
    animateHeroine(this.heroine, hp.pose, t, hp.progress);

    // кот в меню сидит на острове
    if (!game) {
      this.cat.visible = true;
      this.cat.userData.loot.visible = false;
      this.cat.position.set(0.95, LAYOUT.island.h, 0.45);
      this.cat.rotation.y = -0.5;
      animateCat(this.cat, 'sit', t, 0);
    } else {
      this._updateCat(dt, t);
    }

    // кастрюля
    const pot = this.k.pot;
    if (this.potMove) {
      this.potMove.t = Math.min(1, this.potMove.t + dt / 0.5);
      pot.group.position.lerpVectors(this.potMove.from, this.potMove.to, ease(this.potMove.t));
      pot.group.position.y += Math.sin(this.potMove.t * Math.PI) * 0.12;
      if (this.potMove.t >= 1) this.potMove = null;
    }
    const boiling = game && (game.potato === 'boiling' || game.potato === 'ready');
    const over = game?.pot.active;
    pot.foam.visible = !!over;
    pot.lid.position.y = 0.21 + (over ? Math.abs(Math.sin(t * 22)) * 0.03 : boiling ? Math.abs(Math.sin(t * 6)) * 0.004 : 0);
    pot.lid.rotation.z = over ? Math.sin(t * 17) * 0.08 : 0;
    pot.steam.forEach((s, i) => {
      s.visible = !!boiling;
      if (!boiling) return;
      const ph = (t * (over ? 0.9 : 0.45) + s.userData.phase) % 1;
      s.position.set(pot.group.position.x + Math.sin(i * 2 + t) * 0.06, pot.group.position.y + 0.25 + ph * 0.6, pot.group.position.z + Math.cos(i * 3) * 0.05);
      s.scale.setScalar(0.6 + ph * 1.6);
      s.material.opacity = (1 - ph) * (over ? 0.6 : 0.3);
    });
    const ps = pot.puddle.scale.x;
    pot.puddle.scale.setScalar(ps + (this.puddleTarget - ps) * Math.min(1, dt * 3));

    // гирлянда
    const g = this.k.garland;
    const broken = game?.garland.broken && !game.garland.repaired;
    const fixing = game?.holds.garland;
    g.bulbs.forEach((b, i) => {
      let on = broken ? 0 : 1.3 + Math.sin(t * 3 + i * 1.7) * 0.5;
      if (fixing) on = Math.random() > 0.6 ? 1.5 : 0;
      b.material.emissiveIntensity = on;
    });
    g.light.intensity = broken && !fixing ? 0 : 2.2;
    this.hemi.intensity = broken ? 1.15 : 1.35;

    // экран телефона мигает при уведомлении
    const radioBroken = !!game?.radio.broken;
    const radioOn = !!game?.radio.enabled && !radioBroken && game.phase === 'running';
    this.k.radio.led.material.color.setHex(radioBroken ? 0xd65037 : radioOn ? 0x64d48b : 0x6c7367);
    this.k.radio.led.material.emissive.setHex(radioBroken ? 0x9a180b : radioOn ? 0x2faa64 : 0x000000);
    this.k.radio.led.material.emissiveIntensity = radioBroken ? .3+Math.abs(Math.sin(t*5))*.5 : radioOn ? .8 : 0;
    this.k.radio.dial.rotation.y = game?.holds.radio ? Math.sin(t*9)*.5 : 0;
    const phoneAlert = game?.alerts.some((a) => a.type === 'phone');
    this.k.phone.screen.material.color.setScalar(phoneAlert ? 0.75 + Math.sin(t * 8) * 0.25 : game?.panel === 'phone' ? 1 : 0.35);

    // подсветка станций
    const inBoard = camMode === 'board';
    for (const [id, ring] of Object.entries(this.k.rings)) {
      const urgent = (id === 'stove' && (over || game?.potato === 'ready')) || (id === 'garland' && broken) || (id === 'phone' && phoneAlert) || (id === 'radio' && radioBroken);
      const locked = game?.phase === 'prestart' && id !== 'stove';
      ring.visible = !!game && !inBoard && !game.isOver() && !locked;
      const hover = this.hoverStation === id;
      ring.material.color.setHex(urgent ? 0xe53935 : 0x2fbf5a);
      ring.material.opacity = (hover ? 0.9 : 0.45) + (urgent || (game?.phase === 'prestart' && id === 'stove') ? Math.sin(t * 6) * 0.25 : 0);
      ring.scale.setScalar(hover ? 1.15 : 1);
    }

    this.board.sync(game, dt, inBoard);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
