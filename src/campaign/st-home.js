// Плита, духовка, раковина, лужи, радио, гирлянда, кот, пакет доставки, праздничный стол.
import { CoverageMask } from './coverage.js';
import { CLAYOUT, SINK, PUDDLE, TABLE_SLOTS } from './layout.js';
import { PRODUCTS, DISH_ORDER } from './data.js';

const rand = (rng, [a, b]) => a + (b - a) * rng.next();

export const homeMethods = {
  // ---------- плита ----------
  stoveTask() {
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      const s = dish.recipe.steps.find((x) => x.type === 'boil');
      if (s && !dish.steps[s.id].done) return { dishId, stepId: s.id, product: s.product };
    }
    return null;
  },

  placePot() {
    if (!this._isIdleAt('stove') || this.action) return false;
    const task = this.stoveTask();
    if (!task || this.stove.state !== 'empty') return false;
    const block = this.stepBlock(task.dishId, task.stepId);
    if (block) {
      this.setHint(block);
      return false;
    }
    if (!this._reserveStep(task.dishId, task.stepId)) return false;
    return this._startAction('placePot', this.cfg.durations.placePot, () => {
      this.stove = { state: 'boiling', owner: task.dishId, step: task.stepId, startT: this.t, readyAt: this.t + this.cfg.potatoReadyAfter, overflow: null };
      this._emit('potPlaced', { dishId: task.dishId });
      this.setHint(`Картофель варится. Будет готов через ${Math.round(this.cfg.potatoReadyAfter / 60)}:00 — пока режь остальное`, 4);
    });
  },

  _updateStove() {
    const s = this.stove;
    if (s.state === 'boiling' && this.t >= s.readyAt) {
      s.state = 'ready';
      if (s.overflow) {
        s.overflow = null;
        this._removeAlert('pot');
      }
      this._alert('potReady', 'Картофель сварился — достань из кастрюли', { station: 'stove' });
      this._emit('potatoReady');
    }
    if (s.overflow && this.t >= s.overflow.deadline) {
      s.overflow = null;
      this._removeAlert('pot');
      if (this.action?.type === 'reduceHeat') this._cancelAction();
      this._addPuddle('pot', CLAYOUT.potPuddle);
      this.penalties.push({ kind: 'spill', points: this.cfg.scoring.order.spillEvent, label: 'Кастрюля выкипела' });
      const dish = this.dishes[s.owner];
      if (dish && !dish.penalty.prepSpill) {
        dish.penalty.prepSpill = true;
        dish.penalty.prep += 15;
      }
      this.stats.spills++;
      this._emit('spill');
    }
  },

  _startOverflow() {
    const w = rand(this.rng, this.cfg.events.potWindow);
    this.stove.overflow = { deadline: this.t + w };
    this._alert('pot', 'Кастрюля выкипает! Убавь огонь', { deadline: this.t + w, window: w, station: 'stove' });
    this._markUrgent();
    this._emit('potBoil');
  },

  reduceHeat() {
    if (!this._isIdleAt('stove') || !this.stove.overflow) return false;
    return this._startAction('reduceHeat', this.cfg.durations.reduceHeat, () => {
      if (!this.stove.overflow) return;
      this.stove.overflow = null;
      this._removeAlert('pot');
      this._emit('potSaved');
    });
  },

  takePot() {
    if (!this._isIdleAt('stove') || this.action) return false;
    if (this.stove.state === 'boiling') {
      this.setHint(`Картофель ещё варится — осталось ${Math.ceil(this.stove.readyAt - this.t)} с`);
      return false;
    }
    if (this.stove.state !== 'ready') return false;
    return this._startAction('takePot', this.cfg.durations.takePot, () => {
      const s = this.stove;
      if (s.state !== 'ready') return;
      s.state = 'taken';
      this._removeAlert('potReady');
      this._completeStep(s.owner, s.step, 1);
      this._emit('potatoTaken', { dishId: s.owner });
      this.setHint('Картофель на доске — его можно нарезать или натереть', 3);
    });
  },

  // ---------- духовка ----------
  ovenLoad() {
    if (!this._isIdleAt('oven') || this.action) return false;
    const dish = this.dishes.chicken;
    if (!dish || dish.done) return false;
    if (this.oven.state !== 'empty') {
      this.setHint('Духовка уже занята');
      return false;
    }
    if (!dish.steps.marinade.done) {
      this.setHint('Сначала покрой курицу маринадом на подносе');
      return false;
    }
    if (dish.work?.inOven) return false;
    return this._startAction('ovenLoad', this.cfg.durations.ovenLoad, () => {
      const baked = dish.work.baked ?? 0;
      this.oven = { state: 'baking', owner: 'chicken', t0: this.t - baked, readyAt: this.t + this.cfg.oven.bake - baked, windowEnd: 0, doneness: baked / this.cfg.oven.bake };
      dish.work.inOven = true;
      if (this.tray.owner === 'chicken') {
        this.tray.owner = null;
        this.equipment.tray.owner = null;
      }
      this.equipment.form.owner = 'chicken';
      this._emit('ovenLoaded');
      this.setHint('Курица запекается. Пока займись сервировкой стола', 3.5);
    });
  },

  _updateOven() {
    const o = this.oven;
    if (o.state === 'empty') return;
    o.doneness = (this.t - o.t0) / this.cfg.oven.bake;
    if (o.state === 'baking' && this.t >= o.readyAt) {
      o.state = 'ready';
      const w = rand(this.rng, this.cfg.events.ovenWindow);
      o.windowEnd = this.t + w;
      this._alert('oven', 'Курица готова — достань из духовки!', { deadline: o.windowEnd, window: w, station: 'oven' });
      this._markUrgent();
      this._emit('ovenReady');
    } else if (o.state === 'ready' && this.t >= o.windowEnd) {
      o.state = 'over';
      this._alert('oven', 'Курица перегревается! Срочно достань', { station: 'oven' });
      this._emit('ovenOver');
    } else if (o.state === 'over' && this.t >= o.windowEnd + this.cfg.oven.burnAfter) {
      o.state = 'burnt';
      this._alert('oven', 'Курица сгорела — достань и приготовь замену', { station: 'oven' });
      this._emit('ovenBurnt');
    }
  },

  ovenTake() {
    if (!this._isIdleAt('oven') || this.action) return false;
    const o = this.oven;
    if (o.state === 'empty') return false;
    return this._startAction('ovenTake', this.cfg.durations.ovenTake, () => {
      const dish = this.dishes.chicken;
      const st = o.state;
      if (st === 'baking') {
        // рано: незавершённый этап, можно вернуть
        dish.work.inOven = false;
        dish.work.baked = this.t - o.t0;
        this.oven = { state: 'empty', owner: null, t: 0, readyAt: 0, windowEnd: 0, doneness: 0 };
        this.tray.owner = this.tray.owner ?? 'chicken';
        this.setHint(`Курица ещё сырая (${Math.round(dish.work.baked / this.cfg.oven.bake * 100)} %). Верни её в духовку`, 4);
        this._emit('ovenEarly');
        return;
      }
      this._removeAlert('oven');
      this.oven = { state: 'empty', owner: null, t: 0, readyAt: 0, windowEnd: 0, doneness: 0 };
      this.equipment.form.clean = false;
      this.equipment.form.owner = null;
      if (st === 'burnt') {
        // исправимая замена: новая курица и маринад из запаса
        dish.steps.marinade = { done: false, q: null, info: null };
        dish.steps.bake = { done: false, q: null, info: null };
        dish.attempt++;
        dish.work = null;
        dish.burnt = (dish.burnt ?? 0) + 1;
        this.penalties.push({ kind: 'burnt', points: 5, label: 'Курица сгорела' });
        this.setHint('Сгоревшую курицу — в мусор. Помой форму, возьми новую курицу и замаринуй', 5);
        this._emit('chickenSpoiled');
        return;
      }
      const overT = st === 'over' ? this.t - o.windowEnd : 0;
      const q = st === 'ready' ? 1 : Math.max(0.4, 1 - (overT / this.cfg.oven.burnAfter) * 0.6);
      this._completeStep('chicken', 'bake', q);
      dish.work.bakedColor = st;
      const notes = [];
      const zones = dish.work.mask?.zoneCoverage() ?? [];
      const mar = zones.length ? zones.reduce((a, b) => a + b, 0) / zones.length : dish.steps.marinade.q ?? 0;
      notes.push(st === 'ready' ? 'Золотистая корочка — достали вовремя' : 'Курица пересушена, но съедобна');
      notes.push(mar >= 0.9 ? 'Маринад покрывает всю курицу' : 'Маринад местами пропущен');
      if (dish.burnt) notes.push('Первая курица сгорела — пришлось готовить замену');
      this._finishDish('chicken', { prep: mar * 100, asm: q * 100 }, notes);
    });
  },

  // ---------- раковина ----------
  dirtyItems() {
    return Object.entries(this.equipment).filter(([, e]) => !e.clean).map(([id, e]) => ({ id, label: e.label }));
  },

  sinkSelect(item) {
    if (!this._isIdleAt('sink') || this.action) return false;
    const e = this.equipment[item];
    if (!e || e.clean) return false;
    if (this.sinkJob?.item === item) return true;
    this.sinkJob = { item, mask: new CoverageMask({ ...this.cfg.wash, width: SINK.w, depth: SINK.d }) };
    this._emit('sinkStart', { item });
    return true;
  },

  _sinkPointer(type, x, z) {
    const job = this.sinkJob;
    if (!job) {
      if (type === 'down') this.setHint('Выбери, что мыть, в панели', 2);
      return 'ignored';
    }
    if (!this.pointerDown) {
      this._sinkLast = null;
      return 'hover';
    }
    if (Math.abs(x) > SINK.w / 2 || Math.abs(z) > SINK.d / 2) {
      this._sinkLast = null;
      return 'off';
    }
    const p = { x, z };
    const g = this._sinkLast ? job.mask.strokeLine(this._sinkLast, p, 0.22) : job.mask.stroke(x, z, 0.22);
    this._sinkLast = p;
    if (g > 0) this._emit('wash', { cov: job.mask.coverage() });
    if (job.mask.coverage() >= this.cfg.wash.autoFinish) {
      this.equipment[job.item].clean = true;
      this._emit('washed', { item: job.item });
      this.setHint(this.equipment[job.item].cleanText, 2);
      this.sinkJob = null;
      this._sinkLast = null;
    }
    return 'wash';
  },

  // ---------- лужи ----------
  _addPuddle(source, at) {
    if (this.puddles.some((p) => p.source === source)) return;
    const stand = this._puddleStand(at);
    const pd = { id: this._id(), source, x: at.x, z: at.z, r: at.r, stand, mask: new CoverageMask({ ...this.cfg.wipe, width: PUDDLE.w, depth: PUDDLE.d, shape: 'ellipse' }) };
    this.puddles.push(pd);
    this.nav.setDynamic('puddle' + pd.id, { x: pd.x, z: pd.z, r: pd.r });
    this._alert('puddle', 'На полу лужа — вытри тряпкой', { station: 'puddle', dismissable: false });
    this._emit('puddle', { id: pd.id });
  },

  _puddleStand(at) {
    const tmp = this.nav;
    for (const d of [0.62, 0.75, 0.9])
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        const p = { x: at.x + Math.cos(a) * d, z: at.z + Math.sin(a) * d };
        const dist = Math.hypot(p.x - at.x, p.z - at.z);
        if (dist < at.r + 0.3) continue;
        if (tmp.isFree(p.x, p.z)) return p;
      }
    return { x: at.x, z: at.z - at.r - 0.4 };
  },

  _activePuddle() {
    if (!this.puddles.length) return null;
    let best = this.puddles[0];
    for (const p of this.puddles) if (Math.hypot(p.x - this.heroine.x, p.z - this.heroine.z) < Math.hypot(best.x - this.heroine.x, best.z - this.heroine.z)) best = p;
    return best;
  },

  _puddlePointer(type, x, z) {
    const pd = this._activePuddle();
    if (!pd || !this.pointerDown) {
      this._wipeLast = null;
      return 'hover';
    }
    const p = { x, z };
    const g = this._wipeLast ? pd.mask.strokeLine(this._wipeLast, p, 0.3) : pd.mask.stroke(x, z, 0.3);
    this._wipeLast = p;
    if (g > 0) this._emit('wipe', { cov: pd.mask.coverage() });
    if (pd.mask.coverage() >= this.cfg.wipe.autoFinish) {
      this.puddles = this.puddles.filter((q) => q !== pd);
      this.nav.setDynamic('puddle' + pd.id, null);
      if (!this.puddles.length) this._removeAlert('puddle');
      this._emit('puddleClean', { id: pd.id });
      this.setHint('Пол чистый', 1.5);
      this._wipeLast = null;
      this.closePanel();
    }
    return 'wipe';
  },

  // ---------- радио и гирлянда ----------
  toggleRadio() {
    if (!this._isIdleAt('radio') || this.action) return false;
    if (this.radio.broken) {
      this.setHint('Радио сломано — удерживай «Настроить», чтобы починить');
      return false;
    }
    this.radio.enabled = !this.radio.enabled;
    this._emit('radioToggle', { on: this.radio.enabled });
    return true;
  },

  breakRadio() {
    if (this.radio.broken || !this.radio.enabled) return false;
    this.radio.broken = true;
    this.radio.breaks++;
    this.radio.progress = 0;
    this._alert('radio', 'Радио замолчало', { station: 'radio' });
    this._emit('radioBroken');
    return true;
  },

  // ---------- кот ----------
  _startCatTheft() {
    const w = rand(this.rng, this.cfg.events.catWindow);
    this.cat = { state: 'theft', deadline: this.t + w, startedAt: this.t };
    this._alert('cat', 'Кот тянется к колбасе! Прогони его', { deadline: this.t + w, window: w, action: 'shoo' });
    this._markUrgent();
    this._emit('catStart', { kind: 'theft' });
  },

  _startSpillWarn() {
    const w = rand(this.rng, this.cfg.events.catWindow);
    this.cat = { state: 'spill', deadline: this.t + w, startedAt: this.t };
    this._alert('spillWarn', 'Кот подбирается к стакану компота!', { deadline: this.t + w, window: w, action: 'shoo' });
    this._markUrgent();
    this._emit('catStart', { kind: 'spill' });
  },

  _catVisit() {
    this.cat = { state: 'visit', visitUntil: this.t + 18, startedAt: this.t };
    this._emit('catVisit');
  },

  shoo() {
    if (this.cat.state !== 'theft' && this.cat.state !== 'spill') return false;
    const kind = this.cat.state;
    this.cat = { state: 'home' };
    this._removeAlert('cat');
    this._removeAlert('spillWarn');
    this.stats.shoos++;
    if (this.action && this.action.type !== 'shoo') this._cancelAction();
    this.action = { type: 'shoo', duration: this.cfg.durations.shooReaction, elapsed: 0, data: {} };
    this._emit('catShooed', { kind });
    return true;
  },

  _updateCat() {
    const c = this.cat;
    if (c.state === 'theft' && this.t >= c.deadline) {
      this._removeAlert('cat');
      this.cat = { state: 'home' };
      if (this._stealFromBoard()) {
        this.stats.thefts++;
        this.penalties.push({ kind: 'theft', points: this.cfg.scoring.order.theft, label: 'Кот утащил колбасу' });
        this._emit('catStole', { from: 'board' });
        this.setHint('Кот унёс кусок колбасы. Возьми замену на доске', 4);
      } else this._emit('catGone');
    } else if (c.state === 'spill' && this.t >= c.deadline) {
      this._removeAlert('spillWarn');
      this.cat = { state: 'home' };
      this.glass.spilled = true;
      this.glass.present = false;
      this._addPuddle('spill', CLAYOUT.spillPuddle);
      this._emit('catSpill');
    } else if (c.state === 'visit' && this.t >= c.visitUntil) {
      this.cat = { state: 'home' };
      this._emit('catGone');
    }
  },

  // ---------- пакет доставки ----------
  unpack(index, place) {
    if (!this._isIdleAt('bag') || this.action) return false;
    const bag = this.delivery.bag;
    const item = bag?.items[index];
    if (!item || item.placed) return false;
    const right = PRODUCTS[item.id].storage;
    if (place !== right) {
      this.setHint(`${this.productName(item.id)} хранится ${right === 'fridge' ? 'в холодильнике' : 'в кладовой'}`, 2.5);
      this._emit('unpackWrong');
      return false;
    }
    return this._startAction('unpack', this.cfg.durations.unpackItem, () => {
      if (item.placed) return;
      item.placed = true;
      this.inventory.add(item.id, item.qty);
      this._emit('unpacked', { id: item.id, qty: item.qty, place });
      if (bag.items.every((i) => i.placed)) {
        this.delivery.bag = null;
        this._removeAlert('bag');
        this._emit('bagDone');
        this.setHint('Пакет разобран, продукты на местах', 2.5);
      }
    });
  },

  // ---------- праздничный стол ----------
  tableDishes() {
    return DISH_ORDER.filter((id) => this.table.available.has(id));
  },

  finalServeDone() {
    return DISH_ORDER.every((id) => this.table.placed[id] != null);
  },

  serveDish(dishId, slot) {
    if (!this.day.finalServe || !this._isIdleAt('table') || this.action) return false;
    if (!this.table.available.has(dishId)) {
      this.setHint('Это блюдо ещё не готово', 2);
      return false;
    }
    if (!TABLE_SLOTS[slot]) return false;
    const holder = Object.entries(this.table.placed).find(([, s]) => s === slot);
    if (holder && holder[0] !== dishId) {
      this.setHint('Это место уже занято', 1.5);
      return false;
    }
    this.table.placed[dishId] = slot;
    this._emit('served', { dishId, slot });
    return true;
  },
};
