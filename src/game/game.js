// Состояние и правила одной попытки. Без DOM и Three.js.
// Единственный источник игрового времени — update(dt), который вызывает главный цикл
// только во время активной попытки. Пауза = update не вызывается.

import { CONFIG } from '../config.js';
import { LAYOUT } from './layout.js';
import { createRng } from './rng.js';
import {
  initialPieces,
  cutPiece,
  rotatePieces,
  pieceAt,
  totalVolume,
  largestPiece,
  pieceVolume,
  placeBeside,
  accuracy,
  makePiece,
  recenter,
} from './cutting.js';
import { computeScore, resultTitle } from './scoring.js';

const EPS = 1e-6;
const SIX = ['carrot', 'sausage', 'cucumber', 'egg', 'peas', 'mayo'];

export class Game {
  constructor({ config = CONFIG, seed = 1 } = {}) {
    this.cfg = config;
    this.seed = seed;
    this.rng = createRng(seed);
    this.phase = 'prestart'; // prestart | running | success | fail
    this.t = 0; // активные секунды с момента установки кастрюли
    this.clock = 0; // секунды симуляции, включая время до старта (для подсказок)
    this._nextId = 1;
    this.outbox = [];
    this.alerts = [];
    this.hint = null;

    const s = LAYOUT.heroineStart;
    this.heroine = { x: s.x, z: s.z, facing: Math.PI, station: null, target: null };
    this.pendingArrive = null;
    this.queuedGoTo = null;
    this.action = null; // { type, duration, elapsed, onDone, data }
    this.panel = null; // открытая станция
    this.holds = { mix: false, garland: false };

    this.ingredients = {};
    this.added = {};
    for (const def of config.ingredients) {
      this.added[def.id] = false;
      if (!def.cut) continue;
      const pieces = initialPieces(def.w, def.d, () => this._id());
      this.ingredients[def.id] = {
        id: def.id,
        name: def.name,
        pieces,
        selectedId: pieces[0].id,
        cuts: 0,
        available: def.id !== 'potato',
        fullVolume: def.w * def.d,
        missing: [],
        freshIds: new Set(),
      };
    }
    this.boardIng = 'carrot';

    this.bowl = { pieces: [], mixProgress: 0, mixed: false };
    this.potato = 'raw'; // raw | boiling | ready | taken | added
    const ev = config.events;
    this.cat = { state: 'waiting', nextAt: ev.cat.first, startedAt: 0, deadline: 0, count: 0 };
    this.pot = { idx: 0, active: false, deadline: 0 };
    this.garland = { triggered: false, broken: false, repaired: false, progress: 0 };
    this.phone = { idx: 0, sessionTime: 0, open: false };
    this.stats = {
      thefts: 0,
      theftsFromBoard: 0,
      shoos: 0,
      spills: 0,
      potsSaved: 0,
      phoneTime: 0,
      stolenVolume: 0,
      replacedVolume: 0,
    };
    this.endT = null;
  }

  // ---------- служебное ----------
  _id() {
    return this._nextId++;
  }
  _emit(type, data = {}) {
    this.outbox.push({ type, ...data });
  }
  drain() {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }
  isOver() {
    return this.phase === 'success' || this.phase === 'fail';
  }
  get remaining() {
    return Math.max(0, this.cfg.roundDuration - this.t);
  }
  setHint(text, seconds = 2.5) {
    this.hint = { text, until: this.clock + seconds };
    this._emit('hint', { text });
  }
  _alert(type, text, extra = {}) {
    this._removeAlert(type);
    const a = { id: this._id(), type, text, createdAt: this.t, ...extra };
    this.alerts.push(a);
    return a;
  }
  _removeAlert(type) {
    this.alerts = this.alerts.filter((a) => a.type !== type);
  }
  dismissAlert(id) {
    const a = this.alerts.find((x) => x.id === id);
    if (a && (a.type === 'phone' || a.type === 'info')) this.alerts = this.alerts.filter((x) => x !== a);
  }
  ingredientName(id) {
    return this.cfg.ingredients.find((d) => d.id === id)?.name ?? id;
  }
  missingOf(ids) {
    return ids.filter((id) => !this.added[id]);
  }
  _isIdleAt(station) {
    return !this.heroine.target && this.heroine.station === station && this.panel === station;
  }

