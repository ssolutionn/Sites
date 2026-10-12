// 0.11 B: запаса «на всякий случай» нет — украденное и испорченное пропадает и восполняется доставкой.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession } from '../src/campaign/session.js';
import { DAYS, RECIPES, PRODUCTS, CAMPAIGN, stepProducts } from '../src/campaign/data.js';
import { TEMPTING } from '../src/campaign/st-extra.js';
import { arrive, run, cutCubes } from './helpers-campaign.js';

/** Сколько каждого продукта нужно дню по рецептам (без запаса). */
function dayNeeds(day) {
  const need = {};
  for (const dishId of day.dishes) for (const st of RECIPES[dishId].steps) for (const [id, q] of Object.entries(stepProducts(dishId, st, undefined))) need[id] = (need[id] ?? 0) + q;
  return need;
}

test('запас дня не больше, чем нужно по рецептам, — лишних «запасных порций» нет', () => {
  for (const [i, day] of DAYS.entries()) {
    const need = dayNeeds(day);
    for (const [id, q] of Object.entries(day.stock)) {
      // майонез в шубе считается по слоям, его запас задуман отдельно
      if (id === 'mayo') continue;
      assert.ok(q <= (need[id] ?? 0), `день ${i + 1}: ${id} — в запасе ${q}, по рецептам ${need[id] ?? 0}`);
    }
  }
});

test('бюджет каждого дня покрывает докупку по рецептам и одну замену самого дорогого «вкусного» продукта', () => {
  for (const [i, day] of DAYS.entries()) {
    const need = dayNeeds(day);
    let buy = 0;
    for (const id of Object.keys(need)) buy += Math.max(0, need[id] - (day.stock[id] ?? 0)) * (PRODUCTS[id].price ?? 0);
    const used = Object.keys(need).filter((id) => TEMPTING[id] || id === 'chicken');
    const repl = Math.max(0, ...used.map((id) => PRODUCTS[id].price ?? 0));
    assert.ok(day.budget >= buy + repl, `день ${i + 1}: бюджет ${day.budget} ₽, нужно ${buy} + замена ${repl}`);
  }
});

test('кот унёс колбасу, запаса нет → замены нет, в корзине «для замены» первая; заказ → замена доступна', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  cutCubes(s);
  assert.equal(s._stealFromBoard('sausage'), 'sausage');
  assert.ok(s.boardCur().missing.length, 'кусок унесён');
  assert.equal(s.inventory.available('sausage'), 0);
  assert.equal(s.takeReplacement(), false);
  assert.match(s.hint.text, /запас кончился/);
  const first = s.shopping()[0];
  assert.equal(first.id, 'sausage');
  assert.ok(first.repl && first.lack === 1, 'позиция для замены стоит первой');

  arrive(s, 'phone');
  s.draftSet('sausage', 1);
  assert.ok(s.confirmOrder('self'));
  run(s, CAMPAIGN.money.modes.self.away + 15);
  assert.equal(s.inventory.available('sausage'), 1, 'привезли — в запасе без разбора пакета');
  arrive(s, 'board');
  assert.ok(s.takeReplacement());
  run(s, CAMPAIGN.durations.replacement + 0.5);
  assert.equal(s.boardCur().missing.length, 0);
});
