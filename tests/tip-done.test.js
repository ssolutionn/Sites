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

test('советы 0.11 описывают жест, а не исчезнувшие кнопки: плита, звезда, радио, шуба', () => {
  assert.doesNotMatch(TIPS.stove, /Положить сюда/, 'кнопки «Положить сюда» в 0.11 нет');
  assert.match(TIPS.stove, /перетащи на конфорку/);
  assert.match(TIPS.stove, /унеси с конфорки/, 'снимают кастрюлю жестом');
  assert.doesNotMatch(TIPS.stove, /~25 с/, 'время закипания — в кухонных минутах');
  assert.doesNotMatch(TIPS.star, /Поправить звезду/, 'кнопки «Поправить звезду» в 0.11 нет');
  assert.match(TIPS.star, /зажми звезду/);
  assert.doesNotMatch(TIPS.radioTune, /◀|▶/, 'кнопок соседней станции у радио нет — только ручка и колёсико');
  assert.doesNotMatch(TIPS['tray:shuba'], /подтверди слой/, 'с 0.11 слой ложится сам, когда отпустила лопатку');
});
