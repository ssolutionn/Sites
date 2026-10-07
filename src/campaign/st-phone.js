// Телефон: сообщения, список покупок, заказ доставки, получение за кадром.
import { stepProducts, PRODUCTS, CATALOG } from './data.js';
import { CLAYOUT } from './layout.js';

const rand = (rng, [a, b]) => a + (b - a) * rng.next();

export const phoneMethods = {
  pushMessage(from, text, extra = {}) {
    const m = { id: this._id(), from, text, t: this.t, read: false, ...extra };
    this.phone.messages.push(m);
    this.phone.unread++;
    if (extra.request) this.requestKnown = true;
    this._alert('phone', `${from}: ${text.length > 42 ? text.slice(0, 40) + '…' : text}`, { station: 'phone', until: this.t + 12, phone: true });
    this._emit('phoneMsg', { from });
    return m;
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
  confirmOrder() {
    if (this.delivery.order || this.delivery.bag) {
      this.setHint('Предыдущий заказ ещё не разобран', 2);
      return false;
    }
    const items = { ...this.delivery.draft };
    if (!Object.keys(items).length) {
      this.setHint('Добавь в заказ хотя бы один продукт', 2);
      return false;
    }
    const wait = rand(this.rng, this.cfg.events.deliveryWait);
    this.delivery.order = { id: this._id(), items, t0: this.t, wait, status: 'accepted' };
    this.delivery.draft = {};
    this.pushMessage('Доставка', 'Заказ принят. Собираем пакет.');
    this._emit('orderPlaced', { items });
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
