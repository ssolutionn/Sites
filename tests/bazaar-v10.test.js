// 0.10, владелец: «продумать механику покупки украшений». Приложение «Ёлочный базар»: наборы игрушек, товар дня
// со скидкой, повесил весь набор на ёлку — разовая награда баллами (сохраняется, второй раз не дают).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive } from './helpers-campaign.js';
import { TOYS, TOY_SETS, BAZAAR, DAYS } from '../src/campaign/data.js';
import { dealToy } from '../src/campaign/st-tree.js';
import { slotToAt } from '../src/campaign/tree-geo.js';
import { applyTreeEvent } from '../src/campaign/persist.js';
import { emptySave, parseSave } from '../src/campaign/save.js';

// 0.11: игрушки висят в любой точке ёлки; для тестов берём точки бывших мест TREE_SLOTS
const P = (i) => slotToAt(i);
const rich = (dayIndex = 0, extra = {}) => new KitchenSession({ dayIndex, seed: 1, bonus: 1000, ...extra });

test('каждая игрушка базара входит ровно в один набор, награда за набор меньше его цены', () => {
  const all = Object.values(TOY_SETS).flatMap((s) => s.toys);
  assert.deepEqual([...all].sort(), Object.keys(TOYS).sort());
  for (const s of Object.values(TOY_SETS)) assert.ok(s.reward > 0 && s.reward < s.toys.reduce((a, id) => a + TOYS[id].price, 0), s.name);
});

test('товар дня закреплён за днём, за неделю разные, со скидкой', () => {
  const deals = DAYS.map((d) => dealToy(d.id));
  assert.deepEqual(deals, DAYS.map((d) => dealToy(d.id)));
  assert.ok(new Set(deals).size >= 5, deals.join());
  const s = rich(0);
  const id = s.dealId();
  assert.equal(s.toyPrice(id), Math.round(TOYS[id].price * (1 - BAZAAR.dealOff)));
  const other = Object.keys(TOYS).find((x) => x !== id);
  assert.equal(s.toyPrice(other), TOYS[other].price);
});

test('покупка товара дня списывает цену со скидкой — и в сессии, и в сохранении', () => {
  const s = rich(0);
  const id = s.dealId();
  const price = s.toyPrice(id);
  assert.ok(s.buyToy(id));
  assert.equal(s.bonus.points, 1000 - price);
  const e = s.drain().find((x) => x.type === 'toyBought');
  assert.equal(e.price, price);
  const sv = { ...emptySave(), bonus: 1000 };
  assert.ok(applyTreeEvent(sv, e, { toys: s.toysForSave() }));
  assert.equal(sv.bonus, 1000 - price);
});

test('весь набор на ёлке — разовая награда баллами и событие; снял и повесил снова — второй раз не дают', () => {
  const s = rich(0);
  const set = TOY_SETS.classic;
  for (const id of set.toys) s.buyToy(id);
  arrive(s, 'tree');
  s.drain();
  const before = s.bonus.points;
  set.toys.forEach((id, k) => {
    const t = s.toys.find((x) => x.id === id && x.slot == null);
    s.pickToy(t.uid);
    s.treeClick(P(k));
  });
  assert.equal(s.bonus.points, before + set.reward);
  const ev = s.drain().find((e) => e.type === 'setComplete');
  assert.deepEqual([ev.id, ev.n], ['classic', set.reward]);
  assert.equal(s.setProgress('classic').done, true);
  s.treeClick(P(0)); // снять
  s.treeClick(P(0)); // повесить обратно
  assert.equal(s.bonus.points, before + set.reward);
  assert.equal(s.drain().some((e) => e.type === 'setComplete'), false);
  const sv = emptySave();
  applyTreeEvent(sv, ev, { toys: s.toysForSave() });
  assert.deepEqual(sv.sets, ['classic']);
  assert.equal(sv.bonus, set.reward);
  assert.deepEqual(parseSave(JSON.stringify(sv)).save.sets, ['classic']);
});

test('собранный в прошлые дни набор не награждается снова', () => {
  const toys = TOY_SETS.forest.toys.map((id, i) => ({ id, at: P(i) }));
  const s = rich(1, { toys, setsDone: ['forest'] });
  assert.equal(s.setProgress('forest').done, true);
  assert.equal(s.setProgress('forest').hung, 3);
  arrive(s, 'tree');
  s.treeClick(P(0));
  s.treeClick(P(17));
  assert.equal(s.drain().some((e) => e.type === 'setComplete'), false);
});

// 0.10 Ф5: наряжать руками — перетаскивание. Отпустил над свободной точкой — висит; мимо — вернулась туда, откуда взяли.
test('перетащить игрушку из коробки на ёлку; мимо ёлки — назад в коробку', () => {
  const s = rich(0);
  s.buyToy('ballRed');
  s.buyToy('cone');
  arrive(s, 'tree');
  const [a, b] = s.toysInBox();
  s.pickToy(a.uid);
  assert.ok(s.dropToy(P(5)));
  assert.deepEqual(a.at, P(5));
  assert.equal(s.treeHand, null);
  s.pickToy(b.uid);
  assert.equal(s.dropToy(null), false);
  assert.equal(b.at, null);
  assert.equal(s.treeHand, null, 'вернулась в коробку');
  assert.ok(s.drain().some((e) => e.type === 'toyReturned'));
});

test('висящую игрушку перетащили вплотную к соседней — она возвращается на своё место', () => {
  const s = rich(0);
  s.buyToy('ballRed');
  s.buyToy('cone');
  arrive(s, 'tree');
  const [a, b] = s.toysInBox();
  s.pickToy(a.uid);
  s.dropToy(P(1));
  s.pickToy(b.uid);
  s.dropToy(P(2));
  s.treeClick(P(1)); // взяли с места 1
  assert.equal(s.treeHand, a.uid);
  assert.equal(s.dropToy(P(2)), false); // вплотную к соседней — назад на своё место
  assert.deepEqual(a.at, P(1));
  assert.equal(s.treeHand, null);
});
