// Тесты кампании 0.4: наблюдаемые правила по группам раздела 19 ТЗ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN, DAYS, RECIPES } from '../src/campaign/data.js';
import { Inventory } from '../src/campaign/inventory.js';
import { buildNav } from '../src/campaign/session.js';
import { CoverageMask } from '../src/campaign/coverage.js';
import { Stirrer, Grater, makeRoundLog, cutRound, roundQuality, cutQuality, roundSlices } from '../src/campaign/mechanics.js';
import { parseSave, emptySave, recordDay, campaignScore, SaveStore } from '../src/campaign/save.js';
import { dishScore, dayScore } from '../src/campaign/scoring.js';
import { initialPieces, cutAcross, totalVolume, rotatePieces } from '../src/game/cutting.js';
import { TRAY, SINK, CANAPE_PILES, FRUIT_PILES, CLAYOUT } from '../src/campaign/layout.js';
import { BOARD_UNIT } from '../src/campaign/st-board.js';
import { KitchenSession, run, arrive, waitAction, cutCubes, cutRounds, stir, zigzag } from './helpers-campaign.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);
let serial = 50000;
const opts = { minWidth: 0.2, maxPieces: 150, nextId: () => serial++ };

// ---------- 1. Геометрия ----------
test('геометрия: удар по реальной координате, объём сохраняется с точностью 1e-6', () => {
  const p = initialPieces(4, 2, () => serial++, 'carrot');
  const v0 = totalVolume(p);
  const r = cutAcross(p, 0.731, opts);
  assert.ok(r.ok);
  close(totalVolume(r.pieces), v0);
  close(r.pieces[0].x + r.pieces[0].w, 0.731);
});

test('геометрия: четыре поворота возвращают исходную раскладку', () => {
  let p = initialPieces(4, 2, () => serial++, 'oval');
  p = cutAcross(p, 0.4, opts).pieces;
  const before = JSON.stringify(p.map((q) => [q.id, q.x.toFixed(9), q.z.toFixed(9), q.w.toFixed(9)]));
  let r = p;
  for (let i = 0; i < 4; i++) r = rotatePieces(r);
  assert.equal(JSON.stringify(r.map((q) => [q.id, q.x.toFixed(9), q.z.toFixed(9), q.w.toFixed(9)])), before);
});

test('геометрия: краевые обрезки до 10 % не штрафуются, внутренние фрагменты обрезком не считаются', () => {
  // идеальная прямоугольная нарезка
  let rect = initialPieces(3, 2, () => serial++);
  for (const x of [-0.5, 0.5]) rect = cutAcross(rect, x, opts).pieces;
  rect = rotatePieces(rect);
  rect = cutAcross(rect, 0, opts).pieces;
  close(cutQuality(rect, 6, CAMPAIGN.tolerance, 0.1).score, 1);
  // округлый продукт: аккуратная нарезка по сетке даёт высокий балл благодаря допуску краёв
  let oval = initialPieces(4, 2, () => serial++, 'oval');
  const v0 = totalVolume(oval);
  for (const x of [-1, 0, 1]) oval = cutAcross(oval, x, opts).pieces;
  oval = rotatePieces(oval);
  oval = cutAcross(oval, 0, opts).pieces;
  const q = cutQuality(oval, v0, CAMPAIGN.tolerance, 0.1);
  assert.ok(q.score > 0.85, `score ${q.score}`);
  // защита от обхода: измельчение в мелочь не даёт высокий балл
  let mince = initialPieces(4, 2, () => serial++, 'oval');
  for (let x = -1.9; x < 1.9; x += 0.3) {
    const r = cutAcross(mince, x, opts);
    if (r.ok) mince = r.pieces;
  }
  mince = rotatePieces(mince);
  for (let x = -0.9; x < 0.9; x += 0.3) {
    const r = cutAcross(mince, x, opts);
    if (r.ok) mince = r.pieces;
  }
  assert.ok(cutQuality(mince, v0, CAMPAIGN.tolerance, 0.1).score < 0.2);
});

