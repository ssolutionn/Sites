import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { batchStaticChildren } from '../src/view/static-batch.js';

test('batching keeps UVs and transformed positions, protects moving parts', () => {
  const parent = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat), b = a.clone(), moving = a.clone();
  a.position.x = -2; b.position.x = 2; parent.add(a, b, moving);
  batchStaticChildren(parent, new Set([moving]));
  assert.equal(parent.children.length, 2); assert.equal(moving.parent, parent);
  const merged = parent.children.find((c) => c !== moving);
  assert.ok(merged.geometry.attributes.uv);
  merged.geometry.computeBoundingBox();
  assert.equal(merged.geometry.boundingBox.min.x, -2.5); assert.equal(merged.geometry.boundingBox.max.x, 2.5);
});
test('same colour with different textures or shadow settings stays separate', () => {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), mat), b = a.clone(), c = a.clone();
  b.material = mat.clone(); b.material.map = new THREE.Texture(); c.castShadow = true;
  g.add(a, b, c); batchStaticChildren(g); assert.equal(g.children.length, 3);
});
