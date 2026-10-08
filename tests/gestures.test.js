// Жесты «как в жизни»: росчерк ножа, разрез по линии, встряхивание, выдавливание.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stroke, classifyCut, CUT_RULES, ShakeTracker, PourTracker } from '../src/campaign/gestures.js';
import { initialBatch, cutLine, totalVolume, transposePieces, chordAt, initialPieces } from '../src/game/cutting.js';
import { KitchenSession, arrive, cutCubes, knife, run } from './helpers-campaign.js';

// Росчерк по точкам; dx/dz — смещение каждой точки (дрожание руки).
function strokeOf(points) {
  const s = new Stroke();
  points.forEach(([x, z], i) => s.add(x, z, i * 0.02));
  return s;
}
function line(x0, z0, x1, z1, n = 10, jitter = () => [0, 0]) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const [jx, jz] = jitter(i);
    pts.push([x0 + ((x1 - x0) * i) / n + jx, z0 + ((z1 - z0) * i) / n + jz]);
  }
  return strokeOf(pts);
}

test('росчерк сверху вниз — разрез поперёк X в средней точке', () => {
  const r = classifyCut(line(0.5, -3, 0.5, 3));
  assert.equal(r.ok, true);
  assert.equal(r.axis, 'x');
  assert.ok(Math.abs(r.pos - 0.5) < 1e-9);
  assert.equal(r.from, -3);
  assert.equal(r.to, 3);
});

test('росчерк слева направо — разрез вдоль, по Z', () => {
  const r = classifyCut(line(-3, 0.25, 3, 0.25));
  assert.equal(r.ok, true);
  assert.equal(r.axis, 'z');
  assert.ok(Math.abs(r.pos - 0.25) < 1e-9);
});

test('небольшой наклон прощается, сильный — нет', () => {
  const ok = classifyCut(line(0, -3, 1.5, 3)); // ~14°
  assert.equal(ok.ok, true);
  assert.equal(ok.axis, 'x');
  const bad = classifyCut(line(-3, -3, 3, 3)); // 45°
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'diagonal');
});

test('клик без движения и короткий росчерк — подсказка «через весь продукт»', () => {
  assert.equal(classifyCut(strokeOf([[0, 0]])).reason, 'short');
  assert.equal(classifyCut(line(0, 0, 0, CUT_RULES.minLength / 2)).reason, 'short');
});

test('дрожащая рука: зигзаг поперёк линии — отказ wobbly', () => {
  const r = classifyCut(line(0, -3, 0, 3, 12, (i) => [i % 2 ? 1.6 : -1.6, 0]));
  assert.equal(r.ok, false);
  assert.ok(['wobbly', 'diagonal'].includes(r.reason));
});

test('кружочки режутся только поперёк', () => {
  const r = classifyCut(line(-3, 0, 3, 0), { allow: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'rounds-only');
});

test('две морковки лежат рядом и не пересекаются', () => {
  let id = 0;
  const one = initialPieces(4, 2, () => ++id, 'carrot');
  const two = initialBatch(4, 2, () => ++id, 'carrot', 2, 0.7);
  assert.equal(two.length, 2);
  assert.ok(Math.abs(totalVolume(two) - 2 * totalVolume(one)) < 1e-9);
  const [a, b] = two.sort((p, q) => p.z - q.z);
  assert.ok(a.z + a.d < b.z, 'зазор между копиями');
});

test('cutLine: нож режет только то, над чем прошёл', () => {
  let id = 0;
  const nextId = () => ++id;
  const pieces = initialBatch(4, 2, nextId, null, 2, 0.7); // две полосы по Z
  const opts = { minWidth: 0.2, maxPieces: 100, nextId };
  // поперёк обеих
  const both = cutLine(pieces, { axis: 'x', pos: 0, from: -3, to: 3 }, opts);
  assert.equal(both.ok, true);
  assert.equal(both.cuts.length, 2);
  // поперёк только верхней
  const top = pieces.find((p) => p.z < 0);
  const one = cutLine(pieces, { axis: 'x', pos: 0, from: top.z - 0.2, to: top.z + top.d + 0.2 }, opts);
  assert.equal(one.ok, true);
  assert.equal(one.cuts.length, 1);
  // нож задел край — не разрез
  const edge = cutLine(pieces, { axis: 'x', pos: 0, from: top.z - 1, to: top.z + 0.3 }, opts);
  assert.equal(edge.ok, false);
  assert.equal(edge.reason, 'short');
  // мимо
  assert.equal(cutLine(pieces, { axis: 'x', pos: 9, from: -3, to: 3 }, opts).reason, 'outside');
});

test('cutLine по Z сохраняет объём и контур', () => {
  let id = 0;
  const nextId = () => ++id;
  const pieces = initialPieces(4, 3, nextId, 'oval');
  const v = totalVolume(pieces);
  const r = cutLine(pieces, { axis: 'z', pos: 0.4, from: -3, to: 3 }, { minWidth: 0.2, maxPieces: 100, nextId });
  assert.equal(r.ok, true);
  assert.equal(r.pieces.length, 2);
  assert.ok(Math.abs(totalVolume(r.pieces) - v) < 1e-9);
  assert.ok(r.pieces.every((p) => p.z + p.d <= 0.4 + 1e-9 || p.z >= 0.4 - 1e-9));
});

test('транспонирование дважды возвращает исходные куски', () => {
  let id = 0;
  const pieces = initialPieces(4, 2, () => ++id, 'carrot');
  const back = transposePieces(transposePieces(pieces));
  assert.deepEqual(back[0].polygon.map((q) => [q.x, q.z]), pieces[0].polygon.map((q) => [q.x, q.z]));
});

test('хорда овала уже рамки у края', () => {
  const p = initialPieces(4, 2, () => 1, 'oval')[0];
  const [a, b] = chordAt(p, 1.8);
  assert.ok(b - a < p.d * 0.6);
  const [c, d] = chordAt(p, 0);
  assert.ok(Math.abs(d - c - p.d) < 0.02);
});

test('сессия: росчерк вдоль и поперёк даёт аккуратные кубики без поворота', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:sausage'));
  cutCubes(s);
  const q = s.boardQuality(s.boardCur());
  assert.ok(q.score >= 0.9, `аккуратность ${q.score}`);
});

