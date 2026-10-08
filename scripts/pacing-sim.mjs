// Оценка длительности кампании симуляцией темпа живого игрока.
// Это НЕ замена игровому просмотру человеком: те же действия, что делает игрок,
// выполняются через API сессии, а между ними проходит игровое время по допущениям ниже.
import { KitchenSession } from '../src/campaign/session.js';
import { BOARD_UNIT } from '../src/campaign/st-board.js';
import { bounds } from '../src/game/cutting.js';
import { TRAY, CANAPE_PILES, FRUIT_PILES, SINK } from '../src/campaign/layout.js';
import { DAYS, PRODUCTS } from '../src/campaign/data.js';

// --- допущения о темпе (секунды игрового времени) ---
const PROFILES = {
  уверенный: null,
  'первое прохождение': { aimClick: 1.8, uiClick: 1.3, stationChoice: 1.8, mouseSpeed: 0.13, stirSpeed: 0.7, gratePerCycle: 1.2, readTip: 12, readMessage: 6, inspect: 4, recipeCheck: 12, strokeAim: 0.9, chop: false },
};
const PACE = {
  aimClick: 1.1, // навести и кликнуть по точке продукта / предмету
  uiClick: 0.9, // найти и нажать кнопку панели
  stationChoice: 1.2, // решить, куда идти, и кликнуть станцию
  mouseSpeed: 0.18, // м/с при намазывании, мытье и т. п. (по поверхности стола)
  stirSpeed: 0.9, // оборотов в секунду не больше
  gratePerCycle: 0.9, // одно полное движение по тёрке
  readTip: 7, // первая подсказка механики
  readMessage: 4, // сообщение в телефоне
  inspect: 2.5, // посмотреть на результат перед подтверждением
  recipeCheck: 5, // заглянуть в рецепт в начале блюда
  strokeAim: 0.5, // следующий росчерк той же серии (нож уже над продуктом, шаг 1 см)
  chop: true, // уверенный игрок режет полоски рубкой (зигзаг), новичок — по одному росчерку
};

