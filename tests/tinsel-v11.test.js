// 0.11, владелец: «добавить мишуру, чтобы её тоже можно лепить как вздумается». Моток 2 м, нитка — по точкам на ёлке,
// шаг точек не меньше 3 см, длина списывается с мотка, снятие возвращает, лимиты, сохранение.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive } from './helpers-campaign.js';
import { CAMPAIGN, TINSEL } from '../src/campaign/data.js';
import { outerRadius, onTree, pathLength, dist } from '../src/campaign/tree-geo.js';
import { emptySave, parseSave } from '../src/campaign/save.js';
import { applyTreeEvent } from '../src/campaign/persist.js';

const K = CAMPAIGN.tinsel;
const around = (y, a) => {
  const r = outerRadius(y);
  return { x: Math.sin(a) * r, y, z: Math.cos(a) * r };
};
// Длина дуги по кругу на высоте y между углами a0 и a1 — шаг мыши задаём в метрах
const arcStep = (y, step) => step / outerRadius(y);

function atTree(opts = {}) {
  const s = new KitchenSession({ dayIndex: 1, seed: 1, ...opts });
  arrive(s, 'tree');
  s.drain();
  return s;
}
/** Нитка по кругу ёлки: n шагов по step метров, возвращает последний результат tinselMove. */
function drawArc(s, y, a0, n, step) {
  assert.ok(s.tinselStart(around(y, a0)));
  let r;
  const da = arcStep(y, step);
  for (let i = 1; i <= n; i++) r = s.tinselMove(around(y, a0 + da * i));
  return r;
}
const withRoll = (color = 'gold', opts = {}) => {
  const s = atTree(opts);
  s.addTinselRoll(color);
  s.drain();
  assert.ok(s.tinselPick(color));
  return s;
};

test('данные: четыре цвета, моток 2 м, цены в очках и рублях 49–149', () => {
  assert.deepEqual(K.colors, ['gold', 'silver', 'red', 'blue']);
  assert.equal(K.roll, 2);
  assert.ok(K.step >= 0.03 && K.maxThreads <= 30 && K.maxPoints <= 80 && K.round === 0.01);
  for (const c of K.colors) {
    const t = TINSEL[c];
    assert.ok(t.name && t.icon && Number.isInteger(t.color), c);
    assert.ok(t.price > 0, c);
    assert.ok(t.rub >= 49 && t.rub <= 149, `${c}: ${t.rub} ₽`);
  }
});

test('моток: addTinselRoll кладёт 2 м и шлёт tinselBought с источником; очки не списывает', () => {
  const s = atTree({ bonus: 100 });
  assert.equal(s.tinselLeft('gold'), 0);
  assert.equal(s.addTinselRoll('gold', { source: 'delivery' }), true);
  assert.equal(s.tinselLeft('gold'), 2);
  const e = s.drain().find((x) => x.type === 'tinselBought');
  assert.deepEqual([e.color, e.source, e.price], ['gold', 'delivery', 0]);
  assert.equal(s.bonus.points, 100);
  assert.equal(s.addTinselRoll('нет'), false);
  s.addTinselRoll('gold');
  assert.equal(s.tinselLeft('gold'), 4, 'два мотка — 4 м');
});

test('покупка за очки в базаре: цена из TINSEL, моток 2 м; не хватает — отказ с подсказкой', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: TINSEL.red.price });
  assert.equal(s.buyTinsel('gold'), false);
  assert.match(s.hint.text, /Не хватает очков/);
  assert.ok(s.buyTinsel('red'));
  assert.equal(s.bonus.points, 0);
  assert.equal(s.tinselLeft('red'), 2);
  const e = s.drain().find((x) => x.type === 'tinselBought');
  assert.deepEqual([e.source, e.price], ['bazaar', TINSEL.red.price]);
  const save = { ...emptySave(), bonus: TINSEL.red.price };
  assert.ok(applyTreeEvent(save, e, { tinsel: s.tinselForSave() }));
  assert.equal(save.bonus, 0);
  assert.equal(save.tinselRolls.red, 2);
  // доставка очки не трогает
  s.addTinselRoll('blue');
  const d = s.drain().find((x) => x.type === 'tinselBought');
  assert.ok(applyTreeEvent(save, d, { tinsel: s.tinselForSave() }));
  assert.equal(save.bonus, 0);
  assert.equal(save.tinselRolls.blue, 2);
  assert.equal(new KitchenSession({ dayIndex: 0, seed: 1, challenge: true, bonus: 500 }).buyTinsel('red'), false, 'в испытании базара нет');
});