test('сессия: кривой росчерк не режет и объясняет почему', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  const before = s.boardCur().pieces.length;
  s.pointer('down', -0.08, -0.08);
  for (let k = 1; k <= 8; k++) s.pointer('move', -0.08 + k * 0.02, -0.08 + k * 0.02);
  assert.equal(s.pointer('up', 0.08, 0.08), 'diagonal');
  assert.match(s.hint.text, /наискосок/);
  assert.equal(s.boardCur().pieces.length, before);
  assert.equal(knife(s, 'x', 0, -2, 2), 'cut');
  assert.equal(s.boardCur().pieces.length, before + 1);
});

test('сессия: потеря фокуса посреди росчерка не режет', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  s.pointer('down', 0, -0.08);
  s.pointer('move', 0, 0.08);
  s.pointerUp();
  assert.equal(s.board.stroke, null);
  assert.equal(s.boardCur().cuts, 0);
});

test('встряхивание: полный цикл с размахом — одна щепотка, мелкая дрожь — ничего', () => {
  const sh = new ShakeTracker({ amplitude: 0.025, minInterval: 0.1 });
  let n = 0, t = 0;
  for (let i = 0; i < 40; i++) n += sh.move(Math.sin(i * 0.4) * 0.005, (t += 0.02)) ? 1 : 0;
  assert.equal(n, 0);
  for (const z of [0, 0.04, 0, 0.04, 0, 0.04, 0]) n += sh.move(z, (t += 0.2)) ? 1 : 0;
  assert.equal(n, 3);
});

test('выдавливание: растёт только над целью и не больше максимума', () => {
  const p = new PourTracker({ rate: 10, max: 1 });
  p.move(0, 0, true);
  assert.ok(Math.abs(p.move(0.05, 0, true) - 0.5) < 1e-9);
  assert.equal(p.move(0.2, 0, false), 0);
  p.move(0.2, 0, true);
  p.move(0.3, 0, true);
  assert.equal(p.amount, 1);
});

// ---------- миска руками ----------
function circle(s, r, turns, steps = 40) {
  s.pointer('down', r, 0);
  for (let i = 1; i <= steps * turns; i++) {
    const a = (i / steps) * Math.PI * 2;
    s.pointer('move', Math.cos(a) * r, Math.sin(a) * r);
  }
}

test('горошек высыпают движением над миской, мимо миски не считается', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'bowl');
  assert.ok(s.bowlPick('olivier', 'peas'));
  assert.equal(s.bowlHand(), 'peas');
  s.pointer('down', 0.3, 0.3);
  for (let i = 0; i < 20; i++) s.pointer('move', 0.3 + i * 0.01, 0.3);
  assert.equal(s.stepDone('olivier', 'peas'), false);
  s.pointer('up', 0, 0);
  circle(s, 0.08, 1);
  s.pointer('up', 0, 0);
  assert.equal(s.stepDone('olivier', 'peas'), true);
  assert.equal(s.bowlHand(), 'spoon');
  const peas = s.bowl.contents.find((c) => c.product === 'peas');
  assert.ok(peas.path.length > 3, 'путь высыпания сохранён для картинки');
});

test('майонез: сколько выдавила — столько и будет (поменьше / как обычно)', () => {
  for (const [turns, expect] of [[0.45, 'light'], [0.8, 'full']]) {
    const s = new KitchenSession({ dayIndex: 0, seed: 1 });
    arrive(s, 'bowl');
    assert.ok(s.bowlPick('olivier', 'mayo'));
    circle(s, 0.08, turns);
    s.pointer('up', 0, 0);
    assert.equal(s.stepDone('olivier', 'mayo'), true, `оборотов ${turns}`);
    assert.equal(s.dishes.olivier.mayo, expect);
  }
});

test('майонез: капля — ещё не заправка', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'bowl');
  s.bowlPick('olivier', 'mayo');
  s.pointer('down', 0.05, 0);
  s.pointer('move', 0.06, 0);
  s.pointer('up', 0.06, 0);
  assert.equal(s.stepDone('olivier', 'mayo'), false);
  assert.match(s.hint.text, /выдави ещё/);
});

test('солонку встряхивают: каждый полный взмах — щепотка', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  const d = s.dishes.olivier;
  for (const st of d.recipe.steps) if (!['season', 'mix'].includes(st.id)) d.steps[st.id].done = true;
  s.bowl.owner = 'olivier';
  arrive(s, 'bowl');
  assert.ok(s.seasonPick('olivier', 'salt'), s.hint?.text);
  s.pointer('down', 0, 0);
  for (let i = 0; i < 9; i++) {
    run(s, 0.2);
    s.pointer('move', 0, i % 2 ? 0.04 : -0.0);
  }
  s.pointer('up', 0, 0);
  assert.ok(d.season.salt >= 3 && d.season.salt <= 5, `щепоток ${d.season.salt}`);
});
