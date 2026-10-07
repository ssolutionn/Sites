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

// Нарезка кубиками: полоски по 1, поворот, снова полоски. Клики по фактическому продукту.
export function cutCubes(s) {
  const it = s.boardCur();
  for (let pass = 0; pass < 2; pass++) {
    for (let guard = 0; guard < 40; guard++) {
      const b = bounds(it.pieces);
      // самая левая полоса шире 1 — режем на расстоянии 1 от её левого края
      const wide = it.pieces.filter((p) => p.w > 1.25).sort((a, c) => a.x - c.x)[0];
      if (!wide) break;
      let x = wide.x + 1;
      const z = (wide.z + wide.d / 2);
      // клик должен попасть в продукт: ищем z внутри контура
      const r = s.pointer('down', x * BOARD_UNIT, z * BOARD_UNIT);
      s.pointer('up', x * BOARD_UNIT, z * BOARD_UNIT);
      if (r !== 'cut') {
        // обрезок у края: сдвиг
        x = wide.x + wide.w / 2;
        const r2 = s.pointer('down', x * BOARD_UNIT, z * BOARD_UNIT);
        s.pointer('up', 0, 0);
        if (r2 !== 'cut') break;
      }
      waitAction(s);
    }
    s.rotate();
  }
}

export function cutRounds(s, thickness = 0.5) {
  const it = s.boardCur();
  const L = it.log.length / 2;
  for (let x = -L + 0.3; x < L - 0.2; x += thickness) {
    s.pointer('down', x * BOARD_UNIT, 0);
    s.pointer('up', 0, 0);
    waitAction(s);
  }
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

// Посолить и поперчить ровно в норму блюда, попробовать и подтвердить (у миски).
export function seasonTo(s, dishId, { salt = 0, pepper = 0, taste = true } = {}) {
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
  if (taste) {
    s.seasonTaste(dishId);
    waitAction(s);
  }
  if (!s.seasonDone(dishId)) throw new Error('вкус: ' + s.hint?.text);
}

export { KitchenSession };
