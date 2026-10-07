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
  const left = p.polygon ? polygonPiece(nextId(), clipPolygon(p.polygon, cutX, true)) : makePiece(nextId(), p.x, p.z, w1, p.d);
  const right = p.polygon ? polygonPiece(nextId(), clipPolygon(p.polygon, cutX, false)) : makePiece(nextId(), cutX, p.z, w2, p.d);
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
  const rotated = pieces.map((p) => p.polygon ? polygonPiece(p.id, p.polygon.map(q => ({ ...q, x: -q.z, z: q.x }))) : ({ ...p, x: -(p.z + p.d), z: p.x, w: p.d, d: p.w }));
  return recenter(rotated);
}

export function recenter(pieces) {
  if (!pieces.length) return pieces;
  const b = bounds(pieces);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return pieces.map((p) => ({ ...p, x: p.x - cx, z: p.z - cz, ...(p.polygon ? { polygon: p.polygon.map(q => ({ ...q, x: q.x - cx, z: q.z - cz })) } : {}) }));
}

// Свободное место для куска-замены: справа от текущего продукта.
export function placeBeside(pieces, w, d, id, source = null) {
  const b = bounds(pieces);
  const x = pieces.length ? b.maxX + 0.4 : -w/2;
  const z = pieces.length ? (b.minZ+b.maxZ)/2-d/2 : -d/2;
  return source?.polygon ? polygonPiece(id,source.polygon.map(q=>({x:q.x-source.x+x,z:q.z-source.z+z}))) : makePiece(id,x,z,w,d);
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
export function cutAcross(pieces, cutX, opts) {
  if (!Number.isFinite(cutX)) return { ok: false, reason: 'outside' };
  const touched = pieces.filter(p => cutX > p.x + EPS && cutX < p.x + p.w - EPS);
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
