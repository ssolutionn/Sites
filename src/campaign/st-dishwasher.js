// Посудомойка (0.11, владелец: «Добавь такой элемент как посудомойка. Она нужна для конца уровня, если ты поставил
// посуду туда (нож + миску + поднос) у тебя не снимаются баллы за грязноту, а на следующий день ты тоже можешь
// поставить в посудомойку приборы, но ты уже будешь вынужден ждать 10 минут»).
//
// Как это работает:
//  • Посуда — всё из session.equipment: нож, миска, поднос, форма, доска. Нож пачкается при любом разрезе
//    (ничего не блокирует, только штраф в конце дня); остальное — как раньше.
//  • Дверца — жест: потяни ручку вниз (открыта при ≥ 70 % хода), подними (закрыта при ≤ 10 %). Фишку посуды
//    из дока перетаскивают в проём; кнопка пуска — на самой дверце (нажатие, не таймер).
//  • Цикл идёт cycleMin кухонных минут (kitchenScale → 40 с игры). Пока он идёт, дверца заперта, а загруженная
//    посуда недоступна («Миска в посудомойке — ещё 6 мин»). Кончился — посуда чистая и снова доступна.
//  • Что стоит в машине к концу дня (запущенное или нет), штрафа за грязную посуду не даёт: к утру оно чистое.
// Чистый модуль: без DOM и Three.js, проверяется в node:test (tests/dishwasher-v11.test.js).
import { DISHWASHER } from './layout.js';
import { kitchenMin } from './words.js';

const EPS = 1e-6;

/** Что можно загрузить, в порядке фишек в доке. */
export const WASHABLE = ['knife', 'bowl', 'tray', 'form', 'board'];

/** События, при которых нож в деле и пачкается: разрез на доске, половинки яйца, крышечка помидора. */
export const KNIFE_EVENTS = new Set(['cut', 'eggSplit', 'tomatoCap']);

/** Отклик на отпускание: что сделала дверца. */
export const DOOR_HINTS = {
  'not-open': 'Потяни ручку ниже — дверца не открылась',
  'not-closed': 'Подними дверцу выше — она не закрылась',
  locked: 'Идёт цикл — дверца заперта',
};

/**
 * Где дверца при жесте: доля хода ручки 0…1 (0 — закрыта, 1 — открыта).
 * from — откуда взяли ('closed' | 'open'), z0 — где нажали, z — где сейчас курсор (локальные метры, z вниз).
 */
export function doorProgress(from, z0, z, travel) {
  const k = from === 'closed' ? (z - z0) / travel : 1 - (z0 - z) / travel;
  return Math.max(0, Math.min(1, k));
}

/**
 * Чем кончился жест. Открыта при p ≥ open, закрыта при p ≤ closed; между — дверца возвращается, откуда её взяли.
 * Возвращает { door: 'open' | 'closed', reason: null | 'not-open' | 'not-closed' }.
 */
export function doorVerdict(from, p, { open, closed }) {
  if (from === 'closed') return p >= open - EPS ? { door: 'open', reason: null } : { door: 'closed', reason: p > EPS ? 'not-open' : null };
  return p <= closed + EPS ? { door: 'closed', reason: null } : { door: 'open', reason: p < 1 - EPS ? 'not-closed' : null };
}

/** Точка (x, z) в проёме открытой дверцы; k — запас (фишка, отпущенная рядом с проёмом, тоже ловится). */
export function inCavity(x, z, k = 1) {
  const c = DISHWASHER.cavity;
  const zc = (c.z0 + c.z1) / 2, zh = ((c.z1 - c.z0) / 2) * k;
  return Math.abs(x) <= c.x * k + EPS && Math.abs(z - zc) <= zh + EPS;
}

