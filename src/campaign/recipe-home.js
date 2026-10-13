// «Рецепт домой» (0.11, идея 5): данные карточки блюда и текст для QR. Чистый модуль без DOM и Three.js.
//
// Карточка собирается из того, что уже есть в игре: продукты и количества — из LESSONS, норма соли и перца — из RECIPES[*].season
// (щепотки → чайные ложки через words.js) и RECIPES[*].grams, шаги — из `how` урока (первое предложение, коротко).
// QR несёт только обычный текст — список продуктов и нормы: при сканировании телефон показывает его как заметку.
// Ни ссылок, ни промокодов, ни названий магазинов здесь нет и быть не должно: тест проверяет каждую строку.
import { RECIPES, PRODUCTS, CAMPAIGN } from './data.js';
import { LESSONS } from './lessons.js';
import { tsp, gramsText, pluralRu } from './words.js';
import { utf8 } from '../qr.js';

/** Предел текста QR в знаках (0.11): больше — код получается слишком мелким для камеры. */
export const QR_TEXT_MAX = 600;
/** Предел текста QR в байтах UTF-8 (кириллица — по два байта): с запасом, чтобы версия кода не уходила выше 22. */
export const QR_BYTES_MAX = 780;
/** Сколько шагов показывает карточка. */
export const HOME_STEPS_MIN = 3;
export const HOME_STEPS_MAX = 5;

export const SALT_NAME = 'Соль';
export const PEPPER_NAME = 'Молотый чёрный перец';
const GAME_LINE = 'Симулятор новогодней суеты';

/** К чему относится вес в RECIPES[*].grams: «½ ч. л. на 1,5 кг салата», «⅛ ч. л. на 100 г начинки». */
const SEASON_BASE = { olivier: 'салата', crab: 'салата', eggs: 'начинки', tartlets: 'начинки', tomatoes: 'начинки' };

/**
 * Какие шаги урока попадают на карточку (3–5 главных, в порядке готовки). Строка — id шага, объект {text} — шаг, которого нет
 * в игре как жеста, но он есть в настоящем рецепте (фрукты: у блюда в игре один шаг). Если вышло меньше четырёх, в конец
 * добавляется «Проверь: …» из `check` урока.
 */
export const HOME_STEPS = {
  olivier: ['boil', 'boilEgg', 'potato', 'season', 'mix'],
  crab: ['boilEgg', 'crab', 'corn', 'season', 'mix'],
  sandwiches: ['spread', 'dose'],
  eggs: ['boilEgg', 'halves', 'mayo', 'season', 'fill'],
  tartlets: ['boilEgg', 'cheese', 'mayo', 'season', 'fill'],
  tomatoes: ['prep', 'cheese', 'season', 'fill', 'garnish'],
  shuba: ['boil', 'boilBeet', 'herring', 'beet', 'layers'],
  canape: ['bread', 'cheese', 'sausage', 'skewers'],
  fruit: [{ text: 'Яблоко нарежь дольками и сбрызни лимонным соком: так оно не потемнеет.' }, 'fruit', { text: 'Виноград вымой и обсуши прямо перед подачей: мокрые ягоды быстрее портятся.' }],
  chicken: ['marinade', 'bake'],
};

/** «4 порции», «6 порций», «1 порция». */
export const servingsText = (n) => `${n} ${pluralRu(n, ['порция', 'порции', 'порций'])}`;

/** Делит текст на предложения: точка — конец, только если дальше заглавная («½ ч. л. на…» не рвётся). */
const sentences = (text) => String(text).trim().split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/);

/** Первое предложение, не длиннее `max`; слишком длинное режется по запятой или двоеточию и получает многоточие. */
export function firstSentence(text, max = 120) {
  let out = sentences(text)[0];
  if (out.length > max) {
    const cut = out.slice(0, max);
    const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' — '), cut.lastIndexOf(': '));
    out = at > max * 0.5 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(' '));
    out = `${out.replace(/[,:;—\s]+$/, '')}…`;
  }
  return out;
}

/** Шаг для карточки: первое предложение `how`; если оно совсем короткое (меньше 50 знаков), то с ним и второе, пока всё ≤ `max`. */
export function shortHow(text, max = 120) {
  const [a, b] = sentences(text);
  const first = firstSentence(a, max);
  return b && first === a && a.length < 50 && a.length + 1 + b.length <= max ? `${a} ${b}` : first;
}

