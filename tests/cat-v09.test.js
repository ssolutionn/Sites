// 0.9, пункты 7 и 10 владельца: кота не прогнать кнопкой из нарезки — надо выйти из крупного плана и помахать на него;
// кот чаще хочет играть, а если не поиграть — бесчинствует (лезет на ёлку, срывает гирлянду); уведомления приходят чаще.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, run, playCatByWand } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { Waver } from '../src/campaign/mechanics.js';

const C = CAMPAIGN.cat;
const day = (i = 1) => new KitchenSession({ dayIndex: i, seed: 3 });

function wave(s, n = 4, amp = 0.08) {
  let r;
  for (let k = 0; k <= n; k++) {
    r = s.catWave(k % 2 ? amp : -amp);
    s.update(0.05);
  }
  return r;
}

test('помахать: три разворота с размахом — да; дрожание на месте — нет', () => {
  const w = new Waver(C.wave);
  let t = 0;
  for (let i = 0; i < 40; i++) assert.equal(w.move((i % 2) * 0.004, (t += 0.03)), false, 'дрожание');
  const w2 = new Waver(C.wave);
  const xs = [0, 0.1, 0, 0.1, 0, 0.1];
  const res = xs.map((x) => w2.move(x, (t += 0.15)));
  assert.equal(res.at(-1), true);
});

test('скучает: со временем кот просит поиграть — напоминание и событие', () => {
  const s = day();
  s.drain();
  const need = (C.wantPlayAt - C.boredStart) / C.boredRate;
  run(s, need + 2);
  assert.ok(s.catNeeds.boredom >= C.wantPlayAt);
  assert.ok(s.alerts.some((a) => a.key === 'catBored'));
  assert.ok(s.drain().some((e) => e.type === 'catBored'));
});

test('поиграла — скука сбрасывается, напоминание уходит', () => {
  const s = day();
  s.catNeeds.boredom = C.wantPlayAt + 5;
  run(s, 0.2);
  assert.ok(playCatByWand(s));
  assert.equal(s.catNeeds.boredom, 0);
  assert.equal(s.alerts.some((a) => a.key === 'catBored'), false);
});

test('не поиграла — кот бесчинствует: срочное дело с таймером, потом гаснет гирлянда или звезда', () => {
  const s = day();
  s.catNeeds.hunger = 0; // сытый: дело именно в скуке
  s.catNeeds.boredom = C.mischiefAt;
  run(s, 0.5);
  assert.equal(s.cat.state, 'mischief');
  const a = s.alerts.find((x) => x.key === 'cat');
  assert.ok(a?.urgent && a.deadline > s.t);
  const kind = s.cat.kind;
  assert.ok(['garland', 'star'].includes(kind));
  s.drain();
  run(s, a.deadline - s.t + 0.2);
  assert.equal(s[kind].broken, true);
  const ev = s.drain().find((e) => e.type === 'catMischief');
  assert.equal(ev?.kind, kind);
  assert.equal(s.cat.state, 'home');
  assert.ok(s.catNeeds.boredom < C.wantPlayAt, 'набезобразничал — на время успокоился');
});

test('в нарезке помахать нельзя — подсказка выйти; вышла из крупного плана — помахала и прогнала', () => {
  const s = day(0);
  arrive(s, 'board');
  s._startCatTheft();
  assert.equal(wave(s), 'closeup');
  assert.match(s.hint.text, /Выйди/);
  assert.equal(s.cat.state, 'theft');
  s.closePanel();
  assert.equal(wave(s), 'shoo');
  assert.equal(s.cat.state, 'home');
});

test('прогнала во время проказы — ничего не погасло', () => {
  const s = day();
  s.catNeeds.hunger = 0;
  s.catNeeds.boredom = C.mischiefAt;
  run(s, 0.5);
  const kind = s.cat.kind;
  assert.equal(wave(s), 'shoo');
  run(s, 20);
  assert.equal(s[kind].broken, false);
});

test('уведомления приходят чаще: за 3 минуты дня 2 — не меньше пяти сообщений', () => {
  const s = day(1);
  run(s, 180);
  assert.ok(s.phone.messages.length >= 5, `сообщений: ${s.phone.messages.length}`);
  const froms = new Set(s.phone.messages.map((m) => m.from));
  assert.ok(froms.size >= 3, 'пишут разные люди');
});
