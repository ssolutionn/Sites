// 0.11, идея 5 «Рецепт домой»: раскладка карточки 1080×1350 (src/ui/recipe-card-layout.js) — без canvas, с условной шириной букв.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRecipeCard, glue, qrModulePx, CARD_W, CARD_H, CARD_MARGIN, QR_QUIET, QR_MIN_PX, QR_CAPTION } from '../src/ui/recipe-card-layout.js';
import { recipeHome } from '../src/campaign/recipe-home.js';
import { RECIPES } from '../src/campaign/data.js';
import { makeQr } from '../src/qr.js';

// ширина буквы кириллицы Nunito — около 0,55 em; берём 0,6 с запасом, жирные шире на 6 %
const em = (font) => parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)[1]);
const measure = (text, font) => text.length * em(font) * 0.6 * (/^(800|900)/.test(font) ? 1.06 : 1);
const IDS = Object.keys(RECIPES);
const build = (id, m = measure) => {
  const home = recipeHome(id);
  const qr = makeQr(home.qrText);
  return { home, qr, L: layoutRecipeCard(home, m, { qrSize: qr.size }) };
};
const texts = (L) => L.ops.filter((o) => o.t === 'text');

test('все десять рецептов помещаются на карточку без потери шагов, шрифты не мельче 0,82 от обычных', () => {
  for (const id of IDS) {
    const { home, L } = build(id);
    assert.ok(L.fits, `${id}: не помещается (масштаб ${L.scale}, низ шагов ${Math.round(L.bottom)})`);
    assert.equal(L.steps, home.steps.length, `${id}: шаги не потеряны`);
    assert.ok(L.scale >= 0.82, `${id}: масштаб ${L.scale}`);
  }
});

test('размер текста по длине рецепта: короткие рецепты крупнее обычного, длинные не мельче 0,82', () => {
  const scale = (id) => build(id).L.scale;
  for (const id of ['sandwiches', 'canape', 'fruit', 'chicken']) assert.ok(scale(id) > 1, `${id}: ${scale(id)}`);
  assert.ok(scale('sandwiches') > scale('olivier'));
  for (const id of IDS) assert.ok(scale(id) <= 1.3 && scale(id) >= 0.82, id);
});

test('QR: не меньше 240 px, целые пиксели на модуль, тихая зона 4 модуля, чёрный на белом, прижат к нижней полосе', () => {
  for (const id of IDS) {
    const { qr, L } = build(id);
    const q = L.ops.find((o) => o.t === 'qr');
    assert.ok(q, `${id}: операция QR`);
    assert.ok(Number.isInteger(q.module) && q.module >= 3, `${id}: модуль ${q.module} px`);
    assert.ok(q.size * q.module >= QR_MIN_PX, `${id}: код ${q.size * q.module} px`);
    assert.equal(q.block, (q.size + QR_QUIET * 2) * q.module, 'блок = код + тихая зона по 4 модуля с каждой стороны');
    assert.equal(q.size, qr.size);
    assert.ok(q.x >= CARD_W / 2 && q.x + q.block <= CARD_W - CARD_MARGIN + 0.5, `${id}: по ширине`);
    assert.ok(q.y + q.block <= CARD_H - 64 - 20, `${id}: выше нижней полосы`);
    assert.ok(q.y + q.block >= CARD_H - 64 - 40, `${id}: прижат книзу`);
  }
  assert.equal(QR_QUIET, 4);
  assert.equal(qrModulePx(97), 3, 'версия 20: 105 модулей с тихой зоной — по 3 px');
  assert.equal(qrModulePx(89), 4, 'версия 18 и меньше — по 4 px и крупнее');
  assert.equal(qrModulePx(77), 4);
  assert.equal(qrModulePx(45), 7);
});

