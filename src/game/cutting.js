// Геометрия нарезки. Чистые функции без зависимостей от сцены.
// Кусок — прямоугольник или выпуклый контур polygon в плоскости доски.
// x/z/w/d — ограничивающий прямоугольник; высота ломтика равна 1.
// Объём равен площади фактического контура, а не его рамки.
// Нож всегда режет поперёк оси X (линия разреза параллельна оси Z).

const EPS = 1e-9;

export function makePiece(id, x, z, w, d) {
  return { id, x, z, w, d };
}

export function pieceVolume(p) {
  if (p.area != null) return p.area; // кусок с сетки (raster-cut.js)
  return p.polygon ? polygonArea(p.polygon) : p.w * p.d;
}

export function totalVolume(pieces) {
  let v = 0;
  for (const p of pieces) v += pieceVolume(p);
  return v;
}

export function pieceAt(pieces, px, pz) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    if (px >= p.x - EPS && px <= p.x + p.w + EPS && pz >= p.z - EPS && pz <= p.z + p.d + EPS && (!p.polygon || pointInPolygon(p.polygon, px, pz))) return p;
  }
  return null;
}

/**
 * Несколько одинаковых продуктов рядом на доске (один заход — вся порция рецепта).
 * Копии лежат друг под другом по оси Z с зазором gap; общий центр — центр доски.
 */
export function initialBatch(w, d, nextId, profile = null, qty = 1, gap = 0.7) {
  const n = Math.max(1, qty | 0);
  const total = n * d + (n - 1) * gap;
  const out = [];
  for (let i = 0; i < n; i++) {
    const dz = -total / 2 + d / 2 + i * (d + gap);
    for (const p of initialPieces(w, d, nextId, profile)) out.push(shiftPiece({ ...p, m: { cx: 0, cz: 0 } }, 0, dz));
  }
  return out;
}

// m — центр исходного продукта, из которого вырезан кусок (для рисунка мякоти на срезе).
function shiftMeta(m, dx, dz) {
  return m ? { ...m, cx: m.cx + dx, cz: m.cz + dz } : m;
}

function shiftPiece(p, dx, dz) {
  return { ...p, x: p.x + dx, z: p.z + dz, ...(p.m ? { m: shiftMeta(p.m, dx, dz) } : {}), ...(p.polygon ? { polygon: p.polygon.map((q) => ({ ...q, x: q.x + dx, z: q.z + dz })) } : {}) };
}

// Ломтик, центрированный на доске.
export function initialPieces(w, d, nextId, profile = null) {
  if (!profile || profile === 'rectangle') return [makePiece(nextId(), -w / 2, -d / 2, w, d)];
  const polygon = [];
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const taper = profile === 'carrot' ? 0.8 + 0.2 * Math.cos(a) : profile === 'egg' ? 0.9 + 0.1 * Math.cos(a) : 1;
    polygon.push({ x: Math.cos(a) * w / 2, z: Math.sin(a) * d / 2 * taper, o: 1 });
  }
  return [polygonPiece(nextId(), polygon)];
}

/**
 * Разрез выбранной части по линии x = cutX.
 * Возвращает { ok, reason, pieces, left, right }. Исходный массив не меняется.
 */
export function cutPiece(pieces, pieceId, cutX, { minWidth, maxPieces, nextId }) {
  const p = pieces.find((q) => q.id === pieceId);
  if (!p) return { ok: false, reason: 'no-piece' };
  if (cutX <= p.x + EPS || cutX >= p.x + p.w - EPS) return { ok: false, reason: 'outside' };
  const w1 = cutX - p.x;
  const w2 = p.x + p.w - cutX;
  if (w1 < minWidth - EPS || w2 < minWidth - EPS) return { ok: false, reason: 'too-close' };
  if (maxPieces != null && pieces.length + 1 > maxPieces) return { ok: false, reason: 'limit' };
  const left = withMeta(p.polygon ? polygonPiece(nextId(), clipPolygon(p.polygon, cutX, true)) : makePiece(nextId(), p.x, p.z, w1, p.d), p.m);
  const right = withMeta(p.polygon ? polygonPiece(nextId(), clipPolygon(p.polygon, cutX, false)) : makePiece(nextId(), cutX, p.z, w2, p.d), p.m);
  if (!left || !right || pieceVolume(left) < EPS || pieceVolume(right) < EPS) return { ok: false, reason: 'too-close' };
  const out = [];
  for (const q of pieces) {
    if (q === p) out.push(left, right);
    else out.push(q);
  }
  return { ok: true, pieces: out, left, right };
}

