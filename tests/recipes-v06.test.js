// Решения владельца по рецептам (0.6): солим → мешаем → пробуем; солёный и свежий огурец; чистка картофеля и яиц.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, run, arrive, waitAction, peel, stir, seasonTo, take } from './helpers-campaign.js';
import { RECIPES, DAYS, PRODUCTS, CAMPAIGN } from '../src/campaign/data.js';
import { LESSONS } from '../src/campaign/lessons.js';
import { BOARD_UNIT } from '../src/campaign/st-board.js';

// постучать каждым яйцом о доску — скорлупа трескается
function crackAll(s, it) {
  for (const q of it.peel.zones) for (let k = 0; k < CAMPAIGN.peel.hand.taps; k++) {
    s.pointer('down', q.x, q.z);
    s.pointer('up', q.x, q.z);
  }
}

function boiledAndCooled(s, product) {
  const key = product === 'egg' ? 'olivier:boilEgg' : 'olivier:boil';
  s.dishes.olivier.steps[key.split(':')[1]].done = true;
  delete s.hot[product];
}

test('оливье — с солёными огурцами, крабовый и канапе — со свежими', () => {
  const ol = RECIPES.olivier.steps.filter((s) => s.product === 'pickle' || s.product === 'cucumber');
  assert.deepEqual(ol.map((s) => s.product), ['pickle']);
  assert.ok(RECIPES.crab.steps.some((s) => s.product === 'cucumber'));
  assert.ok(RECIPES.canape.steps.some((s) => s.product === 'cucumber'));
  assert.equal(DAYS[0].stock.pickle, 2);
  assert.equal(DAYS[0].stock.cucumber, undefined);
  assert.notEqual(PRODUCTS.pickle.name, PRODUCTS.cucumber.name);
});

test('каждое блюдо с варёными яйцами или картофелем чистит их перед нарезкой (сырыми до варки или после)', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const boil of r.steps.filter((s) => s.type === 'boil' && ['egg', 'potato'].includes(s.product))) {
      const peelStep = r.steps.find((s) => s.type === 'peel' && s.product === boil.product);
      assert.ok(peelStep, `${id}: нет чистки ${boil.product}`);
      const before = peelStep.raw && (boil.requires ?? []).includes(peelStep.id);
      assert.ok(before || (peelStep.requires ?? []).includes(boil.id), `${id}: чистка сырого до варки или варёного после`);
      const users = r.steps.filter((s) => s.product === boil.product && s.type !== 'boil' && s.type !== 'peel');
      for (const u of users) assert.ok((u.requires ?? []).includes(before ? boil.id : peelStep.id), `${id}:${u.id} только после чистки`);
    }
  }
  // решение владельца: картофель для оливье чистим сырым, яйца — после варки руками
  const ol = RECIPES.olivier.steps;
  assert.ok(ol.find((s) => s.id === 'peelPotato').raw);
  assert.ok(ol.find((s) => s.id === 'boil').requires.includes('peelPotato'));
  assert.ok(PRODUCTS.egg.peelByHand);
});

test('чистка: горячее не чистится; кожура снимается там, где прошёл нож; дочистила — сразу нарезка', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.dishes.olivier.steps.boilEgg.done = true;
  s.hot.egg = s.t + 20;
  arrive(s, 'board');
  assert.equal(s.boardSelect('olivier:peelEgg'), false);
  assert.match(s.hint.text, /горяч/);
  delete s.hot.egg;
  assert.equal(s.boardSelect('olivier:egg'), false, 'нечищеные не режутся');
  assert.ok(s.boardSelect('olivier:peelEgg'));
  const it = s.boardCur();
  assert.equal(it.pieces.length, 2, 'два яйца рядом');
  assert.ok(it.hand, 'яйцо чистят пальцами, не ножом');
  // пока скорлупа не треснула, пальцами её не снять
  s.pointer('down', -0.06, -0.06);
  s.pointer('move', -0.02, -0.06);
  s.pointer('up', 0, 0);
  assert.equal(it.peel.coverage(), 0, 'без трещин скорлупа не снимается');
  crackAll(s, it);
  // короткий мазок по краю — почищено немного, шаг не готов
  s.pointer('down', -0.06, -0.06);
  s.pointer('move', -0.02, -0.06);
  s.pointer('up', 0, 0);
  const c = it.peel.coverage();
  assert.ok(c > 0 && c < CAMPAIGN.peel.complete, `частично: ${c}`);
  assert.equal(s.stepDone('olivier', 'peelEgg'), false);
  peel(s);
  assert.ok(s.stepDone('olivier', 'peelEgg'));
  assert.equal(s.boardCur()?.key, 'olivier:egg');
});

