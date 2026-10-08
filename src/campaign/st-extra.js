// Механики 0.5: вкус (соль, перец, проба), остывание сваренного, кот как система,
// пожелания гостей, деньги, темп, звёзды и медали, события стрима.
import { CLAYOUT } from './layout.js';
import { PRODUCTS, RECIPES } from './data.js';
import { WISHES } from './extras.js';
import { createRng } from '../game/rng.js';

const SALT_Q = [1, 0.75, 0.45, 0.2];
const PEPPER_Q = [1, 0.8, 0.55];
// Фразы для варки с правильным родом и числом.
export const BOILED = {
  potato: { boils: 'Картофель варится — будет готов', ready: 'Картофель сварился', hot: 'Картофель ещё горячий', cooled: 'Картофель остыл' },
  egg: { boils: 'Яйца варятся — будут готовы', ready: 'Яйца сварились', hot: 'Яйца ещё горячие', cooled: 'Яйца остыли' },
  beet: { boils: 'Свёкла варится — будет готова', ready: 'Свёкла сварилась', hot: 'Свёкла ещё горячая', cooled: 'Свёкла остыла' },
};
export const TEMPTING = { sausage: 'к колбасе', herring: 'к селёдке', crab: 'к крабовым палочкам', cheese: 'к сыру' };

