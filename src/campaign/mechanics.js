// Ручные механики без графики. Все координаты — метры в плоскости рабочего места.
import { pieceVolume, totalVolume } from '../game/cutting.js';

const EPS = 1e-9;

// ---------- Перемешивание: накопленная угловая длина вокруг центра ----------
// Неподвижное удержание ничего не даёт; рывки и шум отсекаются.
export class Stirrer {
  constructor(cfg) {
    this.cfg = cfg;
    this.angle = 0; // радианы
    this.last = null;
  }
  get turns() {
    return this.angle / (Math.PI * 2);
  }
  release() {
    this.last = null;
  }
  move(x, z) {
    const { minRadius, maxRadius, minStep, maxJump } = this.cfg;
    const r = Math.hypot(x, z);
    if (r < minRadius || r > maxRadius) {
      this.last = null;
      return 0;
    }
    const p = { x, z, a: Math.atan2(z, x) };
    const l = this.last;
    this.last = p;
    if (!l) return 0;
    const step = Math.hypot(x - l.x, z - l.z);
    if (step < minStep) {
      this.last = l; // копим мелкое дрожание, пока не наберётся шаг
      return 0;
    }
    if (step > maxJump) return 0; // рывок через миску
    let da = p.a - l.a;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > 1.2) return 0;
    const gain = Math.abs(da);
    this.angle += gain;
    return gain;
  }
}

// ---------- Тёрка: засчитываются полные циклы вверх-вниз ----------
export class Grater {
  constructor(cfg, cycles = cfg.cyclesPerPortion) {
    this.cfg = cfg;
    this.cycles = cycles;
    this.done = 0;
    this.phase = null; // 'top' | 'bottom'
    this.visitedTop = false;
    this.lastZ = null;
  }
  get remaining() {
    return Math.max(0, 1 - this.done / this.cycles);
  }
  get complete() {
    return this.done >= this.cycles;
  }
  release() {
    this.lastZ = null;
  }
  // z — положение продукта вдоль тёрки (минус — вверху). Возвращает true, если цикл засчитан.
  move(z) {
    if (this.complete) return false;
    if (this.lastZ != null && Math.abs(z - this.lastZ) > this.cfg.maxJump) {
      this.lastZ = z;
      return false; // телепорт курсора не считается движением по тёрке
    }
    this.lastZ = z;
    const zone = z <= this.cfg.zoneTop ? 'top' : z >= this.cfg.zoneBottom ? 'bottom' : null;
    if (!zone || zone === this.phase) return false;
    const first = this.phase === null;
    this.phase = zone;
    if (first) return false;
    this.halves = (this.halves ?? 0) + 1;
    if (this.halves % 2 === 0) {
      this.done++;
      return true;
    }
    return false;
  }
}

// ---------- Кружочки: продольный цилиндр, разрез по координате X ----------
// Отрезки [a, b] по длине; крайние сегменты содержат торцы (обрезки).
export function makeRoundLog(length) {
  return { length, segments: [{ a: -length / 2, b: length / 2 }] };
}

export function cutRound(log, x, minThickness) {
  const i = log.segments.findIndex((s) => x > s.a + EPS && x < s.b - EPS);
  if (i < 0) return { ok: false, reason: 'outside' };
  const s = log.segments[i];
  if (x - s.a < minThickness - EPS || s.b - x < minThickness - EPS) return { ok: false, reason: 'too-close' };
  const segments = log.segments.slice();
  segments.splice(i, 1, { a: s.a, b: x }, { a: x, b: s.b });
  return { ok: true, log: { ...log, segments } };
}

export function roundSlices(log) {
  const L = log.length / 2;
  return log.segments.map((s) => ({ ...s, t: s.b - s.a, end: Math.abs(s.a + L) < EPS || Math.abs(s.b - L) < EPS }));
}

// Оценка кружочков: доля длины в допуске, торцы до allowance — без штрафа.
export function roundQuality(log, target, allowance) {
  const slices = roundSlices(log);
  if (slices.length < 2) return { score: 0, good: 0, slices };
  let good = 0, trims = 0;
  for (const s of slices) {
    if (s.t >= target.min && s.t <= target.max) good += s.t;
    else if (s.end) trims += s.t;
  }
  const allowed = Math.min(trims, allowance * log.length + (target.max * 2));
  return { score: Math.min(1, (good + allowed) / log.length), good: slices.filter((s) => s.t >= target.min && s.t <= target.max).length, slices };
}

// ---------- Оценка нарезки с краевыми обрезками ----------
// Обрезок — фрагмент с исходной границей профиля (вершины с флагом o), не подходящий по размеру
// и меньше целевого кубика. Внутренние фрагменты обрезком не считаются.
export function isEdgePiece(p) {
  return !!p.polygon && p.polygon.some((q) => q.o);
}

export function cutQuality(pieces, initialVolume, tol, allowance) {
  const total = totalVolume(pieces);
  if (total <= EPS) return { score: 0, neat: 0, trims: 0 };
  let neat = 0, trims = 0, neatCount = 0;
  for (const p of pieces) {
    const v = pieceVolume(p);
    const ok = p.w >= tol.min - EPS && p.w <= tol.max + EPS && p.d >= tol.min - EPS && p.d <= tol.max + EPS;
    if (ok) {
      neat += v;
      neatCount++;
    } else if (isEdgePiece(p) && p.w <= tol.max + EPS && p.d <= tol.max + EPS) trims += v;
  }
  const allowed = Math.min(trims, allowance * initialVolume);
  return { score: Math.min(1, (neat + allowed) / total), neat: neatCount, trims, allowed };
}

// ---------- Наполнение: порции ложкой, переполнение снимается ----------
export function fillState(level, cfg) {
  if (level <= EPS) return 'empty';
  if (level < cfg.normalMin) return 'low';
  if (level <= cfg.normalMax) return 'ok';
  if (level < cfg.overflow) return 'high';
  return 'over';
}

export function fillQuality(levels, cfg) {
  if (!levels.length) return 0;
  let s = 0;
  for (const l of levels) {
    if (l >= cfg.normalMin && l <= cfg.normalMax) s += 1;
    else if (l < cfg.normalMin) s += Math.max(0, l / cfg.normalMin) * 0.8;
    else s += Math.max(0.3, 1 - (l - cfg.normalMax) * 1.5);
  }
  return s / levels.length;
}
