// «Рука-призрак» (0.11): реестр демонстраций жестов. Чистый модуль без DOM и Three.js.
//
// DEMOS[id] = { id, label, space, station, dur, startDom?, path(params) } — путь руки как список точек
// { x, z, t, down } (у ёлки ещё y): t — секунды от начала, down — кнопка зажата. Координаты — как у реальных жестов,
// чтобы показанное движение распознавалось настоящей игрой (tests/ghost-v11.test.js гоняет каждую демонстрацию
// через настоящие Stroke, Stirrer, Grater, ShakeTracker, Scrubber, Waver, KibbleShake, WandPlay и tree-geo):
//   space 'plane' — рабочая плоскость станции, локальные метры (view.workPlane(station)); на доске расстояния
//                   в метрах сцены, продукт задают в u (1 u = BOARD_UNIT);
//   space 'tree'  — координаты ёлки (tree-geo.js): метры от центра на полу, y вверх;
//   space 'cat'   — вокруг кота на экране, единицы — высота экрана (как у Waver);
//   space 'knob'  — вокруг крутилки огня, единицы — её радиус; x вправо, z вниз по экрану.
// Все числа берутся из данных станций (CAMPAIGN, BOWL, STOVE, PUDDLE, DISHWASHER, TREE, PRODUCTS), а не «на глаз».
import { CAMPAIGN, PRODUCTS } from '../campaign/data.js';
import { BOWL, STOVE, PUDDLE, DISHWASHER, TREE } from '../campaign/layout.js';
import { BOARD_UNIT } from '../campaign/st-board.js';
import { outerRadius, snapToTree } from '../campaign/tree-geo.js';
import { GHOST_IDS } from './ghost-ids.js';

const U = BOARD_UNIT;
const STEP = 1 / 20; // шаг выборки пути, с
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const smooth = (u) => u * u * (3 - 2 * u);
const num = (v, d) => (Number.isFinite(v) ? v : d);

// Точка пути без времени: { x, z, y? }
const mix = (a, b, k) => {
  const p = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  if (a.y !== undefined && b.y !== undefined) p.y = a.y + (b.y - a.y) * k;
  return p;
};
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z, (a.y ?? 0) - (b.y ?? 0));

/** Выборка пути: fn(u) → точка при u ∈ [0, 1], down(u) — зажата ли кнопка. Шаг ≈ 1/20 с, не меньше 8 точек. */
function sample(dur, fn, down) {
  const n = Math.max(8, Math.round(dur / STEP));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = fn(u);
    const pt = { x: r4(p.x), z: r4(p.z), t: r4(u * dur), down: !!down(u) };
    if (p.y !== undefined) pt.y = r4(p.y);
    out.push(pt);
  }
  out[out.length - 1].t = dur;
  return out;
}

/** Положение на ломаной verts: k ∈ [0, 1] — доля её длины. */
function along(verts, k) {
  const lens = [];
  let total = 0;
  for (let i = 1; i < verts.length; i++) {
    lens.push(gap(verts[i - 1], verts[i]));
    total += lens[i - 1];
  }
  let s = Math.max(0, Math.min(1, k)) * total;
  for (let i = 0; i < lens.length; i++) {
    if (s <= lens[i] || i === lens.length - 1) return mix(verts[i], verts[i + 1], lens[i] ? Math.min(1, s / lens[i]) : 0);
    s -= lens[i];
  }
  return { ...verts[0] };
}

/**
 * Рука подходит, зажимает, ведёт по drag(v) (v ∈ [0, 1]) и отпускает. lead и tail — доли времени на подход и уход,
 * away — откуда рука приходит (метры). Подход и уход — без нажатия.
 */
function press(dur, drag, { lead = 0.16, tail = 0.12, away = { x: 0.06, z: -0.05 } } = {}) {
  const a = drag(0), b = drag(1);
  const from = { ...a, x: a.x + away.x, z: a.z + away.z };
  const out = { ...b, x: b.x + away.x * 0.6, z: b.z + away.z * 0.6 };
  return sample(
    dur,
    (u) => {
      if (u < lead) return mix(from, a, smooth(u / lead));
      if (u > 1 - tail) return mix(b, out, smooth((u - (1 - tail)) / tail));
      return drag((u - lead) / (1 - lead - tail));
    },
    (u) => u >= lead && u <= 1 - tail,
  );
}

