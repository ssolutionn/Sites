// 0.10, владелец: «продумать механику открытия подарков». Подарок открывают руками в три движения:
// развязать бант (зажать и потянуть), сорвать бумагу (тереть по коробке), снять крышку (сдвинуть). Отпустила
// посреди или ушла (Esc) — прогресс остаётся. Приз прежний: закреплён за днём и номером подарка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, unwrapGift } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { giftPrize } from '../src/campaign/st-tree.js';

const G = CAMPAIGN.gift;
const atTree = (opts = {}) => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: 0, ...opts });
  arrive(s, 'tree');
  s.drain();
  return s;
};
const pull = (s, len, steps = 8) => {
  s.pointer('down', 0, 0);
  for (let k = 1; k <= steps; k++) s.pointer('move', (len * k) / steps, 0);
  s.pointer('up', len, 0);
};

test('эталон: бант → бумага → крышка, приз как у подарка дня, подарок открыт', () => {
  const s = atTree();
  assert.ok(unwrapGift(s, 1));
  const prize = giftPrize(1, 1);
  const e = s.drain().find((x) => x.type === 'giftOpened');
  assert.deepEqual(e.prize, prize);
  assert.deepEqual(s.giftsLeft(), [0, 2]);
  assert.equal(s.gift, null);
});

test('бант: потянуть ровно на норму — развязан; на 10 % меньше — ещё нет', () => {
  const s = atTree();
  s.startGift(0);
  pull(s, G.bowPull * 0.9);
  assert.equal(s.gift.stage, 'bow');
  const s2 = atTree();
  s2.startGift(0);
  pull(s2, G.bowPull + 1e-6);
  assert.equal(s2.gift.stage, 'paper');
});

test('мимо банта — подсказка, ничего не тратится', () => {
  const s = atTree();
  s.startGift(0);
  const r = s.pointer('down', G.box * 0.9, G.box * 0.9);
  assert.equal(r, 'bow-miss');
  assert.match(s.hint.text, /бант/i);
  assert.equal(s.gift.bow, 0);
});

test('бумага: трение мимо коробки не в счёт; отпустила посреди — прогресс остался', () => {
  const s = atTree();
  s.startGift(0);
  pull(s, G.bowPull * 1.2);
  s.pointer('down', G.box * 3, 0);
  for (let k = 0; k < 20; k++) s.pointer('move', G.box * 3 + (k % 2) * 0.08, 0);
  s.pointer('up', 0, 0);
  assert.equal(s.gift.tear.done, 0);
  s.pointer('down', -0.06, 0);
  for (let k = 0; k < 4; k++) s.pointer('move', k % 2 ? 0.06 : -0.06, 0);
  s.pointer('up', 0, 0);
  const p = s.gift.tear.progress;
  assert.ok(p > 0 && p < 1, `p=${p}`);
  s.pointer('move', 0.06, 0); // без нажатия — не трём
  assert.equal(s.gift.tear.progress, p);
});

test('крышка: сдвинуть на норму — открыто; на 10 % меньше — нет', () => {
  const s = atTree();
  s.startGift(0);
  pull(s, G.bowPull * 1.2);
  s.gift.tear.done = s.gift.tear.need;
  s.pointer('down', 0, 0);
  s.pointer('move', 0, 0);
  s.pointer('up', 0, 0); // бумага добрана — следующая стадия
  assert.equal(s.gift.stage, 'lid');
  s.pointer('down', 0.02, 0);
  s.pointer('move', 0.02 + G.lidSlide * 0.9, 0);
  s.pointer('up', 0.02 + G.lidSlide * 0.9, 0);
  assert.ok(s.gift, 'ещё не открыт');
  s.pointer('down', 0.02 + G.lidSlide * 0.9, 0);
  s.pointer('move', 0.02 + G.lidSlide * 1.01, 0);
  assert.equal(s.gift, null);
});

test('Esc посреди — подарок отложен под ёлку, станция ёлки остаётся; вернулась — с того же места', () => {
  const s = atTree();
  s.startGift(2);
  pull(s, G.bowPull * 1.2);
  s.closePanel();
  assert.equal(s.panel, 'tree');
  assert.equal(s.gift, null);
  assert.ok(s.startGift(2));
  assert.equal(s.gift.stage, 'paper');
  s.closePanel();
  s.closePanel();
  assert.equal(s.panel, null);
});

test('пока подарок в руках, ёлку не трогаем: повесить игрушку нельзя', () => {
  const s = atTree({ toys: [{ id: 'ballRed', at: null }] });
  s.startGift(0);
  assert.equal(s.pickToy(1), false);
  assert.equal(s.treeClick({ x: 0, y: 0.5, z: 0.5 }), false);
});
