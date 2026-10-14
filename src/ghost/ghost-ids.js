// Идентификаторы жестов, которые умеет показывать «рука-призрак» (0.11). Без зависимостей: список нужен и настройкам
// (settings.js проверяет ghostSeen из сохранения), и реестру демонстраций (ghost-demos.js).

/** Жесты по порядку знакомства: нож, тёрка, чистка, смах ножом плашмя, миска, кот, ёлка, подарок, уборка, плита (крутилка, продукт на конфорку, кастрюля прочь), посудомойка, духовка (дверца, форма в проём, курица наружу), удержание лампочки гирлянды или звезды. */
export const GHOST_IDS = [
  'cut-v', 'cut-h', 'round', 'grate', 'peel', 'sweep',
  'stir', 'salt', 'pour',
  'cat-wave', 'cat-kibble', 'cat-wand',
  'tinsel', 'toy-drag',
  'gift-bow', 'gift-paper', 'gift-lid',
  'wipe', 'knob', 'stove-place', 'stove-pot',
  'washer-door', 'washer-drag',
  'oven-door', 'oven-drop', 'oven-take',
  'hold',
];

/** Известный ли это жест. */
export const isGhostId = (id) => typeof id === 'string' && GHOST_IDS.includes(id);
