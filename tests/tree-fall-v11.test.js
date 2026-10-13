// 0.11, владелец: «Пусть он (кот) роняет ёлку, если хочет и ему вздумалось». Кот роняет ёлку: игрушки на полу, часть стеклянных
// бьётся, мишура слетает в мотки, звезда гаснет; поднять — жестом (зажать ствол или верхушку и тянуть вверх); пока лежит — вешать нельзя;
// в конце дня штраф; наутро ёлка стоит, а игрушки в коробке. Игрушки с пола подбирают по одной (кнопки «Поднять игрушки» нет).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, run } from './helpers-campaign.js';
import { CAMPAIGN, TOYS } from '../src/campaign/data.js';
import { outerRadius, pathLength } from '../src/campaign/tree-geo.js';
import { emptySave, parseSave } from '../src/campaign/save.js';
import { applyTreeEvent } from '../src/campaign/persist.js';

const C = CAMPAIGN.cat;
const T = CAMPAIGN.tree;
const at = (y, a) => {
  const r = outerRadius(y);
  return { x: Math.round(Math.sin(a) * r * 100) / 100, y, z: Math.round(Math.cos(a) * r * 100) / 100 };
};
// ёлка с тремя игрушками: два шара (стекло) и шишка, плюс мишура
const dressed = (opts = {}) => {
  const s = new KitchenSession({ dayIndex: 1, seed: 7, toys: [{ id: 'ballRed', at: at(0.8, 0.0) }, { id: 'ballBlue', at: at(1.1, 1.0) }, { id: 'cone', at: at(1.4, 2.0) }], ...opts });
  s.addTinselRoll('gold');
  arrive(s, 'tree');
  s.tinselPick('gold');
  s.tinselStart(at(0.7, 0.5));
  for (let i = 1; i <= 8; i++) s.tinselMove(at(0.7, 0.5 + i * 0.2));
  s.pointerUp();
  s.drain();
  return s;
};
// генератор бросков: по очереди значения из списка
const rolls = (...vals) => {
  let i = 0;
  return { next: () => vals[i++ % vals.length] };
};

test('ёлка падает: игрушки на пол, стеклянные бьются по броску, мишура — в мотки, звезда гаснет, лежит под наклоном', () => {
  const s = dressed();
  const threads = s.tinsel.threads.length;
  const len = s.tinsel.threads.reduce((a, t) => a + pathLength(t.pts), 0);
  assert.equal(threads, 1);
  const leftBefore = s.tinselLeft('gold');
  s.rng = rolls(0.1, 0.9); // первый шар бьётся (0,1 < 0,3), второй — цел
  assert.ok(s._dropTree());
  assert.equal(s.treeFall.down, true);
  assert.equal(s.treeFall.tilt, T.fallTilt);
  assert.deepEqual(s.toys.map((t) => t.id), ['ballBlue', 'cone'], 'красный шар разбился');
  assert.ok(s.toys.every((t) => t.fallen && t.at === null));
  assert.equal(s.tinsel.threads.length, 0);
  assert.ok(Math.abs(s.tinselLeft('gold') - (leftBefore + len)) < 1e-3, 'длина вернулась в моток');
  assert.equal(s.star.broken, true);
  assert.ok(s.alerts.some((a) => a.key === 'tree'));
  const ev = s.drain();
  assert.deepEqual(ev.filter((e) => e.type === 'toyBroken').map((e) => e.id), ['ballRed']);
  const fell = ev.find((e) => e.type === 'treeFell');
  assert.deepEqual(fell.broken.map((b) => b.id), ['ballRed']);
  assert.deepEqual(fell.fallen.map((b) => b.id), ['ballBlue', 'cone']);
  assert.ok(Math.abs(fell.tinsel.gold - len) < 1e-3);
  assert.equal(s._dropTree(), false, 'уже лежит');
});

