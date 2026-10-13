// 0.11, идея 5 «Рецепт домой»: данные карточки и текст QR для всех десяти рецептов (src/campaign/recipe-home.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recipeHome, recipeQrText, firstSentence, shortHow, servingsText, QR_TEXT_MAX, QR_BYTES_MAX, HOME_STEPS, HOME_STEPS_MIN, HOME_STEPS_MAX, SALT_NAME, PEPPER_NAME } from '../src/campaign/recipe-home.js';
import { RECIPES, CAMPAIGN } from '../src/campaign/data.js';
import { LESSONS } from '../src/campaign/lessons.js';
import { tsp, tspText, gramsText } from '../src/campaign/words.js';
import { makeQr, utf8, qrVersionFor } from '../src/qr.js';
import { decodeQr } from './helpers-qr-v11.js';

const IDS = Object.keys(RECIPES);
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
};
const pin = CAMPAIGN.season.pinchTsp;

test('в игре десять рецептов, и у каждого есть карточка', () => {
  assert.equal(IDS.length, 10);
  for (const id of IDS) {
    const h = recipeHome(id);
    assert.ok(h, id);
    assert.equal(h.id, id);
    assert.equal(h.title, LESSONS[id].title);
    assert.equal(h.servings, LESSONS[id].servings);
  }
  assert.equal(recipeHome('нет-такого'), null);
});

test('нет пустых строк: ни в карточке, ни в тексте QR', () => {
  for (const id of IDS) {
    const h = recipeHome(id);
    for (const s of strings(h)) assert.ok(s.trim().length > 0, `${id}: пустая строка`);
    for (const line of h.qrText.split('\n')) assert.ok(line.trim().length > 0, `${id}: пустая строка в QR`);
    assert.ok(h.items.length >= 3, `${id}: продуктов`);
    for (const r of h.shopping) assert.ok(r.name && r.amount, `${id}: ${JSON.stringify(r)}`);
  }
});

test('нет «щепоток», английских слов и эмодзи — ложки и граммы', () => {
  for (const id of IDS) {
    const { id: _id, ...card } = recipeHome(id); // id блюда — служебная латиница
    const all = strings(card).join('\n');
    assert.ok(!/щепот/i.test(all), `${id}: щепотки`);
    assert.ok(!/[A-Za-z]{3,}/.test(all), `${id}: латиница`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(all), `${id}: эмодзи`);
  }
});

test('3–5 шагов, каждый — одно короткое предложение без обрыва на «ч. л.»', () => {
  for (const id of IDS) {
    const { steps } = recipeHome(id);
    assert.ok(steps.length >= HOME_STEPS_MIN && steps.length <= HOME_STEPS_MAX, `${id}: шагов ${steps.length}`);
    for (const s of steps) {
      assert.ok(s.length >= 15 && s.length <= 125, `${id}: «${s}» (${s.length})`);
      assert.ok(!/\b(ч|ст)\.$/.test(s), `${id}: обрыв на сокращении — ${s}`);
    }
    assert.equal(new Set(steps).size, steps.length, `${id}: повтор шага`);
  }
  for (const [id, list] of Object.entries(HOME_STEPS)) for (const s of list) if (typeof s === 'string') assert.ok(LESSONS[id].steps[s], `${id}: нет шага урока ${s}`);
});

test('числа совпадают с RECIPES: ложки из щепоток, вес блюда, соль и перец в карточке и в QR', () => {
  for (const id of IDS) {
    const h = recipeHome(id);
    const r = RECIPES[id];
    if (!r.season) {
      assert.equal(h.season, null, `${id}: нормы нет`);
      assert.deepEqual(h.shopping, h.items);
      assert.ok(!h.shopping.some((x) => /^соль/i.test(x.name)), `${id}: соль не придумывается`);
      continue;
    }
    const w = gramsText(r.grams);
    assert.equal(h.season.gramsText, w);
    assert.equal(h.season.salt, tsp(r.season.salt, pin));
    const salt = h.shopping.filter((x) => x.name === SALT_NAME);
    const pepper = h.shopping.filter((x) => x.name === PEPPER_NAME);
    assert.equal(salt.length, 1, `${id}: одна строка соли`);
    assert.equal(salt[0].amount, `${tsp(r.season.salt, pin)} на ${w} ${h.season.base}`);
    assert.equal(pepper.length, r.season.pepper > 0 ? 1 : 0);
    if (pepper[0]) assert.equal(pepper[0].amount, `${tsp(r.season.pepper, pin)} на ${w} ${h.season.base}`);
    assert.ok(h.qrText.includes(`${SALT_NAME} — ${tsp(r.season.salt, pin)} на ${w}`), `${id}: соль в QR`);
    assert.ok(!h.items.some((x) => /^(соль|молотый|перец)/i.test(x.name)), `${id}: соль не дублируется среди продуктов`);
  }
  // оливье: «½ ч. л. на 1,5 кг», перец — ¼
  const o = recipeHome('olivier');
  assert.equal(o.season.salt, '½ ч. л.');
  assert.equal(o.season.pepper, '¼ ч. л.');
  assert.equal(o.season.gramsText, '1,5 кг');
  assert.ok(o.qrText.includes('Соль — ½ ч. л. на 1,5 кг салата'));
});

