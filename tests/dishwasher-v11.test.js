// 0.11, F1: посудомойка. Владелец: «если ты поставил посуду туда (нож + миску + поднос) у тебя не снимаются баллы
// за грязноту, а на следующий день ты тоже можешь поставить в посудомойку приборы, но ты уже будешь вынужден ждать 10 минут».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, run, cutCubes } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { DISHWASHER, CLAYOUT } from '../src/campaign/layout.js';
import { WASHABLE, doorProgress, doorVerdict, inCavity } from '../src/campaign/st-dishwasher.js';

const T = CAMPAIGN.dishwasher.door.travel;
const D = CAMPAIGN.dishwasher.door;
const CYCLE = (CAMPAIGN.dishwasher.cycleMin * 60) / CAMPAIGN.kitchenScale; // 40 с игры
const G = DISHWASHER;

// день 3 по умолчанию: посуда в начале чистая (в дне 2 по сценарию грязная миска «со вчера»)
const fresh = (opts = {}) => {
  const s = new KitchenSession({ dayIndex: 2, seed: 7, ...opts });
  s.triggers = [];
  return s;
};
const atWasher = (s) => {
  arrive(s, 'dishwasher');
  return s;
};
// Потянуть ручку: нажать в handle, провести на dz по z, отпустить.
function pull(s, dz, z0 = G.handle.z) {
  s.pointer('down', 0, z0);
  const steps = 6;
  for (let k = 1; k <= steps; k++) s.pointer('move', 0, z0 + (dz * k) / steps);
  s.pointer('up', 0, z0 + dz);
}
const openDoor = (s) => pull(s, T);
const closeDoor = (s) => pull(s, -T, 0.6);
const dirty = (s, ...items) => items.forEach((i) => (s.equipment[i].clean = false));
// Загрузить предметы жестом: открыть, выбрать фишку, отпустить в проёме.
function load(s, ...items) {
  if (s.dishwasher.door !== 'open') openDoor(s);
  for (const item of items) {
    assert.ok(s.dwPick(item), `выбрать ${item}: ${s.hint?.text}`);
    assert.ok(s.dwDrop(item, 0, 0), `положить ${item}: ${s.hint?.text}`);
  }
}
function finishDishes(s) {
  for (const d of Object.values(s.dishes)) s._finishDish(d.id, { prep: 80, comp: 80, asm: 80 }, []);
  return s.finishDay();
}

// ---------- станция ----------

test('до посудомойки можно дойти: героиня встаёт у неё и открывает панель', () => {
  const s = atWasher(fresh());
  assert.equal(s.heroine.station, 'dishwasher');
  assert.equal(s.panel, 'dishwasher');
  assert.equal(s.stationAvailable('dishwasher'), true);
});

test('место посудомойки правее гирлянды и левее раковины, героиня стоит спиной к камере', () => {
  const st = CLAYOUT.stations;
  assert.ok(st.dishwasher.stand.x > st.garland.stand.x && st.dishwasher.stand.x < st.sink.stand.x);
  assert.equal(st.dishwasher.stand.z, -1.6);
  assert.equal(st.dishwasher.facing, Math.PI);
});

test('в практике посудомойки нет', () => {
  const s = new KitchenSession({ practice: { activity: 'cubes' } });
  assert.equal(s.stationAvailable('dishwasher'), false);
});

// ---------- нож ----------

test('нож чистый, пока ничего не резала, и пачкается от первого же разреза', () => {
  const s = fresh({ dayIndex: 0 });
  assert.equal(s.equipment.knife.clean, true);
  assert.deepEqual(s.dirtyItems(), []);
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:carrot'));
  assert.equal(s.equipment.knife.clean, true, 'выбрать продукт — ещё не резать');
  cutCubes(s);
  assert.equal(s.equipment.knife.clean, false);
  assert.deepEqual(s.dirtyItems().map((x) => x.id), ['knife']);
});

test('грязный нож ничего не блокирует: резать и перекладывать в миску можно как раньше', () => {
  const s = fresh({ dayIndex: 0 });
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:carrot'));
  cutCubes(s);
  assert.equal(s.equipment.knife.clean, false);
  assert.equal(s.transferBlock(), null);
  assert.ok(s.boardTransfer(), s.hint?.text);
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:pickle'), s.hint?.text);
});

