// 0.11: «очки домохозяйки» (склонение) и кухонные минуты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pts, pluralRu, kitchenMin } from '../src/campaign/words.js';

test('очки домохозяйки склоняются: 1 очко, 2–4 очка, 5+ и 11–14 очков', () => {
  const cases = { 0: 'очков', 1: 'очко', 2: 'очка', 4: 'очка', 5: 'очков', 11: 'очков', 12: 'очков', 14: 'очков', 21: 'очко', 22: 'очка', 25: 'очков', 101: 'очко', 111: 'очков' };
  for (const [n, w] of Object.entries(cases)) assert.equal(pts(+n), `${n} ${w} домохозяйки`, n);
  assert.equal(pluralRu(3, ['а', 'б', 'в']), 'б');
});

test('кухонные минуты: 100 с игры при масштабе 15 — 25 мин; больше часа — «1 ч 15 мин»', () => {
  assert.equal(kitchenMin(100, 15), '25 мин');
  assert.equal(kitchenMin(40, 15), '10 мин');
  assert.equal(kitchenMin(300, 15), '1 ч 15 мин');
  assert.equal(kitchenMin(240, 15), '1 ч');
  assert.equal(kitchenMin(1, 15), 'меньше минуты');
});
