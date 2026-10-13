// 0.11, «Рука-призрак»: реестр демонстраций жестов, запуск (первая встреча, три отказа, «?»), настройка и сохранение.
// Каждая демонстрация проигрывается через настоящие распознаватели игры: если рука показывает жест, который игра не засчитала бы,
// тест красный. Время и случайность задаются руками — реального времени и Math.random здесь нет.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from '../src/campaign/data.js';
import { CLAYOUT, BOWL, STOVE, PUDDLE, DISHWASHER } from '../src/campaign/layout.js';
import { BOARD_UNIT } from '../src/campaign/st-board.js';
import { onTree, pathLength } from '../src/campaign/tree-geo.js';
import { inCavity } from '../src/campaign/st-dishwasher.js';
import { ShakeTracker, PourTracker, Stroke, classifyCut } from '../src/campaign/gestures.js';
import { Stirrer, Waver, Grater } from '../src/campaign/mechanics.js';
import { GHOST_IDS, isGhostId } from '../src/ghost/ghost-ids.js';
import { DEMOS, DEMO_IDS, demoPath, demoStation, sampleAt } from '../src/ghost/ghost-demos.js';
import { GhostTrigger } from '../src/ghost/ghost-trigger.js';
import { defaultSettings, normalizeSettings, normalizeGhostSeen, pickPreferences } from '../src/settings.js';
import { emptySave, parseSave, SaveStore, SAVE_KEY } from '../src/campaign/save.js';
import { SettingsController } from '../src/settings-controller.js';
import { KitchenSession, arrive, run, take } from './helpers-campaign.js';

const U = BOARD_UNIT;
const G = CAMPAIGN.ghost;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const down = (path) => path.filter((p) => p.down);

// Проиграть путь руки в сессии: время идёт по t, нажатие и отпускание — по полю down (каждое новое down — новое нажатие).
function replay(s, path) {
  let pressed = false;
  let prev = path[0];
  for (const p of path) {
    if (p.t > prev.t) s.update(p.t - prev.t);
    prev = p;
    if (p.down && !pressed) {
      s.pointer('down', p.x, p.z);
      pressed = true;
    } else if (p.down) s.pointer('move', p.x, p.z);
    else if (pressed) {
      s.pointer('up', p.x, p.z);
      pressed = false;
    }
  }
  if (pressed) s.pointer('up', prev.x, prev.z);
}

// Станции в нужном состоянии
function practiceBoard(activity, product) {
  const s = new KitchenSession({ practice: { activity, product }, seed: 1 });
  const stand = CLAYOUT.stations.board.stand;
  Object.assign(s.heroine, { x: stand.x, z: stand.z, station: 'board', facing: 0 });
  s._openPanel('board');
  assert.ok(s.boardSelect('practice:p'), s.hint?.text);
  return s;
}
const day = (i = 0) => {
  const s = new KitchenSession({ dayIndex: i, seed: 3 });
  s.triggers = [];
  return s;
};
// размеры продукта на доске для демонстрации ножа
const boxOf = (it) => (it.log ? { w: it.log.length, d: it.radius * 2 } : { w: it.body.shape.w, d: it.body.shape.d });

// ======================= реестр =======================

test('реестр: у каждого жеста из списка есть демонстрация и наоборот, подписи короткие и без «ошибка»', () => {
  assert.deepEqual(Object.keys(DEMOS).sort(), [...GHOST_IDS].sort());
  assert.deepEqual(DEMO_IDS, GHOST_IDS);
  for (const id of GHOST_IDS) {
    const d = DEMOS[id];
    assert.equal(d.id, id);
    assert.ok(isGhostId(id));
    assert.ok(d.label.length > 5 && d.label.length <= 70, `${id}: подпись «${d.label}»`);
    assert.doesNotMatch(d.label, /ошибк|неверн|[a-z]{3}/i, `${id}: ни упрёка, ни английских слов`);
    assert.ok(['plane', 'tree', 'cat', 'knob'].includes(d.space), `${id}: пространство ${d.space}`);
    assert.equal(typeof d.station, 'string');
    assert.equal(typeof d.path, 'function');
  }
  assert.equal(isGhostId('nonsense'), false);
});

