// Посудомойка (0.11): дверца с ручкой, окошко и кнопка пуска, выдвижная корзина с посудой, пар после цикла.
// Только читает KitchenSession (s.dishwasher); состояние не меняет. Геометрия стоит в передней плоскости задней
// столешницы (DISHWASHER.zFront): корзина выезжает из-за неё на дверцу, как у настоящей машины под столешницей.
import * as THREE from 'three';
import * as F from './food.js';
import { DISHWASHER as G } from '../campaign/layout.js';
import { CAMPAIGN } from '../campaign/data.js';
import { kitchenMin } from '../campaign/words.js';

const ease = (k) => k * k * (3 - 2 * k);
const steel = () => F.m(0xcdd3d9, 0.34, 0.55);
const HINGE_Y = G.y - G.h / 2; // шарнир внизу дверцы
const RACK_Y = HINGE_Y + 0.11; // корзина лежит над открытой дверцей
const RACK_Z = 0.35; // где корзина стоит выдвинутой (центр, м от стенки)
const RACK_W = 0.5, RACK_D = 0.58;
const STANDING = { tray: 0.2, board: 0.2, form: 0.105 }; // плоская посуда стоит на ребре: поднять на половину её глубины

// Плита с закруглёнными углами в плоскости XY, толщина по z от 0 до d.
function slab(w, h, d, r = 0.012) {
  const sh = new THREE.Shape();
  const x = w / 2, y = h / 2, rr = Math.min(r, x, y);
  sh.moveTo(-x + rr, -y);
  sh.lineTo(x - rr, -y);
  sh.quadraticCurveTo(x, -y, x, -y + rr);
  sh.lineTo(x, y - rr);
  sh.quadraticCurveTo(x, y, x - rr, y);
  sh.lineTo(-x + rr, y);
  sh.quadraticCurveTo(-x, y, -x, y - rr);
  sh.lineTo(-x, -y + rr);
  sh.quadraticCurveTo(-x, -y, -x + rr, -y);
  return new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: false });
}

function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent?.add(o);
  return o;
}

/** Нож: деревянная ручка и стальной клинок с острым концом. Лежит плашмя вдоль x, длина ≈ 0,27 м; центр — у основания клинка. */
export function knifeModel() {
  const g = new THREE.Group();
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.015);
  sh.lineTo(0.12, -0.015);
  sh.quadraticCurveTo(0.17, -0.012, 0.18, 0.017);
  sh.lineTo(0, 0.017);
  sh.closePath();
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.003, bevelEnabled: false });
  blade.rotateX(-Math.PI / 2);
  mesh(blade, F.m(0xd9dee3, 0.25, 0.8), 0, 0.0, 0, g);
  mesh(F.rbox(0.1, 0.017, 0.022, 0.007), F.m(0x6e4426, 0.6), -0.052, 0.0, 0, g);
  for (const x of [-0.085, -0.03]) mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.019, 8), F.m(0xc9ced3, 0.3, 0.8), x, 0.0085, 0, g);
  g.position.x = -0.03;
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

/** Посуда в корзине (и в раковине): модель по id предмета session.equipment. */
export function rackItemModel(id) {
  switch (id) {
    case 'knife':
      return knifeModel();
    case 'bowl': {
      const pts = [0.03, 0.1, 0.16, 0.2].map((r, i) => new THREE.Vector2(r, i * 0.04));
      const g = new THREE.Group();
      mesh(new THREE.LatheGeometry(pts, 28), new THREE.MeshStandardMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.7, roughness: 0.1, side: THREE.DoubleSide }), 0, 0, 0, g);
      mesh(new THREE.TorusGeometry(0.2, 0.006, 6, 28), F.m(0xffffff, 0.4), 0, 0.12, 0, g).rotation.x = Math.PI / 2;
      return g;
    }
    case 'tray':
      return F.trayModel(0.56, 0.4);
    case 'form':
      return F.bakingForm();
    case 'board':
      return mesh(F.rbox(0.6, 0.03, 0.4, 0.02), F.m(0xd9a866, 0.7));
    default:
      return new THREE.Group();
  }
}

export class DishwasherView {
  /** root — куда добавить; tag(obj, id) — пометить меши как кликабельные (CampaignView). */
  constructor(root, tag) {
    this.group = new THREE.Group();
    this.group.position.set(G.x, 0, G.zFront);
    root.add(this.group);
    this.p = 0; // сколько открыта дверца: 0…1 (плавно догоняет состояние)
    this.run = 0; // для мигания
    this.steam = 0;
    this.pressed = 0;
    this.popped = new Map();
    this._shown = '';
    this._build();
    // кликабельны только дверца и рама: корзина и посуда скрываются вместе с родителем, а луч этого не знает
    for (const o of this.hit) tag?.(o, 'dishwasher');
  }