  // ---------- главный шаг ----------
  update(dt) {
    if (this.isOver()) return;
    let remaining = Math.min(Math.max(dt, 0), this.cfg.maxFrameDt);
    while (remaining > 1e-9 && !this.isOver()) {
      const h = Math.min(this.cfg.subStep, remaining);
      this._step(h);
      remaining -= h;
    }
  }

  _step(h) {
    if (this.phase === 'running') h = Math.min(h, this.cfg.roundDuration - this.t);
    if (h <= 0 && this.phase === 'running') {
      this._finish(false);
      return;
    }
    this.clock += h;
    this._updateMovement(h);
    this._updateAction(h);
    this._updateHolds(h);
    if (this.isOver()) return;
    if (this.phase === 'running') {
      if (this.panel === 'phone' && this._isIdleAt('phone')) {
        this.stats.phoneTime += h;
        this.phone.sessionTime += h;
      }
      const prev = this.t;
      this.t += h;
      this._updateSchedule(prev, this.t);
      if (this.t >= this.cfg.roundDuration - 1e-9) {
        this.t = this.cfg.roundDuration;
        this._finish(false);
      }
    }
    if (this.hint && this.clock > this.hint.until) this.hint = null;
  }

  _finish(success) {
    if (this.isOver()) return;
    this.phase = success ? 'success' : 'fail';
    this.endT = this.t;
    this.action = null;
    this.holds.mix = this.holds.garland = false;
    this.heroine.target = null;
    this.panel = null;
    this.alerts = [];
    this._emit('finish', { success });
  }

  // ---------- перемещение ----------
  goTo(station, { onArrive } = {}) {
    if (this.isOver()) return false;
    if (!LAYOUT.stations[station]) return false;
    if (this.phase === 'prestart' && station !== 'stove') {
      this.setHint('Сначала поставь картошку вариться у плиты');
      return false;
    }
    if (this.action?.type === 'shoo') {
      this.queuedGoTo = { station, onArrive };
      return true;
    }
    if (this.heroine.target === station) {
      if (onArrive) this.pendingArrive = onArrive;
      return true;
    }
    if (!this.heroine.target && this.heroine.station === station) {
      if (this.panel !== station) {
        this._cancelAction();
        this._openPanel(station);
      }
      onArrive?.();
      return true;
    }
    this._cancelAction();
    this._releaseHolds();
    this.panel = null;
    this.heroine.target = station;
    this.heroine.station = null;
    this.pendingArrive = onArrive ?? null;
    this._emit('walk', { station });
    return true;
  }

  _updateMovement(h) {
    const hr = this.heroine;
    if (!hr.target) return;
    const st = LAYOUT.stations[hr.target];
    const dx = st.stand.x - hr.x;
    const dz = st.stand.z - hr.z;
    const dist = Math.hypot(dx, dz);
    const step = this.cfg.walkSpeed * h;
    if (dist <= step + EPS) {
      hr.x = st.stand.x;
      hr.z = st.stand.z;
      hr.facing = st.facing;
      const station = hr.target;
      hr.target = null;
      hr.station = station;
      this._openPanel(station);
      const cb = this.pendingArrive;
      this.pendingArrive = null;
      cb?.();
    } else {
      hr.x += (dx / dist) * step;
      hr.z += (dz / dist) * step;
      hr.facing = Math.atan2(dx, dz);
    }
  }

  _openPanel(station) {
    this.panel = station;
    if (station === 'phone') {
      this.phone.sessionTime = 0;
      this._removeAlert('phone');
    }
    this._emit('open', { station });
  }

  closePanel() {
    if (this.isOver() || !this.panel) return;
    this._cancelAction();
    this._releaseHolds();
    const st = this.panel;
    this.panel = null;
    this._emit('close', { station: st });
  }

  // ---------- действия с длительностью ----------
  _startAction(type, duration, onDone, data = {}) {
    if (this.action || this.heroine.target || this.isOver()) return false;
    this.action = { type, duration, elapsed: 0, onDone, data };
    this._emit('actionStart', { action: type, duration, ...data });
    return true;
  }

  _cancelAction() {
    if (!this.action || this.action.type === 'shoo') return;
    const type = this.action.type;
    this.action = null;
    this._emit('actionCancel', { action: type });
  }

  _updateAction(h) {
    const a = this.action;
    if (!a) return;
    a.elapsed += h;
    if (a.elapsed + EPS >= a.duration) {
      this.action = null;
      a.onDone?.();
      if (a.type === 'shoo' && this.queuedGoTo) {
        const q = this.queuedGoTo;
        this.queuedGoTo = null;
        this.goTo(q.station, { onArrive: q.onArrive });
      }
    }
  }