export function bounds(pieces) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const p of pieces) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x + p.w);
    maxZ = Math.max(maxZ, p.z + p.d);
  }
  if (!pieces.length) return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
  return { minX, minZ, maxX, maxZ };
}

// Поворот всего продукта на 90° вокруг центра с повторным центрированием.
// Точка (x, z) -> (-z, x). Идентификаторы сохраняются.
export function rotatePieces(pieces) {
  const rotated = pieces.map((p) => withMeta(p.polygon ? polygonPiece(p.id, p.polygon.map(q => ({ ...q, x: -q.z, z: q.x }))) : ({ ...p, x: -(p.z + p.d), z: p.x, w: p.d, d: p.w }), p.m && { ...p.m, cx: -p.m.cz, cz: p.m.cx, rot: ((p.m.rot ?? 0) + 1) % 4 }));
  return recenter(rotated);
}

export function recenter(pieces) {
  if (!pieces.length) return pieces;
  const b = bounds(pieces);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return pieces.map((p) => shiftPiece(p, -cx, -cz));
}

function withMeta(p, m) {
  if (p && m) p.m = m;
  return p;
}

// Свободное место для куска-замены: справа от текущего продукта.
export function placeBeside(pieces, w, d, id, source = null) {
  const b = bounds(pieces);
  const x = pieces.length ? b.maxX + 0.4 : -w/2;
  const z = pieces.length ? (b.minZ+b.maxZ)/2-d/2 : -d/2;
  const m = source?.m ? shiftMeta(source.m, x - source.x, z - source.z) : { cx: x + w / 2, cz: z + d / 2 };
  return withMeta(source?.polygon ? polygonPiece(id, source.polygon.map((q) => ({ ...q, x: q.x - source.x + x, z: q.z - source.z + z }))) : makePiece(id, x, z, w, d), m);
}

export function largestPiece(pieces) {
  let best = null;
  for (const p of pieces) if (!best || pieceVolume(p) > pieceVolume(best)) best = p;
  return best;
}

export function isNeat(p, tol) {
  const sides = [p.w, p.d, 1];
  return sides.every((s) => s >= tol.min - EPS && s <= tol.max + EPS);
}

// Аккуратность — доля объёма аккуратных кусочков (0..1). Пустой набор — 0.
export function accuracy(pieces, tol) {
  const total = totalVolume(pieces);
  if (total <= EPS) return 0;
  let neat = 0;
  for (const p of pieces) if (isNeat(p, tol)) neat += pieceVolume(p);
  return neat / total;
}

// A convex prepared vegetable slice, clipped at the REAL knife coordinate.
// No grid snapping: clipping preserves its curved silhouette and volume.
export function polygonArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p.x * q.z - q.x * p.z; }
  return Math.abs(a) / 2;
}

export function polygonPiece(id, polygon) {
  if (polygon.length < 3) return null;
  const xs = polygon.map(p => p.x), zs = polygon.map(p => p.z);
  const x = Math.min(...xs), z = Math.min(...zs);
  return { id, x, z, w: Math.max(...xs) - x, d: Math.max(...zs) - z, polygon };
}

export function clipPolygon(poly, cutX, left) {
  const out = [];
  const inside = p => left ? p.x <= cutX + EPS : p.x >= cutX - EPS;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], ai = inside(a), bi = inside(b);
    if (ai) out.push({ ...a });
    if (ai !== bi) {
      const t = (cutX - a.x) / (b.x - a.x);
      out.push({ x: cutX, z: a.z + (b.z - a.z) * t });
    }
  }
  return out;
}

