// 0.8: порядок работы в дне 1 свободный — игра принимает несколько разумных последовательностей, а не одну цепочку.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, run, arrive, waitAction, cutCubes, stir, seasonTo, tasteDone, peel } from './helpers-campaign.js';

const guard = (s) => { if (s.cat.state === 'theft') s.shoo(); };

function pots(s) {
  arrive(s, 'stove');
  assert.ok(s.placePot(), s.hint?.text); // картофель
  waitAction(s);
  assert.ok(s.placePot(), s.hint?.text); // яйца
  waitAction(s);
}
function cut(s, key) {
  arrive(s, 'board');
  assert.ok(s.boardSelect(key), `${key}: ${s.hint?.text}`);
  cutCubes(s);
  guard(s);
  assert.ok(s.boardTransfer(), `${key}: ${s.hint?.text}`);
}
function ready(s, i) {
  run(s, Math.max(0, s.burners[i].readyAt - s.t + 0.5));
  if (s.burners[i].overflow) { arrive(s, 'stove'); s.reduceHeat(i); waitAction(s); }
}
function takeAndCool(s, i, product) {
  arrive(s, 'stove');
  assert.ok(s.takePot(i), s.hint?.text);
  waitAction(s);
  arrive(s, 'sink');
  assert.ok(s.coolProduct(product), s.hint?.text);
  waitAction(s);
}
function peelThenCut(s, peelKey) {
  arrive(s, 'board');
  assert.ok(s.boardSelect(peelKey), `${peelKey}: ${s.hint?.text}`);
  peel(s);
  cutCubes(s);
  guard(s);
  assert.ok(s.boardTransfer(), s.hint?.text);
}
function add(s, product) {
  arrive(s, 'bowl');
  assert.ok(s.bowlAdd('olivier', product), `${product}: ${s.hint?.text}`);
  waitAction(s);
}
function finishSalad(s) {
  arrive(s, 'bowl');
  seasonTo(s, 'olivier');
  stir(s);
  tasteDone(s, 'olivier');
  assert.ok(s.dishes.olivier.done, 'салат готов');
  assert.ok(s.dishes.olivier.Q >= 60, `оценка ${s.dishes.olivier.Q}`);
}
const fresh = () => new KitchenSession({ dayIndex: 0, seed: 3 });

test('порядок А: кастрюли → овощи, пока варятся → яйца → картофель → заправка', () => {
  const s = fresh();
  pots(s);
  for (const k of ['olivier:carrot', 'olivier:sausage', 'olivier:pickle']) cut(s, k);
  ready(s, 1);
  takeAndCool(s, 1, 'egg');
  peelThenCut(s, 'olivier:peelEgg');
  ready(s, 0);
  takeAndCool(s, 0, 'potato');
  peelThenCut(s, 'olivier:peelPotato');
  add(s, 'peas');
  add(s, 'mayo');
  finishSalad(s);
});

test('порядок Б: сначала вся сырая нарезка, потом кастрюли', () => {
  const s = fresh();
  for (const k of ['olivier:carrot', 'olivier:sausage', 'olivier:pickle']) cut(s, k);
  pots(s);
  ready(s, 1);
  takeAndCool(s, 1, 'egg');
  peelThenCut(s, 'olivier:peelEgg');
  ready(s, 0);
  takeAndCool(s, 0, 'potato');
  peelThenCut(s, 'olivier:peelPotato');
  add(s, 'peas');
  add(s, 'mayo');
  finishSalad(s);
});

test('порядок В: горошек и майонез в миску заранее, потом кастрюли и нарезка', () => {
  const s = fresh();
  add(s, 'peas');
  add(s, 'mayo');
  pots(s);
  for (const k of ['olivier:pickle', 'olivier:sausage', 'olivier:carrot']) cut(s, k);
  ready(s, 1);
  takeAndCool(s, 1, 'egg');
  peelThenCut(s, 'olivier:peelEgg');
  ready(s, 0);
  takeAndCool(s, 0, 'potato');
  peelThenCut(s, 'olivier:peelPotato');
  finishSalad(s);
});