  _build() {
    const g = this.group;
    const dark = F.m(0x353a41, 0.5, 0.3);
    // рама вокруг дверцы: тёмная щель по краю
    this.frame = mesh(new THREE.BoxGeometry(G.w + 0.04, G.h + 0.04, 0.012), dark, 0, G.y, -0.008, g);
    // проём (виден, когда дверца открыта): тёмная ниша с подсветкой снизу
    this.cavity = mesh(new THREE.PlaneGeometry(G.w - 0.04, G.h - 0.04), new THREE.MeshBasicMaterial({ map: this._cavityTexture() }), 0, G.y, 0.0, g);
    this.cavity.castShadow = false;
    this.cavity.visible = false;
    // рельсы корзины
    this.rails = new THREE.Group();
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.012, 0.012, 0.6), F.m(0xaeb6bd, 0.35, 0.7), sx * (RACK_W / 2 + 0.01), RACK_Y - 0.012, 0.3, this.rails);
    g.add(this.rails);
    // корзина с проволочным дном
    this.rack = new THREE.Group();
    const wire = F.m(0xe4e8ec, 0.3, 0.75);
    for (let i = 0; i <= 7; i++) mesh(new THREE.CylinderGeometry(0.0025, 0.0025, RACK_D, 5), wire, -RACK_W / 2 + (RACK_W * i) / 7, 0, 0, this.rack).rotation.x = Math.PI / 2;
    for (let i = 0; i <= 8; i++) mesh(new THREE.CylinderGeometry(0.0025, 0.0025, RACK_W, 5), wire, 0, 0.001, -RACK_D / 2 + (RACK_D * i) / 8, this.rack).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.008, 0.05, RACK_D), wire, sx * (RACK_W / 2), 0.025, 0, this.rack);
    mesh(new THREE.BoxGeometry(RACK_W, 0.05, 0.008), wire, 0, 0.025, RACK_D / 2, this.rack);
    // корзинка для приборов спереди слева
    mesh(F.rbox(0.2, 0.05, 0.12, 0.01), F.m(0xc9d0d6, 0.5, 0.4), G.slots.knife.x, 0.025, G.slots.knife.z - RACK_Z, this.rack);
    this.rack.position.set(0, RACK_Y, -0.35);
    g.add(this.rack);
    // посуда
    this.items = {};
    for (const id of Object.keys(G.slots)) {
      const sl = G.slots[id];
      const holder = new THREE.Group();
      const wrap = new THREE.Group();
      wrap.add(rackItemModel(id));
      if (id in STANDING) {
        // на ребре лицом к камере, наклон назад — как в настоящей корзине; origin модели в центре, поднимаем на половину высоты
        wrap.rotation.x = Math.PI / 2 - 0.2;
        wrap.position.y = STANDING[id];
      } else if (id === 'knife') {
        wrap.position.y = 0.05;
        wrap.rotation.y = sl.ry;
        wrap.rotation.z = 0.08;
      } else wrap.position.y = 0.012;
      holder.add(wrap);
      holder.scale.setScalar(sl.s);
      holder.position.set(sl.x, 0.002, sl.z - RACK_Z);
      holder.visible = false;
      this.rack.add(holder);
      this.items[id] = holder;
    }
    // дверца: шарнир внизу, снаружи сталь, внутри светлая облицовка
    this.door = new THREE.Group();
    this.door.position.set(0, HINGE_Y, 0);
    g.add(this.door);
    this.hit = [this.door, this.frame];
    const body = mesh(slab(G.w, G.h, 0.03, 0.012), steel(), 0, G.h / 2, -0.03, this.door);
    body.castShadow = false;
    mesh(slab(G.w - 0.05, G.h - 0.05, 0.003, 0.01), F.m(0xe9edf0, 0.5, 0.1), 0, G.h / 2, -0.0335, this.door); // внутренняя облицовка (видна, когда дверца лежит)
    // планка управления: в координатах дверцы y = G.h/2 − z, где z — вниз от середины (layout.js)
    mesh(slab(G.w - 0.04, 0.12, 0.004, 0.01), F.m(0x2b2f36, 0.45, 0.2), 0, G.h / 2 - G.start.z, 0.0, this.door);
    // окошко с минутами
    this.dispCanvas = document.createElement('canvas');
    this.dispCanvas.width = 208;
    this.dispCanvas.height = 56;
    this.dispTex = new THREE.CanvasTexture(this.dispCanvas);
    this.dispTex.colorSpace = THREE.SRGBColorSpace;
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(G.display.w, G.display.h), new THREE.MeshBasicMaterial({ map: this.dispTex }));
    disp.position.set(G.display.x, G.h / 2 - G.display.z, 0.0035);
    this.door.add(disp);
    // лампочки: идёт цикл / готово
    this.ledRun = mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: 0xffa21a }), -0.2, G.h / 2 - G.display.z + 0.02, 0.004, this.door);
    this.ledDone = mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: 0x41d36b }), -0.2, G.h / 2 - G.display.z - 0.02, 0.004, this.door);
    // кнопка пуска: круглая, с колечком
    this.button = new THREE.Group();
    this.button.position.set(G.start.x, G.h / 2 - G.start.z, 0.004);
    const cap = mesh(new THREE.CylinderGeometry(G.start.r * 0.8, G.start.r * 0.8, 0.012, 24), F.m(0xe8742a, 0.4, 0.1), 0, 0, 0.006, this.button);
    cap.rotation.x = Math.PI / 2;
    this.buttonCap = cap;
    const ring = mesh(new THREE.TorusGeometry(G.start.r, 0.004, 8, 28), F.m(0xdde3e8, 0.3, 0.8), 0, 0, 0.003, this.button);
    void ring;
    this.door.add(this.button);
    // ручка: хромированный стержень на двух стойках
    const hy = G.h / 2 - G.handle.z;
    mesh(new THREE.CylinderGeometry(0.009, 0.009, G.handle.w, 12), F.m(0xf0f3f5, 0.2, 0.9), 0, hy, 0.045, this.door).rotation.z = Math.PI / 2;
    for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.045, 8), F.m(0xdde3e8, 0.3, 0.8), sx * (G.handle.w / 2 - 0.02), hy, 0.022, this.door).rotation.x = Math.PI / 2;
    // подсказка-свечение у ручки, пока дверца закрыта и на неё ещё не нажимали
    this.handleGlow = mesh(new THREE.PlaneGeometry(G.handle.w + 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff0a8, transparent: true, opacity: 0, depthWrite: false }), 0, hy, 0.051, this.door);
    this.handleGlow.castShadow = false;
    // свечение проёма: приглашает опустить посуду
    this.drop = new THREE.Mesh(new THREE.PlaneGeometry(G.cavity.x * 2, G.cavity.z1 - G.cavity.z0), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0, depthWrite: false }));
    this.drop.position.set(0, G.y - (G.cavity.z0 + G.cavity.z1) / 2, 0.012);
    g.add(this.drop);
    // пар после цикла
    this.puffs = [];
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      p.visible = false;
      p.userData.ph = i / 7;
      g.add(p);
      this.puffs.push(p);
    }
  }

  _cavityTexture() {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, '#59626b');
    gr.addColorStop(0.55, '#8a949c');
    gr.addColorStop(1, '#c4ccd2');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 128);
    const side = x.createLinearGradient(0, 0, 64, 0);
    side.addColorStop(0, 'rgba(20,24,28,0.45)');
    side.addColorStop(0.18, 'rgba(20,24,28,0)');
    side.addColorStop(0.82, 'rgba(20,24,28,0)');
    side.addColorStop(1, 'rgba(20,24,28,0.45)');
    x.fillStyle = side;
    x.fillRect(0, 0, 64, 128);
    x.strokeStyle = 'rgba(255,255,255,0.14)';
    for (let y = 18; y < 128; y += 22) {
      x.beginPath();
      x.moveTo(6, y);
      x.lineTo(58, y);
      x.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _display(text, color) {
    const key = text + color;
    if (key === this._shown) return;
    this._shown = key;
    const x = this.dispCanvas.getContext('2d');
    x.fillStyle = '#0d1a14';
    x.fillRect(0, 0, 208, 56);
    x.fillStyle = color;
    x.font = 'bold 34px "Segoe UI", system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, 104, 30);
    this.dispTex.needsUpdate = true;
  }

  /** Событие сессии: нажатая кнопка и клуб пара. */
  onEvent(e) {
    if (e.type === 'dwPress') this.pressed = 0.18;
    if (e.type === 'dwDone') this.steam = 2.6;
    if (e.type === 'dwLoad') this.popped.set(e.item, 0);
  }

  reset() {
    this.p = 0;
    this.steam = 0;
    this.pressed = 0;
    this.popped.clear();
    this._shown = '';
  }

  /**
   * Кадр. hot — фишка над проёмом (подсветить). Возвращает, какая посуда сейчас в машине и скрыта на своём месте:
   * { bowl, tray, board } (форма и нож постоянных моделей на кухне не имеют).
   */
  sync(s, dt, t, hot = false) {
    const d = s.dishwasher;
    const near = s.panel === 'dishwasher';
    // дверца: за курсором, пока тянут; иначе плавно к своему состоянию
    let target = d.door === 'open' ? 1 : 0;
    if (d.grab) target = d.grab.p;
    const k = d.grab ? 1 : Math.min(1, dt * 7);
    this.p += (target - this.p) * k;
    if (Math.abs(this.p - target) < 0.002) this.p = target;
    const p = this.p;
    this.door.rotation.x = ease(p) * (Math.PI / 2);
    this.cavity.visible = p > 0.02;
    // корзина выезжает из-за стенки на дверцу
    const q = Math.max(0, Math.min(1, (p - 0.35) / 0.65));
    this.rack.position.z = -0.35 + ease(q) * (RACK_Z + 0.35);
    this.rack.visible = p > 0.35;
    this.rails.visible = p > 0.35;
    // посуда
    for (const [id, holder] of Object.entries(this.items)) {
      const here = d.loaded.includes(id);
      holder.visible = here;
      if (!here) continue;
      const pop = this.popped.has(id) ? Math.min(1, this.popped.get(id) + dt * 5) : 1;
      this.popped.set(id, pop);
      const sc = G.slots[id].s * (0.75 + 0.25 * ease(pop));
      holder.scale.setScalar(sc);
    }
    for (const id of [...this.popped.keys()]) if (!d.loaded.includes(id)) this.popped.delete(id);
    // окошко и лампочки
    const run = d.run;
    this.run += dt;
    if (run) {
      this._display(kitchenMin(s.dwLeft(), CAMPAIGN.kitchenScale).replace('меньше минуты', '< 1 мин'), '#ffb43a');
    } else if (d.done && s.t - d.done.at < 25) this._display('Готово', '#59f08a');
    else if (d.loaded.length) this._display(`${d.loaded.length} шт.`, '#9ff0c0');
    else this._display('— —', '#4d7a63');
    this.ledRun.visible = !!run && Math.sin(this.run * 5) > -0.3;
    this.ledDone.visible = !run && !!d.done && s.t - d.done.at < 25;
    // кнопка пуска: вдавливается, пока нажата; светится, когда пора запускать
    this.pressed = Math.max(0, this.pressed - dt);
    this.buttonCap.position.z = 0.006 - (this.pressed > 0 ? 0.004 : 0);
    const ready = near && !run && d.loaded.length > 0 && d.door === 'closed';
    this.button.scale.setScalar(ready ? 1 + Math.sin(t * 5) * 0.06 : 1);
    // ручка подсказывает, за что тянуть
    this.handleGlow.material.opacity = near && d.door === 'closed' && !run && !d.grab && !d.loaded.length ? 0.25 + Math.sin(t * 3.4) * 0.15 : 0;
    // проём приглашает, когда в руке фишка
    const invite = near && d.door === 'open' && !!d.hand;
    this.drop.visible = invite;
    if (invite) this.drop.material.opacity = (hot ? 0.38 : 0.12) + Math.sin(t * 5) * 0.04;
    // идущий цикл: машина тихо дрожит
    this.group.position.x = G.x + (run ? Math.sin(t * 52) * 0.0009 : 0);
    // пар
    this.steam = Math.max(0, this.steam - dt);
    this.puffs.forEach((pf, i) => {
      pf.visible = this.steam > 0;
      if (!pf.visible) return;
      const ph = (1 - this.steam / 2.6 + pf.userData.ph) % 1;
      pf.position.set((i - 3) * 0.07 + Math.sin(t * 2 + i) * 0.02, G.y + G.h / 2 + 0.02 + ph * 0.3, 0.06);
      pf.scale.setScalar(0.6 + ph * 1.4);
      pf.material.opacity = (1 - ph) * 0.35 * Math.min(1, this.steam);
    });
    const loaded = d.loaded;
    return { bowl: loaded.includes('bowl'), tray: loaded.includes('tray'), board: loaded.includes('board') };
  }
}
