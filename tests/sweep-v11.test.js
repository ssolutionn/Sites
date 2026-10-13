// 0.11 G2.4: перенос нарезки смахом ножа плашмя вместо кнопки «В миску».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweepVerdict, sweepTarget } from '../src/campaign/sweep.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { BOARD_UNIT } from '../src/campaign/st-board.js';
import { KitchenSession, arrive, cutCubes, waitAction, take } from './helpers-campaign.js';

const R = { ...CAMPAIGN.board.sweep };
const at = (len, deg) => ({ x: Math.cos((deg * Math.PI) / 180) * len, z: Math.sin((deg * Math.PI) / 180) * len });
const O = { x: 0, z: 0 };

test('смах: эталон — 25 см вправо — засчитан', () => {
  assert.equal(sweepVerdict(O, at(0.25, 0), R).ok, true);
});

test('смах: ровно минимальная длина и ровно предельный угол засчитаны', () => {
  assert.equal(sweepVerdict(O, at(R.minLen, 0), R).ok, true);
  assert.equal(sweepVerdict(O, at(0.3, R.maxAngle - 0.01), R).ok, true);
});

test('смах: граница + 10 % отклонена с правильной причиной', () => {
  const short = sweepVerdict(O, at(R.minLen * 0.9, 0), R);
  assert.deepEqual([short.ok, short.reason], [false, 'short']);
  const wrong = sweepVerdict(O, at(0.3, R.maxAngle * 1.1), R);
  assert.deepEqual([wrong.ok, wrong.reason], [false, 'wrong-way']);
  assert.equal(sweepVerdict(O, at(0.3, 180), R).reason, 'wrong-way', 'в обратную сторону — не туда');
});

test('смах: «мягкие жесты» — короче и шире в k раз', () => {
  assert.equal(sweepVerdict(O, at(R.minLen / 1.4, 0), R, 1.5).ok, true);
  assert.equal(sweepVerdict(O, at(0.3, R.maxAngle * 1.4), R, 1.5).ok, true);
  assert.equal(sweepVerdict(O, at(0.3, 100), R, 2).ok, false, 'потолок 80°');
});

test('смах: у поднос-назначения направление влево, у готового на доске — любое', () => {
  const tray = sweepTarget('pieces', R);
  assert.equal(sweepVerdict(O, at(0.3, 180), { ...R, dir: tray.dir }).ok, true);
  assert.equal(sweepVerdict(O, at(0.3, 0), { ...R, dir: tray.dir }).ok, false);
  const any = sweepTarget('prepared', R);
  assert.equal(any.dir, null);
  assert.equal(sweepVerdict(O, at(0.3, 133), { ...R, dir: any.dir }).ok, true);
});

function cutSausage() {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:sausage'), s.hint?.text);
  cutCubes(s);
  return s;
}
const swipe = (s, x0, z0, x1, z1, n = 6) => {
  s.pointer('down', x0 * BOARD_UNIT, z0 * BOARD_UNIT);
  for (let k = 1; k <= n; k++) s.pointer('move', (x0 + ((x1 - x0) * k) / n) * BOARD_UNIT, (z0 + ((z1 - z0) * k) / n) * BOARD_UNIT);
  return s.pointer('up', x1 * BOARD_UNIT, z1 * BOARD_UNIT);
};

test('нож плашмя: смах вправо ссыпает нарезку в миску, шаг выполнен, флаг снят', () => {
  const s = cutSausage();
  assert.ok(s.boardFlat(true), s.hint?.text);
  assert.equal(s.board.flat, true);
  assert.equal(swipe(s, -3, 0, 10, 0), 'sweep-done');
  waitAction(s);
  assert.ok(s.stepDone('olivier', 'sausage'), 'колбаса в миске');
  assert.equal(s.board.flat, false);
});

test('нож плашмя не режет: смах поперёк нарезки не добавляет разрезов', () => {
  const s = cutSausage();
  const it = s.boardCur();
  const cuts = it.cuts, n = it.pieces.length;
  s.boardFlat(true);
  swipe(s, 1, -4, 1, 4); // вертикально — не к миске
  assert.equal(it.cuts, cuts);
  assert.equal(it.pieces.length, n);
  assert.equal(s.stepDone('olivier', 'sausage'), false);
});

test('смах не туда или слишком короткий → подсказка и звук отказа, ничего не потрачено, нож плашмя остаётся', () => {
  const s = cutSausage();
  s.boardFlat(true);
  const seen = [];
  const emit = s._emit.bind(s);
  s._emit = (t, d) => (seen.push(t), emit(t, d));
  assert.equal(swipe(s, 3, 0, -6, 0), 'wrong-way');
  assert.match(s.hint.text, /вправо|миск/i);
  assert.equal(swipe(s, 0, 0, 4, 0), 'short');
  assert.ok(seen.includes('cutDenied'));
  assert.equal(s.board.flat, true, 'нож остался плашмя');
  assert.equal(s.stepDone('olivier', 'sausage'), false);
  assert.equal(swipe(s, -3, 0, 10, 0), 'sweep-done', 'и со второй попытки получилось');
});

test('до готовности нарезки нож плашмя не берётся: сначала сделай разрез', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  assert.equal(s.boardFlat(true), false);
  assert.match(s.hint.text, /разрез/i);
  assert.equal(s.board.flat, false);
});

test('ушла от доски — нож плашмя убран; сменила продукт — тоже', () => {
  const s = cutSausage();
  s.boardFlat(true);
  arrive(s, 'sink');
  assert.equal(s.board.flat, false);
});

test('курсор ушёл за окно посреди смаха (pointerUp) → ничего не перенесено', () => {
  const s = cutSausage();
  s.boardFlat(true);
  s.pointer('down', -3 * BOARD_UNIT, 0);
  s.pointer('move', 4 * BOARD_UNIT, 0);
  s.pointerUp();
  assert.equal(s.stepDone('olivier', 'sausage'), false);
  assert.equal(s.board.flat, true);
});

test('щелчок ножом плашмя на месте — не попытка смаха: без подсказки, без отказа и без звука «нельзя»', () => {
  const s = cutSausage();
  s.boardFlat(true);
  s.drain();
  const before = s.hint?.text;
  // main.js играет «нельзя» на 'short' и других отказах ножа — щелчок должен вернуть 'ignored'
  assert.equal(swipe(s, 0, 0, 0.3, 0, 2), 'ignored');
  assert.equal(s.drain().some((e) => e.type === 'cutDenied'), false);
  assert.equal(s.hint?.text, before);
  assert.equal(s.board.flat, true);
});
