// Плита — отдельный прибор: варочная панель, панель с крутилками, духовка с дверцей и стеклом, ящик, ножки.
// Чистая сборка геометрии: без игровой логики, без DOM и WebGL (работает в node, проверяется тестами).
// Метры. Начало координат — на полу по центру ПЕРЕДНЕЙ кромки прибора; +x вправо, +y вверх, +z к игроку,
// корпус уходит в −z. Ставится на столешницу задней стены через stovePlacement().
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Размеры корпуса и опорные высоты (м). Все числа модели — здесь, не в коде сборки. */
export const STOVE_DIMS = {
  w: 0.6, // ширина корпуса
  d: 0.7, // глубина от передней плоскости (дверца, панель) до задней стенки
  front: 0.03, // толщина передних деталей: дверца, панель, ящик (выступают из корпуса)
  deckY: 0.906, // верх корпуса (эмалевая крышка): на 6 мм выше столешницы (0,9) — без совпадающих плоскостей
  hobY: 0.912, // верх стеклянной варочной панели
  gridY: 0.93, // верх колец конфорок: на нём стоит кастрюля (= высота k.stoveCenter)
  legH: 0.07, // высота ножек
  burnerZ: 0.405, // от передней кромки до ряда центров конфорок (центр STOVE — k.stoveCenter)
  doorY: 0.215, // нижний край дверцы (петли внизу)
  doorH: 0.56,
  panelY: 0.785, // нижний край панели управления
  knobY: 0.846, // высота оси крутилок на панели
  knobX: [-0.21, -0.095, 0.095, 0.21], // крутилка i ↔ конфорка i слева направо
};

/** Передняя кромка столешницы back_counter (GLB: z = −2,25 + 0,38) — от неё считается «выступ вперёд». */
export const COUNTER_FRONT_Z = -1.87;
/** Верх столешницы back_counter. */
export const COUNTER_TOP_Y = 0.9;
/** Центры ручек шкафов в GLB рядом с плитой (м, x): плита должна стоять между ними, не перекрывая ручку наполовину. */
export const COUNTER_HANDLE_POSTS = [1.008, 1.648];

const DEFAULT_BURNERS = [
  { x: -0.15, z: -0.14 },
  { x: -0.15, z: 0.14 },
  { x: 0.15, z: -0.14 },
  { x: 0.15, z: 0.14 },
];

/**
 * Где ставить модель: x — центр плиты, z — передняя кромка.
 * @param {number} centerX центр варочной поверхности по x (stations.stove.anchor.x)
 * @param {number} centerZ центр варочной поверхности по z (середина столешницы)
 */
export function stovePlacement(centerX, centerZ) {
  return { x: centerX, z: centerZ + STOVE_DIMS.burnerZ };
}

/**
 * Собрать плиту.
 * @param {object} THREE пространство имён three (передаётся, чтобы модуль не зависел от сборки)
 * @param {object} [opts] burners — [{x,z}] от центра варочной поверхности (STOVE.burners), burnerR — радиус зоны конфорки
 * @returns {{group, knobs, burners, ovenDoor, ovenGlass, ovenGlowMesh, handle, hob, panel, oven, dims, protect, stats}}
 *   knobs — 4 группы: ось крутилки смотрит на игрока (rotation.x = π/2), поворот — rotation.y, белая метка вверх при нуле;
 *   ovenDoor — вращается вокруг нижней кромки (rotation.x > 0 — дверца открывается на игрока);
 *   ovenGlowMesh — плоскость свечения за стеклом (opacity 0 — выключено); protect — не склеивать при batchStaticChildren.
 */
