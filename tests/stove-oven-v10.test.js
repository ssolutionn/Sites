// 0.10, владелец: «конфорка и духовка могут одинаково реагировать — придумай, как их разделить».
// Духовка — дверца под конфорками той же плиты. Пока она не нужна (дни без запекания), отдельного места нет:
// метка, клик и пробел ведут к плите. Когда нужна — у неё своё место, а пробел между ними выбирает срочное.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession } from './helpers-campaign.js';
import { CLAYOUT } from '../src/campaign/layout.js';

const S = CLAYOUT.stations;
const place = (s, p) => Object.assign(s.heroine, { x: p.x, z: p.z, station: null, target: null, path: [] });
const mid = { x: (S.stove.stand.x + S.oven.stand.x) / 2, z: S.stove.stand.z };

test('в день без запекания духовки как места нет: у её дверцы пробел ведёт к плите', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  assert.equal(s.stationAvailable('oven'), false);
  assert.equal(s.stationAvailable('stove'), true);
  place(s, S.oven.stand);
  assert.equal(s.nearStation(), 'stove');
});

test('в день курицы духовка — своё место: у дверцы пробел открывает духовку, у конфорок — плиту', () => {
  const s = new KitchenSession({ dayIndex: 6, seed: 1 });
  assert.equal(s.stationAvailable('oven'), true);
  place(s, S.oven.stand);
  assert.equal(s.nearStation(), 'oven');
  place(s, S.stove.stand);
  assert.equal(s.nearStation(), 'stove');
});

test('между плитой и духовкой пробел выбирает то, что срочно', () => {
  const s = new KitchenSession({ dayIndex: 6, seed: 1 });
  place(s, mid);
  s._alert('oven', 'Курица готова — достань из духовки!', { station: 'oven' });
  assert.equal(s.nearStation(), 'oven');
  s._removeAlert('oven');
  s._alert('pot', 'Пена поднимается!', { station: 'stove' });
  assert.equal(s.nearStation(), 'stove');
});

test('духовка с чем-то внутри остаётся местом, даже если блюдо уже не ждёт запекания', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  s.oven.state = 'burnt';
  assert.equal(s.stationAvailable('oven'), true);
});