test('нож пачкается один раз за разрез: событие «dirty» приходит один раз', () => {
  const s = fresh({ dayIndex: 0 });
  arrive(s, 'board');
  s.boardSelect('olivier:carrot');
  s.drain();
  cutCubes(s);
  const events = s.drain().filter((e) => e.type === 'dirty' && e.item === 'knife');
  assert.equal(events.length, 1);
});

test('в практике нож не пачкается', () => {
  const s = new KitchenSession({ practice: { activity: 'cubes', product: 'carrot' } });
  s._emit('cut', {});
  assert.equal(s.equipment.knife.clean, true);
});

test('ножом по яйцу на подносе тоже пачкается', () => {
  const s = fresh({ dayIndex: 2 });
  assert.equal(s.equipment.knife.clean, true);
  s._emit('eggSplit', {});
  assert.equal(s.equipment.knife.clean, false);
});

test('нож моется в раковине узкой полоской: край засчитан, край + 10 % — нет', () => {
  const s = fresh();
  dirty(s, 'knife');
  arrive(s, 'sink');
  assert.ok(s.sinkSelect('knife'));
  const w = s.cfg.wash;
  s.pointer('down', w.knifeW / 2 - 0.02, 0);
  s.pointer('move', w.knifeW / 2, 0);
  const edge = s.sinkJob.scrub.progress;
  assert.ok(edge > 0, 'ровно на границе мазок засчитан');
  s.pointer('move', (w.knifeW / 2) * 1.1, 0);
  assert.equal(s.sinkJob.scrub.progress, edge, 'на 10 % за границей — нет');
  s.pointer('up', 0, 0);
  s.pointer('down', 0, w.knifeD / 2 * 1.1);
  s.pointer('move', 0.05, w.knifeD / 2 * 1.1);
  assert.equal(s.sinkJob.scrub.progress, edge, 'мимо полоски по глубине — нет');
});

test('нож отмывается губкой до конца', () => {
  const s = fresh();
  dirty(s, 'knife');
  arrive(s, 'sink');
  assert.ok(s.sinkSelect('knife'));
  s.pointer('down', -0.1, 0);
  for (let i = 0; i < 24 && s.sinkJob; i++) s.pointer('move', i % 2 ? -0.1 : 0.1, 0);
  s.pointer('up', 0, 0);
  assert.equal(s.equipment.knife.clean, true);
});

// ---------- дверца: жест ----------

test('дверца: ход ручки считается от места нажатия, вниз открывает, вверх закрывает', () => {
  assert.ok(Math.abs(doorProgress('closed', -0.19, -0.19 + T / 2, T) - 0.5) < 1e-9);
  assert.equal(doorProgress('closed', -0.19, -0.5, T), 0, 'вверх при закрытой — никуда');
  assert.equal(doorProgress('closed', -0.19, 5, T), 1);
  assert.ok(Math.abs(doorProgress('open', 0.6, 0.6 - T / 2, T) - 0.5) < 1e-9);
  assert.equal(doorProgress('open', 0.6, 0.6 - T, T), 0);
  assert.equal(doorProgress('open', 0.6, 0.9, T), 1, 'вниз при открытой — никуда');
});

test('потянула ручку вниз до конца хода — дверца открылась сама, не дожидаясь отпускания', () => {
  const s = atWasher(fresh());
  s.pointer('down', 0, G.handle.z);
  assert.equal(s.dishwasher.door, 'closed');
  s.pointer('move', 0, G.handle.z + T);
  assert.equal(s.dishwasher.door, 'open');
  s.pointer('up', 0, G.handle.z + T);
  assert.equal(s.dishwasher.door, 'open');
});

test('открыла ровно на границе 70 % хода — открыта; на 10 % короче — нет, с подсказкой', () => {
  const s = atWasher(fresh());
  pull(s, T * D.open);
  assert.equal(s.dishwasher.door, 'open', 'ровно 70 %');
  closeDoor(s);
  assert.equal(s.dishwasher.door, 'closed');
  s.drain();
  s.clock += 5; // подсказка не чаще раза в 1,2 с
  pull(s, T * D.open * 0.9);
  assert.equal(s.dishwasher.door, 'closed', '63 % — не дотянула');
  assert.match(s.hint.text, /ниже/);
  assert.ok(s.hint.text.length <= 70);
  assert.ok(s.drain().some((e) => e.type === 'dwDeny'));
});

