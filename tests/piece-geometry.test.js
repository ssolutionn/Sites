// Куски на доске — цельные тела: каждая грань смотрит наружу (иначе кусок выглядит «пустым»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceGeometry } from '../src/view/cutboard.js';

function inwardFaces(g) {
  const pos = g.getAttribute('position').array;
  const idx = g.getIndex().array;
  let cx = 0, cy = 0, cz = 0;
  const n = pos.length / 3;
  for (let i = 0; i < n; i++) {
    cx += pos[i * 3];
    cy += pos[i * 3 + 1];
    cz += pos[i * 3 + 2];
  }
  cx /= n; cy /= n; cz /= n;
  let bad = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    if (Math.hypot(nx, ny, nz) < 1e-12) continue;
    const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz < 0) bad++;
  }
  return bad;
}

test('кубик колбасы: все грани наружу — кусок не пустой', () => {
  const g = pieceGeometry({ x: -0.5, z: -0.5, w: 1, d: 1, m: { cx: 0, cz: 0 } }, 'sausage');
  assert.equal(inwardFaces(g), 0);
});

test('кусок по контуру с обходом по часовой стрелке — тоже наружу', () => {
  const cw = [{ x: 0, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 }, { x: 1, z: 0 }];
  const ccw = [...cw].reverse();
  for (const polygon of [cw, ccw]) {
    const g = pieceGeometry({ x: 0, z: 0, w: 1, d: 1, polygon, m: { cx: 0.5, cz: 0.5 } }, 'potato');
    assert.equal(inwardFaces(g), 0);
  }
});