test('реестр: у каждой демонстрации не меньше 8 точек, время растёт строго от нуля до dur (1,5–2,5 с), без пропусков и NaN', () => {
  for (const id of GHOST_IDS) {
    const d = DEMOS[id];
    const path = demoPath(id);
    assert.ok(path.length >= 8, `${id}: точек ${path.length}`);
    assert.equal(path[0].t, 0, `${id}: старт в нуле`);
    near(path.at(-1).t, d.dur, 1e-6);
    assert.ok(d.dur >= 1.5 && d.dur <= 2.5, `${id}: dur ${d.dur}`);
    for (let i = 1; i < path.length; i++) {
      assert.ok(path[i].t > path[i - 1].t, `${id}: время не растёт на точке ${i}`);
      assert.ok(path[i].t - path[i - 1].t <= 0.1 + 1e-9, `${id}: дыра во времени на точке ${i}`);
    }
    for (const p of path) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.t), `${id}: нечисловая точка`);
      assert.equal(typeof p.down, 'boolean');
      if (d.space === 'tree') assert.ok(Number.isFinite(p.y), `${id}: у ёлки есть высота`);
    }
    // рука подходит и уходит без нажатия
    assert.equal(path[0].down, false, `${id}: начало без нажатия`);
    assert.equal(path.at(-1).down, false, `${id}: конец без нажатия`);
  }
});

test('реестр: все жесты, кроме маха над котом, зажимают кнопку; мах — нет (кот не ждёт клика)', () => {
  for (const id of GHOST_IDS) {
    const n = down(demoPath(id)).length;
    if (id === 'cat-wave') assert.equal(n, 0);
    else assert.ok(n >= 8, `${id}: нажатых точек ${n}`);
  }
});

test('sampleAt: между точками линейно, до начала и после конца — крайние; станция плиты вместо лужи — по параметру', () => {
  const path = [{ x: 0, z: 0, t: 0, down: false }, { x: 1, z: 2, t: 1, down: true }, { x: 3, z: 2, t: 2, down: false }];
  assert.deepEqual(sampleAt(path, 0.5), { x: 0.5, z: 1, down: false });
  assert.equal(sampleAt(path, 1.5).x, 2);
  assert.equal(sampleAt(path, -1).x, 0);
  assert.equal(sampleAt(path, 99).x, 3);
  assert.equal(sampleAt([], 1), null);
  assert.equal(demoStation('wipe'), 'puddle');
  assert.equal(demoStation('wipe', { where: 'stove', burner: 1 }), 'stove');
  assert.equal(demoStation('stir'), 'bowl');
  assert.equal(demoStation('nonsense'), null);
  assert.deepEqual(demoPath('nonsense'), []);
});

// ======================= демонстрации в допусках станций =======================

test('нож: сверху вниз и слева направо проходят классификатор, а разрез реально отделяет кусок', () => {
  for (const [id, product, activity] of [['cut-v', 'potato', 'cubes'], ['cut-v', 'carrot', 'cubes'], ['cut-h', 'potato', 'cubes'], ['cut-h', 'carrot', 'cubes'], ['round', 'sausage', 'rounds'], ['round', 'cucumber', 'rounds']]) {
    const s = practiceBoard(activity, product);
    const it = s.boardCur();
    const path = demoPath(id, boxOf(it));
    // росчерк целиком проходит через продукт
    const st = new Stroke();
    for (const p of down(path)) st.add(p.x / U, p.z / U, p.t);
    const line = classifyCut(st, { allow: id === 'round' ? 'x' : 'both', rules: s._cutRules() });
    assert.ok(line.ok, `${id}/${product}: ${line.reason}`);
    assert.equal(line.axis, id === 'cut-h' ? 'z' : 'x', `${id}: линия ${line.axis}`);
    const before = it.cuts;
    replay(s, path);
    run(s, 0.5);
    assert.ok(it.cuts > before, `${id}/${product}: нож ничего не отрезал (${s.hint?.text ?? 'без отказа'})`);
  }
});

