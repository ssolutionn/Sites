// Миска: добавление продуктов, перемешивание круговым движением, начинка на рабочую тарелку.
import { Stirrer } from './mechanics.js';

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
    this.bowl = { owner: null, contents: [], stirrer: null, mixStep: null };
    this.equipment.bowl.clean = false;
    this.equipment.bowl.owner = null;
    this._emit('dirty', { item: 'bowl' });
  },

  bowlTasks() {
    const out = [];
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      for (const s of dish.recipe.steps) {
        if (s.type !== 'add' && s.type !== 'mix' && s.type !== 'season') continue;
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
      this._bowlReceive(dishId, { product: step.product, kind: 'add' });
      if (step.product === 'mayo') this.dishes[dishId].mayo = amount === 'light' ? 'light' : 'full';
      this._completeStep(dishId, stepId, 1);
      this._emit('added', { dishId, product: step.product });
    }, { product: step.product });
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
    const tgt = this.mixTarget();
    if (type === 'down') {
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

  _mixComplete(dishId, stepId) {
    const dish = this.dishes[dishId];
    const step = this.stepDef(dishId, stepId);
    if (this.practice) {
      this._emit('practiceResult', { q: 1, info: { turns: this.bowl.stirrer.turns } });
      this.bowl.stirrer = null;
      return;
    }
    if (!this._completeStep(dishId, stepId, 1)) return;
    this.bowl.stirrer.release();
    const hasFill = dish.recipe.steps.some((s) => s.type === 'fill');
    if (hasFill) {
      const fill = dish.recipe.steps.find((s) => s.type === 'fill');
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
    if (prep >= 85) notes.push('Кубики ровные');
    else if (prep >= 60) notes.push('Кубики в целом ровные, есть крупные кусочки');
    else notes.push('Кусочки очень разные по размеру');
    notes.push('Перемешано до однородности');
    if (this.stats.thefts) notes.push('Кот всё-таки утащил колбасы');
    this._dirtyBowl();
    this._finishDish(dishId, parts, notes);
  },

  _afterStepProgress() {},
};
