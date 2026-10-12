// 0.11, режим стримера внутри дня: «!помощь» (кот засыпает / курьер быстрее), ники зрителей в игре
// (курьер, комментарий под фото только из заготовок), состояние кухни для canFire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, run } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { VIEWER_REACTIONS, FEED_AUTHORS } from '../src/campaign/feed-data.js';
import { createRng } from '../src/game/rng.js';
import { canFire } from '../src/campaign/stream-rules.js';

const H = CAMPAIGN.stream.help;

// Заказ с доставкой, пока курьер не поедет
function orderOn(s) {
  arrive(s, 'phone');
  s.draftSet('caviar', 1);
  assert.ok(s.confirmOrder());
  for (let i = 0; i < 4000 && s.delivery.order.status !== 'onTheWay'; i++) s.update(0.1);
  assert.equal(s.delivery.order.status, 'onTheWay');
}

test('помощь: если курьер в пути — он едет на 30 % быстрее (оставшееся время делится на 1,3)', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  s.catNeeds.sleepUntil = 1e9; // кот уже спит: остаётся один вариант — курьер
  orderOn(s);
  const o = s.delivery.order;
  const left0 = o.wait - (s.t - o.t0);
  assert.ok(s.streamEvent('help'));
  const left1 = o.wait - (s.t - o.t0);
  assert.ok(Math.abs(left1 - left0 / (1 + H.courierBoost)) < 1e-9, `${left0} → ${left1}`);
  assert.equal(o.boosted, true);
  const ev = s.drain().find((e) => e.type === 'stream' && e.kind === 'help');
  assert.equal(ev.effect, 'courier');
});

test('помощь курьеру не накапливается: второй раз на тот же заказ — уже кот', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  orderOn(s);
  s.catNeeds.sleepUntil = 1e9;
  s.streamEvent('help');
  const wait = s.delivery.order.wait;
  s.catNeeds.sleepUntil = 0;
  s.streamEvent('help');
  assert.equal(s.delivery.order.wait, wait);
  assert.equal(s.catNeeds.sleepUntil, s.t + H.catSleep);
});

test('помощь коту: засыпает на catSleep секунд — не голодает, не скучает, к еде не лезет; потом всё как раньше', () => {
  const s = new KitchenSession({ dayIndex: 3, seed: 1 });
  const h0 = s.catNeeds.hunger;
  assert.ok(s.streamEvent('help'));
  assert.equal(s.catCalm(), true, 'спит');
  assert.equal(s.catNeeds.sleepUntil, s.t + H.catSleep);
  run(s, H.catSleep - 2);
  assert.equal(s.catNeeds.hunger, h0, 'пока спит, голод стоит');
  run(s, 5);
  assert.equal(s.t > s.catNeeds.sleepUntil, true);
  run(s, 30);
  assert.ok(s.catNeeds.hunger > h0, 'проснулся — голод снова растёт');
});

test('помощь прерывает беду: кот, тянувшийся к колбасе, засыпает, тревога снимается', () => {
  const s = new KitchenSession({ dayIndex: 3, seed: 1 });
  s._startCatTheft('sausage');
  assert.equal(s.cat.state, 'theft');
  assert.ok(s.alerts.some((a) => a.key === 'cat'));
  s.streamEvent('help');
  assert.equal(s.cat.state, 'home');
  assert.equal(s.alerts.some((a) => a.key === 'cat'), false);
  run(s, 20);
  assert.equal(s.stats.thefts, 0, 'кражи не было');
});

test('помощь выбирает по ситуации через rng: оба варианта доступны — решает s.rng', () => {
  const seedFor = (wantLow) => {
    for (let seed = 1; seed < 200; seed++) {
      const x = createRng(seed).next();
      if (wantLow ? x < 0.5 : x >= 0.5) return seed;
    }
  };
  const pick = (seed) => {
    const s = new KitchenSession({ dayIndex: 2, seed });
    orderOn(s);
    s.rng = createRng(seed); // тот же ряд, что мы посчитали
    s.catNeeds.sleepUntil = 0;
    s.streamEvent('help');
    return s.drain().filter((e) => e.type === 'stream' && e.kind === 'help').at(-1).effect;
  };
  const effects = new Set([pick(seedFor(true)), pick(seedFor(false))]);
  assert.deepEqual([...effects].sort(), ['cat', 'courier'], 'курьер в пути и кот не спит: выпадают оба исхода, по rng');
  assert.equal(pick(seedFor(true)), pick(seedFor(true)), 'при одном rng — один исход');
});

