// Состояние одного игрового дня кампании. Без DOM и Three.js.
// Единый игровой clock: update(dt) двигает ходьбу, действия, плиту, духовку, доставку и помехи.
// Представление читает состояние и отправляет команды; количество продуктов и оценку не меняет.

import { CAMPAIGN, DAYS, RECIPES, PRODUCTS, stepProducts, stationOfStep } from './data.js';
import { CLAYOUT, CLOSEUP_STATIONS } from './layout.js';
import { Inventory } from './inventory.js';
import { NavGrid } from './nav.js';
import { createRng } from '../game/rng.js';
import { dishScore, dayScore } from './scoring.js';
import { boardMethods } from './st-board.js';
import { bowlMethods } from './st-bowl.js';
import { trayMethods } from './st-tray.js';
import { homeMethods } from './st-home.js';
import { phoneMethods } from './st-phone.js';
import { extraMethods } from './st-extra.js';

const EPS = 1e-6;
export const URGENT = new Set(['cat', 'pot', 'pot2', 'oven', 'spillWarn']);

export function buildNav() {
  const nav = new NavGrid({ ...CLAYOUT.bounds, cell: 0.1, radius: 0.2 });
  for (const [x0, z0, x1, z1] of CLAYOUT.obstacles.rects) nav.addRect(x0, z0, x1, z1);
  for (const c of CLAYOUT.obstacles.circles) nav.addCircle(c.x, c.z, c.r);
  return nav;
}

export class KitchenSession {
  constructor({ dayIndex = 0, seed = 1, cfg = CAMPAIGN, practice = null, tableDishes = [], mods = {} } = {}) {
    this.cfg = cfg;
    this.mods = mods;
    this.seed = seed;
    this.rng = createRng(seed);
    this.practice = practice;
    this.dayIndex = dayIndex;
    this.day = practice ? practiceDay(practice) : DAYS[dayIndex];
    this.t = 0;
    this.clock = 0;
    this.phase = 'kitchen'; // kitchen | ready (всё готово) | finished
    this._nextId = 1;
    this.outbox = [];
    this.alerts = [];
    this.hint = null;
    this.result = null;

    this.inventory = new Inventory(practice ? infiniteStock() : this.day.stock);
    this.nav = buildNav();
    const s = CLAYOUT.start;
    this.heroine = { x: s.x, z: s.z, facing: Math.PI, path: [], target: null, station: null, moving: false, away: false, awayLeft: 0, returnTo: null };
    this.action = null;
    this.panel = null;
    this.holds = { radio: false, garland: false };
    this.pointerDown = false;

    this.equipment = {
      bowl: { clean: !this.day.dirty?.includes('bowl'), owner: null, label: 'Миска', cleanText: 'Миска чистая' },
      tray: { clean: !this.day.dirty?.includes('tray'), owner: null, label: 'Поднос', cleanText: 'Поднос чистый' },
      form: { clean: true, owner: null, label: 'Форма для запекания', cleanText: 'Форма чистая' },
      board: { clean: true, owner: null, label: 'Доска', cleanText: 'Доска чистая', by: null },
    };

    this.recipes = practice ? { practice: this.day.recipe } : Object.fromEntries(this.day.dishes.map((id) => [id, RECIPES[id]]));
    this.dishes = {};
    this._seasonRng = createRng((seed * 7919 + 17) >>> 0);
    for (const id of Object.keys(this.recipes)) this.dishes[id] = this._createDish(id);
    this.request = this.day.request ?? null;
    this.requestKnown = false;

    this.board = { current: null, items: {}, grated: null, stroke: null };
    this.bowl = { owner: null, contents: [], stirrer: null, mixStep: null };
    this.workPlate = { owner: null, amount: 0 };
    this.spoon = { load: 0 };
    this.tool = 'hand';
    this.tray = { owner: null, drag: null };

    this.burners = Array.from({ length: cfg.burners ?? 1 }, (_, i) => emptyBurner(i));
    this.hot = {}; // продукт → время, до которого он горячий
    this.oven = { state: 'empty', owner: null, t: 0, readyAt: 0, windowEnd: 0, doneness: 0 };
    this.radio = { enabled: true, broken: false, progress: 0, repairs: 0, breaks: 0 };
    this.garland = { broken: false, progress: 0, repairs: 0 };
    this.cat = { state: 'home', kind: null, deadline: 0, startedAt: 0, visitUntil: 0 };
    this.catNeeds = { hunger: practice ? 0 : cfg.cat.hungerStart, warned: false, lastTry: -1e9 };
    this.wallet = { budget: practice ? 0 : Math.round((this.day.budget ?? 0) * (mods.tightBudget ? 0.6 : 1)), spent: 0 };
    this.glass = { present: !!this.day.events?.some((e) => e.type === 'spill'), spilled: false };
    this.puddles = [];
    this.sinkJob = null;
    this.phone = { messages: [], unread: 0 };
    this.delivery = { draft: {}, order: null, bag: null };
    this.table = { placed: {}, available: new Set(tableDishes) };

    this.triggers = practice ? [] : (this.day.events ?? []).map((e, i) => ({ ...e, id: i, fired: false, since: null }));
    this.msgQueue = practice ? [] : (this.day.messages ?? []).map((m, i) => ({ ...m, id: i, sent: false }));
    this._initRequests();
    this.lastUrgentT = -1e9;
    this.penalties = []; // однократные происшествия: { kind, points, label }
    this.stats = { walk: 0, closeup: 0, panel: 0, phone: 0, away: 0, idle: 0, thefts: 0, shoos: 0, spills: 0, puddlesMade: 0, catFed: 0 };
    this.tutorialSeen = new Set();
  }

