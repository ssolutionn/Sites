// 0.11, владелец: «На старте ёлочка должна быть голой» и «лепить игрушки на любую часть ёлки». Игрушка хранит точку at на поверхности:
// повесить в любой свободной точке, снять, перевесить; тесно — отказ; в сохранении точки до 0,01; старые slot переносятся в at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive } from './helpers-campaign.js';
import { CAMPAIGN, TOYS, TOY_SETS } from '../src/campaign/data.js';
import { outerRadius, onTree, rayHitTree, slotToAt, tooClose, roundPt } from '../src/campaign/tree-geo.js';
import { emptySave, parseSave } from '../src/campaign/save.js';
import { applyTreeEvent } from '../src/campaign/persist.js';
import { TREE_SLOTS } from '../src/campaign/layout.js';

const T = CAMPAIGN.tree;
const surf = (y, a) => {
  const r = outerRadius(y);
  return { x: Math.sin(a) * r, y, z: Math.cos(a) * r };
};
const withToys = (n, extra = {}) => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1, toys: Array.from({ length: n }, (_, i) => ({ id: Object.keys(TOYS)[i % 10], at: null })), ...extra });
  arrive(s, 'tree');
  s.drain();
  return s;
};

test('новая игра: ёлка голая — на ней нет ни одной игрушки и нитки', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  assert.equal(s.toys.length, 0);
  assert.equal(s.tinsel.threads.length, 0);
  assert.deepEqual(emptySave().toys, []);
  assert.deepEqual(emptySave().tinsel, []);
});

test('повесить в трёх произвольных точках мышиными лучами; игрушка хранит точку до 0,01', () => {
  const s = withToys(3);
  const rays = [
    [{ x: 0.2, y: 0.9, z: 3 }, { x: 0, y: -0.05, z: -1 }],
    [{ x: -0.35, y: 1.3, z: 3 }, { x: 0.05, y: -0.1, z: -1 }],
    [{ x: 0.6, y: 0.6, z: 3 }, { x: -0.1, y: 0, z: -1 }],
  ];
  const events = [];
  rays.forEach(([o, d], i) => {
    const h = rayHitTree(o, d);
    assert.ok(h, `луч ${i} попал в ёлку`);
    const uid = s.toysInBox()[0].uid;
    assert.ok(s.pickToy(uid));
    assert.ok(s.treeClick(h.p), `повесили ${i}`);
    events.push(...s.drain().filter((e) => e.type === 'toyHung'));
  });
  assert.equal(events.length, 3);
  const hung = s.toys.filter((t) => t.at);
  assert.equal(hung.length, 3);
  for (const t of hung) {
    assert.ok(onTree(t.at, T.tol));
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(t.at[k] * 100 - Math.round(t.at[k] * 100)) < 1e-6, `${k} округлён до 0,01: ${t.at[k]}`);
  }
  assert.equal(tooClose(hung[0].at, [hung[1].at, hung[2].at], T.minDist), false);
});

test('мимо ёлки и в воздухе повесить нельзя: игрушка остаётся в руке, подсказка', () => {
  const s = withToys(1);
  s.pickToy(s.toysInBox()[0].uid);
  assert.equal(s.treeClick({ x: 1.5, y: 0.8, z: 0 }), false);
  assert.match(s.hint.text, /ветки/);
  assert.equal(s.treeClick(null), false);
  assert.ok(s.treeHand != null);
  assert.equal(s.hangCheck({ x: 0, y: 0.9, z: 0 }).why, 'off', 'внутри ёлки — тоже мимо');
});

test('тесно: ровно minDist от соседней — можно, на 10 % ближе — отказ с подсказкой', () => {
  const s = withToys(3);
  const a = surf(0.9, 0.2);
  s.pickToy(s.toysInBox()[0].uid);
  assert.ok(s.treeClick(a));
  // сдвиг вдоль окружности на уровне 0,9: хорда = R·2·sin(Δ/2); подбираем угол под нужное расстояние
  const r = outerRadius(0.9);
  const at = (d) => surf(0.9, 0.2 + 2 * Math.asin(d / (2 * r)));
  s.pickToy(s.toysInBox()[0].uid);
  assert.equal(s.hangCheck(at(T.minDist * 0.9)).why, 'close');
  assert.equal(s.treeClick(at(T.minDist * 0.9)), false);
  assert.match(s.hint.text, /тесно/);
  assert.equal(s.hangCheck(at(T.minDist * 1.1)).ok, true);
  assert.ok(s.treeClick(at(T.minDist * 1.1)));
});

