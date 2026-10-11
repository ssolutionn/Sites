import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, cutCubes } from './helpers-campaign.js';
import { URGENT } from '../src/campaign/session.js';

test('переделка освобождает незавершённые резервы, но не возвращает съеденные продукты', () => {
  const s = new KitchenSession({ dayIndex: 3 });
  s.triggers = [];
  arrive(s, 'board');
  const stock = s.inventory.count('cheese');
  assert.ok(s.boardSelect('tomatoes:cheese'));
  assert.ok(s.inventory.reservedOf('cheese'));
  s.redoFilling('tomatoes');
  assert.equal(s.inventory.reservedOf('cheese'), 0);
  assert.equal(s.inventory.count('cheese'), stock);
  assert.ok(s.boardSelect('tomatoes:cheese'));
  s.inventory.consume(s._opId('tomatoes', 'cheese'));
  s.redoFilling('tomatoes');
  assert.equal(s.inventory.count('cheese'), stock - 1);
});

test('новая начинка требует новой соли, смешивания и пробы; пожелание гостей сохраняется', () => {
  const s = new KitchenSession({ dayIndex: 3 });
  const d = s.dishes.tomatoes;
  d.season.target.salt = 3;
  Object.assign(d.season, { salt: 3, pepper: 1, tastes: 2, last: 'good', unmixed: 1 });
  d.mayo = 'light';
  for (const id of ['cheese', 'onion', 'mayo', 'season', 'mix', 'taste']) d.steps[id] = { done: true, q: 1 };
  s.redoFilling('tomatoes');
  for (const id of ['season', 'mix', 'taste']) assert.equal(d.steps[id].done, false, id);
  assert.equal(d.season.salt, 0);
  assert.equal(d.season.pepper, 0);
  assert.equal(d.season.tastes, 0);
  assert.equal(d.season.target.salt, 3);
  assert.equal(d.mayo, null);
  assert.equal(s.stepState('tomatoes', 'mix'), 'locked');
});

test('грязную доску нельзя обойти переключением, автоподбором или старым вводом ножа', () => {
  const s = new KitchenSession({ dayIndex: 4 });
  s.triggers = [];
  arrive(s, 'board');
  assert.ok(s.boardSelect('shuba:onion'));
  assert.ok(s.boardSelect('shuba:herring'));
  cutCubes(s);
  assert.ok(s.boardTransfer());
  assert.equal(s.equipment.board.clean, false);
  assert.equal(s.board.current, null);
  assert.equal(s.boardSelect('shuba:onion'), false);
  s.board.current = 'shuba:onion';
  assert.equal(s.pointer('down', 0, 0), 'blocked');
  s.pointer('up', 0, 0);
  assert.equal(s.boardCur().cuts, 0);
});

test('курьер предупреждает об опасности на каждой из четырёх конфорок', () => {
  for (const key of ['pot', 'pot2', 'pot3', 'pot4']) {
    const s = new KitchenSession();
    s.delivery.order = { status: 'arrived', items: {} };
    s.alerts = [{ key }];
    assert.equal(s.collectOrder(), 'warn', key);
    assert.ok(URGENT.has(key), key);
  }
});

test('салаты у миски не появляются в списке блюд для подноса', () => {
  assert.deepEqual(new KitchenSession({ dayIndex: 0 }).trayDishes(), []);
  assert.deepEqual(new KitchenSession({ dayIndex: 1 }).trayDishes(), []);
  assert.deepEqual(new KitchenSession({ dayIndex: 2 }).trayDishes(), ['sandwiches', 'eggs']);
});

test('замечание об икре соответствует заказанной порции и замечает недостачу', () => {
  for (const [want, actual, expected] of [[3, 3, 'Икры в меру'], [2, 3, 'слишком много икры'], [3, 2, 'икры маловато']]) {
    const s = new KitchenSession({ dayIndex: 2 });
    s.requests = [];
    arrive(s, 'tray');
    assert.ok(s.traySelect('sandwiches'));
    const d = s.dishes.sandwiches;
    d.wantDoses = want;
    for (const step of Object.values(d.steps)) Object.assign(step, { done: true, q: 1 });
    for (const bread of d.work.breads) bread.doses = actual;
    assert.ok(s.confirmDish('sandwiches'));
    assert.ok(d.notes.some((note) => note.includes(expected)), d.notes.join('; '));
  }
});

test('незавершённый день не позволяет купить постоянную игрушку за несохранённые награды', () => {
  const s = new KitchenSession({ bonus: 0 });
  s._earn(100, 'Блюдо');
  assert.equal(s.buyToy('ballGold'), false);
  assert.equal(s.buyDecor('snowman'), false);
  assert.equal(s.toys.length, 0);
  // Подарки сохраняются сразу, их баллами можно расплатиться в этот же день.
  s._earn(100, 'Подарок под ёлкой', { banked: true });
  assert.ok(s.buyToy('ballGold'));
  assert.ok(s.buyDecor('snowman'));
  assert.ok(s.bonus.banked >= 0);
});

test('переделка выбрасывает старую начинку из помидоров, но сохраняет очищенные оболочки', () => {
  const s = new KitchenSession({ dayIndex: 3 });
  s.triggers = [];
  arrive(s, 'tray');
  assert.ok(s.traySelect('tomatoes'));
  const d = s.dishes.tomatoes;
  for (const t of d.work.toms) Object.assign(t, { cap: false, core: 0, fill: 1, garnish: true });
  for (const step of Object.values(d.steps)) Object.assign(step, { done: true, q: 1 });
  s.spoon = { load: 0.5, dish: 'tomatoes' };
  assert.ok(s.redoFilling('tomatoes'));
  assert.equal(d.steps.prep.done, true);
  assert.equal(d.steps.fill.done, false);
  assert.equal(d.steps.garnish.done, false);
  assert.ok(d.work.toms.every((t) => !t.cap && t.core === 0 && t.fill === 0 && !t.garnish));
  assert.equal(s.spoon.load, 0);
});

test('переделка шубы очищает старые слои и текущую лопатку', () => {
  const s = new KitchenSession({ dayIndex: 4 });
  s.triggers = [];
  arrive(s, 'tray');
  s.traySelect('shuba');
  const d = s.dishes.shuba;
  d.work.layers.push({ comp: 'herring' });
  d.work.current = { comp: 'mayo', placed: true };
  d.steps.layers.done = true;
  s.redoFilling('shuba');
  assert.equal(d.steps.layers.done, false);
  assert.deepEqual(d.work.layers, []);
  assert.equal(d.work.current, null);
});

test('заказ сначала тратит награды текущего дня, не запирая сохранённые баллы для игрушки', () => {
  const s = new KitchenSession({ dayIndex: 1, bonus: 35 });
  s._earn(100, 'Блюдо');
  s.draftSet('corn', 1);
  s.setUsePoints(true);
  const paid = s.pointsFor(s.orderCost(s.delivery.draft, 'standard').total);
  assert.ok(paid <= 100);
  assert.ok(s.confirmOrder('standard'));
  assert.equal(s.bonus.banked, 35);
  assert.ok(s.buyToy('ballGold'));
  assert.equal(s.bonus.banked, 0);
});
