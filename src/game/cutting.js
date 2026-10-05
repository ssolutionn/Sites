// Геометрия нарезки. Чистые функции без зависимостей от сцены.
// Кусок — прямоугольник в плоскости доски: левый-ближний угол (x, z), размеры (w, d).
// Высота куска всегда равна целевому кубику (1), поэтому объём = w * d.
// Нож всегда режет поперёк оси X (линия разреза параллельна оси Z).

const EPS = 1e-9;

export function makePiece(id, x, z, w, d) {
  return { id, x, z, w, d };
}

export function pieceVolume(p) {
  return p.w * p.d * 1;
}

export function totalVolume(pieces) {
  let v = 0;
  for (const p of pieces) v += pieceVolume(p);
  return v;
}

export function pieceAt(pieces, px, pz) {
  for (let i = pieces.length - 1; i >= 0; i--) {
    const p = pieces[i];
    if (px >= p.x - EPS && px <= p.x + p.w + EPS && pz >= p.z - EPS && pz <= p.z + p.d + EPS) return p;
  }
  return null;
}

// Ломтик, центрированный на доске.
export function initialPieces(w, d, nextId) {
  return [makePiece(nextId(), -w / 2, -d / 2, w, d)];
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
  const left = makePiece(nextId(), p.x, p.z, w1, p.d);
  const right = makePiece(nextId(), cutX, p.z, w2, p.d);
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
  const rotated = pieces.map((p) => ({ id: p.id, x: -(p.z + p.d), z: p.x, w: p.d, d: p.w }));
  return recenter(rotated);
}

export function recenter(pieces) {
  if (!pieces.length) return pieces;
  const b = bounds(pieces);
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return pieces.map((p) => ({ ...p, x: p.x - cx, z: p.z - cz }));
}

// Свободное место для куска-замены: справа от текущего продукта.
export function placeBeside(pieces, w, d, id) {
  if (!pieces.length) return makePiece(id, -w / 2, -d / 2, w, d);
  const b = bounds(pieces);
  return makePiece(id, b.maxX + 0.4, (b.minZ + b.maxZ) / 2 - d / 2, w, d);
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
