// 0.11 D: кот — крикнуть (50 %), отогнать самой (100 %), покормить и поиграть жестами, а не кнопками.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession, arrive, run, feedCatByShaking, playCatByWand } from './helpers-campaign.js';
import { CAMPAIGN } from '../src/campaign/data.js';
import { KibbleShake, WandPlay } from '../src/campaign/cat-gestures.js';
import { CAT_CHASE } from '../src/campaign/layout.js';

const C = CAMPAIGN.cat;
const day = () => {
  const s = new KitchenSession({ dayIndex: 1, seed: 3 });
  s.triggers = [];
  return s;
};
const withRolls = (s, ...rolls) => {
  let i = 0;
  s.rng = { next: () => rolls[i++ % rolls.length] };
};

test('крик: удачный бросок прогоняет кота, неудачный — «ухом не повёл»; пока голос «сел», крик не работает', () => {
  const s = day();
  s._startCatTheft('sausage');
  withRolls(s, 0.7, 0.3);
  assert.equal(s.shout(), 'miss');
  assert.equal(s.cat.state, 'theft');
  assert.match(s.hint.text, /ухом не повёл/);
  assert.equal(s.shout(), 'cooldown', 'сразу второй раз нельзя');
  run(s, C.shoutCooldown + 0.1);
  assert.equal(s.shout(), 'shoo');
  assert.equal(s.cat.state, 'home');
  assert.equal(s.stats.shouts, 1);
  assert.equal(s.stats.shoutMisses, 1);
});

test('крик: шанс ровно 50 % — бросок 0,49 удачный, 0,5 уже нет; без кота кричать не на кого', () => {
  const s = day();
  assert.equal(s.shout(), false);
  assert.match(s.hint.text, /не безобразничает/);
  s._startCatTheft('sausage');
  withRolls(s, C.shoutChance - 0.01);
  assert.equal(s.shout(), 'shoo');
  const t = day();
  t._startCatTheft('sausage');
  withRolls(t, C.shoutChance);
  assert.equal(t.shout(), 'miss');
});

test('крик работает из крупного плана, где помахать мышью нельзя', () => {
  const s = day();
  arrive(s, 'board');
  s._startCatTheft('sausage');
  assert.equal(s.catWave(0.5), 'closeup');
  withRolls(s, 0.1);
  assert.equal(s.shout(), 'shoo');
});

test('отогнать самой: героиня идёт к коту и прогоняет наверняка, станцию бросает', () => {
  const s = day();
  arrive(s, 'board');
  s._startCatTheft('sausage');
  withRolls(s, 0.99); // крик бы не помог
  assert.ok(s.chaseCat());
  assert.equal(s.panel, null, 'ушла с доски');
  for (let i = 0; i < 30 * 10 && s.cat.state === 'theft'; i++) s.update(1 / 30);
  assert.equal(s.cat.state, 'home');
  assert.equal(s.stats.chases, 1);
  const spot = CAT_CHASE.theft;
  assert.ok(Math.hypot(s.heroine.x - spot.x, s.heroine.z - spot.z) < 0.4, 'стоит рядом с котом');
});

test('отогнать самой: кот уже сделал своё, пока шла, — прогонять поздно; без кота — отказ', () => {
  const s = day();
  assert.equal(s.chaseCat(), false);
  s._startCatTheft('sausage');
  s.cat.deadline = s.t + 0.2;
  assert.ok(s.chaseCat());
  run(s, 1);
  assert.equal(s.stats.chases ?? 0, 0);
});

test('пробел: кот ближе любой станции — отгоняет его; станция ближе — открывает её', () => {
  const s = day();
  s._startCatTheft('sausage');
  const spot = CAT_CHASE.theft;
  s.heroine.x = spot.x;
  s.heroine.z = spot.z - 0.2;
  assert.ok(s.interact());
  run(s, 0.5);
  assert.equal(s.cat.state, 'home');
});

test('корм: пачка над миской, шесть встряхиваний не нужны — хватает cat.feed.shakes; миска полная — кот накормлен', () => {
  const s = day();
  s.catNeeds.hunger = 60;
  assert.ok(feedCatByShaking(s));
  assert.equal(s.catNeeds.hunger, 0);
  assert.equal(s.cat.state, 'eat');
  assert.ok(s.drain().some((e) => e.type === 'catFed'));
});

test('KibbleShake: эталон засчитан, ровно размах = порог засчитан, порог −10 % и мимо миски — нет', () => {
  const f = C.feed;
  const shakeBy = (amp, x = 0, n = f.shakes * 2) => {
    const k = new KibbleShake(f);
    let t = 0, got = 0;
    for (let i = 0; i < n; i++) {
      t += 0.3;
      if (k.move(x, i % 2 ? amp / 2 : -amp / 2, t) === 'shake') got++;
    }
    return { k, got };
  };
  assert.ok(shakeBy(f.amplitude * 1.6).k.shakes >= f.shakes - 1, 'эталон');
  assert.ok(shakeBy(f.amplitude).got > 0, 'ровно порог');
  assert.equal(shakeBy(f.amplitude * 0.9).got, 0, 'порог −10 %: рука не дошла');
  assert.equal(shakeBy(f.amplitude * 1.6, f.radius + 0.05).got, 0, 'мимо миски');
});

test('WandPlay: путь копится, скачок указателя и выход за радиус путь не считают, довёл до конца — кот наигрался', () => {
  const w = new WandPlay(C.play);
  w.move(0, 0);
  assert.ok(w.move(0.3, 0) > 0.29);
  assert.equal(w.move(0.3 + C.play.maxJump + 0.05, 0), 0, 'скачок');
  w.release();
  assert.equal(w.move(C.play.radius + 0.1, 0), 0, 'вне радиуса');
  assert.equal(w.progress < 1, true);
  const s = day();
  s.catNeeds.boredom = 70;
  assert.ok(playCatByWand(s));
  assert.equal(s.catNeeds.boredom, 0);
  assert.equal(s.cat.state, 'play');
});

test('кормить и играть нельзя, пока кот безобразничает или занят; смена станции кладёт предмет', () => {
  const s = day();
  arrive(s, 'catbowl');
  s._startCatTheft('sausage');
  assert.equal(s.catPick('kibble'), false);
  assert.match(s.hint.text, /прогони/);
  s.shoo();
  run(s, 1); // реакция героини на кота
  assert.ok(s.catPick('kibble'));
  assert.equal(s.catTool, 'kibble');
  assert.ok(s.catPick('kibble') && s.catTool === null, 'повторный выбор — положила');
  s.catPick('wand');
  arrive(s, 'board');
  assert.equal(s.catTool, null);
  assert.equal(s.feedCat, undefined, 'кнопки «Покормить» больше нет');
  assert.equal(s.playCat, undefined);
});
