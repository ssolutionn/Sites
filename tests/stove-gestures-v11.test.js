// 0.11 G1.1–G1.2: на плите физические действия — жестом: продукт перетаскивают на конфорку, кастрюлю утаскивают за ручку.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, waitAction, run, take, startBoil } from './helpers-campaign.js';
import { CAMPAIGN, kitchenSec } from '../src/campaign/data.js';
import { STOVE } from '../src/campaign/layout.js';

const fresh = () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  return s;
};
const at = (i, dx = 0, dz = 0) => [STOVE.burners[i].x + dx, STOVE.burners[i].z + dz];

test('продукт из рук отпущен над конфоркой → кастрюля встаёт именно на неё', () => {
  const s = fresh();
  take(s, 'olivier:boilEgg');
  arrive(s, 'stove');
  assert.ok(s.stoveDrop(...at(2, 0.02, -0.01)), s.hint?.text);
  waitAction(s);
  assert.equal(s.burners[2].state, 'boiling');
  assert.equal(s.burners[0].state, 'empty');
  assert.equal(s.carry, null, 'руки свободны');
});

test('продукт отпущен мимо конфорок → ничего не потрачено, в руках остался, подсказка', () => {
  const s = fresh();
  take(s, 'olivier:boilEgg');
  arrive(s, 'stove');
  const c0 = s.carry;
  assert.equal(s.stoveDrop(0.45, 0.4), false);
  assert.match(s.hint.text, /конфорку/);
  assert.equal(s.carry, c0);
  assert.ok(s.burners.every((b) => b.state === 'empty'));
});

test('граница: на радиусе ×1,5 от центра конфорки засчитывается, дальше — нет', () => {
  const s = fresh();
  take(s, 'olivier:boilEgg');
  arrive(s, 'stove');
  assert.equal(s.stoveDrop(...at(1, STOVE.r * 1.6, 0)), false);
  assert.ok(s.stoveDrop(...at(1, STOVE.r * 1.45, 0)));
});

test('руки пусты → «перетащи» ничего не делает, подсказка про холодильник', () => {
  const s = fresh();
  arrive(s, 'stove');
  assert.equal(s.stoveDrop(...at(0)), false);
  assert.match(s.hint.text, /достань|варить нечего/i);
});

test('залитая конфорка не принимает кастрюлю', () => {
  const s = fresh();
  take(s, 'olivier:boilEgg');
  arrive(s, 'stove');
  s.burners[0].dirty = true;
  assert.equal(s.stoveDrop(...at(0)), false);
  assert.match(s.hint.text, /залило|вытри/i);
});

function readyPot() {
  const s = fresh();
  startBoil(s, 'olivier:boilEgg', { burner: 1, heat: 6 });
  run(s, kitchenSec(8) + kitchenSec(10) + 1);
  assert.equal(s.burners[1].state, 'ready');
  arrive(s, 'stove');
  return s;
}

test('сварившуюся кастрюлю взяла за ручку и утащила со стола → снята', () => {
  const s = readyPot();
  const [x, z] = at(1);
  assert.equal(s.pointer('down', x, z), 'pot');
  assert.ok(s.potDrag, 'кастрюля в руке');
  s.pointer('move', x + 0.1, z + 0.1);
  s.pointer('move', x + 0.3, z + 0.2);
  assert.equal(s.pointer('up', x + 0.3, z + 0.2), 'potTake');
  waitAction(s);
  assert.equal(s.burners[1].state, 'empty');
  assert.equal(s.potDrag, null);
  assert.ok(s.dishes.olivier.steps.boilEgg.done);
});

test('не дотащила от конфорки (меньше dragOff·радиуса) → кастрюля вернулась, ничего не снято', () => {
  const s = readyPot();
  const [x, z] = at(1);
  s.pointer('down', x, z);
  const near = STOVE.r * CAMPAIGN.stove.dragOff * 0.9;
  s.pointer('move', x + near, z);
  assert.equal(s.pointer('up', x + near, z), 'up');
  assert.equal(s.burners[1].state, 'ready');
});

test('граница + 10 %: дальше dragOff·1,1 — снята', () => {
  const s = readyPot();
  const [x, z] = at(1);
  s.pointer('down', x, z);
  const far = STOVE.r * CAMPAIGN.stove.dragOff * 1.1;
  s.pointer('move', x + far, z);
  assert.equal(s.pointer('up', x + far, z), 'potTake');
});

test('кипящую кастрюлю утащить рано: подсказка «ещё варится», с огня не снята', () => {
  const s = fresh();
  startBoil(s, 'olivier:boilEgg', { burner: 0, heat: 6 });
  run(s, 5);
  arrive(s, 'stove');
  const [x, z] = at(0);
  s.pointer('down', x, z);
  s.pointer('move', x + 0.3, z);
  s.pointer('up', x + 0.3, z);
  assert.equal(s.burners[0].state, 'boiling');
  assert.match(s.hint.text, /варится|Вода|нагре/i);
});

test('курсор ушёл за окно посреди переноса (pointerUp) → кастрюля стоит на месте', () => {
  const s = readyPot();
  const [x, z] = at(1);
  s.pointer('down', x, z);
  s.pointer('move', x + 0.3, z);
  s.pointerUp();
  assert.equal(s.potDrag, null);
  assert.equal(s.burners[1].state, 'ready');
});
