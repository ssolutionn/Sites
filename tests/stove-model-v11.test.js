// 0.11, C1: плита — отдельный прибор. Размеры, положения и подвижные части модели из src/view/stove-model.js
// проверяются без DOM и WebGL: геометрия three работает в node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildStove, stovePlacement, STOVE_DIMS as D, COUNTER_FRONT_Z, COUNTER_TOP_Y, COUNTER_HANDLE_POSTS } from '../src/view/stove-model.js';
import { batchStaticChildren } from '../src/view/static-batch.js';
import { STOVE, CLAYOUT } from '../src/campaign/layout.js';
import { LAYOUT } from '../src/game/layout.js';
import { KitchenSession } from './helpers-campaign.js';

const CX = LAYOUT.stations.stove.anchor.x; // центр варочной поверхности по x
const BC = LAYOUT.backCounter; // z = −2,25, h = 0,9
const CENTER = { x: CX, y: BC.h + 0.03, z: BC.z }; // k.stoveCenter в kitchen.js

/** Модель в начале координат (без постановки) и поставленная на место, как в kitchen.js. */
const fresh = () => buildStove(THREE, { burners: STOVE.burners, burnerR: STOVE.r });
function placed() {
  const m = fresh();
  const p = stovePlacement(CX, BC.z);
  m.group.position.set(p.x, 0, p.z);
  m.group.updateMatrixWorld(true);
  return { m, p };
}
/** Габариты всех мешей модели, у которых userData.part проходит фильтр. */
function box(m, parts) {
  const b = new THREE.Box3();
  m.group.updateMatrixWorld(true);
  m.group.traverse((o) => {
    if (o.isMesh && parts.includes(o.userData.part)) b.union(new THREE.Box3().setFromObject(o));
  });
  return b;
}

test('начало координат — на полу по центру передней кромки: ножки на полу, передняя плоскость z = 0, центр x = 0', () => {
  const m = fresh();
  const all = box(m, ['body', 'trim', 'slit']);
  const body = box(m, ['body']);
  assert.ok(Math.abs(all.min.y) < 0.001, `низ ${all.min.y}`);
  assert.ok(Math.abs(body.max.z) < 0.001, `перед корпуса ${body.max.z}`);
  assert.ok(Math.abs((body.min.x + body.max.x) / 2) < 0.001);
});

test('корпус ≈ 0,6 × 0,7 м; верх крышки 0,88–0,92 м; конфорки на высоте кастрюли', () => {
  const m = fresh();
  const shell = new THREE.Box3().setFromObject(m.group.getObjectByName('shell'));
  const size = shell.getSize(new THREE.Vector3());
  assert.ok(Math.abs(size.x - 0.6) < 0.01, `ширина ${size.x}`);
  assert.ok(size.z > 0.6 && size.z < 0.75, `глубина ${size.z}`);
  assert.ok(shell.max.y > 0.88 && shell.max.y < 0.92, `верх крышки ${shell.max.y}`);
  for (const b of m.burners) {
    const top = new THREE.Box3().setFromObject(b.mesh).max.y;
    assert.ok(Math.abs(top - CENTER.y) < 0.005, `кольцо ${b.i} выше/ниже кастрюльной высоты: ${top} против ${CENTER.y}`);
  }
});

test('4 конфорки лежат на STOVE.burners в пределах 1 см', () => {
  const { m, p } = placed();
  assert.equal(m.burners.length, 4);
  assert.equal(STOVE.burners.length, 4);
  m.burners.forEach((b, i) => {
    const c = new THREE.Box3().setFromObject(b.mesh).getCenter(new THREE.Vector3());
    const want = { x: CENTER.x + STOVE.burners[i].x, z: CENTER.z + STOVE.burners[i].z };
    assert.ok(Math.abs(c.x - want.x) < 0.01, `конфорка ${i}: x ${c.x} против ${want.x}`);
    assert.ok(Math.abs(c.z - want.z) < 0.01, `конфорка ${i}: z ${c.z} против ${want.z}`);
    assert.ok(Math.abs(b.mesh.position.x + p.x - want.x) < 0.01 && Math.abs(b.mesh.position.z + p.z - want.z) < 0.01);
  });
  // кольцо конфорки целиком на стеклянной панели: крайние точки не выходят за стекло
  const glass = new THREE.Box3().setFromObject(m.hob);
  for (const b of m.burners) {
    const r = new THREE.Box3().setFromObject(b.mesh);
    assert.ok(r.min.x > glass.min.x && r.max.x < glass.max.x && r.min.z > glass.min.z && r.max.z < glass.max.z, `конфорка ${b.i} вылезла за стекло`);
  }
});

