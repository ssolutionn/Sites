// 0.10, владелец: «реализуй управление на WASD полностью; контакт с активными предметами — на пробел».
// WASD ведут героиню по кухне (обходит мебель, скользит вдоль неё), пробел открывает станцию рядом,
// у станций с удержанием (гирлянда, звезда, радио) пробел — это удержание.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, run } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { CLAYOUT } from '../src/campaign/layout.js';

const S = CLAYOUT.stations;
const place = (s, p) => Object.assign(s.heroine, { x: p.x, z: p.z, station: null, target: null, path: [] });
const dist = (s, p) => Math.hypot(s.heroine.x - p.x, s.heroine.z - p.z);

test('W ведёт героиню вглубь кухни (−z) со скоростью ходьбы, отпустил — стоит', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  place(s, { x: 0.3, z: -0.6 });
  s.setMoveInput(0, -1);
  run(s, 0.2);
  assert.ok(Math.abs(s.heroine.z - (-0.6 - CAMPAIGN.walkSpeed * 0.2)) < 0.02, `z=${s.heroine.z}`);
  assert.ok(Math.abs(s.heroine.x - 0.3) < 1e-9);
  assert.equal(s.heroine.moving, true);
  assert.ok(Math.abs(s.heroine.facing - Math.PI) < 1e-6, 'смотрит туда, куда идёт');
  s.setMoveInput(0, 0);
  const z = s.heroine.z;
  run(s, 0.3);
  assert.equal(s.heroine.z, z);
  assert.equal(s.heroine.moving, false);
});

test('в мебель не заходит, а скользит вдоль неё; из кухни не выходит', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  place(s, { x: 0.3, z: -0.6 });
  s.setMoveInput(0, 1); // к острову
  run(s, 2);
  assert.ok(s.nav.isFree(s.heroine.x, s.heroine.z));
  assert.ok(s.heroine.z < 0.1, `в остров не вошла: z=${s.heroine.z}`);
  s.setMoveInput(1, 1); // по диагонали в остров — едет вдоль него вправо
  const x0 = s.heroine.x;
  run(s, 0.5);
  assert.ok(s.heroine.x > x0 + 0.3, `скользит вдоль: x ${x0} → ${s.heroine.x}`);
  assert.ok(s.nav.isFree(s.heroine.x, s.heroine.z));
  s.setMoveInput(1, 0);
  run(s, 6);
  assert.ok(s.heroine.x <= CLAYOUT.bounds.maxX + s.nav.cell / 2, `стена кухни держит: x=${s.heroine.x}`);
  s.setMoveInput(0, 1); // к камере — до края кадра, не дальше
  run(s, 4);
  assert.ok(s.heroine.z <= CAMPAIGN.keys.frontZ && s.heroine.z > CAMPAIGN.keys.frontZ - 0.1, `z=${s.heroine.z}`);
});

test('шаг клавишей уводит со станции без крупного плана и перебивает ходьбу по клику', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'fridge');
  s.setMoveInput(-1, 0);
  run(s, 0.1);
  assert.equal(s.panel, null);
  assert.equal(s.heroine.station, null);
  s.setMoveInput(0, 0);
  s.goTo('board');
  run(s, 0.1);
  assert.ok(s.heroine.target);
  s.setMoveInput(0, 1);
  run(s, 0.1);
  assert.equal(s.heroine.target, null, 'клавиши главнее клика');
});

test('в крупном плане WASD не уводит от работы', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  const { x, z } = s.heroine;
  s.setMoveInput(0, -1);
  run(s, 0.5);
  assert.equal(s.panel, 'board');
  assert.deepEqual([s.heroine.x, s.heroine.z], [x, z]);
});

test('пробел открывает станцию в пределах руки и называет её заранее; далеко — подсказка', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  place(s, { x: S.sink.stand.x + 0.3, z: S.sink.stand.z + 0.4 });
  assert.equal(s.nearStation(), 'sink');
  assert.ok(s.interact());
  run(s, 1);
  assert.equal(s.panel, 'sink');
  s.closePanel();
  place(s, { x: 2.6, z: -0.5 }); // между холодильником и островом — до всех станций дальше руки
  const far = Object.entries(S).filter(([, st]) => dist(s, st.stand) <= CAMPAIGN.keys.reach);
  assert.deepEqual(far, [], 'точка проверки далеко от всех станций');
  assert.equal(s.nearStation(), null);
  assert.equal(s.interact(), false);
  assert.ok(s.hint?.text);
});

test('пробел выбирает ближайшую из соседних станций и не открывает недоступную', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  place(s, { x: S.stove.stand.x - 0.1, z: S.stove.stand.z });
  assert.equal(s.nearStation(), 'stove'); // духовка рядом, но плита ближе
  place(s, { x: S.bag.stand.x, z: S.bag.stand.z });
  assert.notEqual(s.nearStation(), 'bag', 'пакета ещё нет');
});

test('у гирлянды пробел — это удержание: держишь — чинится, отпустил — прогресс остался', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.garland.broken = true;
  arrive(s, 'garland');
  assert.equal(s.holdKind(), 'garland');
  assert.ok(s.interact());
  run(s, CAMPAIGN.durations.garlandHold / 2);
  s.interactUp();
  const p = s.garland.progress;
  assert.ok(p > 0 && s.garland.broken);
  run(s, 0.5);
  assert.equal(s.garland.progress, p);
  s.interact();
  run(s, CAMPAIGN.durations.garlandHold);
  assert.equal(s.garland.broken, false);
});

test('у ёлки пробел держит звезду, когда она погасла', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.star.broken = true;
  arrive(s, 'tree');
  assert.equal(s.holdKind(), 'star');
  s.interact();
  run(s, CAMPAIGN.durations.starHold + 0.2);
  assert.equal(s.star.broken, false);
});
