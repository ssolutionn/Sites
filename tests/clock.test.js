// 0.9: часы телефона и окно — реальное время игрока.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clockText, dayPhase, wallAgo } from '../src/campaign/clock.js';

test('часы телефона — настоящее время в формате ЧЧ:ММ, по минутам', () => {
  assert.equal(clockText(new Date(2026, 11, 25, 9, 5, 59)), '09:05');
  assert.equal(clockText(new Date(2026, 11, 25, 23, 59, 1)), '23:59');
});

test('время суток зимой: утро, день, вечер, ночь', () => {
  assert.equal(dayPhase(8), 'morning');
  assert.equal(dayPhase(12), 'day');
  assert.equal(dayPhase(16), 'evening');
  assert.equal(dayPhase(17), 'night');
  assert.equal(dayPhase(2), 'night');
  assert.equal(dayPhase(7), 'night');
});

test('сообщение пришло 90 игровых секунд назад — на часах на полторы минуты раньше', () => {
  const now = new Date(2026, 11, 25, 14, 30, 0);
  assert.equal(clockText(wallAgo(now, 90)), '14:28');
  assert.equal(clockText(wallAgo(now, -5)), '14:30', 'будущее не показываем');
});