  // Совместимость: «плита» — первая конфорка.
  get stove() {
    return this.burners[0];
  }
  set stove(v) {
    this.burners[0] = v;
  }

  // ---------- служебное ----------
  _id() {
    return this._nextId++;
  }
  _emit(type, data = {}) {
    this.outbox.push({ type, t: this.t, ...data });
  }
  drain() {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }
  setHint(text, seconds = 3) {
    this.hint = { text, until: this.clock + seconds };
    this._emit('hint', { text });
  }
  _alert(key, text, extra = {}) {
    this._removeAlert(key);
    const a = { id: this._id(), key, text, createdAt: this.t, urgent: URGENT.has(key), ...extra };
    this.alerts.push(a);
    return a;
  }
  _removeAlert(key) {
    this.alerts = this.alerts.filter((a) => a.key !== key);
  }
  dismissAlert(id) {
    const a = this.alerts.find((x) => x.id === id);
    if (a && !a.urgent && a.dismissable !== false) this.alerts = this.alerts.filter((x) => x !== a);
  }
  urgentCount() {
    return this.alerts.filter((a) => a.urgent).length;
  }
  isOver() {
    return this.phase === 'finished';
  }
  productName(id) {
    return PRODUCTS[id]?.name ?? id;
  }
  _isIdleAt(station) {
    return !this.heroine.target && !this.heroine.away && this.heroine.station === station && this.panel === station;
  }
  get busy() {
    return !!this.action;
  }

  // ---------- блюда и шаги ----------
  _createDish(id) {
    const r = this.recipes[id];
    const steps = {};
    for (const s of r.steps) steps[s.id] = { done: false, q: null, info: null };
    const dish = { id, recipe: r, variant: { onion: true }, steps, done: false, Q: null, parts: null, notes: [], prepared: {}, pieces: {}, work: null, penalty: { prep: 0 }, attempt: 0, mayo: null };
    if (r.steps.some((s) => s.type === 'season')) this._initSeason(dish, this._seasonRng);
    return dish;
  }

  stepDef(dishId, stepId) {
    return this.recipes[dishId]?.steps.find((s) => s.id === stepId) ?? null;
  }

  isSkipped(dish, step) {
    return !!step.onion && dish.variant.onion === false;
  }

  stepState(dishId, stepId) {
    const dish = this.dishes[dishId];
    const step = this.stepDef(dishId, stepId);
    if (!dish || !step) return 'none';
    if (dish.steps[stepId].done) return 'done';
    if (this.isSkipped(dish, step)) return 'skipped';
    for (const req of step.requires ?? []) {
      const rs = this.stepState(dishId, req);
      if (rs !== 'done' && rs !== 'skipped') return 'locked';
    }
    return 'ready';
  }

  stepDone(dishId, stepId) {
    const s = this.stepState(dishId, stepId);
    return s === 'done' || s === 'skipped';
  }