/** Рука ведёт по ломаной с плавным стартом и остановкой. */
const stroke = (dur, verts, o) => press(dur, (v) => along(verts, smooth(v)), o);

/** Склейка двух путей: между ними рука переезжает без нажатия за pause с. */
function chain(a, b, pause = 0.15) {
  const ea = a[a.length - 1], sb = b[0];
  const n = Math.max(1, Math.round(pause / STEP));
  const mid = [];
  for (let i = 1; i <= n; i++) {
    const p = mix(ea, sb, smooth(i / n));
    mid.push({ x: r4(p.x), z: r4(p.z), t: r4(ea.t + (pause * i) / n), down: false });
  }
  const shift = ea.t + pause;
  return [...a, ...mid, ...b.slice(1).map((q) => ({ ...q, t: r4(q.t + shift) }))];
}

// ---------- доска ----------
// Продукт на доске лежит центром в нуле; params.w × params.d — его размеры в u в системе доски (с учётом поворота).
const PRODUCT_DEFAULT = PRODUCTS.potato.cut;
const LOG_DEFAULT = { w: PRODUCTS.sausage.round.length, d: PRODUCTS.sausage.round.radius * 2 };

function boardBox(p, def) {
  return { hx: (num(p?.w, def.w) / 2) * U, hz: (num(p?.d, def.d) / 2) * U };
}

// Срез толщиной в целевой кубик от края: не толще 60 % продукта
const slice = (half) => -half + Math.min(CAMPAIGN.tolerance.min * 1.5 * U, half * 0.6);

function cutV(p, def) {
  const { hx, hz } = boardBox(p, def);
  const x = slice(hx), over = 0.9 * U;
  return stroke(2, [{ x, z: -hz - over }, { x, z: hz + over }], { away: { x: 0.07, z: -0.04 } });
}

// ---------- миска ----------
const CIRCLE_R = 0.09; // между mix.minRadius и mix.maxRadius

function stir() {
  const turns = 2;
  return press(2.2, (v) => ({ x: Math.cos(v * turns * 2 * Math.PI) * CIRCLE_R, z: Math.sin(v * turns * 2 * Math.PI) * CIRCLE_R }), { lead: 0.14, tail: 0.1, away: { x: 0.1, z: -0.08 } });
}

function salt() {
  // 4 полных взмаха «вниз-вверх» размахом вдвое больше shake.amplitude, ~2,2 взмаха в секунду (интервал не короче shake.minInterval)
  const amp = CAMPAIGN.shake.amplitude * 1.6;
  return press(2, (v) => ({ x: 0, z: -amp * Math.sin(v * 4 * 2 * Math.PI) }), { lead: 0.14, tail: 0.1, away: { x: 0.08, z: -0.07 } });
}

function pour() {
  // зигзаг над миской, как мажут майонез: путь ≈ 0,4 м — около порции (pour.mayo.rate · путь ≈ 1)
  const w = BOWL.r * 0.42, h = BOWL.r * 0.34;
  return stroke(2.2, [{ x: -w, z: -h }, { x: w, z: -h }, { x: w * 0.9, z: 0 }, { x: -w, z: 0 }, { x: -w * 0.9, z: h }, { x: w, z: h }], { away: { x: 0.08, z: -0.07 } });
}

// ---------- кот ----------
function catWave() {
  // рука над котом: 4 взмаха влево-вправо размахом вдвое больше cat.wave.minAmp, без нажатия
  const amp = CAMPAIGN.cat.wave.minAmp * 1.8;
  return sample(2, (u) => ({ x: Math.sin(u * 4 * 2 * Math.PI) * amp * Math.min(1, u * 8), z: -0.06 }), () => false);
}

function catKibble() {
  // пачка над миской: 4 встряхивания размахом вдвое больше cat.feed.amplitude
  const amp = CAMPAIGN.cat.feed.amplitude * 1.5;
  return press(2, (v) => ({ x: 0, z: -amp * Math.sin(v * 4 * 2 * Math.PI) }), { lead: 0.14, tail: 0.1, away: { x: 0.25, z: -0.2 } });
}