test('бой игрушек: только шары и сосульки, шанс toyBreakChance; ровно на границе не бьётся, ниже — бьётся; шишка цела всегда', () => {
  const run1 = (v) => {
    const s = dressed();
    s.rng = rolls(v);
    s._dropTree();
    return s.toys.map((t) => t.id);
  };
  assert.deepEqual(run1(C.toyBreakChance - 1e-9), ['cone'], 'оба шара разбились');
  assert.deepEqual(run1(C.toyBreakChance), ['ballRed', 'ballBlue', 'cone'], 'ровно шанс — цела');
  assert.deepEqual(run1(C.toyBreakChance * 1.1), ['ballRed', 'ballBlue', 'cone'], 'шанс + 10 % — цела');
  assert.equal(C.toyBreakChance, 0.3);
});

test('бой детерминирован: тот же seed — тот же результат', () => {
  const a = dressed(), b = dressed();
  a._dropTree();
  b._dropTree();
  assert.deepEqual(a.toys.map((t) => t.id), b.toys.map((t) => t.id));
  const other = dressed({ seed: 123456 });
  other._dropTree();
  assert.ok(other.toys.length >= 1);
});

test('пока ёлка лежит: повесить, взять моток и вести нитку нельзя — подсказка «подними»', () => {
  const s = dressed();
  s.rng = rolls(0.9);
  s._dropTree();
  s.toys[0].fallen = false; // подобрана в коробку
  assert.ok(s.pickToy(s.toys[0].uid));
  assert.equal(s.treeClick(at(1.0, 0.5)), false);
  assert.match(s.hint.text, /Ёлка лежит/);
  assert.equal(s.hangCheck(at(1.0, 0.5)).why, 'down');
  assert.equal(s.dropToy(at(1.0, 0.5)), false);
  assert.equal(s.tinselPick('gold'), false);
  assert.equal(s.tinselStart(at(1.0, 0.5)), false);
});

test('поднять ёлку жестом: зажать ствол, потянуть — наклон идёт за мышью; отпустила — остаётся где была; выше — встаёт', () => {
  const s = dressed();
  s._dropTree();
  s.drain();
  assert.equal(s.treeLiftStart('trunk', 75), true);
  assert.equal(s.treeLiftMove(75), 'lift');
  assert.equal(s.treeLiftMove(45), 'lift');
  assert.equal(s.treeFall.tilt, 45);
  assert.equal(Math.round(s.treeLiftProgress() * 100), 40);
  s.pointerUp(); // отпустила
  assert.equal(s.treeFall.grab, null);
  assert.equal(s.treeFall.tilt, 45, 'ёлка осталась, где была');
  assert.equal(s.treeFall.down, true);
  assert.equal(s.treeLiftMove(10), 'idle', 'без нажатия мышь ёлку не двигает');
  // второй заход — за верхушку, с того же места
  assert.equal(s.treeLiftStart('tip', 45), true);
  assert.equal(s.treeLiftMove(60), 'lift');
  assert.equal(s.treeFall.tilt, 60, 'вниз — наклон растёт, но не дальше падения');
  assert.equal(s.treeLiftMove(100), 'lift');
  assert.equal(s.treeFall.tilt, T.fallTilt, 'не ниже, чем упала');
  assert.equal(s.treeLiftMove(0), 'up');
  assert.equal(s.treeFall.down, false);
  assert.equal(s.treeFall.tilt, 0);
  assert.equal(s.alerts.some((a) => a.key === 'tree'), false);
  assert.ok(s.drain().some((e) => e.type === 'treeUp'));
  assert.equal(s.treeLiftProgress(), 1);
});

test('подъём: наклон ровно liftDone — ёлка стоит; на 10 % больше — ещё лежит', () => {
  const edge = (tilt) => {
    const s = dressed();
    s._dropTree();
    s.treeLiftStart('trunk', 70);
    return [s.treeLiftMove(70 - (T.fallTilt - tilt)), s.treeFall.down];
  };
  assert.deepEqual(edge(T.liftDone), ['up', false]);
  assert.deepEqual(edge(T.liftDone * 1.1), ['lift', true]);
});