test('закрыла ровно на границе 10 % хода — закрыта; на 10 % выше — дверца остаётся открытой', () => {
  const s = atWasher(fresh());
  openDoor(s);
  pull(s, -T * (1 - D.closed), 0.6);
  assert.equal(s.dishwasher.door, 'closed', 'осталось ровно 10 %');
  openDoor(s);
  s.clock += 5;
  pull(s, -T * (1 - D.closed) * 0.9, 0.6);
  assert.equal(s.dishwasher.door, 'open', 'не доведена до 10 % — возвращается');
  assert.match(s.hint.text, /выше/);
});

test('нажать мимо ручки (над планкой с кнопкой или у края) — дверца не двигается', () => {
  const s = atWasher(fresh());
  s.pointer('down', G.grab.x * 1.1, G.handle.z);
  s.pointer('move', G.grab.x * 1.1, G.handle.z + T);
  s.pointer('up', 0, 0);
  assert.equal(s.dishwasher.door, 'closed');
  s.pointer('down', -0.1, G.grab.z0 * 1.2); // планка, не кнопка
  s.pointer('move', -0.1, G.grab.z0 * 1.2 + T);
  s.pointer('up', 0, 0);
  assert.equal(s.dishwasher.door, 'closed');
});

test('отошла от посудомойки — дверца закрылась, фишка из рук убрана', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  openDoor(s);
  assert.ok(s.dwPick('bowl'));
  s.closePanel();
  run(s, 0.2);
  assert.equal(s.dishwasher.door, 'closed');
  assert.equal(s.dishwasher.hand, null);
});

// ---------- загрузка ----------

test('миска в машине: её нельзя взять в работу, фраза с оставшимися минутами', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  load(s, 'bowl');
  assert.deepEqual(s.dishwasher.loaded, ['bowl']);
  assert.match(s._bowlBlock('crab'), /Миска в посудомойке — достань из неё/);
  openDoor(s); // уже открыта — не мешает
  closeDoor(s);
  assert.ok(s.dwStart(), s.hint?.text);
  assert.equal(s._bowlBlock('crab'), 'Миска в посудомойке — ещё 10 мин');
  run(s, 16); // 16 с игры = 4 кухонные минуты
  assert.equal(s._bowlBlock('crab'), 'Миска в посудомойке — ещё 6 мин');
  assert.ok(s._bowlBlock('crab').length <= 70);
  assert.equal(s.equipBlock('bowl'), s._bowlBlock('crab'));
});

test('пока цикл идёт, в миску ничего не добавить, а когда кончился — миска чистая и доступна', () => {
  const s = atWasher(fresh({ dayIndex: 1 }));
  load(s, 'bowl');
  closeDoor(s);
  assert.ok(s.dwStart());
  assert.ok(Math.abs(s.dwLeft() - CYCLE) < 1e-6, `${s.dwLeft()}`);
  arrive(s, 'bowl');
  assert.equal(s.bowlAdd('crab', 'mayo'), false);
  assert.match(s.hint.text, /Миска в посудомойке — ещё 10 мин/);
  run(s, CYCLE + 0.2);
  assert.equal(s.equipment.bowl.clean, true);
  assert.deepEqual(s.dishwasher.loaded, []);
  assert.equal(s.dishwasher.run, null);
  assert.equal(s._bowlBlock('crab'), null);
  assert.ok(s.bowlAdd('crab', 'mayo'), s.hint?.text);
  assert.ok(s.drain().some((e) => e.type === 'dwDone' && e.items.includes('bowl')));
});

test('цикл ровно cycleMin кухонных минут: за секунду до конца ещё идёт, потом готово', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  load(s, 'bowl');
  closeDoor(s);
  s.dwStart();
  run(s, CYCLE - 1);
  assert.equal(s.equipment.bowl.clean, false);
  assert.ok(s.dwLeft() > 0.5);
  run(s, 1.2);
  assert.equal(s.equipment.bowl.clean, true);
});