function catWand() {
  // «удочка» чертит восьмёрку вокруг миски: путь ≈ 2,6 м за 2 с (play.path = 3 м — полная игра)
  const rx = 0.45, rz = 0.3;
  return press(2, (v) => ({ x: Math.sin(v * 2 * Math.PI) * rx, z: Math.sin(v * 4 * Math.PI) * rz * 0.5 }), { lead: 0.12, tail: 0.1, away: { x: 0.3, z: -0.2 } });
}

// ---------- ёлка ----------
// Точка на поверхности ёлки на высоте y и угле a (от +z к +x); a = TREE.face смотрит на камеру
function onTreeAt(a, y) {
  const r = outerRadius(y);
  return snapToTree({ x: Math.sin(a) * r, y, z: Math.cos(a) * r }) ?? { x: 0, y, z: 0 };
}

function tinsel() {
  // гирлянда дугой через переднюю сторону ёлки: провисает между ярусами
  const arc = 0.95, yEnd = 0.98, sag = 0.17;
  return press(2.4, (v) => {
    const y = yEnd - sag * Math.sin(Math.PI * v);
    const p = onTreeAt(TREE.face - arc + 2 * arc * v, y);
    return { x: p.x, y: p.y, z: p.z };
  }, { lead: 0.1, tail: 0.1, away: { x: -0.15, z: 0.05 } });
}

function toyDrag(p) {
  // из коробки у подножия — на свободную ветку (params.to — точка на ёлке); по пути рука идёт дугой
  const to = p?.to ?? onTreeAt(TREE.face + 0.25, 1.02);
  const from = { x: Math.sin(TREE.face + 0.4) * 0.95, y: 0.1, z: Math.cos(TREE.face + 0.4) * 0.95 };
  return press(2.2, (v) => {
    const k = smooth(v);
    const q = mix(from, to, k);
    return { x: q.x, y: q.y + Math.sin(Math.PI * k) * 0.18, z: q.z };
  }, { lead: 0.12, tail: 0.12, away: { x: 0.05, z: 0.05 } });
}

// ---------- подарок (плоскость крышки; центр — бант) ----------
function giftBow() {
  const c = CAMPAIGN.gift;
  return stroke(1.8, [{ x: 0, z: 0 }, { x: c.bowPull * 1.25, z: -c.bowPull * 0.45 }], { lead: 0.2, tail: 0.15, away: { x: 0.05, z: 0.05 } });
}

function giftPaper() {
  // рвёт бумагу: туда-сюда по коробке; путь ≈ 0,9 м при tearPath 0,6
  const c = CAMPAIGN.gift, x = c.box * 0.75, z = c.box * 0.55;
  return stroke(2.2, [{ x: -x, z: -z }, { x, z: -z * 0.6 }, { x: -x, z: 0 }, { x, z: z * 0.5 }, { x: -x, z }, { x, z: z * 0.9 }], { lead: 0.14, tail: 0.1, away: { x: 0.06, z: -0.06 } });
}

function giftLid() {
  const c = CAMPAIGN.gift;
  return stroke(1.8, [{ x: 0, z: 0 }, { x: c.lidSlide * 0.3, z: c.lidSlide * 1.35 }], { lead: 0.2, tail: 0.15, away: { x: 0.05, z: -0.05 } });
}

// ---------- уборка и плита ----------
function wipe(p) {
  if (p?.where === 'stove') {
    // тряпкой по залитой конфорке: внутри stove.r · 1,6, шаг меньше stove.wipe.maxStep
    const c = STOVE.burners[p.burner ?? 0], w = STOVE.r * 0.9, h = STOVE.r * 0.55;
    const v = [-w, w, -w, w, -w, w].map((x, i) => ({ x: c.x + x, z: c.z + h * (-1 + (2 * i) / 5) }));
    return stroke(2, v, { away: { x: 0.08, z: -0.06 } });
  }
  // лужа: зигзаг по пятну
  const w = PUDDLE.w * 0.34, h = PUDDLE.d * 0.3;
  const v = [-w, w, -w, w, -w, w].map((x, i) => ({ x, z: h * (-1 + (2 * i) / 5) }));
  return stroke(2.2, v, { away: { x: 0.1, z: -0.08 } });
}

