// Рабочий поднос: сборка закусок, слои, шпажки, фрукты, маринад.
// Все операции управляются мышью; логическая принадлежность меняется только после успешного действия.
import { CoverageMask } from './coverage.js';
import { fillState, fillQuality } from './mechanics.js';
import { trayItems, eggHalfPos, CANAPE_PILES, FRUIT_PILES, CHICKEN_ZONES, TRAY } from './layout.js';

const inEllipse = (x, z, e) => ((x - e.x) / e.rx) ** 2 + ((z - e.z) / e.rz) ** 2 <= 1;
const inCircle = (x, z, c, r = c.r) => (x - c.x) ** 2 + (z - c.z) ** 2 <= r * r;
const inRect = (x, z, b) => Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2;
const MESSY = new Set(['sandwiches', 'eggs', 'tartlets', 'tomatoes', 'shuba']);

export const trayMethods = {
  trayLayoutId(dishId) {
    return this.recipes[dishId]?.trayAs ?? dishId;
  },

  trayDishes() {
    return Object.entries(this.dishes)
      .filter(([id, d]) => !d.done && d.recipe.steps.some((s) => !['cut', 'grate', 'add', 'mix', 'boil', 'bake'].includes(s.type)))
      .map(([id]) => id);
  },

  trayBlock(dishId) {
    if (this.tray.owner === dishId) return null;
    if (this.tray.owner && !this.dishes[this.tray.owner].done) return `На подносе уже ${this.recipes[this.tray.owner].name.toLowerCase()} — закончи его`;
    const needsTray = dishId !== 'chicken';
    if (needsTray && !this.equipment.tray.clean) return 'Поднос грязный — помой его у раковины';
    if (dishId === 'chicken' && !this.equipment.form.clean) return 'Форма грязная — помой её у раковины';
    return null;
  },

  traySelect(dishId) {
    if (!this._isIdleAt('tray') || this.action) return false;
    const dish = this.dishes[dishId];
    if (!dish || dish.done) return false;
    const block = this.trayBlock(dishId);
    if (block) {
      this.setHint(block);
      return false;
    }
    this.tray.owner = dishId;
    this.equipment.tray.owner = dishId;
    if (!dish.work) dish.work = this._makeWork(dishId);
    this._autoTool();
    this._emit('traySelect', { dishId });
    if (!this.tutorialSeen.has('tray:' + dishId)) {
      this.tutorialSeen.add('tray:' + dishId);
      this._emit('tutorial', { topic: 'tray:' + this.trayLayoutId(dishId) });
    }
    return true;
  },

  _makeWork(dishId) {
    const lay = this.trayLayoutId(dishId);
    const items = trayItems(lay);
    const c = this.cfg;
    switch (lay) {
      case 'sandwiches':
        return { breads: items.map((b) => ({ ...b, mask: new CoverageMask({ ...c.spread, width: b.w * 0.92, depth: b.d * 0.92 }), doses: 0 })) };
      case 'eggs':
        return { eggs: items.map((e) => ({ ...e, split: false, halves: [-1, 1].map((side) => ({ side, ...eggHalfPos(e, side), yolk: true, fill: 0 })) })) };
      case 'tartlets':
        return { cups: items.map((t) => ({ ...t, fill: 0, garnish: false })) };
      case 'tomatoes':
        return { toms: items.map((t) => ({ ...t, cap: true, core: 1, fill: 0, garnish: false })) };
      case 'shuba':
        return { dish: items[0], layers: [], current: null };
      case 'canape':
        return { skewers: items.map((s) => ({ ...s, pieces: [null, null, null, null] })) };
      case 'fruit':
        return { plate: items[0], mandarins: FRUIT_PILES.mandarin.map((p) => ({ ...p, peel: 0, split: false, left: 0 })), apple: 8, grapes: 6, placed: [] };
      case 'chicken':
        return { form: items[0], mask: new CoverageMask({ ...c.marinade, width: 0.26, depth: 0.17, zones: CHICKEN_ZONES }), inOven: false };
      default:
        return {};
    }
  },

  setTool(tool) {
    if (!['knife', 'spoon', 'spatula', 'brush', 'hand'].includes(tool)) return false;
    if (this.tool !== 'spoon' && tool !== 'spoon') this.spoon.load = 0;
    this.tool = tool;
    this._emit('tool', { tool });
    return true;
  },

  _autoTool() {
    const id = this.tray.owner;
    if (!id) return;
    const dish = this.dishes[id];
    const w = dish.work;
    const lay = this.trayLayoutId(id);
    let tool = 'hand';
    if (lay === 'sandwiches') tool = this.stepDone(id, 'spread') ? 'spoon' : 'spatula';
    else if (lay === 'eggs') tool = w?.eggs.every((e) => e.split) ? 'spoon' : 'knife';
    else if (lay === 'tomatoes') tool = w?.toms.every((t) => !t.cap) ? 'spoon' : 'knife';
    else if (lay === 'tartlets') tool = dish.steps.fill?.done ? 'hand' : 'spoon';
    else if (lay === 'shuba') tool = 'spatula';
    else if (lay === 'chicken') tool = 'brush';
    if (lay === 'tomatoes' && dish.steps.fill?.done) tool = 'hand';
    this.tool = tool;
  },

  _trayPointer(type, x, z) {
    const id = this.tray.owner;
    if (!id) return 'ignored';
    const dish = this.dishes[id];
    const w = dish.work;
    if (!w || dish.done) return 'ignored';
    const lay = this.trayLayoutId(id);
    if (this.action && type === 'down') return 'ignored';
    switch (lay) {
      case 'sandwiches':
        return this._sandwichPointer(id, w, type, x, z);
      case 'eggs':
        return this._eggPointer(id, w, type, x, z);
      case 'tartlets':
        return this._fillPointer(id, w.cups, type, x, z, (c) => inCircle(x, z, c));
      case 'tomatoes':
        return this._tomatoPointer(id, w, type, x, z);
      case 'shuba':
        return this._shubaPointer(id, w, type, x, z);
      case 'canape':
        return this._canapePointer(id, w, type, x, z);
      case 'fruit':
        return this._fruitPointer(id, w, type, x, z);
      case 'chicken':
        return this._chickenPointer(id, w, type, x, z);
      default:
        return 'ignored';
    }
  },

  // ---------- мазки ----------
  _strokeOn(mask, cx, cz, x, z, amount = 0.5) {
    const p = { x: x - cx, z: z - cz };
    const last = this.tray.lastStroke;
    let g;
    if (last && last.mask === mask) g = mask.strokeLine(last.p, p, amount);
    else g = mask.stroke(p.x, p.z, amount);
    this.tray.lastStroke = { mask, p };
    return g;
  },

  // ---------- бутерброды ----------
  _sandwichPointer(id, w, type, x, z) {
    const bread = w.breads.find((b) => inRect(x, z, b));
    if (this.tool === 'spatula') {
      if (type === 'up') {
        this.tray.lastStroke = null;
        return 'up';
      }
      if (!this.pointerDown) return 'hover';
      if (!bread) {
        this.tray.lastStroke = null;
        return 'off';
      }
      if (!this.stepDone(id, 'spread') && !this._reserveStep(id, 'spread')) return 'short';
      const g = this._strokeOn(bread.mask, bread.x, bread.z, x, z, 0.45);
      if (g > 0) this._emit('spread', { dishId: id, i: bread.i });
      if (!this.stepDone(id, 'spread') && w.breads.every((b) => b.mask.coverage() >= this.cfg.spread.complete)) {
        this._completeStep(id, 'spread', w.breads.reduce((s, b) => s + b.mask.coverage(), 0) / w.breads.length);
        this.setHint('Все ломтики намазаны. Можно добавить икру ложкой — или довести масло до идеала.', 3.5);
      }
      return 'spread';
    }
    if (this.tool === 'spoon' && type === 'down') {
      if (!bread) return 'miss';
      if (bread.mask.coverage() < 0.5) {
        this.setHint('Сначала намажь этот ломтик маслом', 2);
        return 'blocked';
      }
      const st = this.stepState(id, 'dose');
      if (st === 'locked') {
        this.setHint('Сначала намажь все ломтики (хотя бы на 80 %)', 2);
        return 'blocked';
      }
      if (!this.inventory.isReserved(this._opId(id, 'dose')) && !this.stepDone(id, 'dose') && !this._reserveStep(id, 'dose')) return 'short';
      if (bread.doses >= 4) {
        this.setHint('На этом ломтике уже очень много икры', 1.5);
        return 'full';
      }
      bread.doses++;
      this._emit('dose', { dishId: id, i: bread.i, doses: bread.doses });
      if (!this.stepDone(id, 'dose') && w.breads.every((b) => b.doses >= 1)) this._completeStep(id, 'dose', 1);
      return 'dose';
    }
    return 'ignored';
  },

  // ---------- яйца ----------
  _eggPointer(id, w, type, x, z) {
    if (type !== 'down') return 'hover';
    if (this.tool === 'knife') {
      const egg = w.eggs.find((e) => !e.split && inEllipse(x, z, e));
      if (!egg) return 'miss';
      if (!this.inventory.isReserved(this._opId(id, 'halves')) && !this._reserveStep(id, 'halves')) return 'short';
      this._startAction('cutEgg', 0.4, () => {
        egg.split = true;
        this._emit('eggSplit', { dishId: id, i: egg.i });
        if (w.eggs.every((e) => e.split)) this.tool = 'spoon';
      }, { x, z });
      return 'cut';
    }
    if (this.tool === 'spoon') {
      const half = w.eggs.filter((e) => e.split).flatMap((e) => e.halves).find((h) => inEllipse(x, z, h));
      if (half && half.yolk) {
        const block = this._bowlBlock(id);
        if (block) {
          this.setHint('Желтки кладём в миску. ' + block, 3);
          return 'blocked';
        }
        this._startAction('yolk', 0.3, () => {
          if (!half.yolk) return;
          half.yolk = false;
          this._bowlReceive(id, { product: 'egg', kind: 'yolk' });
          this._emit('yolk', { dishId: id });
          if (w.eggs.every((e) => e.split && e.halves.every((h) => !h.yolk))) {
            this._completeStep(id, 'halves', 1);
            this.setHint('Желтки в миске. Добавь майонез и зелень, перемешай.', 3.5);
          }
        });
        return 'yolk';
      }
      return this._fillPointer(id, w.eggs.flatMap((e) => (e.split ? e.halves : [])), type, x, z, (h) => inEllipse(x, z, h));
    }
    return 'ignored';
  },

  // ---------- наполнение ложкой ----------
  _fillPointer(id, containers, type, x, z, hit) {
    if (type !== 'down') return 'hover';
    const dish = this.dishes[id];
    const fillStep = dish.recipe.steps.find((s) => s.type === 'fill');
    const garnish = dish.recipe.steps.find((s) => s.type === 'garnish');
    const target = containers.find((c) => hit(c));
    const plate = TRAY.workPlate;
    const onPlate = inCircle(x, z, plate);
    if (this.tool === 'hand' && garnish && target) {
      if (!dish.steps[fillStep.id].done) {
        this.setHint('Зелень — после начинки', 2);
        return 'blocked';
      }
      if (target.garnish) return 'done';
      if (!this.inventory.isReserved(this._opId(id, garnish.id)) && !this.stepDone(id, garnish.id) && !this._reserveStep(id, garnish.id)) return 'short';
      target.garnish = true;
      this._emit('garnish', { dishId: id });
      if (containers.every((c) => c.garnish)) this._completeStep(id, garnish.id, 1);
      return 'garnish';
    }
    if (this.tool !== 'spoon') return 'ignored';
    const practiceFill = fillStep?.practiceFilling;
    if (practiceFill && this.workPlate.owner !== id) this.workPlate = { owner: id, amount: fillStep.items + 0.6 };
    const fillReady = this.workPlate.owner === id && (this.stepState(id, fillStep.id) === 'ready' || this.stepDone(id, fillStep.id));
    if (onPlate) {
      if (!fillReady) {
        this.setHint('Начинка ещё не готова — смешай её в миске', 2);
        return 'blocked';
      }
      if (this.spoon.load > 0) {
        this.workPlate.amount += this.spoon.load;
        this.spoon.load = 0;
        this._emit('spoonReturn');
        return 'return';
      }
      if (this.workPlate.amount < 0.05) {
        this._fillShortHint(containers);
        return 'empty';
      }
      const take = Math.min(this.cfg.fill.scoop, this.workPlate.amount);
      this.workPlate.amount -= take;
      this.spoon.load = take;
      this._emit('scoop');
      return 'scoop';
    }
    if (!target) return 'miss';
    if (!fillReady) {
      this.setHint('Сначала приготовь начинку', 2);
      return 'blocked';
    }
    if (target.yolk) return 'blocked';
    if (target.cap) {
      this.setHint('Сначала срежь крышечку и вынь сердцевину', 2);
      return 'blocked';
    }
    if (target.core > 0) {
      this.setHint('Вынь сердцевину ложкой — проведи внутри помидора', 2);
      return 'blocked';
    }
    if (this.spoon.load > 0) {
      if (fillStep.containers === 'tartlet' && !this.inventory.isReserved(this._opId(id, fillStep.id)) && !this.stepDone(id, fillStep.id) && !this._reserveStep(id, fillStep.id)) return 'short';
      target.fill += this.spoon.load;
      this.spoon.load = 0;
      this._emit('fill', { dishId: id, level: target.fill, state: fillState(target.fill, this.cfg.fill) });
      if (fillState(target.fill, this.cfg.fill) === 'over') this.setHint('Переполнено — пустой ложкой можно снять лишнее', 2.5);
      if (!this.stepDone(id, fillStep.id) && containers.every((c) => c.fill >= this.cfg.fill.normalMin * 0.6)) this._completeStep(id, fillStep.id, fillQuality(containers.map((c) => c.fill), this.cfg.fill));
      if (practiceFill && containers.every((c) => c.fill >= this.cfg.fill.normalMin * 0.6)) this._emit('practiceResult', { q: fillQuality(containers.map((c) => c.fill), this.cfg.fill) });
      if (this.workPlate.amount < 0.05 && containers.some((c) => c.fill < this.cfg.fill.normalMin * 0.6)) this._fillShortHint(containers);
      return 'deposit';
    }
    if (target.fill > 0) {
      const take = Math.min(this.cfg.fill.scoop, target.fill);
      target.fill -= take;
      this.spoon.load = take;
      this._emit('unfill', { dishId: id });
      return 'takeBack';
    }
    this.setHint('Ложка пустая — набери начинку на рабочей тарелке', 2);
    return 'empty-spoon';
  },

  _fillShortHint(containers) {
    const over = containers.filter((c) => c.fill > this.cfg.fill.normalMax).length;
    if (over) this.setHint(`Начинка закончилась. В ${over} перебор — сними лишнее пустой ложкой и переложи в пустые`, 4);
    else this.setHint('Начинка закончилась. Можно переделать начинку: кнопка «Переделать» в рецепте', 4);
  },

  // ---------- помидоры ----------
  _tomatoPointer(id, w, type, x, z) {
    if (this.tool === 'knife') {
      if (type !== 'down') return 'hover';
      const t = w.toms.find((q) => q.cap && inCircle(x, z, q));
      if (!t) return 'miss';
      if (!this.inventory.isReserved(this._opId(id, 'prep')) && !this.stepDone(id, 'prep') && !this._reserveStep(id, 'prep')) return 'short';
      this._startAction('cap', 0.35, () => {
        t.cap = false;
        this._emit('tomatoCap', { dishId: id, i: t.i });
        if (w.toms.every((q) => !q.cap)) this.tool = 'spoon';
      }, { x, z });
      return 'cut';
    }
    if (this.tool === 'spoon') {
      const t = w.toms.find((q) => inCircle(x, z, q));
      if (t && !t.cap && t.core > 0) {
        if (type === 'down') {
          this.tray.lastStroke = { tom: t, p: { x, z } };
          return 'scoop-start';
        }
        if (!this.pointerDown) return 'hover';
        const last = this.tray.lastStroke;
        if (!last || last.tom !== t || !inCircle(x, z, t, t.r * 0.8)) {
          this.tray.lastStroke = { tom: t, p: { x, z } };
          return 'scoop';
        }
        const d = Math.hypot(x - last.p.x, z - last.p.z);
        if (d > 0.05) return 'jump';
        t.core = Math.max(0, t.core - d / 0.07);
        this.tray.lastStroke = { tom: t, p: { x, z } };
        if (t.core === 0) {
          this._emit('tomatoCored', { dishId: id, i: t.i });
          if (w.toms.every((q) => !q.cap && q.core === 0)) {
            this._completeStep(id, 'prep', 1);
            this.setHint('Помидоры готовы к начинке', 2.5);
          }
        }
        return 'scoop';
      }
      if (type === 'down') return this._fillPointer(id, w.toms, type, x, z, (c) => inCircle(x, z, c));
      return 'hover';
    }
    if (this.tool === 'hand' && type === 'down') return this._fillPointer(id, w.toms, type, x, z, (c) => inCircle(x, z, c));
    return 'ignored';
  },

  // ---------- шуба: слои ----------
  shubaExpected(dishId = 'shuba') {
    const dish = this.dishes[dishId];
    return dish.recipe.layers.filter((l) => l !== 'onion' || dish.variant.onion);
  },

  shubaComponents(dishId = 'shuba') {
    const dish = this.dishes[dishId];
    const w = dish.work;
    const used = new Set(w?.layers.map((l) => l.comp) ?? []);
    // слой — продукт целиком: обе подготовленные порции идут в один слой
    const comps = [];
    const seen = new Set();
    for (const p of Object.values(dish.prepared)) {
      if (seen.has(p.product)) continue;
      seen.add(p.product);
      comps.push({ comp: p.product, product: p.product, available: !used.has(p.product) && w?.current?.comp !== p.product });
    }
    comps.push({ comp: 'mayo', product: 'mayo', available: this.inventory.available('mayo') > 0 || w?.current?.comp === 'mayo' });
    return comps;
  },

  shubaChoose(comp) {
    const id = 'shuba';
    const dish = this.dishes[id];
    const w = dish?.work;
    if (!w || this.tray.owner !== id || this.action) return false;
    if (this.stepState(id, 'layers') !== 'ready') {
      this.setHint(this.stepBlock(id, 'layers'));
      return false;
    }
    if (w.current?.placed) {
      this.setHint('Сначала подтверди или отмени текущий слой', 2);
      return false;
    }
    const c = this.shubaComponents(id).find((q) => q.comp === comp);
    if (!c || !c.available) {
      this.setHint(comp === 'mayo' ? 'Майонез закончился — закажи в телефоне' : 'Этот компонент уже в салате', 2.5);
      return false;
    }
    if (w.current?.op) this.inventory.release(w.current.op);
    let op = null;
    if (comp === 'mayo') {
      op = `${id}:layer${w.layers.length}:${this._id()}`;
      if (!this.inventory.reserve(op, { mayo: 1 })) return false;
    }
    w.current = { comp, product: c.product, op, placed: false, mask: new CoverageMask({ ...this.cfg.layer, width: w.dish.r * 2, depth: w.dish.r * 2, shape: 'ellipse' }) };
    this.tool = 'spatula';
    this._emit('layerChoose', { comp });
    return true;
  },

  _shubaPointer(id, w, type, x, z) {
    const cur = w.current;
    const onDish = inCircle(x, z, w.dish, w.dish.r * 0.98);
    if (!cur) {
      if (type === 'down' && onDish) this.setHint('Выбери компонент слоя в панели снизу', 2);
      return 'ignored';
    }
    if (!cur.placed) {
      if (type === 'down' && onDish) {
        cur.placed = true;
        cur.mask.stroke(x - w.dish.x, z - w.dish.z, 1);
        this._emit('layerPlace', { comp: cur.comp });
        return 'place';
      }
      return 'hover';
    }
    if (!this.pointerDown || !onDish) {
      this.tray.lastStroke = null;
      return 'hover';
    }
    const g = this._strokeOn(cur.mask, w.dish.x, w.dish.z, x, z, 0.5);
    if (g > 0) this._emit('layerSpread', { cov: cur.mask.coverage() });
    return 'spread';
  },

  shubaConfirmLayer() {
    const w = this.dishes.shuba?.work;
    const cur = w?.current;
    if (!cur || !cur.placed || this.action) return false;
    if (cur.mask.coverage() < this.cfg.layer.complete) {
      this.setHint(`Распредели слой: покрыто ${Math.round(cur.mask.coverage() * 100)} %, нужно ${Math.round(this.cfg.layer.complete * 100)} %`, 2.5);
      return false;
    }
    if (cur.op) this.inventory.consume(cur.op);
    w.layers.push({ comp: cur.comp, product: cur.product, coverage: cur.mask.coverage(), evenness: cur.mask.evenness(), op: cur.op });
    w.current = null;
    this._emit('layerDone', { comp: cur.comp, n: w.layers.length });
    if (w.layers.length >= this.shubaExpected().length && !this.stepDone('shuba', 'layers')) this._completeStep('shuba', 'layers', 1);
    return true;
  },

  // Отменить последний слой до подтверждения блюда: содержимое возвращается.
  shubaUndo() {
    const id = 'shuba';
    const w = this.dishes[id]?.work;
    if (!w || this.dishes[id].done || this.action) return false;
    if (w.current) {
      if (w.current.op) this.inventory.release(w.current.op);
      w.current = null;
      this._emit('layerUndo', {});
      return true;
    }
    const last = w.layers.pop();
    if (!last) return false;
    if (last.comp === 'mayo') this.inventory.add('mayo', 1);
    if (this.dishes[id].steps.layers.done) this.dishes[id].steps.layers = { done: false, q: null, info: null };
    this._emit('layerUndo', { comp: last.comp });
    this.setHint('Последний слой снят и вернулся на место', 2);
    return true;
  },

  // ---------- канапе: перетаскивание на шпажки ----------
  canapeSupply(dishId = 'canape') {
    const dish = this.dishes[dishId];
    const out = {};
    for (const p of CANAPE_PILES) out[p.product] = (dish.pieces[p.product] ?? []).filter((q) => !q.used).length;
    return out;
  },

  _canapePointer(id, w, type, x, z) {
    const dish = this.dishes[id];
    if (type === 'down') {
      if (this.stepState(id, 'skewers') === 'locked') {
        this.setHint('Сначала нарежь все продукты на доске', 2);
        return 'blocked';
      }
      const pile = CANAPE_PILES.find((p) => inCircle(x, z, p));
      if (pile) {
        const piece = (dish.pieces[pile.product] ?? []).find((q) => !q.used);
        if (!piece) {
          this.setHint(`${this.productName(pile.product)} закончился`, 2);
          return 'empty';
        }
        if (!this.inventory.isReserved(this._opId(id, 'skewers')) && !this._reserveStep(id, 'skewers')) return 'short';
        piece.used = true;
        this.tray.drag = { kind: 'canape', product: pile.product, piece, x, z, from: { pile: pile.product } };
        this._emit('grab', { product: pile.product });
        return 'grab';
      }
      for (const s of w.skewers)
        for (let k = 0; k < 4; k++) {
          const slot = s.slots[k];
          if (s.pieces[k] && Math.hypot(x - slot.x, z - slot.z) < 0.02) {
            const pc = s.pieces[k];
            s.pieces[k] = null;
            this.tray.drag = { kind: 'canape', product: pc.product, piece: pc, x, z, from: { skewer: s.i, slot: k } };
            this._unconfirmSkewers(id);
            return 'grab';
          }
        }
      return 'miss';
    }
    if (type === 'move' && this.tray.drag) {
      this.tray.drag.x = x;
      this.tray.drag.z = z;
      return 'drag';
    }
    if (type === 'up' && this.tray.drag) {
      this._dropDrag({ x, z });
      return 'drop';
    }
    return 'hover';
  },

  _unconfirmSkewers(id) {
    const rec = this.dishes[id].steps.skewers;
    if (rec?.done) this.dishes[id].steps.skewers = { done: false, q: null, info: null };
  },

  // Отпускание перетаскиваемого предмета. point=null — вернуть на место.
  _dropDrag(point) {
    const d = this.tray.drag;
    if (!d) return;
    this.tray.drag = null;
    const id = this.tray.owner;
    const w = id && this.dishes[id]?.work;
    if (d.kind === 'canape') {
      let placed = false;
      if (point && w?.skewers) {
        for (const s of w.skewers) {
          for (let k = 0; k < 4 && !placed; k++) {
            const slot = s.slots[k];
            if (!s.pieces[k] && Math.hypot(point.x - slot.x, point.z - slot.z) < 0.024) {
              s.pieces[k] = d.piece;
              placed = true;
            }
          }
          if (placed) break;
        }
      }
      if (!placed) {
        if (d.from.skewer != null && w) w.skewers[d.from.skewer].pieces[d.from.slot] = d.piece;
        else d.piece.used = false;
        if (point) this._emit('dropReject', {});
      } else {
        this._emit('dropOk', { product: d.product });
        if (w.skewers.every((s) => s.pieces.filter(Boolean).length >= 3) && !this.stepDone(id, 'skewers')) this._completeStep(id, 'skewers', 1);
      }
      return;
    }
    if (d.kind === 'fruit') {
      const plate = w?.plate;
      const ok = point && plate && inCircle(point.x, point.z, plate, plate.r - 0.012) && w.placed.length < 18;
      if (ok) {
        w.placed.push({ fruit: d.fruit, x: point.x, z: point.z, rot: (this._id() * 1.7) % 6.28 });
        this._emit('dropOk', { product: d.fruit });
        if (w.placed.length >= 12 && !this.stepDone(id, 'fruit')) this._completeStep(id, 'fruit', 1);
      } else {
        if (d.from === 'plate') w.placed.push(d.orig);
        else if (d.from === 'mandarin') w.mandarins[d.idx].left++;
        else if (d.from === 'apple') w.apple++;
        else if (d.from === 'grapes') w.grapes++;
        if (point) {
          this._emit('dropReject', {});
          if (w?.placed.length >= 18) this.setHint('На тарелке уже 18 кусочков — достаточно', 2);
        }
      }
    }
  },

  // ---------- фрукты ----------
  _fruitPointer(id, w, type, x, z) {
    if (type === 'down') {
      const m = w.mandarins.findIndex((p) => inCircle(x, z, p, 0.045));
      if (m >= 0) {
        const md = w.mandarins[m];
        if (!this.inventory.isReserved(this._opId(id, 'fruit')) && !this.stepDone(id, 'fruit') && !this._reserveStep(id, 'fruit')) return 'short';
        if (md.peel < 3) {
          this._startAction('peel', 0.35, () => {
            md.peel++;
            this._emit('peel', { i: m, peel: md.peel });
          });
          return 'peel';
        }
        if (!md.split) {
          this._startAction('split', 0.35, () => {
            md.split = true;
            md.left = 8;
            this._emit('mandarinSplit', { i: m });
          });
          return 'split';
        }
        if (md.left > 0) {
          md.left--;
          this.tray.drag = { kind: 'fruit', fruit: 'mandarin', from: 'mandarin', idx: m, x, z };
          return 'grab';
        }
        return 'empty';
      }
      if (inCircle(x, z, FRUIT_PILES.apple, 0.05) && w.apple > 0) {
        if (!this.inventory.isReserved(this._opId(id, 'fruit')) && !this.stepDone(id, 'fruit') && !this._reserveStep(id, 'fruit')) return 'short';
        w.apple--;
        this.tray.drag = { kind: 'fruit', fruit: 'apple', from: 'apple', x, z };
        return 'grab';
      }
      if (inCircle(x, z, FRUIT_PILES.grapes, 0.05) && w.grapes > 0) {
        if (!this.inventory.isReserved(this._opId(id, 'fruit')) && !this.stepDone(id, 'fruit') && !this._reserveStep(id, 'fruit')) return 'short';
        w.grapes--;
        this.tray.drag = { kind: 'fruit', fruit: 'grapes', from: 'grapes', x, z };
        return 'grab';
      }
      const k = w.placed.findIndex((p) => Math.hypot(p.x - x, p.z - z) < 0.02);
      if (k >= 0) {
        const orig = w.placed.splice(k, 1)[0];
        this.tray.drag = { kind: 'fruit', fruit: orig.fruit, from: 'plate', orig, x, z };
        if (w.placed.length < 12 && this.stepDone(id, 'fruit')) this.dishes[id].steps.fruit.done = false;
        return 'grab';
      }
      return 'miss';
    }
    if (type === 'move' && this.tray.drag) {
      this.tray.drag.x = x;
      this.tray.drag.z = z;
      return 'drag';
    }
    if (type === 'up' && this.tray.drag) {
      this._dropDrag({ x, z });
      return 'drop';
    }
    return 'hover';
  },

  // ---------- курица: маринад ----------
  _chickenPointer(id, w, type, x, z) {
    if (w.inOven) return 'ignored';
    if (!this.pointerDown) {
      this.tray.lastStroke = null;
      return 'hover';
    }
    if (Math.abs(x) > 0.15 || Math.abs(z) > 0.1) {
      this.tray.lastStroke = null;
      return 'off';
    }
    if (!this.stepDone(id, 'marinade') && !this.inventory.isReserved(this._opId(id, 'marinade')) && !this._reserveStep(id, 'marinade')) return 'short';
    const g = this._strokeOn(w.mask, 0, 0, x, z, 0.5);
    if (g > 0) this._emit('marinade', { cov: w.mask.coverage() });
    if (!this.stepDone(id, 'marinade') && w.mask.coverage() >= this.cfg.marinade.complete) {
      this._completeStep(id, 'marinade', w.mask.coverage());
      this.setHint('Курица в маринаде. Отнеси форму в духовку — кнопка в панели.', 3.5);
    }
    return 'brush';
  },

  // ---------- подтверждение блюда ----------
  canConfirm(dishId) {
    const dish = this.dishes[dishId];
    if (!dish || dish.done || !dish.work) return { ok: false };
    const lay = this.trayLayoutId(dishId);
    const steps = dish.recipe.steps;
    const allDone = steps.every((s) => this.stepDone(dishId, s.id));
    if (this.practice) return { ok: allDone, reason: allDone ? null : 'Закончи операцию' };
    if (lay === 'chicken') return { ok: false, reason: 'Курицу подают после духовки' };
    if (!allDone) {
      const next = steps.find((s) => !this.stepDone(dishId, s.id));
      return { ok: false, reason: next ? 'Осталось: ' + next.label.toLowerCase() : null };
    }
    return { ok: true };
  },

  confirmDish(dishId) {
    if (this.action) return false;
    const c = this.canConfirm(dishId);
    if (!c.ok) {
      if (c.reason) this.setHint(c.reason);
      return false;
    }
    const dish = this.dishes[dishId];
    const w = dish.work;
    const lay = this.trayLayoutId(dishId);
    const notes = [];
    let parts = {};
    if (lay === 'sandwiches') {
      const cov = w.breads.map((b) => b.mask.coverage());
      const even = w.breads.map((b) => b.mask.evenness());
      const asm = w.breads.reduce((s, b, i) => s + Math.min(1, cov[i] / 0.95) * (0.75 + 0.25 * even[i]), 0) / w.breads.length;
      const doseScore = w.breads.reduce((s, b) => s + (b.doses === 2 ? 1 : b.doses === 1 ? 0.65 : b.doses === 3 ? 0.8 : 0.55), 0) / w.breads.length;
      parts = { asm: asm * 100, comp: doseScore * 100 };
      const thin = cov.filter((c) => c < 0.85).length;
      notes.push(thin ? `На ${thin} ломт. масла маловато` : 'Масло лежит ровным слоем');
      const many = w.breads.filter((b) => b.doses >= 3).length;
      notes.push(many ? `На ${many} бутербр. слишком много икры` : 'Икры в меру на каждом');
    } else if (lay === 'eggs' || lay === 'tartlets' || lay === 'tomatoes') {
      const cont = lay === 'eggs' ? w.eggs.flatMap((e) => e.halves) : lay === 'tartlets' ? w.cups : w.toms;
      const levels = cont.map((c) => c.fill);
      const fq = fillQuality(levels, this.cfg.fill);
      const prep = this.avgQ(dish, ['cut', 'grate', 'halves', 'tomato']);
      parts = { prep, comp: 100, asm: fq * 100 };
      const over = levels.filter((l) => l > this.cfg.fill.normalMax).length;
      const low = levels.filter((l) => l < this.cfg.fill.normalMin).length;
      if (over) notes.push(`В ${over} шт. слишком много начинки`);
      if (low) notes.push(`В ${low} шт. начинки маловато`);
      if (!over && !low) notes.push('Начинка разложена ровно');
      if (prep != null && prep >= 85) notes.push('Подготовка аккуратная');
      if (this.workPlate.owner === dishId) this.workPlate = { owner: null, amount: 0 };
    } else if (lay === 'shuba') {
      const exp = this.shubaExpected(dishId);
      const got = w.layers.map((l) => (['herring', 'onion', 'potato', 'carrot', 'beet'].includes(l.comp) ? l.comp : l.comp));
      let match = 0;
      for (let i = 0; i < exp.length; i++) if (got[i] === exp[i]) match++;
      const comp = (match / Math.max(exp.length, got.length)) * 100;
      const asm = (w.layers.reduce((s, l) => s + Math.min(1, l.coverage / 0.95) * (0.7 + 0.3 * l.evenness), 0) / Math.max(1, w.layers.length)) * 100;
      const prep = this.avgQ(dish, ['cut', 'grate']);
      parts = { prep, comp, asm };
      notes.push(match === exp.length && got.length === exp.length ? 'Слои в правильном порядке' : 'Порядок слоёв нарушен');
      notes.push(asm >= 85 ? 'Слои распределены ровно' : 'Местами слой лежит неровно');
    } else if (lay === 'canape') {
      const full = w.skewers.filter((s) => s.pieces.filter(Boolean).length === 4).length;
      const complete = w.skewers.filter((s) => new Set(s.pieces.filter(Boolean).map((p) => p.product)).size === 4).length;
      const orders = new Set(w.skewers.map((s) => s.pieces.map((p) => p?.product ?? '-').join(','))).size;
      const prep = this.avgQ(dish, ['cut']);
      parts = { prep, comp: (complete / w.skewers.length) * 100, asm: (full / w.skewers.length) * 100 };
      notes.push(complete === w.skewers.length ? 'На каждой шпажке весь состав' : `Полный состав на ${complete} из 8`);
      notes.push(orders > 1 ? `Разных вариантов сборки: ${orders}` : 'Все шпажки собраны одинаково');
    } else if (lay === 'fruit') {
      const kinds = new Set(w.placed.map((p) => p.fruit)).size;
      let crowd = 0;
      for (let i = 0; i < w.placed.length; i++)
        for (let j = i + 1; j < w.placed.length; j++) if (Math.hypot(w.placed[i].x - w.placed[j].x, w.placed[i].z - w.placed[j].z) < 0.018) crowd++;
      parts = { comp: kinds === 3 ? 100 : kinds === 2 ? 70 : 40, asm: Math.max(40, 100 - crowd * 8) };
      notes.push(kinds === 3 ? 'Все три вида фруктов' : 'Не хватает разнообразия фруктов');
      notes.push(crowd ? 'Кое-где кусочки лежат друг на друге' : 'Выкладка аккуратная');
    }
    if (this.practice) {
      this._emit('practiceResult', { q: (parts.asm ?? 0) / 100 });
      return true;
    }
    if (MESSY.has(lay)) {
      this.equipment.tray.clean = false;
      this._emit('dirty', { item: 'tray' });
    }
    this.tray.owner = null;
    this.equipment.tray.owner = null;
    this.spoon.load = 0;
    this._finishDish(dishId, parts, notes);
    return true;
  },

  resetPracticeTray() {
    if (!this.practice) return false;
    const id = 'practice';
    const dish = this.dishes[id];
    for (const s of dish.recipe.steps) {
      this.inventory.release(this._opId(id, s.id));
      dish.steps[s.id] = { done: false, q: null, info: null };
    }
    dish.attempt++;
    dish.work = this._makeWork(id);
    this.workPlate = { owner: null, amount: 0 };
    this.spoon.load = 0;
    this._autoTool();
    return true;
  },
};