test('лимит игрушек на ёлке: сверх cfg.tree.maxToys не вешается', () => {
  const cfg = { ...CAMPAIGN, tree: { ...T, maxToys: 2 } };
  const s = withToys(4, { cfg });
  for (const a of [0.0, 0.8]) {
    s.pickToy(s.toysInBox()[0].uid);
    assert.ok(s.treeClick(surf(1.0, a)));
  }
  s.pickToy(s.toysInBox()[0].uid);
  assert.equal(s.treeClick(surf(1.0, 1.6)), false);
  assert.match(s.hint.text, /2 игрушек/);
});

test('пустой рукой: клик по игрушке по uid или рядом с ней (в радиусе pickR) снимает её; дальше — нет', () => {
  const s = withToys(2);
  const a = surf(0.9, 0.2);
  s.pickToy(s.toysInBox()[0].uid);
  s.treeClick(a);
  const t = s.toys.find((x) => x.at);
  const r = outerRadius(0.9);
  const off = (d) => surf(0.9, 0.2 + 2 * Math.asin(d / (2 * r)));
  assert.equal(s.treeClick(off(T.pickR * 1.1)), false, 'pickR + 10 % — мимо');
  assert.equal(s.treeHand, null);
  assert.ok(s.treeClick(off(T.pickR * 0.9)), 'внутри pickR — снимает');
  assert.equal(s.treeHand, t.uid);
  assert.equal(t.at, null);
  s.dropToy(a); // вернули
  assert.ok(s.treeClick(null, t.uid), 'по uid — без точки');
  assert.equal(s.treeHand, t.uid);
});

test('перетащили на тесное место — игрушка возвращается туда, откуда взяли; из коробки — обратно в коробку', () => {
  const s = withToys(3);
  const a = surf(0.9, 0.2), b = surf(1.3, 1.0);
  for (const p of [a, b]) {
    s.pickToy(s.toysInBox()[0].uid);
    assert.ok(s.dropToy(p));
  }
  assert.ok(s.treeClick(a)); // сняли a
  const taken = s.treeHand;
  assert.equal(s.dropToy(b), false, 'на b уже висит — тесно');
  const back = s.toys.find((x) => x.uid === taken);
  assert.deepEqual(back.at, roundPt(a), 'вернулась на своё место');
  s.pickToy(s.toysInBox()[0].uid);
  assert.equal(s.dropToy(null), false);
  assert.equal(s.treeHand, null);
  assert.ok(s.drain().some((e) => e.type === 'toyReturned'));
});

test('набор из трёх игрушек в произвольных точках — награда, как раньше', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: 0, toys: TOY_SETS.classic.toys.map((id) => ({ id, at: null })) });
  arrive(s, 'tree');
  s.drain();
  [0.1, 1.0, 1.9].forEach((a, i) => {
    s.pickToy(s.toysInBox()[0].uid);
    s.treeClick(surf(0.7 + i * 0.3, a));
  });
  assert.equal(s.setProgress('classic').done, true);
  assert.equal(s.bonus.points, TOY_SETS.classic.reward);
});

test('сохранение: игрушки по точкам, снятая в руку и упавшая — в коробке, round-trip через parseSave', () => {
  const s = withToys(3);
  const pts = [surf(0.9, 0.2), surf(1.3, 1.0)];
  for (const p of pts) {
    s.pickToy(s.toysInBox()[0].uid);
    s.treeClick(p);
  }
  const save = emptySave();
  assert.ok(applyTreeEvent(save, { type: 'toyHung' }, { toys: s.toysForSave() }));
  assert.equal(save.toys.filter((t) => t.at).length, 2);
  assert.equal(save.toys.length, 3);
  const back = parseSave(JSON.stringify(save)).save;
  assert.deepEqual(back.toys, save.toys);
  assert.ok(back.toys.every((t) => !('slot' in t)));
  const s2 = new KitchenSession({ dayIndex: 1, seed: 1, toys: back.toys });
  assert.deepEqual(s2.toys.filter((t) => t.at).map((t) => t.at), s.toys.filter((t) => t.at).map((t) => t.at));
});

