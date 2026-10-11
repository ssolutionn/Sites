import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMPAIGN } from '../src/campaign/data.js';
import { screenGestureHit } from '../src/view/pointer-target.js';

test('the same hand wave reaches a cat close by and at the far Christmas tree', () => {
  const camera = new THREE.PerspectiveCamera(45,1280/720,.1,100);
  camera.position.set(0,3,5); camera.lookAt(0,.5,0); camera.updateMatrixWorld();
  for (const z of [1,-2]) {
    const center = new THREE.Vector3(0,.15,z).project(camera);
    const pointer = {x:center.x+2*40/1280,y:center.y};
    assert.equal(screenGestureHit(pointer,center,1280/720,CAMPAIGN.cat.wave.hitRadius),true);
  }
});
test('a cat target does not extend to other parts of the kitchen or behind the camera', () => {
  const center = {x:0,y:0,z:0};
  assert.equal(screenGestureHit({x:.6,y:0},center,16/9,.08),false);
  assert.equal(screenGestureHit({x:0,y:0},{...center,z:2},16/9,.08),false);
  assert.equal(screenGestureHit(null,center,16/9,.08),false);
});
test('horizontal and vertical hit distances use the same screen scale', () => {
  const center={x:0,y:0,z:0}, aspect=2;
  assert.equal(screenGestureHit({x:.07,y:0},center,aspect,.08),true);
  assert.equal(screenGestureHit({x:0,y:.14},center,aspect,.08),true);
  assert.equal(screenGestureHit({x:.1,y:0},center,aspect,.08),false);
});