const R = { cook: 0, walk: 0, read: 0, wait: 0 };
let s;
const tick = (sec, bucket = 'cook') => {
  const n = Math.max(1, Math.round(sec * 30));
  const before = s.stats.walk;
  for (let i = 0; i < n; i++) s.update(1 / 30);
  R[bucket] += sec;
};
const think = (sec, bucket = 'cook') => tick(sec, bucket);
function go(st) {
  think(PACE.stationChoice);
  if (!s.goTo(st)) throw new Error('goTo ' + st + ' ' + s.hint?.text);
  let t = 0;
  while (s.panel !== st && t < 60) {
    tick(0.1, 'walk');
    t += 0.1;
    if (s.cat.state === 'theft' || s.cat.state === 'spill') shoo();
  }
}
function read(sec) {
  tick(sec, 'read');
}
const tipsSeen = new Set();
function tip(topic) {
  if (tipsSeen.has(topic)) return;
  tipsSeen.add(topic);
  read(PACE.readTip);
}
function shoo() {
  think(0.8);
  s.shoo();
  tick(0.8);
}
function waitAction() {
  while (s.action) tick(1 / 30);
}
function clickAt(x, z) {
  think(PACE.aimClick);
  s.pointer('down', x, z);
  s.pointer('up', x, z);
  waitAction();
}
// Росчерк ножом в единицах доски: прицелиться и провести.
function slash(axis, pos, from, to) {
  think(PACE.aimClick);
  const a = axis === 'x' ? [pos, from] : [from, pos];
  const b = axis === 'x' ? [pos, to] : [to, pos];
  dragPath([a.map((v) => v * BOARD_UNIT), b.map((v) => v * BOARD_UNIT)]);
  waitAction();
}
// Кружочки: от края каждого длинного куска отрезаем по ~0.5 кубика.
function rounds(it) {
  for (let g = 0; g < 30; g++) {
    const seg = it.log.segments.find((q) => q.b - q.a > 0.75);
    if (!seg) break;
    slash('x', seg.b - seg.a > 0.9 ? seg.a + 0.5 : (seg.a + seg.b) / 2, -it.radius - 0.3, it.radius + 0.3);
  }
}
// Кубик 1 см на сетке: полоски сверху вниз (рубкой или по одной), тап D — доска на четверть оборота, снова сверху вниз.
function cubes(it) {
  if (it.body) {
    const { w, d } = it.body.shape;
    const zs = it.body.copies.map((c) => c.cz);
    const z0 = Math.min(...zs) - d / 2 - 0.8, z1 = Math.max(...zs) + d / 2 + 0.8;
    const U = BOARD_UNIT;
    if (PACE.chop) {
      think(PACE.aimClick);
      const pts = [[(-w / 2 + 0.4) * U, z0 * U]];
      for (let x = -w / 2 + 1; x < w / 2 - 0.3; x += 1) pts.push([x * U, z1 * U], [(x + 0.5) * U, z0 * U]);
      dragPath(pts, PACE.mouseSpeed * 2.5);
    } else
      for (let x = -w / 2 + 1; x < w / 2 - 0.3; x += 1) {
        think(PACE.strokeAim);
        dragPath([[x * U, z0 * U], [x * U, z1 * U]], PACE.mouseSpeed * 2);
      }
    ui(() => s.boardTurn(-1));
    tick(0.3);
    for (const cz of zs)
      for (let z = cz - d / 2 + 1; z < cz + d / 2 - 0.3; z += 1) {
        think(PACE.strokeAim);
        dragPath([[-z * U, (-w / 2 - 0.8) * U], [-z * U, (w / 2 + 0.8) * U]], PACE.mouseSpeed * 2);
      }
    freshCubes(it);
    return;
  }
  for (let g = 0; g < 40; g++) {
    const wide = it.pieces.filter((p) => p.w > 1.25).sort((a, b) => a.x - b.x)[0];
    if (!wide) break;
    const b = bounds(it.pieces);
    slash('x', wide.x + 1, b.minZ - 0.4, b.maxZ + 0.4);
  }
  for (let g = 0; g < 60; g++) {
    const wide = it.pieces.filter((p) => p.d > 1.25).sort((a, b) => a.z - b.z)[0];
    if (!wide) break;
    const b = bounds(it.pieces);
    slash('z', wide.z + 1, b.minX - 0.4, b.maxX + 0.4);
  }
}
// Росчерк в системе продукта (u) с учётом текущего поворота доски.
function bodyStroke(x0, z0, x1, z1, it) {
  const a = it.angle ?? 0, c = Math.cos(a), sn = Math.sin(a), U = BOARD_UNIT;
  const P = (x, z) => [(x * c + z * sn) * U, (-x * sn + z * c) * U];
  think(PACE.strokeAim);
  dragPath([P(x0, z0), P(x1, z1)], PACE.mouseSpeed * 2);
}
// Замена от кота: дорезать её кубиками по её рамке.
function freshCubes(it) {
  for (let g = 0; g < 3; g++) {
    const p = it.pieces.find((q) => q.fresh);
    if (!p) return;
    for (let x = p.x + 1; x < p.x + p.w - 0.3; x += 1) bodyStroke(x, p.z - 0.6, x, p.z + p.d + 0.6, it);
    for (let z = p.z + 1; z < p.z + p.d - 0.3; z += 1) bodyStroke(p.x - 0.6, z, p.x + p.w + 0.6, z, it);
  }
}
function dragPath(pts, speed = PACE.mouseSpeed) {
  s.pointer('down', pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const steps = Math.max(1, Math.ceil(d / 0.01));
    for (let k = 1; k <= steps; k++) {
      s.pointer('move', pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * k) / steps, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * k) / steps);
      tick(d / steps / speed);
    }
  }
  const last = pts[pts.length - 1];
  s.pointer('up', last[0], last[1]);
}
function zig(cx, cz, w, d, rows) {
  const pts = [];
  for (let r = 0; r <= rows; r++) {
    const z = cz - d / 2 + (d * r) / rows;
    pts.push(r % 2 ? [cx + w / 2, z] : [cx - w / 2, z], r % 2 ? [cx - w / 2, z] : [cx + w / 2, z]);
  }
  dragPath(pts);
}
function ui(fn) {
  think(PACE.uiClick);
  const r = fn();
  if (r === false || r === null) console.log('  ! отказ:', fn.toString().slice(6, 60), '—', s.hint?.text);
  waitAction();
  return r;
}
// Чистка зигзагом ножа по всем копиям продукта, пока не дочищено.
function peelIt(it) {
  const b = bounds(it.pieces);
  const U = BOARD_UNIT;
  for (let pass = 0; pass < 4 && s.board.items[it.key]; pass++) {
    const pts = [];
    const rows = 12;
    for (let r = 0; r <= rows; r++) {
      const z = (b.minZ + ((b.maxZ - b.minZ) * r) / rows + pass * 0.12) * U;
      pts.push([(r % 2 ? b.maxX + 0.2 : b.minX - 0.2) * U, z], [(r % 2 ? b.minX - 0.2 : b.maxX + 0.2) * U, z]);
    }
    dragPath(pts);
  }
}
function work(it) {
  tip(it.grater ? 'grate' : it.peel ? 'peel' : it.log ? 'round' : 'cube');
  if (it.peel) {
    peelIt(it);
    return;
  }
  if (it.grater) {
    for (let c = 0; c < it.grater.cycles + 1 && !it.grater.complete; c++) {
      s.pointer('down', 0, 0.05);
      s.pointer('move', 0, -0.05);
      s.pointer('move', 0, 0.05);
      s.pointer('up', 0, 0);
      tick(PACE.gratePerCycle);
    }
  } else if (it.log) {
    rounds(it);
  } else {
    cubes(it);
  }
  if (s.cat.state === 'theft') shoo();
  if (it.missing?.length) {
    ui(() => s.takeReplacement());
    if (it.body) freshCubes(it);
    else if (it.pieces) cubes(it);
    else if (it.log) rounds(it);
  }
  think(PACE.inspect);
  if (s.board.items[it.key]) ui(() => s.boardTransfer());
}
// Доска: выбрать шаг и сделать его; после чистки очищенный продукт сразу режется или трётся.
function board(key) {
  go('board');
  ui(() => s.boardSelect(key));
  let it = s.boardCur();
  work(it);
  if (it.peel && s.boardCur() && s.boardCur() !== it) {
    it = s.boardCur();
    work(it);
  }
}
function wishOf(dish, kind) {
  return s.requests.some((r) => r.known && r.recipe === dish && r.kind === kind);
}
function adds(dish) {
  go('bowl');
  for (const t of s.bowlTasks().filter((t) => t.dishId === dish && t.type === 'add' && t.state === 'ready')) ui(() => s.bowlAdd(dish, t.stepId, t.product === 'mayo' && wishOf(dish, 'lightMayo') ? 'light' : 'full'));
}
// Вкус «как у игрока»: посолить и поперчить наугад → перемешать → попробовать, поправить, ещё оборот, ещё проба.
function season(dish) {
  readPhone();
  go('bowl');
  tip('season');
  const noPepper = wishOf(dish, 'noPepper');
  for (let i = 0; i < 3; i++) ui(() => s.seasonAdd(dish, 'salt'));
  if (!noPepper) ui(() => s.seasonAdd(dish, 'pepper'));
  ui(() => s.seasonDone(dish));
}
function taste(dish) {
  const se = s.dishes[dish].season;
  for (let k = 0; k < 4; k++) {
    ui(() => s.seasonTaste(dish));
    read(1.5);
    const l = se.last;
    if (l.ok) break;
    if (l.salt > 0 || l.pepper > 0) ui(() => s.seasonDilute(dish));
    if (l.salt < 0) ui(() => s.seasonAdd(dish, 'salt'));
    if (l.pepper < 0) ui(() => s.seasonAdd(dish, 'pepper'));
    if (se.unmixed) stir(1.2);
  }
  ui(() => s.seasonDone(dish));
}
// Плита: поставить всё, что можно, на свободные конфорки.
function placeAll() {
  go('stove');
  tip('stove');
  // поставить и повернуть крутилку на 6
  while (s.stoveTasks().length && s.usableBurners().some((b) => b.state === 'empty')) {
    const i = s.usableBurners().find((b) => b.state === 'empty').i;
    ui(() => s.placePot(i, null, 0));
    ui(() => s.setHeat(i, 6));
  }
}
function catCheck() {
  if (s.catNeeds.hunger >= 50 && s.cat.state === 'home') {
    go('catbowl');
    tip('catHungry');
    ui(() => s.feedCat());
  }
}
// Дождаться продукта, достать, остудить у раковины.
function boiled(product) {
  for (;;) {
    for (const b of s.burners) if (b.overflow) { go('stove'); ui(() => s.reduceHeat(b.i)); }
    const b = s.burners.find((x) => x.product === product && x.state !== 'empty');
    if (!b) return;
    if (b.state === 'ready') break;
    tick(0.5, 'wait');
  }
  go('stove');
  ui(() => s.takePot(s.burners.find((x) => x.product === product && x.state === 'ready').i));
  tip('hot');
  go('sink');
  // под кран: положить и держать кнопку, пока не уйдёт пар
  ui(() => s.coolPick(product));
  s.pointer('down', 0, 0);
  tick(s.cfg.cool.underTap + 0.2);
  s.pointer('up', 0, 0);
}
function stir(turns = 4.2) {
  tip('bowl');
  const pts = [];
  for (let i = 0; i <= turns * 36; i++) pts.push([Math.cos((i / 36) * Math.PI * 2) * 0.1, Math.sin((i / 36) * Math.PI * 2) * 0.1]);
  dragPath(pts, 0.1 * Math.PI * 2 * PACE.stirSpeed);
}
function wash(item) {
  go('sink');
  tip('sink');
  ui(() => s.sinkSelect(item));
  for (let i = 0; i < 8 && s.sinkJob; i++) zig(0, 0, SINK.w * 0.9, SINK.d * 0.9, 8);
}
function wipeAll() {
  while (s.puddles.length) {
    go('puddle');
    tip('puddle');
    for (let i = 0; i < 8 && s.panel === 'puddle'; i++) zig(0, 0, 0.5, 0.36, 8);
  }
}
function fixHome() {
  if (s.radio.broken) {
    go('radio');
    s.setHold('radio', true);
    tick(2.1);
  }
  if (s.garland.broken) {
    go('garland');
    s.setHold('garland', true);
    tick(2.1);
  }
  wipeAll();
}
function readPhone() {
  const unread = s.phone.messages.filter((m) => !m.read).length;
  if (!unread) return;
  go('phone');
  read(PACE.readMessage * unread);
  s.markRead();
}
function order(items) {
  go('phone');
  read(2);
  for (const [k, v] of Object.entries(items)) for (let i = 0; i < v; i++) ui(() => s.draftSet(k, (s.delivery.draft[k] ?? 0) + 1));
  ui(() => s.confirmOrder());
}
function collect() {
  while (s.delivery.order && s.delivery.order.status !== 'arrived') tick(0.5, 'wait');
  ui(() => s.collectOrder(true));
  let t = 0;
  while (s.panel !== 'bag' && t < 60) {
    tick(0.1, 'walk');
    t += 0.1;
  }
  for (const [i, it] of s.delivery.bag.items.entries()) ui(() => s.unpack(i, PRODUCTS[it.id].storage));
}
function tray(dish) {
  go('tray');
  ui(() => s.traySelect(dish));
  tip('tray:' + s.trayLayoutId(dish));
}
function fill(conts) {
  const plate = TRAY.workPlate;
  for (const c of conts) for (let k = 0; k < 3 && c.fill < 0.95; k++) {
    clickAt(plate.x, plate.z);
    clickAt(c.x, c.z);
  }
}
function finish() {
  fixHome();
  for (const d of s.dirtyItems()) wash(d.id);
  readPhone();
  think(PACE.inspect);
  const r = s.finishDay();
  if (!r) throw new Error('day not finished: ' + s.pendingSummary());
  return r;
}
function startPotWait() {
  while (s.stove.state === 'boiling') tick(0.5, 'wait');
  if (s.stove.overflow) {
    go('stove');
    ui(() => s.reduceHeat());
  }
}
function handleOverflow() {
  if (s.stove.overflow) {
    go('stove');
    ui(() => s.reduceHeat());
  }
}

