// 0.8: после блюда — два конкретных наблюдения о нарезке по фактическим кускам, а не общая фраза.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceStats, pickObservations } from '../src/campaign/observations.js';
import { KitchenSession, arrive, cutCubes } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';

const TOL = CAMPAIGN.tolerance;
const cube = (e, extra = {}) => ({ area: e * e, elong: 1, edge: false, ...extra });
const many = (n, e, extra) => Array.from({ length: n }, () => cube(e, extra));

test('статистика кусков: средний размер, доли крупных, мелких и «палочек»', () => {
  const st = pieceStats([...many(6, 1), ...many(2, 2), cube(0.2)], 1, TOL);
  assert.equal(st.n, 8, 'крошка меньше четверти кубика не считается');
  assert.ok(Math.abs(st.mean - 1.25) < 1e-9);
  assert.ok(st.bigShare > 0.4 && st.bigShare < 0.7, `доля крупных по площади: ${st.bigShare}`);
  assert.equal(st.longShare, 0);
  const sticks = pieceStats([...many(5, 1), { area: 1, elong: 3.2, edge: false }, { area: 1, elong: 3.2, edge: false }], 1, TOL);
  assert.ok(sticks.longShare > 0.25);
});

test('краевые обрезки не портят статистику', () => {
  const st = pieceStats([...many(10, 1), cube(0.5, { edge: true })], 1, TOL);
  assert.equal(st.n, 10);
  assert.ok(st.smallShare === 0);
});

test('крупные куски — конкретное замечание с числами', () => {
  const entries = [{ product: 'pickle', size: 1, stats: pieceStats(many(10, 1.7), 1, TOL) }];
  const [o] = pickObservations(entries);
  assert.match(o, /Огурец солёный/);
  assert.match(o, /1,7 см/, 'в среднем 1,7 см (запятая)');
  assert.match(o, /крупн/i);
});

test('«палочки» и мелочь называются своими словами', () => {
  const sticks = pieceStats([...many(4, 1), ...Array.from({ length: 6 }, () => ({ area: 1, elong: 3, edge: false }))], 1, TOL);
  assert.match(pickObservations([{ product: 'sausage', size: 1, stats: sticks }])[0], /палочек/);
  const tiny = pieceStats(many(20, 0.5), 1, TOL);
  assert.match(pickObservations([{ product: 'carrot', size: 1, stats: tiny }])[0], /мелковато/);
});

test('ровная нарезка — похвала, а не придирка; проблем нет — не выдумываем замечаний', () => {
  const entries = [
    { product: 'carrot', size: 1, stats: pieceStats(many(12, 1), 1, TOL) },
    { product: 'sausage', size: 1, stats: pieceStats(many(12, 1.02), 1, TOL) },
  ];
  const obs = pickObservations(entries);
  assert.equal(obs.length, 2);
  assert.ok(obs.every((o) => /ровн|как по линейке/i.test(o)), obs.join(' | '));
});

test('самое важное — первым: сначала проблемный продукт, потом лучший', () => {
  const entries = [
    { product: 'carrot', size: 1, stats: pieceStats(many(12, 1), 1, TOL) },
    { product: 'pickle', size: 1, stats: pieceStats(many(10, 1.8), 1, TOL) },
    { product: 'sausage', size: 1, stats: pieceStats(many(12, 1), 1, TOL) },
  ];
  const obs = pickObservations(entries);
  assert.equal(obs.length, 2);
  assert.match(obs[0], /Огурец солёный/);
  assert.doesNotMatch(obs[1], /Огурец/);
});

test('нет данных — пустой список (запасной вариант — общая фраза)', () => {
  assert.deepEqual(pickObservations([]), []);
  assert.deepEqual(pickObservations([{ product: 'carrot', size: 1, stats: null }]), []);
});

test('при переносе с доски в шаге сохраняется статистика кусков, а в итоге блюда — наблюдение с числом', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  cutCubes(s);
  assert.ok(s.boardTransfer());
  const rec = s.dishes.olivier.steps.sausage;
  assert.ok(rec.info.stats, 'статистика сохранена');
  assert.ok(Math.abs(rec.info.stats.mean - 1) < 0.25, `кубики около 1 см: ${rec.info.stats.mean}`);
  assert.equal(rec.info.stats.size, 1);

  // остальные нарезки — условно «крупные»: огурцы 1,9 см
  const d = s.dishes.olivier;
  for (const st of ['carrot', 'pickle', 'egg', 'potato']) {
    d.steps[st].done = true;
    d.steps[st].q = 0.9;
    d.steps[st].info = { stats: pieceStats(many(10, st === 'pickle' ? 1.9 : 1), 1, TOL) };
  }
  s._bowlFinish('olivier');
  // _finishDish не доводит блюдо до конца без вкуса; заметки формируются в _bowlFinish → смотрим их напрямую
  const notes = d.notes ?? [];
  assert.ok(notes.some((n) => /Огурец солёный.*1,9 см/.test(n)), notes.join(' | '));
});