test('нож: срез не толще кубика и лежит внутри продукта, кружочек — не у самого края', () => {
  for (const [id, product, activity] of [['cut-v', 'potato', 'cubes'], ['round', 'sausage', 'rounds']]) {
    const s = practiceBoard(activity, product);
    const it = s.boardCur();
    const { w } = boxOf(it);
    const xs = down(demoPath(id, boxOf(it))).map((p) => p.x / U);
    const x = xs.reduce((a, b) => a + b, 0) / xs.length;
    const fromEdge = x + w / 2;
    assert.ok(fromEdge >= s.cfg.roundTarget.minCut - 1e-9 && fromEdge <= 1.45 + 1e-9, `${id}: срез в ${fromEdge.toFixed(2)} u от края`);
  }
});

test('тёрка: два полных цикла вверх-вниз за показ, рывков дальше maxJump нет', () => {
  const g = new Grater(CAMPAIGN.grate, 8);
  let counted = 0;
  const path = demoPath('grate');
  for (const p of down(path)) if (g.move(p.z)) counted++;
  assert.equal(counted, 2);
  for (let i = 1; i < path.length; i++) assert.ok(Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) <= CAMPAIGN.grate.maxJump);
  // и в настоящей сессии
  const s = practiceBoard('grate', 'cheese');
  const it = s.boardCur();
  replay(s, path);
  assert.equal(it.grater.done, 2);
});

test('чистка: зигзаг ножом по картофелю снимает кожуру в настоящей сессии, яйцо — сначала два нажатия', () => {
  const s = day(0);
  take(s, 'olivier:peelPotato');
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:peelPotato'), s.hint?.text);
  const it = s.boardCur();
  const path = demoPath('peel', { zone: it.peel.zones[0] });
  replay(s, path);
  assert.ok(it.peel.coverage() > 0.3, `почищено ${Math.round(it.peel.coverage() * 100)} %`);
  for (const p of down(path)) assert.ok(Math.abs(p.x - it.peel.zones[0].x) <= it.peel.zones[0].rx * 1.15 + 0.01, 'рука над картофелиной');
  // яйцо: два нажатия на целом яйце, потом зигзаг
  const hand = demoPath('peel', { zone: { x: 0, z: 0, rx: 0.05, rz: 0.04 }, hand: true });
  const taps = [];
  let was = false;
  for (const p of hand) {
    if (p.down && !was) taps.push(p);
    was = p.down;
  }
  assert.ok(taps.length >= 3, 'два нажатия и начало протяжки');
  for (let i = 1; i < hand.length; i++) assert.ok(hand[i].t > hand[i - 1].t);
});

test('мешать: два оборота по кругу внутри допуска Stirrer, настоящая сессия их засчитывает', () => {
  const c = CAMPAIGN.mix;
  const path = demoPath('stir');
  for (const p of down(path)) {
    const r = Math.hypot(p.x, p.z);
    assert.ok(r >= c.minRadius && r <= c.maxRadius, `радиус ${r}`);
  }
  const st = new Stirrer(c);
  for (const p of down(path)) st.move(p.x, p.z);
  assert.ok(st.turns >= 1.5, `оборотов ${st.turns.toFixed(2)}`);
  const s = new KitchenSession({ practice: { activity: 'mix' }, seed: 1 });
  Object.assign(s.heroine, { x: CLAYOUT.stations.bowl.stand.x, z: CLAYOUT.stations.bowl.stand.z, station: 'bowl' });
  s._openPanel('bowl');
  s.bowl.owner = 'practice';
  s.bowl.contents = [{ product: 'carrot', kind: 'pieces', pieces: Array(14) }];
  replay(s, path);
  assert.ok((s.bowl.stirrer?.turns ?? 0) >= 1.5, 'сессия засчитала круги');
});

test('солонка и майонез: встряхивание засчитывается трекером, выдавливание даёт порцию над миской', () => {
  const sh = new ShakeTracker(CAMPAIGN.shake);
  let pinches = 0;
  const salt = demoPath('salt');
  for (const p of salt) {
    if (p.down && sh.move(p.z, p.t)) pinches++;
    assert.ok(!p.down || Math.hypot(p.x, p.z) <= BOWL.r * 1.1, 'солонка над миской');
  }
  assert.ok(pinches >= 3, `щепоток ${pinches}`);
  const mayo = CAMPAIGN.pour.mayo;
  const tr = new PourTracker({ rate: mayo.rate, max: mayo.max });
  const pour = demoPath('pour');
  tr.release();
  let prev = null;
  for (const p of pour) {
    const inside = p.down && Math.hypot(p.x, p.z) < BOWL.r * 0.85;
    if (p.down) tr.move(p.x, p.z, inside);
    assert.ok(!p.down || inside, 'рука ведёт над салатом');
    prev = p;
  }
  assert.ok(prev);
  assert.ok(tr.amount >= mayo.need && tr.amount <= mayo.max, `выдавлено ${tr.amount.toFixed(2)}`);
});

