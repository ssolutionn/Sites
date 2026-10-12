// 0.11, режим стримера: отдельный зачёт дней с чатом — кампанию не трогает, хранится в save.data.stream.best[индекс дня];
// зрители для финального стола — только очищенные ники.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptySave, parseSave, recordDay, campaignScore } from '../src/campaign/save.js';
import { recordStreamDay, rememberViewers, markInProgress, applyDecorPurchase, applyTreeEvent } from '../src/campaign/persist.js';
import { KitchenSession } from './helpers-campaign.js';

const result = (D, extra = {}) => ({ D, stars: 2, time: 400, medals: ['fast', 'noTheft'], dishes: { olivier: D }, stats: { chatEvents: 3 }, ...extra });

test('день с чатом не трогает кампанию: ни best, ни last, ни медалей, звёзд, времени, баллов, открытия следующего дня', () => {
  const save = emptySave();
  save.bonus = 12;
  const before = structuredClone({ days: save.days, bonus: save.bonus, decor: save.decor, toys: save.toys, finished: save.finished, lastCompletedAt: save.lastCompletedAt });
  recordStreamDay(save, 0, result(88));
  assert.deepEqual({ days: save.days, bonus: save.bonus, decor: save.decor, toys: save.toys, finished: save.finished, lastCompletedAt: save.lastCompletedAt }, before);
  assert.equal(save.days[0].completed, false);
  assert.equal(save.days[1].unlocked, false);
  assert.equal(campaignScore(save), 0);
});

test('результат с чатом лежит отдельно: stream.best[индекс дня] = { D, stars, time, events }', () => {
  const save = emptySave();
  const r = recordStreamDay(save, 2, result(77));
  assert.deepEqual(save.stream.best[2], { D: 77, stars: 2, time: 400, events: 3 });
  assert.equal(r.isBest, true);
  assert.equal(r.prev, null);
  assert.equal(r.events, 3);
});

test('лучший результат с чатом сохраняется: худший не затирает, лучший заменяет', () => {
  const save = emptySave();
  recordStreamDay(save, 0, result(80));
  const worse = recordStreamDay(save, 0, result(70, { stats: { chatEvents: 1 } }));
  assert.equal(worse.isBest, false);
  assert.equal(worse.best.D, 80);
  assert.equal(worse.prev.D, 80);
  assert.equal(save.stream.best[0].D, 80);
  const better = recordStreamDay(save, 0, result(91));
  assert.equal(better.isBest, true);
  assert.equal(better.prev.D, 80);
  assert.equal(save.stream.best[0].D, 91);
});

test('обычный день после дня с чатом пишется как раньше, зачёты не смешиваются', () => {
  const save = emptySave();
  recordStreamDay(save, 0, result(95));
  recordDay(save, 1, result(60));
  assert.equal(save.days[0].best.D, 60);
  assert.equal(save.stream.best[0].D, 95);
});

test('сессия дня с чатом = как испытание: баллы, декор, игрушки и «день идёт» в кампанию не пишутся', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, challenge: true }); // main.js создаёт день с чатом так же
  s.live = true;
  const save = emptySave();
  const opts = { practice: !!s.practice, challenge: s.challenge };
  assert.equal(markInProgress(save, { dayId: 'd1', ...opts }), false);
  assert.equal(applyDecorPurchase(save, { id: 'wreath', ...opts }), false);
  assert.equal(applyTreeEvent(save, { type: 'giftOpened', dayId: 1, index: 0, prize: { kind: 'points', n: 5 } }, opts), false);
  assert.equal(save.bonus, 0);
});

test('сохранение: stream читается обратно, лишнее и битое отбрасывается без падения', () => {
  const save = emptySave();
  recordStreamDay(save, 3, result(66));
  rememberViewers(save, { Нико: 4, Мила: 2 });
  const back = parseSave(JSON.stringify(save)).save;
  assert.deepEqual(back.stream, save.stream);
  for (const bad of [null, 5, 'x', [], { best: 3, viewers: 'ой' }, { best: { 99: { D: 5 }, x: { D: 1 }, 1: { D: 'много' }, 2: null }, viewers: [null, 5, { nick: 7, n: 1 }, { nick: 'Нико', n: -1 }] }]) {
    const raw = JSON.parse(JSON.stringify(save));
    raw.stream = bad;
    const r = parseSave(raw);
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.save.stream, { best: {}, viewers: [] }, JSON.stringify(bad));
  }
});

test('сохранение без поля stream (старое) открывается: пустой зачёт, прогресс на месте', () => {
  const save = emptySave();
  recordDay(save, 1, result(90));
  delete save.stream;
  const r = parseSave(JSON.stringify(save));
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.save.stream, { best: {}, viewers: [] });
  assert.equal(r.save.days[0].best.D, 90);
});

test('ники зрителей при чтении сохранения очищаются заново: руками вписанное не доживает до экрана', () => {
  const save = emptySave();
  save.stream.viewers = [{ nick: '<b>Нико</b>', n: 3 }, { nick: 'Хуйло', n: 5 }, { nick: 'Очень_длинный_ник_зрителя_и_ещё', n: 2 }, { nick: '😀😀😀', n: 9 }, { nick: 'Мила', n: 1 }];
  const back = parseSave(JSON.stringify(save)).save.stream.viewers;
  assert.deepEqual(back, [{ nick: 'Очень_длинный_', n: 2 }, { nick: 'Мила', n: 1 }], 'разметка, недопустимое слово и эмодзи отброшены, длинный ник урезан');
  for (const v of back) assert.match(v.nick, /^[\p{L}\p{N}_ ]{2,14}$/u);
});

test('зрители: активность копится, остаются самые активные, без изменений — «не менялось»', () => {
  const save = emptySave();
  assert.equal(rememberViewers(save, { Нико: 3, Мила: 1 }, 2), true);
  assert.equal(rememberViewers(save, { Нико: 1, Артём: 5 }, 2), true);
  assert.deepEqual(save.stream.viewers, [{ nick: 'Артём', n: 5 }, { nick: 'Нико', n: 4 }]);
  assert.equal(rememberViewers(save, {}, 2), false);
});