test('взяться можно только за ствол или верхушку; середина — отказ с подсказкой; вдали от ёлки жест не начать', () => {
  const s = dressed();
  s._dropTree();
  assert.equal(s.treeLiftStart(null, 70), false);
  assert.match(s.hint.text, /ствол или за верхушку/);
  assert.equal(s.treeLiftStart('trunk', NaN), false);
  assert.equal(s.treeFall.grab, null);
  s.closePanel();
  assert.equal(s.treeLiftStart('trunk', 70), false, 'не у ёлки');
});

test('игрушки с пола подбирают по одной: у ёлки, клик по каждой; все подобраны — подсказка и уведомление уходит', () => {
  const s = dressed();
  s.rng = rolls(0.9);
  s._dropTree();
  assert.equal(s.pickUpToys, undefined, 'кнопки «Поднять игрушки» нет');
  const [a, b, c] = s.toysOnFloor();
  assert.equal(s.toysOnFloor().length, 3);
  assert.equal(s.toysInBox().length, 0);
  s.drain();
  assert.ok(s.pickUpToy(a.uid));
  assert.equal(s.toysInBox().length, 1);
  assert.equal(s.pickUpToy(a.uid), false, 'уже в коробке');
  assert.equal(s.pickUpToy(999), false);
  assert.ok(s.pickUpToy(b.uid));
  assert.ok(s.pickUpToy(c.uid));
  const ev = s.drain().filter((e) => e.type === 'toyPicked');
  assert.deepEqual(ev.map((e) => e.left), [2, 1, 0]);
  assert.match(s.hint.text, /в коробке/);
  s.closePanel();
  assert.equal(s.pickUpToy(a.uid), false);
});

test('поднимать игрушки можно только у ёлки', () => {
  const s = dressed();
  s.rng = rolls(0.9);
  s._dropTree();
  s.closePanel();
  assert.equal(s.pickUpToy(s.toysOnFloor()[0].uid), false);
});

test('штраф: день закончился с лежащей ёлкой — treeLeft и запись; поднята — штрафа нет', () => {
  const s = dressed();
  const base = s.orderScore().score;
  s._dropTree();
  const o = s.orderScore();
  assert.ok(o.notes.some((n) => /Ёлка так и лежит/.test(n)));
  const toysLeft = CAMPAIGN.scoring.order.toysLeft;
  const expected = base - CAMPAIGN.scoring.order.treeLeft - (s.toys.some((t) => t.fallen) ? toysLeft : 0) - CAMPAIGN.scoring.order.starLeft;
  assert.equal(o.score, Math.max(0, expected));
  s.treeLiftStart('trunk', 75);
  s.treeLiftMove(0);
  assert.equal(s.orderScore().notes.some((n) => /Ёлка так и лежит/.test(n)), false);
  assert.equal(CAMPAIGN.scoring.order.treeLeft, 10);
});

test('наутро ёлка стоит, а игрушки в коробке: сохранение после падения и новая сессия', () => {
  const s = dressed();
  s.rng = rolls(0.9);
  s._dropTree();
  const save = emptySave();
  assert.ok(applyTreeEvent(save, { type: 'treeFell' }, { toys: s.toysForSave(), tinsel: s.tinselForSave() }));
  assert.ok(save.toys.every((t) => t.at === null), 'все упавшие — в коробке');
  assert.equal(save.toys.length, 3);
  assert.deepEqual(save.tinsel, [], 'мишура снята');
  assert.ok(save.tinselRolls.gold > 1.9, 'и вернулась в моток');
  const back = parseSave(JSON.stringify(save)).save;
  const next = new KitchenSession({ dayIndex: 2, seed: 1, toys: back.toys, tinsel: { threads: back.tinsel, rolls: back.tinselRolls } });
  assert.equal(next.treeFall.down, false);
  assert.equal(next.toysInBox().length, 3);
  assert.equal(next.toys.filter((t) => t.fallen).length, 0);
});