test('кот: мах влево-вправо проходит Waver, размах вдвое больше минимального; корм и удочка — в настоящей сессии', () => {
  const w = new Waver(CAMPAIGN.cat.wave);
  let ok = false;
  for (const p of demoPath('cat-wave')) ok = w.move(0.7 + p.x, p.t) || ok;
  assert.ok(ok, 'кот прогнан');
  const feed = day(1);
  arrive(feed, 'catbowl');
  assert.ok(feed.catPick('kibble'));
  replay(feed, demoPath('cat-kibble'));
  assert.ok(feed.catFeed.shakes >= 3, `встряхиваний ${feed.catFeed.shakes}`);
  const play = day(1);
  arrive(play, 'catbowl');
  assert.ok(play.catPick('wand'));
  replay(play, demoPath('cat-wand'));
  assert.ok(play.catPlay.path >= 1.5, `путь ${play.catPlay.path.toFixed(2)} м`);
  for (const id of ['cat-kibble', 'cat-wand']) {
    const lim = id === 'cat-kibble' ? CAMPAIGN.cat.feed.radius : CAMPAIGN.cat.play.radius;
    for (const p of down(demoPath(id))) assert.ok(Math.hypot(p.x, p.z) <= lim, `${id}: вне круга`);
  }
});

test('ёлка: мишура ложится по поверхности нитью из десятка точек, игрушка вешается на свободную ветку', () => {
  const path = demoPath('tinsel');
  for (const p of down(path)) assert.ok(onTree(p, CAMPAIGN.tree.tol), `мишура мимо ёлки: ${JSON.stringify(p)}`);
  const s = day(1);
  arrive(s, 'tree');
  s.addTinselRoll('gold');
  const left = s.tinselLeft('gold');
  assert.ok(s.tinselPick('gold'));
  const pts = down(path);
  assert.ok(s.tinselStart(pts[0]), 'нитка началась');
  for (const p of pts.slice(1)) assert.notEqual(s.tinselMove(p), 'off', 'нитка не сорвалась');
  s.tinselEnd();
  const th = s.tinsel.threads[0];
  assert.ok(th && th.pts.length >= 10, `точек ${th?.pts.length}`);
  assert.ok(pathLength(th.pts) >= 0.8, `длина ${pathLength(th.pts).toFixed(2)} м`);
  assert.ok(s.tinselLeft('gold') < left, 'длина списана с мотка');
  for (let i = 1; i < pts.length; i++) assert.ok(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z) <= CAMPAIGN.tinsel.maxJump, 'рывок не рвёт нитку');

  const t = day(1);
  arrive(t, 'tree');
  const uid = t.addToy('bell');
  assert.ok(t.pickToy(uid));
  const drag = demoPath('toy-drag');
  const end = down(drag).at(-1);
  assert.ok(onTree(end, CAMPAIGN.tree.tol), 'игрушка заканчивает путь на ветке');
  assert.equal(t.dropToy(end), true, t.hint?.text);
  assert.ok(t.toys.find((x) => x.uid === uid).at, 'игрушка висит');
});

test('ёлка: показанное место можно задать — игрушка уходит туда, куда сказали', () => {
  const to = { x: 0.1, y: 0.7, z: 0.3 };
  const end = down(demoPath('toy-drag', { to })).at(-1);
  near(end.x, to.x, 1e-3);
  near(end.y, to.y, 1e-3);
  near(end.z, to.z, 1e-3);
});

