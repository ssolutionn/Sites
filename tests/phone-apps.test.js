// Приложения телефона: бонусы, оплата баллами, декор, фото блюда, кухонные таймеры, сохранение.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, run } from './helpers-campaign.js';
import { BONUS, DECOR } from '../src/campaign/data.js';
import { parseSave, emptySave } from '../src/campaign/save.js';

test('заказ доставки начисляет кешбэк баллами', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  s.draftSet('corn', 1);
  assert.ok(s.confirmOrder('standard'));
  const total = s.wallet.spent;
  assert.equal(s.bonus.points, Math.round(total * BONUS.cashback));
});

test('баллами можно оплатить не больше половины заказа', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1, bonus: 1000 });
  s.draftSet('corn', 1);
  const cost = s.orderCost(s.delivery.draft, 'standard').total;
  s.setUsePoints(true);
  assert.ok(s.confirmOrder('standard'));
  const paid = Math.floor(cost * BONUS.payShare);
  assert.equal(s.wallet.spent, cost - paid);
  assert.equal(s.bonus.points, 1000 - paid + Math.round((cost - paid) * BONUS.cashback));
});

test('декор покупается за баллы один раз, без баллов — подсказка', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: DECOR.snowman.price });
  assert.ok(s.buyDecor('snowman'));
  assert.deepEqual(s.decor, ['snowman']);
  assert.equal(s.bonus.points, 0);
  assert.equal(s.buyDecor('snowman'), false);
  assert.equal(s.buyDecor('wreath'), false);
  assert.match(s.hint.text, /баллов/);
});

test('готовое блюдо даёт баллы, его фото — ещё баллы и лайки', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s._finishDish('olivier', { prep: 90, comp: 100, asm: 100 }, []);
  const afterDish = s.bonus.points;
  assert.ok(afterDish > 0);
  assert.ok(s.postPhoto('olivier'));
  assert.equal(s.postPhoto('olivier'), false, 'одно фото на блюдо');
  assert.equal(s.bonus.points, afterDish + BONUS.perPhoto);
  const p = s.phone.posts[0];
  assert.equal(s.postLikes(p), 0);
  run(s, 61);
  assert.ok(s.postLikes(p) > 50);
});

test('кухонный таймер срабатывает уведомлением', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  assert.ok(s.setKitchenTimer(60));
  run(s, 59);
  assert.ok(!s.alerts.some((a) => a.key === 'timer'));
  run(s, 2);
  assert.ok(s.alerts.some((a) => a.key === 'timer'));
});

test('сохранение помнит баллы и декор, мусор отбрасывает', () => {
  const sv = emptySave();
  sv.bonus = 42;
  sv.decor = ['wreath', 7, null];
  const { save } = parseSave(JSON.stringify(sv));
  assert.equal(save.bonus, 42);
  assert.deepEqual(save.decor, ['wreath']);
  assert.equal(parseSave(JSON.stringify({ ...emptySave(), bonus: -5 })).save.bonus, 0);
});
