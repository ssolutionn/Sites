// 0.11, владелец: «лепить игрушки на любую часть ёлки, а не только заготовленную». Геометрия ёлки — чистый модуль:
// луч мыши → точка на поверхности четырёх конусов (в координатах ёлки), «точка на ёлке», «слишком близко».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TREE_CONES, TREE_TOP, rayHitTree, onTree, tooClose, normalAt, outerRadius, snapToTree, roundPt, pathLength, slotToAt, cleanAt, liftZone, hookPos, dist } from '../src/campaign/tree-geo.js';
import { TREE_SLOTS } from '../src/campaign/layout.js';

const surf = (y, a) => {
  const r = outerRadius(y);
  return { x: Math.sin(a) * r, y, z: Math.cos(a) * r };
};

test('четыре яруса как в модели: центр 0,55 + 0,32·i, радиус 0,55 − 0,11·i, высота 0,55', () => {
  assert.equal(TREE_CONES.length, 4);
  TREE_CONES.forEach((c, i) => {
    assert.ok(Math.abs(c.cy - (0.55 + 0.32 * i)) < 1e-12);
    assert.ok(Math.abs(c.R - (0.55 - 0.11 * i)) < 1e-12);
    assert.equal(c.H, 0.55);
    assert.ok(Math.abs(c.apex - c.base - 0.55) < 1e-12);
  });
  assert.ok(Math.abs(TREE_TOP - 1.785) < 1e-9);
});

test('луч в ёлку попадает в поверхность яруса: точка на ёлке, нормаль единичная и смотрит наружу', () => {
  // на высоте 0,8 спереди торчит нижний край второго яруса: радиус 0,8·(1,145 − 0,8) ≈ 0,276
  const h = rayHitTree({ x: 0, y: 0.8, z: 3 }, { x: 0, y: 0, z: -1 });
  assert.ok(h);
  assert.equal(h.tier, 1);
  assert.ok(Math.abs(h.p.z - 0.276) < 1e-9, `z = ${h.p.z}`);
  assert.ok(onTree(h.p, 1e-6));
  assert.ok(Math.abs(Math.hypot(h.n.x, h.n.y, h.n.z) - 1) < 1e-9);
  assert.ok(h.n.z > 0.5 && h.n.y > 0, JSON.stringify(h.n));
  assert.ok(h.n.x * h.p.x + h.n.z * h.p.z >= 0, 'нормаль смотрит от ствола');
});

test('луч сверху-спереди под углом камеры кладёт точку на ближайший склон', () => {
  const o = { x: 1.27, y: 1.4, z: 3.58 };
  const target = { x: 0, y: 0.7, z: 0 };
  const h = rayHitTree(o, { x: target.x - o.x, y: target.y - o.y, z: target.z - o.z });
  assert.ok(h);
  assert.ok(onTree(h.p, 1e-6));
  assert.ok(h.t < dist(o, target), 'ближайшая точка раньше центра ёлки');
});

test('нижний ярус перекрывает верхний только там, где он торчит: спрятанный кусок конуса не отдаётся', () => {
  // y = 0,45: выше основания второго яруса (0,595) ещё нет, значит попадаем в первый
  const h = rayHitTree({ x: 0, y: 0.45, z: 3 }, { x: 0, y: 0, z: -1 });
  assert.equal(h.tier, 0);
  assert.ok(Math.abs(h.p.z - 0.375) < 1e-9);
  // y = 0,7: первый ярус внутри второго — точка принадлежит второму, а не спрятанному первому
  const h2 = rayHitTree({ x: 0, y: 0.7, z: 3 }, { x: 0, y: 0, z: -1 });
  assert.equal(h2.tier, 1);
});

