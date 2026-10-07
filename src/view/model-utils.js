import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Texture-free sculpting helpers: exportable meshes and curves, deterministic detail.
let serial = 0;
export function material(color, roughness = 0.68, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}
export function mesh(geometry, mat, parent, name = 'detail') {
  const object = new THREE.Mesh(geometry, mat);
  object.name = `${name}_${serial++}`;
  object.castShadow = true;
  object.receiveShadow = true;
  if (parent) parent.add(object);
  return object;
}
export function ellipsoid(parent, mat, position, scale, name = 'sculpt', segments = 24) {
  const object = mesh(new THREE.SphereGeometry(1, segments, Math.max(12, segments / 2)), mat, parent, name);
  object.position.set(...position);
  object.scale.set(...scale);
  return object;
}
export function curve(parent, mat, points, radius = 0.006, name = 'seam', segments = 24) {
  const c = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(new THREE.TubeGeometry(c, segments, radius, 6, false), mat, parent, name);
}
export function line(parent, mat, a, b, radius = 0.003, name = 'stitch') {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const object = mesh(new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 6), mat, parent, name);
  object.position.copy(from.add(to).multiplyScalar(0.5));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize());
  return object;
}
export function snowflake(parent, mat, x, y, z, r, name = 'snowflake') {
  const group = new THREE.Group(); group.name = `${name}_${serial++}`;
  group.position.set(x, y, z); parent.add(group);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    const end = [Math.sin(a) * r, Math.cos(a) * r, 0];
    line(group, mat, [0, 0, 0], end, r * 0.065);
    for (const side of [-1, 1]) {
      const start = [end[0] * 0.58, end[1] * 0.58, 0];
      const b = a + side * 0.68;
      line(group, mat, start, [start[0] + Math.sin(b) * r * 0.29, start[1] + Math.cos(b) * r * 0.29, 0], r * 0.055);
    }
  }
  return group;
}
export function taperedLimb(parent, mat, length, top, bottom, name) {
  const object = mesh(new THREE.CylinderGeometry(top, bottom, length, 20, 4), mat, parent, name);
  object.geometry.translate(0, -length / 2, 0);
  ellipsoid(parent, mat, [0, 0, 0], [top, top, top], `${name}_joint`, 16);
  return object;
}
export function group(parent, name, position = [0, 0, 0]) {
  const g = new THREE.Group(); g.name = name; g.position.set(...position); parent?.add(g); return g;
}

// Keep the animation hierarchy, but bake static sibling strokes into shared draws.
export function mergeStaticMeshes(root, protectedMeshes = new Set()) {
  const merge = parent => {
    for (const child of [...parent.children]) if (!child.isMesh) merge(child);
    const buckets = new Map();
    for (const child of parent.children) {
      if (!child.isMesh || !child.visible || protectedMeshes.has(child) || child.children.length || Array.isArray(child.material)) continue;
      const m = child.material;
      const key = [m.color.getHex(),m.roughness,m.metalness,m.side,m.opacity,m.transparent].join(':');
      if (!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(child);
    }
    for (const children of buckets.values()) {
      if (children.length < 2) continue;
      const geos = children.map(child => {
        child.updateMatrix();
        const g = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
        // The models are deliberately texture-free: remove unused UVs for compatible merges.
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        return g.applyMatrix4(child.matrix);
      });
      const merged = mergeGeometries(geos,false);
      if (!merged) { geos.forEach(g=>g.dispose()); continue; }
      mesh(merged,children[0].material,parent,`${parent.name}_static`);
      for (const child of children) { parent.remove(child); child.geometry.dispose(); }
      geos.forEach(g=>g.dispose());
    }
  };
  merge(root);
}
