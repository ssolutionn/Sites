// 0.9: плита как настоящая — 4 конфорки и 4 крутилки, продукты сначала из холодильника, огонь не гаснет при постановке,
// убежала пена — конфорку залило (вытереть тряпкой), «готово» на огне — переваривается.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, waitAction, run, take, startBoil } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { STOVE } from '../src/campaign/layout.js';

const day1 = () => new KitchenSession({ dayIndex: 0, seed: 1 });

test('четыре конфорки и у каждой своя крутилка', () => {
  const s = day1();
  assert.equal(s.burners.length, 4);
  assert.equal(STOVE.burners.length, 4);
  arrive(s, 'stove');
  for (let i = 0; i < 4; i++) assert.ok(s.setHeat(i, i + 2));
  assert.deepEqual(s.burners.map((b) => b.heat), [2, 3, 4, 5]);
});

test('без продукта в руках кастрюлю не поставить — сначала достать из холодильника', () => {
  const s = day1();
  arrive(s, 'stove');
  assert.equal(s.placePot(), false);
  assert.match(s.hint.text, /достань/);
  take(s, 'olivier:boilEgg');
  assert.equal(s.carry.product, 'egg');
  arrive(s, 'stove');
  assert.ok(s.placePot(2));
  waitAction(s);
  assert.equal(s.burners[2].product, 'egg');
  assert.equal(s.carry, null, 'яйца из рук — в кастрюлю');
});

test('руки одни: пока держишь яйца, картофель не достать', () => {
  const s = day1();
  take(s, 'olivier:boilEgg');
  arrive(s, 'fridge');
  assert.equal(s.fridgeTake('olivier', 'peelPotato'), false);
  assert.match(s.hint.text, /Руки заняты/);
});

test('картофель для оливье: из кладовой → почистить сырым на доске → снова в руках → в кастрюлю', () => {
  const s = day1();
  arrive(s, 'board');
  assert.equal(s.boardSelect('olivier:peelPotato'), false, 'без картофеля в руках чистить нечего');
  assert.match(s.hint.text, /кладовой/);
  arrive(s, 'stove');
  take(s, 'olivier:peelPotato');
  assert.equal(s.carry.boilStep, 'boil');
  arrive(s, 'stove');
  assert.equal(s.placePot(), false, 'нечищеный в кастрюлю не кладём');
  const b = startBoil(s, 'olivier:boil');
  assert.ok(s.stepDone('olivier', 'peelPotato'));
  assert.equal(b.product, 'potato');
});

test('включила огонь заранее, поставила кастрюлю — огонь не погас (крутилка остаётся как стоит)', () => {
  const s = day1();
  arrive(s, 'stove');
  assert.ok(s.setHeat(1, 7));
  take(s, 'olivier:boilEgg');
  arrive(s, 'stove');
  assert.ok(s.placePot(1, null, null)); // так ставит игрок из панели плиты
  waitAction(s);
  assert.equal(s.burners[1].heat, 7);
  assert.equal(s.burners[1].water !== 'cold' || s.burners[1].temp >= 20, true);
});

test('убежала пена — конфорку залило: на ней не варят, пока не вытрешь тряпкой; в конце дня — минус за беспорядок', () => {
  const s = day1();
  const b = startBoil(s, 'olivier:boilEgg', { burner: 0, heat: 9 });
  arrive(s, 'stove');
  s._startOverflow(0);
  run(s, 20);
  assert.ok(s.burners[0].dirty, 'конфорка залита');
  assert.equal(s.puddles.length, 1, 'и лужа на полу');
  run(s, Math.max(0, s.burners[0].readyAt - s.t + 0.5));
  arrive(s, 'stove');
  assert.ok(s.takePot(0));
  waitAction(s);
  assert.ok(s.burners[0].dirty, 'сняла кастрюлю — залитая осталась');
  assert.ok(s.orderScore().notes.some((n) => /Плита залита/.test(n)));
  take(s, 'olivier:peelPotato');
  arrive(s, 'board');
  s.boardSelect('olivier:peelPotato');
  // почистить и попробовать поставить именно на залитую
  const it = s.boardCur();
  for (const q of it.peel.zones) {
    s.pointer('down', q.x - q.rx, q.z);
    for (let k = 0; k <= 20; k++) s.pointer('move', q.x - q.rx + (2 * q.rx * k) / 20, q.z + Math.sin(k) * q.rz * 0.8);
    s.pointer('up', 0, 0);
  }
  while (s.board.items['olivier:peelPotato']) {
    const z = s.board.items['olivier:peelPotato'];
    for (const q of z.peel.zones) for (let r = -3; r <= 3; r++) {
      s.pointer('down', q.x - q.rx * 1.2, q.z + (r * q.rz) / 3.5);
      s.pointer('move', q.x + q.rx * 1.2, q.z + (r * q.rz) / 3.5);
      s.pointer('up', 0, 0);
    }
  }
  arrive(s, 'stove');
  assert.equal(s.placePot(0), false);
  assert.match(s.hint.text, /вытри/);
  // трём тряпкой туда-обратно по пятну
  const p = STOVE.burners[0];
  s.pointer('down', p.x - 0.05, p.z);
  for (let k = 0; k < 40 && s.burners[0].dirty; k++) s.pointer('move', p.x + (k % 2 ? 0.05 : -0.05), p.z + (k % 3) * 0.01);
  s.pointer('up', 0, 0);
  assert.equal(s.burners[0].dirty, false, 'вытерла');
  assert.ok(s.placePot(0));
});

test('сварилось, а огонь не выключен и кастрюлю не сняли — переварено: минус к подготовке и честная заметка', () => {
  const s = day1();
  startBoil(s, 'olivier:boilEgg', { burner: 0, heat: 6 });
  run(s, Math.max(0, s.burners[0].readyAt - s.t + 0.5));
  assert.equal(s.burners[0].state, 'ready');
  run(s, CAMPAIGN.stove.overcook.egg + 1);
  assert.ok(s.burners[0].overcooked);
  assert.equal(s.dishes.olivier.penalty.overcook, 'egg');
  assert.ok(s.dishes.olivier.penalty.prep >= CAMPAIGN.stove.overcookPenalty);
});

test('сварилось и огонь выключен — не переваривается, можно не спешить', () => {
  const s = day1();
  startBoil(s, 'olivier:boilEgg', { burner: 0, heat: 6 });
  run(s, Math.max(0, s.burners[0].readyAt - s.t + 0.5));
  arrive(s, 'stove');
  assert.ok(s.setHeat(0, 0));
  run(s, CAMPAIGN.stove.overcook.egg * 3);
  assert.equal(!!s.burners[0].overcooked, false);
});
