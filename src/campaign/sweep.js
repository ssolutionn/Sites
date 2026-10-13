// Смах ножа плашмя (0.11, G2.4): «смахни нарезку к миске одним движением». Чистая логика без DOM и Three.js.
// Координаты — метры доски; направление к миске — единичный вектор. Решение владельца: физическое действие — жестом, не кнопкой.

/**
 * Оценить смах: от точки нажатия до точки отпускания.
 * @param {{x:number,z:number}} from — где нажали (метры доски)
 * @param {{x:number,z:number}} to — где отпустили
 * @param {{minLen:number, maxAngle:number, dir:{x:number,z:number}|null}} rules — длина (м), угол (°) к направлению, куда смахивать (null — любое)
 * @param {number} [k] — «мягкие жесты»: длина короче в k раз, угол шире в k раз (потолок 80°)
 * @returns {{ok:boolean, reason:'short'|'wrong-way'|null, len:number, angle:number}}
 */
export function sweepVerdict(from, to, rules, k = 1) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < rules.minLen / k) return { ok: false, reason: 'short', len, angle: 0 };
  if (!rules.dir) return { ok: true, reason: null, len, angle: 0 }; // направление не важно (результат остаётся на доске)
  const d = Math.hypot(rules.dir.x, rules.dir.z) || 1;
  const cos = (dx * rules.dir.x + dz * rules.dir.z) / (len * d);
  const angle = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
  const max = Math.min(80, rules.maxAngle * k);
  if (angle > max) return { ok: false, reason: 'wrong-way', len, angle };
  return { ok: true, reason: null, len, angle };
}

/** Фразы отказа (причина → подсказка): ≤ 70 символов, «что не так — как исправить». */
export const SWEEP_HINTS = {
  short: 'Смахни нарезку подлиннее — одним движением',
  'wrong-way': 'Смахивай в другую сторону — к месту, куда ложится нарезка',
};

/** Куда смахивать для назначения шага (dest): миска справа от доски, поднос слева, готовое остаётся на доске. */
export function sweepTarget(dest, rules) {
  if (dest === 'bowl') return { dir: rules.dir, word: 'к миске — вправо', short: 'в миску' };
  if (dest === 'pieces') return { dir: { x: -rules.dir.x, z: -rules.dir.z }, word: 'к подносу — влево', short: 'на поднос' };
  return { dir: null, word: 'в любую сторону', short: 'в сторону' };
}