test('геометрия: кружочки — толщина от координаты, тонкий разрез отклоняется, торцы допустимы', () => {
  let log = makeRoundLog(5);
  const rt = CAMPAIGN.roundTarget;
  assert.equal(cutRound(log, -2.45, rt.minCut).ok, false);
  for (let x = -2.2; x < 2.4; x += 0.5) {
    const r = cutRound(log, x, rt.minCut);
    if (r.ok) log = r.log;
  }
  const slices = roundSlices(log);
  close(slices.reduce((s, q) => s + q.t, 0), 5);
  assert.ok(slices.filter((q) => !q.end).every((q) => Math.abs(q.t - 0.5) < 1e-9));
  assert.ok(roundQuality(log, rt, 0.1).score > 0.85);
});

// ---------- 2. Учёт ----------
test('учёт: резерв и списание одной порции по ID, отмена не списывает', () => {
  const inv = new Inventory({ egg: 2 });
  assert.ok(inv.reserve('a', { egg: 1 }));
  assert.ok(inv.reserve('a', { egg: 1 })); // повтор — без второго резерва
  assert.equal(inv.available('egg'), 1);
  assert.ok(inv.consume('a'));
  assert.equal(inv.consume('a'), false);
  assert.equal(inv.count('egg'), 1);
  assert.ok(inv.reserve('b', { egg: 1 }));
  inv.release('b');
  assert.equal(inv.count('egg'), 1);
  assert.equal(inv.reserve('c', { egg: 2 }), false);
});

test('учёт: переключение продуктов на доске не даёт бесконечных порций', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:carrot'));
  assert.ok(s.boardSelect('olivier:egg'));
  assert.ok(s.boardSelect('olivier:carrot'));
  assert.equal(s.inventory.available('carrot'), 0);
  assert.equal(s.inventory.count('carrot'), 1);
  cutCubes(s);
  assert.ok(s.boardTransfer());
  assert.equal(s.inventory.count('carrot'), 0);
  assert.equal(s.boardSelect('olivier:carrot'), false);
});

test('учёт: кража конкретного фрагмента сохраняет остальные, замена берёт запасную порцию и тот же контур', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  const it = s.boardCur();
  s.pointer('down', -0.5 * BOARD_UNIT, 0);
  s.pointer('up', 0, 0);
  waitAction(s);
  const vol = totalVolume(it.pieces);
  const others = it.pieces.length - 1;
  s._startCatTheft();
  run(s, 13);
  assert.equal(s.stats.thefts, 1);
  assert.equal(it.pieces.length, others);
  assert.match(s.transferBlock(), /замен/);
  assert.equal(s.inventory.count('sausage'), 2);
  assert.ok(s.takeReplacement());
  waitAction(s);
  close(totalVolume(it.pieces), vol);
  assert.equal(s.inventory.count('sausage'), 1);
  assert.equal(s.shoo(), false); // у события уже есть исход
});

test('учёт: переполнение начинки снимается ложкой и возвращается на тарелку', () => {
  const s = new KitchenSession({ practice: { activity: 'fill' }, seed: 1 });
  arrive(s, 'tray');
  s.traySelect('practice');
  s.setTool('spoon');
  const cup = s.dishes.practice.work.cups[0];
  const plate = TRAY.workPlate;
  for (let i = 0; i < 5; i++) {
    s.pointer('down', plate.x, plate.z);
    s.pointer('up', 0, 0);
    s.pointer('down', cup.x, cup.z);
    s.pointer('up', 0, 0);
  }
  assert.ok(cup.fill > CAMPAIGN.fill.overflow);
  const total = s.workPlate.amount + cup.fill;
  s.pointer('down', cup.x, cup.z); // пустой ложкой — снять
  s.pointer('up', 0, 0);
  s.pointer('down', plate.x, plate.z); // вернуть на тарелку
  s.pointer('up', 0, 0);
  close(s.workPlate.amount + cup.fill, total);
  assert.equal(s.spoon.load, 0);
});