test('кот затевает «уронить ёлку» только когда есть что ронять; вес 0 — не затевает', () => {
  const cfg = (w) => ({ ...CAMPAIGN, cat: { ...C, mischiefWeights: w } });
  const only = { garland: 0, star: 0, toys: 0, tree: 1 };
  const bare = new KitchenSession({ dayIndex: 1, seed: 3, cfg: cfg(only) });
  bare.catNeeds.hunger = 0;
  bare.catNeeds.boredom = C.mischiefAt;
  run(bare, 0.5);
  assert.notEqual(bare.cat.kind, 'tree', 'на голой ёлке ронять нечего');
  assert.equal(bare.cat.state, 'home');
  const s = new KitchenSession({ dayIndex: 1, seed: 3, cfg: cfg(only), toys: [{ id: 'bell', at: at(1.0, 0.5) }] });
  s.catNeeds.hunger = 0;
  s.catNeeds.boredom = C.mischiefAt;
  run(s, 0.5);
  assert.equal(s.cat.state, 'mischief');
  assert.equal(s.cat.kind, 'tree');
  assert.match(s.alerts.find((a) => a.key === 'cat').text, /ёлку/);
  const w = new KitchenSession({ dayIndex: 1, seed: 3, cfg: cfg({ garland: 0, star: 0, toys: 0, tree: 0 }), toys: [{ id: 'bell', at: at(1.0, 0.5) }] });
  w.catNeeds.hunger = 0;
  w.catNeeds.boredom = C.mischiefAt;
  run(w, 0.5);
  assert.equal(w.cat.state, 'home', 'все веса нули — кот поскучал и улёгся');
});

test('не успела отогнать — ёлка падает; отогнала до срока — стоит', () => {
  const cfg = { ...CAMPAIGN, cat: { ...C, mischiefWeights: { garland: 0, star: 0, toys: 0, tree: 1 } } };
  const mk = () => {
    const s = new KitchenSession({ dayIndex: 1, seed: 3, cfg, toys: [{ id: 'cone', at: at(1.0, 0.5) }] });
    s.catNeeds.hunger = 0;
    s.catNeeds.boredom = C.mischiefAt;
    run(s, 0.5);
    s.drain();
    return s;
  };
  const late = mk();
  run(late, late.cat.deadline - late.t + 0.2);
  assert.equal(late.treeFall.down, true);
  assert.equal(late.cat.state, 'home');
  const ev = late.drain();
  assert.ok(ev.some((e) => e.type === 'treeFell') && ev.some((e) => e.type === 'catMischief' && e.kind === 'tree'));
  const saved = mk();
  assert.ok(saved.shoo());
  run(saved, 20);
  assert.equal(saved.treeFall.down, false);
  assert.equal(saved.toys[0].at != null, true);
});

test('кот сбил две игрушки (старая шалость): подбираются по одной, уведомление уходит с последней', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1, toys: [{ id: 'ballRed', at: at(0.8, 0) }, { id: 'bell', at: at(1.1, 1.0) }, { id: 'cone', at: at(1.4, 2.0) }] });
  arrive(s, 'tree');
  assert.equal(s._knockToys(), 2);
  assert.ok(s.alerts.some((a) => a.key === 'toys'));
  const ev = s.drain().find((e) => e.type === 'toysKnocked');
  assert.equal(ev.items.length, 2);
  assert.ok(ev.items.every((i) => i.from && TOYS[i.id]));
  const [a, b] = s.toysOnFloor();
  s.pickUpToy(a.uid);
  assert.ok(s.alerts.some((x) => x.key === 'toys'));
  s.pickUpToy(b.uid);
  assert.equal(s.alerts.some((x) => x.key === 'toys'), false);
});