test('цикл не зависит от того, где героиня: ушла от машины — посуда всё равно отмоется', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl', 'knife');
  load(s, 'bowl', 'knife');
  closeDoor(s);
  s.dwStart();
  arrive(s, 'sink');
  run(s, CYCLE + 0.2);
  assert.equal(s.equipment.bowl.clean, true);
  assert.equal(s.equipment.knife.clean, true);
});

test('загрузка в разные места: пять предметов — пять мест, каждый на своём', () => {
  const s = atWasher(fresh());
  dirty(s, ...WASHABLE);
  load(s, ...WASHABLE);
  assert.deepEqual(s.dishwasher.loaded.slice().sort(), WASHABLE.slice().sort());
  const spots = WASHABLE.map((i) => `${G.slots[i].x}:${G.slots[i].z}`);
  assert.equal(new Set(spots).size, WASHABLE.length, 'места не совпадают');
  assert.deepEqual(s.dirtyItems(), [], 'в раковине мыть нечего');
});

test('загрузила миску и нож — поднос остаётся снаружи, его по-прежнему можно мыть', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl', 'knife', 'tray');
  load(s, 'bowl', 'knife');
  assert.deepEqual(s.dirtyItems().map((x) => x.id), ['tray']);
});

test('поднос и форма в машине: поднос не выбрать для блюда, форма не нужна для курицы', () => {
  const s = new KitchenSession({ dayIndex: 2, seed: 3 });
  s.triggers = [];
  atWasher(s);
  dirty(s, 'tray');
  load(s, 'tray');
  assert.match(s.trayBlock('sandwiches'), /Поднос в посудомойке/);
  s.equipment.form.clean = false;
  load(s, 'form');
  assert.match(s.trayBlock('chicken'), /Форма для запекания в посудомойке/);
  assert.ok(s.trayBlock('chicken').length <= 70);
});

test('доска и нож в машине: резать нечем, с причиной', () => {
  const s = fresh({ dayIndex: 0 });
  atWasher(s);
  dirty(s, 'knife');
  load(s, 'knife');
  arrive(s, 'board');
  assert.equal(s.boardSelect('olivier:carrot'), false);
  assert.match(s.hint.text, /Нож в посудомойке/);
  assert.match(s.boardTasks().find((t) => t.key === 'olivier:carrot').block, /Нож в посудомойке/);
});

test('доска с нарезанным продуктом в машину не встаёт: сначала доделать', () => {
  const s = fresh({ dayIndex: 0 });
  arrive(s, 'board');
  s.boardSelect('olivier:carrot');
  dirty(s, 'board');
  atWasher(s);
  openDoor(s);
  assert.ok(s.dwPick('board'));
  assert.equal(s.dwLoad(), false);
  assert.match(s.hint.text, /доска|доске|доделай/i);
  assert.ok(s.hint.text.length <= 70);
});

// ---------- отказы ----------

test('отказы: понятные фразы до 70 знаков, без слов «ошибка» и «неверно»', () => {
  const s = atWasher(fresh());
  const said = [];
  const refuse = (fn) => {
    s.clock += 2; // подсказка не чаще раза в 1,2 с
    const ok = fn();
    assert.equal(ok, false);
    said.push(s.hint.text);
  };
  dirty(s, 'bowl');
  refuse(() => s.dwLoad('bowl')); // дверца закрыта
  refuse(() => s.dwStart()); // пусто
  openDoor(s);
  refuse(() => s.dwLoad('tray')); // поднос чистый
  refuse(() => s.dwDrop('bowl', 0.9, 0.9)); // мимо проёма
  load(s, 'bowl');
  refuse(() => s.dwStart()); // дверца открыта
  closeDoor(s);
  s.dwStart();
  refuse(() => s.dwStart()); // уже идёт
  refuse(() => s.dwTake('bowl')); // идёт цикл
  s.clock += 2;
  s.pointer('down', 0, G.handle.z);
  said.push(s.hint.text); // дверца заперта
  s.pointer('up', 0, 0);
  for (const t of said) {
    assert.ok(t.length <= 70, `${t.length}: ${t}`);
    assert.ok(!/ошибк|неверно/i.test(t), t);
  }
  assert.equal(said.length, 8, said.join(' | '));
  assert.equal(new Set(said).size, 8, 'каждая причина говорит по-своему: ' + said.join(' | '));
});

