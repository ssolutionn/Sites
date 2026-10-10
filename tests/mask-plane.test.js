// 0.9: намазывание «инвертированное» — плоскость маски рисовала строку 0 (z < 0 в логике) у дальнего края с z > 0.
// Масло, мытьё, лужа и слои шубы шли зеркально по глубине: ведёшь мышью к себе — мажется от себя.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { maskPlane } from '../src/view/food.js';

for (const ellipse of [false, true]) {
  test(`плоскость маски (${ellipse ? 'эллипс' : 'прямоугольник'}): верх картинки (строка 0, z < 0 в логике) — там же, где z < 0 в мире`, () => {
    const pl = maskPlane({ texture: null }, 1, 1, 0, ellipse);
    pl.updateMatrixWorld();
    const uv = pl.geometry.attributes.uv, pos = pl.geometry.attributes.position;
    let best = -1, bi = 0;
    for (let i = 0; i < uv.count; i++) if (uv.getY(i) > best) { best = uv.getY(i); bi = i; }
    const v = new THREE.Vector3().fromBufferAttribute(pos, bi).applyMatrix4(pl.matrixWorld);
    assert.ok(v.z < 0, `верх картинки на z=${v.z.toFixed(2)}`);
    // и по X не зеркалим: левый край картинки (u = 0) — слева в мире
    let lu = 2, li = 0;
    for (let i = 0; i < uv.count; i++) if (uv.getX(i) < lu) { lu = uv.getX(i); li = i; }
    const l = new THREE.Vector3().fromBufferAttribute(pos, li).applyMatrix4(pl.matrixWorld);
    assert.ok(l.x < 0, `левый край на x=${l.x.toFixed(2)}`);
  });
}