  _releaseHolds() {
    this.holds.mix = false;
    this.holds.garland = false;
  }

  setHold(kind, on) {
    if (!on) {
      this.holds[kind] = false;
      return true;
    }
    if (this.isOver() || this.action) return false;
    if (kind === 'mix') {
      if (!this._isIdleAt('bowl')) return false;
      const miss = this.missingOf([...SIX, 'potato']);
      if (miss.length) {
        this.setHint('Для перемешивания не хватает: ' + miss.map((i) => this.ingredientName(i).toLowerCase()).join(', '));
        return false;
      }
      if (this.bowl.mixed) return false;
    }
    if (kind === 'garland') {
      if (!this._isIdleAt('garland')) return false;
      if (!this.garland.broken || this.garland.repaired) return false;
    }
    this.holds[kind] = true;
    return true;
  }

  _updateHolds(h) {
    if (this.holds.mix) {
      if (!this._isIdleAt('bowl') || this.action) this.holds.mix = false;
      else {
        this.bowl.mixProgress = Math.min(this.cfg.durations.mixHold, this.bowl.mixProgress + h);
        if (this.bowl.mixProgress >= this.cfg.durations.mixHold - EPS && !this.bowl.mixed) {
          this.bowl.mixed = true;
          this.holds.mix = false;
          this._emit('mixed');
          if (this.phase === 'running' && this.t < this.cfg.roundDuration) this._finish(true);
        }
      }
    }
    if (this.holds.garland) {
      if (!this._isIdleAt('garland') || this.action) this.holds.garland = false;
      else {
        this.garland.progress = Math.min(this.cfg.durations.garlandHold, this.garland.progress + h);
        if (this.garland.progress >= this.cfg.durations.garlandHold - EPS) {
          this.garland.repaired = true;
          this.garland.broken = false;
          this.holds.garland = false;
          this._removeAlert('garland');
          this._emit('garlandFixed');
        }
      }
    }
  }

  // ---------- плита ----------
  placePot() {
    if (this.phase !== 'prestart' || !this._isIdleAt('stove') || this.action) return false;
    this.phase = 'running';
    this.potato = 'boiling';
    this.t = 0;
    this._emit('potPlaced');
    return true;
  }

  reduceHeat() {
    if (this.phase !== 'running' || !this._isIdleAt('stove')) return false;
    if (!this.pot.active) return false;
    return this._startAction('reduceHeat', this.cfg.durations.reduceHeat, () => {
      if (!this.pot.active) return;
      this.pot.active = false;
      this.stats.potsSaved++;
      this._removeAlert('pot');
      this._emit('potSaved');
    });
  }

  takePotato() {
    if (this.phase !== 'running' || !this._isIdleAt('stove')) return false;
    if (this.potato === 'boiling') {
      this.setHint('Картошка ещё варится — будет готова в 4:30');
      return false;
    }
    if (this.potato !== 'ready') return false;
    return this._startAction('takePotato', this.cfg.durations.takePotato, () => {
      if (this.potato !== 'ready') return;
      this.potato = 'taken';
      this.ingredients.potato.available = true;
      this.boardIng = 'potato';
      this._removeAlert('potatoReady');
      this._emit('potatoTaken');
      this.goTo('board');
    });
  }

  // ---------- доска ----------
  get board() {
    return this.boardIng ? this.ingredients[this.boardIng] : null;
  }

  canUseBoard() {
    return this.phase === 'running' && this._isIdleAt('board');
  }

  selectIngredient(id) {
    if (!this.canUseBoard() || this.action) return false;
    const ing = this.ingredients[id];
    if (!ing || ing.added) return false;
    if (!ing.available) {
      if (id === 'potato') this.setHint('Картошку сначала нужно достать из кастрюли');
      return false;
    }
    if (this.boardIng === id) return true;
    this.boardIng = id;
    this._emit('switch', { id });
    return true;
  }

