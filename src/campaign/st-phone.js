// Телефон: сообщения, список покупок, заказ доставки, получение за кадром.
import { stepProducts, PRODUCTS, CATALOG, BONUS, DECOR } from './data.js';
import { CLAYOUT } from './layout.js';

const rand = (rng, [a, b]) => a + (b - a) * rng.next();

export const phoneMethods = {
  pushMessage(from, text, extra = {}) {
    const m = { id: this._id(), from, text, t: this.t, read: false, ...extra };
    this.phone.messages.push(m);
    this.phone.unread++;
    if (extra.request) {
      this.requestKnown = true;
      for (const r of this.requests ?? []) if (extra.request === true ? r.fixed : r.id === extra.request) r.known = true;
    }
    this._alert('phone', `${from}: ${text.length > 42 ? text.slice(0, 40) + '…' : text}`, { station: 'phone', until: this.t + 12, phone: true });
    this._emit('phoneMsg', { from });
    return m;
  },

  // ---------- банк: бонусы ----------
  _earn(points, why) {
    const n = Math.round(points);
    if (n <= 0 || this.practice) return 0;
    this.bonus.points += n;
    this.bonus.history.unshift({ t: this.t, n, why });
    this._emit('bonus', { n, why });
    return n;
  },

  setUsePoints(on) {
    this.delivery.usePoints = !!on;
    return true;
  },

  // Сколько баллов уйдёт в оплату заказа на сумму total.
  pointsFor(total) {
    return this.delivery.usePoints ? Math.min(this.bonus.points, Math.floor(total * BONUS.payShare)) : 0;
  },

  buyDecor(id) {
    const d = DECOR[id];
    if (!d || this.decor.includes(id)) return false;
    if (this.bonus.points < d.price) {
      this.setHint(`Не хватает баллов: нужно ${d.price}, есть ${this.bonus.points}`, 2.5);
      return false;
    }
    this.bonus.points -= d.price;
    this.bonus.history.unshift({ t: this.t, n: -d.price, why: d.name });
    this.decor.push(id);
    this._emit('decorBought', { id });
    return true;
  },

  // ---------- «Андрей»: фото готового блюда ----------
  postPhoto(dishId) {
    const d = this.dishes[dishId];
    if (!d?.done || this.phone.posts.some((p) => p.dishId === dishId)) return false;
    this.phone.posts.unshift({ id: this._id(), dishId, t: this.t, Q: d.Q });
    this._earn(BONUS.perPhoto, `Фото: ${d.recipe.name}`);
    this._emit('posted', { dishId });
    return true;
  },

  // Лайки растут первую минуту после публикации — чем вкуснее, тем больше.
  postLikes(p) {
    const k = Math.min(1, (this.t - p.t) / 60);
    return Math.round(k * (12 + (p.Q ?? 70) * 0.9));
  },

  // ---------- таймеры кухни ----------
  setKitchenTimer(seconds) {
    const sec = Math.max(10, Math.min(600, Math.round(seconds)));
    this.kitchenTimers.push({ id: this._id(), end: this.t + sec, total: sec });
    this._emit('timerSet', { sec });
    return true;
  },

  cancelKitchenTimer(id) {
    this.kitchenTimers = this.kitchenTimers.filter((x) => x.id !== id);
    return true;
  },

  _updateKitchenTimers() {
    for (const x of this.kitchenTimers) {
      if (x.done || this.t < x.end) continue;
      x.done = true;
      this._alert('timer', `Таймер на ${Math.round(x.total / 60) || 1} мин сработал`, { until: this.t + 8 });
      this._emit('timerDone', { id: x.id });
    }
    this.kitchenTimers = this.kitchenTimers.filter((x) => !x.done || this.t < x.end + 8);
  },

  markRead() {
    for (const m of this.phone.messages) m.read = true;
    this.phone.unread = 0;
    this._removeAlert('phone');
  },

  // Что ещё понадобится для незавершённых шагов дня, с учётом уже зарезервированного.
  shopping() {
    const need = {};
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      for (const s of dish.recipe.steps) {
        if (this.stepDone(dishId, s.id)) continue;
        if (this.inventory.isReserved(this._opId(dishId, s.id))) continue;
        for (const [id, q] of Object.entries(stepProducts(dishId, s, dish.variant))) need[id] = (need[id] ?? 0) + q;
      }
      if (dishId === 'shuba' && dish.work) {
        const mayoDone = dish.work.layers.filter((l) => l.comp === 'mayo').length;
        need.mayo = Math.max(0, (need.mayo ?? 0) - mayoDone);
      }
    }
    return Object.entries(need).map(([id, q]) => ({ id, name: PRODUCTS[id].name, need: q, have: Math.max(0, this.inventory.available(id)), lack: Math.max(0, q - this.inventory.available(id)) }));
  },

  catalog() {
    return CATALOG.map((id) => ({ id, name: PRODUCTS[id].name, unit: PRODUCTS[id].unit, have: this.inventory.available(id) }));
  },

  draftSet(id, qty) {
    if (this.delivery.order) return false;
    if (!PRODUCTS[id]) return false;
    const q = Math.max(0, Math.min(6, Math.round(qty)));
    if (q === 0) delete this.delivery.draft[id];
    else this.delivery.draft[id] = q;
    return true;
  },

  // Подтверждение: один активный заказ; повторный клик не создаёт второй.
  // mode: express — быстро и дорого, standard — обычная, self — сходить самой (бесплатно, но долго без присмотра).
  confirmOrder(mode = 'standard') {
    if (this.delivery.order || this.delivery.bag) {
      this.setHint('Предыдущий заказ ещё не разобран', 2);
      return false;
    }
    const items = { ...this.delivery.draft };
    if (!Object.keys(items).length) {
      this.setHint('Добавь в заказ хотя бы один продукт', 2);
      return false;
    }
    const m = this.deliveryModes().find((x) => x.id === mode);
    if (!m) {
      this.setHint('Такой доставки сегодня нет', 2);
      return false;
    }
    const cost = this.orderCost(items, mode);
    const toPay = cost.total - this.pointsFor(cost.total);
    if (!this.practice && toPay > this.wallet.budget - this.wallet.spent) {
      this.setHint(`Не хватает денег: нужно ${toPay} ₽, осталось ${this.wallet.budget - this.wallet.spent} ₽`, 3);
      this._emit('noMoney');
      return false;
    }
    const paidPoints = this.pointsFor(cost.total);
    if (paidPoints) {
      this.bonus.points -= paidPoints;
      this.bonus.history.unshift({ t: this.t, n: -paidPoints, why: 'Оплата заказа баллами' });
    }
    this.wallet.spent += cost.total - paidPoints;
    this._earn((cost.total - paidPoints) * BONUS.cashback, 'Кешбэк за заказ');
    this._emit('paid', { total: cost.total });
    if (mode === 'self') {
      this.delivery.order = { id: this._id(), items, t0: this.t, wait: 0, status: 'arrived', self: true, mode };
      this.delivery.draft = {};
      this._emit('orderPlaced', { items, mode });
      const ok = this.collectOrder(true);
      if (ok === true) this.setHint(`Бегу в магазин — ${m.away} с. Плита и духовка без присмотра!`, 4);
      else this._alert('delivery', 'Сходить в магазин — путь к двери', { action: 'collect', dismissable: false });
      return true;
    }
    const wait = rand(this.rng, m.wait ?? this.cfg.events.deliveryWait);
    this.delivery.order = { id: this._id(), items, t0: this.t, wait, status: 'accepted', mode };
    this.delivery.draft = {};
    this.pushMessage('Доставка', `Заказ принят (${m.label.toLowerCase()}). Собираем пакет.`);
    this._emit('orderPlaced', { items, mode });
    return true;
  },

  _updateDelivery() {
    const o = this.delivery.order;
    if (!o || o.status === 'arrived' || o.status === 'collecting') return;
    const k = (this.t - o.t0) / o.wait;
    const next = k >= 1 ? 'arrived' : k >= 0.55 ? 'onTheWay' : k >= 0.2 ? 'assembling' : 'accepted';
    if (next === o.status) return;
    o.status = next;
    this._emit('orderStatus', { status: next });
    if (next === 'onTheWay') this.pushMessage('Доставка', 'Курьер в пути.');
    if (next === 'arrived') {
      this.pushMessage('Доставка', 'Курьер приехал. Можно забрать заказ.');
      this._alert('delivery', 'Курьер приехал — забери заказ', { action: 'collect', dismissable: false });
    }
  },

  // Ускорить ожидание, если других дел нет: последовательная симуляция до прибытия.
  waitDelivery() {
    const o = this.delivery.order;
    if (!o || o.status === 'arrived' || o.status === 'collecting') return false;
    if (this.urgentCount() > 0) {
      this.setHint('Сначала разберись со срочным делом', 2);
      return false;
    }
    this._emit('fastForward');
    this.fastForward(o.wait + 1, () => this.delivery.order?.status === 'arrived' || this.urgentCount() > 0);
    return true;
  },

  // Забрать заказ: героиня уходит за кадр, возвращается с пакетом.
  collectOrder(force = false) {
    const o = this.delivery.order;
    if (!o || o.status !== 'arrived') {
      this.setHint('Курьер ещё не приехал', 2);
      return false;
    }
    const risky = this.alerts.some((a) => a.key === 'pot' || a.key === 'oven');
    if (risky && !force) {
      this._emit('collectWarn');
      return 'warn';
    }
    if (!this._canMove()) return false;
    if (o.self) this.heroine.target = null;
    const path = this.nav.findPath(this.heroine, CLAYOUT.exit);
    if (!path) {
      this.setHint('К двери не пройти — мешает лужа', 2.5);
      return false;
    }
    this._leaveStation();
    o.status = 'collecting';
    this._removeAlert('delivery');
    this.heroine.path = path;
    this.heroine.target = { exit: true };
    this._emit('walk', { exit: true });
    return true;
  },

  _deliveryReturned() {
    const o = this.delivery.order;
    if (!o) return;
    this.heroine.x = CLAYOUT.exit.x;
    this.heroine.z = CLAYOUT.exit.z;
    this.delivery.bag = { items: Object.entries(o.items).map(([id, qty]) => ({ id, qty, placed: false })) };
    this.delivery.order = null;
    this._alert('bag', 'Пакет на столешнице — разбери покупки', { station: 'bag', dismissable: false });
    this._emit('bagArrived');
    this.goTo('bag');
  },
};
