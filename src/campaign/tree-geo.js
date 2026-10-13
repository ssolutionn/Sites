// Геометрия ёлки (0.11): игрушки и мишура лежат на любой точке её поверхности, а не на заготовленных местах.
// Чистый модуль без DOM и Three.js. Все точки — в координатах группы ёлки: метры, начало на полу в центре, y вверх.
// Четыре конуса — как в src/view/kitchen.js: конус i — центр по высоте 0,55 + 0,32·i, радиус основания 0,55 − 0,11·i, высота 0,55.

import { TREE_SLOTS } from './layout.js';

export const CONE_H = 0.55;
const CONE_Y0 = 0.55;
const CONE_DY = 0.32;
const CONE_R0 = 0.55;
const CONE_DR = 0.11;

/** Ярусы ёлки: основание base, вершина apex, радиус основания R. */
export const TREE_CONES = Array.from({ length: 4 }, (_, i) => {
  const cy = CONE_Y0 + CONE_DY * i;
  const R = CONE_R0 - CONE_DR * i;
  return { i, cy, R, H: CONE_H, base: cy - CONE_H / 2, apex: cy + CONE_H / 2, k: R / CONE_H, L: Math.hypot(CONE_H, R) };
});

/** Высота макушки (верх верхнего конуса). */
export const TREE_TOP = TREE_CONES[TREE_CONES.length - 1].apex;

const EPS = 1e-9;
const num = (v) => Number.isFinite(v);
const isPt = (p) => !!p && num(p.x) && num(p.y) && num(p.z);

/** Расстояние между двумя точками. */
export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Округление до 0,01 м: так точки хранятся в сохранении. */
export function roundPt(p, step = 0.01) {
  const r = (v) => Math.round(Math.round(v / step) * step * 1e6) / 1e6 + 0; // «+ 0» — без минус-нуля в сохранении
  return { x: r(p.x), y: r(p.y), z: r(p.z) };
}

/** Длина ломаной по точкам [{x,y,z}, …]. */
export function pathLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

// Знаковое расстояние до конуса c: > 0 снаружи, < 0 внутри (выпуклое тело: максимум расстояний до плоскостей).
function coneSd(c, p) {
  const rho = Math.hypot(p.x, p.z);
  const lateral = (rho - c.k * (c.apex - p.y)) * (c.H / c.L);
  const cap = c.base - p.y;
  return Math.max(lateral, cap);
}

/**
 * Знаковое расстояние от точки до ёлки (объединение четырёх конусов): > 0 снаружи, < 0 внутри.
 * @returns {{ d: number, tier: number }} tier — ближайший ярус
 */
export function treeSd(p) {
  let best = { d: Infinity, tier: -1 };
  for (const c of TREE_CONES) {
    const d = coneSd(c, p);
    if (d < best.d) best = { d, tier: c.i };
  }
  return best;
}

/** Точка на поверхности ёлки с допуском tol (м). Внутри веток и в воздухе дальше tol — нет. */
export function onTree(p, tol = 0.03) {
  if (!isPt(p)) return false;
  return Math.abs(treeSd(p).d) <= tol;
}

/** Внешняя нормаль ёлки в точке p (ближайший ярус). Для вершины конуса — вверх. */
export function normalAt(p) {
  const { tier } = treeSd(p);
  const c = TREE_CONES[Math.max(0, tier)];
  const rho = Math.hypot(p.x, p.z);
  const h = c.H / c.L;
  if (rho < 1e-6) return { x: 0, y: 1, z: 0 };
  return { x: (h * p.x) / rho, y: c.R / c.L, z: (h * p.z) / rho };
}

/**
 * Луч (origin, dir — в координатах ёлки) → ближайшая видимая точка поверхности ёлки.
 * Скрытые внутри другого яруса куски не считаются. null — мимо.
 * @returns {{ p: {x,y,z}, n: {x,y,z}, t: number, tier: number } | null}
 */
