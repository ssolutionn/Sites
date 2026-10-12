// Телефон: сообщения, список покупок, заказ доставки, получение за кадром.
import { stepProducts, PRODUCTS, CATALOG, BONUS, DECOR } from './data.js';
import { CLAYOUT } from './layout.js';
import { FEED_POSTS, FEED_BY_ID, FEED_AUTHORS, MY_POST, FEED_TUNE, COMMENT_REPLIES, COMMENT_REACTIONS, repliedVerb } from './feed-data.js';
import { CHAT_REPLIES, CHAT_REACTIONS, CROWD_COMMENTS } from './chatter.js';

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
    this._alert('phone', `${from}: ${text.length > 26 ? text.slice(0, 24) + '…' : text}`, { station: 'phone', until: this.t + 8, phone: true, detail: `${from}: ${text}` });
    this._emit('phoneMsg', { from });
    return m;
  },

  /** Собеседники, чьи сообщения придут в ближайшие секунды. */
  typingFrom() {
    const ahead = this.cfg.phone.typingAhead;
    const out = new Set();
    for (const m of this.msgQueue) {
      if (m.sent || m.at < this.t || m.at - this.t > ahead) continue;
      if (m.ifSilent && this.phone.messages.some((x) => x.mine && x.from === m.from)) continue;
      out.add(m.from);
    }
    if (this.chatter?.pool.length && this.chatter.next >= this.t && this.chatter.next - this.t <= ahead) out.add(this.chatter.pool[0].from);
    return out;
  },

  /** Написать в существующий чат; вымышленный собеседник отвечает с задержкой. */
  replyChat(to, text) {
    const t = String(text ?? '').trim().slice(0, this.cfg.phone.maxChatLength);
    if (!t || !this.phone.messages.some((m) => m.from === to && !m.mine)) return false;
    this.phone.messages.push({ id: this._id(), from: to, mine: true, text: t, t: this.t, read: true });
    const list = CHAT_REPLIES[to] ?? [];
    const n = this.phone.messages.filter((m) => m.mine && m.from === to).length;
    const reaction = CHAT_REACTIONS[to]?.find((r) => r.matches.some((word) => t.toLowerCase().includes(word)));
    if (list.length) this.msgQueue.push({ at: this.t + this.cfg.phone.replyDelay, from: to, text: reaction?.text ?? list[Math.min(n, list.length) - 1], sent: false });
    this._emit('chatSent', { to });
    return true;
  },

  /** Написать комментарий к доступному посту или собственному фото; replyTo — ответ конкретному другу из ветки.
   *  Через phone.commentReply секунд автор поста (или тот, кому ответили) отвечает героине. */
  commentPost(key, text, replyTo = null) {
    const t = String(text ?? '').trim().slice(0, this.cfg.phone.maxCommentLength);
    const it = this.feedItems().find((i) => i.key === key);
    if (!t || !it) return false;
    const to = replyTo && replyTo !== 'me' && FEED_AUTHORS[replyTo] && this.postComments(key).some((c) => c.who === replyTo) ? replyTo : null;
    (this.phone.comments[key] ??= []).push({ who: 'me', text: t, t: this.t, to });
    this._queueCommentReply(it, to, t);
    this._emit('commented', { key });
    return true;
  },

  // Кто и что ответит. На пост друга — автор, под своим фото — тот, кому ответила, иначе последний из друзей в ветке.
  // Одновременно в пути — один ответ на пост; задержка и выбор фразы детерминированы (без общего ГСЧ дня).
  _queueCommentReply(it, to, text) {
    if (this.commentQueue.some((q) => q.key === it.key)) return;
    const friends = this.postComments(it.key).filter((c) => c.who !== 'me' && FEED_AUTHORS[c.who]); // зрители стрима (0.11) — не друзья: ответа от них нет
    const who = to ?? (it.mine ? friends.at(-1)?.who ?? 'mom' : it.author);
    const pool = COMMENT_REPLIES[who];
    if (!pool?.length) return;
    const low = text.toLowerCase();
    const r = COMMENT_REACTIONS.find((x) => x.matches.some((w) => low.includes(w)));
    const said = (this.phone.comments[it.key] ?? []).filter((c) => c.who === who && c.to === 'me').map((c) => c.text);
    let reply = r ? r[who] ?? r.text : null;
    if (!reply || said.includes(reply)) reply = pool.find((x) => !said.includes(x)) ?? pool[said.length % pool.length];
    let h = 0;
    for (const ch of it.key + text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const [a, b] = this.cfg.phone.commentReply;
    this.commentQueue.push({ at: this.t + a + (h % 1000) / 1000 * (b - a), key: it.key, who, text: reply });
  },

  _updateCommentReplies() {
    this._updateViewerComments();
    for (const q of this.commentQueue) {
      if (this.t < q.at) continue;
      q.done = true;
      if (!this.feedItems().some((i) => i.key === q.key)) continue;
      (this.phone.comments[q.key] ??= []).push({ who: q.who, text: q.text, t: this.t, to: 'me' });
      this.phone.replyUnread[q.key] = (this.phone.replyUnread[q.key] ?? 0) + 1;
      this.phone.unread++;
      const name = FEED_AUTHORS[q.who].name;
      this._alert('phone', `${name} ${repliedVerb(q.who)} тебе`, { station: 'phone', until: this.t + 8, phone: true, detail: `${name} ${repliedVerb(q.who)} тебе: ${q.text}`, open: `andrey|${q.key}|feed` });
      this._emit('commentReply', { key: q.key, who: q.who });
    }
    if (this.commentQueue.some((q) => q.done)) this.commentQueue = this.commentQueue.filter((q) => !q.done);
  },

  /** Кто сейчас «печатает» ответ под постом key (за typingAhead секунд до ответа), иначе null. */
  commentTyping(key) {
    const q = this.commentQueue.find((x) => x.key === key && x.at - this.t <= this.cfg.phone.typingAhead);
    return q?.who ?? null;
  },

  /** Ветка открыта — ответы в ней прочитаны. */
  markCommentsRead(key) {
    if (!this.phone.replyUnread[key]) return true;
    delete this.phone.replyUnread[key];
    this.phone.unread = this.phone.messages.filter((m) => !m.read).length + this.feedUnread();
    return true;
  },

  /** Сколько новых ответов на комментарии героини ещё не прочитано. */
  repliesUnread() {
    return Object.values(this.phone.replyUnread).reduce((a, b) => a + b, 0);
  },

  /** Последние комментарии: исходные реплики, друзья и все ответы героини. */
  postComments(key) {
    const it = this.feedItems().find((i) => i.key === key);
    if (!it) return [];
    const own = this.phone.comments[key] ?? [];
    const base = it.mine
      ? MY_POST.comments.filter((c) => it.likes >= c.likes && (c.minQ == null || this.dishes[it.dishId].Q >= c.minQ) && (c.maxQ == null || this.dishes[it.dishId].Q <= c.maxQ))
      : FEED_BY_ID[it.id].comments;
    const list = base.map(({ who, text }) => ({ who, text }));
    const want = Math.min(this.cfg.phone.commentPreview, it.talk - own.length);
    let h = 0;
    for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    for (let k = 0; list.length < want && k < CROWD_COMMENTS.length; k++) {
      const [who, text] = CROWD_COMMENTS[(h + k * 3) % CROWD_COMMENTS.length];
      if (!list.some((c) => c.text === text)) list.push({ who, text });
    }
    return [...list, ...own];
  },

  // ---------- банк: бонусы ----------
  _earn(points, why, { banked = false } = {}) {
    const n = Math.round(points);
    if (n <= 0 || this.practice || this.challenge) return 0;
    this.bonus.points += n;
    if (banked) this.bonus.banked += n;
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
    if (this.challenge || this.practice) {
      this.setHint('Декор покупается в кампании', 2.5);
      return false;
    }
    if (this.bonus.points < d.price) {
      this.setHint(`Не хватает очков домохозяйки: нужно ${d.price}, есть ${this.bonus.points}`, 2.5);
      return false;
    }
    if (this.bonus.banked < d.price) {
      this.setHint('Очки за готовку станут доступны для украшений после завершения дня. Очки из подарков — сразу!', 4);
      return false;
    }
    this.bonus.points -= d.price;
    this.bonus.banked -= d.price;
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
    this._viewerReacts(this.phone.posts[0]); // 0.11: зритель стрима оставит заготовленный комментарий (st-stream.js)
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
      this._alert('timer', `Таймер сработал`, { until: this.t + 6, detail: `Таймер на ${Math.round(x.total / 60) || 1} мин сработал` });
      this._emit('timerDone', { id: x.id });
    }
    this.kitchenTimers = this.kitchenTimers.filter((x) => !x.done || this.t < x.end + 8);
  },

  // Прочитаны чаты; непрочитанные посты ленты остаются в счётчике.
  markRead() {
    for (const m of this.phone.messages) m.read = true;
    this.phone.unread = this.feedUnread();
    this._removeAlert('phone');
  },

  // ---------- «Андрей»: лента ----------
  // Посты прошлых дней уже в ленте и прочитаны; посты сегодняшнего дня приходят по часам.
  _initFeed() {
    const day = this.practice ? 0 : this.day?.id ?? 0;
    this.phone.feed = FEED_POSTS.filter((p) => p.day < day).map((p) => ({ id: p.id, read: true }));
    this.phone.liked = {};
    this.feedQueue = FEED_POSTS.filter((p) => p.day === day).sort((a, b) => a.at - b.at);
  },

  _updateFeed() {
    while (this.feedQueue?.length && this.t >= this.feedQueue[0].at) {
      const p = this.feedQueue.shift();
      this.phone.feed.push({ id: p.id, read: false });
      this.phone.unread++;
      this._emit('feedPost', { id: p.id });
    }
  },

  /** Сколько постов ленты ещё не просмотрено, плюс непрочитанные ответы на комментарии героини. */
  feedUnread() {
    return this.phone.feed.filter((f) => !f.read).length + this.repliesUnread();
  },

  /** Лента просмотрена: посты прочитаны, в счётчике остаются сообщения чатов и ответы в ветках. */
  markFeedRead() {
    for (const f of this.phone.feed) f.read = true;
    this.phone.unread = this.phone.messages.filter((m) => !m.read).length + this.repliesUnread();
    return true;
  },

  /** Лайк поста ленты (повторное нажатие снимает). Своё фото лайкнуть нельзя. */
  likePost(id, forceOn = false) {
    if (!this.phone.feed.some((f) => f.id === id)) return false;
    if (forceOn && this.phone.liked[id]) return true;
    const on = !this.phone.liked[id];
    if (on) this.phone.liked[id] = true;
    else delete this.phone.liked[id];
    this._emit('feedLike', { id, on });
    return true;
  },

  // Лайки поста друзей: свежий пост добирает их ступеньками, прошлые дни — полностью; +1 за свой лайк.
  feedLikes(p) {
    let k = 1;
    if (p.day === (this.day?.id ?? 0)) {
      const age = Math.floor(Math.max(0, this.t - p.at) / FEED_TUNE.growStep) * FEED_TUNE.growStep;
      k = Math.min(1, FEED_TUNE.growFrom + ((1 - FEED_TUNE.growFrom) * age) / FEED_TUNE.growTime);
    }
    return Math.round(p.likes * k) + (this.phone.liked[p.id] ? 1 : 0);
  },

  /** Лента для показа: посты друзей и фото героини, новые сверху.
   *  Элемент: { key, id, mine, author, text, art, alt, poll, dishId, day, at, likes, liked, comments, talk, unread }. */
  feedItems() {
    const day = this.day?.id ?? 0;
    const npc = this.phone.feed.map((f) => {
      const p = FEED_BY_ID[f.id];
      return { key: p.id, id: p.id, mine: false, author: p.author, text: p.text, art: p.art, alt: p.alt, poll: p.poll, dishId: null, day: p.day, at: p.at, likes: this.feedLikes(p), liked: !!this.phone.liked[p.id], comments: p.comments.slice(0, FEED_TUNE.preview), talk: p.talk + (this.phone.comments[p.id]?.length ?? 0), unread: !f.read };
    });
    const mine = this.phone.posts.map((p) => {
      const likes = this.postLikes(p);
      const Q = p.Q ?? 0;
      const com = MY_POST.comments.filter((c) => likes >= c.likes && (c.minQ == null || Q >= c.minQ) && (c.maxQ == null || Q <= c.maxQ));
      const name = this.dishes[p.dishId]?.recipe.name ?? '';
      return { key: `me-${p.id}`, id: p.id, mine: true, author: 'me', text: MY_POST.text.replace('{dish}', name), art: null, alt: name, poll: null, dishId: p.dishId, day, at: p.t, likes, liked: false, comments: com.slice(-FEED_TUNE.preview), talk: com.length + (this.phone.comments[`me-${p.id}`]?.length ?? 0), unread: false };
    });
    return [...mine, ...npc].sort((a, b) => b.day - a.day || b.at - a.at);
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
      const earnedToday = this.bonus.points - this.bonus.banked;
      this.bonus.banked -= Math.max(0, paidPoints - earnedToday);
      this.bonus.points -= paidPoints;
      this.bonus.history.unshift({ t: this.t, n: -paidPoints, why: 'Оплата заказа очками домохозяйки' });
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
      else this._alert('delivery', 'Сходи за заказом', { action: 'collect', dismissable: false, detail: 'Сходить в магазин — путь к двери' });
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
    if (next === 'onTheWay') this.pushMessage('Доставка', `${this.courierName()} в пути.`);
    if (next === 'arrived') {
      this.pushMessage('Доставка', `${this.courierName()} приехал. Можно забрать заказ.`);
      this._alert('delivery', `${this.courierName()} у двери`, { action: 'collect', dismissable: false, detail: 'Курьер приехал — забери заказ' });
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
    const risky = this.alerts.some((a) => /^pot\d*$/.test(a.key) || a.key === 'oven');
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