test('нитка мышью: точки по поверхности не ближе 3 см, всё до 0,01, длина списана с мотка ровно по ломаной', () => {
  const s = withRoll();
  assert.equal(drawArc(s, 0.9, 0.0, 12, 0.05), 'draw');
  s.pointerUp();
  assert.equal(s.tinsel.threads.length, 1);
  const th = s.tinsel.threads[0];
  assert.ok(th.pts.length >= 8);
  for (const p of th.pts) {
    assert.ok(onTree(p, CAMPAIGN.tree.tol));
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(p[k] * 100 - Math.round(p[k] * 100)) < 1e-6, `${k}: ${p[k]}`);
  }
  for (let i = 1; i < th.pts.length; i++) assert.ok(dist(th.pts[i - 1], th.pts[i]) >= K.step - 1e-9, `шаг ${i}: ${dist(th.pts[i - 1], th.pts[i])}`);
  const used = pathLength(th.pts);
  assert.ok(used > 0.5, `${used}`);
  assert.ok(Math.abs(s.tinselLeft('gold') - (2 - used)) < 1e-3, `в мотке ${s.tinselLeft('gold')}, ушло ${used}`);
  const ev = s.drain().filter((e) => e.type === 'tinselHung');
  assert.equal(ev.length, 1);
  assert.ok(Math.abs(ev[0].len - used) < 1e-3);
  assert.equal(s.tinsel.draw, null, 'отпустила — нитка закончилась');
});

test('шаг точек: сдвиг мыши ровно на 3 см — точка есть, на 2 см (сетка 0,01) — ещё нет', () => {
  const s = withRoll();
  // точки на сетке 0,01 м, лежат на ёлке (радиус на высоте 0,9 — 0,196)
  assert.ok(s.tinselStart({ x: 0, y: 0.9, z: 0.2 }));
  const th = s.tinsel.threads[0];
  assert.equal(s.tinselMove({ x: 0.02, y: 0.9, z: 0.2 }), 'near');
  assert.equal(th.pts.length, 1);
  assert.equal(s.tinselMove({ x: 0.03, y: 0.9, z: 0.2 }), 'draw');
  assert.equal(th.pts.length, 2);
  assert.ok(dist(th.pts[0], th.pts[1]) >= K.step - 1e-9);
});

test('быстрый росчерк добивается точками по поверхности: между далёкими точками нет прямой хорды сквозь ёлку', () => {
  const s = withRoll();
  s.tinselStart(around(0.9, 0));
  assert.equal(s.tinselMove(around(0.9, 1.0)), 'draw'); // ~20 см по кругу за один шаг мыши
  const th = s.tinsel.threads[0];
  assert.ok(th.pts.length > 3, `${th.pts.length}`);
  for (const p of th.pts) assert.ok(onTree(p, CAMPAIGN.tree.tol), JSON.stringify(p));
});

test('рывок дальше maxJump обрывает нитку, новая начинается в новом месте; мимо ёлки — точки нет', () => {
  const s = withRoll();
  s.tinselStart(around(0.9, 0));
  s.tinselMove(around(0.9, 0.2));
  assert.equal(s.tinselMove(null), 'off');
  assert.equal(s.tinselMove({ x: 2, y: 0.9, z: 0 }), 'off');
  assert.equal(s.tinsel.threads.length, 1);
  assert.equal(s.tinselMove(around(1.6, 3)), 'jump');
  assert.equal(s.tinsel.threads.length, 2);
  assert.equal(s.tinsel.threads[1].pts.length, 1);
  s.pointerUp();
  assert.equal(s.tinsel.threads.length, 1, 'нитка из одной точки — не нитка');
});