function knob(p) {
  // по дуге вокруг крутилки на 3 деления (по 30°), указатель на её краю; от 6 и выше — в обратную сторону
  const heat = Math.max(0, Math.min(CAMPAIGN.stove.maxHeat, Math.round(num(p?.heat, 0))));
  const dir = heat >= 6 ? -1 : 1;
  const a0 = (-135 + heat * 30) * (Math.PI / 180), span = dir * (110 * Math.PI) / 180, r = 0.85;
  return press(1.8, (v) => {
    const a = a0 + span * smooth(v);
    return { x: Math.sin(a) * r, z: -Math.cos(a) * r };
  }, { lead: 0.16, tail: 0.14, away: { x: 0.5, z: -0.5 } });
}

// ---------- посудомойка (плоскость дверцы: x вправо, z вниз) ----------
function washerDoor() {
  const h = DISHWASHER.handle, travel = CAMPAIGN.dishwasher.door.travel;
  return stroke(1.8, [{ x: h.x, z: h.z }, { x: h.x, z: h.z + travel * 1.12 }], { lead: 0.2, tail: 0.15, away: { x: 0.1, z: -0.08 } });
}

function washerDrag() {
  const c = DISHWASHER.cavity, zc = (c.z0 + c.z1) / 2;
  return stroke(2, [{ x: c.x * 0.5, z: DISHWASHER.closeFrom + 0.32 }, { x: 0.02, z: zc }], { lead: 0.14, tail: 0.14, away: { x: 0.05, z: 0.06 } });
}

// ---------- чистка ----------
function peel(p) {
  // нож зигзагом по продукту; params.zone — { x, z, rx, rz } из it.peel.zones (метры), иначе картофелина по умолчанию
  const z = p?.zone ?? { x: 0, z: 0, rx: (PRODUCT_DEFAULT.w / 2) * U, rz: (PRODUCT_DEFAULT.d / 2) * U };
  const w = z.rx * 1.1, h = z.rz * 0.8;
  const rows = 4;
  const verts = [];
  for (let i = 0; i <= rows; i++) {
    const zz = z.z + h * (-1 + (2 * i) / rows);
    verts.push(...(i % 2 ? [{ x: z.x + w, z: zz }, { x: z.x - w, z: zz }] : [{ x: z.x - w, z: zz }, { x: z.x + w, z: zz }]));
  }
  if (!p?.hand) return stroke(2.2, verts, { lead: 0.12, tail: 0.1, away: { x: 0.07, z: -0.05 } });
  // яйцо: сначала два раза нажать, чтобы скорлупа треснула, потом снимать её пальцами
  const taps = sample(0.8, (u) => {
    const k = 1 - smooth(Math.min(1, u * 4));
    return { x: z.x + 0.07 * k, z: z.z - 0.05 * k };
  }, (u) => (u >= 0.25 && u < 0.45) || (u >= 0.6 && u < 0.8));
  return chain(taps, stroke(1.4, verts, { lead: 0.1, tail: 0.1, away: { x: 0.07, z: -0.05 } }));
}

// ---------- реестр ----------
/** Описание демонстрации по умолчанию: подпись для плашки, где живёт, сколько идёт (1,5–2,5 с). */
const demo = (id, label, space, station, path, extra = {}) => {
  const dur = path({}).at(-1).t;
  return { id, label, space, station, dur, path, ...extra };
};

