// Нарезка по сетке: нож режет по реальному следу, куски — связные области.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CutBody, rasterQuality, halfDepth } from '../src/game/raster-cut.js';

const TOL = { min: 0.65, max: 1.45, elong: 2 };
const line = (b, x0, z0, x1, z1, steps = 10) => {
  let prev = { x: x0, z: z0 };
  let n = 0;
  for (let k = 1; k <= steps; k++) {
    const p = { x: x0 + ((x1 - x0) * k) / steps, z: z0 + ((z1 - z0) * k) / steps };
    n += b.cutSegment(prev, p);
    prev = p;
  }
  return n;
};
const dice = (b, step = 1) => {
  const w = b.shape.w, d = b.shape.d * 2;
  for (let x = -w / 2 + step; x < w / 2 - 0.05; x += step) line(b, x, -d, x, d);
  for (let z = -d + step / 2; z < d; z += step) line(b, -w, z, w, z);
};

test('целый продукт — один кусок на штуку, площадь как у контура', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'oval', qty: 2 });
  const ps = b.pieces();
  assert.equal(ps.length, 2);
  const ellipse = Math.PI * 4 * 3;
  for (const p of ps) assert.ok(Math.abs(p.area - ellipse) / ellipse < 0.03, `${p.area} ≈ ${ellipse}`);
  assert.ok(ps.every((p) => p.edge && !p.fresh));
});

test('прямой разрез поперёк делит штуку на две, мимо — ничего', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'oval' });
  assert.equal(line(b, 6, -5, 6, 5), 0, 'мимо продукта');
  assert.equal(b.pieces().length, 1);
  assert.ok(line(b, 0.03, -5, 0.03, 5) > 0);
  const ps = b.pieces();
  assert.equal(ps.length, 2);
  assert.ok(Math.abs(ps[0].area - ps[1].area) / ps[0].area < 0.08);
});

test('надрез, не прошедший насквозь, кусок не отделяет', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  line(b, 0, -5, 0, 1);
  assert.equal(b.pieces().length, 1);
  line(b, 0, 1, 0, 5);
  assert.equal(b.pieces().length, 2);
});

test('нож режет по следу: наискосок — косые куски, дрожь — кривой край', () => {
  const straight = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  line(straight, 0, -4, 0, 4);
  const slant = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  line(slant, -2, -4, 2, 4);
  const pS = straight.pieces(), pT = slant.pieces();
  assert.equal(pT.length, 2);
  // косой разрез — рамки кусков шире половины
  assert.ok(pT[0].w > pS[0].w + 1, `${pT[0].w} > ${pS[0].w}`);
  // дрожащий разрез: зигзаг по ±0.4 даёт другую границу, чем прямой
  const wob = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  let prev = { x: 0, z: -4 };
  for (let k = 1; k <= 16; k++) {
    const p = { x: k % 2 ? 0.4 : -0.4, z: -4 + k * 0.5 };
    wob.cutSegment(prev, p);
    prev = p;
  }
  const pw = wob.pieces();
  assert.equal(pw.length, 2);
  assert.ok(pw[0].w > pS[0].w + 0.2, 'кривой край выходит за прямую линию');
});

test('кубик 1 см: 8×6 даёт ~48 хороших кусков, качество высокое; полоски — низкое', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  for (let x = -3; x <= 3; x++) line(b, x, -4, x, 4);
  const strips = rasterQuality(b.pieces(), 48, TOL, 0.1);
  assert.ok(strips.score < 0.2, `полоски: ${strips.score}`);
  for (let z = -2; z <= 2; z++) line(b, -5, z, 5, z);
  const ps = b.pieces();
  assert.equal(ps.length, 48);
  const q = rasterQuality(ps, 48, TOL, 0.1);
  assert.ok(q.score > 0.95, `кубики: ${q.score}`);
  assert.ok(ps.every((p) => p.elong < 1.2));
});

test('рубка зигзагом: каждый взмах режет, шаг = сдвиг руки', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  // качаем нож вверх-вниз, сдвигая вправо на 1 см за взмах; развороты вне продукта
  let prev = { x: -3, z: -4 };
  for (let k = 0; k < 7; k++) {
    const down = { x: -3 + k, z: 4 };
    b.cutSegment(prev, down);
    const up = { x: -3 + k + 0.5, z: -4 };
    // обратный ход вверх — тоже по продукту (как в жизни: нож не отрывается)
    b.cutSegment(down, up);
    prev = { x: -3 + k + 1, z: -4 };
    b.cutSegment(up, prev);
  }
  assert.ok(b.pieces().length >= 12, `зигзаг нарезал ${b.pieces().length} кусков`);
});

test('крошки осыпаются; кот уносит кусок, замену нужно дорезать', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  line(b, -3.9, -4, -3.9, 4);
  const crumbs = b.sweep(0.12, 0.15);
  assert.equal(crumbs.length, 1, 'тонкая стружка с края — крошка');
  assert.equal(b.pieces().length, 1);
  line(b, 0, -4, 0, 4);
  const big = b.pieces().reduce((a, p) => (p.area > a.area ? p : a));
  const pat = b.removePiece(big.id);
  assert.equal(b.pieces().length, 1);
  b.addPattern(pat);
  const ps = b.pieces();
  assert.equal(ps.length, 2);
  const fresh = ps.find((p) => p.fresh);
  assert.ok(fresh, 'замена свежая');
  assert.ok(Math.abs(fresh.area - pat.area) < 1e-6);
  assert.ok(fresh.x > 4, 'лежит справа от продукта');
  line(b, fresh.cx, -4, fresh.cx, 4);
  assert.ok(b.pieces().every((p) => !p.fresh), 'дорезали — уже не свежая');
});

test('контур куска замкнут, против часовой стрелки, кожура отмечена', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'oval' });
  line(b, 0.03, -5, 0.03, 5);
  for (const p of b.pieces()) {
    const c = b.contour(p);
    assert.ok(c.length >= 6);
    let a = 0;
    for (let k = 0; k < c.length; k++) a += c[k].x * c[(k + 1) % c.length].z - c[(k + 1) % c.length].x * c[k].z;
    assert.ok(a > 0, 'против часовой');
    assert.ok(Math.abs(a / 2 - p.area) / p.area < 0.08, `площадь контура ${a / 2} ≈ ${p.area}`);
    assert.ok(c.some((q) => q.o) && c.some((q) => !q.o), 'есть и кожура, и срез');
  }
});

test('контур моркови сужается к кончику', () => {
  const s = { w: 12, d: 3, profile: 'carrot' };
  assert.ok(halfDepth(s, -5) < halfDepth(s, 5));
  assert.equal(halfDepth(s, 7), 0);
});

test('кубики у края с кожурой — обрезки без штрафа в пределах допуска', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'oval' });
  dice(b);
  const ps = b.pieces();
  const q = rasterQuality(ps, b.area(), TOL, 0.12);
  assert.ok(q.score > 0.85, `овал кубиками: ${q.score}`);
  assert.ok(q.trims > 0);
});

test('след из коротких отрезков точно по диагонали клеток всё равно отделяет кусок', () => {
  const b = new CutBody({ w: 8, d: 6, profile: 'rectangle' });
  let p = { x: -0.08 / 0.021, z: -0.08 / 0.021 };
  for (let k = 1; k <= 8; k++) {
    const q = { x: (-0.08 + k * 0.02) / 0.021, z: (-0.08 + k * 0.02) / 0.021 };
    b.cutSegment(p, q);
    p = q;
  }
  b.sweep(0.12, 0.15);
  assert.equal(b.pieces().length, 2);
});
