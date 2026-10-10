// 0.9, пункт 1 владельца: «если в миске что-то есть, оно должно мешаться» — даже когда добавлено не всё.
// Ложка мешает содержимое (видно в миске), а шаг «перемешать» засчитывается, только когда состав полный.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, stir } from './helpers-campaign.js';

function bowlWithPotato() {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s._bowlReceive('olivier', { product: 'potato', kind: 'pieces', pieces: Array.from({ length: 20 }, (_, i) => ({ id: i, w: 1, d: 1 })) });
  arrive(s, 'bowl');
  return s;
}

test('в миске только картофель — мешается, но шаг «перемешать» не засчитан', () => {
  const s = bowlWithPotato();
  s.drain();
  assert.equal(s.pointer('down', 0.1, 0), 'free');
  s.pointer('up', 0, 0);
  stir(s, 2);
  assert.ok(s.bowl.blend > 0.3, `перемешано на ${s.bowl.blend}`);
  assert.ok(s.drain().some((e) => e.type === 'stir' && e.free));
  assert.equal(s.stepDone('olivier', 'mix'), false);
  assert.match(s.hint.text, /ещё не всё/);
});

test('пустую миску не мешают', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'bowl');
  assert.equal(s.pointer('down', 0.1, 0), 'nothing');
  assert.equal(s.bowl.blend, 0);
});

test('новое добавленное ложится сверху: перемешанность падает', () => {
  const s = bowlWithPotato();
  stir(s, 4);
  const before = s.bowl.blend;
  s._bowlReceive('olivier', { product: 'carrot', kind: 'pieces', pieces: [] });
  assert.ok(s.bowl.blend < before);
});
