import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../src/config.js';
import { Game } from '../src/game/game.js';
import { cutPiece, rotatePieces, totalVolume, accuracy, makePiece, initialPieces } from '../src/game/cutting.js';
import { computeScore, resultTitle } from '../src/game/scoring.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// Прогон симуляции кадрами по 1/60 с.
function run(game, seconds, fps = 60) {
  const n = Math.round(seconds * fps);
  for (let i = 0; i < n; i++) game.update(1 / fps);
}

function startRound(game) {
  game.goTo('stove');
  run(game, 3);
  assert.equal(game.panel, 'stove');
  assert.ok(game.placePot());
  game.drain();
}

function arrive(game, station) {
  game.goTo(station);
  run(game, 3);
  assert.equal(game.panel, station);
}

// Нарезать текущий продукт на доске идеальными кубиками.
function cutPerfect(game) {
  const ing = game.board;
  for (let guard = 0; guard < 400; guard++) {
    const big = ing.pieces.find((p) => p.w > 1.0001 || p.d > 1.0001);
    if (!big) return;
    if (big.w <= 1.0001) {
      assert.ok(game.rotate());
      continue;
    }
    if (ing.selectedId !== big.id) game.boardClick(big.x + 0.5, big.z + big.d / 2);
    assert.equal(game.boardClick(big.x + 1, big.z + big.d / 2), 'cut');
    run(game, 0.35);
  }
  assert.fail('нарезка не завершилась');
}

test('разрез на трети ширины даёт части 1:2 и сохраняет объём', () => {
  let id = 1;
  const pieces = initialPieces(3, 2, () => id++);
  const p = pieces[0];
  const res = cutPiece(pieces, p.id, p.x + 1, { minWidth: 0.2, maxPieces: 150, nextId: () => id++ });
  assert.ok(res.ok);
  close(res.right.w / res.left.w, 2);
  close(totalVolume(res.pieces), 6);
});

test('слишком близкий к краю разрез отклоняется без нулевых частей', () => {
  let id = 1;
  const pieces = initialPieces(3, 2, () => id++);
  const p = pieces[0];
  const res = cutPiece(pieces, p.id, p.x + 0.1, { minWidth: 0.2, maxPieces: 150, nextId: () => id++ });
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'too-close');
  const out = cutPiece(pieces, p.id, p.x - 1, { minWidth: 0.2, maxPieces: 150, nextId: () => id++ });
  assert.equal(out.reason, 'outside');
});

test('лимит кусочков запрещает разрез', () => {
  let id = 1;
  const pieces = initialPieces(3, 2, () => id++);
  const res = cutPiece(pieces, pieces[0].id, 0, { minWidth: 0.2, maxPieces: 1, nextId: () => id++ });
  assert.equal(res.reason, 'limit');
});

test('поворот меняет оси и сохраняет объём', () => {
  const r = rotatePieces([makePiece(1, -2, -1, 4, 2)]);
  close(r[0].w, 2);
  close(r[0].d, 4);
  close(totalVolume(r), 8);
});

test('аккуратность по объёму: идеальные, крупные, мелкие', () => {
  const tol = CONFIG.tolerance;
  close(accuracy([makePiece(1, 0, 0, 1, 1), makePiece(2, 0, 0, 1.2, 0.8)], tol), 1);
  // Крупный 2×1: одна сторона вне допуска — неаккуратный.
  close(accuracy([makePiece(1, 0, 0, 1, 1), makePiece(2, 0, 0, 2, 1)], tol), 1 / 3);
  // Мелкий 0.5×1 — неаккуратный.
  close(accuracy([makePiece(1, 0, 0, 1, 1), makePiece(2, 0, 0, 0.5, 1)], tol), 1 / 1.5);
  assert.equal(accuracy([], tol), 0);
});

test('оценка: проверочные примеры 100 и 84', () => {
  assert.equal(computeScore({ C: 100, A: 100, M: 100, E: 0 }, CONFIG.scoring), 100);
  assert.equal(computeScore({ C: 100, A: 80, M: 100, E: 2 }, CONFIG.scoring), 84);
  assert.equal(computeScore({ C: 0, A: 0, M: 0, E: 5 }, CONFIG.scoring), 0);
  assert.equal(resultTitle(true, 84, CONFIG.scoring), 'Гости съедят');
  assert.equal(resultTitle(true, 85, CONFIG.scoring), 'Оливье мечты');
  assert.equal(resultTitle(true, 59, CONFIG.scoring), 'Оливье с приключениями');
  assert.equal(resultTitle(false, 100, CONFIG.scoring), 'Заказываем пиццу');
});

test('время идёт только после установки кастрюли; до этого нет помех', () => {
  const g = new Game({ seed: 1 });
  run(g, 60);
  assert.equal(g.t, 0);
  assert.equal(g.alerts.length, 0);
  assert.equal(g.goTo('board'), false);
  startRound(g);
  assert.equal(g.phase, 'running');
});

