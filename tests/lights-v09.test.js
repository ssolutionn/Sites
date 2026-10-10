// 0.9: гирлянда гаснет и в первые дни (владелец: «ни разу не гасла»); на ёлке большая звезда — тоже периодически гаснет,
// поправить её — подойти к ёлке и удержать.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, run } from './helpers-campaign.js';
import { CAMPAIGN, DAYS } from '../src/campaign/data.js';
import { CLAYOUT } from '../src/campaign/layout.js';

const starAt = (dayIndex) => DAYS[dayIndex].events.find((e) => e.type === 'star')?.at;

test('в днях 1–3 гаснет гирлянда или звезда, звезда гаснет хотя бы в трёх днях', () => {
  for (const d of DAYS.slice(0, 3)) assert.ok(d.events.some((e) => e.type === 'garland' || e.type === 'star'), `день ${d.id}`);
  assert.ok(DAYS.filter((d) => d.events.some((e) => e.type === 'star')).length >= 3);
});

test('у ёлки есть своё место, и к нему можно подойти', () => {
  assert.ok(CLAYOUT.stations.tree);
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  arrive(s, 'tree');
  assert.equal(s.panel, 'tree');
});

test('звезда гаснет по расписанию дня: напоминание и событие для звука', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  const at = starAt(1);
  assert.ok(at > 0, 'во дне 2 есть звезда');
  run(s, at - 1);
  assert.equal(s.star.broken, false);
  s.drain();
  run(s, 2);
  assert.equal(s.star.broken, true);
  assert.ok(s.alerts.some((a) => a.key === 'star' && a.station === 'tree'));
  assert.ok(s.drain().some((e) => e.type === 'starOff'));
});

test('звезду поправляют удержанием у ёлки, не у другой станции', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  s.lightsOff('star');
  arrive(s, 'board');
  assert.equal(s.setHold('star', true), false);
  arrive(s, 'tree');
  assert.ok(s.setHold('star', true));
  run(s, CAMPAIGN.durations.starHold + 0.2);
  assert.equal(s.star.broken, false);
  assert.equal(s.alerts.some((a) => a.key === 'star'), false);
  assert.ok(s.drain().some((e) => e.type === 'starFixed'));
});

test('звезда не горит к концу дня — минус к порядку', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  const before = s.orderScore().score;
  s.lightsOff('star');
  const after = s.orderScore();
  assert.equal(before - after.score, CAMPAIGN.scoring.order.starLeft);
  assert.ok(after.notes.some((n) => /Звезда/.test(n)));
});

test('гирлянду и звезду гасит один метод: повторно не гаснет', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  assert.ok(s.lightsOff('garland'));
  assert.equal(s.lightsOff('garland'), false);
  assert.equal(s.garland.broken, true);
});