test('подарок: бант тянется дальше bowPull, бумага рвётся трением, крышка уходит дальше lidSlide — настоящими жестами', () => {
  const c = CAMPAIGN.gift;
  const s = day(0);
  arrive(s, 'tree');
  assert.ok(s.startGift(0));
  const bow = demoPath('gift-bow');
  assert.ok(Math.hypot(down(bow)[0].x, down(bow)[0].z) <= c.bowR, 'бант берут за середину');
  replay(s, bow);
  assert.equal(s.gift.stage, 'paper', 'бант развязан');
  const paper = demoPath('gift-paper');
  for (const p of down(paper)) assert.ok(Math.abs(p.x) <= c.box && Math.abs(p.z) <= c.box, 'рука над коробкой');
  replay(s, paper);
  assert.ok(s.gift.tear.progress > 0.5, `бумага ${Math.round(s.gift.tear.progress * 100)} %`);
  s.gift.stage = 'lid';
  const lid = demoPath('gift-lid');
  assert.ok(Math.hypot(...Object.values({ x: down(lid).at(-1).x, z: down(lid).at(-1).z })) >= c.lidSlide, 'крышка уезжает дальше lidSlide');
  replay(s, lid);
  assert.equal(s.gift, null, 'подарок открыт');
});

test('уборка: тряпка по луже и по конфорке копит путь; крутилка поворачивается не меньше чем на два деления', () => {
  const s = day(0);
  s._addPuddle('spill', CLAYOUT.spillPuddle);
  arrive(s, 'puddle');
  const pd = s._activePuddle();
  const path = demoPath('wipe');
  for (const p of down(path)) assert.ok(Math.abs(p.x) <= PUDDLE.w / 2 && Math.abs(p.z) <= PUDDLE.d / 2, 'рука над лужей');
  replay(s, path);
  assert.ok(pd.mask.coverage() > 0.15, `лужа вытерта на ${Math.round(pd.mask.coverage() * 100)} %`);

  const t = day(0);
  t.burners[1].dirty = true;
  arrive(t, 'stove');
  const stove = demoPath('wipe', { where: 'stove', burner: 1 });
  for (const p of down(stove)) assert.ok(Math.hypot(p.x - STOVE.burners[1].x, p.z - STOVE.burners[1].z) <= STOVE.r * 1.5, 'рука над конфоркой');
  replay(t, stove);
  assert.ok(t.stoveWipe?.scrub.progress > 0.3 || !t.burners[1].dirty, 'конфорка протёрта');

  for (const heat of [0, 3, 9]) {
    const kn = down(demoPath('knob', { heat }));
    let acc = 0;
    for (let i = 1; i < kn.length; i++) {
      let d = Math.atan2(kn[i].z, kn[i].x) - Math.atan2(kn[i - 1].z, kn[i - 1].x);
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      acc += d;
    }
    const notches = Math.abs(Math.round((acc * 180) / Math.PI / 30));
    assert.ok(notches >= 3, `крутилка ${heat}: делений ${notches}`);
    assert.equal(Math.sign(acc), heat >= 6 ? -1 : 1, 'выше шести крутят назад');
    for (const p of kn) assert.ok(Math.hypot(p.x, p.z) <= 1.2 && Math.hypot(p.x, p.z) >= 0.5, 'рука на краю крутилки');
  }
});

test('посудомойка: ручка тянется на полный ход дверцы, посуда падает в проём — настоящими жестами', () => {
  const s = day(0);
  arrive(s, 'dishwasher');
  const door = demoPath('washer-door');
  const first = down(door)[0];
  assert.ok(Math.abs(first.x) <= DISHWASHER.grab.x && first.z >= DISHWASHER.grab.z0 && first.z <= DISHWASHER.grab.z1, 'ручку берут там, где её хватает игра');
  replay(s, door);
  assert.equal(s.dishwasher.door, 'open');

  s.equipment.bowl.clean = false;
  assert.ok(s.dwPick('bowl'));
  const drag = demoPath('washer-drag');
  const end = down(drag).at(-1);
  assert.ok(inCavity(end.x, end.z, CAMPAIGN.dishwasher.drop), 'отпускание в проёме');
  assert.equal(s.dwDrop('bowl', end.x, end.z), true, s.hint?.text);
  assert.ok(s.inWasher('bowl'));
  assert.ok(DEMOS['washer-drag'].startDom && DEMOS['toy-drag'].startDom, 'фишка в доке — начало пути');
});