test('4 крутилки на панели над дверцей слева направо; метка вверх при нуле и по часовой с ростом огня', () => {
  const { m, p } = placed();
  assert.equal(m.knobs.length, 4);
  const xs = m.knobs.map((k) => k.position.x);
  assert.deepEqual([...xs].sort((a, b) => a - b), xs, 'крутилки идут слева направо: конфорка i ↔ крутилка i');
  const doorTop = D.doorY + D.doorH;
  for (const k of m.knobs) {
    assert.ok(k.position.y > doorTop && k.position.y < D.deckY, `крутилка на панели, y ${k.position.y}`);
    assert.ok(Math.abs(k.rotation.x - Math.PI / 2) < 1e-9 && k.rotation.order === 'XYZ', 'ось на игрока, поворот по rotation.y — как ждёт campaign-view');
    const mark = k.children.find((c) => c.name === 'mark');
    assert.ok(mark, 'у крутилки есть белая метка');
    const dir = (rotY) => {
      k.rotation.y = rotY;
      k.updateMatrixWorld(true);
      const w = new THREE.Vector3();
      mark.getWorldPosition(w);
      const c = new THREE.Vector3();
      k.getWorldPosition(c);
      return w.sub(c);
    };
    const up = dir(0);
    assert.ok(up.y > 0.008 && Math.abs(up.x) < 0.002 && up.z > 0, `метка при нуле вверх: ${up.toArray()}`);
    const right = dir(-Math.PI / 2); // 3 деления = 90° по часовой
    assert.ok(right.x > 0.008 && Math.abs(right.y) < 0.002, `после 90° по часовой метка справа: ${right.toArray()}`);
    k.rotation.y = 0;
  }
  // сами крутилки стоят на панели, а не врезаны в столешницу: сзади упираются в переднюю плоскость, спереди до 3 см
  const kb = new THREE.Box3();
  for (const k of m.knobs) kb.union(new THREE.Box3().setFromObject(k));
  assert.ok(kb.min.z - p.z > -0.002 && kb.max.z - p.z < 0.035, `крутилки от передней плоскости: ${kb.min.z - p.z}…${kb.max.z - p.z}`);
});

test('ничего не выступает за столешницу больше 3 см: корпус — на 2–3 см перед фасадами, ручки и крутилки — мелочь', () => {
  const { m } = placed();
  const body = box(m, ['body', 'slit']);
  const front = body.max.z - COUNTER_FRONT_Z;
  assert.ok(front > 0.015 && front <= 0.03, `корпус выступает на ${front} м перед столешницей`);
  const trim = box(m, ['trim']);
  assert.ok(trim.max.z - COUNTER_FRONT_Z <= 0.08, `ручки и крутилки выступают на ${trim.max.z - COUNTER_FRONT_Z} м`);
  assert.ok(body.min.z >= -2.6, `плита не уходит за стену: ${body.min.z}`);
  // боковые границы — между ручками шкафов back_counter: ни одна ручка не перекрыта наполовину
  assert.ok(body.min.x > COUNTER_HANDLE_POSTS[0] + 0.01, `слева ${body.min.x}`);
  assert.ok(body.max.x < COUNTER_HANDLE_POSTS[1] - 0.01, `справа ${body.max.x}`);
});

test('стык со столешницей: верх плиты на 3–20 мм выше (нет совпадающих плоскостей), щели не выше крышки', () => {
  const { m } = placed();
  const lift = D.deckY - COUNTER_TOP_Y;
  assert.ok(lift >= 0.003 && lift <= 0.02, `крышка выше столешницы на ${lift}`);
  for (const o of m.group.children) if (o.userData.part === 'slit') assert.ok(new THREE.Box3().setFromObject(o).max.y <= D.deckY + 1e-6);
  // верх корпуса вровень с передней панелью: стыка-ступеньки нет
  const panel = new THREE.Box3().setFromObject(m.panel);
  assert.ok(Math.abs(panel.max.y - D.deckY) < 0.001);
});

test('мешей немного: не больше 25 статичных до склейки; подвижные (крутилки, дверца, свечение) не склеиваются', () => {
  const { m } = placed();
  assert.ok(m.stats.staticMeshes <= 25, `статичных мешей ${m.stats.staticMeshes}`);
  const before = m.group.children.filter((c) => c.isMesh).length;
  batchStaticChildren(m.group, m.protect);
  const after = m.group.children.filter((c) => c.isMesh).length;
  assert.ok(after < before, `склейка уменьшила число мешей: ${before} → ${after}`);
  for (const k of m.knobs) assert.equal(k.parent, m.group, 'крутилка осталась отдельной группой');
  assert.equal(m.ovenDoor.parent, m.group);
  assert.equal(m.ovenGlowMesh.parent, m.group);
});

