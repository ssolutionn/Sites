import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Opt-in only: callers nominate a static parent, and protect every animated child.
// Identical material objects preserve textures, emissive settings and render state.
/** Merge explicitly static siblings without changing protected children or materials. */
export function batchStaticChildren(parent, protectedObjects = new Set()) {
  const buckets = new Map();
  for (const child of parent.children) {
    if (!child.isMesh || child.isSkinnedMesh || child.isInstancedMesh || !child.visible || child.children.length || protectedObjects.has(child) || Array.isArray(child.material)) continue;
    const attributes = Object.keys(child.geometry.attributes).sort().map((n) => `${n}:${child.geometry.attributes[n].itemSize}:${child.geometry.attributes[n].normalized}`).join(',');
    const key = `${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${child.renderOrder}:${child.layers.mask}:${attributes}:${JSON.stringify(child.userData)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(child);
  }
  for (const children of buckets.values()) {
    if (children.length < 2) continue;
    const geometries = children.map((child) => {
      child.updateMatrix();
      return (child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()).applyMatrix4(child.matrix);
    });
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const first = children[0], result = new THREE.Mesh(merged, first.material);
    result.name = `${parent.name || 'static'}_batch`;
    result.castShadow = first.castShadow; result.receiveShadow = first.receiveShadow;
    result.layers.mask = first.layers.mask; result.renderOrder = first.renderOrder; result.userData = { ...first.userData };
    for (const child of children) parent.remove(child);
    parent.add(result);
    // Source geometries have not been uploaded yet; don't dispose shared geometry elsewhere.
  }
}
