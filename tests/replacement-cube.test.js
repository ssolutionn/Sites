// 0.9: кот утащил уже нарезанный кубик — замена приходит тем же кубиком. Дорезать её нельзя (слишком мала),
// значит, и требовать нельзя: раньше «Замену нужно дорезать» навсегда блокировало «В миску» (нашла симуляция темпа).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, cutCubes, waitAction } from './helpers-campaign.js';

test('замена кубика размером с кубик — дорезать не нужно, можно в миску', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  cutCubes(s);
  const it = s.boardCur();
  s._stealFromBoard('sausage');
  assert.equal(it.missing.length, 1);
  assert.ok(s.takeReplacement());
  waitAction(s);
  assert.equal(it.missing.length, 0);
  assert.equal(s.transferBlock(), null);
});

test('крупную замену (целый брусок) всё ещё нужно дорезать', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  const it = s.boardCur();
  s._stealFromBoard('sausage'); // нарезки нет — уносит весь брусок
  assert.ok(s.takeReplacement());
  waitAction(s);
  assert.match(s.transferBlock() ?? '', /разрез|дорезать/);
});
