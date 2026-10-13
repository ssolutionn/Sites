// 0.11 C: конфорка не гаснет сама, вода выкипает, пригорание, переварка, кухонные минуты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, waitAction, run, startBoil } from './helpers-campaign.js';
import { CAMPAIGN, kitchenSec, KITCHEN_SCALE, stepProducts } from '../src/campaign/data.js';

function potOn(heat, key = 'olivier:boil') {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  startBoil(s, key, { burner: 0, heat });
  return s;
}
const alertKeys = (s) => s.alerts.map((a) => a.key);

test('кухонные минуты: секунда игры = 15 секунд кухни; яйца 10 мин, картофель 25, свёкла 45, курица 60, остывание 6', () => {
  assert.equal(KITCHEN_SCALE, 15);
  assert.equal(CAMPAIGN.boilTimes.egg * CAMPAIGN.kitchenScale, 10 * 60);
  assert.equal(CAMPAIGN.boilTimes.potato * CAMPAIGN.kitchenScale, 25 * 60);
  assert.equal(CAMPAIGN.boilTimes.beet * CAMPAIGN.kitchenScale, 45 * 60);
  assert.equal(CAMPAIGN.oven.bake * CAMPAIGN.kitchenScale, 60 * 60);
  assert.equal(CAMPAIGN.cool.time * CAMPAIGN.kitchenScale, 6 * 60);
  assert.equal(kitchenSec(15), 60);
});

test('на огне 6 вода закипает за 8–9 кухонных минут', () => {
  const s = potOn(6);
  let k = 0;
  while (s.burners[0].water !== 'boil' && k++ < 4000) s.update(0.05);
  const min = (k * 0.05 * CAMPAIGN.kitchenScale) / 60;
  assert.ok(min >= 7.5 && min <= 9.5, `${min.toFixed(1)} кухонных минут`);
});

test('снятая кастрюля: огонь остаётся, пустая включённая конфорка через idleWarn напоминает о себе', () => {
  const s = potOn(6, 'olivier:boilEgg');
  run(s, kitchenSec(8) + kitchenSec(10) + 2);
  arrive(s, 'stove');
  assert.ok(s.takePot(0));
  waitAction(s);
  assert.equal(s.burners[0].heat, 6, 'огонь прежний');
  assert.equal(alertKeys(s).includes('burner0'), false, 'сразу напоминания нет');
  run(s, CAMPAIGN.stove.idleWarn + 1);
  assert.ok(alertKeys(s).includes('burner0'), 'через idleWarn — уведомление «Конфорка горит впустую»');
  assert.equal(s.alerts.find((a) => a.key === 'burner0').urgent, false, 'это не срочное дело');
  assert.ok(s.setHeat(0, 0));
  assert.equal(alertKeys(s).includes('burner0'), false, 'выключила — напоминание ушло');
});

test('конец дня с горящей конфоркой — штраф burnerLeft и замечание', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  const clean = s.orderScore();
  arrive(s, 'stove');
  s.burners[1].heat = 4;
  const after = s.orderScore();
  assert.equal(clean.score - after.score, CAMPAIGN.scoring.order.burnerLeft);
  assert.ok(after.notes.some((n) => /включённой/.test(n)));
});

test('вода выкипает: огонь 6 — предупреждение, срочно, пригорело; продукт пропал, шаг снова «сварить», конфорка закопчена', () => {
  const s = potOn(6);
  let warnAt = null, urgentAt = null, burntAt = null;
  const stock0 = s.inventory.count('potato');
  for (let k = 0; k < 20000 && burntAt == null; k++) {
    s.update(0.05);
    const b = s.burners[0];
    if (warnAt == null && alertKeys(s).includes('dry0')) warnAt = s.t;
    if (urgentAt == null && s.alerts.find((a) => a.key === 'dry0')?.urgent) urgentAt = s.t;
    if (b.state === 'empty' && b.dirty) burntAt = s.t;
  }
  assert.ok(warnAt != null && urgentAt != null && burntAt != null, `warn ${warnAt} urgent ${urgentAt} burnt ${burntAt}`);
  assert.ok(warnAt < urgentAt && urgentAt < burntAt);
  // калибровка: полная кастрюля на огне 6 выкипает за dryMin кухонных минут кипения (плюс ~8 минут, пока закипает)
  const boilStart = s.stove?.startT ?? 0;
  const dry = kitchenSec(CAMPAIGN.stove.dryMin);
  assert.ok(burntAt - boilStart > dry && burntAt - boilStart < dry + kitchenSec(10), `${burntAt - boilStart}`);
  const qty = stepProducts('olivier', s.stepDef('olivier', 'boil'), undefined).potato;
  assert.equal(s.inventory.count('potato'), stock0 - qty, 'картофель не вернулся в запас');
  assert.equal(s.stepDone('olivier', 'boil'), false);
  assert.ok(s.dishes.olivier.penalty.burnt >= 1 && s.dishes.olivier.penalty.prep >= CAMPAIGN.stove.burnPrepPenalty);
  assert.ok(s.penalties.some((p) => p.kind === 'burnt'));
  assert.equal(alertKeys(s).some((k) => /^dry|^pot/.test(k)), false, 'уведомления о кастрюле сняты');
  assert.match(s.hint.text, /Пригорело/);
});