  // Почему шаг нельзя начать (или null).
  stepBlock(dishId, stepId) {
    const st = this.stepState(dishId, stepId);
    if (st === 'done' || st === 'skipped') return 'Уже сделано';
    const step = this.stepDef(dishId, stepId);
    if (st === 'locked') {
      const miss = (step.requires ?? []).filter((r) => !this.stepDone(dishId, r)).map((r) => this.stepDef(dishId, r).label.toLowerCase());
      return 'Сначала: ' + miss.join('; ');
    }
    const lack = this.inventory.shortage(stepProducts(dishId, step, this.dishes[dishId].variant), this._opId(dishId, stepId));
    const ids = Object.keys(lack);
    if (ids.length) return 'Не хватает: ' + ids.map((i) => this.productName(i).toLowerCase()).join(', ') + ' — закажи в телефоне';
    return null;
  }

  _opId(dishId, stepId, extra = '') {
    return `${dishId}:${stepId}:${this.dishes[dishId]?.attempt ?? 0}${extra}`;
  }

  // Резерв продуктов под операцию (идемпотентно).
  _reserveStep(dishId, stepId) {
    const dish = this.dishes[dishId];
    const step = this.stepDef(dishId, stepId);
    const items = stepProducts(dishId, step, dish.variant);
    const ok = this.inventory.reserve(this._opId(dishId, stepId), items);
    if (!ok) {
      const lack = this.inventory.shortage(items);
      this.setHint('Не хватает: ' + Object.keys(lack).map((i) => this.productName(i).toLowerCase()).join(', ') + '. Проверь запасы и закажи в телефоне.');
      this._emit('shortage', { dishId, stepId, lack });
    }
    return ok;
  }

  _completeStep(dishId, stepId, q, info = null) {
    const dish = this.dishes[dishId];
    const rec = dish.steps[stepId];
    if (rec.done) return false;
    this.inventory.consume(this._opId(dishId, stepId));
    rec.done = true;
    rec.q = Math.max(0, Math.min(1, q));
    rec.info = info;
    this._emit('stepDone', { dishId, stepId, q: rec.q });
    return true;
  }

  // Следующий доступный шаг блюда (для HUD и подсказок).
  nextSteps(dishId) {
    const dish = this.dishes[dishId];
    if (!dish || dish.done) return [];
    return dish.recipe.steps.filter((s) => this.stepState(dishId, s.id) === 'ready');
  }

  activeDish() {
    for (const id of Object.keys(this.dishes)) if (!this.dishes[id].done) return id;
    return null;
  }

  setVariant(dishId, onion) {
    const dish = this.dishes[dishId];
    if (!dish || !dish.recipe.onionOption || dish.done) return false;
    const onionSteps = dish.recipe.steps.filter((s) => s.onion);
    if (onionSteps.some((s) => dish.steps[s.id].done)) {
      this.setHint('Лук уже нарезан. Чтобы сделать без лука, начни начинку заново кнопкой «Переделать».');
      return false;
    }
    for (const s of onionSteps) {
      this.inventory.release(this._opId(dishId, s.id));
      const key = `${dishId}:${s.id}`;
      if (!onion && this.board.items[key]) {
        delete this.board.items[key];
        if (this.board.current === key) this.board.current = null;
      }
    }
    dish.variant.onion = onion;
    this._emit('variant', { dishId, onion });
    return true;
  }

  // Переделать начинку/блюдо с ошибочным вариантом (без лука после лука).
  redoFilling(dishId) {
    const dish = this.dishes[dishId];
    if (!dish || dish.done || !dish.recipe.onionOption) return false;
    const fillingSteps = dish.recipe.steps.filter((s) => ['grate', 'cut', 'add', 'mix'].includes(s.type));
    for (const s of fillingSteps) {
      dish.steps[s.id] = { done: false, q: null, info: null };
      delete this.board.items[`${dishId}:${s.id}`];
    }
    if (this.board.current?.startsWith(dishId + ':')) this.board.current = null;
    if (this.bowl.owner === dishId) this._dirtyBowl();
    if (this.workPlate.owner === dishId) this.workPlate = { owner: null, amount: 0 };
    dish.attempt++;
    dish.prepared = {};
    this._emit('redo', { dishId });
    this.setHint('Начинка выброшена. Подготовь её заново — продукты понадобятся ещё раз.');
    return true;
  }