// ======================= запуск: первая встреча, три отказа, «?» =======================

// Подделка настроек и памяти «уже видела»
function rig(over = {}) {
  const seen = new Set(over.seen ?? []);
  const state = { on: over.on ?? true, marks: [] };
  const trg = new GhostTrigger({ cfg: G, enabled: () => state.on, isSeen: (id) => seen.has(id), markSeen: (id) => { seen.add(id); state.marks.push(id); } });
  return { trg, seen, state };
}

test('первая встреча: показ один раз за игру и запоминается; неизвестный жест — ничего', () => {
  const { trg, seen, state } = rig();
  const a = trg.first('cut-v');
  assert.equal(a.why, 'first');
  assert.equal(a.id, 'cut-v');
  assert.ok(seen.has('cut-v'));
  assert.equal(trg.first('cut-v'), null, 'второй раз — нет');
  assert.deepEqual(state.marks, ['cut-v']);
  assert.ok(trg.first('cut-h'), 'другой жест — свой черёд');
  assert.equal(trg.first('nonsense'), null);
  assert.equal(seen.has('nonsense'), false);
});

test('первая встреча: показ идёт loops раз с паузами, скорость естественная', () => {
  const { trg } = rig();
  const a = trg.first('stir');
  assert.equal(a.loops, G.loops);
  near(a.dur, DEMOS.stir.dur * G.loops + (G.loops - 1) * G.loopPause, 1e-9);
  near(a.speed, 1, 1e-9);
});

test('выключенные «Подсказки рукой» гасят всё и ничего не запоминают: включит позже — увидит при встрече', () => {
  const { trg, seen, state } = rig({ on: false });
  assert.equal(trg.first('cut-v'), null);
  for (const t of [0, 1, 2]) assert.equal(trg.refuse('cut-v', 'wobbly', t), null);
  assert.equal(trg.repeat('cut-v'), null);
  assert.equal(seen.size, 0);
  assert.deepEqual(state.marks, []);
  state.on = true;
  assert.ok(trg.first('cut-v'), 'после включения первая встреча ещё впереди');
});

test('три одинаковых отказа за 20 с показывают призрака на 1,5 с; быстрее показ сжимается, а не обрезается', () => {
  const { trg } = rig({ seen: ['cut-v'] });
  assert.equal(trg.refuse('cut-v', 'wobbly', 0), null);
  assert.equal(trg.refuse('cut-v', 'wobbly', 8), null);
  const show = trg.refuse('cut-v', 'wobbly', 15);
  assert.equal(show.why, 'refuse');
  assert.equal(show.id, 'cut-v');
  assert.equal(show.dur, G.refuseShow);
  assert.equal(show.loops, 1);
  near(show.speed, DEMOS['cut-v'].dur / G.refuseShow, 1e-9);
  assert.ok(show.speed > 1, 'движение ускорено ровно настолько, чтобы уложиться в 1,5 с');
});

test('границы окна: три отказа ровно за 20 с — показ, за 21 с — нет', () => {
  const edge = rig();
  edge.trg.refuse('stir', 'idle', 100);
  edge.trg.refuse('stir', 'idle', 110);
  assert.ok(edge.trg.refuse('stir', 'idle', 120), 'ровно 20 с — ещё считается');

  const late = rig();
  late.trg.refuse('stir', 'idle', 100);
  late.trg.refuse('stir', 'idle', 110.5);
  assert.equal(late.trg.refuse('stir', 'idle', 121), null, '21 с — первый отказ уже вне окна');
  assert.ok(late.trg.refuse('stir', 'idle', 122), 'зато следующий — снова три в окне');
});

test('разные причины и разные жесты не складываются', () => {
  const { trg } = rig();
  assert.equal(trg.refuse('cut-v', 'wobbly', 0), null);
  assert.equal(trg.refuse('cut-v', 'diagonal', 1), null);
  assert.equal(trg.refuse('cut-v', 'short', 2), null);
  assert.equal(trg.refuse('cut-v', 'wobbly', 3), null, 'у «дрожи» только два отказа');
  assert.equal(trg.refuse('grate', 'wobbly', 4), null, 'тот же код у другого жеста — отдельный счёт');
  assert.ok(trg.refuse('cut-v', 'wobbly', 5), 'третья «дрожь» — показ');
});

