// Ёлка (0.9, пункт 24 владельца): подарки под ёлкой (3 в день, внутри баллы или игрушка), ёлочные игрушки —
// купить в «Ёлочном базаре» (0.10), повесить на ёлку, снять; кот от скуки сбивает игрушки на пол. Звезда на ёлке — st-home.js (lightsOff).
import { TOYS, GIFTS, TOY_SETS, BAZAAR } from './data.js';
import { TREE_SLOTS } from './layout.js';
import { createRng } from '../game/rng.js';
import { Scrubber } from './mechanics.js';
import { pts } from './words.js';

export const TOY_IDS = Object.keys(TOYS);

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
  _initTree(toys = [], giftsOpened = [], setsDone = []) {
    this.setsDone = new Set(setsDone.filter((id) => TOY_SETS[id])); // наборы, за которые награда уже получена
    // uid — номер игрушки в сохранении (с 1); slot — место на ёлке (TREE_SLOTS) или null — в коробке
    this.toys = toys.filter((t) => TOYS[t?.id]).map((t, i) => ({ uid: i + 1, id: t.id, slot: Number.isInteger(t.slot) && TREE_SLOTS[t.slot] ? t.slot : null, fallen: false }));
    this.treeHand = null; // uid игрушки в руке
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
    const uid = this.toys.length + 1;
    this.toys.push({ uid, id, slot: null, fallen: false });
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
    const onTree = new Set(this.toys.filter((t) => t.slot != null).map((t) => t.id));
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

  /** Купить ёлочную игрушку за баллы (телефон → «Ёлочный базар»). Товар дня — со скидкой. */
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
    this._emit('toyBought', { id, uid, price });
    this.setHint(`${t.name} — в коробке у ёлки. Повесь её!`, 3);
    return true;
  },

  /** Игрушки в коробке (не на ёлке и не на полу). */
  toysInBox() {
    return this.toys.filter((t) => t.slot == null && !t.fallen);
  },

  _toysOnTree() {
    return this.toys.filter((t) => t.slot != null).length;
  },

  /** Взять игрушку из коробки в руку (повторно — положить обратно). */
  pickToy(uid) {
    if (!this._isIdleAt('tree') || this.gift) return false;
    const t = this.toys.find((x) => x.uid === uid);
    if (!t || t.slot != null || t.fallen) return false;
    this.treeHand = this.treeHand === uid ? null : uid;
    this._emit('pick', { product: 'toy' });
    return true;
  },

  /**
   * Клик по месту на ёлке: с игрушкой в руке — повесить на свободное место; пустой рукой по игрушке — снять её в руку
   * (перевесить можно следующим кликом).
   */
  treeClick(slot) {
    if (!this._isIdleAt('tree') || this.action || this.gift || !TREE_SLOTS[slot]) return false;
    const there = this.toys.find((t) => t.slot === slot);
    if (this.treeHand != null) {
      if (there) {
        this.setHint('Тут уже висит игрушка — выбери свободную ветку', 1.8);
        return false;
      }
      const t = this.toys.find((x) => x.uid === this.treeHand);
      t.slot = slot;
      this.treeHand = null;
      this._emit('toyHung', { uid: t.uid, id: t.id, slot });
      this._checkSets();
      return true;
    }
    if (!there) return false;
    there.slot = null;
    this.treeHand = there.uid;
    this._emit('toyTaken', { uid: there.uid, id: there.id });
    return true;
  },

  /**
   * Отпустить игрушку из руки после перетаскивания (0.10): над свободной веткой slot — повесить; мимо или на занятую —
   * вернуть на ветку back (откуда сняли), а если её нет или она занята — в коробку. true — повешена на slot.
   */
  dropToy(slot, back = null) {
    if (this.treeHand == null || !this._isIdleAt('tree')) return false;
    const free = (i) => Number.isInteger(i) && TREE_SLOTS[i] && !this.toys.some((t) => t.slot === i);
    if (free(slot)) return this.treeClick(slot);
    if (free(back)) {
      this.treeClick(back);
      return false;
    }
    const t = this.toys.find((x) => x.uid === this.treeHand);
    this.treeHand = null;
    this._emit('toyReturned', { uid: t.uid, id: t.id });
    return false;
  },

  // Кот сбил игрушки (проказа от скуки): до двух висящих — на пол, их нужно поднять.
  _knockToys() {
    const hung = this.toys.filter((t) => t.slot != null);
    const n = Math.min(2, hung.length);
    const knocked = [];
    for (let k = 0; k < n; k++) {
      const i = Math.floor(this.rng.next() * hung.length);
      const t = hung.splice(i, 1)[0];
      t.slot = null;
      t.fallen = true;
      knocked.push(t.uid);
    }
    if (knocked.length) {
      this._alert('toys', 'Игрушки на полу', { station: 'tree', detail: 'Игрушки на полу — подними их у ёлки' });
      this._emit('toysKnocked', { uids: knocked });
    }
    return knocked.length;
  },

  /** Поднять сбитые котом игрушки (они возвращаются в коробку — повесь снова). */
  pickUpToys() {
    if (!this._isIdleAt('tree') || this.action) return false;
    const fallen = this.toys.filter((t) => t.fallen);
    if (!fallen.length) return false;
    return this._startAction('pickToys', this.cfg.durations.pickToys, () => {
      for (const t of fallen) t.fallen = false;
      this._removeAlert('toys');
      this._emit('toysPicked', { n: fallen.length });
      this.setHint('Игрушки в коробке — повесь их обратно', 2.5);
    });
  },

  /** Для сохранения: игрушки по порядку uid. Упавшие сохраняются «в коробке». */
  toysForSave() {
    return this.toys.map((t) => ({ id: t.id, slot: t.slot }));
  },
};
