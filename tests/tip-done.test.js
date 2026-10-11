// 0.10, владелец: «подсказку про Q не нужно закрывать — она должна закрываться автоматом». Каждая подсказка знает,
// после какого действия игрока она больше не нужна.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIPS } from '../src/ui/campaign-ui.js';
import { TIP_DONE, tipClosedBy } from '../src/ui/tip-done.js';

test('у каждой подсказки есть действие, которое её закрывает', () => {
  const missing = Object.keys(TIPS).filter((t) => !TIP_DONE[t]?.length);
  assert.deepEqual(missing, []);
  const extra = Object.keys(TIP_DONE).filter((t) => !TIPS[t]);
  assert.deepEqual(extra, [], 'нет правил для несуществующих подсказок');
});

test('подсказка про пожелание закрывается, когда открыли рецепт (Q или 📖), и только тогда', () => {
  assert.equal(tipClosedBy('wish', 'recipeOpened'), true);
  assert.equal(tipClosedBy('wish', 'cut'), false);
  assert.equal(tipClosedBy('cube', 'cut'), true);
  assert.equal(tipClosedBy('gifts', 'giftOpened'), true);
  assert.equal(tipClosedBy('нет-такой', 'cut'), false);
});