test('картофель: в 269 с недоступен, при пересечении 270 готов, остаётся 30 с — даже при пропуске кадров', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  g.devJumpTo(268.9);
  run(g, 0.1);
  assert.equal(g.potato, 'boiling');
  close(g.t, 269, 1e-6);
  g.devJumpTo(269.97);
  g.update(0.5); // большой кадр перескакивает отметку (ограничен maxFrameDt)
  assert.equal(g.potato, 'ready');
  const ready = g.drain().filter((e) => e.type === 'potatoReady');
  assert.equal(ready.length, 1);
  run(g, 1);
  assert.equal(g.drain().filter((e) => e.type === 'potatoReady').length, 0);
  close(g.remaining, 300 - 269.97 - CONFIG.maxFrameDt - 1, 0.02);
});

test('расписание: после 255 с новых помех нет, 300 с — поражение и блокировка действий', () => {
  const g = new Game({ seed: 7 });
  startRound(g);
  const starts = [];
  for (let i = 0; i < 300 * 60 + 10; i++) {
    g.update(1 / 60);
    for (const e of g.drain()) if (['catStart', 'potBoil', 'phoneNotify', 'garlandOff'].includes(e.type)) starts.push(g.t);
  }
  assert.ok(starts.length > 4);
  assert.ok(starts.every((t) => t <= CONFIG.noNewEventsAfter + 1e-6), String(starts));
  assert.equal(g.phase, 'fail');
  assert.equal(g.t, 300);
  assert.equal(g.goTo('bowl'), false);
  assert.equal(g.transfer(), false);
  const r = g.getResult();
  assert.equal(r.success, false);
  assert.equal(r.title, 'Заказываем пиццу');
});

test('выбор, разрез и анимация ножа разделены; клик вне продукта ничего не режет', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  arrive(g, 'board');
  const ing = g.board;
  const vol = totalVolume(ing.pieces);
  assert.equal(g.boardClick(50, 50), 'miss');
  const p = ing.pieces[0];
  assert.equal(g.boardClick(p.x + p.w / 3, 0), 'cut');
  assert.equal(g.boardClick(p.x + p.w / 2, 0), 'ignored'); // нож ещё в движении
  run(g, 0.4);
  assert.equal(ing.pieces.length, 2);
  close(totalVolume(ing.pieces), vol);
  // Клик по невыбранной части — только выбор.
  const other = ing.pieces.find((q) => q.id !== ing.selectedId);
  assert.equal(g.boardClick(other.x + other.w / 2, 0), 'select');
  assert.equal(ing.pieces.length, 2);
});

test('смена продукта и станции сохраняет части; перенос один раз', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  arrive(g, 'board');
  const carrot = g.board;
  const p = carrot.pieces[0];
  g.boardClick(p.x + 1, 0);
  run(g, 0.4);
  assert.ok(g.selectIngredient('cucumber'));
  assert.ok(g.selectIngredient('carrot'));
  assert.equal(carrot.pieces.length, 2);
  // Смена станции во время ножа отменяет разрез и сохраняет продукт.
  const q = carrot.pieces.find((x) => x.id === carrot.selectedId);
  g.boardClick(q.x + 1, q.z + 0.5);
  g.goTo('bowl');
  run(g, 3);
  assert.equal(carrot.pieces.length, 2);
  arrive(g, 'board');
  const vol = totalVolume(carrot.pieces);
  assert.ok(g.transfer());
  assert.equal(g.transfer(), false); // на доске уже огурец без разрезов, морковь повторно не уходит
  const inBowl = g.bowl.pieces.filter((x) => x.ing === 'carrot');
  close(totalVolume(inBowl), vol);
  assert.equal(carrot.pieces.length, 0);
});

test('перенос требует разреза; картофель — только последним', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  arrive(g, 'board');
  assert.equal(g.transfer(), false);
  assert.match(g.hint.text, /разрез/);
});

test('кот: кража с доски сохраняет остальные части, замена возвращает объём; один исход', () => {
  const g = new Game({ seed: 3 });
  startRound(g);
  arrive(g, 'board');
  g.selectIngredient('sausage');
  const s = g.board;
  const p = s.pieces[0];
  g.boardClick(p.x + 1, 0);
  run(g, 0.4);
  const before = s.pieces.map((x) => x.w * x.d).sort();
  g.devCat();
  run(g, CONFIG.events.cat.window + 0.2);
  assert.equal(g.stats.thefts, 1);
  assert.equal(s.pieces.length, 1);
  close(s.pieces[0].w * s.pieces[0].d, Math.min(...before));
  assert.equal(g.shoo(), false); // у события уже есть исход
  assert.equal(g.stats.thefts, 1);
  assert.match(g.transferBlockReason(), /замен/);
  assert.ok(g.takeReplacement());
  run(g, CONFIG.durations.replacement + 0.1);
  close(totalVolume(s.pieces), s.fullVolume);
  assert.match(g.transferBlockReason(), /дорезать/);
  cutPerfect(g);
  assert.equal(g.transferBlockReason(), null);
  assert.ok(g.transfer());
});

