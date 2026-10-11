// Подсказка закрывается сама, когда игрок сделал то, о чём она (0.10, владелец: «подсказку про Q не нужно
// закрывать — она должна закрываться автоматом»). Ключ — тема подсказки (TIPS в campaign-ui.js), значение — события
// сессии, после которых совет больше не нужен. 'recipeOpened' — событие интерфейса: открыли рецепт (Q или 📖).
// Чистый модуль: проверяется в node:test.

export const TIP_DONE = {
  wish: ['recipeOpened'],
  cube: ['cut'],
  round: ['cut'],
  grate: ['grate'],
  peel: ['peel', 'eggCrack'],
  bowl: ['added', 'stir'],
  sink: ['wash', 'coolStart'],
  puddle: ['wipe'],
  'tray:sandwiches': ['spread'],
  'tray:eggs': ['eggSplit'],
  'tray:tartlets': ['fill'],
  'tray:tomatoes': ['tomatoCap'],
  'tray:shuba': ['layerPlace'],
  'tray:canape': ['dropOk'],
  'tray:fruit': ['mandarinSplit'],
  'tray:chicken': ['marinade'],
  catTheft: ['catShooed', 'catStole'],
  catSpill: ['catShooed', 'catSpill'],
  catWave: ['catShooed', 'catMischief', 'catStole', 'catSpill'],
  pot: ['potSaved', 'spill'],
  radio: ['radioFixed'],
  radioTune: ['radioTuned'],
  garland: ['garlandFixed'],
  star: ['starFixed'],
  gifts: ['giftOpened'],
  catBored: ['catPlay', 'catMischief'],
  stove: ['potPlaced', 'heat'],
  fridge: ['taken'],
  stoveWipe: ['stoveClean'],
  hot: ['cooled', 'coolStart'],
  season: ['pinch'],
  catHungry: ['catFed'],
  catbowl: ['catFed', 'catPlay'],
  boardDirty: ['washed'],
  delivery: ['bagArrived'],
  money: ['orderPlaced'],
};

/** Закрывает ли событие type подсказку topic. */
export function tipClosedBy(topic, type) {
  return !!TIP_DONE[topic]?.includes(type);
}
