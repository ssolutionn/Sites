// Идентификаторы жестов, которые умеет показывать «рука-призрак» (0.11). Без зависимостей: список нужен и настройкам
// (settings.js проверяет ghostSeen из сохранения), и реестру демонстраций (ghost-demos.js).

/** Жесты по порядку знакомства: нож, тёрка, чистка, миска, кот, ёлка, подарок, уборка, плита, посудомойка. */
export const GHOST_IDS = [
  'cut-v', 'cut-h', 'round', 'grate', 'peel',
  'stir', 'salt', 'pour',
  'cat-wave', 'cat-kibble', 'cat-wand',
  'tinsel', 'toy-drag',
  'gift-bow', 'gift-paper', 'gift-lid',
  'wipe', 'knob',
  'washer-door', 'washer-drag',
];

/** Известный ли это жест. */
export const isGhostId = (id) => typeof id === 'string' && GHOST_IDS.includes(id);
