// Миска 0.7: солонку можно просто кликать над миской, вердикт без «пресно», пересол спасают картошкой.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, waitAction, stir, run } from './helpers-campaign.js';

function readyBowl() {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  const d = s.dishes.olivier;
  for (const st of d.recipe.steps) if (!['season', 'mix', 'taste'].includes(st.id)) d.steps[st.id].done = true;
  s.bowl.owner = 'olivier';
  arrive(s, 'bowl');
  return s;
}
const tap = (s, x, z) => {
  s.pointer('down', x, z);
  s.update(0.1);
  return s.pointer('up', x, z);
};

test('солонка: клик над миской — щепотка, клик мимо миски — ничего', () => {
  const s = readyBowl();
  assert.ok(s.seasonPick('olivier', 'salt'));
  assert.equal(tap(s, 0.02, 0.01), 'pinch');
  assert.equal(tap(s, -0.03, 0.02), 'pinch');
  assert.equal(s.dishes.olivier.season.salt, 2);
  tap(s, 0.6, 0.6);
  assert.equal(s.dishes.olivier.season.salt, 2, 'мимо миски не сыплется');
});

test('солонка: долгое удержание без встряхивания — не щепотка', () => {
  const s = readyBowl();
  s.seasonPick('olivier', 'salt');
  s.pointer('down', 0, 0);
  run(s, 1);
  s.pointer('up', 0, 0);
  assert.equal(s.dishes.olivier.season.salt, 0);
});

test('проба говорит простыми словами: «соли мало», а не «пресно»; есть уровень для шкалы', () => {
  const s = readyBowl();
  s.seasonPick('olivier', 'pepper');
  tap(s, 0, 0);
  s.seasonDone('olivier');
  stir(s, 4.3);
  assert.equal(s.seasonState('olivier').phase, 'taste');
  s.seasonTaste('olivier');
  waitAction(s);
  const last = s.dishes.olivier.season.last;
  assert.doesNotMatch(last.verdict, /пресн/);
  assert.match(last.verdict, /соли мало/);
  assert.ok(last.ds < 0);
  assert.match(s.hint.text, /тряхни солонкой/);
});

test('пересолила — «досыпать картошки»: в миске прибавилось картошки, соли меньше', () => {
  const s = readyBowl();
  s.seasonPick('olivier', 'salt');
  for (let i = 0; i < 7; i++) tap(s, 0, 0);
  s.seasonDone('olivier');
  stir(s, 4.3);
  s.seasonTaste('olivier');
  waitAction(s);
  assert.ok(s.dishes.olivier.season.last.ds > 0);
  assert.match(s.hint.text, /картошк/);
  const before = s.bowl.contents.length;
  assert.ok(s.seasonDilute('olivier'));
  waitAction(s);
  assert.equal(s.dishes.olivier.season.salt, 6);
  assert.equal(s.bowl.contents.length, before + 1);
  assert.equal(s.bowl.contents.at(-1).product, 'potato');
});
