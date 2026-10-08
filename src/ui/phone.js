// Телефон героини: цельный смартфон с новогодним домашним экраном и пятью приложениями.
// Только отображение и команды через act(...): состояние живёт в KitchenSession.
import { PRODUCTS, RECIPES, DAYS, DECOR, BONUS, STORE_EXTRAS, DISH_ORDER } from '../campaign/data.js';
import { LESSONS } from '../campaign/lessons.js';
import { NEUTRAL, LOGO_URL } from '../view/textures.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (sec) => {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const PICON = { potato: '🥔', carrot: '🥕', sausage: '🌭', cucumber: '🥒', egg: '🥚', peas: '🫛', mayo: '🫙', crab: '🦀', corn: '🌽', bread: '🍞', butter: '🧈', caviar: '🔴', tartlet: '🧁', cheese: '🧀', greens: '🌿', tomato: '🍅', onion: '🧅', herring: '🐟', beet: '🟣', skewer: '🍡', mandarin: '🍊', apple: '🍏', grapes: '🍇', chicken: '🍗', marinade: '🥣' };
const DICON = { olivier: '🥗', crab: '🦀', sandwiches: '🥪', eggs: '🥚', tartlets: '🧁', tomatoes: '🍅', shuba: '🐟', canape: '🍢', fruit: '🍊', chicken: '🍗' };
const SHOP = NEUTRAL ? 'Доставка продуктов' : 'Пятёрочка Доставка';

export const APPS = [
  { id: 'shop', name: NEUTRAL ? 'Доставка' : 'Пятёрочка', icon: NEUTRAL ? '🛒' : `<img src="${LOGO_URL}" alt="" />`, cls: 'app-shop' },
  { id: 'andrey', name: 'Андрей', icon: '<b>А</b>', cls: 'app-andrey' },
  { id: 'bank', name: 'Банк', icon: '<b>₽</b>', cls: 'app-bank' },
  { id: 'book', name: 'Кулинарная книга', icon: '📖', cls: 'app-book' },
  { id: 'timers', name: 'Таймеры', icon: '⏲', cls: 'app-timers' },
];

