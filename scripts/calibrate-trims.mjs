// Калибровка допуска краевых обрезков по эталонной нарезке (раздел 9.5 ТЗ).
// Эталон: полоски шириной 1 от левого края, поворот, снова полоски шириной 1.
import { initialPieces, cutAcross, rotatePieces, bounds } from '../src/game/cutting.js';
import { cutQuality } from '../src/campaign/mechanics.js';
import { PRODUCTS, CAMPAIGN } from '../src/campaign/data.js';
let id = 1;
const opts = { minWidth: CAMPAIGN.minCutFraction, maxPieces: 400, nextId: () => id++ };
function reference(w, d, profile) {
  let p = initialPieces(w, d, () => id++, profile === 'rectangle' ? null : profile);
  const v0 = p.reduce((s, q) => s + (q.polygon ? 0 : 0), 0);
  const init = p;
  for (let pass = 0; pass < 2; pass++) {
    const b = bounds(p);
    for (let x = b.minX + 1; x < b.maxX - 0.2; x += 1) { const r = cutAcross(p, x, opts); if (r.ok) p = r.pieces; }
    p = rotatePieces(p);
  }
  return { pieces: p, init };
}
for (const [pid, prod] of Object.entries(PRODUCTS)) {
  if (!prod.cut) continue;
  const { w, d, profile } = prod.cut;
  const { pieces, init } = reference(w, d, profile);
  const v0 = init.reduce((s, q) => s + (q.polygon ? Math.abs(q.polygon.reduce((a, p, i, arr) => a + p.x * arr[(i + 1) % arr.length].z - arr[(i + 1) % arr.length].x * p.z, 0)) / 2 : q.w * q.d), 0);
  const q0 = cutQuality(pieces, v0, CAMPAIGN.tolerance, 0).score;
  const trim = Math.min(0.45, Math.max(CAMPAIGN.edgeTrimAllowance, +((1 - q0) * 1.08).toFixed(3)));
  const q1 = cutQuality(pieces, v0, CAMPAIGN.tolerance, trim).score;
  console.log(pid.padEnd(9), 'в данных:', prod.cut.trim ?? CAMPAIGN.edgeTrimAllowance, ' ')
  console.log(' '.repeat(9), `${w}x${d} ${profile.padEnd(9)} эталон без допуска ${(q0 * 100).toFixed(1)}%  допуск ${trim}  эталон с допуском ${(q1 * 100).toFixed(1)}%  кусочков ${pieces.length}`);
}
