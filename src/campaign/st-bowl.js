// Миска: добавление продуктов, перемешивание круговым движением, начинка на рабочую тарелку.
// Руками, как в жизни: банку горошка наклоняют и высыпают над миской, майонез выдавливают
// (сколько выдавила — столько и будет), солонку встряхивают, мешают ложкой по кругу.
import { Stirrer } from './mechanics.js';
import { PourTracker, ShakeTracker } from './gestures.js';
import { BOWL } from './layout.js';
import { pickObservations } from './observations.js';

export const bowlMethods = {
  _bowlBlock(dishId) {
    if (!this.equipment.bowl.clean) return 'Миска грязная — помой её у раковины';
    if (this.bowl.owner && this.bowl.owner !== dishId) return `Миска занята: ${this.recipes[this.bowl.owner].name.toLowerCase()}`;
    return null;
  },

  _bowlReceive(dishId, content) {
    this.bowl.owner = dishId;
    this.equipment.bowl.owner = dishId;
    this.bowl.contents.push(content);
    this._emit('bowlAdd', { dishId, product: content.product, kind: content.kind });
  },

  _dirtyBowl() {
    this.bowl = { owner: null, contents: [], stirrer: null, mixStep: null, pouring: null, shaker: null };
    this.equipment.bowl.clean = false;
    this.equipment.bowl.owner = null;
    this._emit('dirty', { item: 'bowl' });
  },

  bowlTasks() {
    const out = [];
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      for (const s of dish.recipe.steps) {
        if (s.type !== 'add' && s.type !== 'mix' && s.type !== 'season' && s.type !== 'taste') continue;
        const state = this.stepState(dishId, s.id);
        if (state === 'skipped') continue;
        out.push({ dishId, stepId: s.id, type: s.type, product: s.product, label: s.label, state, block: state === 'done' ? null : this.stepBlock(dishId, s.id) || this._bowlBlock(dishId) });
      }
    }
    return out;
  },

  // amount: для майонеза — 'full' или 'light' (поменьше, по просьбе гостей).
  bowlAdd(dishId, stepId, amount = 'full') {
    if (!this._isIdleAt('bowl') || this.action) return false;
    const step = this.stepDef(dishId, stepId);
    if (!step || step.type !== 'add') return false;
    const block = this.stepBlock(dishId, stepId) || this._bowlBlock(dishId);
    if (block) {
      this.setHint(block);
      return false;
    }
    if (!this._reserveStep(dishId, stepId)) return false;
    return this._startAction('add', this.cfg.durations.addProduct, () => {
      if (this.dishes[dishId].steps[stepId].done) return;
      this._bowlAddDone(dishId, stepId, amount === 'light' ? this.cfg.pour.mayo.light * 0.8 : 1, null);
    }, { product: step.product });
  },

  _bowlAddDone(dishId, stepId, amount, path) {
    const step = this.stepDef(dishId, stepId);
    this._bowlReceive(dishId, { product: step.product, kind: 'add', amount, path });
    if (step.product === 'mayo') this.dishes[dishId].mayo = amount < this.cfg.pour.mayo.light ? 'light' : 'full';
    this.bowl.pouring = null;
    this._completeStep(dishId, stepId, 1);
    this._emit('added', { dishId, product: step.product, amount });
  },

  /** Взять продукт в руку: дальше его высыпают или выдавливают движением над миской. */
  bowlPick(dishId, stepId) {
    if (!this._isIdleAt('bowl') || this.action) return false;
    const step = this.stepDef(dishId, stepId);
    if (!step || step.type !== 'add' || this.dishes[dishId].steps[stepId].done) return false;
    const block = this.stepBlock(dishId, stepId) || this._bowlBlock(dishId);
    if (block) {
      this.setHint(block);
      return false;
    }
    if (this.bowl.pouring?.dishId === dishId && this.bowl.pouring.stepId === stepId) return true;
    if (!this._reserveStep(dishId, stepId)) return false;
    const pc = this.cfg.pour[step.product] ?? this.cfg.pour.default;
    this.bowl.shaker = null;
    this.bowl.pouring = { dishId, stepId, product: step.product, squeeze: !!pc.squeeze, need: pc.need, tracker: new PourTracker({ rate: pc.rate, max: pc.max }), path: [] };
    this._emit('pick', { product: step.product });
    return true;
  },

  /** Взять солонку или перечницу: щепотка — один полный взмах вниз-вверх над миской. */
  seasonPick(dishId, kind) {
    if (!['salt', 'pepper'].includes(kind) || !this._seasonReady(dishId)) return false;
    this.bowl.pouring = null;
    this.bowl.shaker = { dishId, kind, tracker: new ShakeTracker(this.cfg.shake) };
    this._emit('pick', { product: kind });
    return true;
  },

  /** Снова взять ложку (положить банку, солонку). */
  bowlSpoon() {
    this.bowl.pouring = null;
    this.bowl.shaker = null;
    return true;
  },

  bowlHand() {
    if (this.bowl.pouring) return this.bowl.pouring.product;
    if (this.bowl.shaker) return this.bowl.shaker.kind;
    return 'spoon';
  },

  _bowlPour(type, x, z) {
    const p = this.bowl.pouring;
    const inside = Math.hypot(x, z) < BOWL.r * 0.85;
    if (type === 'down') {
      p.tracker.release();
      p.tracker.move(x, z, inside);
      return 'pour';
    }
    if (type === 'up') {
      p.tracker.release();
      if (p.squeeze && p.tracker.amount >= p.need) {
        this._bowlAddDone(p.dishId, p.stepId, p.tracker.amount, p.path);
        return 'added';
      }
      if (p.squeeze && p.tracker.amount > 0) this.setHint('Маловато — выдави ещё немного', 2);
      return 'pour';
    }
    if (!this.pointerDown) return 'idle';
    const gain = p.tracker.move(x, z, inside);
    if (gain > 0) {
      if (p.path.length < 240) p.path.push({ x, z, a: p.tracker.amount });
      this._emit('pour', { product: p.product, amount: p.tracker.amount });
      if (!p.squeeze && p.tracker.amount >= p.need) {
        this._bowlAddDone(p.dishId, p.stepId, p.tracker.amount, p.path);
        return 'added';
      }
    } else if (!inside) return 'outside';
    return 'pour';
  },

  // Солонка: трясти вниз-вверх над миской (щепотка за взмах) или просто кликнуть над миской — одна щепотка.
  _bowlShake(type, x, z) {
    const sh = this.bowl.shaker;
    const inside = Math.hypot(x, z) <= BOWL.r * 1.1;
    if (type === 'down') {
      sh.press = inside ? { t: this.clock, pinched: false } : null;
      sh.tracker.reset();
      return inside ? 'shake' : 'outside';
    }
    if (type === 'up') {
      const p = sh.press;
      sh.press = null;
      if (p && !p.pinched && inside && this.clock - p.t <= this.cfg.shake.tapTime && !this.action) {
        this._pinch(sh.dishId, sh.kind, { x, z });
        return 'pinch';
      }
      return 'up';
    }
    if (type !== 'move' || !this.pointerDown) return 'idle';
    if (!inside) return 'outside';
    if (sh.tracker.move(z, this.clock)) {
      if (sh.press) sh.press.pinched = true;
      this._pinch(sh.dishId, sh.kind, { x, z });
      return 'pinch';
    }
    return 'shake';
  },

  // Какое перемешивание сейчас возможно в миске.
  mixTarget() {
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      const s = dish.recipe.steps.find((x) => x.type === 'mix');
      if (!s || dish.steps[s.id].done) continue;
      if (s.practiceMix) return { dishId, stepId: s.id, ok: true };
      if (this.bowl.owner !== dishId) continue;
      const state = this.stepState(dishId, s.id);
      return { dishId, stepId: s.id, ok: state === 'ready', block: state === 'ready' ? null : this.stepBlock(dishId, s.id) };
    }
    return null;
  },

  mixTurns() {
    return this.bowl.stirrer ? this.bowl.stirrer.turns : 0;
  },

  _bowlPointer(type, x, z) {
    if (this.bowl.pouring) return this._bowlPour(type, x, z);
    if (this.bowl.shaker) return this._bowlShake(type, x, z);
    if (type === 'up') return 'up';
    // досолила после перемешивания — короткое перемешивание, чтобы соль разошлась
    const re = this._restirTarget();
    if (re) return this._restir(type, x, z, re);
    let tgt = this.mixTarget();
    if (type === 'down') {
      // посолила и взялась за ложку — значит, «посолено», начинаем мешать
      if (tgt && !tgt.ok && this.seasonState(tgt.dishId)?.phase === 'spice') {
        const se = this.dishes[tgt.dishId].season;
        if (!se.salt && !se.pepper) {
          this.setHint('Сначала посоли и поперчи — потом мешай, чтобы соль разошлась', 2.5);
          return 'blocked';
        }
        this.seasonDone(tgt.dishId);
        tgt = this.mixTarget();
      }
      if (!tgt) {
        this.setHint(this.bowl.contents.length ? 'Сначала добавь всё по рецепту' : 'Миска пуста', 2);
        return 'nothing';
      }
      if (!tgt.ok) {
        this.setHint('Состав ещё не полный. ' + tgt.block, 2.5);
        return 'blocked';
      }
      if (!this.bowl.stirrer || this.bowl.mixStep !== tgt.stepId + tgt.dishId) {
        this.bowl.stirrer = new Stirrer(this.cfg.mix);
        this.bowl.mixStep = tgt.stepId + tgt.dishId;
      }
    }
    if (!this.pointerDown || !tgt?.ok || !this.bowl.stirrer || this.action) return 'idle';
    const gain = this.bowl.stirrer.move(x, z);
    if (gain > 0) this._emit('stir', { turns: this.bowl.stirrer.turns });
    if (this.bowl.stirrer.turns >= this.cfg.mix.turnsRequired) this._mixComplete(tgt.dishId, tgt.stepId);
    return gain > 0 ? 'stir' : 'idle';
  },

  _restirTarget() {
    const id = this.bowl.owner;
    const ss = id && this.seasonState(id);
    return ss && ss.phase === 'taste' && ss.unmixed > 0 ? id : null;
  },

  _restir(type, x, z, dishId) {
    if (type === 'down') {
      this.bowl.restir = new Stirrer(this.cfg.mix);
      return 'stir';
    }
    if (!this.pointerDown || !this.bowl.restir || this.action) return 'idle';
    const gain = this.bowl.restir.move(x, z);
    if (gain > 0) this._emit('stir', { turns: this.bowl.restir.turns, restir: true });
    const se = this.dishes[dishId].season;
    if (this.bowl.restir.turns >= se.unmixed) {
      se.unmixed = 0;
      this.bowl.restir = null;
      this.setHint('Соль разошлась — можно пробовать', 2);
      this._emit('restirred', { dishId });
    }
    return gain > 0 ? 'stir' : 'idle';
  },

  _mixComplete(dishId, stepId) {
    if (this.practice) {
      this._emit('practiceResult', { q: 1, info: { turns: this.bowl.stirrer.turns } });
      this.bowl.stirrer = null;
      return;
    }
    if (!this._completeStep(dishId, stepId, 1)) return;
    this.bowl.stirrer.release();
    if (this.stepDef(dishId, 'taste')) {
      this.setHint('Перемешано! Теперь попробуй ложкой — и доведи до вкуса', 3);
      this._emit('mixed', { dishId });
      return;
    }
    this._bowlFinish(dishId);
  },

  // Блюдо из миски готово: салат — на оценку, начинка — на рабочую тарелку у подноса.
  _bowlFinish(dishId) {
    const dish = this.dishes[dishId];
    const fill = dish.recipe.steps.find((s) => s.type === 'fill');
    if (fill) {
      this.workPlate = { owner: dishId, amount: fill.items * 1.0 + 0.6 };
      this._dirtyBowl();
      this._emit('fillingReady', { dishId });
      this.setHint('Начинка готова и ждёт на рабочей тарелке у подноса. Миску можно помыть.', 4);
      return;
    }
    // салат готов
    const prep = this.avgQ(dish, ['cut', 'grate']);
    const parts = { prep, comp: 100, asm: 100 };
    const notes = [];
    // два конкретных замечания по фактическим кускам; нет данных (кружочки, тёрка) — общая фраза
    const observed = pickObservations(
      dish.recipe.steps.filter((st) => st.type === 'cut').map((st) => ({ product: st.product, size: dish.steps[st.id].info?.stats?.size ?? 1, stats: dish.steps[st.id].info?.stats })),
      2,
      this.cfg.observe,
    );
    if (observed.length) notes.push(...observed);
    else if (prep >= 85) notes.push('Кубики ровные');
    else if (prep >= 60) notes.push('Кубики в целом ровные, есть крупные кусочки');
    else notes.push('Кусочки очень разные по размеру');
    notes.push('Перемешано до однородности');
    if (this.stats.thefts) notes.push('Кот всё-таки утащил колбасы');
    this._dirtyBowl();
    this._finishDish(dishId, parts, notes);
  },

  _afterStepProgress() {},
};