test('дверца заперта, пока идёт цикл: потянуть ручку нельзя', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  load(s, 'bowl');
  closeDoor(s);
  s.dwStart();
  s.clock += 3;
  pull(s, T);
  assert.equal(s.dishwasher.door, 'closed');
  assert.match(s.hint.text, /Идёт цикл/);
});

test('фишка, отпущенная в проёме, ловится с запасом ×1,2; на 10 % дальше — возвращается', () => {
  const k = CAMPAIGN.dishwasher.drop;
  const c = G.cavity;
  assert.equal(inCavity(c.x * k, (c.z0 + c.z1) / 2, k), true, 'край запаса');
  assert.equal(inCavity(c.x * k * 1.1, (c.z0 + c.z1) / 2, k), false, 'край + 10 %');
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  openDoor(s);
  s.dwPick('bowl');
  assert.equal(s.dwDrop('bowl', c.x * k * 1.1, 0), false);
  assert.equal(s.dishwasher.hand, null, 'фишка вернулась в док');
  assert.equal(s.dishwasher.loaded.length, 0);
  s.dwPick('bowl');
  assert.equal(s.dwDrop('bowl', c.x * k, 0), true);
  assert.deepEqual(s.dishwasher.loaded, ['bowl']);
});

test('фишку можно выбрать кликом и положить следующим нажатием в проёме', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  openDoor(s);
  assert.ok(s.dwPick('bowl'));
  assert.equal(s.dishwasher.hand, 'bowl');
  assert.equal(s.pointer('down', 0, 0), 'load');
  s.pointer('up', 0, 0);
  assert.deepEqual(s.dishwasher.loaded, ['bowl']);
});

test('выбрать можно только грязное и не стоящее в машине; повторный выбор убирает из руки', () => {
  const s = atWasher(fresh());
  assert.equal(s.dwPick('bowl'), false, 'миска чистая');
  dirty(s, 'bowl');
  assert.ok(s.dwPick('bowl'));
  assert.ok(s.dwPick('bowl'));
  assert.equal(s.dishwasher.hand, null);
  assert.equal(s.dwPick('spoon'), false);
});

// ---------- достать, запустить ----------

test('открытую незапущенную посуду можно достать обратно: она остаётся грязной', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  load(s, 'bowl');
  assert.ok(s.dwTake('bowl'));
  assert.deepEqual(s.dishwasher.loaded, []);
  assert.equal(s.equipment.bowl.clean, false);
  assert.deepEqual(s.dirtyItems().map((x) => x.id), ['bowl']);
});

test('закрытую машину открыть и достать нельзя через команду: сначала дверца', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  load(s, 'bowl');
  closeDoor(s);
  assert.equal(s.dwTake('bowl'), false);
  assert.match(s.hint.text, /Дверца закрыта/);
});

test('кнопка пуска на дверце: нажатие запускает цикл, мимо кнопки — нет; на 20 % за краем — не нажата', () => {
  const s = atWasher(fresh());
  dirty(s, 'bowl');
  load(s, 'bowl');
  closeDoor(s);
  s.pointer('down', G.start.x + G.start.r * 1.3, G.start.z);
  s.pointer('up', 0, 0);
  assert.equal(s.dishwasher.run, null, 'на 30 % за краем кнопки');
  s.pointer('down', G.start.x + G.start.r * 1.2, G.start.z);
  s.pointer('up', 0, 0);
  assert.ok(s.dishwasher.run, 'ровно на границе ×1,2');
});

test('пуск без посуды или с открытой дверцей не запускает цикл', () => {
  const s = atWasher(fresh());
  assert.equal(s.dwStart(), false);
  assert.equal(s.dishwasher.run, null);
  dirty(s, 'bowl');
  load(s, 'bowl');
  s.clock += 3;
  assert.equal(s.dwStart(), false);
  assert.match(s.hint.text, /Закрой дверцу/);
});

// ---------- конец дня ----------

test('завершила день с загруженной посудой: штрафа за грязноту нет, даже если цикл не запущен', () => {
  const s = fresh({ dayIndex: 0 });
  dirty(s, 'bowl', 'tray', 'knife');
  atWasher(s);
  load(s, 'bowl', 'tray', 'knife');
  const r = finishDishes(s);
  assert.equal(r.order, 100);
  assert.ok(!r.orderNotes.some((n) => /Немытая/.test(n)), r.orderNotes.join('; '));
  assert.deepEqual(r.overnight.slice().sort(), ['Миска', 'Нож', 'Поднос'].sort());
});

