// Учёт продуктов в игровых порциях. Резерв привязан к ID операции:
// повторная команда с тем же ID не резервирует и не списывает второй раз.

export class Inventory {
  constructor(stock = {}) {
    this.stock = { ...stock };
    this.reservations = new Map(); // opId -> { productId: qty }
    this.consumed = new Set(); // завершённые операции
  }

  count(id) {
    return this.stock[id] ?? 0;
  }

  reservedOf(id) {
    let r = 0;
    for (const items of this.reservations.values()) r += items[id] ?? 0;
    return r;
  }

  available(id) {
    return this.count(id) - this.reservedOf(id);
  }

  // Чего не хватает для набора; пусто — можно резервировать.
  shortage(items, opId = null) {
    const own = opId ? this.reservations.get(opId) ?? {} : {};
    const out = {};
    for (const [id, qty] of Object.entries(items)) {
      const lack = qty - (this.available(id) + (own[id] ?? 0));
      if (lack > 0) out[id] = lack;
    }
    return out;
  }

  reserve(opId, items) {
    if (this.consumed.has(opId)) return true;
    if (this.reservations.has(opId)) return true;
    if (Object.keys(this.shortage(items)).length) return false;
    const clean = {};
    for (const [id, qty] of Object.entries(items)) if (qty > 0) clean[id] = qty;
    this.reservations.set(opId, clean);
    return true;
  }

  isReserved(opId) {
    return this.reservations.has(opId);
  }

  // Подтверждённое завершение: списание ровно один раз.
  consume(opId) {
    if (this.consumed.has(opId)) return false;
    const items = this.reservations.get(opId);
    if (!items) return false;
    for (const [id, qty] of Object.entries(items)) this.stock[id] = Math.max(0, this.count(id) - qty);
    this.reservations.delete(opId);
    this.consumed.add(opId);
    return true;
  }

  // Отмена: резерв снимается, продукт остаётся.
  release(opId) {
    return this.reservations.delete(opId);
  }

  // Немедленное списание вне операции (замена украденного, порча). Учитывает резервы.
  take(id, qty = 1) {
    if (this.available(id) < qty) return false;
    this.stock[id] = this.count(id) - qty;
    return true;
  }

  add(id, qty = 1) {
    this.stock[id] = this.count(id) + qty;
  }

  snapshot() {
    return { stock: { ...this.stock }, reserved: Object.fromEntries(this.reservations) };
  }
}