export const DEMOS = {
  'cut-v': demo('cut-v', 'Зажми и проведи нож сверху вниз', 'plane', 'board', (p) => cutV(p, PRODUCT_DEFAULT)),
  'cut-h': demo('cut-h', 'Зажми и проведи нож слева направо', 'plane', 'board', (p) => {
    const { hx, hz } = boardBox(p, PRODUCT_DEFAULT);
    const z = slice(hz), over = 0.9 * U;
    return stroke(2, [{ x: -hx - over, z }, { x: hx + over, z }], { away: { x: -0.05, z: -0.07 } });
  }),
  round: demo('round', 'Кружочки: проведи нож сверху вниз', 'plane', 'board', (p) => cutV(p, LOG_DEFAULT)),
  grate: demo('grate', 'Води продукт по тёрке вверх-вниз', 'plane', 'board', () => {
    const top = CAMPAIGN.grate.zoneTop * 1.5, bottom = CAMPAIGN.grate.zoneBottom * 1.5;
    return stroke(2.2, [{ x: 0, z: top }, { x: 0.006, z: bottom }, { x: -0.006, z: top }, { x: 0.006, z: bottom }, { x: 0, z: top }], { lead: 0.12, tail: 0.1, away: { x: 0.09, z: -0.04 } });
  }),
  peel: demo('peel', 'Зажми и води ножом по продукту', 'plane', 'board', peel),
  stir: demo('stir', 'Зажми и води ложку по кругу', 'plane', 'bowl', stir),
  salt: demo('salt', 'Зажми и потряси солонку над миской', 'plane', 'bowl', salt),
  pour: demo('pour', 'Зажми и води над миской', 'plane', 'bowl', pour),
  'cat-wave': demo('cat-wave', 'Помаши мышью над котом', 'cat', 'cat', catWave),
  'cat-kibble': demo('cat-kibble', 'Зажми пачку и потряси над миской', 'plane', 'catbowl', catKibble),
  'cat-wand': demo('cat-wand', 'Зажми «удочку» и води по полу', 'plane', 'catbowl', catWand),
  tinsel: demo('tinsel', 'Зажми и веди мишуру по веткам', 'tree', 'tree', tinsel),
  'toy-drag': demo('toy-drag', 'Зажми игрушку и перетащи на ёлку', 'tree', 'tree', toyDrag, { startDom: '[data-drag-toy]' }),
  'gift-bow': demo('gift-bow', 'Зажми бант и потяни', 'plane', 'tree', giftBow),
  'gift-paper': demo('gift-paper', 'Зажми и води по коробке туда-сюда', 'plane', 'tree', giftPaper),
  'gift-lid': demo('gift-lid', 'Зажми крышку и сдвинь', 'plane', 'tree', giftLid),
  wipe: demo('wipe', 'Зажми и три тряпкой туда-обратно', 'plane', 'puddle', wipe),
  knob: demo('knob', 'Зажми крутилку и поверни по кругу', 'knob', 'knob', knob),
  'washer-door': demo('washer-door', 'Зажми ручку и потяни вниз', 'plane', 'dishwasher', washerDoor),
  'washer-drag': demo('washer-drag', 'Зажми посуду и перетащи в проём', 'plane', 'dishwasher', washerDrag, { startDom: '[data-drag-dw]' }),
};

/** Номера по порядку GHOST_IDS: каждый жест реестра описан, лишнего нет. */
export const DEMO_IDS = GHOST_IDS.filter((id) => DEMOS[id]);

/** Станция, в плоскости которой идёт показ: плита вместо лужи, если трём конфорку (params.where === 'stove'). */
export function demoStation(id, params) {
  if (id === 'wipe' && params?.where === 'stove') return 'stove';
  return DEMOS[id]?.station ?? null;
}

/** Путь демонстрации id; неизвестный жест — пустой список. */
export function demoPath(id, params = {}) {
  return DEMOS[id] ? DEMOS[id].path(params) : [];
}

/**
 * Положение руки в момент t: линейно между соседними точками пути. До начала и после конца — крайние точки.
 * Возвращает { x, z, y?, down } — down берётся у ближайшей прошедшей точки.
 */
export function sampleAt(path, t) {
  if (!path.length) return null;
  if (t <= path[0].t) return { ...path[0] };
  const last = path[path.length - 1];
  if (t >= last.t) return { ...last };
  let i = 1;
  while (i < path.length - 1 && path[i].t < t) i++;
  const a = path[i - 1], b = path[i];
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  const p = { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, down: k < 1 ? a.down : b.down };
  if (a.y !== undefined && b.y !== undefined) p.y = a.y + (b.y - a.y) * k;
  return p;
}