test('вода выкипает медленнее на тихом огне; огонь 2 не закипает — вода не уходит', () => {
  const level = (heat, sec) => {
    const s = potOn(heat);
    run(s, sec);
    return s.burners[0].level;
  };
  const sec = kitchenSec(8) + kitchenSec(5) + 20;
  assert.ok(level(4, sec) > level(6, sec), 'на 4 воды остаётся больше, чем на 6');
  assert.equal(level(2, 200), 1, 'на 2 вода не кипит и не убывает');
});

test('убавила огонь вовремя — пригорания нет', () => {
  const s = potOn(6);
  run(s, kitchenSec(8) + kitchenSec(25) + 2); // готово
  assert.equal(s.burners[0].state, 'ready');
  assert.ok(s.setHeat(0, 0));
  run(s, kitchenSec(60));
  assert.equal(s.stats.burnt ?? 0, 0);
  assert.equal(s.burners[0].state, 'ready');
});

test('яйца: передержала — серо-зелёный ободок (штраф 15), на 4 кухонные минуты позже готовности', () => {
  const s = potOn(6, 'olivier:boilEgg');
  const readyAfter = kitchenSec(8) + kitchenSec(10);
  run(s, readyAfter + 1);
  assert.equal(s.burners[0].state, 'ready');
  run(s, kitchenSec(4) - 3);
  assert.equal(s.burners[0].overcooked, false, 'ещё не переварены');
  run(s, 5);
  assert.equal(s.burners[0].overcooked, true);
  assert.equal(s.dishes.olivier.penalty.overcook, 'egg');
  assert.equal(s.dishes.olivier.penalty.prep, CAMPAIGN.stove.overcookPenaltyBy.egg);
});

test('переваренные яйца помечены на доске — на срезе будет серо-зелёный ободок', () => {
  const s = potOn(6, 'olivier:boilEgg');
  run(s, kitchenSec(8) + kitchenSec(10) + kitchenSec(4) + 2);
  assert.equal(s.burners[0].overcooked, true);
  arrive(s, 'stove');
  assert.ok(s.takePot(0));
  waitAction(s);
  run(s, CAMPAIGN.cool.time + 1);
  arrive(s, 'board');
  assert.ok(s.boardSelect('olivier:peelEgg'));
  assert.equal(s.boardCur().overcooked, true);
  // свежесваренные яйца — без ободка
  const t = potOn(6, 'olivier:boilEgg');
  run(t, kitchenSec(8) + kitchenSec(10) + 2);
  arrive(t, 'stove');
  assert.ok(t.takePot(0));
  waitAction(t);
  run(t, CAMPAIGN.cool.time + 1);
  arrive(t, 'board');
  assert.ok(t.boardSelect('olivier:peelEgg'));
  assert.equal(t.boardCur().overcooked, false);
});

test('пригорела картошка оливье → новую снова можно достать, почистить и сварить (день не застревает)', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  startBoil(s, 'olivier:boil', { burner: 0, heat: 9 });
  for (let i = 0; i < 6000 && s.burners[0].state !== 'empty'; i++) s.update(0.1);
  assert.equal(s.burners[0].soot, true, 'пригорело');
  s.inventory.add('potato', 3); // привезли новую
  const t = s.fridgeTasks().find((x) => x.product === 'potato');
  assert.ok(t, 'картофель снова в задачах холодильника');
  assert.equal(t.dest, 'board', 'сырой — сначала на доску почистить');
  assert.equal(s.stepDone('olivier', 'peelPotato'), false);
  s.burners[0].dirty = false;
  const b = startBoil(s, 'olivier:boil', { burner: 1, heat: 6 });
  assert.equal(b.state, 'boiling', 'вторая кастрюля стоит');
});

test('свёкла на обычном огне 6 успевает свариться до того, как выкипит вода (долить воды в игре нельзя)', () => {
  const s = new KitchenSession({ dayIndex: 4, seed: 1 });
  s.triggers = [];
  startBoil(s, 'shuba:boilBeet', { burner: 0, heat: 6 });
  let readyAt = null, burntAt = null;
  for (let i = 0; i < 8000 && burntAt == null; i++) {
    s.update(0.1);
    const b = s.burners[0];
    if (readyAt == null && b.state === 'ready') readyAt = s.t;
    if (b.soot) burntAt = s.t;
  }
  assert.ok(readyAt != null, 'свёкла сварилась');
  assert.ok(burntAt == null || burntAt - readyAt >= kitchenSec(10), `после «готово» есть хотя бы 10 кухонных минут, чтобы снять: ready ${readyAt}, burnt ${burntAt}`);
});

test('поставила кастрюлю на включённую пустую конфорку → напоминание «горит впустую» снято', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.triggers = [];
  arrive(s, 'stove');
  s.setHeat(2, 6);
  run(s, CAMPAIGN.stove.idleWarn + 2);
  assert.ok(alertKeys(s).includes('burner2'));
  startBoil(s, 'olivier:boilEgg', { burner: 2, heat: null });
  run(s, 1);
  assert.equal(alertKeys(s).includes('burner2'), false);
});