test('чат разбудил кота: «!кот» снимает сон от «!помощь»', () => {
  const s = new KitchenSession({ dayIndex: 3, seed: 1 });
  s.streamEvent('help');
  assert.equal(s.catCalm(), true);
  s.streamEvent('cat');
  assert.equal(s.catNeeds.sleepUntil, 0);
  assert.equal(s.catNeeds.hunger, 100);
});

test('практика: событий чата нет; счётчик событий растёт только от принятых', () => {
  const p = new KitchenSession({ practice: { activity: 'cubes', product: 'carrot' }, seed: 1 });
  assert.equal(p.streamEvent('help'), false);
  const s = new KitchenSession({ dayIndex: 3, seed: 1 });
  s.streamEvent('radio');
  s.streamEvent('radio'); // радио уже сломано — отказ
  s.streamEvent('help');
  assert.equal(s.stats.chatEvents, 2);
});

test('курьер с ником зрителя: «Курьер Нико в пути» и «Курьер Нико приехал», один и тот же в обоих сообщениях', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  s.streamViewers = () => ({ nicks: ['Нико', 'Мила'], show: true });
  orderOn(s);
  const texts = s.phone.messages.filter((m) => m.from === 'Доставка').map((m) => m.text);
  const way = texts.find((t) => /в пути/.test(t));
  assert.match(way, /^Курьер (Нико|Мила) в пути\.$/);
  const nick = way.split(' ')[1];
  s.waitDelivery();
  const arrived = s.phone.messages.filter((m) => m.from === 'Доставка').at(-1).text;
  assert.equal(arrived, `Курьер ${nick} приехал. Можно забрать заказ.`);
  assert.equal(s.alerts.find((a) => a.key === 'delivery').text, `Курьер ${nick} у двери`);
});

test('курьер без ника: зрителей нет или «Показывать ники» выключено — как раньше', () => {
  for (const viewers of [undefined, () => ({ nicks: [], show: true }), () => ({ nicks: ['Нико'], show: false })]) {
    const s = new KitchenSession({ dayIndex: 2, seed: 1 });
    s.streamViewers = viewers;
    orderOn(s);
    assert.ok(s.phone.messages.some((m) => m.text === 'Курьер в пути.'), String(viewers));
  }
});

test('заказ «сходить самой» — без курьера и без ника', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  s.streamViewers = () => ({ nicks: ['Нико'], show: true });
  arrive(s, 'phone');
  s.draftSet('caviar', 1);
  s.confirmOrder('self');
  assert.equal(s.courierName(), 'Курьер');
});

test('комментарий зрителя под фото героини — только из заготовок, ник очищен, без ответа «Ответить»', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.live = true;
  s.streamViewers = () => ({ nicks: ['Нико'], show: true });
  s._finishDish('olivier', { prep: 90, comp: 90, asm: 90 }, []);
  assert.ok(s.postPhoto('olivier'));
  const key = `me-${s.phone.posts[0].id}`;
  run(s, CAMPAIGN.stream.commentDelay[0] - 1);
  assert.equal(s.postComments(key).some((c) => c.who.startsWith('📺')), false, 'раньше срока комментария нет');
  run(s, CAMPAIGN.stream.commentDelay[1]);
  const c = s.postComments(key).find((x) => x.who.startsWith('📺'));
  assert.ok(c, 'зритель оставил комментарий');
  assert.equal(c.who, '📺 Нико');
  assert.ok(VIEWER_REACTIONS.some((r) => r.text === c.text), 'текст — заготовка');
  assert.equal(FEED_AUTHORS[c.who], undefined, 'не выдаёт себя за героя игры');
  assert.ok(s.drain().some((e) => e.type === 'viewerComment' && e.nick === 'Нико'));
});

test('все заготовки зрителей короче 80 знаков, а по оценке блюда выбираются подходящие', () => {
  for (const r of VIEWER_REACTIONS) assert.ok(r.text.length <= 80, r.text);
  const bad = new KitchenSession({ dayIndex: 0, seed: 1 });
  bad.live = true;
  bad.streamViewers = () => ({ nicks: ['Нико'], show: true });
  bad._finishDish('olivier', { prep: 20, comp: 20, asm: 20 }, []);
  bad.postPhoto('olivier');
  run(bad, 60);
  const c = bad.postComments(`me-${bad.phone.posts[0].id}`).find((x) => x.who.startsWith('📺'));
  const r = VIEWER_REACTIONS.find((x) => x.text === c.text);
  assert.ok(r.minQ == null || r.minQ <= bad.dishes.olivier.Q, 'слабому блюду не достаётся «как из ресторана»');
});

