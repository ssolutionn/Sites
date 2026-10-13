// «Рука-призрак» (0.11): по состоянию кухни и событиям сессии понять, какой жест показывать и когда игрок с ним не справился.
// Чистый модуль без DOM и Three.js: читает сессию, ничего в ней не меняет.
//  • gestureNow(s)  — какой жест сейчас у игрока в руках (для «?» и сторожа нажатий);
//  • paramsFor(id, s) — размеры продукта, зона чистки, огонь и т. п. для DEMOS[id].path;
//  • placeOk(id, s) — готова ли станция, чтобы показ имел смысл (игрок там, где жест);
//  • cueOf(e, s)    — событие сессии → первая встреча или отказ { kind, id, reason };
//  • PressWatch     — нажатие, которое водили, но жест не засчитался, — это отказ.
import { CAMPAIGN, TINSEL } from '../campaign/data.js';
import { CLOSEUP_STATIONS, TREE } from '../campaign/layout.js';
import { outerRadius, snapToTree } from '../campaign/tree-geo.js';

/** Тема подсказки первой встречи на доске → жест. */
const TUTORIAL = { cube: 'cut-v', round: 'round', grate: 'grate', peel: 'peel' };

/** События сессии, которые для жеста значат «получается»: нажатие без них — отказ. Посудомойка здесь не нужна: у неё свои отказы (dwDeny). */
export const PROGRESS = {
  'cut-v': ['cut'], // нож по сетке не отказывает за косой росчерк: надрез, не отделивший кусок, — молчание, его ловит сторож
  stir: ['stir'],
  grate: ['grate'],
  peel: ['peel', 'eggCrack', 'peeled'],
  salt: ['pinch'],
  pour: ['pour', 'added'],
  'cat-kibble': ['kibble', 'catFed'],
  'cat-wand': ['wand', 'catPlay'],
  tinsel: ['tinselDraw', 'tinselHung'],
  'gift-bow': ['giftTick', 'giftBow'],
  'gift-paper': ['giftTick', 'giftPaper'],
  'gift-lid': ['giftTick', 'giftOpened'],
  wipe: ['wipe', 'puddleClean', 'stoveClean'],
};

/** Какой жест сейчас у игрока в руках; null — показывать нечего. */
export function gestureNow(s) {
  if (!s || s.isOver?.() || s.heroine?.away) return null;
  const p = s.panel;
  // кота гонят махом в обзоре кухни; из крупного плана сначала выходят
  if (s.catActive?.() && !(p && CLOSEUP_STATIONS.has(p))) return 'cat-wave';
  switch (p) {
    case 'board': {
      const it = s.boardCur?.();
      if (!it || s.board?.flat) return null; // нож плашмя смахивает, а не режет: показывать росчерк ножа тут нельзя
      if (it.grater) return 'grate';
      if (it.peel) return 'peel';
      return it.log ? 'round' : 'cut-v';
    }
    case 'bowl':
      if (s.bowl.pouring) return 'pour';
      if (s.bowl.shaker) return 'salt';
      return s.bowl.contents.length || s.mixTarget?.()?.ok ? 'stir' : null;
    case 'catbowl':
      return s.catTool === 'kibble' ? 'cat-kibble' : s.catTool === 'wand' ? 'cat-wand' : null;
    case 'puddle':
      return 'wipe';
    case 'stove':
      // продукт в руках и есть куда поставить — переносим на конфорку; готовая кастрюля — оттаскиваем; залитая конфорка — трём
      if (s.carry?.boilStep && s.burners.some((b) => b.state === 'empty' && !b.dirty)) return 'stove-place';
      if (s.stoveWipe || s.burners.some((b) => b.dirty)) return 'wipe';
      if (s.burners.some((b) => b.state === 'ready')) return 'stove-pot';
      return s.burners.some((b) => b.state !== 'empty') ? 'knob' : null;
    case 'tree':
      if (s.gift) return { bow: 'gift-bow', paper: 'gift-paper', lid: 'gift-lid' }[s.gift.stage] ?? null;
      if (s.treeFall?.down) return null;
      if (TINSEL[s.tinsel?.tool]) return 'tinsel';
      if (s.treeHand != null || s.toysInBox?.().length) return 'toy-drag';
      return null;
    case 'dishwasher':
      return s.dishwasher.door === 'open' ? 'washer-drag' : 'washer-door';
    default:
      return null;
  }
}

/** Первая конфорка с кастрюлей (на ней крутят огонь), иначе первая. */
const activeBurner = (s) => s.burners.find((b) => b.state !== 'empty') ?? s.burners[0];

/**
 * Свободное место на передней стороне ёлки, куда можно повесить игрушку: от середины кадра наружу, ярус за ярусом.
 * null — свободных мест не нашлось (тогда рука целится в стандартную точку).
 */
