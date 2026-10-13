// Дверца духовки как жест (0.11, G1.3; владелец: «сам механизм, где мы что-то нажимаем и оно происходит само, мне не нравится»).
//
// Как это работает:
//  • Станция «духовка» — крупный план дверцы. Ручку тянут вниз: открыта при ≥ 70 % хода (CAMPAIGN.oven.door.open),
//    поднимают обратно: закрыта при ≤ 10 %. Тот же жест и те же функции doorProgress/doorVerdict, что у посудомойки.
//  • Форму с курицей (фишка в доке) перетаскивают в проём открытой духовки — запекание началось.
//  • Готовую форму берут рукой за курицу в проёме и вытаскивают из проёма вниз — на стол; рано — возвращается сырой, как раньше.
//  • Ушла от духовки — дверца закрывается сама. Кнопок «Поставить форму» / «Достать курицу» нет (ovenLoad и ovenTake остаются API).
// Чистый модуль: без DOM и Three.js (tests/oven-gesture-v11.test.js).
import { OVEN } from './layout.js';
import { doorProgress, doorVerdict } from './st-dishwasher.js';

const EPS = 1e-6;

/** Фразы отказа (что случилось — как исправить). */
export const OVEN_HINTS = {
  'not-open': 'Потяни ручку ниже — дверца духовки не открылась',
  'not-closed': 'Подними дверцу выше — она не закрылась',
  closed: 'Духовка закрыта — потяни ручку дверцы вниз',
  miss: 'Опусти форму в проём открытой духовки',
  stay: 'Вытащи форму из проёма вниз, на стол',
};

/** Точка (x, z) плоскости дверцы в проёме открытой духовки; k — запас вокруг. */
export function inOvenCavity(x, z, k = 1) {
  const c = OVEN.cavity;
  const zc = (c.z0 + c.z1) / 2, zh = ((c.z1 - c.z0) / 2) * k;
  return Math.abs(x) <= c.x * k + EPS && Math.abs(z - zc) <= zh + EPS;
}

export const ovenMethods = {
  _initOvenDoor() {
    // door — closed | open; grab — дверца в руке { from, z0, p }; drag — форма в руке, вынимаемая из проёма { x, z }
    this.ovenDoor = { door: 'closed', grab: null, drag: null, loadHot: false };
  },

  _ovenRefuse(text) {
    if (this.clock - (this._ovenDenyAt ?? -1e9) >= 1.2) {
      this._ovenDenyAt = this.clock;
      this.setHint(text, 2.4);
      this._emit('ovenDeny', { text });
    }
    return false;
  },

  _ovenSetDoor(open) {
    const d = this.ovenDoor;
    const want = open ? 'open' : 'closed';
    if (d.door === want) return;
    d.door = want;
    this._emit('ovenDoor', { open });
  },

  /** Форму из дока отпустили в точке (x, z) плоскости дверцы: в проёме открытой духовки — поставить, мимо — подсказка. */
  ovenDrop(x, z) {
    const d = this.ovenDoor;
    if (this.oven.state !== 'empty') return this._ovenRefuse('В духовке уже есть форма — достань её');
    if (d.door !== 'open') return this._ovenRefuse(OVEN_HINTS.closed);
    if (!inOvenCavity(x, z, this.cfg.oven.drop)) return this._ovenRefuse(OVEN_HINTS.miss);
    return this.ovenLoad();
  },

  // Указатель на плоскости дверцы: взять ручку (закрытую — за любое место, открытую — ниже проёма), взять курицу в проёме.
  _ovenPointer(type, x, z) {
    const d = this.ovenDoor, G = OVEN, door = this.cfg.oven.door;
    if (type === 'down') {
      if (d.door === 'closed' && Math.abs(x) <= G.grab.x && z >= G.grab.z0 && z <= G.grab.z1) {
        d.grab = { from: 'closed', z0: z, p: 0 };
        return 'grab';
      }
      if (d.door === 'open') {
        // форма в проёме: взять рукой и тащить вниз
        if (this.oven.state !== 'empty' && inOvenCavity(x, z, 1)) {
          d.drag = { x, z };
          return 'form';
        }
        if (z >= G.closeFrom) {
          d.grab = { from: 'open', z0: z, p: 1 };
          return 'grab';
        }
      }
      return 'ignored';
    }
    if (type === 'up') {
      const g = d.drag;
      if (!g) return 'up';
      d.drag = null;
      // отпустила ниже проёма — форма на столе (рано — вернулась сырой, подсказку скажет ovenTake)
      if (z >= G.cavity.z1 + this.cfg.oven.takeOut) return this.ovenTake() ? 'take' : 'stay';
      this._ovenRefuse(OVEN_HINTS.stay);
      return 'stay';
    }
    if (d.drag) {
      d.drag.x = x;
      d.drag.z = z;
      return 'dragForm';
    }
    const g = d.grab;
    if (!g) return 'hover';
    g.p = doorProgress(g.from, g.z0, z, door.travel);
    // дошла до конца хода — дверца встала на место сразу, не дожидаясь отпускания
    if (g.from === 'closed' && g.p >= 1 - EPS) {
      d.grab = null;
      this._ovenSetDoor(true);
      return 'opened';
    }
    if (g.from === 'open' && g.p <= EPS) {
      d.grab = null;
      this._ovenSetDoor(false);
      return 'closed';
    }
    return 'drag';
  },

  // Отпустила кнопку: дверца встаёт открытой/закрытой по доле хода или возвращается, откуда её взяли.
  _ovenRelease() {
    const d = this.ovenDoor;
    if (!d) return;
    d.drag = null;
    const g = d.grab;
    if (!g) return;
    d.grab = null;
    const v = doorVerdict(g.from, g.p, this.cfg.oven.door);
    this._ovenSetDoor(v.door === 'open');
    if (v.reason) this._ovenRefuse(OVEN_HINTS[v.reason]);
  },

  _updateOvenDoor() {
    // отошла от духовки — закрыла дверцу
    if (this.panel !== 'oven' && this.ovenDoor.door === 'open') this._ovenSetDoor(false);
    if (this.panel !== 'oven') {
      this.ovenDoor.grab = null;
      this.ovenDoor.drag = null;
    }
  },
};