  // ---------- главный шаг ----------
  update(dt) {
    if (this.isOver()) return;
    let remaining = Math.min(Math.max(dt, 0), this.cfg.maxFrameDt);
    while (remaining > 1e-9) {
      const h = Math.min(this.cfg.subStep, remaining);
      this._step(h);
      remaining -= h;
    }
  }

  // Ускорение ожидания: последовательная симуляция всех пересечённых сроков.
  fastForward(seconds, until = null) {
    let left = seconds;
    while (left > 1e-9) {
      const h = Math.min(this.cfg.subStep, left);
      this._step(h);
      left -= h;
      if (until && until()) break;
    }
  }

  _step(h) {
    this.clock += h;
    this.t += h;
    this._accountTime(h);
    this._updateMovement(h);
    this._updateAction(h);
    this._updateHolds(h);
    this._updateStove(h);
    this._updateOven(h);
    this._updateDelivery(h);
    this._updateCat(h);
    this._updateCatNeeds(h);
    this._updateSchedule();
    this._expireAlerts();
    if (this.hint && this.clock > this.hint.until) this.hint = null;
    this._checkDayReady();
  }

  _accountTime(h) {
    const hr = this.heroine;
    if (hr.away) this.stats.away += h;
    else if (hr.target) this.stats.walk += h;
    else if (this.panel === 'phone') this.stats.phone += h;
    else if (this.panel && CLOSEUP_STATIONS.has(this.panel)) this.stats.closeup += h;
    else if (this.panel) this.stats.panel += h;
    else this.stats.idle += h;
  }

  _expireAlerts() {
    for (const a of this.alerts) if (a.until != null && this.t >= a.until) a.expired = true;
    if (this.alerts.some((a) => a.expired)) this.alerts = this.alerts.filter((a) => !a.expired);
  }

  // ---------- перемещение ----------
  stationStand(id) {
    if (id === 'puddle') {
      const p = this._activePuddle();
      return p ? p.stand : null;
    }
    return CLAYOUT.stations[id]?.stand ?? null;
  }

  stationFacing(id) {
    if (id === 'puddle') {
      const p = this._activePuddle();
      return p ? Math.atan2(p.x - p.stand.x, p.z - p.stand.z) : 0;
    }
    return CLAYOUT.stations[id]?.facing ?? 0;
  }

  _canMove() {
    if (this.isOver() || this.heroine.away) return false;
    if (this.action?.type === 'shoo') return false;
    return true;
  }

  goTo(station, { onArrive } = {}) {
    if (!this._canMove()) return false;
    const stand = this.stationStand(station);
    if (!stand) return false;
    if (!this.heroine.target && this.heroine.station === station && this.heroine.path.length === 0) {
      if (this.panel !== station) {
        this._cancelAction();
        this._openPanel(station);
      }
      onArrive?.();
      return true;
    }
    if (this.heroine.target?.station === station) {
      if (onArrive) this.heroine.target.onArrive = onArrive;
      return true;
    }
    const path = this.nav.findPath(this.heroine, stand);
    if (!path) {
      this.setHint('Туда сейчас не пройти' + (this.puddles.length ? ' — мешает лужа, сначала вытри её' : ''));
      this._emit('navFail', { x: stand.x, z: stand.z });
      return false;
    }
    this._leaveStation();
    this.heroine.path = path;
    this.heroine.target = { station, onArrive: onArrive ?? null };
    this._emit('walk', { station });
    return true;
  }

  // Клик по свободному полу: идти без открытия панели.
  goToPoint(x, z) {
    if (!this._canMove()) return false;
    if (!this.nav.isFree(x, z)) {
      this.setHint('Туда не пройти');
      this._emit('navFail', { x, z });
      return false;
    }
    const path = this.nav.findPath(this.heroine, { x, z });
    if (!path) {
      this.setHint('Туда не пройти');
      this._emit('navFail', { x, z });
      return false;
    }
    this._leaveStation();
    this.heroine.path = path;
    this.heroine.target = { point: { x, z } };
    this._emit('walk', { point: { x, z } });
    return true;
  }

  _leaveStation() {
    this._cancelAction();
    this._releaseHolds();
    this.pointerUp();
    if (this.panel) this._emit('close', { station: this.panel });
    this.panel = null;
    this.heroine.station = null;
  }