export function buildStove(THREE, opts = {}) {
  const D = STOVE_DIMS;
  const burnersCfg = opts.burners ?? DEFAULT_BURNERS;
  const hw = D.w / 2;
  const group = new THREE.Group();
  group.name = 'stove';

  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0, ...extra });
  const M = {
    enamel: std(0xf2f0ea, { roughness: 0.34, metalness: 0.04 }),
    panel: std(0xe9e7e1, { roughness: 0.38, metalness: 0.04 }),
    dark: std(0x1f2025, { roughness: 0.7 }),
    hob: std(0x14161b, { roughness: 0.14, metalness: 0.35 }),
    iron: std(0x2b2b30, { roughness: 0.5, metalness: 0.55 }),
    chrome: std(0xcfd6dd, { roughness: 0.28, metalness: 0.75 }),
    foot: std(0x8b9199, { roughness: 0.4, metalness: 0.6 }),
    knob: std(0x26272c, { roughness: 0.42, metalness: 0.15 }),
    mark: std(0xffffff, { roughness: 0.4, emissive: 0x331100 }),
    rack: std(0x6a7077, { roughness: 0.4, metalness: 0.6 }),
    display: std(0x0c1a10, { roughness: 0.3, emissive: 0x1a6b3a, emissiveIntensity: 0.55 }),
    glass: std(0x1d2128, { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.5, depthWrite: false }),
    interior: std(0x1c1816, { roughness: 0.9, side: THREE.BackSide }),
  };

  const place = (m, x, y, z, part = 'body', name = '') => {
    m.position.set(x, y, z);
    m.userData.part = part; // body — корпус; trim — выступающие мелочи (ручки, крутилки)
    if (name) m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  const box = (w, h, d, mat, x, y, z, part, name) => place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, part, name);
  const rbox = (w, h, d, r, mat, x, y, z, part, name) => place(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), mat), x, y, z, part, name);
  const cyl = (rt, rb, h, mat, x, y, z, part, name, seg = 18) => place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), x, y, z, part, name);
  const rect = (shape, x0, y0, x1, y1) => {
    shape.moveTo(x0, y0);
    shape.lineTo(x1, y0);
    shape.lineTo(x1, y1);
    shape.lineTo(x0, y1);
    shape.closePath();
    return shape;
  };

  // ---------- корпус: эмалевая «труба» с проёмом духовки + задняя стенка ----------
  const shellZ0 = -(D.d - 0.015), shellZ1 = -D.front; // от задней плиты до передней грани, на которой сидят дверца и панель
  const shellShape = rect(new THREE.Shape(), -hw, D.legH, hw, D.deckY);
  const hole = rect(new THREE.Path(), -0.255, 0.235, 0.255, 0.745);
  shellShape.holes.push(hole);
  const shellGeo = new THREE.ExtrudeGeometry(shellShape, { depth: shellZ1 - shellZ0, bevelEnabled: false });
  shellGeo.translate(0, 0, shellZ0);
  // [торцы: тёмные (щели между дверцей, панелью и ящиком), стенки: эмаль]
  const shell = place(new THREE.Mesh(shellGeo, [M.dark, M.enamel]), 0, 0, 0, 'body', 'shell');
  group.add(shell);
  group.add(box(D.w, D.deckY - D.legH, 0.015, M.dark, 0, (D.deckY + D.legH) / 2, -(D.d - 0.0075), 'body', 'back_plate'));
  // внутренность духовки: тёмная коробка, видна сквозь стекло
  group.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.506, 0.506, shellZ1 - shellZ0 - 0.002), M.interior), 0, 0.49, (shellZ0 + shellZ1) / 2, 'body', 'oven_interior'));
  group.add(box(0.49, 0.006, 0.58, M.rack, 0, 0.36, -0.37, 'body', 'oven_rack'));

  // ---------- варочная поверхность: стекло, 4 конфорки (кольца чугунного цвета), задний бортик ----------
  const hobDepth = 0.515, hobCz = -D.burnerZ + 0.0025;
  const hob = rbox(0.536, D.hobY - D.deckY, hobDepth, 0.002, M.hob, 0, (D.deckY + D.hobY) / 2, hobCz, 'body', 'hob_glass');
  group.add(hob);
  group.add(rbox(D.w, 0.028, 0.025, 0.004, M.enamel, 0, D.deckY + 0.014, -(D.d - 0.0125), 'body', 'back_rim'));
  // профиль конфорки (r, y от стекла): крышка — головка — канавка для пламени — кольцо под кастрюлю (верх 0,018 → высота 0,93)
  const prof = [[0, 0.0135], [0.03, 0.0135], [0.034, 0.009], [0.058, 0.009], [0.058, 0.0045], [0.08, 0.0045], [0.08, 0.018], [0.092, 0.018], [0.092, 0]];
  const burnerGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const burners = burnersCfg.map((b, i) => {
    const m = place(new THREE.Mesh(burnerGeo, M.iron), b.x, D.hobY, -D.burnerZ + b.z, 'body', `burner_${i}`);
    group.add(m);
    return { i, x: b.x, y: D.hobY, z: -D.burnerZ + b.z, r: opts.burnerR ?? 0.08, mesh: m };
  });

  // ---------- передняя плоскость: панель управления, дверца, ящик ----------
  const fw = hw - 0.008;
  const panelH = D.deckY - D.panelY;
  const panel = rbox(2 * fw, panelH, D.front, 0.004, M.panel, 0, D.panelY + panelH / 2, -D.front / 2, 'body', 'control_panel');
  group.add(panel);
  group.add(box(0.075, 0.032, 0.003, M.display, 0, D.knobY, 0.0015, 'trim', 'display'));
  // ящик для противней
  const drawerY = 0.08, drawerH = 0.125;
  group.add(rbox(2 * fw, drawerH, D.front, 0.004, M.enamel, 0, drawerY + drawerH / 2, -D.front / 2, 'body', 'drawer'));
  const drawerHandleY = drawerY + drawerH - 0.03;
  group.add(cyl(0.007, 0.007, 0.24, M.chrome, 0, drawerHandleY, 0.021, 'trim', 'drawer_handle', 12).rotateZ(Math.PI / 2));
  for (const s of [-1, 1]) group.add(cyl(0.005, 0.005, 0.021, M.chrome, s * 0.105, drawerHandleY, 0.0105, 'trim', 'drawer_handle_post', 10).rotateX(Math.PI / 2));
  // цоколь и ножки
  group.add(box(D.w - 0.06, D.legH, D.d - 0.1, M.dark, 0, D.legH / 2, -(D.d - 0.1) / 2 - 0.05, 'body', 'plinth'));
  for (const sx of [-1, 1]) for (const z of [-0.027, -(D.d - 0.027)]) group.add(cyl(0.02, 0.022, D.legH, M.foot, sx * (hw - 0.04), D.legH / 2, z, 'body', 'leg'));
  // тёмные щели по бокам: между корпусом и соседними шкафами
  for (const sx of [-1, 1]) group.add(box(0.006, COUNTER_TOP_Y + 0.003, D.d - 0.02, M.dark, sx * (hw + 0.003), (COUNTER_TOP_Y + 0.003) / 2, -(D.d - 0.02) / 2, 'slit', 'slit'));

  // ---------- крутилки: ось на игрока, метка вверх при нуле, поворот по rotation.y (по часовой — больше огня) ----------
  const knobs = D.knobX.map((x, i) => {
    const k = new THREE.Group();
    k.name = `knob_${i}`;
    const skirt = place(new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.004, 24), M.chrome), 0, -0.011, 0, 'trim', 'skirt');
    const body = place(new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.025, 0.026, 24), M.knob), 0, 0, 0, 'trim', 'body');
    const mark = place(new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0035, 0.014), M.mark), 0, 0.01475, -0.0095, 'trim', 'mark');
    k.add(skirt, body, mark);
    k.rotation.x = Math.PI / 2;
    k.position.set(x, D.knobY, 0.013);
    k.userData.part = 'trim';
    group.add(k);
    return k;
  });

  // ---------- дверца духовки: петли внизу, окно со стеклом, ручка-штанга ----------
  const ovenDoor = new THREE.Group();
  ovenDoor.name = 'oven_door';
  ovenDoor.position.set(0, D.doorY, 0);
  const slabShape = rect(new THREE.Shape(), -fw, 0, fw, D.doorH);
  slabShape.holes.push(rect(new THREE.Path(), -0.205, 0.085, 0.205, 0.425));
  const slabGeo = new THREE.ExtrudeGeometry(slabShape, { depth: D.front, bevelEnabled: false });
  slabGeo.translate(0, 0, -D.front);
  const slab = place(new THREE.Mesh(slabGeo, M.enamel), 0, 0, 0, 'body', 'door_slab');
  const ovenGlass = place(new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.36, 0.004), M.glass), 0, 0.255, -0.016, 'body', 'oven_window_glass');
  ovenGlass.castShadow = false;
  const handle = new THREE.Group();
  handle.name = 'oven_handle';
  const hy = 0.5;
  const bar = place(new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.46, 14), M.chrome), 0, hy, 0.033, 'trim', 'handle_bar');
  bar.rotation.z = Math.PI / 2;
  handle.add(bar);
  for (const s of [-1, 1]) {
    const post = place(new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.033, 10), M.chrome), s * 0.205, hy, 0.0165, 'trim', 'handle_post');
    post.rotation.x = Math.PI / 2;
    handle.add(post);
  }
  ovenDoor.add(slab, ovenGlass, handle);
  group.add(ovenDoor);

  // свечение духовки: плоскость сразу за стеклом; opacity 0 — выключена (цвет и силу ставит вид)
  const ovenGlowMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.34), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, depthWrite: false }));
  ovenGlowMesh.position.set(0, D.doorY + 0.255, -0.04);
  ovenGlowMesh.name = 'oven_glow';
  ovenGlowMesh.userData.part = 'glow';
  group.add(ovenGlowMesh);

  const oven = {
    chicken: { x: 0, y: 0.363, z: -0.34 }, // куда ставить форму с курицей (на решётке)
    hit: { x: 0, y: D.doorY + D.doorH / 2, z: 0.0225, w: 2 * fw, h: D.doorH, d: 0.045 }, // невидимый короб клика «духовка» перед дверцей
    window: { x: 0, y: D.doorY + 0.255, w: 0.41, h: 0.34 },
  };

  return {
    group,
    knobs,
    burners,
    ovenDoor,
    ovenGlass,
    ovenGlowMesh,
    handle,
    hob,
    panel,
    oven,
    dims: D,
    protect: new Set([ovenGlowMesh]),
    stats: { staticMeshes: group.children.filter((c) => c.isMesh && c !== ovenGlowMesh).length, movingParts: knobs.length + 2 }, // до batchStaticChildren; подвижные — крутилки, дверца, свечение
  };
}
