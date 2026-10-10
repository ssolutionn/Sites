// Тесты механик 0.5: две конфорки, остывание, вкус, кот как система, пожелания, деньги, доска, темп и медали.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from '../src/campaign/data.js';
import { emptySave, recordDay, parseSave } from '../src/campaign/save.js';
import { KitchenSession, run, arrive, waitAction, cutCubes, seasonTo, tasteDone, stir, peel, startBoil, take } from './helpers-campaign.js';

test('плита: две кастрюли варятся параллельно, у каждой свой срок; одна конфорка в испытании', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 2 });
  startBoil(s, 'olivier:boil');
  startBoil(s, 'olivier:boilEgg');
  assert.equal(s.burners[0].product, 'potato');
  assert.equal(s.burners[1].product, 'egg');
  assert.equal(Math.round(s.burners[0].readyAt - s.burners[0].startT), 120);
  assert.equal(Math.round(s.burners[1].readyAt - s.burners[1].startT), 60);
  run(s, 61);
  assert.equal(s.burners[1].state, 'ready');
  assert.equal(s.burners[0].state, 'boiling');
  const one = new KitchenSession({ dayIndex: 0, seed: 2, mods: { oneBurner: true } });
  startBoil(one, 'olivier:boilEgg');
  take(one, 'olivier:peelPotato');
  arrive(one, 'board');
  assert.ok(one.boardSelect('olivier:peelPotato'));
  peel(one);
  arrive(one, 'stove');
  assert.equal(one.placePot(), false, 'в испытании одна конфорка');
});

test('остывание: горячее не режется, через срок или после раковины — можно', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 2 });
  startBoil(s, 'olivier:boilEgg');
  run(s, 61);
  arrive(s, 'stove');
  assert.ok(s.takePot());
  waitAction(s);
  assert.ok(s.hot.egg > s.t);
  arrive(s, 'board');
  assert.equal(s.boardSelect('olivier:peelEgg'), false);
  assert.match(s.hint.text, /горяч/);
  run(s, CAMPAIGN.cool.time + 1);
  assert.ok(s.boardSelect('olivier:peelEgg'));
});

test('вкус: посолить → перемешать → попробовать; проба честная, пересол разбавляется, оценка по точности', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 4 });
  const se = s.dishes.crab.season;
  s.bowl.owner = 'crab';
  for (const st of ['boilEgg', 'peelEgg', 'crab', 'egg', 'cucumber', 'corn', 'mayo']) s.dishes.crab.steps[st].done = true;
  arrive(s, 'bowl');
  for (let i = 0; i < se.target.salt + 2; i++) { s.seasonAdd('crab', 'salt'); waitAction(s); }
  assert.equal(s.seasonTaste('crab'), false, 'до перемешивания соль сверху — проба запрещена');
  assert.match(s.hint.text, /перемешай/);
  assert.ok(s.seasonDone('crab'));
  stir(s);
  assert.ok(s.stepDone('crab', 'mix'));
  assert.equal(s.dishes.crab.done, false);
  s.seasonTaste('crab');
  waitAction(s);
  assert.match(se.last.verdict, /пересол/);
  s.seasonDilute('crab');
  waitAction(s);
  assert.equal(se.salt, se.target.salt + 1);
  s.seasonDilute('crab');
  waitAction(s);
  // перец после перемешивания: щепотка — и ещё оборот ложкой, иначе проба запрещена
  for (let i = se.pepper; i < se.target.pepper; i++) { s.seasonAdd('crab', 'pepper'); waitAction(s); }
  if (se.target.pepper > 0) {
    assert.equal(s.seasonTaste('crab'), false);
    assert.match(s.hint.text, /ещё оборот/);
    stir(s, 1.2);
  }
  s.seasonTaste('crab');
  waitAction(s);
  assert.equal(se.last.ok, true);
  assert.equal(s.seasonQuality('crab'), 1);
  tasteDone(s, 'crab', { taste: false });
  assert.ok(s.dishes.crab.done);
  assert.equal(s.dishes.crab.parts.taste, 100);
  se.salt += 2;
  assert.ok(s.seasonQuality('crab') < 0.75);
});

test('кот: голод растёт, голодный кот сам идёт к колбасе; сытый — спит и не крадёт', () => {
  const s = new KitchenSession({ dayIndex: 5, seed: 1 });
  s.triggers = [];
  arrive(s, 'board');
  s.boardSelect('canape:sausage');
  s.catNeeds.hunger = CAMPAIGN.cat.theftAt + 1;
  run(s, 1);
  assert.equal(s.cat.state, 'theft');
  assert.match(s.alerts.find((a) => a.key === 'cat').text, /колбас/);
  const f = new KitchenSession({ dayIndex: 5, seed: 1 });
  f.triggers = f.triggers.filter((e) => e.type === 'cat');
  arrive(f, 'catbowl');
  assert.ok(f.feedCat());
  waitAction(f);
  assert.equal(f.catNeeds.hunger, 0);
  arrive(f, 'board');
  f.boardSelect('canape:sausage');
  run(f, 40);
  assert.notEqual(f.cat.state, 'theft');
  assert.equal(f.stats.thefts, 0);
});

test('пожелания: приходят сообщением, меняют норму и проверяются по делу', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 3 });
  assert.ok(s.requests.length >= 1);
  run(s, 45);
  assert.ok(s.requests.every((r) => r.known));
  const r = s.requests[0];
  assert.equal(s.wishMet(r), false);
  const light = new KitchenSession({ dayIndex: 0, seed: 1 });
  light.requests.push({ id: 9, recipe: 'olivier', kind: 'lightMayo', known: true });
  light.bowl.owner = 'olivier';
  arrive(light, 'bowl');
  light.bowlAdd('olivier', 'mayo', 'light');
  waitAction(light);
  assert.equal(light.wishMet(light.requests.at(-1)), true);
});

