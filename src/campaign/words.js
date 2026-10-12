// Слова интерфейса, которые встречаются в разных экранах. Чистый модуль — проверяется в node:test.

/** Валюта бонусной программы (0.11, владелец: «эти звезды я бы называл очки домохозяйки»). */
export const PTS_NAME = 'очки домохозяйки';

/** Склонение по числу: pluralRu(21, ['очко', 'очка', 'очков']) → «очко». */
export function pluralRu(n, forms) {
  const a = Math.abs(Math.round(n)) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b === 1) return forms[0];
  if (b >= 2 && b <= 4) return forms[1];
  return forms[2];
}

/** «35 очков домохозяйки», «1 очко домохозяйки», «2 очка домохозяйки». */
export function pts(n) {
  return `${Math.round(n)} ${pluralRu(n, ['очко', 'очка', 'очков'])} домохозяйки`;
}

/** Кухонные минуты (0.11): игровая секунда = scale секунд на часах кухни. 100 с игры при scale 15 → «25 мин». */
export function kitchenMin(gameSeconds, scale) {
  const m = Math.round((gameSeconds * scale) / 60);
  return m < 1 ? 'меньше минуты' : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ''}`;
}

const EIGHTHS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];

/**
 * Чайные ложки для соли и перца (0.11: «в ложках чайных на количество салата»).
 * pinches — щепотки, одна щепотка = pinchTsp ч. л. (CAMPAIGN.season.pinchTsp, 1/8): 3 → «⅜», 4 → «½», 8 → «1», 9 → «1⅛».
 */
export function tspText(pinches, pinchTsp = 1 / 8) {
  const e = Math.round(pinches * pinchTsp * 8);
  if (e <= 0) return '0';
  const whole = Math.floor(e / 8);
  return `${whole || ''}${EIGHTHS[e % 8]}`;
}

/** «½ ч. л.» — мера целиком. */
export function tsp(pinches, pinchTsp = 1 / 8) {
  return `${tspText(pinches, pinchTsp)} ч. л.`;
}

/** Вес готового блюда: 600 → «600 г», 1500 → «1,5 кг», 2000 → «2 кг». */
export function gramsText(g) {
  if (g < 1000) return `${Math.round(g)} г`;
  const kg = Math.round(g / 100) / 10;
  return `${String(kg).replace('.', ',')} кг`;
}