test('моток кончается: нитка не длиннее остатка, дальше — «моток кончился», рука пуста', () => {
  const s = withRoll();
  s.tinselStart(around(0.7, 0));
  let r = 'draw';
  for (let i = 1; i < 200 && r === 'draw'; i++) {
    // виток за витком вверх по ёлке, шаг мыши 4 см
    const y = 0.7 + Math.floor(i / 40) * 0.1;
    r = s.tinselMove(around(Math.min(y, 1.5), arcStep(0.8, 0.04) * i));
  }
  assert.equal(r, 'empty');
  const len = s.tinsel.threads.reduce((a, t) => a + pathLength(t.pts), 0);
  assert.ok(len <= 2 + 1e-6, `нитка ${len} м из мотка 2 м`);
  assert.ok(s.tinselLeft('gold') >= 0);
  assert.ok(s.tinselLeft('gold') < 0.1 + K.step, `в мотке осталось ${s.tinselLeft('gold')} м`);
  assert.match(s.hint.text, /Моток кончился/);
  assert.equal(s.tinsel.draw, null);
});

test('лимит точек на нитку: после maxPoints нитка заканчивается сама', () => {
  const cfg = { ...CAMPAIGN, tinsel: { ...K, maxPoints: 6 } };
  const s = withRoll('gold', { cfg });
  assert.ok(s.tinselStart(around(0.9, 0)));
  const res = [];
  for (let i = 1; i <= 12; i++) res.push(s.tinselMove(around(0.9, arcStep(0.9, 0.05) * i)));
  assert.ok(res.includes('full'), res.join());
  assert.equal(s.tinsel.threads[0].pts.length, 6);
  assert.equal(s.tinsel.draw, null);
  assert.match(s.hint.text, /длинной/);
});

test('лимит ниток: сверх maxThreads новую не начать, подсказка про ножницы', () => {
  const cfg = { ...CAMPAIGN, tinsel: { ...K, maxThreads: 2 } };
  const s = withRoll('gold', { cfg });
  for (const y of [0.7, 0.9]) {
    drawArc(s, y, 0, 3, 0.05);
    s.pointerUp();
  }
  assert.equal(s.tinsel.threads.length, 2);
  assert.equal(s.tinselStart(around(1.2, 0)), false);
  assert.match(s.hint.text, /2 ниток/);
});

test('снять: ножницы по нитке возвращают её длину в моток; снять нечего — отказ', () => {
  const s = withRoll();
  drawArc(s, 0.9, 0, 10, 0.05);
  s.pointerUp();
  const th = s.tinsel.threads[0];
  const len = s.tinselLength(th.id);
  const left = s.tinselLeft('gold');
  assert.ok(Math.abs(left + len - 2) < 1e-3);
  assert.ok(s.tinselPick('cut'));
  assert.equal(s.tinsel.tool, 'cut');
  assert.ok(s.tinselRemove(th.id));
  assert.ok(Math.abs(s.tinselLeft('gold') - 2) < 1e-3, `вернулось: ${s.tinselLeft('gold')}`);
  assert.equal(s.tinsel.threads.length, 0);
  assert.equal(s.tinsel.tool, null, 'ниток не осталось — ножницы убраны');
  assert.equal(s.tinselRemove(th.id), false);
  assert.equal(s.tinselPick('cut'), false);
  assert.match(s.hint.text, /Снимать нечего/);
  const ev = s.drain().find((e) => e.type === 'tinselTaken');
  assert.ok(Math.abs(ev.len - len) < 1e-3);
});