  _updateMovement(h) {
    const hr = this.heroine;
    if (hr.away) {
      hr.awayLeft -= h;
      if (hr.awayLeft <= 0) {
        hr.away = false;
        this._deliveryReturned();
      }
      return;
    }
    if (!hr.target) {
      hr.moving = false;
      return;
    }
    let step = this.cfg.walkSpeed * h;
    while (step > 0 && hr.path.length) {
      const p = hr.path[0];
      const dx = p.x - hr.x, dz = p.z - hr.z;
      const d = Math.hypot(dx, dz);
      if (d <= step + EPS) {
        hr.x = p.x;
        hr.z = p.z;
        step -= d;
        hr.path.shift();
      } else {
        hr.x += (dx / d) * step;
        hr.z += (dz / d) * step;
        hr.facing = Math.atan2(dx, dz);
        step = 0;
      }
    }
    hr.moving = true;
    if (!hr.path.length) {
      const tgt = hr.target;
      hr.target = null;
      hr.moving = false;
      if (tgt.station) {
        hr.station = tgt.station;
        hr.facing = this.stationFacing(tgt.station);
        this._openPanel(tgt.station);
        tgt.onArrive?.();
      } else if (tgt.exit) {
        hr.away = true;
        hr.awayLeft = this.delivery.order?.self ? this.cfg.money.modes.self.away : this.cfg.durations.awayForDelivery;
        this._emit('away');
      }
    }
  }

  _openPanel(station) {
    this.panel = station;
    if (station === 'tray') this._autoTool();
    this._emit('open', { station });
  }

  closePanel() {
    if (!this.panel) return;
    this._cancelAction();
    this._releaseHolds();
    this.pointerUp();
    const st = this.panel;
    this.panel = null;
    this._emit('close', { station: st });
  }

  // ---------- действия с длительностью ----------
  _startAction(type, duration, onDone, data = {}) {
    if (this.action || this.heroine.target || this.heroine.away || this.isOver()) return false;
    this.action = { type, duration, elapsed: 0, onDone, data, id: this._id() };
    this._emit('actionStart', { action: type, duration, ...data });
    return true;
  }

  _cancelAction() {
    if (!this.action || this.action.type === 'shoo') return;
    const a = this.action;
    this.action = null;
    a.data?.onCancel?.();
    this._emit('actionCancel', { action: a.type });
  }

  _updateAction(h) {
    const a = this.action;
    if (!a) return;
    a.elapsed += h;
    if (a.elapsed + EPS >= a.duration) {
      this.action = null;
      a.onDone?.();
    }
  }

  _releaseHolds() {
    this.holds.radio = false;
    this.holds.garland = false;
  }

  setHold(kind, on) {
    if (!on) {
      this.holds[kind] = false;
      return true;
    }
    if (this.action) return false;
    if (kind === 'radio' && (!this._isIdleAt('radio') || !this.radio.broken)) return false;
    if (kind === 'garland' && (!this._isIdleAt('garland') || !this.garland.broken)) return false;
    this.holds[kind] = true;
    return true;
  }

  _updateHolds(h) {
    if (this.holds.radio) {
      if (!this._isIdleAt('radio') || this.action) this.holds.radio = false;
      else {
        this.radio.progress = Math.min(this.cfg.durations.radioHold, this.radio.progress + h);
        if (this.radio.progress >= this.cfg.durations.radioHold - EPS) {
          this.radio.broken = false;
          this.radio.enabled = true;
          this.radio.repairs++;
          this.holds.radio = false;
          this._removeAlert('radio');
          this._emit('radioFixed');
        }
      }
    }
    if (this.holds.garland) {
      if (!this._isIdleAt('garland') || this.action) this.holds.garland = false;
      else {
        this.garland.progress = Math.min(this.cfg.durations.garlandHold, this.garland.progress + h);
        if (this.garland.progress >= this.cfg.durations.garlandHold - EPS) {
          this.garland.broken = false;
          this.garland.repairs++;
          this.holds.garland = false;
          this._removeAlert('garland');
          this._emit('garlandFixed');
        }
      }
    }
  }

  // ---------- указатель (ручные операции в крупном плане) ----------
  // x, z — локальные метры рабочего места текущей станции.
  pointerDown_(x, z) {
    return this.pointer('down', x, z);
  }

