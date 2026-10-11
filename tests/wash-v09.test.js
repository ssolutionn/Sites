import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive } from './helpers-campaign.js';

function wash() {
  const s = new KitchenSession({ seed: 1 });
  s.triggers = [];
  s.equipment.bowl.clean = false;
  arrive(s, 'sink');
  assert.ok(s.sinkSelect('bowl'));
  return s;
}

test('миску можно вымыть несколькими движениями туда-сюда в одном месте', () => {
  const s = wash();
  s.pointer('down', -0.08, 0);
  for (let i = 0; i < 16 && s.sinkJob; i++) s.pointer('move', i % 2 ? -0.08 : 0.08, 0);
  s.pointer('up', 0, 0);
  assert.equal(s.equipment.bowl.clean, true);
  assert.equal(s.sinkJob, null);
});

test('держать неподвижно или тереть мимо предмета — не мытьё', () => {
  const s = wash();
  s.pointer('down', 0, 0);
  for (let i = 0; i < 10; i++) s.pointer('move', 0, 0);
  assert.equal(s.sinkJob.scrub.progress, 0);
  s.pointer('move', 0.8, 0.8);
  s.pointer('move', 0.9, 0.8);
  s.pointer('up', 0, 0);
  assert.equal(s.sinkJob.scrub.progress, 0);
});

test('прогресс сохраняется после отпускания, не появляется разреза через паузу или вне предмета', () => {
  const s = wash();
  s.pointer('down', -0.08, 0);
  s.pointer('move', 0, 0);
  const before = s.sinkJob.scrub.progress;
  assert.ok(before > 0);
  s.pointer('up', 0, 0);
  s.pointer('down', 0.08, 0);
  assert.equal(s.sinkJob.scrub.progress, before);
  s.pointer('move', 0.8, 0.8);
  s.pointer('move', -0.08, 0);
  assert.equal(s.sinkJob.scrub.progress, before);
});

test('край миски можно мыть, на 10 процентов за границей мазок не засчитывается', () => {
  const s = wash();
  const r = s.cfg.wash.bowlRadius;
  s.pointer('down', r - 0.02, 0);
  s.pointer('move', r, 0);
  const before = s.sinkJob.scrub.progress;
  assert.ok(before > 0);
  s.pointer('move', r * 1.1, 0);
  assert.equal(s.sinkJob.scrub.progress, before);
  s.pointer('move', r - 0.01, 0);
  assert.equal(s.sinkJob.scrub.progress, before);
});
