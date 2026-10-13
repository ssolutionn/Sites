// «Мягкие жесты» (0.11, настройки; design/gdd/interaction-spec.md §4): допуски всех жестов шире в k раз.
// k берётся из CAMPAIGN.assist.k (1,5). Чистая функция: из конфигурации кампании делает копию с
// ослабленными допусками, а сессия (KitchenSession) принимает её как cfg — все станции читают допуски оттуда.
// Награды, нормы и оценки блюд не меняются: смягчается только то, как распознаётся движение руки.
// Кнопками жесты не заменяются никогда.
import { CAMPAIGN } from './data.js';

/**
 * Что смягчается. [путь в CAMPAIGN, 'mul' — умножить на k | 'div' — разделить на k, потолок].
 * Правило большого пальца: «больше допуск» → mul, «меньше нужно сделать» → div.
 */
export const ASSIST_RULES = [
  // нож (st-board.js, classifyCut): угол ≤ 44°, чтобы «вдоль» и «поперёк» не перекрылись на 45°
  ['cutRules.angleTolerance', 'mul', 44],
  ['cutRules.maxWobble', 'mul'], // дрожь: путь / хорда
  ['cutRules.cover', 'div'], // доля продукта под лезвием
  // солонка (ShakeTracker): размах взмаха
  ['shake.amplitude', 'div'],
  // кот: размах мыши и радиус «попадания» по коту (Waver)
  ['cat.wave.minAmp', 'div'],
  ['cat.wave.hitRadius', 'mul'],
  // ложка в миске (Stirrer): круг шире и уже, рывок побольше
  ['mix.minRadius', 'div'],
  ['mix.maxRadius', 'mul'],
  ['mix.maxJump', 'mul'],
  // тёрка (Grater): зона разворота ближе к центру
  ['grate.zoneTop', 'div'],
  ['grate.zoneBottom', 'div'],
  ['grate.maxJump', 'mul'],
  // подарок (st-tree.js): бант, бумага, крышка
  ['gift.bowR', 'mul'],
  ['gift.bowPull', 'div'],
  ['gift.box', 'mul'],
  ['gift.tearPath', 'div'],
  ['gift.lidSlide', 'div'],
  ['gift.maxStep', 'mul'],
  // канапе: шпажка
  ['canape.pierceDepth', 'div'],
  ['canape.pierceAngle', 'mul'],
  // кисти и нож чистки: ширина мазка (CoverageMask.brush)
  ['peel.brush', 'mul'],
  ['peel.hand.brush', 'mul'],
  ['spread.brush', 'mul'],
  ['marinade.brush', 'mul'],
  ['layer.brush', 'mul'],
  ['wipe.brush', 'mul'],
  // губка и тряпка (Scrubber): рывок за шаг
  ['wash.maxStep', 'mul'],
  ['stove.wipe.maxStep', 'mul'],
  // жесты 0.11 G: кот — пачка корма (размах тряски, зона над миской) и «удочка» (зона, рывок)
  ['cat.feed.amplitude', 'div'],
  ['cat.feed.radius', 'mul'],
  ['cat.play.radius', 'mul'],
  ['cat.play.maxJump', 'mul'],
  // дверцы посудомойки и духовки: открыть — меньше хода ручки, закрыть — не до упора; посуду и форму ловит шире вокруг проёма
  ['dishwasher.door.open', 'div'],
  ['dishwasher.door.closed', 'mul'],
  ['dishwasher.drop', 'mul'],
  ['oven.door.open', 'div'],
  ['oven.door.closed', 'mul'],
  ['oven.drop', 'mul'],
  // кастрюлю с конфорки — тащить ближе; удержание лампочки и звезды — попасть легче; мишура — рывок мыши побольше
  ['stove.dragOff', 'div'],
  ['keys.holdHitRadius', 'mul'],
  ['tinsel.maxJump', 'mul'],
  // ёлка: снять висящую игрушку — радиус захвата (допуск поверхности tree.tol не трогаем: по нему сохранение проверяет игрушки)
  ['tree.pickR', 'mul'],
];

/** Множитель из настроек в допустимых пределах 1–2 (не число → 1, то есть без смягчения). */
export function clampAssistK(k) {
  return typeof k === 'number' && Number.isFinite(k) ? Math.max(1, Math.min(2, k)) : 1;
}

/** Одно значение допуска → смягчённое. */
export function soften(value, op, k, limit = null) {
  const v = op === 'div' ? value / k : value * k;
  return limit == null ? v : Math.min(v, limit);
}

/**
 * Конфигурация с мягкими допусками. При k = 1 возвращает base без копирования.
 * Копируются только ветки, в которых что-то изменилось; остальное — те же объекты, что в base.
 * @param {object} base — CAMPAIGN (или его копия в тесте)
 * @param {number} [k] — по умолчанию base.assist.k
 */
export function assistConfig(base = CAMPAIGN, k = base.assist?.k) {
  const kk = clampAssistK(k);
  if (kk === 1) return base;
  const root = { ...base, assist: { ...(base.assist ?? {}), k: kk, on: true } };
  const copied = new Set([root]);
  for (const [path, op, limit] of ASSIST_RULES) {
    const keys = path.split('.');
    let node = root;
    for (let i = 0; i < keys.length - 1; i++) {
      let next = node[keys[i]];
      if (next == null || typeof next !== 'object') {
        node = null;
        break;
      }
      if (!copied.has(next)) {
        next = Array.isArray(next) ? [...next] : { ...next };
        copied.add(next);
        node[keys[i]] = next;
      }
      node = next;
    }
    const last = keys[keys.length - 1];
    if (node && typeof node[last] === 'number') node[last] = soften(node[last], op, kk, limit);
  }
  return root;
}
