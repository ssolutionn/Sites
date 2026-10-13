// 0.11 G1.3: духовка — жестом: потянуть ручку вниз, опустить форму в проём, вытащить готовую вниз; кнопок нет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, waitAction, run } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { OVEN } from '../src/campaign/layout.js';
import { inOvenCavity } from '../src/campaign/st-oven.js';

const T = CAMPAIGN.oven.door.travel;

function day7() {
  const s = new KitchenSession({ dayIndex: 6, seed: 1 });
  s.triggers = [];
  const d = s.dishes.chicken;
  d.steps.marinade = { done: true, q: 1, info: null };
  d.work = d.work ?? { inOven: false, baked: 0 };
  s.tray.owner = 'chicken';
  s.equipment.tray.owner = 'chicken';
  return s;
}
// ручку тянут вниз из точки (x, z0) на delta метров; отпускают в конце
function pull(s, z0, delta, x = 0) {
  s.pointer('down', x, z0);
  for (let k = 1; k <= 6; k++) s.pointer('move', x, z0 + (delta * k) / 6);
  return s.pointer('up', x, z0 + delta);
}
const openDoor = (s) => pull(s, -0.2, T * 1.05);

test("духовка — крупный план: станция входит в CLOSEUP_STATIONS", async () => {
  const { CLOSEUP_STATIONS } = await import('../src/campaign/layout.js');
  assert.ok(CLOSEUP_STATIONS.has('oven'));
});

test('ручка вниз на полный ход — дверца открыта; вверх обратно — закрыта', () => {
  const s = day7();
  arrive(s, 'oven');
  assert.equal(s.ovenDoor.door, 'closed');
  openDoor(s);
  assert.equal(s.ovenDoor.door, 'open');
  assert.equal(pull(s, 0.4, -T * 1.05), 'up');
  assert.equal(s.ovenDoor.door, 'closed');
});

test('граница: ход ручки 70 % открывает, 70 % − 10 % — нет, дверца вернулась с подсказкой', () => {
  const s = day7();
  arrive(s, 'oven');
  pull(s, -0.2, T * CAMPAIGN.oven.door.open + 0.002);
  assert.equal(s.ovenDoor.door, 'open');
  const s2 = day7();
  arrive(s2, 'oven');
  pull(s2, -0.2, T * CAMPAIGN.oven.door.open * 0.9);
  assert.equal(s2.ovenDoor.door, 'closed');
  assert.match(s2.hint.text, /ниже/);
});

test('форму отпустили в проёме открытой духовки — запекание началось, руки свободны', () => {
  const s = day7();
  arrive(s, 'oven');
  openDoor(s);
  assert.ok(s.ovenDrop(0, 0), s.hint?.text);
  waitAction(s);
  assert.equal(s.oven.state, 'baking');
  assert.equal(s.equipment.form.owner, 'chicken');
});

test('дверца закрыта или форма мимо проёма — ничего не потрачено, подсказка', () => {
  const s = day7();
  arrive(s, 'oven');
  assert.equal(s.ovenDrop(0, 0), false);
  assert.match(s.hint.text, /закрыта|потяни/i);
  openDoor(s);
  s._ovenDenyAt = -1e9;
  assert.equal(s.ovenDrop(0.6, 0.55), false);
  assert.match(s.hint.text, /проём/i);
  assert.equal(s.oven.state, 'empty');
});

test('в проём попадает с запасом: рядом с краем — да, далеко — нет', () => {
  assert.equal(inOvenCavity(OVEN.cavity.x * CAMPAIGN.oven.drop * 0.98, 0, CAMPAIGN.oven.drop), true);
  assert.equal(inOvenCavity(OVEN.cavity.x * CAMPAIGN.oven.drop * 1.1, 0, CAMPAIGN.oven.drop), false);
});

function baked(state = 'ready') {
  const s = day7();
  arrive(s, 'oven');
  openDoor(s);
  s.ovenDrop(0, 0);
  waitAction(s);
  run(s, CAMPAIGN.oven.bake + 1);
  assert.equal(s.oven.state, 'ready');
  if (state !== 'ready') {
    run(s, 40);
  }
  return s;
}

test('готовая курица: взять в проёме и вытащить вниз — достала, блюдо закончено', () => {
  const s = baked();
  arrive(s, 'oven');
  if (s.ovenDoor.door !== 'open') openDoor(s);
  assert.equal(s.pointer('down', 0, 0), 'form');
  s.pointer('move', 0, 0.2);
  const end = OVEN.cavity.z1 + CAMPAIGN.oven.takeOut + 0.02;
  s.pointer('move', 0, end);
  assert.equal(s.pointer('up', 0, end), 'take');
  waitAction(s);
  assert.equal(s.oven.state, 'empty');
  assert.ok(s.dishes.chicken.steps.bake.done);
});

test('не дотащила форму до края проёма — осталась в духовке', () => {
  const s = baked();
  arrive(s, 'oven');
  if (s.ovenDoor.door !== 'open') openDoor(s);
  s.pointer('down', 0, 0);
  s.pointer('move', 0, 0.1);
  s._ovenDenyAt = -1e9;
  assert.equal(s.pointer('up', 0, 0.1), 'stay');
  assert.equal(s.oven.state, 'ready');
  assert.match(s.hint.text, /вниз/);
});

test('рано достала — курица вернулась сырой на поднос с подсказкой (как раньше)', () => {
  const s = day7();
  arrive(s, 'oven');
  openDoor(s);
  s.ovenDrop(0, 0);
  waitAction(s);
  run(s, 20);
  s.pointer('down', 0, 0);
  const end = OVEN.cavity.z1 + CAMPAIGN.oven.takeOut + 0.02;
  s.pointer('move', 0, end);
  assert.equal(s.pointer('up', 0, end), 'take');
  waitAction(s);
  assert.equal(s.oven.state, 'empty');
  assert.match(s.hint.text, /сырая/);
});

test('отпустила кнопку посреди открывания (pointerUp) — дверца вернулась по доле хода', () => {
  const s = day7();
  arrive(s, 'oven');
  s.pointer('down', 0, -0.2);
  s.pointer('move', 0, -0.2 + T * 0.4);
  s.pointerUp();
  assert.equal(s.ovenDoor.door, 'closed');
  assert.equal(s.ovenDoor.grab, null);
});

test('ушла от духовки — дверца закрылась сама', () => {
  const s = day7();
  arrive(s, 'oven');
  openDoor(s);
  assert.equal(s.ovenDoor.door, 'open');
  arrive(s, 'sink');
  run(s, 0.2);
  assert.equal(s.ovenDoor.door, 'closed');
});