export function pointInPolygon(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    const cross = (x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x);
    if (Math.abs(cross) < EPS && x >= Math.min(a.x,b.x)-EPS && x <= Math.max(a.x,b.x)+EPS && z >= Math.min(a.z,b.z)-EPS && z <= Math.max(a.z,b.z)+EPS) return true;
    if ((a.z > z) !== (b.z > z) && x < (b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) inside = !inside;
  }
  return inside;
}

// One knife stroke across every intersected strip. Validate atomically first.
// opts.only — множество id: резать только эти куски (нож прошёл не над всеми).
export function cutAcross(pieces, cutX, opts) {
  if (!Number.isFinite(cutX)) return { ok: false, reason: 'outside' };
  const touched = pieces.filter(p => cutX > p.x + EPS && cutX < p.x + p.w - EPS && (!opts.only || opts.only.has(p.id)));
  if (!touched.length) return { ok: false, reason: 'outside' };
  if (opts.maxPieces != null && pieces.length + touched.length > opts.maxPieces) return { ok: false, reason: 'limit' };
  for (const p of touched) {
    const v = cutPiece([p], p.id, cutX, { ...opts, maxPieces: null, nextId: () => 0 });
    if (!v.ok) return v;
  }
  let out = pieces;
  const cuts = [];
  for (const p of touched) {
    const result = cutPiece(out, p.id, cutX, { ...opts, maxPieces: null });
    out = result.pieces;
    cuts.push({ original: p, left: result.left, right: result.right });
  }
  return { ok: true, pieces: out, cuts };
}

// Зеркало относительно диагонали x = z: разрез «вдоль X» сводится к разрезу «вдоль Z».
export function transposePieces(pieces) {
  return pieces.map((p) => withMeta(p.polygon ? polygonPiece(p.id, p.polygon.map((q) => ({ ...q, x: q.z, z: q.x }))) : { ...p, x: p.z, z: p.x, w: p.d, d: p.w }, p.m && { ...p.m, cx: p.m.cz, cz: p.m.cx }));
}

/** Протяжённость куска вдоль линии x = cutX: [min, max] по Z (для контура — реальная хорда). */
export function chordAt(p, cutX) {
  if (!p.polygon) return [p.z, p.z + p.d];
  let lo = Infinity, hi = -Infinity;
  const poly = p.polygon;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.x - cutX) * (b.x - cutX) > 0) continue;
    const zs = Math.abs(b.x - a.x) < EPS ? [a.z, b.z] : [a.z + ((b.z - a.z) * (cutX - a.x)) / (b.x - a.x)];
    for (const z of zs) {
      lo = Math.min(lo, z);
      hi = Math.max(hi, z);
    }
  }
  return lo <= hi ? [lo, hi] : [p.z, p.z + p.d];
}

/**
 * Разрез ножом по прямой: axis 'x' — линия вдоль Z на x = pos, axis 'z' — линия вдоль X на z = pos.
 * from/to — где прошёл нож вдоль линии. Режутся только куски, над которыми нож прошёл
 * хотя бы на долю cover их реальной хорды (как в жизни: что под лезвием, то и разрезано).
 * Возвращает { ok, reason, pieces, cuts }; reason: outside | short | too-close | limit.
 */
export function cutLine(pieces, { axis, pos, from, to }, opts) {
  const flip = axis === 'z';
  const src = flip ? transposePieces(pieces) : pieces;
  const cover = opts.cover ?? 0.6;
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const under = src.filter((p) => pos > p.x + EPS && pos < p.x + p.w - EPS);
  if (!under.length) return { ok: false, reason: 'outside' };
  const only = new Set();
  for (const p of under) {
    const [a, b] = chordAt(p, pos);
    const span = b - a;
    const covered = Math.max(0, Math.min(hi, b) - Math.max(lo, a));
    if (span <= EPS || covered / span >= cover - EPS) only.add(p.id);
  }
  if (!only.size) return { ok: false, reason: 'short' };
  const r = cutAcross(src, pos, { ...opts, only });
  if (!r.ok) return r;
  if (!flip) return r;
  const back = (p) => transposePieces([p])[0];
  return { ok: true, pieces: transposePieces(r.pieces), cuts: r.cuts.map((c) => ({ original: back(c.original), left: back(c.left), right: back(c.right) })) };
}
