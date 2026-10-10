// 0.9: краш дня 3 — в миску добавляли зелень, а у миски не было «инструмента в руке» для неё (TypeError в _syncTools).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES } from '../src/campaign/data.js';
import { BOWL_TOOL_IDS } from '../src/view/bowl3d.js';

test('у каждого продукта, который кладут в миску, есть инструмент в руке', () => {
  const missing = [];
  for (const [id, r] of Object.entries(RECIPES))
    for (const st of r.steps) if (st.type === 'add' && !BOWL_TOOL_IDS.includes(st.product)) missing.push(`${id}:${st.product}`);
  assert.deepEqual(missing, [], `нет инструмента: ${missing.join(', ')}`);
  for (const k of ['salt', 'pepper']) assert.ok(BOWL_TOOL_IDS.includes(k));
});
