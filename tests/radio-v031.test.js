import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.js';
import { CONFIG } from '../src/config.js';

const run = (g, seconds) => { for(let i=0;i<Math.round(seconds*60);i++)g.update(1/60); };
function start() {
  const g=new Game({config:{...CONFIG,events:{...CONFIG.events,cat:{...CONFIG.events.cat,first:Infinity},phone:{...CONFIG.events.phone,at:[]},pot:{...CONFIG.events.pot,at:[]},garland:{at:Infinity}}}});
  g.goTo('stove');run(g,3);assert.ok(g.placePot());g.drain();return g;
}
function arrive(g, station){g.goTo(station);run(g,3);assert.equal(g.panel,station);}

test('test build potato is ready at 120 active seconds with three minutes left',()=>{
  const g=start();g.devJumpTo(119.90);run(g,.05);assert.equal(g.potato,'boiling');
  g.update(.20);assert.equal(g.potato,'ready');assert.ok(Math.abs(g.remaining-179.85)<.001);
  assert.equal(g.drain().filter(e=>e.type==='potatoReady').length,1);
  assert.ok(!g.alerts.find(a=>a.type==='potatoReady').text.includes('30 секунд'));
  run(g,1);assert.equal(g.drain().filter(e=>e.type==='potatoReady').length,0);
});
test('radio breaks once, repair requires its station and restores music state once',()=>{
  const g=start();g.devJumpTo(84.95);run(g,.1);assert.ok(g.radio.broken);
  assert.equal(g.drain().filter(e=>e.type==='radioBroken').length,1);
  assert.equal(g.setHold('radio',true),false);assert.equal(g.getResult().radioError,1);
  arrive(g,'radio');assert.ok(g.setHold('radio',true));run(g,1);g.setHold('radio',false);
  run(g,1);assert.ok(g.radio.broken);assert.ok(Math.abs(g.radio.progress-1)<.01);
  assert.ok(g.setHold('radio',true));run(g,1.1);assert.equal(g.radio.broken,false);
  assert.ok(g.radio.enabled);assert.equal(g.radio.repairs,1);assert.equal(g.getResult().radioError,0);
  assert.equal(g.drain().filter(e=>e.type==='radioFixed').length,1);
  run(g,2);assert.equal(g.radio.repairs,1);assert.equal(g.setHold('radio',true),false);
  assert.equal(g.alerts.some(a=>a.type==='radio'),false);
});
test('intentionally switched off radio does not break or penalize player',()=>{
  const g=start();arrive(g,'radio');assert.ok(g.toggleRadio());assert.equal(g.radio.enabled,false);
  g.devJumpTo(84.95);run(g,.1);assert.equal(g.radio.broken,false);assert.equal(g.getResult().radioError,0);
  assert.ok(g.toggleRadio());run(g,1);assert.equal(g.radio.broken,false);
});
test('leaving radio stops repair and preserves earned repair progress',()=>{
  const g=start();assert.ok(g.breakRadio());arrive(g,'radio');g.setHold('radio',true);run(g,.5);
  const progress=g.radio.progress;g.goTo('board');run(g,3);
  assert.equal(g.holds.radio,false);assert.equal(g.radio.progress,progress);assert.ok(g.radio.broken);
});
test('practice event cutoff suppresses radio breakdown',()=>{
  const g=start();g.cfg={...g.cfg,noNewEventsAfter:-1};g.devJumpTo(84.95);run(g,.1);
  assert.ok(g.radio.triggered);assert.equal(g.radio.broken,false);assert.equal(g.alerts.length,0);
});
test('round end cancels unfinished radio repair and new attempt is clean',()=>{
  const g=start();g.breakRadio();arrive(g,'radio');g.devJumpTo(299.9);g.setHold('radio',true);run(g,.2);
  assert.equal(g.phase,'fail');assert.equal(g.holds.radio,false);assert.equal(g.radio.repairs,0);assert.ok(g.radio.broken);
  const fresh=start();assert.equal(fresh.radio.broken,false);assert.equal(fresh.radio.progress,0);assert.equal(fresh.radio.repairs,0);
});