  pointer(type, x, z) {
    if (this.isOver() || this.heroine.away || this.heroine.target) return 'ignored';
    if (type === 'down') this.pointerDown = true;
    if (type === 'up') {
      const r = this.panel === 'tray' ? this._trayPointer('up', x, z) : this.panel === 'board' ? this._boardPointer('up', x, z) : 'up';
      this.pointerUp();
      return r;
    }
    if (type === 'move' && !this.pointerDown && this.panel !== 'board' && this.panel !== 'tray') return 'idle';
    switch (this.panel) {
      case 'board':
        return this._boardPointer(type, x, z);
      case 'bowl':
        return this._bowlPointer(type, x, z);
      case 'tray':
        return this._trayPointer(type, x, z);
      case 'sink':
        return this._sinkPointer(type, x, z);
      case 'puddle':
        return this._puddlePointer(type, x, z);
      default:
        return 'ignored';
    }
  }

  // Отпускание кнопки, уход курсора за canvas, потеря фокуса — удержание прекращается.
  pointerUp() {
    this.pointerDown = false;
    if (this.board) this.board.stroke = null;
    this.bowl.stirrer?.release();
    const it = this.board.current && this.board.items[this.board.current];
    it?.grater?.release();
    this.tray.lastStroke = null;
    this._sinkLast = null;
    this._wipeLast = null;
    if (this.tray.drag) this._dropDrag(null);
  }

  // ---------- расписание помех и сообщений ----------
  _maxUrgent() {
    return this.dayIndex === 0 ? this.cfg.events.maxUrgentFirstDay : this.cfg.events.maxUrgent;
  }

  _canStartUrgent() {
    if (this.heroine.away) return false;
    if (this.urgentCount() >= this._maxUrgent()) return false;
    if (this.t - this.lastUrgentT < this.cfg.events.minUrgentGap) return false;
    return true;
  }

  _markUrgent() {
    this.lastUrgentT = this.t;
  }

  _updateSchedule() {
    const t = this.t;
    for (const m of this.msgQueue) {
      if (m.sent || t < m.at) continue;
      m.sent = true;
      this.pushMessage(m.from, m.text, { photo: m.photo, request: m.request });
    }
    for (const e of this.triggers) {
      if (e.fired) continue;
      switch (e.type) {
        case 'pot': {
          const b = this.burners.find((x) => x.state === 'boiling' && !x.overflow && t >= x.startT + (e.delay ?? 0));
          if (!b) {
            if (this.burners.every((x) => x.state !== 'boiling') && this.burners.some((x) => x.startT > 0) && !this.stoveTask()) e.fired = true;
            break;
          }
          if (b.readyAt - t < 3) {
            e.fired = true; // не успеет до готовности — событие отменяется
            break;
          }
          if (this._canStartUrgent()) {
            e.fired = true;
            this._startOverflow(b.i);
          }
          break;
        }
        case 'radio': {
          const t0 = Math.min(...this.burners.map((b) => (b.startT > 0 ? b.startT : Infinity)));
          const due = e.after === 'boilStart' ? Number.isFinite(t0) && t >= t0 + e.delay : t >= (e.at ?? 0);
          if (!due) break;
          e.fired = true;
          if (this.radio.enabled && !this.radio.broken) this.breakRadio();
          break;
        }
        case 'garland':
          if (t >= e.at) {
            e.fired = true;
            if (!this.garland.broken) {
              this.garland.broken = true;
              this.garland.progress = 0;
              this._alert('garland', 'Часть гирлянды погасла', { station: 'garland' });
              this._emit('garlandOff');
            }
          }
          break;
        case 'cat': {
          if (this.cat.state !== 'home') break;
          if (e.when !== 'idle' && this.catCalm()) {
            // сытый кот спит: сценарная кража не случается
            if (!e.sleptNote) {
              e.sleptNote = true;
              this._emit('catSleep');
            }
            break;
          }
          if (e.when === 'sausageOnBoard') {
            const it = this.board.current && this.board.items[this.board.current];
            const ok = it && it.product === 'sausage' && this._boardHasMaterial(it) && this.panel === 'board';
            if (!ok) {
              e.since = null;
              break;
            }
            e.since ??= t;
            if (t - e.since >= (e.delay ?? 5) && this._canStartUrgent()) {
              e.fired = true;
              this._startCatTheft();
            }
          } else if (t >= (e.at ?? 0)) {
            e.fired = true;
            this._catVisit();
          }
          break;
        }
        case 'spill':
          if (t >= e.at && this.glass.present && !this.glass.spilled && this.cat.state === 'home' && !this.catCalm() && this._canStartUrgent()) {
            e.fired = true;
            this._startSpillWarn();
          }
          break;
        default:
          e.fired = true;
      }
    }
  }

