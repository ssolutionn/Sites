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

import { tspText, tsp, gramsText } from '../src/campaign/words.js';
import { RECIPES, CAMPAIGN } from '../src/campaign/data.js';
import { LESSONS } from '../src/campaign/lessons.js';

test('чайные ложки: щепотка = ⅛, четыре щепотки — ½, девять — 1⅛', () => {
  const cases = { 0: '0', 1: '⅛', 2: '¼', 3: '⅜', 4: '½', 5: '⅝', 6: '¾', 7: '⅞', 8: '1', 9: '1⅛', 12: '1½', 16: '2' };
  for (const [n, w] of Object.entries(cases)) assert.equal(tspText(+n), w, String(n));
  assert.equal(tsp(4), '½ ч. л.');
  assert.equal(tspText(3, CAMPAIGN.season.pinchTsp), '⅜');
});

test('вес блюда: граммы до килограмма, дальше килограммы с запятой', () => {
  assert.equal(gramsText(250), '250 г');
  assert.equal(gramsText(1000), '1 кг');
  assert.equal(gramsText(1500), '1,5 кг');
  assert.equal(gramsText(1100), '1,1 кг');
});

test('у каждого блюда с солью задан вес, а в уроке соль и перец — в чайных ложках', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (!r.season) continue;
    assert.ok(r.grams >= 50 && r.grams % 50 === 0, `${id}: вес блюда кратен 50 г`);
    const salt = LESSONS[id].ingredients.find((i) => i.name?.startsWith('Соль'));
    assert.ok(salt && /ч\. л\./.test(salt.amount), `${id}: соль в ч. л. — ${salt?.amount}`);
    assert.ok(!/щепот/.test(JSON.stringify(LESSONS[id].ingredients)), `${id}: в ингредиентах нет щепоток`);
  }
});