test('моток в руке — одна рука: игрушка и моток друг друга сбрасывают', () => {
  const s = atTree({ toys: [{ id: 'bell', at: null }] });
  s.addTinselRoll('red');
  assert.ok(s.pickToy(1));
  assert.ok(s.tinselPick('red'));
  assert.equal(s.treeHand, null, 'игрушка вернулась в коробку');
  assert.ok(s.pickToy(1));
  assert.equal(s.tinsel.tool, null);
  assert.equal(s.tinselPick('gold'), false, 'мотка нет');
  assert.match(s.hint.text, /Моток кончился/);
  assert.ok(s.tinselPick(null));
});

test('закрыла ёлку или ушла посреди нитки — нитка закончилась и осталась на ёлке', () => {
  const s = withRoll();
  drawArc(s, 0.9, 0, 6, 0.05);
  s.closePanel();
  assert.equal(s.tinsel.draw, null);
  assert.equal(s.tinsel.threads.length, 1);
  assert.ok(s.drain().some((e) => e.type === 'tinselHung'));
});

test('сохранение: нитки и остатки мотков переживают parseSave и новую сессию', () => {
  const s = withRoll();
  drawArc(s, 0.9, 0, 10, 0.05);
  s.pointerUp();
  const save = emptySave();
  assert.ok(applyTreeEvent(save, { type: 'tinselHung' }, { tinsel: s.tinselForSave() }));
  const back = parseSave(JSON.stringify(save)).save;
  assert.deepEqual(back.tinsel, save.tinsel);
  assert.deepEqual(back.tinselRolls, save.tinselRolls);
  assert.equal(back.tinsel[0].color, 'gold');
  assert.ok(back.tinsel[0].pts.every((p) => Array.isArray(p) && p.length === 3));
  const s2 = new KitchenSession({ dayIndex: 1, seed: 1, tinsel: { threads: back.tinsel, rolls: back.tinselRolls } });
  assert.equal(s2.tinsel.threads.length, 1);
  assert.equal(s2.tinsel.threads[0].pts.length, s.tinsel.threads[0].pts.length);
  assert.ok(Math.abs(s2.tinselLeft('gold') - s.tinselLeft('gold')) < 0.01);
  assert.ok(applyTreeEvent(emptySave(), { type: 'tinselHung' }, { tinsel: s2.tinselForSave() }));
  assert.equal(applyTreeEvent(emptySave(), { type: 'tinselHung' }, { tinsel: s.tinselForSave(), challenge: true }), false, 'испытание кампанию не трогает');
});

test('сохранение: мусор отбрасывается, лишние нитки и точки обрезаются до лимитов', () => {
  const good = (n) => ({ color: 'red', pts: Array.from({ length: n }, (_, i) => { const p = around(0.9, i * 0.05); return [p.x, p.y, p.z]; }) });
  const raw = {
    ...emptySave(),
    tinsel: [good(5), { color: 'нет', pts: good(5).pts }, { color: 'gold', pts: [[0, 0.9, 0]] }, { color: 'blue', pts: good(5).pts.concat([[9, 9, 9]]) }, { color: 'gold', pts: 'x' }, null, good(200), ...Array.from({ length: 50 }, () => good(3))],
    tinselRolls: { gold: 1.2345, silver: -3, red: 'x', blue: 500, нет: 1 },
  };
  const { save } = parseSave(JSON.stringify(raw));
  assert.ok(save.tinsel.length <= K.maxThreads, `${save.tinsel.length}`);
  assert.equal(save.tinsel.length, K.maxThreads);
  assert.ok(save.tinsel.every((t) => t.pts.length >= 2 && t.pts.length <= K.maxPoints && TINSEL[t.color]));
  assert.equal(save.tinsel[0].pts.length, 5);
  assert.equal(save.tinsel[1].pts.length, K.maxPoints, 'длинная нитка обрезана до maxPoints');
  assert.deepEqual(save.tinselRolls, { gold: 1.23, blue: 100 });
  assert.deepEqual(parseSave(JSON.stringify({ ...emptySave(), tinsel: 'x', tinselRolls: 5 })).save.tinsel, []);
});