test('урок и карточка говорят одно: ложки и вес в тексте урока совпадают с RECIPES', () => {
  for (const id of IDS) {
    const r = RECIPES[id];
    if (!r.season) continue;
    const row = LESSONS[id].ingredients.find((i) => i.name?.startsWith('Соль'));
    assert.ok(row.amount.includes(`${tspText(r.season.salt, pin)} ч. л.`), `${id}: соль в уроке — ${row.amount}`);
    assert.ok(row.amount.includes(`≈${gramsText(r.grams)}`), `${id}: вес в уроке — ${row.amount}`);
    const step = RECIPES[id].steps.find((s) => s.type === 'season');
    const how = LESSONS[id].steps[step.id].how;
    assert.ok(how.includes(`${tspText(r.season.salt, pin)} ч. л.`), `${id}: шаг — ${how}`);
  }
});

test('текст QR: заголовок, «Список покупок», строки «продукт — количество», не длиннее 600 знаков', () => {
  for (const id of IDS) {
    const h = recipeHome(id);
    const lines = h.qrText.split('\n');
    assert.equal(lines[0], `${h.title} — рецепт домой`);
    assert.ok(lines[1].startsWith('Список покупок'), `${id}: ${lines[1]}`);
    assert.ok(h.qrText.length <= QR_TEXT_MAX, `${id}: ${h.qrText.length} знаков`);
    assert.ok(utf8(h.qrText).length <= QR_BYTES_MAX, `${id}: ${utf8(h.qrText).length} байт`);
    for (const r of h.shopping) assert.ok(lines.includes(`${r.name} — ${r.amount}`), `${id}: нет строки ${r.name}`);
    assert.ok(!/\s$/m.test(h.qrText.replace(/\n/g, '')) && !h.qrText.endsWith('\n'), `${id}: пробелы по краям`);
  }
});

test('в QR нет ссылок, промокодов и названий магазинов — только текст (одинаково в обычной и нейтральной сборке)', () => {
  for (const id of IDS) {
    const all = strings(recipeHome(id)).join('\n');
    assert.ok(!/https?:|www\.|:\/\/|\.(ru|com|net|org)\b|@|промокод|скидк|купон/i.test(all), `${id}: ссылка или промокод`);
    assert.ok(!/пят[её]рочк|выручай|магнит|доставк/i.test(all), `${id}: бренд или магазин`);
  }
});

test('текст каждого рецепта кодируется в QR (UTF-8, версия ≤ 22) и разбирается обратно без потерь', () => {
  for (const id of IDS) {
    const { qrText } = recipeHome(id);
    const q = makeQr(qrText, { ecc: 'M' });
    assert.ok(q.version <= 22, `${id}: версия ${q.version}`);
    const d = decodeQr(q);
    assert.equal(d.text, qrText, id);
    assert.equal(d.ecc, 'M');
  }
});

test('обрезка по строкам: целые строки, заголовок и соль с перцем остаются, «по желанию» уходит первым', () => {
  const h = recipeHome('olivier');
  const full = h.qrText.split('\n');
  for (const max of [520, 400, 300, 220]) {
    const t = recipeQrText(h, { maxChars: max });
    assert.ok(t.length <= max, `${max}: ${t.length}`);
    for (const line of t.split('\n')) assert.ok(full.includes(line), `оборванная строка: ${line}`);
    assert.ok(t.startsWith(full[0]) && t.includes('Список покупок'));
    assert.ok(t.includes('Соль — ½ ч. л.'), `${max}: соль`);
    assert.ok(t.includes('Молотый чёрный перец — ¼ ч. л.'), `${max}: перец`);
  }
  const tomatoes = recipeHome('tomatoes');
  assert.ok(/по желанию/.test(tomatoes.qrText), 'в помидорах есть необязательный лук');
  const noFooter = tomatoes.qrText.replace(/\nСимулятор новогодней суеты$/, '');
  const mid = recipeQrText(tomatoes, { maxChars: noFooter.length - 5 });
  assert.ok(!/по желанию/.test(mid), 'сначала уходит подпись игры, затем необязательные продукты');
  assert.ok(!mid.includes('Симулятор'), 'подпись игры уходит первой');
  assert.ok(mid.includes('Помидор —') && mid.includes('Соль —'), 'обязательное остаётся');
  assert.ok(recipeQrText(h, { maxChars: 100000 }).endsWith('Симулятор новогодней суеты') || h.qrText.endsWith('Симулятор новогодней суеты'));
});