export function rayHitTree(origin, dir) {
  if (!isPt(origin) || !isPt(dir)) return null;
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (len < EPS) return null;
  const d = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
  const cands = [];
  for (const c of TREE_CONES) {
    const k2 = c.k * c.k;
    const a0 = c.apex - origin.y;
    const A = d.x * d.x + d.z * d.z - k2 * d.y * d.y;
    const B = 2 * (origin.x * d.x + origin.z * d.z + k2 * a0 * d.y);
    const C = origin.x * origin.x + origin.z * origin.z - k2 * a0 * a0;
    const roots = [];
    if (Math.abs(A) < 1e-12) {
      if (Math.abs(B) > 1e-12) roots.push(-C / B);
    } else {
      const disc = B * B - 4 * A * C;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        roots.push((-B - s) / (2 * A), (-B + s) / (2 * A));
      }
    }
    for (const t of roots) {
      if (!(t > 1e-6)) continue;
      const p = { x: origin.x + d.x * t, y: origin.y + d.y * t, z: origin.z + d.z * t };
      if (p.y < c.base - 1e-9 || p.y > c.apex + 1e-9) continue;
      cands.push({ t, p, tier: c.i });
    }
  }
  cands.sort((a, b) => a.t - b.t);
  for (const h of cands) {
    if (treeSd(h.p).d < -1e-6) continue; // спрятана внутри соседнего яруса
    return { p: h.p, n: normalAt(h.p), t: h.t, tier: h.tier };
  }
  return null;
}

/** Радиус ёлки на высоте y: самый широкий из ярусов (0 вне ёлки). */
export function outerRadius(y) {
  let r = 0;
  for (const c of TREE_CONES) if (y >= c.base && y <= c.apex) r = Math.max(r, c.k * (c.apex - y));
  return r;
}

/**
 * Прижать точку к поверхности по горизонтали (та же высота, тот же угол вокруг ствола).
 * Нужна мишуре: быстрый росчерк мышью даёт хорду, а нитка должна лечь по ветвям. null — выше или ниже ёлки.
 */
export function snapToTree(p) {
  if (!isPt(p)) return null;
  const r = outerRadius(p.y);
  if (r <= 0) return null;
  const rho = Math.hypot(p.x, p.z);
  if (rho < 1e-6) return { x: 0, y: p.y, z: r };
  return { x: (p.x / rho) * r, y: p.y, z: (p.z / rho) * r };
}

/**
 * Слишком близко к другой игрушке? others — точки {x,y,z} (или объекты с полем at). Ровно minDist — ещё можно.
 */
export function tooClose(p, others, minDist = 0.06) {
  for (const o of others) {
    const q = o?.at ?? o;
    if (!isPt(q)) continue;
    if (dist(p, q) < minDist - 1e-9) return true;
  }
  return false;
}

/** Точка крючка игрушки: от точки на ветке наружу по нормали на out метров. */
export function hookPos(at, out = 0.05) {
  const n = normalAt(at);
  return { x: at.x + n.x * out, y: at.y + n.y * out, z: at.z + n.z * out };
}

/**
 * За какую часть лежащей ёлки взялась: 'trunk' — ствол и нижний ярус, 'tip' — верхушка (в локальных координатах ёлки).
 * Середину за «поднять» не считаем: так жест означает именно «тянуть за ствол или за верхушку».
 */
export function liftZone(localY) {
  if (!num(localY)) return null;
  if (localY <= 0.6) return 'trunk';
  if (localY >= 1.4) return 'tip';
  return null;
}

/** Миграция 0.10 → 0.11: старое место TREE_SLOTS[slot] → точка на поверхности (на той же высоте), до 0,01 м. null — такого места нет. */
export function slotToAt(slot) {
  const sl = Number.isInteger(slot) ? TREE_SLOTS[slot] : null;
  if (!sl) return null;
  const q = snapToTree({ x: sl.x, y: sl.y, z: sl.z });
  return q ? roundPt(q) : null;
}

/** Точка из сохранения или ввода → чистая {x, y, z} до 0,01 м; null, если это не точка на ёлке. */
export function cleanAt(a, tol = 0.03) {
  if (!isPt(a)) return null;
  const p = roundPt(a);
  return onTree(p, tol) ? p : null;
}