  /** Клик по доске в координатах продукта (единица = целевой кубик). */
  boardClick(px, pz) {
    if (!this.canUseBoard() || this.action) return 'ignored';
    const ing = this.board;
    if (!ing) return 'ignored';
    const p = pieceAt(ing.pieces, px, pz);
    if (!p) return 'miss';
    if (p.id !== ing.selectedId) {
      ing.selectedId = p.id;
      this._emit('select', { id: p.id });
      return 'select';
    }
    const check = cutPiece(ing.pieces, p.id, px, {
      minWidth: this.cfg.minCutFraction * this.cfg.targetSize,
      maxPieces: this.cfg.maxPiecesPerIngredient,
      nextId: () => 0,
    });
    if (!check.ok) {
      if (check.reason === 'too-close') this.setHint('Слишком близко к краю — такой кусочек не отрезать');
      else if (check.reason === 'limit') this.setHint('Кусочков уже слишком много — хватит резать этот продукт');
      return check.reason;
    }
    this._startAction(
      'cut',
      this.cfg.knifeDuration,
      () => this._applyCut(ing.id, p.id, px),
      { ingredient: ing.id, pieceId: p.id, x: px },
    );
    return 'cut';
  }

  _applyCut(ingId, pieceId, x) {
    const ing = this.ingredients[ingId];
    if (!ing || ing.added) return;
    const res = cutPiece(ing.pieces, pieceId, x, {
      minWidth: this.cfg.minCutFraction * this.cfg.targetSize,
      maxPieces: this.cfg.maxPiecesPerIngredient,
      nextId: () => this._id(),
    });
    if (!res.ok) return;
    ing.pieces = res.pieces;
    ing.cuts++;
    ing.freshIds.delete(pieceId);
    // Следующим выбирается более крупная часть — удобно резать полосой.
    ing.selectedId = res.right.w >= res.left.w ? res.right.id : res.left.id;
    this._emit('cut', { ingredient: ingId, left: res.left, right: res.right });
  }

  rotate() {
    if (!this.canUseBoard() || this.action) return false;
    const ing = this.board;
    if (!ing || !ing.pieces.length) return false;
    ing.pieces = rotatePieces(ing.pieces);
    this._emit('rotate', { ingredient: ing.id });
    return true;
  }

  takeReplacement() {
    if (!this.canUseBoard()) return false;
    const ing = this.board;
    if (!ing || !ing.missing.length) return false;
    return this._startAction('replacement', this.cfg.durations.replacement, () => {
      for (const m of ing.missing) {
        const piece = placeBeside(ing.pieces, m.w, m.d, this._id());
        ing.pieces = recenter([...ing.pieces, piece]);
        ing.freshIds.add(piece.id);
        this.stats.replacedVolume += m.w * m.d;
        if (!ing.selectedId || !ing.pieces.some((q) => q.id === ing.selectedId)) ing.selectedId = piece.id;
      }
      ing.missing = [];
      this._emit('replacement', { ingredient: ing.id });
    });
  }

  transferBlockReason(id = this.boardIng) {
    const ing = this.ingredients[id];
    if (!ing) return 'Нет продукта на доске';
    if (ing.added) return 'Уже в миске';
    if (ing.missing.length) return 'Кот утащил кусок — возьми замену';
    if (ing.cuts < 1) return 'Сначала сделай хотя бы один разрез';
    if (ing.pieces.some((p) => ing.freshIds.has(p.id))) return 'Замену нужно дорезать';
    if (Math.abs(totalVolume(ing.pieces) - ing.fullVolume) > 1e-6) return 'Не хватает объёма продукта';
    if (id === 'potato') {
      const miss = this.missingOf(SIX);
      if (miss.length) return 'Картофель — последним. Ещё нужны: ' + miss.map((i) => this.ingredientName(i).toLowerCase()).join(', ');
    }
    return null;
  }

  transfer() {
    if (!this.canUseBoard() || this.action) return false;
    const ing = this.board;
    const reason = this.transferBlockReason();
    if (reason) {
      this.setHint(reason);
      return false;
    }
    const moved = ing.pieces.map((p) => ({ ...p, ing: ing.id }));
    this.bowl.pieces.push(...moved);
    ing.pieces = [];
    ing.selectedId = null;
    ing.added = true;
    this.added[ing.id] = true;
    if (ing.id === 'potato') this.potato = 'added';
    this._emit('transfer', { ingredient: ing.id, pieces: moved });
    this.boardIng = this.cfg.suggestedOrder.find((i) => this.ingredients[i]?.available && !this.ingredients[i].added) ?? null;
    return true;
  }