test('духовка: дверца на петлях внизу, окно со стеклом, свечение выключено, курица внутри, клик — перед дверцей', () => {
  const { m, p } = placed();
  assert.ok(m.ovenGlass.material.transparent && m.ovenGlass.material.opacity < 1, 'стекло прозрачное');
  assert.equal(m.ovenGlowMesh.material.opacity, 0, 'выключена — не светится');
  assert.equal(m.ovenDoor.position.y, D.doorY, 'петли на нижней кромке');
  // дверца открывается на игрока: верхняя кромка уходит вперёд, нижняя остаётся
  const closed = new THREE.Box3().setFromObject(m.ovenDoor);
  m.ovenDoor.rotation.x = 1.3;
  m.group.updateMatrixWorld(true);
  const open = new THREE.Box3().setFromObject(m.ovenDoor);
  assert.ok(open.max.z > closed.max.z + 0.3, 'открытая дверца торчит вперёд');
  assert.ok(open.max.y < closed.max.y - 0.3, 'и опускается');
  m.ovenDoor.rotation.x = 0;
  // курица на решётке внутри камеры
  const c = m.oven.chicken;
  assert.ok(Math.abs(c.x) < 0.25 && c.y > 0.24 && c.y < 0.74 && c.z < -0.1 && c.z > -0.68, `курица ${JSON.stringify(c)}`);
  // короб клика закрывает дверцу целиком и стоит впереди неё, не уходя далеко
  const h = m.oven.hit;
  assert.ok(h.w >= 0.57 && h.h >= 0.55);
  assert.ok(h.z - h.d / 2 >= -0.001 && h.z + h.d / 2 <= 0.05);
  assert.ok(Math.abs(h.y - (D.doorY + D.doorH / 2)) < 0.001);
  // окно духовки — внутри дверцы
  assert.ok(m.oven.window.y - m.oven.window.h / 2 > D.doorY && m.oven.window.y + m.oven.window.h / 2 < D.doorY + D.doorH);
  assert.ok(p.z > CENTER.z, 'передняя кромка ближе к игроку, чем центр конфорок');
});

test('метки станций плиты и духовки — на самой плите: оба якоря на её оси, метка 🍗 на дверце', () => {
  const S = CLAYOUT.stations;
  assert.equal(S.stove.anchor.x, CX, 'классическая и кампанейская раскладки ставят плиту в одну точку');
  assert.equal(S.oven.anchor.x, CX);
  const labelY = S.oven.anchor.y + 0.26; // stationScreen поднимает метку на 0,26 м
  assert.ok(labelY > D.doorY && labelY < D.doorY + D.doorH, `метка духовки на высоте ${labelY} — на дверце`);
});

test('героиня доходит до своих точек у плиты и духовки и не заходит в прибор', () => {
  const { p } = placed();
  const S = CLAYOUT.stations;
  const s = new KitchenSession({ dayIndex: 6, seed: 1 });
  const x0 = p.x - D.w / 2 - 0.02, x1 = p.x + D.w / 2 + 0.02, zFront = p.z; // прямоугольник прибора на полу
  // сетка навигации: внутри корпуса клеток нет свободных
  for (let x = x0; x <= x1; x += 0.05) for (let z = zFront - D.d; z <= zFront; z += 0.05) assert.equal(s.nav.isFree(x, z), false, `свободная клетка внутри плиты: ${x.toFixed(2)}, ${z.toFixed(2)}`);
  for (const st of ['stove', 'oven']) {
    assert.ok(s.nav.isFree(S[st].stand.x, S[st].stand.z), `точка у станции ${st} свободна`);
    const inside = (x, z) => x > x0 && x < x1 && z < zFront;
    s.goTo(st);
    let steps = 0;
    while (s.panel !== st && steps++ < 900) {
      s.update(1 / 30);
      assert.ok(!inside(s.heroine.x, s.heroine.z), `героиня прошла сквозь плиту на пути к ${st}: ${s.heroine.x.toFixed(2)}, ${s.heroine.z.toFixed(2)}`);
    }
    assert.equal(s.panel, st, `дошла до ${st}`);
    s.closePanel?.();
  }
});