const days = [
  () => {
    read(PACE.recipeCheck);
    placeAll();
    for (const k of ['carrot', 'sausage', 'pickle']) {
      board('olivier:' + k);
      handleOverflow();
      catCheck();
    }
    boiled('egg');
    board('olivier:peelEgg');
    adds('olivier');
    readPhone();
    fixHome();
    boiled('potato');
    board('olivier:peelPotato');
    season('olivier');
    stir();
    taste('olivier');
  },
  () => {
    read(PACE.recipeCheck);
    readPhone();
    order({ corn: 1 });
    placeAll();
    wash('bowl');
    for (const k of ['crab', 'cucumber']) board('crab:' + k);
    catCheck();
    boiled('egg');
    board('crab:peelEgg');
    collect();
    adds('crab');
    season('crab');
    stir();
    taste('crab');
  },
  () => {
    read(PACE.recipeCheck);
    readPhone();
    order({ caviar: 1 });
    placeAll();
    tray('sandwiches');
    for (const b of s.dishes.sandwiches.work.breads) zig(b.x, b.z, b.w * 0.95, b.d * 0.95, 7);
    collect();
    tray('sandwiches');
    s.setTool('spoon');
    const doses = wishOf('sandwiches', 'extraCaviar') ? 3 : 2;
    for (const b of s.dishes.sandwiches.work.breads) for (let k = 0; k < doses; k++) clickAt(b.x, b.z);
    think(PACE.inspect);
    ui(() => s.confirmDish('sandwiches'));
    catCheck();
    wash('tray');
    boiled('egg');
    board('eggs:peelEgg');
    tray('eggs');
    s.setTool('knife');
    for (const e of s.dishes.eggs.work.eggs) clickAt(e.x, e.z);
    s.setTool('spoon');
    for (const e of s.dishes.eggs.work.eggs) for (const h of e.halves) clickAt(h.x, h.z);
    adds('eggs');
    season('eggs');
    stir();
    taste('eggs');
    tray('eggs');
    s.setTool('spoon');
    fill(s.dishes.eggs.work.eggs.flatMap((e) => e.halves));
    think(PACE.inspect);
    ui(() => s.confirmDish('eggs'));
  },
  () => {
    read(PACE.recipeCheck);
    tick(6);
    readPhone();
    ui(() => s.setVariant('tomatoes', false));
    order({ greens: 2 });
    placeAll();
    board('tartlets:cheese');
    catCheck();
    boiled('egg');
    board('tartlets:peelEgg');
    adds('tartlets');
    season('tartlets');
    stir();
    taste('tartlets');
    collect();
    tray('tartlets');
    s.setTool('spoon');
    fill(s.dishes.tartlets.work.cups);
    s.setTool('hand');
    for (const c of s.dishes.tartlets.work.cups) clickAt(c.x, c.z);
    think(PACE.inspect);
    ui(() => s.confirmDish('tartlets'));
    wash('bowl');
    wash('tray');
    catCheck();
    tray('tomatoes');
    s.setTool('knife');
    for (const t of s.dishes.tomatoes.work.toms) clickAt(t.x, t.z - 0.01);
    s.setTool('spoon');
    for (const t of s.dishes.tomatoes.work.toms) {
      const pts = [];
      for (let k = 0; k < 24; k++) pts.push([t.x + Math.cos(k * 0.7) * 0.02, t.z + Math.sin(k * 0.7) * 0.02]);
      dragPath(pts);
    }
    board('tomatoes:cheese');
    adds('tomatoes');
    season('tomatoes');
    stir();
    taste('tomatoes');
    tray('tomatoes');
    s.setTool('spoon');
    fill(s.dishes.tomatoes.work.toms);
    s.setTool('hand');
    for (const t of s.dishes.tomatoes.work.toms) clickAt(t.x, t.z);
    think(PACE.inspect);
    ui(() => s.confirmDish('tomatoes'));
  },
  () => {
    read(PACE.recipeCheck);
    placeAll();
    order({ mayo: 2 });
    for (const k of ['onion', 'carrot']) board('shuba:' + k);
    catCheck();
    readPhone();
    fixHome();
    boiled('potato');
    board('shuba:peelPotato');
    board('shuba:herring');
    tip('boardDirty');
    wash('board');
    catCheck();
    boiled('beet');
    board('shuba:beet');
    collect();
    tray('shuba');
    const w = s.dishes.shuba.work;
    for (const comp of s.shubaExpected()) {
      ui(() => s.shubaChoose(comp));
      clickAt(w.dish.x, w.dish.z);
      zig(w.dish.x, w.dish.z, w.dish.r * 1.5, w.dish.r * 1.5, 9);
      ui(() => s.shubaConfirmLayer());
    }
    think(PACE.inspect);
    ui(() => s.confirmDish('shuba'));
  },
  () => {
    read(PACE.recipeCheck);
    order({ grapes: 1 });
    catCheck();
    board('canape:bread');
    board('canape:cheese');
    board('canape:sausage');
    board('canape:cucumber');
    tray('canape');
    const sk = s.dishes.canape.work.skewers;
    for (let i = 0; i < 8; i++)
      for (let k = 0; k < 4; k++) {
        const p = CANAPE_PILES[(k + i) % 4];
        think(PACE.aimClick * 0.8);
        dragPath([[p.x, p.z], [sk[i].slots[k].x, sk[i].slots[k].z]], 0.3);
      }
    think(PACE.inspect);
    ui(() => s.confirmDish('canape'));
    collect();
    tray('fruit');
    const f = s.dishes.fruit.work;
    for (const m of FRUIT_PILES.mandarin) for (let k = 0; k < 4; k++) clickAt(m.x, m.z);
    let n = 0;
    for (const m of FRUIT_PILES.mandarin) for (let k = 0; k < 3; k++) {
      const a = n++ * 0.42;
      think(PACE.aimClick * 0.8);
      dragPath([[m.x, m.z], [f.plate.x + Math.cos(a) * 0.1, f.plate.z + Math.sin(a) * 0.1]], 0.3);
    }
    for (const p of [FRUIT_PILES.apple, FRUIT_PILES.grapes]) for (let k = 0; k < 3; k++) {
      const a = n++ * 0.42;
      think(PACE.aimClick * 0.8);
      dragPath([[p.x, p.z], [f.plate.x + Math.cos(a) * 0.06, f.plate.z + Math.sin(a) * 0.06]], 0.3);
    }
    think(PACE.inspect);
    ui(() => s.confirmDish('fruit'));
  },
  () => {
    read(PACE.recipeCheck);
    order({ marinade: 1 });
    catCheck();
    go('table');
    for (const [i, id] of ['olivier', 'crab', 'sandwiches', 'eggs', 'tartlets'].entries()) {
      think(PACE.aimClick + 0.6);
      s.serveDish(id, i);
    }
    collect();
    tray('chicken');
    zig(0, 0, 0.24, 0.15, 10);
    zig(0, 0, 0.24, 0.15, 10);
    go('oven');
    ui(() => s.ovenLoad());
    go('table');
    for (const [i, id] of ['tomatoes', 'shuba', 'canape', 'fruit'].entries()) {
      think(PACE.aimClick + 0.6);
      s.serveDish(id, i + 5);
    }
    readPhone();
    fixHome();
    while (s.oven.state === 'baking') tick(0.5, 'wait');
    go('oven');
    ui(() => s.ovenTake());
    go('table');
    think(PACE.aimClick + 0.6);
    s.serveDish('chicken', 9);
  },
];