// ---------- 3. Рецепт ----------
test('рецепт: условия шагов и отсутствие ингредиента с понятной причиной', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  assert.match(s.stepBlock('sandwiches', 'dose'), /Сначала/);
  s.dishes.sandwiches.steps.spread.done = true;
  assert.match(s.stepBlock('sandwiches', 'dose'), /икра.*закажи/i);
});

test('рецепт: вариант без лука пропускает шаг и выполняет пожелание', () => {
  const s = new KitchenSession({ dayIndex: 3, seed: 1 });
  run(s, 6);
  assert.ok(s.requestKnown);
  assert.ok(s.setVariant('tomatoes', false));
  assert.equal(s.stepState('tomatoes', 'onion'), 'skipped');
  assert.equal(s.stepState('tomatoes', 'mix'), 'locked');
  assert.ok(!s.shopping().some((x) => x.id === 'onion'));
});

test('рецепт: шуба — слои по порядку, последний ошибочный слой отменяется с возвратом', () => {
  const s = new KitchenSession({ dayIndex: 4, seed: 1 });
  const d = s.dishes.shuba;
  for (const id of ['boil', 'herring', 'onion', 'potato', 'carrot', 'beet']) d.steps[id].done = true;
  for (const id of ['herring', 'onion', 'potato', 'carrot', 'beet']) d.prepared[id] = { product: id, q: 1 };
  arrive(s, 'tray');
  assert.ok(s.traySelect('shuba'));
  const w = d.work;
  assert.ok(s.shubaChoose('mayo')); // ошибка: майонез первым
  s.pointer('down', w.dish.x, w.dish.z);
  s.pointer('up', 0, 0);
  zigzag(s, w.dish.x, w.dish.z, 0.2, 0.2, 10);
  assert.ok(s.shubaConfirmLayer());
  assert.equal(s.inventory.count('mayo'), 0);
  assert.ok(s.shubaUndo());
  assert.equal(w.layers.length, 0);
  assert.equal(s.inventory.count('mayo'), 1);
  assert.ok(s.shubaChoose('herring'));
});

// ---------- 4. Ручные действия ----------
test('ручные: повторное намазывание не даёт больше 100 %', () => {
  const m = new CoverageMask({ ...CAMPAIGN.spread, width: 0.1, depth: 0.08 });
  for (let i = 0; i < 30; i++) m.strokeLine({ x: -0.05, z: 0 }, { x: 0.05, z: 0 });
  const c1 = m.coverage();
  for (let i = 0; i < 30; i++) m.strokeLine({ x: -0.05, z: 0 }, { x: 0.05, z: 0 });
  assert.equal(m.coverage(), c1);
  assert.ok(c1 <= 1);
  m.fill(1);
  assert.equal(m.coverage(), 1);
});

test('ручные: неподвижное удержание и дрожание не перемешивают, круги — перемешивают', () => {
  const st = new Stirrer(CAMPAIGN.mix);
  for (let i = 0; i < 500; i++) st.move(0.1 + (i % 2) * 0.0005, 0);
  assert.ok(st.turns < 0.05);
  for (let i = 0; i <= 36 * 4; i++) st.move(Math.cos((i / 36) * 6.283) * 0.1, Math.sin((i / 36) * 6.283) * 0.1);
  assert.ok(st.turns >= 3.9);
  const jump = new Stirrer(CAMPAIGN.mix);
  for (let i = 0; i < 100; i++) jump.move(i % 2 ? 0.12 : -0.12, 0);
  assert.ok(jump.turns < 0.1);
});

test('ручные: тёрка засчитывает только полные циклы', () => {
  const g = new Grater(CAMPAIGN.grate, 3);
  for (let i = 0; i < 50; i++) g.move((i % 2) * 0.01); // дрожание в середине
  assert.equal(g.done, 0);
  g.move(-0.05); // старт сверху
  for (let i = 0; i < 2; i++) {
    g.move(0.05);
    g.move(-0.05);
  }
  assert.equal(g.done, 2);
  g.move(0.05); // половина цикла не засчитывается
  assert.equal(g.done, 2);
  g.move(-0.05);
  assert.equal(g.done, 3);
  assert.ok(g.complete);
});