test('миграция 0.10 → 0.11: slot переходит в at через TREE_SLOTS; коробка и несуществующие места — в коробку', () => {
  const old = { ...emptySave(), toys: [{ id: 'ballRed', slot: 3 }, { id: 'bell', slot: null }, { id: 'cone', slot: 99 }, { id: 'nope', slot: 1 }, { id: 'santa', slot: 17 }] };
  const { save, status } = parseSave(JSON.stringify(old));
  assert.equal(status, 'ok');
  assert.deepEqual(save.toys, [
    { id: 'ballRed', at: slotToAt(3) },
    { id: 'bell', at: null },
    { id: 'cone', at: null },
    { id: 'santa', at: slotToAt(17) },
  ]);
  assert.ok(onTree(save.toys[0].at, T.tol));
  // y и угол места сохранены: точка на той же высоте, что у старой ветки
  assert.ok(Math.abs(save.toys[0].at.y - TREE_SLOTS[3].y) < 0.006);
  assert.ok(Math.abs(Math.atan2(save.toys[0].at.x, save.toys[0].at.z) - Math.atan2(TREE_SLOTS[3].x, TREE_SLOTS[3].z)) < 0.05);
  // и сессия принимает такое сохранение: игрушки на своих местах
  const s = new KitchenSession({ dayIndex: 1, seed: 1, toys: save.toys });
  assert.equal(s.toys.filter((t) => t.at).length, 2);
});

test('сессия принимает и старые {slot} напрямую (тесты, ручные вызовы); чужая точка не на ёлке — в коробку', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1, toys: [{ id: 'ballRed', slot: 0 }, { id: 'bell', at: { x: 5, y: 5, z: 5 } }] });
  assert.deepEqual(s.toys[0].at, slotToAt(0));
  assert.equal(s.toys[1].at, null);
});

test('сохранение в новом формате с повреждёнными точками не роняет игру', () => {
  const bad = { ...emptySave(), toys: [{ id: 'ballRed', at: { x: 'a', y: 1, z: 2 } }, { id: 'bell', at: 7 }, { id: 'cone', at: { x: 0, y: 0.9, z: 0 } }] };
  const { save } = parseSave(JSON.stringify(bad));
  assert.deepEqual(save.toys.map((t) => t.at), [null, null, null]);
});

test('покупка из базара списывает очки, а доставка (source: delivery) — нет, игрушка в коробке и сохранена', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: 100 });
  const save = { ...emptySave(), bonus: 100 };
  s.buyToy('bell');
  const bought = s.drain().find((e) => e.type === 'toyBought');
  assert.equal(bought.source, 'bazaar');
  assert.ok(applyTreeEvent(save, bought, { toys: s.toysForSave() }));
  assert.equal(save.bonus, 100 - TOYS.bell.price);
  const uid = s.addToy('ballRed');
  const delivered = s.drain().find((e) => e.type === 'toyBought');
  assert.deepEqual([delivered.source, delivered.uid, delivered.price], ['delivery', uid, 0]);
  assert.ok(applyTreeEvent(save, delivered, { toys: s.toysForSave() }));
  assert.equal(save.bonus, 100 - TOYS.bell.price, 'очки не тронуты');
  assert.deepEqual(save.toys.map((t) => t.id), ['bell', 'ballRed']);
  assert.equal(s.toysInBox().length, 2);
  // как вызовет доставка: _addToy + своё событие
  const uid2 = s._addToy('cone');
  s._emit('toyBought', { id: 'cone', uid: uid2, source: 'delivery' });
  assert.ok(applyTreeEvent(save, s.drain().at(-1), { toys: s.toysForSave() }));
  assert.equal(save.bonus, 100 - TOYS.bell.price);
  assert.equal(save.toys.length, 3);
  assert.equal(s.addToy('нет-такой'), null);
});

test('у каждой игрушки есть цена в рублях 49–199, а стеклянными помечены шары и сосулька', () => {
  for (const [id, t] of Object.entries(TOYS)) assert.ok(Number.isInteger(t.rub) && t.rub >= 49 && t.rub <= 199, `${id}: ${t.rub}`);
  assert.deepEqual(Object.keys(TOYS).filter((id) => TOYS[id].glass).sort(), ['ballBlue', 'ballGold', 'ballRed', 'icicle']);
});