test('кот: прогнать — одно начисление, без кражи', () => {
  const g = new Game({ seed: 3 });
  startRound(g);
  g.devCat();
  assert.ok(g.shoo());
  assert.equal(g.shoo(), false);
  run(g, 10);
  assert.equal(g.stats.shoos, 1);
  assert.equal(g.stats.thefts, 0);
});

test('кастрюля: пропуск даёт одну ошибку и не задерживает картофель; гирлянда ремонтируется', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  g.devJumpTo(99);
  run(g, 10);
  assert.equal(g.stats.spills, 1);
  g.devJumpTo(130);
  run(g, 6);
  assert.ok(g.garland.broken);
  arrive(g, 'garland');
  assert.ok(g.setHold('garland', true));
  run(g, 1);
  g.setHold('garland', false);
  assert.ok(!g.garland.repaired);
  g.setHold('garland', true);
  run(g, 1.1);
  assert.ok(g.garland.repaired);
  g.devJumpTo(200);
  run(g, 5.5);
  assert.ok(g.pot.active);
  arrive(g, 'stove');
  assert.ok(g.reduceHeat());
  run(g, 1.1);
  assert.equal(g.stats.potsSaved, 1);
  assert.equal(g.stats.spills, 1);
  g.devJumpTo(268);
  run(g, 2.1);
  assert.equal(g.potato, 'ready');
});

test('полное прохождение: финал за 30 секунд и успех при перемешивании', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  arrive(g, 'board');
  cutPerfect(g);
  assert.ok(g.transfer());
  g.devPrepare();
  g.devJumpTo(268);
  run(g, 2.1);
  arrive(g, 'stove');
  const t0 = g.t;
  assert.ok(g.takePotato());
  run(g, 4);
  assert.equal(g.panel, 'board');
  assert.equal(g.board.id, 'potato');
  cutPerfect(g);
  assert.ok(g.transfer());
  arrive(g, 'bowl');
  assert.ok(g.setHold('mix', true));
  run(g, 1.5);
  g.setHold('mix', false);
  run(g, 1);
  close(g.bowl.mixProgress, 1.5, 0.05);
  assert.ok(g.setHold('mix', true));
  run(g, 1.6);
  assert.equal(g.phase, 'success');
  assert.ok(g.t - t0 < 30, `финал занял ${g.t - t0}`);
  const r = g.getResult();
  assert.equal(r.success, true);
  assert.equal(r.C, 100);
  close(r.A, 100);
  assert.equal(r.S, 100);
  // После результата данные не меняются.
  run(g, 50);
  assert.equal(g.goTo('board'), false);
  assert.equal(g.getResult().S, 100);
});

test('без полного состава перемешивание недоступно; картофель не переносится раньше шести', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  arrive(g, 'bowl');
  assert.equal(g.setHold('mix', true), false);
  g.devJumpTo(268);
  run(g, 2.1);
  arrive(g, 'stove');
  g.takePotato();
  run(g, 4);
  cutPerfect(g);
  assert.equal(g.transfer(), false);
  assert.match(g.hint.text, /последним/);
});

test('новые попытки независимы: одинаковый сид — одинаковое расписание кота', () => {
  const times = [];
  for (let k = 0; k < 5; k++) {
    const g = new Game({ seed: 42 });
    startRound(g);
    const seen = [];
    for (let i = 0; i < 260 * 20; i++) {
      g.update(1 / 20);
      for (const e of g.drain()) if (e.type === 'catStart') seen.push(Math.round(g.t * 10) / 10);
    }
    times.push(seen.join(','));
  }
  assert.equal(new Set(times).size, 1);
});

test('конец времени во время перемешивания — поражение, прогресс не засчитывается', () => {
  const g = new Game({ seed: 1 });
  startRound(g);
  g.devPrepare();
  g.devJumpTo(268);
  run(g, 2.1);
  arrive(g, 'stove');
  g.takePotato();
  run(g, 4);
  cutPerfect(g);
  assert.ok(g.transfer());
  arrive(g, 'bowl');
  g.devJumpTo(CONFIG.roundDuration - 1);
  assert.ok(g.setHold('mix', true));
  run(g, 3);
  assert.equal(g.phase, 'fail');
  assert.equal(g.bowl.mixed, false);
  assert.equal(g.getResult().title, 'Заказываем пиццу');
});