test('ручные: перетаскивание на шпажку — подходящий слот принимает, мимо — возврат', () => {
  const s = new KitchenSession({ dayIndex: 5, seed: 1 });
  const d = s.dishes.canape;
  for (const id of ['bread', 'cheese', 'sausage', 'cucumber']) {
    d.steps[id].done = true;
    d.pieces[id] = Array.from({ length: 8 }, (_, i) => ({ id: i, product: id, used: false }));
  }
  arrive(s, 'tray');
  s.traySelect('canape');
  const pile = CANAPE_PILES[0];
  const slot = d.work.skewers[0].slots[0];
  s.pointer('down', pile.x, pile.z);
  s.pointer('move', 0.9, 0.9);
  s.pointer('up', 0.9, 0.9);
  assert.equal(s.canapeSupply().bread, 8);
  s.pointer('down', pile.x, pile.z);
  s.pointer('move', slot.x, slot.z);
  s.pointer('up', slot.x, slot.z);
  assert.equal(s.canapeSupply().bread, 7);
  assert.ok(d.work.skewers[0].pieces[0]);
});

// ---------- 5. Помехи ----------
test('помехи: кража не стартует без колбасы на доске; в первый день не больше одной срочной', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  run(s, 40);
  assert.equal(s.cat.state, 'home');
  arrive(s, 'stove');
  s.placePot();
  waitAction(s);
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  let maxUrgent = 0;
  for (let i = 0; i < 100 * 30; i++) {
    s.update(1 / 30);
    maxUrgent = Math.max(maxUrgent, s.urgentCount());
  }
  assert.ok(maxUrgent <= 1);
  assert.ok(s.stats.thefts + s.stats.shoos >= 1 || s.cat.state !== 'home' || s.triggers.find((e) => e.type === 'cat').fired);
});

test('помехи: пропуск выкипания — одна лужа и один штраф, лужа блокирует проход до уборки', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'stove');
  s.placePot();
  waitAction(s);
  s._startOverflow();
  run(s, 20);
  assert.equal(s.puddles.length, 1);
  assert.equal(s.penalties.filter((p) => p.kind === 'spill').length, 1);
  const p = s.puddles[0];
  assert.equal(s.nav.isFree(p.x, p.z), false);
  arrive(s, 'puddle');
  for (let i = 0; i < 8 && s.puddles.length; i++) zigzag(s, 0, 0, 0.55, 0.4, 9);
  assert.equal(s.puddles.length, 0);
  assert.ok(s.nav.isFree(p.x, p.z));
});

test('помехи: радио, выключенное игроком, не ломается; поломка — один раз', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  arrive(s, 'radio');
  s.toggleRadio();
  run(s, 150);
  assert.equal(s.radio.broken, false);
  const s2 = new KitchenSession({ dayIndex: 1, seed: 1 });
  run(s2, 150);
  assert.equal(s2.radio.broken, true);
  assert.equal(s2.radio.breaks, 1);
  run(s2, 60);
  assert.equal(s2.radio.breaks, 1);
});

// ---------- 6. Время ----------
test('время: картофель кампании готов через 2:00 даже при пропуске кадров', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'stove');
  s.placePot();
  waitAction(s);
  const t0 = s.stove.startT;
  close(s.stove.readyAt - t0, 120);
  while (s.t < t0 + 119.9) s.update(0.25);
  assert.equal(s.stove.state, 'boiling');
  s.update(0.25);
  assert.equal(s.stove.state, 'ready');
});