// Время на часах телефона: игровая секунда — минута, день начинается в 14:00.
function phoneClock(t) {
  const m = 14 * 60 + Math.floor(t);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const btn = (label, act, args = [], cls = '', disabled = false, title = '') => `<button class="${cls}" data-act="${act}" data-args='${esc(JSON.stringify(args))}' ${disabled ? 'disabled' : ''} title="${esc(title)}">${label}</button>`;

export class PhoneUI {
  constructor({ root, act, sound }) {
    this.root = root;
    this.act = act;
    this.sound = sound;
    this.app = 'home';
    this.sub = null; // открытый чат или рецепт
    this.tab = null;
    this.sig = null;
    this.bindInputs();
    root.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        this.sound?.unlock();
        this.sound?.play('click');
        const [app, sub, tab] = nav.dataset.nav.split('|');
        this.app = app;
        this.sub = sub || null;
        if (tab !== undefined) this.tab = tab || null;
        if (app !== this.lastApp) this.tab = tab || null;
        this.lastApp = app;
        this.sig = null;
        this.anim = true;
        return;
      }
      const card = e.target.closest('[data-card]');
      if (card) {
        saveRecipeCard(card.dataset.card);
        return;
      }
      const b = e.target.closest('button[data-act]');
      if (b) {
        this.sound?.unlock();
        const args = b.dataset.args ? JSON.parse(b.dataset.args) : [];
        this.act(b.dataset.act, ...args);
        this.sig = null;
      }
    });
  }

  // Флажки (оплата баллами) — по изменению, а не по клику.
  bindInputs() {
    this.root.addEventListener('change', (e) => {
      const inp = e.target.closest('input[data-act]');
      if (!inp) return;
      this.act(inp.dataset.act, inp.checked);
      this.sig = null;
    });
  }

  open(app = 'home') {
    const [a, sub] = app.split('|');
    this.app = a;
    this.sub = sub || null;
    this.lastApp = a;
    this.sig = null;
    this.anim = true;
    this.root.classList.remove('hidden');
  }

  render(s) {
    if (this.app === 'andrey' && s.phone.unread) this.act('markRead');
    const o = s.delivery.order;
    const sig = [this.app, this.sub, this.tab, s.phone.messages.length, JSON.stringify(s.delivery.draft), s.delivery.usePoints, o?.status, !!s.delivery.bag, s.wallet.spent, s.bonus.points, s.decor.join(), s.phone.posts.map((p) => p.dishId + s.postLikes(p)).join(), Object.values(s.dishes).map((d) => +d.done).join(''), this.app === 'timers' || this.app === 'home' ? Math.floor(s.t) : '', s.kitchenTimers.length].join('§');
    if (sig === this.sig) return;
    this.sig = sig;
    const screen = this.app === 'home' ? this._home(s) : `<div class="app-screen ${this.anim ? 'enter' : ''}">${this._app(s)}</div>`;
    this.anim = false;
    const push = s.alerts.filter((a) => a.urgent).slice(0, 1).map((a) => `<div class="ph-push">⚠️ ${esc(a.text)}</div>`).join('');
    this.root.innerHTML = `<div class="device ${this.app === 'home' ? '' : 'light'}">
      <div class="island"></div>
      <div class="ph-status"><b>${phoneClock(s.t)}</b><span>📶 5G 🔋 82%</span></div>
      ${push}
      <div class="ph-screen ${this.app === 'home' ? 'home' : ''}">${screen}</div>
      <div class="ph-home" data-nav="home" title="Домой"></div>
      ${btn('✕', 'closePanel', [], 'ph-close', false, 'Убрать телефон (Esc)')}
    </div>`;
  }

  // ---------- домашний экран ----------
  _home(s) {
    const unread = s.phone.messages.filter((m) => !m.seen).length;
    const badges = {
      andrey: s.phone.unread || 0,
      shop: s.delivery.order ? '🛵' : s.shopping().some((x) => x.lack) ? '!' : 0,
      timers: s.burners.filter((b) => b.state === 'ready').length + s.kitchenTimers.filter((x) => s.t >= x.end).length,
    };
    const day = s.day?.id ?? 1;
    const date = `${24 + day} декабря`;
    const flakes = Array.from({ length: 22 }, (_, i) => `<i style="left:${(i * 41) % 100}%;top:${(i * 23) % 100}%;opacity:${0.25 + (i % 4) * 0.15}"></i>`).join('');
    void unread;
    return `<div class="wall">${flakes}<div class="garland">${Array.from({ length: 9 }, (_, i) => `<span style="--c:${['#ff5a5a', '#ffd166', '#6ee7a8', '#7ab8ff'][i % 4]}"></span>`).join('')}</div></div>
      <div class="widget"><div class="w-time">${phoneClock(s.t)}</div><div class="w-date">${date} · до Нового года ${Math.max(1, 31 - (24 + day) + 1)} дн.</div></div>
      <div class="apps">${APPS.map((a) => `<button class="app ${a.cls}" data-nav="${a.id}"><span class="ico">${a.icon}${badges[a.id] ? `<em>${badges[a.id]}</em>` : ''}</span><span class="nm">${esc(a.name)}</span></button>`).join('')}</div>
      <div class="hint-home">💰 ${s.wallet.budget - s.wallet.spent} ₽ · ⭐ ${s.bonus.points} баллов</div>`;
  }

  _head(title, sub = '', back = 'home') {
    return `<div class="app-head"><button class="back" data-nav="${back}">‹</button><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;
  }

  _app(s) {
    switch (this.app) {
      case 'shop':
        return this._shop(s);
      case 'andrey':
        return this._andrey(s);
      case 'bank':
        return this._bank(s);
      case 'book':
        return this._book(s);
      case 'timers':
        return this._timers(s);
      default:
        return '';
    }
  }

  // ---------- доставка ----------
  _shop(s) {
    const o = s.delivery.order;
    const head = this._head(esc(SHOP), 'привезём к празднику');
    if (o || s.delivery.bag) {
      const st = o ? { accepted: 'Заказ принят', assembling: 'Собираем', onTheWay: 'Курьер в пути', arrived: 'Курьер у двери', collecting: 'Забираем' }[o.status] : 'Получен — разбери пакет';
      const steps = ['accepted', 'assembling', 'onTheWay', 'arrived'];
      const idx = o ? steps.indexOf(o.status === 'collecting' ? 'arrived' : o.status) : 4;
      const items = Object.entries(o?.items ?? Object.fromEntries((s.delivery.bag?.items ?? []).map((i) => [i.id, i.qty])))
        .map(([id, q]) => `<li>${PICON[id] ?? ''} ${esc(PRODUCTS[id].name)} <b>× ${q}</b></li>`)
        .join('');
      return `${head}<div class="app-body"><div class="track"><div class="t-big">${o?.status === 'onTheWay' ? '🛵' : o?.status === 'arrived' ? '🚪' : '🛍'}</div><b>${st}</b>
        <div class="steps-line">${steps.map((x, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div></div>
        <ul class="order-items">${items}</ul>
        ${o && o.status === 'arrived' ? btn('🚪 Забрать заказ', 'collectOrder', [], 'primary wide') : ''}
        ${o && ['accepted', 'assembling', 'onTheWay'].includes(o.status) ? btn('⏩ Подождать', 'waitDelivery', [], 'wide') : ''}
        <p class="fine">Один заказ за раз. Позиции подтверждённого заказа не меняются.</p></div>`;
    }
    const m = s.money();
    const lack = Object.fromEntries(s.shopping().filter((x) => x.lack).map((x) => [x.id, x.lack]));
    const need = Object.entries(lack);
    const total = Object.entries(s.delivery.draft).reduce((a, [id, q]) => a + (PRODUCTS[id].price ?? 0) * q, 0);
    const cat = s.catalog();
    const card = (c) => {
      const q = s.delivery.draft[c.id] ?? 0;
      const price = PRODUCTS[c.id].price ?? 0;
      const tooMuch = price > m.left + s.bonus.points && !q;
      return `<div class="pcard ${lack[c.id] ? 'need' : ''} ${tooMuch ? 'na' : ''}"><div class="pi">${PICON[c.id] ?? '🛒'}</div><div class="pn">${esc(c.name)}</div><div class="pp">${price} ₽</div>
        <div class="pq">${btn('−', 'draftSet', [c.id, q - 1], 'mini', q <= 0)}<span>${q}</span>${btn('+', 'draftSet', [c.id, q + 1], 'mini', q >= 6 || tooMuch)}</div>${lack[c.id] ? '<i class="tag">нужно</i>' : ''}</div>`;
    };
    const extras = STORE_EXTRAS.map((x) => `<div class="pcard na"><div class="pi">${x.icon}</div><div class="pn">${esc(x.name)}</div><div class="pp">${x.price} ₽</div><div class="pq"><span class="muted">не по карману</span></div></div>`).join('');
    const pts = s.pointsFor(total);
    const modes = s.deliveryModes()
      .map((md) => {
        const c = s.orderCost(s.delivery.draft, md.id);
        const pay = c.total - s.pointsFor(c.total);
        const when = md.id === 'self' ? `уйду на ${md.away} с` : `${md.wait[0]}–${md.wait[1]} с`;
        const can = total && pay <= m.left;
        return btn(`<span>${md.id === 'express' ? '⚡' : md.id === 'self' ? '🏃‍♀️' : '🛵'} ${esc(md.label)}</span><small>${when} · ${pay} ₽</small>`, 'confirmOrder', [md.id], `mode ${can ? (md.id === 'standard' ? 'primary' : '') : 'soft-disabled'}`, false, can ? '' : total ? 'Не хватает денег' : 'Корзина пуста');
      })
      .join('');
    return `${head}<div class="app-body shop">
      <div class="wallet-row"><span>💰 <b>${m.left} ₽</b> на сегодня</span><span>⭐ ${s.bonus.points}</span></div>
      ${need.length ? `<div class="need-box"><b>Не хватает для рецептов</b>${need.map(([id, q]) => `<div>${PICON[id] ?? ''} ${esc(PRODUCTS[id].name)} — ${q} шт. ${btn('В корзину', 'draftSet', [id, Math.max(q, s.delivery.draft[id] ?? 0)], 'mini primary')}</div>`).join('')}</div>` : '<div class="ok-box">✓ Всё для сегодняшних рецептов есть</div>'}
      <h4>Продукты</h4><div class="pgrid">${cat.map(card).join('')}</div>
      <h4>К празднику</h4><div class="pgrid">${extras}</div>
      </div>
      <div class="cart"><div class="cart-sum"><b>Корзина: ${total} ₽</b>${s.bonus.points ? `<label class="pts"><input type="checkbox" data-act="setUsePoints" ${s.delivery.usePoints ? 'checked' : ''} /> баллами ${pts ? `−${pts}` : `до ${Math.round(BONUS.payShare * 100)} %`}</label>` : ''}</div><div class="modes">${modes}</div></div>`;
  }

  // ---------- Андрей: мессенджер и фото ----------
  _andrey(s) {
    const tab = this.tab === 'feed' ? 'feed' : 'chats';
    const seg = `<div class="seg"><button data-nav="andrey||chats" class="${tab === 'chats' ? 'on' : ''}">Чаты</button><button data-nav="andrey||feed" class="${tab === 'feed' ? 'on' : ''}">Лента</button></div>`;
    const head = this._head('Андрей', 'ловит даже на кухне');
    if (tab === 'chats' && this.sub) {
      const msgs = s.phone.messages.filter((m) => m.from === this.sub);
      return `${this._head(esc(this.sub), 'в сети', 'andrey||chats')}<div class="app-body chat">${msgs.map((m) => `<div class="bubble">${esc(m.text)}${m.photo ? '<div class="photo-card"><div class="sun"></div><div class="palm">🌴</div><div class="cap">Вид с балкона</div></div>' : ''}<small>${phoneClock(m.t)}</small></div>`).join('')}<div class="typing">${esc(this.sub)} печатает…</div></div>`;
    }
    if (tab === 'chats') {
      const by = {};
      for (const m of s.phone.messages) by[m.from] = m;
      const ava = { Верка: '🌴', Гости: '🎉', Доставка: '🛵' };
      const rows = Object.values(by)
        .reverse()
        .map((m) => `<button class="chat-row" data-nav="andrey|${esc(m.from)}|chats"><span class="ava">${ava[m.from] ?? '🙂'}</span><span class="cr"><b>${esc(m.from)}</b><small>${esc(m.text)}</small></span><span class="ct">${phoneClock(m.t)}</span></button>`)
        .join('');
      return `${head}${seg}<div class="app-body">${rows || '<div class="empty">Пока тихо. Сообщения придут сюда.</div>'}</div>`;
    }
    const done = Object.values(s.dishes).filter((d) => d.done && !s.phone.posts.some((p) => p.dishId === d.id));
    const mine = s.phone.posts
      .map((p) => {
        const d = s.dishes[p.dishId];
        const likes = s.postLikes(p);
        const com = likes > 40 ? ['Верка: Вау, как в ресторане! 😍', 'Мама: Умница, дочка!'] : likes > 10 ? ['Верка: Выглядит вкусно!'] : [];
        return `<div class="post"><div class="post-h"><span class="ava">🙋‍♀️</span><b>Я</b><small>${phoneClock(p.t)}</small></div><div class="post-img dish">${DICON[p.dishId] ?? '🍽'}<span>${esc(d.recipe.name)}</span></div><div class="post-f">❤️ ${likes} · 💬 ${com.length}</div>${com.map((c) => `<div class="com">${esc(c)}</div>`).join('')}</div>`;
      })
      .join('');
    const verka = s.phone.messages.some((m) => m.photo) ? `<div class="post"><div class="post-h"><span class="ava">🌴</span><b>Верка</b><small>у моря</small></div><div class="post-img sea"><div class="sun"></div>🌴</div><div class="post-f">❤️ 128 · «Скучаем по снегу!»</div></div>` : '';
    return `${head}${seg}<div class="app-body feed">
      ${done.length ? `<div class="snap">${done.map((d) => btn(`📷 Сфотографировать: ${esc(d.recipe.short)}`, 'postPhoto', [d.id], 'primary wide')).join('')}<small>+${BONUS.perPhoto} баллов за фото</small></div>` : '<div class="fine">Приготовь блюдо — и сфотографируй его для друзей.</div>'}
      ${mine}${verka}</div>`;
  }

  // ---------- Банк: бонусы ----------
  _bank(s) {
    const hist = s.bonus.history.slice(0, 8).map((h) => `<div class="h-row"><span>${esc(h.why)}</span><b class="${h.n < 0 ? 'neg' : ''}">${h.n > 0 ? '+' : ''}${h.n}</b></div>`).join('');
    const decor = Object.entries(DECOR)
      .map(([id, d]) => {
        const own = s.decor.includes(id);
        return `<div class="decor ${own ? 'own' : ''}"><span class="di">${d.icon}</span><span class="dn"><b>${esc(d.name)}</b><small>${esc(d.note)}</small></span>${own ? '<span class="owned">на кухне ✓</span>' : btn(`⭐ ${d.price}`, 'buyDecor', [id], s.bonus.points >= d.price ? 'primary mini' : 'mini soft-disabled')}</div>`;
      })
      .join('');
    return `${this._head('Банк', 'бонусная программа')}<div class="app-body bank">
      <div class="bcard"><small>${NEUTRAL ? 'Бонусная карта' : 'Карта «Выручай-карта»'}</small><div class="bp">${s.bonus.points}<span>баллов</span></div><div class="bn">•••• 2025</div></div>
      <div class="earn"><span>🛒 ${Math.round(BONUS.cashback * 100)} % с заказов</span><span>🍽 за каждое блюдо</span><span>📷 за фото</span></div>
      <h4>Декор кухни за баллы</h4>${decor}
      <h4>История</h4>${hist || '<div class="fine">Баллы появятся после первого заказа или готового блюда.</div>'}
      <p class="fine">Баллами можно оплатить до половины заказа в доставке. Игровые баллы, без реальных денег.</p></div>`;
  }

  // ---------- Кулинарная книга ----------
  _book(s) {
    if (this.sub && LESSONS[this.sub]) return this._lesson(s, this.sub);
    const today = new Set(Object.keys(s.dishes));
    const dayOf = (id) => DAYS.findIndex((d) => d.dishes.includes(id));
    const cur = s.dayIndex ?? 0;
    const rows = DISH_ORDER.map((id) => {
      const L = LESSONS[id];
      const di = dayOf(id);
      const open = di <= cur || today.has(id);
      return open
        ? `<button class="book-row ${today.has(id) ? 'today' : ''}" data-nav="book|${id}"><span class="bi">${DICON[id]}</span><span><b>${esc(L?.title ?? RECIPES[id].name)}</b><small>${today.has(id) ? 'готовим сегодня' : esc((L?.intro ?? '').slice(0, 60)) + '…'}</small></span></button>`
        : `<div class="book-row locked"><span class="bi">🔒</span><span><b>${esc(RECIPES[id].name)}</b><small>откроется в день ${di + 1}</small></span></div>`;
    }).join('');
    return `${this._head('Кулинарная книга', 'как готовят на самом деле')}<div class="app-body">${rows}</div>`;
  }

  _lesson(s, id) {
    const L = LESSONS[id];
    const r = RECIPES[id];
    const steps = r.steps
      .map((st, i) => {
        const l = L.steps[st.id];
        const done = s.dishes[id]?.steps[st.id]?.done;
        return `<li class="${done ? 'done' : ''}"><b>${i + 1}. ${esc(st.label)}</b>${l ? `<p>${esc(l.how)}</p><p class="why">Зачем: ${esc(l.why)}</p><p class="err">Ошибка: ${esc(l.mistake)}</p>` : ''}</li>`;
      })
      .join('');
    return `${this._head(esc(L.title), `${L.servings} порции`, 'book')}<div class="app-body lesson">
      <p class="intro">${esc(L.intro)}</p>
      <h4>Продукты</h4><ul class="ingr">${L.ingredients.map((g) => `<li><span>${g.product ? PICON[g.product] ?? '' : '🧂'} ${esc(g.product ? PRODUCTS[g.product]?.name ?? g.name : g.name)}</span><b>${esc(g.amount)}</b></li>`).join('')}</ul>
      <h4>Шаг за шагом</h4><ol class="lsteps">${steps}</ol>
      <h4>Как понять, что получилось</h4><p>${esc(L.check)}</p>
      <h4>А вы знали?</h4>${L.facts.map((f) => `<p class="fact">✨ ${esc(f)}</p>`).join('')}
      <button class="primary wide" data-card="${id}">💾 Сохранить карточку рецепта</button></div>`;
  }

  // ---------- Таймеры ----------
  _timers(s) {
    const ring = (left, total, label, icon, cls = '') => {
      const k = total > 0 ? Math.max(0, Math.min(1, 1 - left / total)) : 1;
      return `<div class="tmr ${cls}"><div class="ring" style="--k:${k}"><span>${icon}</span></div><div><b>${esc(label)}</b><small>${left > 0 ? fmt(left) : 'готово!'}</small></div></div>`;
    };
    const rows = [];
    for (const b of s.burners) {
      if (b.state === 'boiling') rows.push(ring(b.readyAt - s.t, s.boilTime(b.product), `Конфорка ${b.i + 1}: ${PRODUCTS[b.product].name}`, PICON[b.product]));
      else if (b.state === 'ready') rows.push(ring(0, 1, `Конфорка ${b.i + 1}: ${PRODUCTS[b.product].name}`, PICON[b.product], 'done'));
    }
    for (const x of s.hotList()) rows.push(ring(x.left, s.cfg.cool.time, `${PRODUCTS[x.product].name} остывает`, '🔥', 'hot'));
    if (s.oven.state === 'baking') rows.push(ring(s.oven.readyAt - s.t, s.cfg.oven.bake, 'Духовка', '🍗'));
    for (const x of s.kitchenTimers) rows.push(`${ring(x.end - s.t, x.total, `Таймер ${Math.round(x.total / 60)} мин`, '⏲', s.t >= x.end ? 'done' : '')}`);
    return `${this._head('Таймеры кухни', 'всё, что варится и остывает')}<div class="app-body timers">
      ${rows.join('') || '<div class="empty">Сейчас ничего не варится.</div>'}
      <h4>Поставить таймер</h4><div class="trow">${[1, 2, 3, 5].map((m) => btn(`${m} мин`, 'setKitchenTimer', [m * 60], 'mini')).join('')}</div>
      <p class="fine">Минута игры — это минута на часах кухни, на часах телефона — час.</p></div>`;
  }
}

// Карточка рецепта картинкой — для флешмоба: сохранить и выложить.
export function saveRecipeCard(id) {
  const L = LESSONS[id];
  if (!L) return;
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#fff8ec');
  grad.addColorStop(1, '#f6e6c8');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#d23c3c';
  g.fillRect(0, 0, W, 22);
  g.fillStyle = '#1f5c46';
  g.font = '900 84px Nunito, sans-serif';
  g.fillText(`${DICON[id] ?? ''} ${L.title}`, 70, 150);
  g.font = '600 34px Nunito, sans-serif';
  g.fillStyle = '#6e5e50';
  const wrap = (text, x, y, maxW, lh) => {
    let line = '';
    for (const w of String(text).split(' ')) {
      if (g.measureText(line + w).width > maxW) {
        g.fillText(line, x, y);
        y += lh;
        line = '';
      }
      line += w + ' ';
    }
    g.fillText(line, x, y);
    return y + lh;
  };
  let y = wrap(L.intro, 70, 220, W - 140, 44);
  g.fillStyle = '#2b221c';
  g.font = '800 40px Nunito, sans-serif';
  g.fillText('Продукты', 70, y + 30);
  y += 84;
  g.font = '600 34px Nunito, sans-serif';
  for (const it of L.ingredients) {
    g.fillText(`• ${it.product ? PRODUCTS[it.product]?.name ?? it.name : it.name} — ${it.amount}`, 90, y);
    y += 46;
  }
  g.font = '800 40px Nunito, sans-serif';
  g.fillText('Как готовить', 70, y + 30);
  y += 84;
  g.font = '600 31px Nunito, sans-serif';
  RECIPES[id].steps.forEach((st, i) => {
    if (y > H - 170) return;
    y = wrap(`${i + 1}. ${L.steps[st.id]?.how ?? st.label}`, 90, y, W - 170, 40);
  });
  g.fillStyle = '#1f5c46';
  g.fillRect(0, H - 110, W, 110);
  g.fillStyle = '#fff';
  g.font = '800 36px Nunito, sans-serif';
  g.fillText('Симулятор новогодней суеты · #новогодняясуета', 70, H - 45);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `recept-${id}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