  // ---------- готовность дня ----------
  requiredDone() {
    const dishes = Object.values(this.dishes).every((d) => d.done);
    if (!dishes) return false;
    if (this.day.finalServe) return this.finalServeDone();
    return true;
  }

  _checkDayReady() {
    if (this.phase === 'kitchen' && this.requiredDone()) {
      this.phase = 'ready';
      this._emit('dayReady');
    }
  }

  orderScore() {
    const o = this.cfg.scoring.order;
    let s = 100;
    const notes = [];
    for (const p of this.penalties) {
      s -= p.points;
      notes.push(p.label);
    }
    if (this.puddles.length) {
      s -= o.puddleLeft * this.puddles.length;
      notes.push('Лужа осталась на полу');
    }
    if (this.garland.broken) {
      s -= o.garlandLeft;
      notes.push('Гирлянда так и не горит');
    }
    if (this.radio.broken) {
      s -= o.radioLeft;
      notes.push('Радио осталось сломанным');
    }
    const dirty = this.dirtyItems();
    if (dirty.length) {
      s -= o.dirtyLeft * dirty.length;
      notes.push('Немытая посуда: ' + dirty.map((d) => d.label.toLowerCase()).join(', '));
    }
    return { score: Math.max(0, s), notes };
  }

  // Завершить день — только когда обязательные блюда готовы.
  finishDay() {
    this._checkDayReady();
    if (this.phase !== 'ready') {
      this.setHint('День ещё не завершён: ' + this.pendingSummary());
      return null;
    }
    const dishes = {};
    const qs = [];
    for (const d of Object.values(this.dishes)) {
      dishes[d.id] = d.Q;
      qs.push(d.Q);
    }
    const order = this.orderScore();
    const pace = this.practice ? null : this.paceScore();
    const D = this.practice ? qs[0] ?? 0 : dayScore(qs, order.score, pace);
    const wishes = this.requests.map((r) => ({ recipe: r.recipe, kind: r.kind, label: this.wishLabel(r), met: this.wishMet(r) }));
    this.result = {
      D,
      stars: this.starsFor(D),
      pace,
      par: Math.round(this.par()),
      medals: this.practice ? [] : this._medals(this.t),
      spent: this.wallet.spent,
      budget: this.wallet.budget,
      wishes,
      mods: Object.keys(this.mods).filter((k) => this.mods[k]),
      dishes,
      order: order.score,
      orderNotes: order.notes,
      notes: Object.fromEntries(Object.values(this.dishes).map((d) => [d.id, d.notes])),
      time: Math.round(this.t),
      stats: { ...this.stats },
      wish: wishes[0] ? { recipe: wishes[0].recipe, met: wishes[0].met } : null,
    };
    this.phase = 'finished';
    this.action = null;
    this._releaseHolds();
    this.pointerUp();
    this.panel = null;
    this.alerts = [];
    this._emit('dayFinished', { result: this.result });
    return this.result;
  }

  pendingSummary() {
    const out = [];
    for (const d of Object.values(this.dishes)) if (!d.done) out.push(d.recipe.name);
    if (this.day.finalServe && !this.finalServeDone()) out.push('сервировка стола');
    return out.join(', ') || 'всё готово';
  }

