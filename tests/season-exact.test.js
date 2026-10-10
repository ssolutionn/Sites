// 0.9, пункт 2 владельца: «соль и перец по вкусу — бред, должны быть чёткие пропорции».
// Норма — в рецепте (щепотки на порцию из урока), одинаковая в каждой игре; пожелания гостей меняют её открыто.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession } from './helpers-campaign.js';
import { RECIPES } from '../src/campaign/data.js';

const seasoned = Object.entries(RECIPES).filter(([, r]) => r.steps.some((s) => s.type === 'season'));

test('у каждого блюда с солью — точная норма в рецепте, у оливье 4 соли и 2 перца', () => {
  assert.ok(seasoned.length >= 5);
  for (const [id, r] of seasoned) {
    assert.ok(Number.isInteger(r.season?.salt) && r.season.salt > 0, `${id}: соль`);
    assert.ok(Number.isInteger(r.season?.pepper) && r.season.pepper >= 0, `${id}: перец`);
  }
  assert.deepEqual(RECIPES.olivier.season, { salt: 4, pepper: 2 });
});

test('норма не случайная: в любой игре одна и та же', () => {
  for (const seed of [1, 2, 3, 77, 1234]) {
    const s = new KitchenSession({ dayIndex: 0, seed });
    assert.deepEqual(s.dishes.olivier.season.target, { salt: 4, pepper: 2 }, `seed ${seed}`);
  }
});

test('«посолонее» от гостей — открыто плюс одна щепотка к норме рецепта', () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 1 });
  s.requests = [];
  const opts = s._wishOptions().filter((o) => o.kind === 'moreSalt');
  assert.ok(opts.length, 'крабовый можно попросить посолонее');
  const before = s.dishes.crab.season.target.salt; // во дне 2 уже может быть одно пожелание
  s._wishOptions = () => opts;
  s._addRandomWish({ next: () => 0 }, 0);
  assert.equal(s.dishes.crab.season.target.salt, before + 1);
});