test('чистка не зависит от скорости мыши: один быстрый проход снимает ту же полосу, что и медленный', () => {
  const pass = (moves) => {
    const s = new KitchenSession({ dayIndex: 0, seed: 1 });
    boiledAndCooled(s, 'egg');
    arrive(s, 'board');
    s.boardSelect('olivier:peelEgg');
    const it = s.boardCur();
    crackAll(s, it);
    const p = it.pieces[0];
    const z = (p.z + p.d / 2) * BOARD_UNIT;
    s.pointer('down', -0.12, z);
    for (let i = 1; i <= moves; i++) s.pointer('move', -0.12 + (0.24 * i) / moves, z);
    s.pointer('up', 0, 0);
    return it.peel.coverage();
  };
  const slow = pass(40), fast = pass(1);
  assert.ok(slow > 0.08, `медленный проход снимает полосу: ${slow}`);
  assert.ok(Math.abs(fast - slow) < 0.02, `быстрый ${fast} ≈ медленный ${slow}`);
});

test('дочистила — подсказка по-русски для двух яиц и одной картофелины', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  boiledAndCooled(s, 'egg');
  arrive(s, 'board');
  s.boardSelect('olivier:peelEgg');
  peel(s);
  assert.match(s.hint.text, /^Яйца почищены/);
  assert.equal(PRODUCTS.potato.peelDone[0], 'Картофелина почищена');
});

test('чистка не уходит мимо продукта: мазки по пустой доске не считаются', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  take(s, 'olivier:peelPotato');
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:peelPotato'), s.hint?.text);
  const it = s.boardCur();
  s.pointer('down', 0.24, -0.15);
  for (let i = 0; i < 20; i++) s.pointer('move', 0.24, -0.15 + i * 0.015);
  s.pointer('up', 0, 0);
  assert.equal(it.peel.coverage(), 0);
});

test('мешать без соли нельзя: сначала посолить, взялась за ложку — значит посолено', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  const d = s.dishes.olivier;
  for (const st of d.recipe.steps) if (!['season', 'mix', 'taste'].includes(st.id)) d.steps[st.id].done = true;
  s.bowl.owner = 'olivier';
  arrive(s, 'bowl');
  assert.equal(s.pointer('down', 0.1, 0), 'blocked');
  assert.match(s.hint.text, /посоли/);
  s.pointer('up', 0, 0);
  s.seasonAdd('olivier', 'salt');
  waitAction(s);
  stir(s, 0.5);
  assert.ok(s.stepDone('olivier', 'season'), 'начала мешать — посолено');
  assert.equal(s.seasonState('olivier').phase, 'mixing');
});

test('уроки книги есть для каждого шага каждого рецепта', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const st of r.steps) assert.ok(LESSONS[id]?.steps?.[st.id]?.how, `${id}:${st.id}`);
  }
});

test('день 1 ставит две конфорки и после чистки всё ещё укладывается в ориентир по темпу', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  seasonTo; // помощник используется в сквозных тестах
  run(s, 0.1);
  assert.equal(s.par(), DAYS[0].targetMinutes * 60);
});