export const dishwasherMethods = {
  _initDishwasher() {
    // door — closed | open; loaded — что стоит в машине; hand — предмет, выбранный фишкой; run — идущий цикл
    // { startAt, readyAt, items }; grab — дверца в руке { from, z0, p }; done — чем кончился последний цикл; hum — до следующего шума воды
    this.dishwasher = { door: 'closed', loaded: [], hand: null, run: null, grab: null, done: null, hum: 0 };
  },

  /** Длина цикла в секундах игры. */
  dwCycleSec() {
    return (this.cfg.dishwasher.cycleMin * 60) / this.cfg.kitchenScale;
  },

  /** Сколько секунд игры осталось до конца цикла (0 — не идёт). */
  dwLeft() {
    const r = this.dishwasher.run;
    return r ? Math.max(0, r.readyAt - this.t) : 0;
  },

  /** Предмет сейчас в машине? */
  inWasher(item) {
    return this.dishwasher.loaded.includes(item);
  },

  /** Предмет нельзя взять в работу, потому что он в посудомойке: фраза «что случилось — как исправить» или null. */
  equipBlock(item) {
    if (!this.inWasher(item)) return null;
    const label = this.equipment[item].label;
    return this.dishwasher.run ? `${label} в посудомойке — ещё ${kitchenMin(this.dwLeft(), this.cfg.kitchenScale)}` : `${label} в посудомойке — достань из неё`;
  },

  // Отказ: подсказка не чаще раза в 1,2 с и мягкий звук (событие dwDeny).
  _dwRefuse(text) {
    if (this.clock - (this._dwDenyAt ?? -1e9) >= 1.2) {
      this._dwDenyAt = this.clock;
      this.setHint(text, 2.4);
      this._emit('dwDeny', { text });
    }
    return false;
  },

  /** Нож пачкается при любом разрезе (практика не в счёт). Возвращает true, если стал грязным именно сейчас. */
  _dirtyKnife() {
    const k = this.equipment.knife;
    if (!k || !k.clean || this.practice) return false;
    k.clean = false;
    this._emit('dirty', { item: 'knife' });
    return true;
  },

  /** Выбрать предмет фишкой (повторно — убрать из руки). Грязный и не в машине. */
  dwPick(item) {
    const d = this.dishwasher;
    if (!this._isIdleAt('dishwasher') || this.action) return false;
    if (d.hand === item) {
      d.hand = null;
      return true;
    }
    const e = this.equipment[item];
    if (!e || !WASHABLE.includes(item) || e.clean || d.loaded.includes(item)) return false;
    d.hand = item;
    this._emit('dwPick', { item });
    return true;
  },

  /** Положить предмет (по умолчанию тот, что в руке) в открытую машину. */
  dwLoad(item = this.dishwasher.hand) {
    const d = this.dishwasher;
    if (!this._isIdleAt('dishwasher') || this.action) return false;
    const e = this.equipment[item];
    if (!e || !WASHABLE.includes(item) || d.loaded.includes(item)) return false;
    if (d.run) return this._dwRefuse(DOOR_HINTS.locked);
    if (d.door !== 'open') return this._dwRefuse('Дверца закрыта — потяни ручку вниз');
    if (e.clean) return this._dwRefuse(`${e.cleanText} — мыть не нужно`);
    if (item === 'board' && Object.keys(this.board.items).length) return this._dwRefuse('На доске ещё продукты — сначала доделай нарезку');
    d.loaded.push(item);
    d.hand = null;
    d.done = null;
    this._emit('dwLoad', { item, loaded: d.loaded.slice() });
    return true;
  },

  /** Фишку отпустили в точке (x, z) плоскости дверцы: в проёме — положить, мимо — вернуть в док. */
  dwDrop(item, x, z) {
    const d = this.dishwasher;
    if (d.door === 'open' && !d.run && inCavity(x, z, this.cfg.dishwasher.drop)) return this.dwLoad(item);
    d.hand = null;
    return this._dwRefuse(d.door === 'open' ? 'Опусти посуду в проём посудомойки' : d.run ? DOOR_HINTS.locked : 'Дверца закрыта — потяни ручку вниз');
  },

  /** Достать незапущенное: дверца открыта, цикл не идёт. */
  dwTake(item) {
    const d = this.dishwasher;
    if (!this._isIdleAt('dishwasher') || this.action || !d.loaded.includes(item)) return false;
    if (d.run) return this._dwRefuse(`Идёт цикл — ещё ${kitchenMin(this.dwLeft(), this.cfg.kitchenScale)}`);
    if (d.door !== 'open') return this._dwRefuse('Дверца закрыта — потяни ручку вниз');
    d.loaded = d.loaded.filter((i) => i !== item);
    this._emit('dwTake', { item });
    return true;
  },

  /** Запустить цикл: дверца закрыта, внутри есть посуда. Кнопка на самой дверце или «Запустить» в доке. */
  dwStart() {
    const d = this.dishwasher;
    if (!this._isIdleAt('dishwasher') || this.action) return false;
    if (d.run) return this._dwRefuse(`Цикл уже идёт — ещё ${kitchenMin(this.dwLeft(), this.cfg.kitchenScale)}`);
    if (d.door === 'open') return this._dwRefuse('Закрой дверцу — подними её вверх');
    if (!d.loaded.length) return this._dwRefuse('В машине пусто — сначала загрузи посуду');
    const sec = this.dwCycleSec();
    d.run = { startAt: this.t, readyAt: this.t + sec, items: d.loaded.slice() };
    d.hum = 0;
    d.done = null;
    this._emit('dwStart', { items: d.run.items.slice(), min: this.cfg.dishwasher.cycleMin, sec });
    this.setHint(`Запустила — будет готово через ${kitchenMin(sec, this.cfg.kitchenScale)}`, 3);
    return true;
  },

  _dwSetDoor(open) {
    const d = this.dishwasher;
    const want = open ? 'open' : 'closed';
    if (d.door === want) return;
    d.door = want;
    if (!open) d.hand = null;
    this._emit('dwDoor', { open });
  },

  // Указатель на плоскости дверцы (локальные метры, z вниз): кнопка пуска, фишка в руке → проём, ручка дверцы.
  _dwPointer(type, x, z) {
    const d = this.dishwasher, G = DISHWASHER, door = this.cfg.dishwasher.door;
    if (type === 'down') {
      if (d.door === 'closed' && Math.hypot(x - G.start.x, z - G.start.z) <= G.start.r * 1.2) {
        this._emit('dwPress');
        return this.dwStart() ? 'start' : 'denied';
      }
      if (d.door === 'open' && d.hand && inCavity(x, z, this.cfg.dishwasher.drop)) return this.dwLoad() ? 'load' : 'denied';
      if (d.door === 'closed' && Math.abs(x) <= G.grab.x && z >= G.grab.z0 && z <= G.grab.z1) {
        if (d.run) {
          this._dwRefuse(`${DOOR_HINTS.locked} — ещё ${kitchenMin(this.dwLeft(), this.cfg.kitchenScale)}`);
          return 'locked';
        }
        d.grab = { from: 'closed', z0: z, p: 0 };
        return 'grab';
      }
      if (d.door === 'open' && z >= G.closeFrom) {
        d.grab = { from: 'open', z0: z, p: 1 };
        return 'grab';
      }
      return 'ignored';
    }
    const g = d.grab;
    if (!g) return 'hover';
    g.p = doorProgress(g.from, g.z0, z, door.travel);
    // дошла до конца хода — дверца встала на место сразу, не дожидаясь отпускания
    if (g.from === 'closed' && g.p >= 1 - EPS) {
      d.grab = null;
      this._dwSetDoor(true);
      return 'opened';
    }
    if (g.from === 'open' && g.p <= EPS) {
      d.grab = null;
      this._dwSetDoor(false);
      return 'closed';
    }
    return 'drag';
  },

  // Отпустила кнопку: дверца встаёт открытой/закрытой по доле хода или возвращается, откуда её взяли.
  _dwRelease() {
    const d = this.dishwasher;
    const g = d?.grab;
    if (!g) return;
    d.grab = null;
    const v = doorVerdict(g.from, g.p, this.cfg.dishwasher.door);
    this._dwSetDoor(v.door === 'open');
    if (v.reason) this._dwRefuse(DOOR_HINTS[v.reason]);
  },

  _updateDishwasher(h) {
    const d = this.dishwasher;
    // отошла от машины — закрыла дверцу и убрала посуду из рук
    if (this.panel !== 'dishwasher') {
      if (d.door === 'open') this._dwSetDoor(false);
      d.hand = null;
      d.grab = null;
    }
    const r = d.run;
    if (!r) return;
    d.hum -= h;
    if (d.hum <= 0) {
      d.hum = this.cfg.dishwasher.hum;
      this._emit('dwHum');
    }
    if (this.t >= r.readyAt - EPS) this._dwFinish();
  },

  // Цикл кончился: всё, что было в машине, чистое и снова доступно.
  _dwFinish() {
    const d = this.dishwasher;
    const items = d.run.items;
    for (const id of items) {
      const e = this.equipment[id];
      e.clean = true;
      if ('by' in e) e.by = null;
    }
    d.loaded = d.loaded.filter((i) => !items.includes(i));
    d.run = null;
    d.done = { at: this.t, items: items.slice() };
    this._emit('dwDone', { items: items.slice() });
  },

  /** Что стоит в машине к концу дня (подписи): к утру оно чистое, штрафа за грязь нет. */
  overnightItems() {
    return this.dishwasher.loaded.map((id) => this.equipment[id].label);
  },
};
