// 0.9, пункт 8 владельца: «не хватает сигнала, когда окончена резка». Как только почти все куски нужного размера,
// доска один раз говорит «готово» (звук, подсказка, кнопка «В миску» подсвечена).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, cutCubes, knife } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';

const readyEvents = (s) => s.drain().filter((e) => e.type === 'cutReady');

test('морковь нарезана кубиком — один сигнал «нарезка готова»', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:carrot');
  s.drain();
  cutCubes(s);
  const ev = readyEvents(s);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].product, 'carrot');
  assert.ok(ev[0].q >= CAMPAIGN.cutReady);
  assert.equal(s.boardCur().cutReady, true);
});

test('только полоски, без поперечных разрезов — сигнала нет', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'board');
  s.boardSelect('olivier:sausage');
  s.drain();
  for (const x of [-2, -1, 0, 1, 2]) knife(s, 'x', x, -5, 5, 12);
  assert.equal(readyEvents(s).length, 0);
  assert.notEqual(s.boardCur().cutReady, true);
});