  // ---------- миска ----------
  addPeas() {
    if (this.phase !== 'running' || !this._isIdleAt('bowl') || this.added.peas) return false;
    return this._startAction('openPeas', this.cfg.durations.openPeas, () => {
      this.added.peas = true;
      this._emit('added', { ingredient: 'peas' });
    });
  }

  addMayo() {
    if (this.phase !== 'running' || !this._isIdleAt('bowl') || this.added.mayo) return false;
    return this._startAction('addMayo', this.cfg.durations.addMayo, () => {
      this.added.mayo = true;
      this._emit('added', { ingredient: 'mayo' });
    });
  }

  // ---------- кот ----------
  shoo() {
    if (this.phase !== 'running' || this.cat.state !== 'active') return false;
    this._cancelAction();
    this._releaseHolds();
    this.panel = null;
    if (this.heroine.target) {
      this.heroine.target = null;
      this.heroine.station = null;
    }
    this.pendingArrive = null;
    this.cat.state = 'waiting';
    this.cat.nextAt = this.t + this.rng.range(this.cfg.events.cat.intervalMin, this.cfg.events.cat.intervalMax);
    this.stats.shoos++;
    this._removeAlert('cat');
    this.action = { type: 'shoo', duration: this.cfg.durations.shooReaction, elapsed: 0 };
    this._emit('catShooed');
    return true;
  }

  _startCat() {
    this.cat.state = 'active';
    this.cat.startedAt = this.t;
    this.cat.deadline = this.t + this.cfg.events.cat.window;
    this.cat.count++;
    this._alert('cat', 'Кот тянется к колбасе!', { deadline: this.cat.deadline, window: this.cfg.events.cat.window });
    this._emit('catStart');
  }

  _catSteals() {
    const sausage = this.ingredients.sausage;
    let from = 'plate';
    if (this.boardIng === 'sausage' && !sausage.added && sausage.pieces.length) {
      const victim = largestPiece(sausage.pieces);
      sausage.pieces = sausage.pieces.filter((p) => p !== victim);
      sausage.missing.push({ w: victim.w, d: victim.d });
      sausage.freshIds.delete(victim.id);
      this.stats.stolenVolume += pieceVolume(victim);
      if (this.action?.data?.pieceId === victim.id) this._cancelAction();
      if (sausage.selectedId === victim.id) sausage.selectedId = largestPiece(sausage.pieces)?.id ?? null;
      from = 'board';
      this.stats.theftsFromBoard++;
    }
    this.stats.thefts++;
    this.cat.state = 'waiting';
    this.cat.nextAt = this.cat.deadline + this.rng.range(this.cfg.events.cat.intervalMin, this.cfg.events.cat.intervalMax);
    this._removeAlert('cat');
    this._emit('catStole', { from });
  }

  // ---------- расписание помех ----------
  _canStartEvent(at) {
    return at <= this.cfg.noNewEventsAfter;
  }

  _updateSchedule(prev, t) {
    const ev = this.cfg.events;
    // Картофель: проверка пересечения отметки, а не равенства.
    if (prev < this.cfg.potatoReadyAt && t >= this.cfg.potatoReadyAt && this.potato === 'boiling') {
      this.potato = 'ready';
      this._alert('potatoReady', 'Картошка готова! Осталось 30 секунд');
      this._emit('potatoReady');
    }

    // Кот
    if (this.cat.state === 'waiting' && t >= this.cat.nextAt) {
      if (this._canStartEvent(this.cat.nextAt)) this._startCat();
      else this.cat.state = 'done';
    }
    if (this.cat.state === 'active' && t >= this.cat.deadline) this._catSteals();

    // Телефон
    while (this.phone.idx < ev.phone.at.length && t >= ev.phone.at[this.phone.idx]) {
      const at = ev.phone.at[this.phone.idx];
      this.phone.idx++;
      if (!this._canStartEvent(at)) continue;
      const text = this.phone.idx === 1 ? 'Верка выложила фото с отдыха' : 'Верка: ну как тебе фотка?';
      this._alert('phone', text, { until: t + ev.phone.alertLifetime });
      this._emit('phoneNotify', { index: this.phone.idx });
    }
    for (const a of this.alerts) if (a.until != null && t >= a.until) a.expired = true;
    this.alerts = this.alerts.filter((a) => !a.expired);

    // Кастрюля
    while (this.pot.idx < ev.pot.at.length && t >= ev.pot.at[this.pot.idx]) {
      const at = ev.pot.at[this.pot.idx];
      this.pot.idx++;
      if (!this._canStartEvent(at) || this.potato !== 'boiling') continue;
      this.pot.active = true;
      this.pot.deadline = at + ev.pot.window;
      this._alert('pot', 'Кастрюля выкипает!', { deadline: this.pot.deadline, window: ev.pot.window });
      this._emit('potBoil');
    }
    if (this.pot.active && t >= this.pot.deadline) {
      this.pot.active = false;
      this.stats.spills++;
      this._removeAlert('pot');
      if (this.action?.type === 'reduceHeat') this._cancelAction();
      this._emit('spill');
    }

    // Гирлянда
    if (!this.garland.triggered && t >= ev.garland.at) {
      this.garland.triggered = true;
      if (this._canStartEvent(ev.garland.at)) {
        this.garland.broken = true;
        this._alert('garland', 'Гирлянда погасла');
        this._emit('garlandOff');
      }
    }
  }