const DEFAULT = { ...PACE };
for (const [pname, prof] of Object.entries(PROFILES)) {
Object.assign(PACE, DEFAULT, prof ?? {});
console.log('\n=== Профиль темпа: ' + pname + ' ===');
const prev = [];
const rows = [];
for (let i = 0; i < 7; i++) {
  for (const k of Object.keys(R)) R[k] = 0;
  tipsSeen.clear();
  s = new KitchenSession({ dayIndex: i, seed: 11 + i, tableDishes: prev.slice() });
  days[i]();
  const r = finish();
  if (process.env.NOTES) console.log('  день', i + 1, JSON.stringify(r.dishes), r.order, r.orderNotes.join('; '), JSON.stringify(r.notes), 'медали', r.medals.join(','), 'темп', r.pace);
  prev.push(...DAYS[i].dishes);
  rows.push({ day: i + 1, total: s.t, ...Object.fromEntries(Object.entries(R).map(([k, v]) => [k, v])), D: r.D, target: DAYS[i].targetMinutes * 60 });
}
const mm = (x) => `${Math.floor(x / 60)}:${String(Math.round(x % 60)).padStart(2, '0')}`;
let tot = 0;
console.log('день | всего | готовка | ходьба | чтение | ожидание | ориентир | D');
for (const r of rows) {
  tot += r.total;
  console.log(`${r.day} | ${mm(r.total)} | ${mm(r.cook)} | ${mm(r.walk)} | ${mm(r.read)} | ${mm(r.wait)} | ${mm(r.target)} | ${r.D}`);
}
console.log(`ИТОГО ${mm(tot)} (${(tot / 60).toFixed(1)} мин)`);
console.log('Допущения темпа:', JSON.stringify(PACE));
}
