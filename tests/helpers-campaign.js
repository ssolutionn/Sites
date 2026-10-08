// Помощники для тестов кампании: прогон времени и типовые действия игрока через API.
import { KitchenSession } from '../src/campaign/session.js';
import { BOARD_UNIT } from '../src/campaign/st-board.js';
import { bounds } from '../src/game/cutting.js';

export function run(s, seconds, fps = 30) {
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) s.update(1 / fps);
}

export function arrive(s, station, max = 15) {
  s.goTo(station);
  for (let i = 0; i < max * 30 && s.panel !== station; i++) s.update(1 / 30);
  if (s.panel !== station) throw new Error(`не дошла до ${station}: panel=${s.panel} hint=${s.hint?.text}`);
}

export function waitAction(s) {
  for (let i = 0; i < 600 && s.action; i++) s.update(1 / 30);
}

// Росчерк ножом по доске в единицах продукта: axis 'x' — линия вдоль Z на x = pos, 'z' — вдоль X на z = pos.
export function knife(s, axis, pos, from, to, steps = 8) {
  const pt = (k) => {
    const v = from + ((to - from) * k) / steps;
    return axis === 'x' ? [pos * BOARD_UNIT, v * BOARD_UNIT] : [v * BOARD_UNIT, pos * BOARD_UNIT];
  };
  const it = s.boardCur();
  const before = it?.cuts ?? 0;
  s.pointer('down', ...pt(0));
  for (let k = 1; k <= steps; k++) s.pointer('move', ...pt(k));
  const r = s.pointer('up', ...pt(steps));
  waitAction(s);
  // нож по сетке режет по ходу движения: «cut» — если появился новый кусок
  if (it?.body) return it.cuts > before ? 'cut' : r;
  return r;
}

// Нарезка кубиком step см: полоски сверху вниз, затем поперёк каждой штуки (доска не повёрнута).
export function cutCubes(s, step = 1) {
  const it = s.boardCur();
  if (it.body) {
    const { w, d } = it.body.shape;
    const zs = it.body.copies.map((c) => c.cz);
    const z0 = Math.min(...zs) - d / 2 - 0.8, z1 = Math.max(...zs) + d / 2 + 0.8;
    for (let x = -w / 2 + step; x < w / 2 - 0.3; x += step) knife(s, 'x', x, z0, z1, 16);
    for (const cz of zs) for (let z = cz - d / 2 + step; z < cz + d / 2 - 0.3; z += step) knife(s, 'z', z, -w / 2 - 0.8, w / 2 + 0.8, 16);
    return;
  }
  for (let guard = 0; guard < 60; guard++) {
    const wide = it.pieces.filter((p) => p.w > 1.25).sort((a, c) => a.x - c.x)[0];
    if (!wide) break;
    const b = bounds(it.pieces);
    let r = knife(s, 'x', wide.x + 1, b.minZ - 0.4, b.maxZ + 0.4);
    if (r !== 'cut') r = knife(s, 'x', wide.x + wide.w / 2, b.minZ - 0.4, b.maxZ + 0.4);
    if (r !== 'cut') break;
  }
  for (let guard = 0; guard < 80; guard++) {
    const wide = it.pieces.filter((p) => p.d > 1.25).sort((a, c) => a.z - c.z)[0];
    if (!wide) break;
    const b = bounds(it.pieces);
    let r = knife(s, 'z', wide.z + 1, b.minX - 0.4, b.maxX + 0.4);
    if (r !== 'cut') r = knife(s, 'z', wide.z + wide.d / 2, b.minX - 0.4, b.maxX + 0.4);
    if (r !== 'cut') break;
  }
}

export function cutRounds(s, thickness = s.cfg.roundTarget.thickness) {
  const it = s.boardCur();
  const L = it.log.length / 2;
  for (let x = -L + 0.6; x < L - 0.4; x += thickness) knife(s, 'x', x, -it.radius - 0.6, it.radius + 0.6);
}

// Круговые движения в миске.
export function stir(s, turns = 4.3, r = 0.1) {
  const steps = Math.ceil(turns * 36);
  s.pointer('down', r, 0);
  for (let i = 1; i <= steps; i++) {
    const a = (i / 36) * Math.PI * 2;
    s.pointer('move', Math.cos(a) * r, Math.sin(a) * r);
  }
  s.pointer('up', 0, 0);
}

// Мазок зигзагом по прямоугольнику (центр cx,cz; размеры w,d).
export function zigzag(s, cx, cz, w, d, rows = 7) {
  s.pointer('down', cx - w / 2, cz - d / 2);
  for (let r = 0; r <= rows; r++) {
    const z = cz - d / 2 + (d * r) / rows;
    const xs = r % 2 ? [cx + w / 2, cx - w / 2] : [cx - w / 2, cx + w / 2];
    for (let k = 0; k <= 10; k++) s.pointer('move', xs[0] + ((xs[1] - xs[0]) * k) / 10, z);
  }
  s.pointer('up', 0, 0);
}

// Посолить и поперчить до перемешивания (у миски): норма блюда + смещение, затем «посолено — мешать».
export function seasonTo(s, dishId, { salt = 0, pepper = 0 } = {}) {
  const se = s.dishes[dishId].season;
  arrive(s, 'bowl');
  for (let i = se.salt; i < se.target.salt + salt; i++) {
    if (!s.seasonAdd(dishId, 'salt')) throw new Error('соль: ' + s.hint?.text);
    waitAction(s);
  }
  for (let i = se.pepper; i < se.target.pepper + pepper; i++) {
    s.seasonAdd(dishId, 'pepper');
    waitAction(s);
  }
  if (!s.seasonDone(dishId)) throw new Error('посолено: ' + s.hint?.text);
}

// После перемешивания: попробовать и подтвердить вкус.
export function tasteDone(s, dishId, { taste = true } = {}) {
  if (taste) {
    if (!s.seasonTaste(dishId)) throw new Error('проба: ' + s.hint?.text);
    waitAction(s);
  }
  if (!s.seasonDone(dishId)) throw new Error('вкус: ' + s.hint?.text);
}

// Посолить, перемешать, попробовать — весь путь вкуса у миски.
export function seasonMixTaste(s, dishId, opts = {}) {
  seasonTo(s, dishId, opts);
  stir(s);
  tasteDone(s, dishId, opts);
}

// Чистка текущего продукта на доске: зигзаг ножом по всем копиям.
export function peel(s) {
  const it = s.boardCur();
  if (!it?.peel) throw new Error('на доске нечего чистить');
  const b = bounds(it.pieces);
  for (let pass = 0; pass < 3 && s.board.items[it.key]; pass++) {
    const rows = 14;
    s.pointer('down', (b.minX - 0.2) * BOARD_UNIT, b.minZ * BOARD_UNIT);
    for (let r = 0; r <= rows && s.board.items[it.key]; r++) {
      const z = (b.minZ + ((b.maxZ - b.minZ) * r) / rows + pass * 0.15) * BOARD_UNIT;
      const xs = r % 2 ? [b.maxX + 0.2, b.minX - 0.2] : [b.minX - 0.2, b.maxX + 0.2];
      for (let k = 0; k <= 12; k++) s.pointer('move', (xs[0] + ((xs[1] - xs[0]) * k) / 12) * BOARD_UNIT, z);
    }
    s.pointer('up', 0, 0);
  }
  if (s.board.items[it.key]) throw new Error(`не дочищено: ${Math.round(it.peel.coverage() * 100)} %`);
}

export { KitchenSession };