  // ---------- завершение блюда ----------
  _finishDish(dishId, parts, notes) {
    const dish = this.dishes[dishId];
    if (dish.done) return false;
    const reqs = this.requests.filter((r) => r.recipe === dishId);
    if (reqs.length) {
      let sum = 0;
      for (const r of reqs) {
        const met = this.wishMet(r);
        sum += met ? 100 : 0;
        const label = this.wishLabel(r);
        if (r.kind === 'noOnion') notes.push(met ? 'Просьба без лука выполнена' : 'Гости просили без лука — просьба не выполнена');
        else notes.push(met ? `Пожелание «${label}» выполнено` : `Гости просили «${label}» — не вышло`);
      }
      parts.wish = sum / reqs.length;
    }
    if (dish.season && dish.steps.season?.done && parts.taste == null) {
      const q = dish.steps.season.q;
      parts.taste = q * 100;
      notes.splice(1, 0, q >= 0.999 ? 'Посолено идеально' : q >= 0.7 ? 'Вкус почти в норме' : dish.season.salt > dish.season.target.salt ? 'Пересолено' : 'Пресновато');
    }
    if (dish.penalty.prep && parts.prep != null) parts.prep = Math.max(0, parts.prep - dish.penalty.prep);
    if (dish.penalty.prepSpill) notes.unshift('Кастрюля выкипела — картофель разварился');
    dish.parts = parts;
    dish.Q = dishScore(parts);
    dish.notes = notes.slice(0, 3);
    dish.done = true;
    this.table.available.add(dishId);
    this._emit('dishDone', { dishId, Q: dish.Q, notes: dish.notes });
    return true;
  }

  avgQ(dish, types) {
    const qs = [];
    for (const s of dish.recipe.steps) {
      if (!types.includes(s.type)) continue;
      const rec = dish.steps[s.id];
      if (rec.done && rec.q != null) qs.push(rec.q);
    }
    if (!qs.length) return null;
    return (qs.reduce((a, b) => a + b, 0) / qs.length) * 100;
  }
}

// Методы станций в отдельных модулях — общий источник состояния остаётся один.
Object.assign(KitchenSession.prototype, boardMethods, bowlMethods, trayMethods, homeMethods, phoneMethods, extraMethods);

export function emptyBurner(i) {
  return { i, state: 'empty', owner: null, step: null, product: null, startT: 0, readyAt: 0, overflow: null };
}

// ---------- практика ----------
function infiniteStock() {
  const s = {};
  for (const id of Object.keys(PRODUCTS)) s[id] = 999;
  return s;
}

export const PRACTICE = {
  cubes: { label: 'Кубики', make: (product = 'carrot') => ({ steps: [{ id: 'p', type: 'cut', product, shape: 'cube', dest: 'none', label: `Нарезать ${PRODUCTS[product].name.toLowerCase()} кубиками` }] }) },
  rounds: { label: 'Кружочки', make: (product = 'cucumber') => ({ steps: [{ id: 'p', type: 'cut', product, shape: 'round', dest: 'none', label: `Нарезать ${PRODUCTS[product].name.toLowerCase()} кружочками` }] }) },
  grate: { label: 'Тёрка', make: (product = 'cheese') => ({ steps: [{ id: 'p', type: 'grate', product, dest: 'none', label: `Натереть ${PRODUCTS[product].name.toLowerCase()}` }] }) },
  spread: { label: 'Намазывание', make: () => ({ steps: [{ id: 'spread', type: 'spread', product: 'butter', items: 6, label: 'Намазать хлеб маслом' }, { id: 'dose', type: 'dose', product: 'caviar', items: 6, requires: ['spread'], label: 'Разложить икру' }], trayAs: 'sandwiches' }) },
  fill: { label: 'Наполнение', make: () => ({ steps: [{ id: 'fill', type: 'fill', containers: 'tartlet', items: 8, practiceFilling: true, label: 'Наполнить корзинки' }], trayAs: 'tartlets' }) },
  mix: { label: 'Перемешивание', make: () => ({ steps: [{ id: 'mix', type: 'mix', practiceMix: true, label: 'Перемешать круговыми движениями' }] }) },
  speed: {
    label: 'Скоростная нарезка',
    hidden: true,
    make: () => ({ steps: ['carrot', 'cucumber', 'potato'].map((product, i) => ({ id: 'p' + (i + 1), type: 'cut', product, shape: 'cube', dest: 'none', label: `${PRODUCTS[product].name} кубиками` })) }),
  },
};
export const SPEED_MIN_Q = 0.75;

function practiceDay({ activity, product }) {
  const p = PRACTICE[activity] ?? PRACTICE.cubes;
  const r = p.make(product);
  return {
    id: 0,
    title: 'Свободная практика',
    dishes: ['practice'],
    stock: {},
    dirty: [],
    events: [],
    messages: [],
    recipe: { name: `Практика: ${p.label}`, short: p.label, serve: 'none', uses: [], practice: true, trayAs: r.trayAs, steps: r.steps },
  };
}

export { stationOfStep };