test('не чаще раза в 20 с: следующая тройка отказов ждёт, зато сработает, когда пауза кончится', () => {
  const { trg } = rig();
  for (const t of [0, 1]) trg.refuse('stir', 'idle', t);
  assert.ok(trg.refuse('stir', 'idle', 2), 'первый показ');
  for (const t of [3, 4]) assert.equal(trg.refuse('stir', 'idle', t), null);
  assert.equal(trg.refuse('stir', 'idle', 5), null, 'три отказа есть, но прошло всего 3 с');
  assert.equal(trg.refuse('grate', 'idle', 6), null);
  // грозит показать другой жест — пауза общая, а не по жестам
  for (const t of [7, 8]) trg.refuse('grate', 'idle', t);
  assert.equal(trg.refuse('grate', 'idle', 9), null, 'общая пауза: другой жест тоже ждёт');
  assert.ok(trg.refuse('stir', 'idle', 22), 'через 20 с после показа — можно');
  assert.equal(trg.refuse('stir', 'idle', 23), null, 'счёт обнулился после показа');
});

test('ровно через 20 с после прошлого показа тройка уже срабатывает', () => {
  const { trg } = rig();
  for (const t of [0, 1]) trg.refuse('stir', 'idle', t);
  assert.ok(trg.refuse('stir', 'idle', 2));
  for (const t of [20, 21]) trg.refuse('stir', 'idle', t);
  assert.equal(trg.refuse('stir', 'idle', 21.9), null, '19,9 с — ещё рано');
  const fresh = rig();
  for (const t of [0, 1]) fresh.trg.refuse('stir', 'idle', t);
  fresh.trg.refuse('stir', 'idle', 2);
  for (const t of [20, 20.5]) fresh.trg.refuse('stir', 'idle', t);
  assert.ok(fresh.trg.refuse('stir', 'idle', 22), 'ровно 20 с после показа — можно');
});

test('новый день: время сессии началось заново — старые отказы и пауза не мешают', () => {
  const { trg } = rig();
  for (const t of [290, 295]) trg.refuse('stir', 'idle', t);
  assert.ok(trg.refuse('stir', 'idle', 299));
  trg.reset();
  for (const t of [1, 2]) assert.equal(trg.refuse('stir', 'idle', t), null);
  assert.ok(trg.refuse('stir', 'idle', 3), 'после reset пауза не держит');
  // без reset: время пошло назад — сессия другая
  const b = rig();
  for (const t of [290, 295]) b.trg.refuse('stir', 'idle', t);
  assert.ok(b.trg.refuse('stir', 'idle', 299));
  for (const t of [1, 2]) assert.equal(b.trg.refuse('stir', 'idle', t), null);
  assert.ok(b.trg.refuse('stir', 'idle', 3));
  assert.equal(b.trg.refuse('stir', 'idle', NaN), null);
});

test('«?»: показывает всегда (даже уже виденное), запоминает; без настройки — нет', () => {
  const { trg, seen } = rig({ seen: ['cut-v'] });
  const a = trg.repeat('cut-v');
  assert.equal(a.why, 'repeat');
  assert.equal(a.loops, G.loops);
  assert.ok(trg.repeat('cut-v'), 'сколько ни нажимай');
  assert.ok(trg.repeat('stir'));
  assert.ok(seen.has('stir'));
  assert.equal(trg.repeat('nonsense'), null);
});

test('показ после отказа тоже считается «видела»: первая встреча потом не повторяет то же', () => {
  const { trg, seen } = rig();
  trg.refuse('cut-h', 'wobbly', 0);
  trg.refuse('cut-h', 'wobbly', 1);
  assert.ok(trg.refuse('cut-h', 'wobbly', 2));
  assert.ok(seen.has('cut-h'));
  assert.equal(trg.first('cut-h'), null);
});

// ======================= настройка и сохранение =======================

test('настройка: по умолчанию рука включена, память пуста; «Новая кампания» их не стирает', () => {
  const d = defaultSettings();
  assert.equal(d.ghostHints, true);
  assert.deepEqual(d.ghostSeen, {});
  assert.deepEqual(emptySave().settings, d);
  const prefs = pickPreferences({ ...d, ghostHints: false, ghostSeen: { stir: true } });
  assert.equal(prefs.ghostHints, false);
  assert.deepEqual(prefs.ghostSeen, { stir: true });
});

