import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { clipForGirl, clipForCat, upperBodyTrack, ONCE } from './actor-poses.js';

const cache = new Map();
const state = { loaded: [], failed: [], procedural: false };
export function modelStatus() { return { ...state, loaded: [...state.loaded], failed: [...state.failed] }; }
export function modelClips(id) { return cache.get(id)?.animations ?? []; }

// All loads finish before constructors run. A missing model keeps its procedural fallback.
export async function loadModels({ procedural = false, all = false, onProgress = null } = {}) {
  cache.clear(); state.loaded = []; state.failed = []; state.procedural = procedural;
  if (procedural) return modelStatus();
  const embedded = window.__COZY_PACK__;
  const base = embedded ? null : new URL(`${import.meta.env.BASE_URL}assets/models/`, document.baseURI);
  const loader = new GLTFLoader();
  try {
    let manifest = embedded?.manifest;
    if (!manifest) {
      const res = await fetch(new URL('manifest.json', base), { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
      manifest = await res.json();
    }
    const queue = manifest.models.filter((m) => all || m.runtime);
    const total = queue.length; let completed = 0;
    onProgress?.({ completed,total });
    await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const entry = queue.shift();
        try {
          let bytes;
          if (embedded?.files[entry.id]) {
            bytes = Uint8Array.from(atob(embedded.files[entry.id]), (c) => c.charCodeAt(0)).buffer;
          } else {
            const r = await fetch(new URL(entry.path, base), { signal: AbortSignal.timeout(15000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            bytes = await r.arrayBuffer();
          }
          const gltf = await loader.parseAsync(bytes, base?.href ?? '');
          cache.set(entry.id, gltf); state.loaded.push(entry.id);
        } catch (e) { state.failed.push(entry.id); console.warn(`3D ${entry.id}: ${e.message}. Using procedural model.`); }
        finally { onProgress?.({ completed:++completed,total }); }
      }
    }));
  } catch (e) { state.failed.push('manifest'); console.warn(`3D: ${e.message}. Using procedural models.`); }
  return modelStatus();
}

export function instantiateModel(id) {
  const gltf = cache.get(id);
  if (!gltf) return null;
  // Skinned meshes and joints can be separate scene roots: clone the complete scene.
  const root = cloneSkeleton(gltf.scene);
  root.name = `${id}_instance`;
  root.userData.modelId = id;
  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.userData.sharedAsset = true; }
  });
  return root;
}

function prop(root, socket, object) {
  (root.getObjectByName(socket) ?? root).add(object);
  return object;
}
export function instantiateActor(id) {
  const root = instantiateModel(id), gltf = cache.get(id);
  if (!root) return null;
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map(gltf.animations.map((c) => [c.name, mixer.clipAction(c)]));
  if (id === 'girl' && actions.has('walk') && actions.has('carry')) {
    const walk = actions.get('walk').getClip().tracks.filter((t) => !upperBodyTrack(t.name));
    const carry = actions.get('carry').getClip().tracks.filter((t) => upperBodyTrack(t.name)).map((t) => t.clone());
    const duration = actions.get('walk').getClip().duration;
    for (const t of carry) {
      const sourceDuration = actions.get('carry').getClip().duration;
      for (let i = 0; i < t.times.length; i++) t.times[i] *= duration / sourceDuration;
    }
    actions.set('walk_carry', mixer.clipAction(new THREE.AnimationClip('walk_carry', duration, [...walk, ...carry])));
  }
  const r = root.userData;
  Object.assign(r, { rig: 'gltf', mixer, actions, current: null, lastTime: null, worried: false, expression: 0 });
  r.morphs = [];
  root.traverse((o) => { if (o.morphTargetDictionary) r.morphs.push(o); });
  if (id === 'cat') {
    const loot = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .14, 10), new THREE.MeshStandardMaterial({ color: 0xcf8277, roughness: .7 }));
    loot.rotation.z = Math.PI / 2; loot.visible = false; loot.castShadow = true;
    r.loot = prop(root, 'socket_mouth', loot);
  } else {
    r.knife = instantiateModel('knife') ?? new THREE.Group();
    // Match the asset's grip and retain the socket's rest orientation.
    const grip = r.knife.getObjectByName('grip');
    if (grip) r.knife.position.sub(grip.position);
    prop(root, 'socket_hand_r', r.knife); r.knife.visible = false;
    r.phoneProp = new THREE.Mesh(new THREE.BoxGeometry(.065, .11, .009), new THREE.MeshStandardMaterial({ color: 0x293b46, roughness: .45 }));
    prop(root, 'socket_hand_l', r.phoneProp); r.phoneProp.visible = false;
    r.spoon = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.003, .003, .14, 8), new THREE.MeshStandardMaterial({ color: 0xc4cbd0, roughness: .3, metalness: .7 }));
    const end = new THREE.Mesh(new THREE.SphereGeometry(.015, 10, 8), shaft.material);
    end.scale.set(.8, 1.3, .3); end.position.y = .08; r.spoon.add(shaft, end);
    prop(root, 'socket_hand_r', r.spoon); r.spoon.visible = false;
  }
  return root;
}

function morph(r, name, value) {
  for (const mesh of r.morphs) {
    const i = mesh.morphTargetDictionary[name];
    if (i !== undefined) mesh.morphTargetInfluences[i] = value;
  }
}
export function animateActor(root, pose, time, progress = 0, speed = 0) {
  const r = root.userData;
  const dt = r.lastTime === null ? 0 : Math.max(0, Math.min(.1, time - r.lastTime));
  r.lastTime = time;
  const available = new Set(r.actions.keys());
  const name = r.modelId === 'girl' ? clipForGirl(pose, available, !!r.carrying) : clipForCat(pose, available, speed > .01, r.loot.visible);
  if (name && name !== r.current) {
    const old = r.actions.get(r.current), next = r.actions.get(name);
    const fade = name === 'idle' ? .3 : name === 'walk' ? .2 : .25;
    old?.fadeOut(fade);
    next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(ONCE.has(name) ? THREE.LoopOnce : THREE.LoopRepeat, ONCE.has(name) ? 1 : Infinity);
    next.clampWhenFinished = ONCE.has(name); next.fadeIn(fade).play();
    r.current = name;
    if (r.knife) {
      r.knife.visible = name === 'cut' || name === 'grate'; r.phoneProp.visible = name === 'phone_answer';
      r.spoon.visible = name === 'stir' || name === 'taste';
    }
  }
  const action = r.actions.get(name);
  if (name === 'cut') { action.paused = true; action.time = Math.max(0, Math.min(1, progress)) * action.getClip().duration; }
  r.mixer.update(dt);
  r.expression += ((r.worried ? 1 : 0) - r.expression) * Math.min(1, dt / .2);
  morph(r, 'worried', r.expression); morph(r, 'mouth_o', r.expression * .8); morph(r, 'smile', .15 * (1 - r.expression));
  const blinkPhase = (time + (r.modelId === 'cat' ? 1.7 : 0)) % 4.3;
  morph(r, 'blink', blinkPhase < .15 ? Math.sin(blinkPhase / .15 * Math.PI) : 0);
}