test('деньги: бюджет дня, экспресс дороже, «сходить самой» бесплатно, но героиня уходит надолго', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  arrive(s, 'phone');
  s.draftSet('caviar', 1);
  const ex = s.orderCost({ caviar: 1 }, 'express');
  const st = s.orderCost({ caviar: 1 }, 'standard');
  assert.ok(ex.total > st.total);
  s.draftSet('caviar', 6);
  assert.equal(s.confirmOrder('express'), false); // не хватает денег
  s.draftSet('caviar', 1);
  assert.ok(s.confirmOrder('self'));
  assert.equal(s.wallet.spent, s.orderCost({ caviar: 1 }, 'self').total);
  for (let i = 0; i < 30 * 20 && !s.heroine.away; i++) s.update(1 / 30);
  assert.ok(s.heroine.away);
  assert.ok(s.heroine.awayLeft > 20);
  run(s, CAMPAIGN.money.modes.self.away + 15);
  assert.ok(s.delivery.bag);
});

test('доска: после сельди другой продукт не режется, пока доску не помыть', () => {
  const s = new KitchenSession({ dayIndex: 4, seed: 1 });
  s.triggers = [];
  arrive(s, 'board');
  s.boardSelect('shuba:herring');
  cutCubes(s);
  assert.ok(s.boardTransfer());
  assert.equal(s.equipment.board.clean, false);
  assert.equal(s.boardSelect('shuba:onion'), false);
  assert.match(s.hint.text, /селёдк/);
  assert.equal(s._boardDirtyBlock('herring'), null); // тот же продукт — можно
  arrive(s, 'sink');
  s.sinkSelect('board');
  for (let k = 0; k < 6 && !s.equipment.board.clean; k++) {
    s.pointer('down', -0.15, -0.1);
    for (let r = 0; r < 10; r++) for (let i = 0; i <= 10; i++) s.pointer('move', -0.16 + (0.32 * (r % 2 ? 10 - i : i)) / 10, -0.11 + r * 0.024);
    s.pointer('up', 0, 0);
  }
  assert.equal(s.equipment.board.clean, true);
});

test('темп, звёзды и медали: итог дня, сохранение лучших и объединение медалей', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  assert.equal(s.paceScore(s.par() - 1), 100);
  assert.ok(s.paceScore(s.par() * 2) <= 45);
  assert.equal(s.starsFor(95), 3);
  assert.equal(s.starsFor(60), 1);
  const save = emptySave();
  recordDay(save, 1, { D: 80, dishes: {}, medals: ['fast'], stars: 2, time: 400 });
  recordDay(save, 1, { D: 70, dishes: {}, medals: ['cleanFloor'], stars: 1, time: 300 });
  assert.deepEqual(save.days[0].medals.sort(), ['cleanFloor', 'fast']);
  assert.equal(save.days[0].stars, 2);
  assert.equal(save.days[0].bestTime, 300);
  const back = parseSave(JSON.stringify(save)).save;
  assert.deepEqual(back.days[0].medals.sort(), ['cleanFloor', 'fast']);
});

test('стрим: команды чата вызывают события в пределах правил', () => {
  const s = new KitchenSession({ dayIndex: 3, seed: 1 });
  assert.ok(s.streamEvent('cat'));
  assert.equal(s.catNeeds.hunger, 100);
  assert.ok(s.streamEvent('radio'));
  assert.equal(s.radio.broken, true);
  assert.equal(s.streamEvent('radio'), false);
  const before = s.requests.length;
  s.streamEvent('guest');
  assert.ok(s.requests.length >= before);
});

test('день 1 целиком через API даёт звёзды и медаль вкуса', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 5 });
  arrive(s, 'catbowl');
  s.feedCat();
  waitAction(s);
  startBoil(s, 'olivier:boil');
  startBoil(s, 'olivier:boilEgg');
  for (const key of ['olivier:carrot', 'olivier:sausage', 'olivier:pickle']) {
    arrive(s, 'board');
    s.boardSelect(key);
    cutCubes(s);
    assert.ok(s.boardTransfer(), s.hint?.text);
  }
  for (const b of [1, 0]) {
    run(s, Math.max(0, s.burners[b].readyAt - s.t + 0.2));
    for (const x of s.burners) if (x.overflow) { arrive(s, 'stove'); s.reduceHeat(x.i); waitAction(s); }
    arrive(s, 'stove');
    assert.ok(s.takePot(b), s.hint?.text);
    waitAction(s);
    arrive(s, 'sink');
    s.coolProduct(s.burners[b].product ?? (b ? 'egg' : 'potato'));
    waitAction(s);
    arrive(s, 'board');
    // яйца чистят после варки руками; картофель для оливье уже почищен сырым — сразу режем
    assert.ok(s.boardSelect(b ? 'olivier:peelEgg' : 'olivier:potato'), s.hint?.text);
    if (b) peel(s);
    cutCubes(s);
    assert.ok(s.boardTransfer(), s.hint?.text);
  }
  arrive(s, 'bowl');
  s.bowlAdd('olivier', 'peas');
  waitAction(s);
  s.bowlAdd('olivier', 'mayo');
  waitAction(s);
  seasonTo(s, 'olivier');
  stir(s);
  tasteDone(s, 'olivier');
  assert.ok(s.dishes.olivier.done);
  for (const p of [...s.puddles]) s.puddles = s.puddles.filter((x) => x !== p);
  const r = s.finishDay();
  assert.ok(r.stars >= 2, JSON.stringify(r));
  assert.ok(r.medals.includes('perfectTaste'));
});
