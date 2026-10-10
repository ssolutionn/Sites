// Плита 0.7: крутилки огня. Вода греется от огня, на слабом не закипает, на сильном пена убегает.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, waitAction, run, startBoil } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';

function potOn(heat) {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  startBoil(s, 'olivier:boil', { burner: 0, heat });
  return s;
}

test('огонь выключен — вода не греется и картошка не варится; включила — закипает', () => {
  const s = potOn(0);
  run(s, 30);
  const b = s.burners[0];
  assert.equal(b.water, 'cold');
  assert.ok(b.temp < 21);
  assert.equal(b.cooked, 0);
  assert.ok(s.setHeat(0, 6));
  run(s, 26);
  assert.equal(b.water, 'boil');
  assert.ok(b.cooked > 0);
});

test('на 2 вода не закипает никогда, на 9 закипает быстрее, чем на 4', () => {
  const low = potOn(2);
  run(low, 200);
  assert.notEqual(low.burners[0].water, 'boil');
  assert.equal(low.burners[0].cooked, 0);
  const t = (heat) => {
    const s = potOn(heat);
    let k = 0;
    while (s.burners[0].water !== 'boil' && k++ < 3000) s.update(0.05);
    return k * 0.05;
  };
  assert.ok(t(9) < t(4) - 10, `${t(9)} < ${t(4)}`);
});

test('сильный огонь на кипении — пена убегает; убавила крутилкой до 5 — осела, без лужи', () => {
  const s = potOn(9);
  let k = 0;
  while (!s.burners[0].overflow && k++ < 2000) s.update(0.05);
  assert.ok(s.burners[0].overflow, 'на 9 убежала');
  assert.ok(s.setHeat(0, 5));
  assert.equal(s.burners[0].overflow, null);
  assert.equal(s.puddles.length, 0);
});

test('прозевала пену — выкипело, лужа и штраф', () => {
  const s = potOn(9);
  let k = 0;
  while (!s.burners[0].overflow && k++ < 2000) s.update(0.05);
  run(s, 20);
  assert.equal(s.stats.spills, 1);
  assert.ok(s.puddles.length > 0);
});

test('тихий огонь — плановое «убегает» не случается', () => {
  const s = potOn(CAMPAIGN.stove.simmer);
  run(s, 110);
  assert.equal(s.stats.spills, 0);
  assert.equal(s.burners[0].overflow, null);
});

test('сняла кастрюлю — огонь выключен', () => {
  const s = potOn(6);
  run(s, 125);
  assert.equal(s.burners[0].state, 'ready');
  assert.ok(s.takePot(0));
  waitAction(s);
  assert.equal(s.burners[0].heat, 0);
});

test('остудить под краном руками: держишь кнопку над раковиной — вода льётся, отпустила — стоит', () => {
  const s = potOn(6);
  run(s, 125);
  s.takePot(0);
  waitAction(s);
  assert.ok(s.hot.potato > s.t);
  arrive(s, 'sink');
  assert.ok(s.coolPick('potato'));
  s.pointer('down', 0, 0);
  run(s, 1);
  s.pointer('up', 0, 0);
  run(s, 2);
  assert.ok(s.hot.potato > s.t, 'отпустила — кран закрыт, ещё горячее');
  const was = s.sinkCool.run;
  assert.ok(was > 0.8 && was < 1.3);
  s.pointer('down', 0.02, 0.01);
  run(s, CAMPAIGN.cool.underTap);
  s.pointer('up', 0, 0);
  assert.equal(s.hot.potato, undefined);
  assert.equal(s.sinkCool, null);
});
