import test from 'node:test';
import assert from 'node:assert/strict';
import { clipForGirl, clipForCat, upperBodyTrack } from '../src/view/actor-poses.js';

test('missing clips fall back to valid actions without blocking the game', () => {
  const clips = new Set(['idle', 'stir', 'carry', 'walk']);
  assert.equal(clipForGirl('wash', clips), 'stir');
  assert.equal(clipForGirl('unpack', clips), 'carry');
  assert.equal(clipForGirl('phone', clips), 'idle');
  assert.equal(clipForGirl('walk', new Set()), null);
});
test('carried food keeps the carry arms while legs walk', () => {
  assert.equal(clipForGirl('walk', new Set(['walk', 'walk_carry']), true), 'walk_carry');
  assert.equal(upperBodyTrack('forearm_r.quaternion'), true);
  assert.equal(upperBodyTrack('thigh_r.quaternion'), false);
  assert.equal(upperBodyTrack('root.position'), false);
});
test('cat jump, knock and stolen food choose their specific clips', () => {
  const clips = new Set(['idle', 'walk', 'steal_run', 'jump_up', 'knock_over', 'reach']);
  assert.equal(clipForCat('jump', clips, true), 'jump_up');
  assert.equal(clipForCat('knock', clips), 'knock_over');
  assert.equal(clipForCat('walk', clips, true, true), 'steal_run');
  assert.equal(clipForCat('eat', clips), 'idle');
});
