// Жесты «как в жизни» с прощающими допусками (решение владельца: реализм, который прощает).
// Чистая логика без DOM и Three.js: координаты — локальные метры рабочего места станции.
//
// Правила жестов по всей игре — design/gdd/gestures.md.

/** Росчерк мыши: точки с отметкой времени. */
export class Stroke {
  constructor() {
    this.pts = [];
  }

  /** Добавить точку (x, z — метры; t — секунды игрового или реального времени). */
  add(x, z, t = 0) {
    const last = this.pts[this.pts.length - 1];
    if (last && Math.hypot(x - last.x, z - last.z) < 1e-5) return;
    this.pts.push({ x, z, t });
  }

  get length() {
    let s = 0;
    for (let i = 1; i < this.pts.length; i++) s += Math.hypot(this.pts[i].x - this.pts[i - 1].x, this.pts[i].z - this.pts[i - 1].z);
    return s;
  }

  get duration() {
    return this.pts.length > 1 ? this.pts[this.pts.length - 1].t - this.pts[0].t : 0;
  }

  /**
   * Главное направление росчерка (метод главных компонент): единичный вектор и центр.
   * Устойчиво к дрожанию руки, в отличие от «первая точка → последняя».
   */
  axis() {
    const n = this.pts.length;
    if (n < 2) return null;
    let cx = 0, cz = 0;
    for (const p of this.pts) {
      cx += p.x;
      cz += p.z;
    }
    cx /= n;
    cz /= n;
    let sxx = 0, szz = 0, sxz = 0;
    for (const p of this.pts) {
      const dx = p.x - cx, dz = p.z - cz;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
    const ang = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    return { cx, cz, ux: Math.cos(ang), uz: Math.sin(ang) };
  }
}

const DEG = Math.PI / 180;

/** Допуски по умолчанию для нарезки (в единицах доски: 1 = целевой кубик). */
export const CUT_RULES = {
  angleTolerance: 28, // градусов от «вдоль» или «поперёк» — дальше нож считается кривым
  cover: 0.6, // нож должен пройти не меньше 60 % продукта под лезвием (проверяет cutLine)
  maxWobble: 1.9, // путь / хорда: больше — рука дрожит слишком сильно
  minLength: 0.6, // минимальная длина росчерка
};

/**
 * Разобрать росчерк ножа: прямая ли это линия и в какую сторону.
 * stroke — точки в единицах доски. allow: 'both' — вдоль и поперёк (кубики),
 * 'x' — только поперёк длинной оси (кружочки).
 * Возвращает { ok, axis, pos, from, to, angle } или { ok: false, reason }:
 *   axis 'x' — линия идёт вдоль Z и делит продукт по координате X = pos;
 *   axis 'z' — линия идёт вдоль X и делит по Z = pos;
 *   from..to — где прошёл нож вдоль линии (что под лезвием — решает cutLine).
 * Наклон в пределах допуска прощается: разрез выпрямляется по средней линии.
 */
export function classifyCut(stroke, { allow = 'both', rules = CUT_RULES } = {}) {
  const pts = stroke.pts;
  if (pts.length < 2 || stroke.length < rules.minLength) return { ok: false, reason: 'short' };
  const ax = stroke.axis();
  // угол главного направления относительно оси Z (0° — росчерк «сверху вниз» по доске)
  let angZ = Math.abs(Math.atan2(ax.ux, ax.uz)) / DEG;
  if (angZ > 90) angZ = 180 - angZ;
  const alongZ = angZ <= rules.angleTolerance;
  const alongX = 90 - angZ <= rules.angleTolerance;
  let axis = null;
  if (alongZ && (allow === 'both' || allow === 'x')) axis = 'x';
  else if (alongX && allow === 'both') axis = 'z';
  if (!axis) return { ok: false, reason: alongX && allow === 'x' ? 'rounds-only' : 'diagonal', angle: angZ };

  const first = pts[0], last = pts[pts.length - 1];
  const chord = Math.hypot(last.x - first.x, last.z - first.z);
  if (chord < 1e-6 || stroke.length / chord > rules.maxWobble) return { ok: false, reason: 'wobbly', angle: angZ };

  let from = Infinity, to = -Infinity, sum = 0;
  for (const p of pts) {
    const s = axis === 'x' ? p.z : p.x;
    from = Math.min(from, s);
    to = Math.max(to, s);
    sum += axis === 'x' ? p.x : p.z;
  }
  return { ok: true, axis, pos: sum / pts.length, from, to, angle: angZ };
}

/** Подсказки игроку по причине отказа. */
export const CUT_HINTS = {
  short: 'Проведи ножом через продукт целиком — от края до края',
  diagonal: 'Нож пошёл наискосок — веди ровно вдоль или поперёк',
  'rounds-only': 'Кружочки режут только поперёк — веди нож сверху вниз',
  wobbly: 'Рука дрогнула — веди нож одним уверенным движением',
  outside: 'Нож прошёл мимо продукта',
  miss: 'Нож прошёл мимо продукта',
  'too-close': 'Слишком близко к краю — такой кусочек развалится',
  limit: 'Кусочков уже достаточно — перенеси продукт',
};

/**
 * Встряхивание (солонка, перечница): полный цикл «вниз-вверх» с размахом не меньше amplitude
 * засчитывается как одна щепотка. Не чаще одного раза за minInterval секунд.
 */
export class ShakeTracker {
  constructor({ amplitude = 0.025, minInterval = 0.18 } = {}) {
    this.amplitude = amplitude;
    this.minInterval = minInterval;
    this.reset();
  }

  reset() {
    this.anchor = null;
    this.dir = 0;
    this.extreme = null;
    this.halves = 0;
    this.lastT = -1e9;
  }

  /** Новая точка по вертикали экрана (z) во времени t; true — встряхивание засчитано. */
  move(z, t) {
    if (this.extreme === null) {
      this.extreme = z;
      return false;
    }
    const d = z - this.extreme;
    const nd = Math.sign(d);
    if (this.dir === 0) {
      if (Math.abs(d) >= this.amplitude) {
        this.dir = nd;
        this.extreme = z;
        this.halves = 1; // первый размах — половина цикла
      }
      return false;
    }
    if (nd === this.dir) {
      this.extreme = z; // продолжаем в ту же сторону — сдвигаем экстремум
      return false;
    }
    if (Math.abs(d) < this.amplitude) return false;
    // разворот с достаточным размахом
    this.dir = nd;
    this.extreme = z;
    this.halves++;
    if (this.halves % 2 === 0 && t - this.lastT >= this.minInterval) {
      this.lastT = t;
      return true;
    }
    return false;
  }
}

/**
 * Выдавливание или наливание: количество растёт, пока кнопка зажата и рука двигается над целью.
 * rate — сколько единиц за метр пути над целью.
 */
export class PourTracker {
  constructor({ rate = 2.2, max = 2 } = {}) {
    this.rate = rate;
    this.max = max;
    this.amount = 0;
    this.last = null;
  }

  release() {
    this.last = null;
  }

  /** Точка над целью (inside=true) или мимо; возвращает прирост. */
  move(x, z, inside) {
    let gain = 0;
    if (this.last && inside) {
      gain = Math.min(this.max - this.amount, Math.hypot(x - this.last.x, z - this.last.z) * this.rate);
      this.amount += gain;
    }
    this.last = inside ? { x, z } : null;
    return gain;
  }
}
