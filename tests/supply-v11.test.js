// 0.11 B: запаса «на всякий случай» нет — украденное и испорченное пропадает и восполняется доставкой.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession } from '../src/campaign/session.js';
import { DAYS, RECIPES, PRODUCTS, CAMPAIGN, BONUS, TOYS, TINSEL, stepProducts } from '../src/campaign/data.js';
import { applyTreeEvent } from '../src/campaign/persist.js';
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

// ---------- B4: игрушки и мишура едут в доставке ----------

function orderAndReceive(s, mode = 'self') {
  assert.ok(s.confirmOrder(mode), 'заказ принят');
  run(s, (CAMPAIGN.money.modes[mode].away ?? 0) + 40);
}

test('корзина принимает игрушки и мишуру, считает рублями по TOYS.rub / TINSEL.rub', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'phone');
  assert.ok(s.draftSet('toy:ballRed', 2));
  assert.ok(s.draftSet('tinsel:gold', 1));
  assert.equal(s.draftSet('toy:нет-такой', 1), false, 'чужого ключа нет');
  assert.equal(s.draftSet('tinsel:green', 1), false);
  assert.equal(s.orderCost(s.delivery.draft, 'self').goods, TOYS.ballRed.rub * 2 + TINSEL.gold.rub);
  assert.ok(s.draftSet('toy:ballRed', 0));
  assert.equal(s.delivery.draft['toy:ballRed'], undefined, 'ноль убирает позицию');
});

test('заказала шар и мишуру → привезли: игрушка в коробке у ёлки, моток в запасе, очки домохозяйки не тронуты', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1, bonus: 0 });
  s.triggers = [];
  const events = [];
  const pts = s.bonus.points;
  arrive(s, 'phone');
  s.draftSet('toy:ballGold', 2);
  s.draftSet('tinsel:red', 1);
  s.draftSet('sausage', 1);
  const rolls0 = s.tinselLeft('red');
  const sausage0 = s.inventory.available('sausage');
  const cost = s.orderCost(s.delivery.draft, 'self').total;
  const spent0 = s.wallet.spent;
  orderAndReceive(s);
  for (const e of s.drain?.() ?? []) events.push(e);
  assert.equal(s.toysInBox().filter((t) => t.id === 'ballGold').length, 2, 'два шара в коробке');
  assert.equal(s.tinselLeft('red'), rolls0 + CAMPAIGN.tinsel.roll, 'моток прибавился');
  assert.equal(s.inventory.available('sausage'), sausage0 + 1, 'колбаса — в запас, как раньше');
  assert.equal(s.wallet.spent, spent0 + cost, 'платили рублями из бюджета');
  assert.equal(s.bonus.points, pts + Math.round(cost * BONUS.cashback), 'очки не списывались: только кешбэк');
  assert.equal(s.inventory.available('toy:ballGold'), 0, 'игрушка не попала в запас продуктов');
});

test('привоз игрушки отправляет в сохранение событие toyBought с source=delivery, очки в сохранении не списываются', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  const save = { bonus: 100, toys: [], gifts: {} };
  const seen = [];
  arrive(s, 'phone');
  s.draftSet('toy:bell', 1);
  s.draftSet('tinsel:blue', 1);
  s.confirmOrder('self');
  const origEmit = s._emit.bind(s);
  s._emit = (type, data) => {
    if (type === 'toyBought' || type === 'tinselBought') seen.push({ type, ...data });
    return origEmit(type, data);
  };
  run(s, CAMPAIGN.money.modes.self.away + 40);
  assert.equal(seen.length, 2);
  assert.ok(seen.every((e) => e.source === 'delivery' && !e.price));
  for (const e of seen) assert.ok(applyTreeEvent(save, e, { toys: s.toysForSave(), tinsel: s.tinselForSave() }));
  assert.equal(save.bonus, 100, 'очки в сохранении не списаны');
  assert.equal(save.toys.filter((t) => t.id === 'bell').length, 1, 'игрушка записана в сохранение');
  assert.ok(save.tinselRolls.blue >= CAMPAIGN.tinsel.roll - 0.001);
});

test('в практике и испытании украшения не заказываются, продукты — как обычно', () => {
  for (const opts of [{ practice: true }, { challenge: true }]) {
    const s = new KitchenSession({ dayIndex: 0, seed: 1, ...opts });
    arrive(s, 'phone');
    assert.equal(s.draftSet('toy:ballRed', 1), false, JSON.stringify(opts));
    assert.equal(s.draftSet('tinsel:gold', 1), false);
    assert.ok(s.draftSet('sausage', 1));
  }
});

test('заказ с игрушками нельзя оплатить сверх бюджета: денег не хватает → заказ не уходит', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'phone');
  s.wallet.spent = s.wallet.budget - 10;
  s.draftSet('toy:santa', 1);
  assert.equal(s.confirmOrder('self'), false);
  assert.equal(s.delivery.order, null);
  assert.equal(s.toysInBox().length, 0);
});

test('кот утащил кусок, запаса нет — доска говорит «закажи замену в телефоне», а не «возьми» (регрессия ревью 0.11)', async () => {
  const { KitchenSession, arrive, cutCubes } = await import('./helpers-campaign.js');
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:sausage'), s.hint?.text);
  cutCubes(s);
  const it = s.boardCur();
  it.missing.push({ id: -1 }); // кусок унёс кот
  // свободного запаса нет (всё, что лежит, зарезервировано под шаги)
  s.inventory.stock.sausage = s.inventory.reservedOf('sausage');
  assert.equal(s.inventory.available('sausage'), 0);
  assert.match(s.transferBlock(it), /закажи замену в телефоне/);
  // привезли замену — теперь её берут на доске
  s.inventory.stock.sausage += 1;
  assert.match(s.transferBlock(it), /возьми замену/);
});