test('не стрим или ники выключены — зрители под фото не пишут', () => {
  for (const [live, viewers] of [[false, () => ({ nicks: ['Нико'], show: true })], [true, () => ({ nicks: ['Нико'], show: false })], [true, () => ({ nicks: [], show: true })]]) {
    const s = new KitchenSession({ dayIndex: 0, seed: 1 });
    s.live = live;
    s.streamViewers = viewers;
    s._finishDish('olivier', { prep: 90, comp: 90, asm: 90 }, []);
    s.postPhoto('olivier');
    run(s, 60);
    assert.equal(s.postComments(`me-${s.phone.posts[0].id}`).some((x) => x.who.startsWith('📺')), false);
  }
});

test('регрессия: комментарий зрителя в ветке не лишает героиню ответа друга', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.live = true;
  s.streamViewers = () => ({ nicks: ['Нико'], show: true });
  s._finishDish('olivier', { prep: 90, comp: 90, asm: 90 }, []);
  s.postPhoto('olivier');
  const key = `me-${s.phone.posts[0].id}`;
  run(s, 80); // лайки и комментарии друзей открылись, зритель написал последним
  assert.equal(s.postComments(key).at(-1).who, '📺 Нико');
  assert.ok(s.commentPost(key, 'Всем спасибо!'));
  assert.equal(s.commentQueue.length, 1, 'друг ответит');
  assert.ok(FEED_AUTHORS[s.commentQueue[0].who], 'отвечает друг из ленты, а не зритель');
});

test('состояние для canFire: пока нож зажат или идёт действие — жест; в покое — нет; живой день только после s.live', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  assert.equal(s.streamState().live, false, 'без флага s.live день не считается живым');
  s.live = true;
  assert.equal(s.streamState().live, true);
  assert.equal(s.streamState().gesture, false);
  s.pointerDown = true;
  assert.equal(s.streamState().gesture, true);
  s.pointerDown = false;
  s.holds.radio = true;
  assert.equal(s.streamState().gesture, true, 'удержание у радио/гирлянды — жест');
  s.holds.radio = false;
  s.action = { type: 'feedCat' };
  assert.equal(s.streamState().gesture, true);
  s.action = null;
  s.gift = { index: 0 };
  assert.equal(s.streamState().gesture, true, 'подарок в руках');
  s.gift = null;
  assert.equal(s.streamState().gesture, false);
});

test('состояние для canFire: оценка конца дня по темпу, готовый день — тишина', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.live = true;
  s.t = 400;
  assert.equal(s.streamState().remaining, null, 'мало сделано — конец неизвестен');
  for (const d of Object.values(s.dishes)) for (const st of d.recipe.steps) d.steps[st.id].done = true;
  s.t = 400;
  const st = s.streamState();
  assert.equal(st.remaining, 0, 'все шаги сделаны');
  assert.equal(canFire({ ...st, t: 400, lesson: false, book: false, typing: false }).ok, false, 'последние секунды дня — событий нет');
  const half = new KitchenSession({ dayIndex: 0, seed: 1 });
  half.live = true;
  half.t = 300;
  const steps = Object.values(half.dishes).flatMap((d) => d.recipe.steps.map((x) => [d, x]));
  steps.slice(0, Math.floor(steps.length / 2)).forEach(([d, x]) => (d.steps[x.id].done = true));
  const rem = half.streamState().remaining;
  assert.ok(rem > 100 && rem < 600, `около 300 с, получилось ${rem}`);
});

test('на последнем дне места на столе считаются шагами дня', () => {
  const s = new KitchenSession({ dayIndex: 6, seed: 1, tableDishes: ['olivier'] });
  s.live = true;
  s.t = 300;
  for (const d of Object.values(s.dishes)) for (const st of d.recipe.steps) d.steps[st.id].done = true;
  assert.ok(s.streamState().remaining > 0, 'блюда готовы, но стол не накрыт — день не закончен');
});