test('мимо ёлки: выше макушки, в стороне, назад — null', () => {
  assert.equal(rayHitTree({ x: 0, y: 2.6, z: 3 }, { x: 0, y: 0, z: -1 }), null, 'выше макушки');
  assert.equal(rayHitTree({ x: 2, y: 0.8, z: 3 }, { x: 0, y: 0, z: -1 }), null, 'в стороне');
  assert.equal(rayHitTree({ x: 0, y: 0.8, z: 3 }, { x: 0, y: 0, z: 1 }), null, 'луч уходит от ёлки');
  assert.equal(rayHitTree({ x: 0, y: 0.8, z: 3 }, { x: 0, y: 0, z: 0 }), null, 'нулевое направление');
  assert.equal(rayHitTree({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), null);
});

test('onTree: на поверхности — да; ровно на допуске — да; на допуске + 10 % и внутри ёлки — нет', () => {
  const p = surf(1.6, 0.3); // верхний ярус: рядом нет юбки другого яруса
  assert.ok(onTree(p, 0.03));
  const n = normalAt(p);
  const at = (d) => ({ x: p.x + n.x * d, y: p.y + n.y * d, z: p.z + n.z * d });
  assert.ok(onTree(at(0.03 - 1e-6), 0.03));
  assert.equal(onTree(at(0.033), 0.03), false, 'допуск + 10 %');
  assert.equal(onTree(at(-0.033), 0.03), false, 'допуск + 10 % внутрь');
  assert.equal(onTree({ x: 0, y: 0.9, z: 0 }, 0.03), false, 'внутри, у ствола');
  assert.equal(onTree({ x: 0, y: 3, z: 0 }, 0.03), false, 'над макушкой');
  assert.equal(onTree({ x: 0, y: 0.05, z: 1 }, 0.03), false, 'мимо, у пола');
});

test('tooClose: ровно minDist — можно, меньше — тесно; по умолчанию 6 см; чужие точки без at пропускаются', () => {
  const a = { x: 0.3, y: 0.5, z: 0.1 };
  const near = (d) => ({ x: a.x + d, y: a.y, z: a.z });
  assert.equal(tooClose(a, [near(0.06)]), false, 'ровно 6 см');
  assert.equal(tooClose(a, [near(0.054)]), true, '6 см − 10 %');
  assert.equal(tooClose(a, [near(0.066)]), false, '6 см + 10 %');
  assert.equal(tooClose(a, [near(0.08)], 0.09), true, 'своя граница');
  assert.equal(tooClose(a, [{ at: near(0.02) }]), true, 'игрушка с полем at');
  assert.equal(tooClose(a, [{ at: null }, null]), false);
  assert.equal(tooClose(a, []), false);
});

test('normalAt: у вершины конуса — вверх; ярус пологий (нижний) смотрит вверх больше крутого (верхнего)', () => {
  assert.deepEqual(normalAt({ x: 0, y: 1.78, z: 0 }), { x: 0, y: 1, z: 0 });
  const low = normalAt(surf(0.5, 0));
  const high = normalAt(surf(1.6, 0));
  assert.ok(low.y > high.y, `${low.y} ${high.y}`);
});

test('snapToTree прижимает точку к ветвям по горизонтали; выше и ниже ёлки — null', () => {
  const q = snapToTree({ x: 0.05, y: 0.9, z: 0.05 });
  assert.ok(onTree(q, 1e-9));
  assert.ok(Math.abs(Math.atan2(q.x, q.z) - Math.PI / 4) < 1e-9, 'тот же угол вокруг ствола');
  assert.equal(snapToTree({ x: 0.1, y: 2.5, z: 0 }), null);
  assert.equal(snapToTree({ x: 0.1, y: 0.1, z: 0 }), null);
});

test('округление до 0,01 и длина ломаной', () => {
  assert.deepEqual(roundPt({ x: 0.123456, y: 0.5049, z: -0.0049 }), { x: 0.12, y: 0.5, z: 0 });
  assert.ok(Object.is(roundPt({ x: -0.001, y: 0, z: 0 }).x, 0), 'без минус-нуля');
  assert.ok(Math.abs(pathLength([{ x: 0, y: 0, z: 0 }, { x: 0.3, y: 0.4, z: 0 }, { x: 0.3, y: 0.4, z: 1 }]) - 1.5) < 1e-12);
  assert.equal(pathLength([]), 0);
});

test('старые 18 мест TREE_SLOTS переносятся на поверхность: каждое — точка на ёлке, друг от друга не ближе 6 см', () => {
  const pts = TREE_SLOTS.map((s) => slotToAt(s.i));
  assert.equal(pts.length, 18);
  for (const p of pts) assert.ok(onTree(p, 0.03), JSON.stringify(p));
  pts.forEach((p, i) => assert.equal(tooClose(p, pts.filter((_, j) => j !== i), 0.06), false, `место ${i}`));
  assert.equal(slotToAt(99), null);
  assert.equal(slotToAt(null), null);
});

test('cleanAt: чистая точка до 0,01 или null, если точка не на ёлке', () => {
  const p = surf(0.9, 1);
  assert.deepEqual(cleanAt(p), roundPt(p));
  assert.equal(cleanAt({ x: 0, y: 0.9, z: 0 }), null);
  assert.equal(cleanAt('x'), null);
  assert.equal(cleanAt({ x: 1, y: 2 }), null);
});

test('liftZone: ствол и верхушка — можно взяться, середина — нет', () => {
  assert.equal(liftZone(0.3), 'trunk');
  assert.equal(liftZone(0.6), 'trunk');
  assert.equal(liftZone(1.0), null);
  assert.equal(liftZone(1.4), 'tip');
  assert.equal(liftZone(1.9), 'tip');
  assert.equal(liftZone(undefined), null);
});

test('крючок игрушки — от точки наружу по нормали', () => {
  const p = surf(0.9, 0.5);
  const h = hookPos(p, 0.08);
  assert.ok(Math.abs(dist(h, p) - 0.08) < 1e-9);
  assert.ok(Math.hypot(h.x, h.z) > Math.hypot(p.x, p.z));
});
