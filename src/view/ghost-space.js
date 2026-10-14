// «Рука-призрак» (0.11): из координат демонстрации (ghost-demos.js) в пиксели окна.
// Для рабочих плоскостей станций берётся view.localToScreen — тот же перевод, которым игра ставит курсор;
// ёлка, кот и крутилка огня в плоскостях не лежат, у них свои способы (см. ghost-demos.js: space).
import * as THREE from 'three';
import { DEMOS, demoStation } from '../ghost/ghost-demos.js';

/**
 * Перевод точки демонстрации в пиксели окна (position: fixed). Вызывать на каждый кадр: камера и ёлка двигаются.
 * Возвращает функцию (точка) → { x, y } или null, если точки нет на экране; null вместо функции — якоря нет вовсе
 * (нет станции, нет крутилки в доке).
 * @param view CampaignView
 * @param {string} id жест
 * @param {object} params параметры демонстрации (ghost-cues.paramsFor)
 * @param {Document} [doc]
 */
export function makeMapper(view, id, params = {}, doc = document) {
  const demo = DEMOS[id];
  if (!demo) return null;
  const canvas = view.sv.canvas;
  const rect = canvas.getBoundingClientRect();
  const toPx = (x, y) => ({ x: rect.left + x, y: rect.top + y });
  switch (demo.space) {
    case 'plane': {
      const st = demoStation(id, params);
      if (!view.workPlane(st)) return null;
      return (p) => {
        const q = view.localToScreen(st, p.x, p.z, demo.lift ?? 0); // lift — высота над плоскостью (кастрюля стоит выше конфорки)
        return q ? toPx(q.x, q.y) : null;
      };
    }
    case 'tree': {
      const g = view.tree.g;
      g.updateMatrixWorld(true);
      const v = new THREE.Vector3();
      return (p) => {
        v.set(p.x, p.y, p.z).applyMatrix4(g.matrixWorld).project(view.sv.camera);
        return v.z < 1 ? toPx((v.x * 0.5 + 0.5) * canvas.clientWidth, (-v.y * 0.5 + 0.5) * canvas.clientHeight) : null;
      };
    }
    case 'cat': {
      // рука висит над котом; единицы пути — высота окна (как у Waver в main.js: clientX / высота)
      const c = view.sv.cat.getWorldPosition(new THREE.Vector3());
      c.y += 0.3;
      c.project(view.sv.camera);
      if (c.z >= 1) return null;
      const base = toPx((c.x * 0.5 + 0.5) * canvas.clientWidth, (-c.y * 0.5 + 0.5) * canvas.clientHeight);
      return (p) => ({ x: base.x + p.x * rect.height, y: base.y + p.z * rect.height });
    }
    case 'hold': {
      // рука держит погасшую лампочку гирлянды или звезду: якорь — её точка на экране, единицы пути — высота окна
      const w = view.holdAnchor?.(params.kind);
      if (!w) return null;
      const c = w.clone().project(view.sv.camera);
      if (c.z >= 1) return null;
      const base = toPx((c.x * 0.5 + 0.5) * canvas.clientWidth, (-c.y * 0.5 + 0.5) * canvas.clientHeight);
      return (p) => ({ x: base.x + p.x * rect.height, y: base.y + p.z * rect.height });
    }
    case 'knob': {
      const el = doc.querySelector(`[data-knob="${params.burner ?? 0}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width) return null;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, k = r.width / 2;
      return (p) => ({ x: cx + p.x * k, y: cy + p.z * k });
    }
    default:
      return null;
  }
}

/** Центр элемента-фишки в доке, откуда жест начинается (DEMOS[id].startDom), либо null. */
export function startAnchor(id, doc = document) {
  const sel = DEMOS[id]?.startDom;
  const el = sel ? doc.querySelector(sel) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/** Камера доехала до станции — перевод в пиксели стал стабильным. */
export function cameraSettled(view) {
  return (view.sv.camT ?? 1) >= 0.95;
}
