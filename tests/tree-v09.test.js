// 0.9, пункт 24 владельца: 3 подарка в день под ёлкой со случайным призом (баллы или игрушка), игрушки за баллы в «Банке»,
// их вешают на ёлку; кот от скуки сбивает игрушки. Всё это сохраняется между днями.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, waitAction, run } from './helpers-campaign.js';
import { CAMPAIGN, DAYS, GIFTS, TOYS } from '../src/campaign/data.js';
import { TREE_SLOTS } from '../src/campaign/layout.js';
import { giftPrize } from '../src/campaign/st-tree.js';
import { applyTreeEvent } from '../src/campaign/persist.js';
import { emptySave, parseSave } from '../src/campaign/save.js';

test('приз подарка закреплён за днём и номером; за неделю есть и баллы, и игрушки', () => {
  const all = [];
  for (const d of DAYS) for (let i = 0; i < GIFTS.perDay; i++) {
    const p = giftPrize(d.id, i);
    assert.deepEqual(giftPrize(d.id, i), p, 'тот же приз при повторе');
    assert.ok(p.kind === 'points' ? p.n > 0 : !!TOYS[p.id], JSON.stringify(p));
    all.push(p.kind);
  }
  assert.ok(all.includes('points') && all.includes('toy'));
});

test('три подарка в день: открыть у ёлки, баллы в бонусы, игрушка в коробку; больше — нет', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: 0 });
  arrive(s, 'tree');
  assert.deepEqual(s.giftsLeft(), [0, 1, 2]);
  for (const i of [0, 1, 2]) {
    assert.ok(s.openGift(i));
    waitAction(s);
  }
  assert.deepEqual(s.giftsLeft(), []);
  assert.equal(s.openGift(0), false);
  const prizes = [0, 1, 2].map((i) => giftPrize(1, i));
  const pts = prizes.filter((p) => p.kind === 'points').reduce((a, p) => a + p.n, 0);
  assert.equal(s.bonus.points, pts);
  assert.equal(s.toysInBox().length, prizes.filter((p) => p.kind === 'toy').length);
});

test('открытые раньше подарки этого дня не появляются снова; в испытании подарков нет', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 1, giftsOpened: [0, 2] });
  assert.deepEqual(s.giftsLeft(), [1]);
  const ch = new KitchenSession({ dayIndex: 2, seed: 1, challenge: true });
  assert.deepEqual(ch.giftsLeft(), []);
});

test('игрушку покупают за баллы и вешают на ёлку; клик по висящей — снять в руку', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1, bonus: 100 });
  assert.equal(s.buyToy('nope'), false);
  assert.ok(s.buyToy('ballGold'));
  assert.equal(s.bonus.points, 100 - TOYS.ballGold.price);
  const uid = s.toysInBox()[0].uid;
  arrive(s, 'tree');
  assert.ok(s.pickToy(uid));
  assert.ok(s.treeClick(3));
  assert.equal(s.toys[0].slot, 3);
  assert.equal(s.treeHand, null);
  assert.ok(s.buyToy('bell'));
  s.pickToy(s.toysInBox()[0].uid);
  assert.equal(s.treeClick(3), false, 'место занято');
  s.pickToy(s.treeHand); // положить обратно
  assert.ok(s.treeClick(3), 'пустой рукой — снять');
  assert.equal(s.treeHand, uid);
  assert.equal(s.toys[0].slot, null);
});

test('кот от скуки сбивает игрушки: на полу, поднять у ёлки, иначе минус к порядку', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1, toys: [{ id: 'ballRed', slot: 0 }, { id: 'bell', slot: 4 }, { id: 'cone', slot: 7 }] });
  s.garland.broken = s.star.broken = true; // ломать больше нечего — только игрушки
  s.catNeeds.hunger = 0;
  s.catNeeds.boredom = CAMPAIGN.cat.mischiefAt;
  run(s, 0.5);
  assert.equal(s.cat.kind, 'toys');
  run(s, s.cat.deadline - s.t + 0.2);
  const fallen = s.toys.filter((t) => t.fallen).length;
  assert.equal(fallen, 2);
  assert.ok(s.orderScore().notes.some((n) => /Игрушки/.test(n)));
  arrive(s, 'tree');
  assert.ok(s.pickUpToys());
  waitAction(s);
  assert.equal(s.toys.filter((t) => t.fallen).length, 0);
  assert.equal(s.toysInBox().length, 2);
});

test('сохранение: подарок открыт сразу (баллы не задвоить), покупка списывает баллы, игрушки на местах', () => {
  const save = emptySave();
  save.bonus = 50;
  assert.ok(applyTreeEvent(save, { type: 'giftOpened', dayId: 2, index: 1, prize: { kind: 'points', n: 35 } }, { toys: [] }));
  assert.equal(save.bonus, 85);
  assert.equal(applyTreeEvent(save, { type: 'giftOpened', dayId: 2, index: 1, prize: { kind: 'points', n: 35 } }), false, 'второй раз не открыть');
  assert.ok(applyTreeEvent(save, { type: 'toyBought', id: 'santa' }, { toys: [{ id: 'santa', slot: null }] }));
  assert.equal(save.bonus, 85 - TOYS.santa.price);
  assert.ok(applyTreeEvent(save, { type: 'toyHung' }, { toys: [{ id: 'santa', slot: 5 }] }));
  assert.equal(applyTreeEvent(save, { type: 'toyHung' }, { toys: [], challenge: true }), false, 'испытание не трогает кампанию');
  const back = parseSave(JSON.stringify(save)).save;
  assert.deepEqual(back.toys, [{ id: 'santa', slot: 5 }]);
  assert.deepEqual(back.gifts, { 2: [1] });
  const old = parseSave(JSON.stringify({ ...emptySave(), toys: undefined, gifts: undefined })).save;
  assert.deepEqual(old.toys, []);
});

test('мест на ёлке хватает и все они смотрят в камеру', () => {
  assert.ok(TREE_SLOTS.length >= 16);
  for (const p of TREE_SLOTS) assert.ok(p.z > -0.05, `место ${p.i} за ёлкой`);
});