test('время: пауза — update не вызывается, сроки стоят; ускорение проходит все дедлайны', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  arrive(s, 'phone');
  s.draftSet('caviar', 1);
  s.confirmOrder();
  const t = s.t;
  // «пауза»: время не идёт без update
  assert.equal(s.delivery.order.status, 'accepted');
  assert.equal(s.t, t);
  assert.ok(s.waitDelivery());
  assert.equal(s.delivery.order.status, 'arrived');
  assert.ok(s.t > t + 40);
});

test('время: духовка — готовность, окно, перегрев и порча с исправимой заменой', () => {
  const s = new KitchenSession({ dayIndex: 6, seed: 1 });
  arrive(s, 'tray');
  s.traySelect('chicken');
  zigzag(s, 0, 0, 0.25, 0.16, 12);
  zigzag(s, 0, 0, 0.25, 0.16, 12);
  assert.ok(s.stepDone('chicken', 'marinade'));
  arrive(s, 'oven');
  s.ovenLoad();
  waitAction(s);
  run(s, CAMPAIGN.oven.bake + 1);
  assert.equal(s.oven.state, 'ready');
  run(s, 31 + CAMPAIGN.oven.burnAfter + 1);
  assert.equal(s.oven.state, 'burnt');
  s.ovenTake();
  waitAction(s);
  assert.equal(s.dishes.chicken.done, false);
  assert.equal(s.stepDone('chicken', 'marinade'), false);
  assert.equal(s.equipment.form.clean, false);
  assert.equal(s.inventory.available('chicken'), 1);
});

// ---------- 7. Доставка ----------
test('доставка: один заказ, позиции фиксируются, получение после прибытия, пакет отдельно от запасов, разбор один раз', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1 });
  arrive(s, 'phone');
  s.draftSet('caviar', 1);
  assert.ok(s.confirmOrder());
  assert.equal(s.confirmOrder(), false);
  assert.equal(s.draftSet('mayo', 2), false);
  assert.equal(s.collectOrder(), false);
  s.waitDelivery();
  assert.equal(s.collectOrder(), true);
  for (let i = 0; i < 900 && s.panel !== 'bag'; i++) s.update(1 / 30);
  assert.equal(s.inventory.count('caviar'), 0); // пакет ещё не разобран
  assert.equal(s.unpack(0, 'pantry'), false); // неверное место
  assert.ok(s.unpack(0, 'fridge'));
  waitAction(s);
  assert.equal(s.inventory.count('caviar'), 1);
  assert.equal(s.delivery.bag, null);
  assert.equal(s.unpack(0, 'fridge'), false);
});

// ---------- 8. Кампания и сохранение ----------
test('кампания: день не завершается до готовности блюд; результат открывает следующий день', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  assert.equal(s.finishDay(), null);
  const save = emptySave();
  recordDay(save, 2, { D: 70, dishes: { crab: 70 } });
  assert.ok(save.days[2].unlocked);
  recordDay(save, 2, { D: 60, dishes: { crab: 60 } });
  assert.equal(save.days[1].best.D, 70);
  assert.equal(save.days[1].last.D, 60);
  assert.equal(campaignScore(save), Math.round(70 / 7));
});

test('сохранение: восстановление, повреждённые данные и неизвестная версия без падения', () => {
  const save = emptySave();
  recordDay(save, 1, { D: 88, dishes: { olivier: 88 } });
  const back = parseSave(JSON.stringify(save));
  assert.equal(back.status, 'ok');
  assert.equal(back.save.days[0].best.D, 88);
  assert.ok(back.save.days[1].unlocked);
  assert.equal(parseSave('{bad json').status, 'reset');
  assert.equal(parseSave(JSON.stringify({ version: 99, days: [] })).status, 'reset');
  const mem = { data: {}, getItem(k) { return this.data[k] ?? null; }, setItem(k, v) { this.data[k] = v; } };
  const st = new SaveStore(mem);
  recordDay(st.data, 1, { D: 50, dishes: { olivier: 50 } });
  st.write();
  assert.equal(new SaveStore(mem).data.days[0].best.D, 50);
});

