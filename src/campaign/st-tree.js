// Ёлка (0.9, пункт 24 владельца): подарки под ёлкой (3 в день, внутри очки домохозяйки или игрушка), ёлочные игрушки —
// купить в «Ёлочном базаре» (0.10), повесить на ёлку, снять; кот от скуки сбивает игрушки на пол. Звезда на ёлке — st-home.js (lightsOff).
// 0.11: ёлка на старте голая; игрушка висит в ЛЮБОЙ точке поверхности (at: {x, y, z} в координатах ёлки, tree-geo.js), а не на
// заготовленных местах; мишура — нитка из точек, длина списывается с мотка; кот может уронить ёлку целиком, поднять её — жестом.
import { TOYS, GIFTS, TOY_SETS, BAZAAR, TINSEL } from './data.js';
import { onTree, tooClose, roundPt, dist, pathLength, snapToTree, slotToAt, cleanAt } from './tree-geo.js';
import { createRng } from '../game/rng.js';
import { Scrubber } from './mechanics.js';
import { pts } from './words.js';

export const TOY_IDS = Object.keys(TOYS);

const round4 = (v) => Math.round(v * 1e4) / 1e4;
// Отказ «повесить»: что случилось — как исправить (≤ 70 знаков)
const HANG_HINT = {
  off: 'Игрушку вешают на ёлку — целься в ветки',
  close: 'Тут тесно — повесь подальше от соседней игрушки',
  down: 'Ёлка лежит — сначала подними её',
};

/**
 * Приз подарка: «случайный» для игрока, но закреплён за днём и номером подарка — переиграть день и выбить
 * другой приз нельзя. { kind: 'points', n } или { kind: 'toy', id }.
 */
export function giftPrize(dayId, index, gifts = GIFTS) {
  const rng = createRng((dayId * 1009 + index * 97 + 13) >>> 0);
  rng.next();
  const total = gifts.prizes.reduce((s, p) => s + p.w, 0);
  let r = rng.next() * total;
  const p = gifts.prizes.find((x) => (r -= x.w) < 0) ?? gifts.prizes[0];
  if (p.kind === 'toy') return { kind: 'toy', id: TOY_IDS[Math.floor(rng.next() * TOY_IDS.length)] };
  return { kind: 'points', n: p.n };
}

/** Товар дня «Ёлочного базара»: закреплён за днём кампании (за неделю — разные игрушки). */
export function dealToy(dayId) {
  return TOY_IDS[(dayId * 7 + 3) % TOY_IDS.length];
}