test('миграция: старое сохранение без новых полей читается — рука включена, ничего не показывали', () => {
  const old = JSON.parse(JSON.stringify(emptySave()));
  delete old.settings.ghostHints;
  delete old.settings.ghostSeen;
  const r = parseSave(old);
  assert.equal(r.status, 'ok');
  assert.equal(r.save.settings.ghostHints, true);
  assert.deepEqual(r.save.settings.ghostSeen, {});
  const bare = JSON.parse(JSON.stringify(emptySave()));
  delete bare.settings;
  assert.equal(parseSave(bare).save.settings.ghostHints, true);
});

test('валидация: мусор вместо настройки заменяется значениями по умолчанию, лишние жесты отбрасываются', () => {
  for (const junk of ['да', 1, null, [], {}, 'false']) assert.equal(normalizeSettings({ ghostHints: junk }).ghostHints, true, `ghostHints=${JSON.stringify(junk)}`);
  assert.equal(normalizeSettings({ ghostHints: false }).ghostHints, false, 'выключила — выключено');
  for (const junk of ['stir', 5, null, [], ['stir'], true]) assert.deepEqual(normalizeGhostSeen(junk), {}, JSON.stringify(junk));
  assert.deepEqual(normalizeGhostSeen({ stir: true, 'cut-v': true, wizard: true, salt: false, pour: 1, grate: 'yes' }), { stir: true, 'cut-v': true });
  const r = parseSave({ ...JSON.parse(JSON.stringify(emptySave())), settings: { ghostHints: 'maybe', ghostSeen: { stir: true, nope: true, toString: true } } });
  assert.equal(r.save.settings.ghostHints, true);
  assert.deepEqual(r.save.settings.ghostSeen, { stir: true });
});

test('сохранение: настройка и память переживают запись и чтение, жесты в памяти — только известные', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const a = new SaveStore(storage);
  const ctl = new SettingsController({ settings: () => a.data.settings, persist: () => a.write(), sound: { setVolumes() {}, setMuted() {}, muted: false }, keymap: { toJSON: () => ({}) } });
  assert.equal(ctl.markGhostSeen('cut-v'), true);
  assert.equal(ctl.markGhostSeen('cut-v'), false, 'повторная запись не нужна');
  assert.equal(ctl.markGhostSeen('wizard'), false);
  assert.equal(ctl.setGhostHints(false), false);
  const b = new SaveStore(storage);
  assert.equal(b.data.settings.ghostHints, false);
  assert.deepEqual(b.data.settings.ghostSeen, { 'cut-v': true });
  assert.ok(JSON.parse(mem.get(SAVE_KEY)).settings.ghostSeen['cut-v']);
  b.reset();
  assert.equal(b.data.settings.ghostHints, false, 'новая кампания не включает руку обратно');
  assert.deepEqual(b.data.settings.ghostSeen, { 'cut-v': true }, 'и не заставляет смотреть то же ещё раз');
});

test('контроллер: переключатель пишет на диск сразу и сообщает новое значение', () => {
  let writes = 0;
  const settings = defaultSettings();
  const ctl = new SettingsController({ settings: () => settings, persist: () => writes++, sound: { setVolumes() {}, setMuted() {}, muted: false }, keymap: { toJSON: () => ({}) } });
  assert.equal(ctl.setGhostHints(false), false);
  assert.equal(settings.ghostHints, false);
  assert.equal(ctl.setGhostHints(true), true);
  assert.equal(writes, 2);
  assert.equal(ctl.markGhostSeen('knob'), true);
  assert.equal(writes, 3);
  ctl.markGhostSeen('knob');
  assert.equal(writes, 3, 'тот же жест второй раз диск не трогает');
});

test('CAMPAIGN.ghost: числа из задания лежат в данных, а не в коде', () => {
  assert.equal(G.refuseCount, 3);
  assert.equal(G.refuseWindow, 20);
  assert.equal(G.refuseGap, 20);
  assert.equal(G.refuseShow, 1.5);
});