test('первое предложение: «ч. л.» не рвёт фразу, длинное режется по запятой с многоточием', () => {
  assert.equal(firstSentence('Соли — ½ ч. л. на весь салат, перца — ¼ ч. л. Встряхивай над всей миской.'), 'Соли — ½ ч. л. на весь салат, перца — ¼ ч. л.');
  assert.equal(firstSentence('Одно предложение без точки'), 'Одно предложение без точки');
  assert.equal(firstSentence('Сначала так. Потом иначе.'), 'Сначала так.');
  const long = 'Очищенный картофель целиком кладём в кипящую подсоленную воду, варим двадцать пять минут, пока нож не войдёт совсем легко.';
  const cut = firstSentence(long, 70);
  assert.ok(cut.length <= 71 && cut.endsWith('…') && !/[,\s]…$/.test(cut), cut);
});

test('порции склоняются: 1 порция, 3 порции, 6 порций', () => {
  assert.equal(servingsText(1), '1 порция');
  assert.equal(servingsText(3), '3 порции');
  assert.equal(servingsText(4), '4 порции');
  assert.equal(servingsText(6), '6 порций');
  assert.equal(servingsText(21), '21 порция');
  assert.equal(recipeHome('crab').servingsText, '6 порций');
});

test('самый длинный рецепт укладывается в версию кода, которую камера читает с экрана', () => {
  const worst = Math.max(...IDS.map((id) => qrVersionFor(utf8(recipeHome(id).qrText).length, 'M')));
  assert.ok(worst <= 22, `версия ${worst}`);
});

test('шаг «посолить» собран из нормы RECIPES, а не из текста урока: ложки и вес те же, что у солонки', () => {
  for (const id of IDS) {
    const r = RECIPES[id];
    if (!r.season) continue;
    const step = recipeHome(id).steps.find((x) => x.startsWith('Посоли'));
    assert.ok(step, `${id}: шаг соли`);
    assert.ok(step.includes(`соль — ${tsp(r.season.salt, pin)}`), `${id}: ${step}`);
    assert.ok(step.includes(`перец — ${tsp(r.season.pepper, pin)}`), `${id}: ${step}`);
    assert.ok(step.includes(gramsText(r.grams)), `${id}: ${step}`);
  }
  assert.equal(recipeHome('olivier').steps[3], 'Посоли и поперчи: соль — ½ ч. л., перец — ¼ ч. л. на 1,5 кг салата.');
});

test('короткие рецепты дополняются строкой «Проверь: …» из урока, длинные — нет', () => {
  for (const id of ['sandwiches', 'chicken', 'fruit']) {
    const { steps } = recipeHome(id);
    assert.ok(steps.at(-1).startsWith('Проверь: '), id);
    assert.ok(steps.length >= HOME_STEPS_MIN, id);
  }
  for (const id of ['olivier', 'crab', 'eggs', 'tartlets', 'tomatoes', 'shuba']) assert.ok(!recipeHome(id).steps.some((x) => x.startsWith('Проверь: ')), id);
});

test('шаг из урока: короткое первое предложение берёт и второе, длинное — только первое', () => {
  assert.equal(shortHow('Достань масло заранее, чтобы оно смягчилось. Намажь ломтик тонким слоем до краёв.'), 'Достань масло заранее, чтобы оно смягчилось. Намажь ломтик тонким слоем до краёв.');
  const long = 'Картофель режем пластами, поворачиваем доску и режем поперёк — кубики около 1 см. Его в салате больше всего.';
  assert.equal(shortHow(long), 'Картофель режем пластами, поворачиваем доску и режем поперёк — кубики около 1 см.');
  assert.equal(shortHow('Коротко. Ещё короче. И третье.'), 'Коротко. Ещё короче.', 'третье предложение не берётся');
});

test('в списке покупок нет двойных тире: приписки отделены запятой', () => {
  for (const id of IDS) for (const r of recipeHome(id).shopping) assert.ok(!r.amount.includes(' — '), `${id}: ${r.name} — ${r.amount}`);
  assert.ok(recipeHome('tomatoes').qrText.includes('Лук — ½ луковицы, по желанию'));
});