export function freeSpot(s) {
  const ys = [1.0, 0.75, 1.25, 0.5];
  const as = [0.25, -0.3, 0.6, -0.65, 0.95, -1.0].map((d) => TREE.face + d);
  for (const y of ys)
    for (const a of as) {
      const r = outerRadius(y);
      const p = snapToTree({ x: Math.sin(a) * r, y, z: Math.cos(a) * r });
      if (p && s.hangCheck?.(p).ok) return p;
    }
  return null;
}

/** Размеры продукта на доске в системе доски (u): поворот доски меняет ширину и глубину. */
function boardExtents(it) {
  if (it.log) return { w: it.log.length, d: it.radius * 2 };
  if (!it.body) return {};
  const { w, d } = it.body.shape;
  const zs = it.body.copies.map((c) => c.cz);
  const total = zs.length ? Math.max(...zs) - Math.min(...zs) + d : d;
  const a = it.angle ?? 0, c = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
  return { w: c * w + sn * total, d: sn * w + c * total };
}

/** Параметры для DEMOS[id].path по состоянию кухни; пустой объект — путь по умолчанию. */
export function paramsFor(id, s) {
  if (!s) return {};
  switch (id) {
    case 'cut-v':
    case 'cut-h':
    case 'round': {
      const it = s.boardCur?.();
      return it ? boardExtents(it) : {};
    }
    case 'peel': {
      const it = s.boardCur?.();
      if (!it?.peel) return {};
      // зона чистки задана в системе продукта: доска повёрнута — переводим центр в систему доски
      const z = it.peel.zones?.[0];
      if (!z) return {};
      const a = it.angle ?? 0, c = Math.cos(a), sn = Math.sin(a);
      const swap = Math.abs(sn) > 0.7;
      return { zone: { x: z.x * c + z.z * sn, z: -z.x * sn + z.z * c, rx: swap ? z.rz : z.rx, rz: swap ? z.rx : z.rz }, hand: !!it.hand };
    }
    case 'wipe': {
      if (s.panel !== 'stove') return {};
      const b = s.burners.find((x) => x.dirty) ?? activeBurner(s);
      return { where: 'stove', burner: b.i };
    }
    case 'knob': {
      const b = activeBurner(s);
      return { burner: b.i, heat: b.heat ?? 0 };
    }
    case 'toy-drag': {
      const to = freeSpot(s);
      return to ? { to } : {};
    }
    case 'stove-place':
      return { burner: (s.usableBurners?.() ?? s.burners).find((b) => b.state === 'empty' && !b.dirty)?.i ?? 0 };
    case 'stove-pot':
      return { burner: s.burners.find((b) => b.state === 'ready')?.i ?? 0 };
    default:
      return {};
  }
}

/**
 * Показ ещё нужен, хотя игрока пока нет на месте: кот безобразничает, пена убегает. Рука ждёт, пока игрок подойдёт или
 * пока это не кончится; остальные жесты ждут не дольше CAMPAIGN.ghost.wait секунд.
 */
export function stillRelevant(id, s) {
  if (id === 'cat-wave') return !!s?.catActive?.();
  if (id === 'knob') return !!s?.burners?.some((b) => b.overflow);
  return false;
}

/** Игрок там, где жест имеет смысл (станция открыта, подарок в руках, кот безобразничает)? */
export function placeOk(id, s) {
  if (!s || s.isOver?.() || s.heroine?.away || s.heroine?.target) return false;
  const p = s.panel;
  switch (id) {
    case 'cut-v':
    case 'cut-h':
    case 'round':
      return p === 'board' && !!s.boardCur?.() && !s.board?.flat;
    case 'grate':
    case 'peel':
      return p === 'board' && !!s.boardCur?.();
    case 'stir':
    case 'salt':
    case 'pour':
      return p === 'bowl';
    case 'cat-wave':
      return !!s.catActive?.() && !(p && CLOSEUP_STATIONS.has(p));
    case 'cat-kibble':
    case 'cat-wand':
      return p === 'catbowl';
    case 'tinsel':
    case 'toy-drag':
      return p === 'tree' && !s.gift && !s.treeFall?.down;
    case 'gift-bow':
    case 'gift-paper':
    case 'gift-lid':
      return p === 'tree' && !!s.gift;
    case 'wipe':
      return p === 'puddle' || p === 'stove';
    case 'knob':
      return p === 'stove';
    case 'stove-place':
      return p === 'stove' && !!s.carry?.boilStep;
    case 'stove-pot':
      return p === 'stove' && s.burners.some((b) => b.state === 'ready');
    case 'washer-door':
    case 'washer-drag':
      return p === 'dishwasher';
    default:
      return false;
  }
}

// Какой нож показывать при отказе: кружочки (колбаса, огурец) режут только поперёк, остальное — обычный росчерк
function knifeDemo(reason, s) {
  if (reason === 'rounds-only' || s?.boardCur?.()?.log) return 'round';
  return 'cut-v';
}