test('завершила день с идущим циклом: тоже без штрафа', () => {
  const s = fresh({ dayIndex: 0 });
  dirty(s, 'bowl', 'knife');
  atWasher(s);
  load(s, 'bowl', 'knife');
  closeDoor(s);
  s.dwStart();
  const r = finishDishes(s);
  assert.equal(r.order, 100);
});

test('с грязным ножом снаружи штраф есть: dirtyLeft за предмет и нож в списке', () => {
  const s = fresh({ dayIndex: 0 });
  dirty(s, 'knife');
  const r = finishDishes(s);
  assert.equal(r.order, 100 - CAMPAIGN.scoring.order.dirtyLeft);
  assert.ok(r.orderNotes.some((n) => /Немытая посуда: нож/.test(n)), r.orderNotes.join('; '));
  assert.deepEqual(r.overnight, []);
});

test('штраф только за то, что осталось снаружи: миска в машине, нож и поднос на столе — минус два предмета', () => {
  const s = fresh({ dayIndex: 0 });
  dirty(s, 'bowl', 'knife', 'tray');
  atWasher(s);
  load(s, 'bowl');
  const r = finishDishes(s);
  assert.equal(r.order, 100 - 2 * CAMPAIGN.scoring.order.dirtyLeft);
  assert.match(r.orderNotes.join('; '), /поднос, нож/);
  assert.doesNotMatch(r.orderNotes.join('; '), /миска/);
});

test('достала из машины перед концом дня — снова штраф, пока не вымыла', () => {
  const s = fresh({ dayIndex: 0 });
  dirty(s, 'knife');
  atWasher(s);
  load(s, 'knife');
  assert.ok(s.dwTake('knife'));
  const r = finishDishes(s);
  assert.equal(r.order, 100 - CAMPAIGN.scoring.order.dirtyLeft);
});

test('наутро всё чистое: новая сессия начинается с чистой посудой (кроме заранее заданной грязной миски дня 2)', () => {
  const s = fresh({ dayIndex: 0 });
  dirty(s, 'bowl', 'knife', 'tray');
  atWasher(s);
  load(s, 'bowl', 'knife', 'tray');
  finishDishes(s);
  const next = new KitchenSession({ dayIndex: 2, seed: 4 });
  assert.deepEqual(next.dirtyItems(), []);
  assert.deepEqual(next.dishwasher.loaded, []);
  // день 2 по сценарию начинается с грязной миской «со вчера» — её можно вымыть руками или отдать машине
  const d2 = new KitchenSession({ dayIndex: 1, seed: 4 });
  assert.deepEqual(d2.dirtyItems().map((x) => x.id), ['bowl']);
});

test('день 2: грязную миску «со вчера» можно отдать машине, но придётся ждать цикл', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 5 });
  s.triggers = [];
  atWasher(s);
  load(s, 'bowl');
  closeDoor(s);
  assert.ok(s.dwStart());
  assert.match(s._bowlBlock('crab'), /ещё 10 мин/);
  run(s, CYCLE + 0.2);
  assert.equal(s._bowlBlock('crab'), null);
});

test('нож в посудомойке: на подносе им тоже не режут (яйца пополам), подсказка про машину', () => {
  const s = fresh({ dayIndex: 2 });
  const d = s.dishes.eggs;
  for (const id of ['boilEgg', 'peelEgg']) d.steps[id] = { done: true, q: 1, info: null };
  dirty(s, 'knife');
  atWasher(s);
  load(s, 'knife');
  arrive(s, 'tray');
  assert.ok(s.traySelect('eggs'), s.hint?.text);
  s.setTool('knife');
  const egg = d.work.eggs[0];
  const r = s.pointer('down', egg.x, egg.z);
  s.pointer('up', egg.x, egg.z);
  run(s, 1);
  assert.equal(r, 'blocked');
  assert.match(s.hint.text, /посудомойк/i);
  assert.equal(egg.split, false, 'яйцо не разрезано');
});