const isSeasonRow = (g) => g.product == null && /^(соль|молот|перец)/i.test(g.name ?? '');
const productName = (g) => (g.product ? PRODUCTS[g.product]?.name ?? g.name : g.name);
// «Лук — 1 шт. — по желанию» в списке покупок читается как две приписки: вторую отделяем запятой
const amountText = (g) => g.amount.replace(/\s—\s/g, ', ');

/**
 * Данные карточки рецепта.
 * @param {string} id id блюда из RECIPES/LESSONS
 * @returns {null | {
 *   id: string, title: string, servings: number, servingsText: string,
 *   items: {name: string, amount: string}[],            продукты урока без соли и перца
 *   season: null | { base: string, gramsText: string, salt: string, pepper: string|null, rows: {name: string, amount: string}[] },
 *   shopping: {name: string, amount: string}[],         items + строки соли и перца: список покупок
 *   steps: string[],                                    3–5 коротких шагов
 *   qrText: string,
 * }}
 */
export function recipeHome(id) {
  const L = LESSONS[id];
  const R = RECIPES[id];
  if (!L || !R) return null;
  const items = L.ingredients.filter((g) => !(R.season && isSeasonRow(g))).map((g) => ({ name: productName(g), amount: amountText(g) }));

  let season = null;
  if (R.season) {
    const base = SEASON_BASE[id] ?? 'блюда';
    const w = gramsText(R.grams);
    const tspOf = (n) => `${tsp(n, CAMPAIGN.season.pinchTsp)} на ${w} ${base}`;
    const rows = [{ name: SALT_NAME, amount: tspOf(R.season.salt) }];
    if (R.season.pepper > 0) rows.push({ name: PEPPER_NAME, amount: tspOf(R.season.pepper) });
    season = { base, gramsText: w, salt: tsp(R.season.salt, CAMPAIGN.season.pinchTsp), pepper: R.season.pepper > 0 ? tsp(R.season.pepper, CAMPAIGN.season.pinchTsp) : null, rows };
  }
  const shopping = [...items, ...(season?.rows ?? [])];

  // шаг «посолить» собирается из нормы RECIPES, а не из текста урока: цифры на карточке не могут разойтись с игрой
  const seasonStepId = R.steps.find((x) => x.type === 'season')?.id;
  const stepText = (s) => {
    if (typeof s !== 'string') return s.text;
    if (season && s === seasonStepId) return `${season.pepper ? 'Посоли и поперчи' : 'Посоли'}: соль — ${season.salt}${season.pepper ? `, перец — ${season.pepper}` : ''} на ${season.gramsText} ${season.base}.`;
    return shortHow(L.steps[s]?.how ?? '');
  };
  const steps = (HOME_STEPS[id] ?? []).map(stepText).filter(Boolean);
  if (steps.length < HOME_STEPS_MIN + 1) steps.push(`Проверь: ${firstSentence(L.check.charAt(0).toLowerCase() + L.check.slice(1), 110)}`);

  return { id, title: L.title, servings: L.servings, servingsText: servingsText(L.servings), items, season, shopping, steps: steps.slice(0, HOME_STEPS_MAX), qrText: recipeQrText({ title: L.title, servingsText: servingsText(L.servings), items, season, shopping }) };
}

/**
 * Текст для QR: заголовок, «Список покупок», строки «продукт — количество», нормы соли и перца в ложках. Обычный текст, без эмодзи.
 * Не длиннее `maxChars` знаков и `maxBytes` байтов: лишнее убирается целыми строками — сначала подпись игры, потом «по желанию»,
 * потом хвост продуктов; заголовок и соль с перцем остаются.
 */
export function recipeQrText(home, { maxChars = QR_TEXT_MAX, maxBytes = QR_BYTES_MAX } = {}) {
  const head = [`${home.title} — рецепт домой`, `Список покупок (${home.servingsText}):`];
  const fits = (lines) => {
    const t = lines.join('\n');
    return t.length <= maxChars && utf8(t).length <= maxBytes;
  };
  const row = (r) => `${r.name} — ${r.amount}`;
  const tail = (home.season?.rows ?? []).map(row);
  let items = home.items.map(row);
  let footer = [GAME_LINE];
  const assemble = () => [...head, ...items, ...tail, ...footer];
  if (!fits(assemble())) footer = [];
  while (!fits(assemble()) && items.some((l) => /по желанию/.test(l))) items = items.filter((l, i, a) => i !== a.findIndex((x) => /по желанию/.test(x)));
  while (!fits(assemble()) && items.length > 1) items = items.slice(0, -1);
  return assemble().join('\n');
}