// Отказы ножа, где виновата рука; «слишком близко к краю» и «кусков достаточно» — не жест
const KNIFE_REFUSALS = new Set(['short', 'diagonal', 'wobbly', 'rounds-only', 'outside', 'miss']);
const first = (id) => ({ kind: 'first', id });
const refuse = (id, reason) => ({ kind: 'refuse', id, reason });

/** Событие сессии → повод для руки: { kind: 'first', id } или { kind: 'refuse', id, reason } либо null. */
export function cueOf(e, s) {
  switch (e.type) {
    case 'tutorial':
      return TUTORIAL[e.topic] ? first(TUTORIAL[e.topic]) : null;
    case 'cutDenied':
      if (e.sweep) return null; // отказ смаха ножом плашмя (st-board.js), а не росчерка
      return KNIFE_REFUSALS.has(e.reason) ? refuse(knifeDemo(e.reason, s), e.reason) : null;
    case 'hangDenied':
      return e.why === 'off' || e.why === 'close' ? refuse('toy-drag', e.why) : null;
    case 'dwDeny': {
      const t = String(e.text ?? '');
      if (/^Опусти посуду/.test(t)) return refuse('washer-drag', 'miss');
      if (/^Потяни ручку ниже|^Дверца закрыта/.test(t)) return refuse('washer-door', 'closed');
      return null;
    }
    case 'catStart':
      return first('cat-wave');
    case 'catPick':
      return e.tool === 'kibble' ? first('cat-kibble') : e.tool === 'wand' ? first('cat-wand') : null;
    case 'pick':
      if (e.product === 'salt' || e.product === 'pepper') return first('salt');
      if (e.product === 'tinsel') return first('tinsel');
      if (e.product === 'toy') return first('toy-drag');
      return s?.bowl?.pouring ? first('pour') : null;
    case 'bowlAdd':
      return s?.mixTarget?.()?.ok ? first('stir') : null;
    case 'open':
      if (e.station === 'bowl') return s?.bowl?.contents.length && s.mixTarget?.()?.ok ? first('stir') : null;
      if (e.station === 'puddle') return first('wipe');
      if (e.station === 'stove') {
        if (s?.carry?.boilStep) return first('stove-place');
        if (s?.burners.some((b) => b.state === 'ready')) return first('stove-pot');
        if (s?.burners.some((b) => b.overflow)) return first('knob');
        return s?.burners.some((b) => b.dirty) ? first('wipe') : null;
      }
      if (e.station === 'dishwasher') return first('washer-door');
      return null;
    case 'potBoil': // пена поднимается — пора убавить огонь крутилкой
      return first('knob');
    case 'stoveMiss':
      return refuse('stove-place', 'miss');
    case 'potStay':
      return refuse('stove-pot', 'stay');
    case 'dwDoor':
      return e.open ? first('washer-drag') : null;
    case 'giftStart':
      return first({ bow: 'gift-bow', paper: 'gift-paper', lid: 'gift-lid' }[e.stage] ?? 'gift-bow');
    case 'giftBow':
      return first('gift-paper');
    case 'giftPaper':
      return first('gift-lid');
    default:
      return null;
  }
}

/**
 * Сторож нажатий: игрок зажал кнопку на сцене, водил дольше minTime секунд и дальше minTravel (доли высоты экрана),
 * а ни одно событие прогресса жеста не пришло — жест не получился. Так ловятся отказы, у которых в игре нет своего кода:
 * круги слишком мелкие, тёрка не вверх-вниз, мишура мимо ёлки. Порог нажатия берётся из CAMPAIGN.ghost.press.
 */
export class PressWatch {
  constructor({ cfg = CAMPAIGN.ghost.press, progress = PROGRESS } = {}) {
    this.cfg = cfg;
    this.progressOf = progress;
    this.cur = null;
  }

  /** Нажали: id — жест в этот момент (gestureNow), t — секунды, x и y — положение в долях высоты экрана. */
  down(id, t, x, y) {
    this.cur = id && this.progressOf[id] ? { id, t0: t, x, y, travel: 0, ok: false } : null;
  }

  /** Указатель сдвинулся. */
  move(x, y) {
    const c = this.cur;
    if (!c) return;
    c.travel += Math.hypot(x - c.x, y - c.y);
    c.x = x;
    c.y = y;
  }

  /** Событие сессии: если оно — прогресс этого жеста, нажатие удалось. */
  event(type) {
    if (this.cur && this.progressOf[this.cur.id].includes(type)) this.cur.ok = true;
  }

  /** Отпустили в момент t. Возвращает { id, reason: 'idle' }, если водили впустую, иначе null. */
  up(t) {
    const c = this.cur;
    this.cur = null;
    if (!c || c.ok) return null;
    return t - c.t0 >= this.cfg.minTime - 1e-9 && c.travel >= this.cfg.minTravel - 1e-9 ? { id: c.id, reason: 'idle' } : null;
  }

  cancel() {
    this.cur = null;
  }
}
