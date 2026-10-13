// 0.11 G2.5: слой шубы засчитывается сам, когда его размазали и отпустили шпатель.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, zigzag } from './helpers-campaign.js';

function shubaReady() {
  const s = new KitchenSession({ dayIndex: 4, seed: 1 });
  s.triggers = [];
  const d = s.dishes.shuba;
  for (const id of ['boil', 'herring', 'onion', 'potato', 'carrot', 'beet']) d.steps[id].done = true;
  for (const id of ['herring', 'onion', 'potato', 'carrot', 'beet']) d.prepared[id] = { product: id, q: 1 };
  arrive(s, 'tray');
  assert.ok(s.traySelect('shuba'));
  return { s, w: d.work };
}

test('слой размазан и шпатель отпущен → слой лёг сам, компонент выбирается заново', () => {
  const { s, w } = shubaReady();
  assert.ok(s.shubaChoose(s.shubaExpected()[0]));
  s.pointer('down', w.dish.x, w.dish.z);
  s.pointer('up', w.dish.x, w.dish.z);
  zigzag(s, w.dish.x, w.dish.z, 0.2, 0.2, 10);
  assert.equal(w.layers.length, 1);
  assert.equal(w.current, null);
});

test('покрыто мало — отпустила, слой остался в руках: размажь ещё, ничего не потрачено', () => {
  const { s, w } = shubaReady();
  assert.ok(s.shubaChoose(s.shubaExpected()[0]));
  s.pointer('down', w.dish.x, w.dish.z); // положила на блюдо
  s.pointer('up', w.dish.x, w.dish.z);
  s.pointer('down', w.dish.x, w.dish.z);
  s.pointer('move', w.dish.x + 0.01, w.dish.z);
  s.pointer('up', w.dish.x + 0.01, w.dish.z);
  assert.equal(w.layers.length, 0);
  assert.ok(w.current?.placed, 'слой ещё в руках');
});

test('майонез: слой лёг сам — майонез списан один раз', () => {
  const { s, w } = shubaReady();
  const mayo0 = s.inventory.count('mayo');
  assert.ok(s.shubaChoose('mayo'));
  s.pointer('down', w.dish.x, w.dish.z);
  s.pointer('up', w.dish.x, w.dish.z);
  zigzag(s, w.dish.x, w.dish.z, 0.2, 0.2, 10);
  assert.equal(w.layers.length, 1);
  assert.equal(s.inventory.count('mayo'), mayo0 - 1);
});
