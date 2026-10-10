// 0.8: что из дня попадает в сохранение кампании. Испытания и практика кампанию не трогают,
// баллы недоигранного дня не утекают в сохранение при покупке декора.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySave } from '../src/campaign/save.js';
import { markInProgress, applyDecorPurchase } from '../src/campaign/persist.js';
import { KitchenSession } from '../src/campaign/session.js';
import { DECOR } from '../src/campaign/data.js';

test('обычный день записывает inProgress, испытание и практика — нет', () => {
  const s = emptySave();
  assert.equal(markInProgress(s, { dayId: 1 }), true);
  assert.equal(s.settings.inProgress, 1);

  const c = emptySave();
  assert.equal(markInProgress(c, { dayId: 1, challenge: true }), false);
  assert.equal(c.settings.inProgress, undefined, 'после перезагрузки испытание не превращается в обычный день');

  const p = emptySave();
  assert.equal(markInProgress(p, { dayId: 1, practice: true }), false);
  assert.equal(p.settings.inProgress, undefined);
});

test('покупка декора списывает цену с СОХРАНЁННЫХ баллов, а не берёт баллы сессии', () => {
  const s = emptySave();
  s.bonus = 100;
  // в этом дне игрок успел заработать 40 (они есть только в сессии), купил декор за price
  const price = DECOR.lights.price;
  assert.equal(applyDecorPurchase(s, { id: 'lights' }), true);
  assert.equal(s.bonus, 100 - price, 'заработанные в недоигранном дне баллы в сохранение не попали');
  assert.deepEqual(s.decor, ['lights']);
  // повторная покупка того же — ничего не меняет
  assert.equal(applyDecorPurchase(s, { id: 'lights' }), false);
  assert.equal(s.bonus, 100 - price);
});

test('баллы не уходят в минус и неизвестный декор игнорируется', () => {
  const s = emptySave();
  s.bonus = 5;
  assert.equal(applyDecorPurchase(s, { id: 'lights' }), true);
  assert.equal(s.bonus, 0);
  assert.equal(applyDecorPurchase(s, { id: 'нет-такого' }), false);
});

test('покупка в испытании и в практике не меняет кампанию', () => {
  for (const mode of [{ challenge: true }, { practice: true }]) {
    const s = emptySave();
    s.bonus = 100;
    assert.equal(applyDecorPurchase(s, { id: 'wreath', ...mode }), false);
    assert.equal(s.bonus, 100);
    assert.deepEqual(s.decor, []);
  }
});

test('сессия-испытание: декор не купить, баллы не копятся, платить баллами нечем', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, challenge: true, bonus: 0 });
  assert.equal(s.challenge, true);
  s.bonus.points = 999; // как будто успел накопить — всё равно нельзя
  assert.equal(s.buyDecor('wreath'), false);
  assert.equal(s.bonus.points, 999);
  assert.deepEqual(s.decor, []);
  assert.equal(s._earn(50, 'тест'), 0, 'в испытании баллы не начисляются');
});

test('обычная сессия: покупка декора и баллы работают как раньше', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: 100 });
  assert.equal(s.challenge, false);
  assert.equal(s.buyDecor('wreath'), true);
  assert.equal(s.bonus.points, 100 - DECOR.wreath.price);
  assert.ok(s._earn(10, 'тест') > 0);
});