  // ---------- итог ----------
  getResult() {
    const ids = this.cfg.ingredients.map((d) => d.id);
    const addedIds = ids.filter((id) => this.added[id]);
    const C = (addedIds.length / ids.length) * 100;
    const A = accuracy(this.bowl.pieces, this.cfg.tolerance) * 100;
    const M = this.bowl.mixed ? 100 : 0;
    const garlandError = this.garland.broken && !this.garland.repaired ? 1 : 0;
    const E = this.stats.thefts + this.stats.spills + garlandError;
    const S = computeScore({ C, A, M, E }, this.cfg.scoring);
    const success = this.phase === 'success';
    return {
      success,
      title: resultTitle(success, S, this.cfg.scoring),
      S,
      C,
      A,
      M,
      E,
      added: addedIds,
      missing: ids.filter((id) => !this.added[id]),
      mixed: this.bowl.mixed,
      remaining: Math.max(0, this.cfg.roundDuration - (this.endT ?? this.t)),
      thefts: this.stats.thefts,
      shoos: this.stats.shoos,
      spills: this.stats.spills,
      garlandError,
      kitchenErrors: this.stats.spills + garlandError,
      phoneTime: this.stats.phoneTime,
    };
  }

  // ---------- режим разработчика ----------
  devJumpTo(target) {
    if (this.isOver()) return;
    if (this.phase === 'prestart') {
      this.phase = 'running';
      this.potato = 'boiling';
    }
    const ev = this.cfg.events;
    // Пропущенные отметки считаются прошедшими без последствий.
    while (this.phone.idx < ev.phone.at.length && ev.phone.at[this.phone.idx] < target) this.phone.idx++;
    while (this.pot.idx < ev.pot.at.length && ev.pot.at[this.pot.idx] < target) this.pot.idx++;
    if (ev.garland.at < target) this.garland.triggered = true;
    this.pot.active = false;
    if (this.cat.state === 'active') {
      this.cat.state = 'waiting';
      this._emit('catGone');
    }
    if (this.cat.nextAt < target) this.cat.nextAt = target + 5;
    this.alerts = this.alerts.filter((a) => a.type === 'garland' && this.garland.broken);
    this.t = Math.min(target, this.cfg.roundDuration - 0.01);
    this._emit('devJump');
  }

  devCat() {
    if (this.phase !== 'running' || this.cat.state === 'active') return;
    this._startCat();
  }

  devPrepare() {
    if (this.phase === 'prestart') {
      this.phase = 'running';
      this.potato = 'boiling';
    }
    for (const id of ['carrot', 'sausage', 'cucumber', 'egg']) {
      const ing = this.ingredients[id];
      if (ing.added) continue;
      const def = this.cfg.ingredients.find((d) => d.id === id);
      const cubes = [];
      for (let i = 0; i < def.w; i++) for (let j = 0; j < def.d; j++) cubes.push({ ...makePiece(this._id(), i, j, 1, 1), ing: id });
      ing.pieces = [];
      ing.missing = [];
      ing.cuts = Math.max(1, ing.cuts);
      ing.added = true;
      this.added[id] = true;
      this.bowl.pieces.push(...cubes);
      this._emit('transfer', { ingredient: id, pieces: cubes });
    }
    for (const id of ['peas', 'mayo']) {
      if (!this.added[id]) {
        this.added[id] = true;
        this._emit('added', { ingredient: id });
      }
    }
    if (this.boardIng !== 'potato') this.boardIng = this.ingredients.potato.available ? 'potato' : null;
  }
}