test('оценка: неприменимые характеристики не дают бесплатных баллов', () => {
  assert.equal(dishScore({ prep: 80, comp: 100, asm: 60 }), Math.round((0.35 * 80 + 0.25 * 100 + 0.25 * 60) / 0.85));
  assert.equal(dishScore({ prep: 100, comp: 100, asm: 100, wish: 0 }), 85);
  assert.equal(dayScore([90, 70], 100), Math.round(0.85 * 80 + 15));
});

// ---------- 9. Сброс ----------
test('сброс: новая попытка не содержит старых фрагментов, событий, покупок и таймеров', () => {
  const a = new KitchenSession({ dayIndex: 2, seed: 4 });
  arrive(a, 'phone');
  a.draftSet('caviar', 1);
  a.confirmOrder();
  run(a, 30);
  const b = new KitchenSession({ dayIndex: 2, seed: 4 });
  assert.equal(b.delivery.order, null);
  assert.equal(b.t, 0);
  assert.equal(b.alerts.length, 0);
  assert.equal(Object.keys(b.board.items).length, 0);
  assert.equal(b.inventory.count('caviar'), 0);
});

// ---------- Сквозные дни ----------
test('день 1: оливье от плиты до перемешивания, затем завершение дня', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 3 });
  arrive(s, 'stove');
  s.placePot();
  waitAction(s);
  for (const key of ['olivier:carrot', 'olivier:sausage', 'olivier:cucumber', 'olivier:egg']) {
    arrive(s, 'board');
    s.boardSelect(key);
    cutCubes(s);
    if (s.cat.state === 'theft') s.shoo();
    assert.ok(s.boardTransfer(), s.hint?.text);
  }
  run(s, s.stove.readyAt - s.t + 0.5);
  if (s.stove.overflow) {
    arrive(s, 'stove');
    s.reduceHeat();
    waitAction(s);
  }
  arrive(s, 'stove');
  s.takePot();
  waitAction(s);
  arrive(s, 'board');
  s.boardSelect('olivier:potato');
  cutCubes(s);
  assert.ok(s.boardTransfer());
  arrive(s, 'bowl');
  s.bowlAdd('olivier', 'peas');
  waitAction(s);
  arrive(s, 'bowl');
  assert.equal(s.dishes.olivier.done, false);
  s.bowlAdd('olivier', 'mayo');
  waitAction(s);
  stir(s);
  assert.ok(s.dishes.olivier.done);
  assert.ok(s.dishes.olivier.Q >= 60);
  const r = s.finishDay();
  assert.ok(r && r.D > 0);
  assert.equal(s.equipment.bowl.clean, false);
});

test('день 7: финальная сервировка требует все 10 блюд на столе', () => {
  const prev = ['olivier', 'crab', 'sandwiches', 'eggs', 'tartlets', 'tomatoes', 'shuba', 'canape', 'fruit'];
  const s = new KitchenSession({ dayIndex: 6, seed: 1, tableDishes: prev });
  arrive(s, 'table');
  prev.forEach((id, i) => assert.ok(s.serveDish(id, i)));
  assert.equal(s.serveDish('chicken', 9), false); // ещё не готова
  assert.equal(s.serveDish('olivier', 0), true); // перестановка на своё же место
  assert.equal(s.serveDish('crab', 0), false); // занято
  assert.equal(s.finalServeDone(), false);
});

test('данные: семь глав и десять блюд, у каждого блюда есть шаги', () => {
  assert.equal(DAYS.length, 7);
  const dishes = DAYS.flatMap((d) => d.dishes);
  assert.equal(new Set(dishes).size, 10);
  for (const id of dishes) assert.ok(RECIPES[id].steps.length >= 1);
  assert.equal(CAMPAIGN.potatoReadyAfter, 120);
  assert.ok(CLAYOUT.stations.table && CLAYOUT.stations.sink && CLAYOUT.stations.oven);
  assert.ok(SINK.w > 0 && FRUIT_PILES.apple);
});