export const treeMethods = {
  _initTree(toys = [], giftsOpened = [], setsDone = [], tinsel = null) {
    const T = this.cfg.tree, K = this.cfg.tinsel;
    this.setsDone = new Set(setsDone.filter((id) => TOY_SETS[id])); // наборы, за которые награда уже получена
    // uid — номер игрушки (с 1); at — точка на ёлке {x, y, z} (tree-geo.js) или null — в коробке. Старые сохранения с slot
    // перенесены в at при чтении (save.js); здесь slot терпим для тестов и ручных вызовов.
    this.toys = [];
    let hung = 0;
    for (const t of toys) {
      if (!TOYS[t?.id]) continue;
      let at = cleanAt(t.at, T.tol) ?? (t.at == null ? slotToAt(t.slot) : null);
      if (at && hung >= T.maxToys) at = null;
      if (at) hung++;
      this.toys.push({ uid: this.toys.length + 1, id: t.id, at, fallen: false });
    }
    this._toyUid = this.toys.length; // следующий номер: после боя игрушек uid не повторяются
    this.treeHand = null; // uid игрушки в руке
    this.treeFrom = null; // откуда её сняли (точка на ёлке): если повесить некуда — вернётся сюда
    this.treeFall = { down: false, tilt: 0, grab: null }; // 0.11: кот уронил ёлку — tilt градусов от вертикали, grab — {a0, t0} пока тянут
    // мишура: rolls — сколько метров осталось в мотках, threads — нитки на ёлке, tool — цвет мотка в руке | 'cut' | null, draw — нитка в работе
    this.tinsel = { rolls: Object.fromEntries(K.colors.map((c) => [c, 0])), threads: [], tool: null, draw: null, nextId: 1, sfx: 0 };
    for (const c of K.colors) {
      const v = Number(tinsel?.rolls?.[c]);
      if (Number.isFinite(v) && v > 0) this.tinsel.rolls[c] = round4(Math.min(v, 100));
    }
    for (const th of tinsel?.threads ?? []) {
      if (!TINSEL[th?.color] || !Array.isArray(th.pts) || this.tinsel.threads.length >= K.maxThreads) continue;
      const ptsOk = th.pts.slice(0, K.maxPoints).map((q) => (Array.isArray(q) ? { x: q[0], y: q[1], z: q[2] } : q)).map((q) => cleanAt(q, T.tol * 2));
      if (ptsOk.length >= 2 && ptsOk.every(Boolean)) this.tinsel.threads.push({ id: this.tinsel.nextId++, color: th.color, pts: ptsOk });
    }
    const noGifts = this.practice || this.challenge;
    this.gifts = { opened: new Set(noGifts ? Array.from({ length: GIFTS.perDay }, (_, i) => i) : giftsOpened) };
    this.giftShow = null;
    this.gift = null; // 0.10: подарок в руках — { index, stage: 'bow' | 'paper' | 'lid', bow, tear, lid, grab, hold }
    this.giftWork = {}; // начатые подарки: прогресс не сгорает, если отложить (Esc) и вернуться
  },

  /** Номера ещё не открытых подарков этого дня. */
  giftsLeft() {
    return Array.from({ length: GIFTS.perDay }, (_, i) => i).filter((i) => !this.gifts.opened.has(i));
  },

  /** Взять подарок в руки (0.10) — крупный план подарка. Начатый раньше продолжается с того же места. */
  startGift(index) {
    if (!this._isIdleAt('tree') || this.action || this.gift) return false;
    this.giftShow = null;
    if (!this.giftsLeft().includes(index)) return false;
    if (this.treeHand != null) this.treeHand = null; // игрушку из руки — обратно в коробку
    const g = this.cfg.gift;
    this.gift = this.giftWork[index] ??= { index, stage: 'bow', bow: 0, tear: new Scrubber({ need: g.tearPath, maxStep: g.maxStep }), lid: { x: 0, z: 0 }, grab: null, hold: null };
    this._emit('giftStart', { index, stage: this.gift.stage });
    return true;
  },

  /** Отложить подарок (Esc, «←»): он снова под ёлкой, прогресс сохранён. */
  leaveGift() {
    const g = this.gift;
    if (!g) return false;
    g.grab = null;
    g.hold = null;
    g.tear.release();
    this.gift = null;
    this._emit('giftLeave', { index: g.index });
    return true;
  },

  /** Насколько открыт подарок: 0…1 по трём движениям (для полосы и чипа в доке). */
  giftProgress(index) {
    const g = this.giftWork[index];
    if (!g) return 0;
    const c = this.cfg.gift;
    const part = g.stage === 'bow' ? Math.min(1, g.bow / c.bowPull) : g.stage === 'paper' ? g.tear.progress : Math.min(1, Math.hypot(g.lid.x, g.lid.z) / c.lidSlide);
    return ({ bow: 0, paper: 1, lid: 2 }[g.stage] + part) / 3;
  },

  // Жесты подарка в локальных метрах (центр — середина крышки). Каждое движение — своим нажатием: дотянула бант
  // и продолжаешь вести — бумага ещё не рвётся, нужно нажать заново. Отпустила — прогресс остался.
  _giftPointer(type, x, z) {
    const g = this.gift, c = this.cfg.gift;
    const inBox = Math.abs(x) <= c.box && Math.abs(z) <= c.box;
    if (type === 'up') {
      g.grab = null;
      g.hold = null;
      g.tear.release();
      return 'up';
    }
    if (type === 'down') {
      g.hold = g.stage;
      if (g.stage === 'bow') {
        if (Math.hypot(x, z) > c.bowR) {
          this.setHint('Сначала бант: зажми его посередине и потяни', 1.8);
          g.hold = null;
          return 'bow-miss';
        }
        g.grab = { x, z };
        return 'grab';
      }
      if (g.stage === 'lid') {
        if (!inBox) {
          this.setHint('Зажми крышку и сдвинь её с коробки', 1.8);
          g.hold = null;
          return 'lid-miss';
        }
        g.grab = { x: x - g.lid.x, z: z - g.lid.z };
        return 'grab';
      }
    }
    if (g.hold !== g.stage) return 'idle';
    if (g.stage === 'bow' && g.grab) {
      const d = Math.min(Math.hypot(x - g.grab.x, z - g.grab.z), c.maxStep);
      g.grab = { x, z };
      g.bow += d;
      this._giftTick(g, Math.min(1, g.bow / c.bowPull));
      if (g.bow >= c.bowPull - 1e-9) this._giftStage(g, 'paper', 'giftBow');
      return 'pull';
    }
    if (g.stage === 'paper') {
      g.tear.move(x, z, inBox);
      this._giftTick(g, g.tear.progress);
      if (g.tear.complete) this._giftStage(g, 'lid', 'giftPaper');
      return 'tear';
    }
    if (g.stage === 'lid' && g.grab) {
      g.lid = { x: x - g.grab.x, z: z - g.grab.z };
      this._giftTick(g, Math.min(1, Math.hypot(g.lid.x, g.lid.z) / c.lidSlide));
      if (Math.hypot(g.lid.x, g.lid.z) >= c.lidSlide - 1e-9) this._finishGift(g.index);
      return 'slide';
    }
    return 'idle';
  },

  // Отклик непрерывного жеста — щелчок на каждой четверти движения, а не сплошной гул.
  _giftTick(g, p) {
    const step = Math.floor(p * 4);
    if (step > (g.tick ?? 0) && step < 4) this._emit('giftTick', { index: g.index, stage: g.stage, p });
    g.tick = Math.max(g.tick ?? 0, step);
  },

  _giftStage(g, next, ev) {
    g.stage = next;
    g.grab = null;
    g.tick = 0;
    g.tear.release();
    this._emit(ev, { index: g.index });
  },

  _finishGift(index) {
    this.gift = null;
    this.giftShow = { index, until: this.t + this.cfg.gift.reveal }; // камера ещё держит открытый подарок с призом
    delete this.giftWork[index];
    if (this.gifts.opened.has(index)) return;
    this.gifts.opened.add(index);
    const prize = giftPrize(this.day.id, index);
    let uid = null;
    if (prize.kind === 'points') this._earn(prize.n, 'Подарок под ёлкой', { banked: true });
    else uid = this._addToy(prize.id);
    this._emit('giftOpened', { dayId: this.day.id, index, prize, uid });
  },

  _addToy(id) {
    const uid = ++this._toyUid;
    this.toys.push({ uid, id, at: null, fallen: false });
    return uid;
  },

  /**
   * Игрушка приехала не из базара (доставка, 0.11): в коробку у ёлки без списания очков.
   * Событие toyBought { source } — сохранение (persist.js) для source 'delivery' очки не трогает.
   */
  addToy(id, { source = 'delivery' } = {}) {
    if (!TOYS[id]) return null;
    const uid = this._addToy(id);
    this._emit('toyBought', { id, uid, price: 0, source });
    return uid;
  },

  /** Игрушка со скидкой сегодня (null — в испытании и практике базара нет). */
  dealId() {
    return this.practice || this.challenge ? null : dealToy(this.day.id);
  },

  /** Цена игрушки сегодня, с учётом скидки на товар дня. */
  toyPrice(id) {
    const t = TOYS[id];
    if (!t) return null;
    return id === this.dealId() ? Math.round(t.price * (1 - BAZAAR.dealOff)) : t.price;
  },

  /** Набор на ёлке: сколько его разных игрушек висит, сколько нужно, получена ли награда. */
  setProgress(id) {
    const set = TOY_SETS[id];
    const onTree = new Set(this.toys.filter((t) => t.at).map((t) => t.id));
    return { hung: set.toys.filter((x) => onTree.has(x)).length, need: set.toys.length, done: this.setsDone.has(id) };
  },

  // Повешена игрушка — не собрался ли набор. Награда разовая: снял и повесил снова — второй раз не дают.
  _checkSets() {
    for (const [id, set] of Object.entries(TOY_SETS)) {
      if (this.setsDone.has(id)) continue;
      const p = this.setProgress(id);
      if (p.hung < p.need) continue;
      this.setsDone.add(id);
      const n = this._earn(set.reward, `Набор «${set.name}»`, { banked: true });
      this._emit('setComplete', { id, n });
      this.setHint(`Набор «${set.name}» собран! +${pts(set.reward)}`, 3);
    }
  },

  /** Купить ёлочную игрушку за очки домохозяйки (телефон → «Ёлочный базар»). Товар дня — со скидкой. */
  buyToy(id) {
    const t = TOYS[id];
    if (!t) return false;
    if (this.challenge || this.practice) {
      this.setHint('Игрушки покупаются в кампании', 2.5);
      return false;
    }
    const price = this.toyPrice(id);
    if (this.bonus.points < price) {
      this.setHint(`Не хватает очков домохозяйки: нужно ${price}, есть ${this.bonus.points}`, 2.5);
      return false;
    }
    if (this.bonus.banked < price) {
      this.setHint('Очки за готовку станут доступны для игрушек после завершения дня. Очки из подарков — сразу!', 4);
      return false;
    }
    this.bonus.points -= price;
    this.bonus.banked -= price;
    this.bonus.history.unshift({ t: this.t, n: -price, why: t.name });
    const uid = this._addToy(id);
    this._emit('toyBought', { id, uid, price, source: 'bazaar' });
    this.setHint(`${t.name} — в коробке у ёлки. Повесь её!`, 3);
    return true;
  },

  /** Игрушки в коробке (не на ёлке и не на полу). */
  toysInBox() {
    return this.toys.filter((t) => !t.at && !t.fallen);
  },

  /** Игрушки на полу (сбиты котом или упали вместе с ёлкой). */
  toysOnFloor() {
    return this.toys.filter((t) => t.fallen);
  },

  _toysOnTree() {
    return this.toys.filter((t) => t.at).length;
  },

  _handToBox() {
    if (this.treeHand == null) return;
    this.treeHand = null;
    this.treeFrom = null;
  },

  /** Взять игрушку из коробки в руку (повторно — положить обратно). */
  pickToy(uid) {
    if (!this._isIdleAt('tree') || this.gift) return false;
    const t = this.toys.find((x) => x.uid === uid);
    if (!t || t.at || t.fallen) return false;
    this.tinsel.tool = null;
    this.treeFrom = null;
    this.treeHand = this.treeHand === uid ? null : uid;
    this._emit('pick', { product: 'toy' });
    return true;
  },

  /**
   * Можно ли повесить игрушку в точку at (координаты ёлки). { ok: true, at } с округлённой точкой или
   * { ok: false, why: 'off' | 'close' | 'limit' | 'down' }: мимо ёлки, рядом чужая игрушка, лимит, ёлка лежит.
   */
  hangCheck(at) {
    const T = this.cfg.tree;
    if (this.treeFall.down) return { ok: false, why: 'down' };
    const p = at && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z) ? roundPt(at) : null;
    if (!p || !onTree(p, T.tol)) return { ok: false, why: 'off' };
    const hung = this.toys.filter((t) => t.at);
    if (hung.length >= T.maxToys) return { ok: false, why: 'limit' };
    if (tooClose(p, hung, T.minDist)) return { ok: false, why: 'close' };
    return { ok: true, at: p };
  },

  _hangHint(why) {
    this.setHint(why === 'limit' ? `На ёлке уже ${this.cfg.tree.maxToys} игрушек — сними лишние` : HANG_HINT[why], 1.8);
  },

  // Повесить игрушку из руки в точку at (проверка — в hangCheck). true — повешена.
  _hangHand(at, quiet = false) {
    const t = this.toys.find((x) => x.uid === this.treeHand);
    if (!t) return false;
    const r = this.hangCheck(at);
    if (!r.ok) {
      if (!quiet) this._hangHint(r.why);
      return false;
    }
    t.at = r.at;
    this.treeHand = null;
    this.treeFrom = null;
    this._emit('toyHung', { uid: t.uid, id: t.id, at: { ...r.at } });
    this._checkSets();
    return true;
  },

  /**
   * Клик по ёлке в крупном плане. at — точка на поверхности под мышью (координаты ёлки, tree-geo.rayHitTree) или null.
   * С игрушкой в руке — повесить в этой точке (любой свободной, не ближе minDist к соседней). Пустой рукой — снять игрушку:
   * uid — её назвал вид по лучу мыши; без него берётся ближайшая к at в радиусе tree.pickR. Снятую можно перевесить следующим кликом.
   */
  treeClick(at, uid = null) {
    if (!this._isIdleAt('tree') || this.action || this.gift) return false;
    if (this.treeFall.down) {
      this._hangHint('down');
      return false;
    }
    if (this.treeHand != null) return this._hangHand(at);
    let t = null;
    if (uid != null) t = this.toys.find((x) => x.uid === uid && x.at);
    else if (at && Number.isFinite(at.x)) {
      let best = this.cfg.tree.pickR;
      for (const x of this.toys) {
        if (!x.at) continue;
        const d = dist(x.at, at);
        if (d <= best) [t, best] = [x, d];
      }
    }
    if (!t) return false;
    this.tinsel.tool = null;
    this.treeFrom = { ...t.at };
    t.at = null;
    this.treeHand = t.uid;
    this._emit('toyTaken', { uid: t.uid, id: t.id });
    return true;
  },

  /**
   * Отпустить игрушку из руки после перетаскивания (0.10): над свободной точкой at — повесить; мимо, слишком тесно или
   * на лимите — вернуть туда, откуда сняли (back; по умолчанию запомненное место), а если сняли из коробки или место
   * занято — в коробку. true — повешена в at.
   */
  dropToy(at, back = this.treeFrom) {
    if (this.treeHand == null || !this._isIdleAt('tree')) return false;
    if (at && this._hangHand(at)) return true;
    if (back && this._hangHand(back, true)) return false;
    const t = this.toys.find((x) => x.uid === this.treeHand);
    this._handToBox();
    this._emit('toyReturned', { uid: t.uid, id: t.id });
    return false;
  },

  // Кот сбил игрушки (проказа от скуки): до двух висящих — на пол, их нужно подобрать.
  _knockToys() {
    const hung = this.toys.filter((t) => t.at);
    const n = Math.min(2, hung.length);
    const knocked = [];
    for (let k = 0; k < n; k++) {
      const i = Math.floor(this.rng.next() * hung.length);
      const t = hung.splice(i, 1)[0];
      knocked.push({ uid: t.uid, id: t.id, from: { ...t.at } });
      t.at = null;
      t.fallen = true;
    }
    if (knocked.length) {
      this._alert('toys', 'Игрушки на полу', { station: 'tree', detail: 'Игрушки на полу — подбери их у ёлки' });
      this._emit('toysKnocked', { uids: knocked.map((k) => k.uid), items: knocked });
    }
    return knocked.length;
  },

  /**
   * Подобрать игрушку с пола (0.11: по одной — клик по ней или перетаскивание в коробку; кнопки «Поднять игрушки» больше нет).
   * Подобранная ложится в коробку — повесь её снова.
   */
  pickUpToy(uid) {
    if (!this._isIdleAt('tree') || this.action || this.gift) return false;
    const t = this.toys.find((x) => x.uid === uid && x.fallen);
    if (!t) return false;
    t.fallen = false;
    const left = this.toysOnFloor().length;
    if (!left) {
      this._removeAlert('toys');
      this.setHint('Игрушки в коробке — повесь их обратно', 2.5);
    }
    this._emit('toyPicked', { uid: t.uid, id: t.id, left });
    return true;
  },

  /** Для сохранения: игрушки по порядку uid. Упавшие и снятые в руку сохраняются «в коробке» (at: null). */
  toysForSave() {
    return this.toys.map((t) => ({ id: t.id, at: t.at && !t.fallen ? { ...t.at } : null }));
  },

  // ---------- мишура (0.11) ----------
  /** Сколько метров мишуры цвета color осталось в мотке. */
  tinselLeft(color) {
    return this.tinsel.rolls[color] ?? 0;
  },

  /** Цвета, в которых в мотке ещё есть длина на хотя бы один шаг нитки. */
  tinselColors() {
    return this.cfg.tinsel.colors.filter((c) => this.tinselLeft(c) >= this.cfg.tinsel.step);
  },

  /**
   * Моток мишуры в коробку (+tinsel.roll метров). Для доставки и базара: очки не списываются (это делает buyTinsel).
   * Событие tinselBought { color, source, price } — сохранение (persist.js).
   */
  addTinselRoll(color, { source = 'delivery', price = 0 } = {}) {
    if (!TINSEL[color]) return false;
    const K = this.cfg.tinsel;
    this.tinsel.rolls[color] = round4(this.tinsel.rolls[color] + K.roll);
    this._emit('tinselBought', { color, source, price, roll: K.roll });
    return true;
  },

  /** Купить моток мишуры за очки домохозяйки (телефон → «Ёлочный базар»). */
  buyTinsel(color) {
    const t = TINSEL[color];
    if (!t) return false;
    if (this.challenge || this.practice) {
      this.setHint('Мишура покупается в кампании', 2.5);
      return false;
    }
    if (this.bonus.points < t.price) {
      this.setHint(`Не хватает очков домохозяйки: нужно ${t.price}, есть ${this.bonus.points}`, 2.5);
      return false;
    }
    if (this.bonus.banked < t.price) {
      this.setHint('Очки за готовку станут доступны для игрушек после завершения дня. Очки из подарков — сразу!', 4);
      return false;
    }
    this.bonus.points -= t.price;
    this.bonus.banked -= t.price;
    this.bonus.history.unshift({ t: this.t, n: -t.price, why: t.name });
    this.addTinselRoll(color, { source: 'bazaar', price: t.price });
    this.setHint(`${t.name} — моток ${this.cfg.tinsel.roll} м у ёлки. Развесь её!`, 3);
    return true;
  },

  /**
   * Взять в руку моток цвета color или «ножницы» ('cut'); повторно тот же — убрать. null — убрать всё.
   * Игрушка из руки возвращается в коробку.
   */
  tinselPick(tool) {
    const tn = this.tinsel;
    if (!this._isIdleAt('tree') || this.gift || this.action) return false;
    if (tool == null || tool === tn.tool) {
      this.tinselEnd();
      tn.tool = null;
      return true;
    }
    if (this.treeFall.down) {
      this._hangHint('down');
      return false;
    }
    if (tool === 'cut') {
      if (!tn.threads.length) {
        this.setHint('Снимать нечего — мишуры на ёлке нет', 2);
        return false;
      }
    } else if (!TINSEL[tool] || this.tinselLeft(tool) < this.cfg.tinsel.step) {
      this.setHint('Моток кончился — докупи мишуру в «Ёлочном базаре»', 2.5);
      return false;
    }
    this.tinselEnd();
    this._handToBox();
    tn.tool = tool;
    this._emit('pick', { product: 'tinsel' });
    return true;
  },

  /** Нажала на ёлке мотком в руке: начать нитку в точке at. */
  tinselStart(at) {
    const tn = this.tinsel, K = this.cfg.tinsel;
    if (!this._isIdleAt('tree') || this.action || this.gift || tn.draw) return false;
    const color = tn.tool;
    if (!TINSEL[color]) return false;
    if (this.treeFall.down) {
      this._hangHint('down');
      return false;
    }
    const p = at && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z) ? roundPt(at, K.round) : null;
    if (!p || !onTree(p, this.cfg.tree.tol)) return false;
    if (this.tinselLeft(color) < K.step) {
      tn.tool = null;
      this.setHint('Моток кончился — докупи мишуру в «Ёлочном базаре»', 2.5);
      return false;
    }
    if (tn.threads.length >= K.maxThreads) {
      this.setHint(`На ёлке уже ${K.maxThreads} ниток — сними лишние ножницами`, 2.5);
      return false;
    }
    const thread = { id: tn.nextId++, color, pts: [p] };
    tn.threads.push(thread);
    tn.draw = { thread };
    return true;
  },

  /**
   * Мышь ведёт нитку: at — точка на ёлке под мышью (или null, если мимо). Новые точки — не ближе tinsel.step к прошлой;
   * быстрый росчерк добивается точками по поверхности, длина списывается с мотка. Кончился моток или нитка — нитка закончилась.
   * @returns {'idle'|'off'|'near'|'draw'|'jump'|'empty'|'full'|'stop'}
   */
  tinselMove(at) {
    const tn = this.tinsel, K = this.cfg.tinsel;
    const d = tn.draw;
    if (!d) return 'idle';
    if (!this._isIdleAt('tree') || this.treeFall.down) {
      this.tinselEnd();
      return 'stop';
    }
    const to = at && Number.isFinite(at.x) && Number.isFinite(at.y) && Number.isFinite(at.z) ? roundPt(at, K.round) : null;
    if (!to || !onTree(to, this.cfg.tree.tol)) return 'off';
    const th = d.thread;
    const from = th.pts[th.pts.length - 1];
    const gap = dist(to, from);
    if (gap < K.step - 1e-9) return 'near';
    if (gap > K.maxJump) {
      // рывок через пол-ёлки: нитку оборвали, новую начинаем здесь
      this.tinselEnd();
      return this.tinselStart(to) ? 'jump' : 'full';
    }
    const n = Math.max(1, Math.floor(gap / (K.step * 1.5)));
    let result = 'draw';
    for (let k = 1; k <= n; k++) {
      const lerp = { x: from.x + ((to.x - from.x) * k) / n, y: from.y + ((to.y - from.y) * k) / n, z: from.z + ((to.z - from.z) * k) / n };
      const q = k === n ? to : roundPt(snapToTree(lerp) ?? lerp, K.round);
      const prev = th.pts[th.pts.length - 1];
      const seg = dist(prev, q);
      if (seg < K.step - 1e-9) continue;
      if (this.tinselLeft(th.color) < seg - 1e-9) {
        result = 'empty';
        break;
      }
      tn.rolls[th.color] = round4(tn.rolls[th.color] - seg);
      th.pts.push(q);
      tn.sfx += seg;
      if (th.pts.length >= K.maxPoints) {
        result = 'full';
        break;
      }
    }
    if (tn.sfx >= 0.15) {
      tn.sfx = 0;
      this._emit('tinselDraw', { color: th.color });
    }
    if (result === 'empty') {
      this.setHint('Моток кончился — докупи мишуру в «Ёлочном базаре»', 2.5);
      this._emit('tinselEmpty', { color: th.color });
    } else if (result === 'full') this.setHint('Нитка вышла длинной — отпусти и начни новую', 2.5);
    if (result !== 'draw') this.tinselEnd();
    return result;
  },

  /** Отпустила кнопку — нитка закончилась. Короче двух точек — не нитка, выбрасывается. true — нитка осталась на ёлке. */
  tinselEnd() {
    const tn = this.tinsel;
    const d = tn?.draw;
    if (!d) return false;
    tn.draw = null;
    tn.sfx = 0;
    const th = d.thread;
    if (th.pts.length < 2) {
      tn.threads = tn.threads.filter((x) => x !== th);
      return false;
    }
    if (this.tinselLeft(th.color) < this.cfg.tinsel.step) tn.tool = null; // моток вышел целиком — рука пуста
    this._emit('tinselHung', { id: th.id, color: th.color, len: round4(pathLength(th.pts)) });
    return true;
  },

  /** «Ножницами» по нитке id: она снимается, её длина возвращается в моток. */
  tinselRemove(id) {
    const tn = this.tinsel;
    if (!this._isIdleAt('tree') || this.gift || this.action) return false;
    const th = tn.threads.find((x) => x.id === id);
    if (!th) return false;
    const len = round4(pathLength(th.pts));
    tn.threads = tn.threads.filter((x) => x !== th);
    tn.rolls[th.color] = round4(tn.rolls[th.color] + len);
    if (!tn.threads.length && tn.tool === 'cut') tn.tool = null;
    this._emit('tinselTaken', { id: th.id, color: th.color, len });
    return true;
  },

  /** Длина нитки id, м. */
  tinselLength(id) {
    const th = this.tinsel.threads.find((x) => x.id === id);
    return th ? round4(pathLength(th.pts)) : 0;
  },

  /** Для сохранения: нитки [{ color, pts: [[x, y, z], …] }] и остатки мотков { цвет: метры }. */
  tinselForSave() {
    const tn = this.tinsel;
    return {
      threads: tn.threads.filter((t) => t.pts.length >= 2).map((t) => ({ color: t.color, pts: t.pts.map((p) => [p.x, p.y, p.z]) })),
      rolls: Object.fromEntries(Object.entries(tn.rolls).map(([c, v]) => [c, Math.round(v * 100) / 100]).filter(([, v]) => v > 0)),
    };
  },

  // ---------- кот уронил ёлку (0.11) ----------
  /** Есть ли что ронять: ёлка стоит и на ней что-то висит (иначе кот не затевает эту шалость). */
  _treeCanFall() {
    return !this.treeFall.down && (this._toysOnTree() > 0 || this.tinsel.threads.length > 0);
  },

  /**
   * Ёлка падает (наклон cfg.tree.fallTilt). Висевшие игрушки — на пол; стеклянные (TOYS[*].glass) бьются с шансом
   * cat.toyBreakChance (бросок this.rng, по порядку uid); мишура слетает в мотки; звезда гаснет. Пока лежит — вешать нельзя.
   */
  _dropTree() {
    const f = this.treeFall;
    if (f.down) return false;
    const chance = this.cfg.cat.toyBreakChance ?? 0;
    const broken = [], fallen = [];
    for (const t of this.toys) {
      if (!t.at) continue;
      const item = { uid: t.uid, id: t.id, from: { ...t.at } };
      if (TOYS[t.id]?.glass && this.rng.next() < chance) broken.push(item);
      else fallen.push(item);
    }
    for (const b of broken) this.toys.splice(this.toys.findIndex((t) => t.uid === b.uid), 1);
    for (const it of fallen) {
      const t = this.toys.find((x) => x.uid === it.uid);
      t.at = null;
      t.fallen = true;
    }
    const back = {};
    for (const th of this.tinsel.threads) back[th.color] = round4((back[th.color] ?? 0) + pathLength(th.pts));
    for (const [c, v] of Object.entries(back)) this.tinsel.rolls[c] = round4(this.tinsel.rolls[c] + v);
    this.tinsel.threads = [];
    this.tinsel.draw = null;
    this.tinsel.tool = null;
    this._handToBox(); // игрушка в руке уже «снята» с ёлки — вернулась в коробку
    this.treeFall = { down: true, tilt: this.cfg.tree.fallTilt, grab: null };
    this.lightsOff('star', { by: 'cat' }); // звезда гаснет
    this._alert('tree', 'Ёлка упала', { station: 'tree', detail: 'Ёлка лежит на полу. Подойди к ней, зажми ствол или верхушку и потяни вверх' });
    for (const b of broken) this._emit('toyBroken', { uid: b.uid, id: b.id, from: b.from });
    this._emit('treeFell', { broken, fallen, tinsel: back });
    return true;
  },

  /**
   * Жест «поднять ёлку»: зажала ствол ('trunk') или верхушку ('tip'), angle — угол мыши вокруг основания ёлки (градусы от
   * вертикали в сторону падения, считает вид). Наклон идёт за мышью на тот же угол; отпустила — ёлка остаётся, где была.
   */
  treeLiftStart(zone, angle) {
    const f = this.treeFall;
    if (!f.down || !this._isIdleAt('tree') || this.action || this.gift) return false;
    if (zone !== 'trunk' && zone !== 'tip') {
      this.setHint('Возьмись за ствол или за верхушку и тяни вверх', 2.2);
      return false;
    }
    if (!Number.isFinite(angle)) return false;
    f.grab = { a0: angle, t0: f.tilt, tick: Math.floor(f.tilt / 15) };
    return true;
  },

  /** Мышь с зажатой ёлкой сместилась: angle — новый угол (см. treeLiftStart). 'up' — ёлка встала. */
  treeLiftMove(angle) {
    const f = this.treeFall;
    if (!f.down || !f.grab || !Number.isFinite(angle)) return 'idle';
    const T = this.cfg.tree;
    f.tilt = Math.max(0, Math.min(T.fallTilt, f.grab.t0 + (angle - f.grab.a0)));
    const step = Math.floor(f.tilt / 15);
    if (step !== f.grab.tick) {
      f.grab.tick = step;
      this._emit('treeLiftTick', { tilt: f.tilt });
    }
    if (f.tilt <= T.liftDone) {
      this.treeFall = { down: false, tilt: 0, grab: null };
      this._removeAlert('tree');
      this._emit('treeUp');
      this.setHint(this.toysOnFloor().length ? 'Ёлка стоит! Игрушки с пола — в коробку' : 'Ёлка снова стоит', 3);
      return 'up';
    }
    return 'lift';
  },

  /** Отпустила ёлку: наклон остаётся, какой был. */
  treeLiftEnd() {
    if (this.treeFall?.grab) this.treeFall.grab = null;
  },

  /** Насколько поднята упавшая ёлка: 0 — лежит, 1 — стоит. */
  treeLiftProgress() {
    const f = this.treeFall;
    return f.down ? 1 - f.tilt / this.cfg.tree.fallTilt : 1;
  },

  // Отпустили кнопку мыши (session.pointerUp): нитка закончилась, ёлку выпустили.
  _treePointerUp() {
    this.tinselEnd();
    this.treeLiftEnd();
  },
};