export const extraMethods = {
  // ---------- вкус ----------
  _initSeason(dish, rng) {
    const c = this.cfg.season;
    const pick = ([a, b]) => a + Math.floor(rng.next() * (b - a + 1));
    dish.season = { salt: 0, pepper: 0, target: { salt: pick(c.salt), pepper: pick(c.pepper) }, tastes: 0, last: null };
  },

  // Вкус как в жизни: посолить и поперчить → перемешать → попробовать. Пока не перемешано,
  // соль лежит сверху и проба обманет; досолила после перемешивания — ещё оборот ложкой.
  // phase: locked | spice | mixing | taste | done.
  seasonState(dishId) {
    const dish = this.dishes[dishId];
    if (!dish?.season) return null;
    const st = this.stepState(dishId, 'season');
    const hasTaste = !!this.stepDef(dishId, 'taste');
    let phase;
    if (st === 'locked') phase = 'locked';
    else if (st === 'ready') phase = 'spice';
    else if (!this.stepDone(dishId, 'mix')) phase = 'mixing';
    else if (hasTaste && !this.stepDone(dishId, 'taste')) phase = 'taste';
    else phase = 'done';
    let block = null;
    if (phase === 'locked') block = this.stepBlock(dishId, 'season');
    else if (phase !== 'done' && this.bowl.owner !== dishId) block = 'Сначала собери всё в миске';
    return { ...dish.season, state: st, phase, block, unmixed: dish.season.unmixed ?? 0 };
  },

  // Можно ли сейчас солить и перчить (до, во время и после перемешивания, пока вкус не готов).
  _seasonReady(dishId) {
    const ss = this.seasonState(dishId);
    if (!ss || !['spice', 'mixing', 'taste'].includes(ss.phase) || ss.block) {
      if (ss?.block) this.setHint(ss.block, 2);
      return false;
    }
    return this._isIdleAt('bowl') && !this.action;
  },

  // Пробовать — только перемешанное.
  _tasteReady(dishId) {
    if (!this._seasonReady(dishId)) return false;
    const ss = this.seasonState(dishId);
    if (ss.phase !== 'taste') {
      this.setHint('Сначала перемешай — пока соль лежит сверху, проба обманет', 2.5);
      return false;
    }
    if (ss.unmixed > 0) {
      this.setHint('Досолила — перемешай ещё оборот ложкой, потом пробуй', 2.5);
      return false;
    }
    return true;
  },

  // Щепотка соли или перца (кнопкой в тестах и симуляции; в игре — встряхиванием, st-bowl).
  seasonAdd(dishId, kind) {
    if (!['salt', 'pepper'].includes(kind) || !this._seasonReady(dishId)) return false;
    return this._startAction('pinch', this.cfg.durations.pinch, () => this._pinch(dishId, kind), { kind });
  },

  _pinch(dishId, kind, at = null) {
    const se = this.dishes[dishId].season;
    se[kind]++;
    if (this.seasonState(dishId).phase === 'taste') se.unmixed = this.cfg.restir;
    this._emit('pinch', { dishId, kind, n: se[kind], ...(at ?? {}) });
  },

  // Попробовать ложкой: честная обратная связь по соли и перцу.
  seasonTaste(dishId) {
    if (!this._tasteReady(dishId)) return false;
    return this._startAction('taste', this.cfg.durations.taste, () => {
      const se = this.dishes[dishId].season;
      se.tastes++;
      const ds = se.salt - se.target.salt;
      const dp = se.pepper - se.target.pepper;
      // простыми словами: «мало соли» вместо «пресно» — и что сделать дальше
      const parts = [];
      if (ds <= -2) parts.push('соли мало');
      else if (ds === -1) parts.push('чуть не хватает соли');
      else if (ds === 1) parts.push('чуть пересолено');
      else if (ds >= 2) parts.push('пересолено');
      if (dp < 0) parts.push(se.target.pepper === 0 ? '' : 'не хватает перца');
      else if (dp > 0) parts.push(se.target.pepper === 0 ? 'перец тут лишний' : 'перца многовато');
      const txt = parts.filter(Boolean);
      const verdict = txt.length ? txt.join(', ') : 'в самый раз!';
      se.last = { verdict, ok: !txt.length, salt: Math.sign(ds), pepper: Math.sign(dp), ds, dp };
      const advice = ds > 0 || dp > 0 ? ' — спаси: досыпь картошки' : ds < 0 || dp < 0 ? ` — тряхни ${ds < 0 ? 'солонкой' : 'перечницей'} и перемешай` : '';
      this.setHint(`Пробую… ${verdict}${advice}`, 3.5);
      this._emit('taste', { dishId, verdict, ok: !txt.length, face: ds > 0 || dp > 0 ? 'bad' : txt.length ? 'meh' : 'good' });
    });
  },

  // Пересолила — спасти: досыпать отварной картошки (воду в салат не льют). Соль расходится
  // по большему объёму; перемешивает сама. Дорого по времени.
  seasonDilute(dishId) {
    if (!this._tasteReady(dishId)) return false;
    const se = this.dishes[dishId].season;
    if (se.salt === 0 && se.pepper === 0) {
      this.setHint('Спасать нечего — соли и перца нет', 1.5);
      return false;
    }
    return this._startAction('dilute', this.cfg.durations.dilute, () => {
      se.salt = Math.max(0, se.salt - 1);
      se.pepper = Math.max(0, se.pepper - 1);
      se.diluted = (se.diluted ?? 0) + 1;
      // видно, как в миску досыпали картошки
      if (this.bowl.owner === dishId) this.bowl.contents.push({ product: 'potato', kind: 'pieces', rescue: true, pieces: Array.from({ length: 12 }, () => ({ w: 1, d: 1, area: 1 })) });
      this._emit('dilute', { dishId, product: 'potato' });
      this.setHint('Досыпала отварной картошки и перемешала — соли меньше. Попробуй снова', 3);
    });
  },

  seasonQuality(dishId) {
    const se = this.dishes[dishId].season;
    const ds = Math.min(3, Math.abs(se.salt - se.target.salt));
    const dp = Math.min(2, Math.abs(se.pepper - se.target.pepper));
    return 0.65 * SALT_Q[ds] + 0.35 * PEPPER_Q[dp];
  },

  // «Готово» по фазе: посолено → можно мешать; вкус готов → блюдо готово (или начинка — на тарелку).
  seasonDone(dishId) {
    const ss = this.seasonState(dishId);
    if (ss?.phase === 'spice') {
      if (!this._seasonReady(dishId)) return false;
      this._completeStep(dishId, 'season', 1, { salt: ss.salt, pepper: ss.pepper });
      this.bowl.shaker = null; // солонку отложила — в руке ложка
      this.setHint(ss.salt + ss.pepper ? 'Теперь перемешай круговыми движениями — соль разойдётся' : 'Не посолила — после перемешивания попробуй и досоли', 2.5);
      return true;
    }
    if (!this._tasteReady(dishId)) return false;
    const q = this.seasonQuality(dishId);
    this._completeStep(dishId, 'taste', q, { ...this.dishes[dishId].season });
    this._emit('seasoned', { dishId, q });
    if (!this.dishes[dishId].season.tastes) this.setHint('Не попробовала — вкус на удачу', 2.5);
    this._bowlFinish(dishId);
    return true;
  },

  // ---------- остывание ----------
  _hotBlock(product) {
    const until = this.hot[product];
    if (until == null) return null;
    const left = Math.ceil(until - this.t);
    if (left <= 0) {
      delete this.hot[product];
      return null;
    }
    return `${BOILED[product]?.hot ?? PRODUCTS[product].name + ' ещё горячее'} — подожди ${left} с или остуди под холодной водой у раковины`;
  },

  hotList() {
    return Object.keys(this.hot).filter((p) => this.hot[p] > this.t).map((p) => ({ product: p, left: this.hot[p] - this.t }));
  },

  /** Положить горячее в раковину под кран (руками: зажать — кран открыт, держать, пока не уйдёт пар). */
  coolPick(product) {
    if (!this._isIdleAt('sink') || this.action) return false;
    if (!(this.hot[product] > this.t)) return false;
    this.sinkJob = null;
    this.sinkCool = { product, run: 0, open: false };
    this._emit('coolStart', { product });
    this.setHint('Зажми кнопку мыши над раковиной — откроется холодная вода. Держи, пока не уйдёт пар', 3.5);
    return true;
  },

  // Кран открыт, пока зажата кнопка над раковиной: вода льётся, горячее остывает.
  _updateSinkCool(h) {
    const c = this.sinkCool;
    if (!c) return;
    c.open = this.panel === 'sink' && this.pointerDown && !!c.pressed;
    if (!c.open) return;
    c.run += h;
    if (c.run >= this.cfg.cool.underTap) {
      delete this.hot[c.product];
      this.sinkCool = null;
      this._emit('cooled', { product: c.product });
      this.setHint(`${BOILED[c.product]?.cooled ?? 'Остыло'} — можно чистить и резать`, 2.5);
    }
  },

  coolProduct(product) {
    if (!this._isIdleAt('sink') || this.action) return false;
    if (!(this.hot[product] > this.t)) return false;
    return this._startAction('cool', this.cfg.cool.sinkCool, () => {
      delete this.hot[product];
      this._emit('cooled', { product });
      this.setHint(`${BOILED[product]?.cooled ?? 'Остыло'} — можно резать`, 2);
    }, { product });
  },

  // ---------- кот как система ----------
  _catRate() {
    const c = this.cfg.cat;
    const base = this.dayIndex === 0 ? c.rateFirstDay : c.rate;
    return base * (this.mods.hungryCat ? 2 : 1);
  },

  catCalm() {
    return this.catNeeds.hunger < this.cfg.cat.calm || this.cat.state === 'play' || this.cat.state === 'eat';
  },

  _temptingItem() {
    return Object.values(this.board.items).find((x) => TEMPTING[x.product] && !x.grater && this._boardHasMaterial(x)) ?? null;
  },

  _updateCatNeeds(h) {
    if (this.practice) return;
    const n = this.catNeeds;
    if (this.cat.state === 'home' || this.cat.state === 'visit') n.hunger = Math.min(100, n.hunger + this._catRate() * h);
    const c = this.cfg.cat;
    if (n.hunger >= c.warnAt && !n.warned) {
      n.warned = true;
      this._alert('catHungry', 'Кот проголодался — покорми, пока он не полез за едой', { station: 'catbowl' });
      this._emit('catHungry');
    }
    // голодный кот сам ищет еду, оставленную на доске
    if (this.cat.state === 'home' && n.hunger >= c.theftAt && this._temptingItem() && this._canStartUrgent() && this.t - n.lastTry > 25) {
      n.lastTry = this.t;
      this._startCatTheft(this._temptingItem().product);
    }
  },

  feedCat() {
    if (!this._isIdleAt('catbowl') || this.action) return false;
    if (this.cat.state === 'theft' || this.cat.state === 'spill') {
      this.setHint('Сначала прогони кота от еды', 2);
      return false;
    }
    return this._startAction('feedCat', this.cfg.durations.feedCat, () => {
      this.catNeeds.hunger = 0;
      this.catNeeds.warned = false;
      this.stats.catFed = (this.stats.catFed ?? 0) + 1;
      this._removeAlert('catHungry');
      this.cat = { state: 'eat', until: this.t + 10, startedAt: this.t };
      this._emit('catFed');
      this.setHint('Кот хрустит кормом. Сытый кот спит и к еде не лезет', 3);
    });
  },

  playCat() {
    if (!this._isIdleAt('catbowl') || this.action) return false;
    if (this.cat.state === 'theft' || this.cat.state === 'spill') {
      this.setHint('Сначала прогони кота', 2);
      return false;
    }
    return this._startAction('playCat', this.cfg.durations.playCat, () => {
      this.cat = { state: 'play', until: this.t + this.cfg.cat.playTime, startedAt: this.t };
      this._emit('catPlay');
      this.setHint(`Кот гоняет мячик ${this.cfg.cat.playTime} с — но голод это не отменяет`, 3);
    });
  },

  // ---------- пожелания гостей ----------
  _initRequests() {
    this.requests = [];
    if (this.practice) return;
    if (this.day.request) this.requests.push({ id: 0, recipe: this.day.request.recipe, kind: 'noOnion', fixed: true, known: false });
    const n = (this.day.wishes ?? 0) + (this.mods.extraWish ? 1 : 0);
    const rng = createRng((this.seed ^ 0x51ed) >>> 0);
    for (let k = 0; k < n; k++) this._addRandomWish(rng, 6 + rng.next() * 34);
  },

  _wishOptions() {
    const used = new Set(this.requests.map((r) => r.recipe));
    const out = [];
    for (const [kind, w] of Object.entries(WISHES))
      for (const r of w.recipes) {
        const dish = this.dishes[r];
        if (!dish || dish.done || used.has(r)) continue;
        if (w.shift || w.set) {
          if (!dish.season || dish.steps.season.done) continue;
        }
        if (kind === 'noOnion' && !RECIPES[r].onionOption) continue;
        out.push({ kind, recipe: r });
      }
    return out;
  },

  _addRandomWish(rng, at) {
    const opts = this._wishOptions();
    if (!opts.length) return null;
    const o = opts[Math.floor(rng.next() * opts.length)];
    const req = { id: this.requests.length + 1, recipe: o.recipe, kind: o.kind, fixed: false, known: false };
    this.requests.push(req);
    const w = WISHES[o.kind];
    const se = this.dishes[o.recipe].season;
    if (se && w.shift) se.target.salt = Math.max(1, se.target.salt + w.shift.salt);
    if (se && w.set) se.target.pepper = w.set.pepper;
    if (o.kind === 'extraCaviar') this.dishes[o.recipe].wantDoses = 3;
    this.msgQueue.push({ at, from: 'Гости', text: w.text(o.recipe), request: req.id, sent: false, id: 100 + req.id });
    return req;
  },

  wishMet(req) {
    const dish = this.dishes[req.recipe];
    if (!dish) return false;
    switch (req.kind) {
      case 'noOnion':
        return dish.variant.onion === false;
      case 'lightMayo':
        return dish.mayo === 'light';
      case 'moreSalt':
      case 'lessSalt':
        return !!dish.season && !!dish.steps.season?.done && dish.season.salt === dish.season.target.salt;
      case 'noPepper':
        return !!dish.season && !!dish.steps.season?.done && dish.season.pepper === 0;
      case 'extraCaviar':
        return !!dish.work?.breads?.every((b) => b.doses >= 3);
      default:
        return false;
    }
  },

  wishLabel(req) {
    return WISHES[req.kind]?.label ?? req.kind;
  },

  // ---------- деньги ----------
  money() {
    return { budget: this.wallet.budget, spent: this.wallet.spent, left: this.wallet.budget - this.wallet.spent };
  },

  orderCost(items, mode = 'standard') {
    const m = this.cfg.money.modes[mode];
    let goods = 0;
    for (const [id, q] of Object.entries(items)) goods += (PRODUCTS[id]?.price ?? 0) * q;
    return { goods, fee: m?.fee ?? 0, total: goods + (m?.fee ?? 0) };
  },

  deliveryModes() {
    return Object.entries(this.cfg.money.modes)
      .filter(([id]) => !(id === 'express' && this.mods.noExpress))
      .map(([id, m]) => ({ id, ...m }));
  },

  // ---------- темп, звёзды, медали ----------
  par() {
    return (this.day.targetMinutes ?? 8) * 60 * (this.mods.rush ? 0.7 : 1);
  },

  paceScore(t = this.t) {
    const par = this.par();
    if (t <= par) return 100;
    return Math.max(this.cfg.pace.floor, Math.round(100 - ((t - par) / par) * 60));
  },

  starsFor(D) {
    return this.cfg.stars.filter((x) => D >= x).length;
  },

  _medals(t) {
    const out = [];
    if (t <= this.par()) out.push('fast');
    const cuts = [];
    for (const d of Object.values(this.dishes))
      for (const s of d.recipe.steps) if (s.type === 'cut' && d.steps[s.id].done && d.steps[s.id].q != null) cuts.push(d.steps[s.id].q);
    if (cuts.length && cuts.reduce((a, b) => a + b, 0) / cuts.length >= 0.9) out.push('sharpKnife');
    const seasons = Object.values(this.dishes).filter((d) => d.season && d.steps.season?.done);
    if (seasons.length && seasons.every((d) => d.steps.season.q >= 0.999)) out.push('perfectTaste');
    if (!this.stats.thefts && !this.glass.spilled) out.push('noTheft');
    if (!this.stats.puddlesMade) out.push('cleanFloor');
    if (this.wallet.budget > 0 && this.wallet.spent <= this.wallet.budget * this.cfg.money.thrifty) out.push('thrifty');
    if (this.requests.length && this.requests.every((r) => this.wishMet(r))) out.push('wishes');
    return out;
  },

  // ---------- стрим: события по голосованию чата ----------
  streamEvent(kind) {
    if (this.isOver() || this.practice) return false;
    switch (kind) {
      case 'cat':
        this.catNeeds.hunger = 100;
        if (this.cat.state === 'play' || this.cat.state === 'eat') this.cat = { state: 'home' };
        this._emit('stream', { kind, text: 'Чат разбудил кота — он голоден!' });
        return true;
      case 'radio':
        if (!this.radio.enabled || this.radio.broken) return false;
        this.breakRadio();
        this._emit('stream', { kind, text: 'Чат сломал радио' });
        return true;
      case 'garland':
        if (this.garland.broken) return false;
        this.garland.broken = true;
        this.garland.progress = 0;
        this._alert('garland', 'Часть гирлянды погасла', { station: 'garland' });
        this._emit('garlandOff');
        this._emit('stream', { kind, text: 'Чат выключил гирлянду' });
        return true;
      case 'guest': {
        const req = this._addRandomWish(createRng((this.seed + Math.floor(this.t * 1000)) >>> 0), this.t);
        if (req) this._emit('stream', { kind, text: 'Чат прислал пожелание гостей' });
        return !!req;
      }
      default:
        return false;
    }
  },

  catBowlStand() {
    return CLAYOUT.stations.catbowl?.stand ?? null;
  },
};