test('текст не вылезает за поля и не заходит на QR; шаги кончаются левее кода', () => {
  for (const id of IDS) {
    const { L } = build(id);
    const q = L.ops.find((o) => o.t === 'qr');
    for (const t of texts(L)) {
      const w = measure(t.text, t.font);
      const left = t.align === 'center' ? t.x - w / 2 : t.x;
      assert.ok(left >= 0 && left + w <= CARD_W + 1, `${id}: «${t.text}» за краем`);
      assert.ok(t.y > 0 && t.y < CARD_H, `${id}: «${t.text}» по высоте`);
      if (t.align === 'center' && t.y > CARD_H - 70) continue; // подпись в нижней полосе
      if (t.align !== 'center') assert.ok(left + w <= CARD_W - CARD_MARGIN + 2, `${id}: «${t.text}» правее поля (${Math.round(left + w)})`);
      const overlapsX = left < q.x + q.block && left + w > q.x;
      const overlapsY = t.y > q.y - 4 && t.y - em(t.font) < q.y + q.block;
      assert.ok(!(overlapsX && overlapsY), `${id}: «${t.text}» налезает на QR`);
    }
    const headY = texts(L).find((t) => t.text === 'Как готовить').y;
    const steps = texts(L).filter((t) => t.y > headY && t.x >= CARD_MARGIN + 58 && t.x < q.x && t.align !== 'center');
    assert.ok(steps.length >= 3, `${id}: строки шагов`);
    assert.ok(steps.every((t) => t.x + measure(t.text, t.font) <= q.x - 20), `${id}: шаги упираются в код`);
  }
});

test('подпись «Сканируй — список покупок» над кодом и не заходит выше плашки соли', () => {
  for (const id of IDS) {
    const { L } = build(id);
    const q = L.ops.find((o) => o.t === 'qr');
    const cap = texts(L).filter((t) => t.x >= q.x - 1 && QR_CAPTION.includes(t.text.split(' ')[0]));
    assert.ok(cap.length >= 1, `${id}: подпись`);
    assert.ok(cap.every((t) => t.y < q.y), `${id}: подпись выше кода`);
    assert.equal(texts(L).filter((t) => t.text === 'Как готовить').length, 1);
    assert.ok(L.capTop >= 0 && L.capTop < q.y);
  }
});

test('соль и перец: плашка с ложками и весом у блюд с нормой, без неё — у остальных', () => {
  for (const id of IDS) {
    const { home, L } = build(id);
    const all = texts(L).map((t) => t.text);
    if (RECIPES[id].season) {
      assert.ok(all.includes('Соль') && all.includes(home.season.salt), `${id}: соль`);
      assert.ok(all.includes('Перец') && all.includes(home.season.pepper), `${id}: перец`);
      const norm = all.join(' ').replace(/\u00A0/g, ' ');
      assert.ok(norm.includes(`на ${home.season.gramsText} ${home.season.base}`), `${id}: вес блюда ${home.season.gramsText}`);
    } else {
      assert.ok(!all.includes('Соль'), `${id}: плашки нет`);
      assert.ok(!L.ops.some((o) => o.t === 'rect' && o.stroke), `${id}: рамки плашки нет`);
    }
  }
});

test('в карточке все продукты и шаги: каждое слово из данных попадает в операции рисования', () => {
  for (const id of IDS) {
    const { home, L } = build(id);
    const drawn = texts(L).map((t) => t.text).join(' ').replace(/ /g, ' ');
    for (const it of home.items) assert.ok(drawn.includes(it.name.split(' ')[0]), `${id}: ${it.name}`);
    for (const s of home.steps) for (const w of s.split(' ').filter((x) => x.length > 3)) assert.ok(drawn.includes(w.replace(/[.,:;]+$/, '').replace(/ /g, ' ')), `${id}: слово «${w}»`);
  }
});

test('длинное название сжимается, короткое остаётся крупным', () => {
  const size = (id) => em(texts(build(id).L)[0].font);
  assert.equal(size('olivier'), 84);
  assert.ok(size('tomatoes') < 84, 'Фаршированные помидоры');
  assert.ok(size('tomatoes') >= 54);
});

test('тесная карточка не роняет сборку: fits=false и шаги сокращаются, но не меньше трёх', () => {
  const wide = (t, f) => measure(t, f) * 1.6;
  const { home, L } = build('olivier', wide);
  assert.equal(L.fits, false);
  assert.ok(L.steps >= 3 && L.steps <= home.steps.length);
  assert.ok(L.ops.length > 20);
});

test('клей: число и мера не рвутся, «ч. л.» целиком, тире не в начале строки', () => {
  assert.equal(glue('½ ч. л. на 1,5 кг'), '½ ч. л. на 1,5 кг');
  assert.equal(glue('3 шт. (≈300 г)'), '3 шт. (≈300 г)');
  assert.equal(glue('Яйцо — 3 шт.'), 'Яйцо — 3 шт.');
  assert.ok(!/\d \S/.test(glue('варим 20–25 минут')), 'число отдельно от слова');
});
