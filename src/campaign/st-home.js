// Плита, духовка, раковина, лужи, радио, гирлянда, кот, пакет доставки, праздничный стол.
import { CoverageMask } from './coverage.js';
import { CLAYOUT, SINK, PUDDLE, TABLE_SLOTS, STOVE } from './layout.js';
import { Scrubber } from './mechanics.js';
import { PRODUCTS, DISH_ORDER } from './data.js';
import { TEMPTING, BOILED } from './st-extra.js';

const rand = (rng, [a, b]) => a + (b - a) * rng.next();

export const homeMethods = {
  // ---------- плита: несколько конфорок, у каждой своя кастрюля и срок ----------
  // Шаги варки, которые ещё не стоят на огне и не сделаны.
  stoveTasks() {
    const out = [];
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      for (const s of dish.recipe.steps) {
        if (s.type !== 'boil' || dish.steps[s.id].done) continue;
        if (this.burners.some((b) => b.owner === dishId && b.step === s.id && b.state !== 'empty')) continue;
        out.push({ dishId, stepId: s.id, product: s.product });
      }
    }
    return out;
  },

  stoveTask() {
    return this.stoveTasks()[0] ?? null;
  },

  usableBurners() {
    return this.mods.oneBurner ? this.burners.slice(0, 1) : this.burners;
  },

  boilTime(product) {
    return this.cfg.boilTimes?.[product] ?? this.cfg.potatoReadyAfter;
  },

  // ---------- холодильник и кладовая: что сегодня варить, сначала берут в руки ----------
  /**
   * Что можно достать сейчас: варёные продукты (яйца, свёкла) — сразу к плите; картофель для оливье — сначала
   * на доску почистить сырым (шаг peel с raw), потом к плите. { dishId, stepId, boilStep, product, qty, dest }
   */
  fridgeTasks() {
    const out = [];
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      const steps = dish.recipe.steps;
      for (const st of steps) {
        if (dish.steps[st.id]?.done) continue;
        const state = this.stepState(dishId, st.id);
        if (state === 'locked' || state === 'skipped') continue;
        let boil = null, dest = null;
        if (st.type === 'peel' && st.raw) {
          boil = steps.find((b) => b.type === 'boil' && b.product === st.product && (b.requires ?? []).includes(st.id));
          if (this.board.items[`${dishId}:${st.id}`]) continue;
          dest = 'board';
        } else if (st.type === 'boil') {
          if (steps.some((r) => r.type === 'peel' && r.raw && (st.requires ?? []).includes(r.id))) continue; // приходит с доски
          if (this.burners.some((b) => b.owner === dishId && b.step === st.id && b.state !== 'empty')) continue;
          boil = st;
          dest = 'stove';
        } else continue;
        if (this.carry && this.carry.dishId === dishId && (this.carry.stepId === st.id || this.carry.boilStep === boil?.id)) continue;
        out.push({ dishId, stepId: st.id, boilStep: boil?.id ?? null, product: st.product, qty: st.qty ?? 1, dest });
      }
    }
    return out;
  },

  /** Достать продукт для шага в руки. Руки одни: сначала положи то, что держишь. */
  fridgeTake(dishId, stepId) {
    if (!this._isIdleAt('fridge') || this.action) return false;
    const task = this.fridgeTasks().find((t) => t.dishId === dishId && t.stepId === stepId);
    if (!task) return false;
    if (this.carry) {
      this.setHint(`Руки заняты: ${this.productName(this.carry.product).toLowerCase()} — сначала отнеси`, 2.5);
      return false;
    }
    const block = this.stepBlock(dishId, task.boilStep ?? stepId);
    if (block && !/^Сначала:/.test(block)) {
      this.setHint(block);
      return false;
    }
    if (task.boilStep && !this._reserveStep(dishId, task.boilStep)) return false;
    return this._startAction('take', this.cfg.durations.take ?? 0.8, () => {
      this.carry = { product: task.product, qty: task.qty, dishId, stepId, boilStep: task.boilStep, peeled: false };
      const name = this.productName(task.product);
      const where = PRODUCTS[task.product]?.storage === 'fridge' ? 'холодильника' : 'кладовой';
      this._emit('taken', { product: task.product, dest: task.dest });
      this.setHint(task.dest === 'board' ? `${name} из ${where} — неси к доске и почисти` : `${name} из ${where} — неси к плите и положи в кастрюлю`, 3.5);
    });
  },

  /** Положить продукт из рук обратно (передумала). */
  fridgeReturn() {
    if (!this._isIdleAt('fridge') || !this.carry || this.carry.peeled) return false;
    this.inventory.release?.(this._opId(this.carry.dishId, this.carry.boilStep ?? this.carry.stepId));
    this.carry = null;
    this._emit('returned', {});
    return true;
  },

  /**
   * Положить продукт из рук в кастрюлю с водой на свободную конфорку.
   * heat — где стоит крутилка; null — оставить как есть (огонь, включённый заранее, не гаснет).
   */
  placePot(burner = null, stepKey = null, heat = this.cfg.stove.placeHeat) {
    if (!this._isIdleAt('stove') || this.action) return false;
    const c = this.carry;
    if (!c?.boilStep) {
      const t = this.stoveTasks()[0];
      this.setHint(t ? `Сначала достань ${this.productName(t.product).toLowerCase()} из холодильника` : 'Сегодня варить нечего', 2.5);
      return false;
    }
    const task = { dishId: c.dishId, stepId: c.boilStep, product: c.product };
    const usable = this.usableBurners().filter((b) => b.state === 'empty');
    const free = usable.filter((b) => !b.dirty);
    const b = burner != null ? usable.find((x) => x.i === burner) : free[0];
    if (!b) {
      this.setHint(usable.length ? 'Конфорки залиты — сначала вытри плиту' : this.mods.oneBurner ? 'Конфорка занята — дождись, пока сварится' : 'Все конфорки заняты', 2);
      return false;
    }
    if (b.dirty) {
      this.setHint('Эту конфорку залило — сначала вытри её тряпкой', 2.5);
      return false;
    }
    const block = this.stepBlock(task.dishId, task.stepId);
    if (block) {
      this.setHint(block);
      return false;
    }
    if (!this._reserveStep(task.dishId, task.stepId)) return false;
    return this._startAction('placePot', this.cfg.durations.placePot, () => {
      // state 'boiling' — кастрюля на плите (вода греется или кипит); water — cold | heating | boil
      const h0 = heat == null ? b.heat ?? 0 : heat;
      const nb = { ...emptyBurnerFields(b.i), state: 'boiling', owner: task.dishId, step: task.stepId, product: task.product, startT: this.t, heat: Math.max(0, Math.min(this.cfg.stove.maxHeat, h0 | 0)) };
      this.burners[b.i] = nb;
      nb.readyAt = this._potEta(nb);
      this.carry = null;
      this._emit('potPlaced', { dishId: task.dishId, burner: b.i, product: task.product });
      if (nb.heat === 0) this.setHint('В кастрюле. Включи огонь — поверни крутилку: 7–9 быстро закипит, потом убавь до 4–5', 4.5);
      else {
        const time = nb.readyAt - this.t;
        const m = Math.floor(time / 60), sec = String(Math.round(time % 60)).padStart(2, '0');
        this.setHint(`${BOILED[task.product]?.boils ?? this.productName(task.product) + ' варится — готово'} примерно через ${m}:${sec}. Пока займись остальным`, 4);
      }
    });
  },

  /** Повернуть крутилку конфорки i: огонь 0–9. Сильный огонь убавила до 5 и ниже — пена осела. */
  setHeat(i, heat) {
    const b = this.burners[i];
    if (!b || !this._isIdleAt('stove')) return false;
    const c = this.cfg.stove;
    const v = Math.max(0, Math.min(c.maxHeat, Math.round(heat)));
    if (b.heat === v) return true;
    const was = b.heat ?? 0;
    b.heat = v;
    if (b.state === 'boiling') b.readyAt = this._potEta(b);
    if (b.overflow && v < c.foamHeat - 1) this._saveOverflow(b);
    this._emit('heat', { burner: i, heat: v, from: was });
    return true;
  },

  // Сколько ещё варить: догреть воду до кипения при текущем огне + оставшееся время варки.
  _potEta(b) {
    const c = this.cfg.stove;
    const gain = c.heatRate * (b.heat ?? 0);
    if (gain <= c.loss * (c.boilAt - 20)) return this.t + 9999; // на таком огне не закипит
    let heatUp = 0;
    if (b.temp < c.boilAt) heatUp = -Math.log((gain - c.loss * (c.boilAt - 20)) / (gain - c.loss * (b.temp - 20))) / c.loss;
    return this.t + heatUp + Math.max(0, this.boilTime(b.product) - (b.cooked ?? 0));
  },

  _saveOverflow(b) {
    b.overflow = null;
    b.foamT = 0;
    this._removeAlert(this._potKey(b.i));
    this._emit('potSaved', { burner: b.i });
  },

  _potKey(i) {
    return i === 0 ? 'pot' : 'pot' + (i + 1);
  },

  _updateStove(h = 0) {
    const c = this.cfg.stove;
    for (const s of this.burners) {
      if (s.state === 'boiling' && s.temp != null) {
        // вода: греется от огня, остывает к комнатной; кипит — варится
        s.temp = Math.min(100, s.temp + (c.heatRate * s.heat - c.loss * (s.temp - 20)) * h);
        const boil = s.temp >= c.boilAt;
        const was = s.water;
        s.water = boil ? 'boil' : s.heat > 0 ? 'heating' : 'cold';
        if (boil) {
          s.cooked += h;
          if (was !== 'boil') {
            this._emit('potBoils', { burner: s.i, product: s.product });
            if (s.heat >= c.foamHeat) this.setHint('Закипело! Поверни крутилку до 4–5, иначе убежит', 3);
          }
          // сильный огонь на кипении — поднимается пена
          if (s.heat >= c.foamHeat) {
            s.foamT += h;
            if (s.foamT >= c.foamAfter && !s.overflow && this.t + 3 < s.readyAt) this._startOverflow(s.i);
          } else s.foamT = 0;
        } else s.foamT = 0;
        s.readyAt = this._potEta(s);
        if (s.cooked >= this.boilTime(s.product)) s.readyAt = this.t;
      }
      // готово, а огонь не выключили и кастрюлю не сняли — продукт переваривается
      if (s.state === 'ready' && (s.heat ?? 0) > 0 && !s.overcooked) {
        s.overT += h;
        const lim = c.overcook?.[s.product] ?? c.overcook?.default ?? Infinity;
        if (s.overT >= lim) {
          s.overcooked = true;
          const dish = this.dishes[s.owner];
          if (dish) {
            dish.penalty.prep += c.overcookPenalty ?? 10;
            dish.penalty.overcook = s.product;
          }
          this._emit('overcooked', { burner: s.i, product: s.product });
          this.setHint(`${BOILED[s.product]?.over ?? this.productName(s.product) + ' переварилось'} — сними с огня`, 3.5);
        }
      }
      if (s.state === 'boiling' && this.t >= s.readyAt) {
        s.state = 'ready';
        s.overT = 0;
        if (s.overflow) {
          s.overflow = null;
          this._removeAlert(this._potKey(s.i));
        }
        const name = this.productName(s.product);
        this._alert('potReady' + (s.i || ''), `${BOILED[s.product]?.ready ?? name + ' — готово'} — достань из кастрюли`, { station: 'stove' });
        this._emit('potatoReady', { burner: s.i, product: s.product });
      }
      if (s.overflow && this.t >= s.overflow.deadline) {
        s.overflow = null;
        this._removeAlert(this._potKey(s.i));
        if (this.action?.type === 'reduceHeat') this._cancelAction();
        this._addPuddle('pot', CLAYOUT.potPuddle);
        s.dirty = true; // пеной залило конфорку: после варки её надо вытереть
        this.penalties.push({ kind: 'spill', points: this.cfg.scoring.order.spillEvent, label: 'Кастрюля выкипела' });
        const dish = this.dishes[s.owner];
        if (dish && !dish.penalty.prepSpill) {
          dish.penalty.prepSpill = true;
          dish.penalty.prep += 15;
        }
        this.stats.spills++;
        this._emit('spill', { burner: s.i });
        this.setHint('Убежало! Залило плиту и пол — потом вытри конфорку и лужу', 3.5);
      }
    }
  },

  _startOverflow(i = null) {
    const b = i != null ? this.burners[i] : this.burners.find((x) => x.state === 'boiling');
    if (!b) return;
    const w = rand(this.rng, this.cfg.events.potWindow);
    b.overflow = { deadline: this.t + w };
    this._alert(this._potKey(b.i), `Кастрюля выкипает (${this.productName(b.product).toLowerCase()})! Поверни крутилку ниже 6`, { deadline: this.t + w, window: w, station: 'stove' });
    this._markUrgent();
    this._emit('potBoil', { burner: b.i });
  },

  /** Убавить огонь до тихого кипения (крутилка на simmer) — пена оседает. */
  reduceHeat(i = null) {
    if (!this._isIdleAt('stove')) return false;
    const b = i != null ? this.burners[i] : this.burners.find((x) => x.overflow);
    if (!b?.overflow) return false;
    return this._startAction('reduceHeat', this.cfg.durations.reduceHeat, () => {
      if (!b.overflow) return;
      if (b.heat != null) {
        b.heat = Math.min(b.heat, this.cfg.stove.simmer);
        b.readyAt = this._potEta(b);
        this._emit('heat', { burner: b.i, heat: b.heat });
      }
      this._saveOverflow(b);
    });
  },

  // ---------- вытереть залитую конфорку: тереть тряпкой по пятну ----------
  _burnerAt(x, z) {
    let best = null;
    for (let i = 0; i < this.burners.length; i++) {
      const p = STOVE.burners[i];
      if (!p) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d <= STOVE.r * 1.5 && (!best || d < best.d)) best = { i, d };
    }
    return best ? this.burners[best.i] : null;
  },

  _stovePointer(type, x, z) {
    if (type === 'up') {
      this.stoveWipe?.scrub.release();
      return 'up';
    }
    if (type === 'down') {
      const b = this._burnerAt(x, z);
      if (!b?.dirty) {
        this.stoveWipe = null;
        return 'ignored';
      }
      if (b.state !== 'empty') {
        this.setHint('Сначала сними кастрюлю, потом вытри конфорку', 2);
        return 'blocked';
      }
      if (this.stoveWipe?.i !== b.i) this.stoveWipe = { i: b.i, scrub: new Scrubber(this.cfg.stove.wipe) };
    }
    const w = this.stoveWipe;
    if (!w || !this.pointerDown) return 'hover';
    const p = STOVE.burners[w.i];
    const inside = Math.hypot(x - p.x, z - p.z) <= STOVE.r * 1.6;
    const g = w.scrub.move(x, z, inside);
    if (g > 0) this._emit('wipe', { cov: w.scrub.progress, burner: w.i });
    if (w.scrub.complete) {
      this.burners[w.i].dirty = false;
      this.stoveWipe = null;
      this._emit('stoveClean', { burner: w.i });
      this.setHint('Конфорка чистая', 1.5);
    }
    return inside ? 'wipe' : 'off';
  },

  takePot(i = null) {
    if (!this._isIdleAt('stove') || this.action) return false;
    const b = i != null ? this.burners[i] : this.burners.find((x) => x.state === 'ready') ?? this.burners.find((x) => x.state === 'boiling');
    if (!b) return false;
    if (b.state === 'boiling') {
      this.setHint(b.water === 'boil' ? `Ещё варится (${this.productName(b.product).toLowerCase()}) — осталось ${Math.ceil(b.readyAt - this.t)} с` : (b.heat ?? 0) < 3 ? 'Вода не закипит — прибавь огонь крутилкой' : 'Вода ещё не закипела — подожди');
      return false;
    }
    if (b.state !== 'ready') return false;
    return this._startAction('takePot', this.cfg.durations.takePot, () => {
      if (b.state !== 'ready') return;
      const { owner, step, product } = b;
      // сняла кастрюлю — выключила огонь; залитая конфорка остаётся залитой
      this.burners[b.i] = { ...emptyBurnerFields(b.i), startT: b.startT, heat: 0, dirty: !!b.dirty };
      this._removeAlert('potReady' + (b.i || ''));
      this._completeStep(owner, step, 1);
      if (!this.practice) this.hot[product] = this.t + this.cfg.cool.time;
      this._emit('potatoTaken', { dishId: owner, burner: b.i, product });
      this.setHint(`${BOILED[product]?.hot ?? 'Горячее'}: остынет за ${this.cfg.cool.time} с — или остуди у раковины`, 3.5);
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
    this.sinkCool = null;
    if (this.sinkJob?.item === item) return true;
    this.sinkJob = { item, mask: new CoverageMask({ ...this.cfg.wash, width: SINK.w, depth: SINK.d }) };
    this._emit('sinkStart', { item });
    return true;
  },

  _sinkPointer(type, x, z) {
    if (this.sinkCool) {
      // остужаем: зажала над раковиной — кран открыт
      const inside = Math.abs(x) <= SINK.w / 2 + 0.05 && Math.abs(z) <= SINK.d / 2 + 0.1;
      if (type === 'down') this.sinkCool.pressed = inside;
      if (type === 'up') this.sinkCool.pressed = false;
      return this.sinkCool.pressed ? 'tap' : 'hover';
    }
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
    this.stats.puddlesMade = (this.stats.puddlesMade ?? 0) + 1;
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
  _startCatTheft(product = 'sausage') {
    const w = rand(this.rng, this.cfg.events.catWindow);
    this.cat = { state: 'theft', deadline: this.t + w, startedAt: this.t, product };
    this._alert('cat', `Кот тянется ${TEMPTING[product] ?? 'к еде'}! Прогони его`, { deadline: this.t + w, window: w, action: 'shoo' });
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
    this.catNeeds.hunger = Math.max(0, this.catNeeds.hunger + this.cfg.cat.afterShoo);
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
      const stolen = this._stealFromBoard(c.product);
      if (stolen) {
        this.stats.thefts++;
        this.catNeeds.hunger = 0;
        this.catNeeds.warned = false;
        this._removeAlert('catHungry');
        const name = this.productName(stolen).toLowerCase();
        if (!this.penalties.some((p) => p.kind === 'theft')) this.penalties.push({ kind: 'theft', points: this.cfg.scoring.order.theft, label: `Кот утащил: ${name}` });
        this._emit('catStole', { from: 'board', product: stolen });
        this.setHint(`Кот унёс кусок (${name}). Возьми замену на доске`, 4);
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
    } else if ((c.state === 'eat' || c.state === 'play') && this.t >= c.until) {
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

// Поля пустой конфорки (как emptyBurner в session.js) — без циклического импорта.
function emptyBurnerFields(i) {
  return { i, state: 'empty', owner: null, step: null, product: null, startT: 0, readyAt: 0, overflow: null, heat: 0, temp: 20, cooked: 0, foamT: 0, water: 'cold', dirty: false, overT: 0, overcooked: false };
}
