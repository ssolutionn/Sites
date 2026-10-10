// Кухня: стены, мебель, станции, реквизит.
import * as THREE from 'three';
import { LAYOUT } from '../game/layout.js';
import { tex, toon } from './textures.js';

const GREEN_TOP = 0x3f9a4f;

function box(w, h, d, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

function tag(obj, station) {
  obj.traverse((o) => {
    if (o.isMesh) o.userData.station = station;
  });
  return obj;
}

export function buildKitchen(scene) {
  const k = { stations: {}, rings: {}, clickables: [] };
  const woodMat = toon(0xffffff, { map: tex.wood });
  const topMat = toon(0xffffff, { map: tex.counter, roughness: 0.42 });
  void GREEN_TOP;
  const metal = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.7, roughness: 0.3 });

  // пол
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), toon(0xffffff, { map: tex.floor }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.userData.floor = true;
  scene.add(floor);
  k.floor = floor;

  // стены
  const wallMat = toon(0xffffff, { map: tex.wall });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.4), wallMat);
  back.position.set(0, 1.7, -2.62);
  back.receiveShadow = true;
  scene.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.4), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-3.6, 1.7, 0.3);
  left.receiveShadow = true;
  scene.add(left);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = 3.6;
  scene.add(right);
  // плинтус
  const skirting = box(9, 0.08, 0.03, toon(0xb57a45), { cast: false });
  skirting.position.set(0, 0.04, -2.6);
  scene.add(skirting);

  // окно на задней стене
  const winFrame = box(1.5, 1.05, 0.06, toon(0xfaf6ef));
  winFrame.position.set(-1.25, 1.62, -2.6);
  scene.add(winFrame);
  const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.92), new THREE.MeshBasicMaterial({ map: tex.window }));
  winGlass.position.set(-1.25, 1.62, -2.565);
  scene.add(winGlass);
  const mullion = box(0.04, 0.92, 0.02, toon(0xfaf6ef));
  mullion.position.set(-1.25, 1.62, -2.55);
  scene.add(mullion);
  const sill = box(1.6, 0.04, 0.16, toon(0xfaf6ef));
  sill.position.set(-1.25, 1.09, -2.52);
  scene.add(sill);

  // кафельный фартук
  const splash = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.35), toon(0xffffff, { map: tex.backsplash }));
  splash.position.set(0.2, 1.08, -2.59);
  scene.add(splash);

  // задняя столешница
  const bc = LAYOUT.backCounter;
  const backBase = box(5.6, bc.h - 0.05, bc.d, woodMat);
  backBase.position.set(0.15, (bc.h - 0.05) / 2, bc.z);
  scene.add(backBase);
  const backTop = box(5.7, 0.05, bc.d + 0.06, topMat);
  backTop.position.set(0.15, bc.h - 0.025, bc.z + 0.02);
  scene.add(backTop);
  // ручки ящиков
  for (let i = 0; i < 7; i++) {
    const hnd = box(0.18, 0.02, 0.02, metal);
    hnd.position.set(-2.4 + i * 0.75, 0.72, bc.z + bc.d / 2 + 0.01);
    scene.add(hnd);
  }

  // плита
  const st = LAYOUT.stations.stove;
  const stove = new THREE.Group();
  const stoveTop = box(0.62, 0.03, 0.6, toon(0x2e2e34));
  stoveTop.position.set(0, bc.h + 0.005, 0);
  stove.add(stoveTop);
  for (const [x, z] of [[-0.15, -0.14], [0.15, -0.14], [-0.15, 0.14], [0.15, 0.14]]) {
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.012, 20), toon(0x151518));
    burner.position.set(x, bc.h + 0.025, z);
    stove.add(burner);
  }
  const oven = box(0.6, 0.5, 0.02, toon(0x30303a));
  oven.position.set(0, 0.45, 0.36);
  stove.add(oven);
  const ovenGlass = box(0.44, 0.24, 0.01, new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.1, metalness: 0.4 }));
  ovenGlass.position.set(0, 0.45, 0.375);
  stove.add(ovenGlass);
  // крутилки огня: белая метка показывает, на сколько повёрнута
  k.stoveKnobs = [];
  for (let i = 0; i < 4; i++) {
    const knob = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.025, 18), metal);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.004, 0.018), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x331100, roughness: 0.4 }));
    mark.position.set(0, 0.0135, 0.008);
    knob.add(body, mark);
    knob.rotation.x = Math.PI / 2;
    knob.position.set(-0.2 + i * 0.13, 0.78, 0.37);
    stove.add(knob);
    k.stoveKnobs.push(knob);
  }
  stove.position.set(st.anchor.x, 0, bc.z);
  scene.add(stove);
  // вытяжка
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.38, 0.35, 4, 1, false, Math.PI / 4), toon(0xe6e8ea));
  hood.scale.set(1, 1, 0.75);
  hood.position.set(st.anchor.x, 2.05, -2.38);
  scene.add(hood);

  // кастрюля
  const pot = new THREE.Group();
  const potBody = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xc23b3b, metalness: 0.3, roughness: 0.4, side: THREE.DoubleSide }));
  potBody.position.y = 0.1;
  potBody.castShadow = true;
  pot.add(potBody);
  const potBottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), toon(0x8c2a2a));
  potBottom.rotation.x = -Math.PI / 2;
  potBottom.position.y = 0.005;
  pot.add(potBottom);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.145, 24), toon(0xcfe7f5));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.15;
  pot.add(water);
  const potatoes = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), toon(0xe8c77a));
    p.scale.set(1.2, 0.9, 1);
    p.position.set(Math.cos(i * 1.3) * 0.07, 0.15, Math.sin(i * 1.3) * 0.07);
    potatoes.add(p);
  }
  pot.add(potatoes);
  const foam = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + (i % 3) * 0.012, 8, 6), toon(0xffffff));
    const a = (i / 14) * Math.PI * 2;
    b.position.set(Math.cos(a) * 0.13, 0.21, Math.sin(a) * 0.13);
    foam.add(b);
  }
  foam.visible = false;
  pot.add(foam);
  const lid = new THREE.Group();
  const lidDisc = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.015, 24), metal);
  const lidKnob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), toon(0x222222));
  lidKnob.position.y = 0.025;
  lid.add(lidDisc, lidKnob);
  lid.position.y = 0.21;
  pot.add(lid);
  for (const s of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.01, 6, 12, Math.PI), toon(0x222222));
    handle.position.set(0.16 * s, 0.17, 0);
    handle.rotation.set(0, s > 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI / 2);
    pot.add(handle);
  }
  pot.position.set(st.anchor.x + 0.15, bc.h + 0.03, bc.z + 0.14);
  scene.add(pot);
  // до старта кастрюля стоит рядом, на столешнице
  k.potHome = new THREE.Vector3(st.anchor.x - 0.65, bc.h, bc.z + 0.1);
  k.potOnStove = pot.position.clone();
  k.stoveCenter = new THREE.Vector3(st.anchor.x, bc.h + 0.03, bc.z); // центр варочной поверхности: от него — конфорки (STOVE)
  pot.position.copy(k.potHome);
  // лужа при выкипании
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), new THREE.MeshStandardMaterial({ color: 0x9fd3ef, transparent: true, opacity: 0.6, roughness: 0.05 }));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(st.anchor.x + 0.1, 0.006, bc.z + 0.6);
  puddle.scale.setScalar(0.001);
  scene.add(puddle);
  // пар
  const steam = [];
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), steamMat.clone());
    s.userData.phase = i / 8;
    scene.add(s);
    steam.push(s);
  }
  k.pot = { group: pot, lid, foam, water, potatoes, puddle, steam };
  tag(stove, 'stove');
  tag(pot, 'stove');
  k.stations.stove = [stove, pot];

  // холодильник с магнитом
  const fridge = new THREE.Group();
  const fBody = box(0.85, 2.0, 0.75, toon(0xe9edf0));
  fBody.position.y = 1.0;
  fridge.add(fBody);
  const fLine = box(0.86, 0.015, 0.01, toon(0xb9c0c7));
  fLine.position.set(0, 1.3, 0.38);
  fridge.add(fLine);
  const fHandle = box(0.03, 0.4, 0.04, metal);
  fHandle.position.set(-0.36, 1.55, 0.4);
  fridge.add(fHandle);
  const magnet = new THREE.Mesh(new THREE.CircleGeometry(0.11, 32), new THREE.MeshBasicMaterial({ map: tex.logo, transparent: true }));
  magnet.position.set(0.1, 1.65, 0.381);
  fridge.add(magnet);
  const note = box(0.14, 0.18, 0.005, toon(0xfff6b0));
  note.position.set(0.15, 1.0, 0.38);
  note.rotation.z = 0.08;
  fridge.add(note);
  fridge.position.set(3.05, 0, -2.15);
  scene.add(fridge);

  // ёлка в углу
  const treeG = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.25, 8), toon(0x7a4a24));
  trunk.position.y = 0.25;
  treeG.add(trunk);
  const potBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.22, 16), toon(0xd7262b));
  potBase.position.y = 0.11;
  treeG.add(potBase);
  const needles = toon(0x1f7a3a);
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.55 - i * 0.11, 0.55, 14), needles);
    cone.position.y = 0.55 + i * 0.32;
    cone.castShadow = true;
    treeG.add(cone);
  }
  const ornColors = [0xe53935, 0xfdd835, 0x1e88e5, 0xffffff, 0xff7043];
  for (let i = 0; i < 18; i++) {
    const lvl = i % 4;
    const a = i * 2.4;
    const r = 0.45 - lvl * 0.1;
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), toon(ornColors[i % ornColors.length], { emissive: ornColors[i % ornColors.length], emissiveIntensity: 0.25 }));
    o.position.set(Math.cos(a) * r, 0.45 + lvl * 0.32, Math.sin(a) * r);
    treeG.add(o);
  }
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), toon(0xffd54f, { emissive: 0xffc107, emissiveIntensity: 0.8 }));
  star.position.y = 1.78;
  treeG.add(star);
  treeG.position.set(-3.0, 0, -1.9);
  scene.add(treeG);
  // подарки
  const giftColors = [0xd7262b, 0x2e7d32, 0xfdd835];
  for (let i = 0; i < 3; i++) {
    const g = box(0.24, 0.18, 0.24, toon(giftColors[i]));
    g.position.set(-2.65 + i * 0.28, 0.09, -1.45 + (i % 2) * 0.15);
    g.rotation.y = i * 0.5;
    scene.add(g);
    const ribbon = box(0.25, 0.19, 0.04, toon(0xffffff));
    ribbon.position.copy(g.position);
    ribbon.rotation.y = g.rotation.y;
    scene.add(ribbon);
  }

  // гирлянда над окном
  const garland = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const x = -2.15 + t * 1.8;
    const y = 2.18 - Math.sin(t * Math.PI * 3) ** 2 * 0.16;
    pts.push(new THREE.Vector3(x, y, -2.56));
  }
  const wireCurve = new THREE.CatmullRomCurve3(pts);
  const wire = new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 60, 0.008, 5), toon(0x1f5f2a));
  garland.add(wire);
  const bulbColors = [0xff4d4d, 0xffd54f, 0x66bb6a, 0x42a5f5, 0xff8a65];
  const bulbs = [];
  for (let i = 0; i < 18; i++) {
    const p = wireCurve.getPoint((i + 0.5) / 18);
    const c = bulbColors[i % bulbColors.length];
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6 }));
    b.scale.set(0.8, 1.2, 0.8);
    b.position.copy(p).add(new THREE.Vector3(0, -0.04, 0.01));
    garland.add(b);
    bulbs.push(b);
  }
  // розетка/контакт
  const plug = box(0.1, 0.14, 0.03, toon(0xffffff));
  plug.position.set(-0.3, 1.25, -2.58);
  garland.add(plug);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([pts[24], new THREE.Vector3(-0.32, 1.7, -2.57), new THREE.Vector3(-0.3, 1.3, -2.57)]), 12, 0.007, 5), toon(0x1f5f2a));
  garland.add(cable);
  scene.add(garland);
  const garlandLight = new THREE.PointLight(0xffb36b, 2.2, 4.5, 1.6);
  garlandLight.position.set(-1.25, 1.9, -2.2);
  scene.add(garlandLight);
  k.garland = { group: garland, bulbs, light: garlandLight, plug };
  tag(garland, 'garland');
  tag(winFrame, 'garland');
  k.stations.garland = [garland];

  // остров
  const isl = LAYOUT.island;
  const islBase = box(isl.w, isl.h - 0.05, isl.d, woodMat);
  islBase.position.set(isl.x, (isl.h - 0.05) / 2, isl.z);
  scene.add(islBase);
  const islTop = box(isl.w + 0.1, 0.05, isl.d + 0.1, topMat);
  islTop.position.set(isl.x, isl.h - 0.025, isl.z);
  scene.add(islTop);
  for (let i = 0; i < 4; i++) {
    const hnd = box(0.18, 0.02, 0.02, metal);
    hnd.position.set(-1.35 + i * 0.9, 0.72, isl.z + isl.d / 2 + 0.01);
    scene.add(hnd);
  }
  k.islandTop = isl.h;

  // доска
  const bs = LAYOUT.stations.board.anchor;
  const board = new THREE.Group();
  const boardMesh = box(0.6, 0.03, 0.4, toon(0xffffff, { map: tex.board, roughness: 0.62 }));
  boardMesh.position.y = 0.015;
  board.add(boardMesh);
  const boardEdge = box(0.6, 0.012, 0.4, toon(0xb67b45));
  boardEdge.position.y = 0.002;
  board.add(boardEdge);
  board.position.set(bs.x, isl.h, bs.z);
  scene.add(board);
  k.boardTop = isl.h + 0.03;
  k.boardCenter = new THREE.Vector3(bs.x, k.boardTop, bs.z);
  tag(board, 'board');
  k.stations.board = [board];

  // миска
  const bw = LAYOUT.stations.bowl.anchor;
  const bowlPts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    bowlPts.push(new THREE.Vector2(0.06 + Math.sin(t * Math.PI * 0.5) * 0.15, t * 0.14));
  }
  const bowlMesh = new THREE.Mesh(
    new THREE.LatheGeometry(bowlPts, 32),
    new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, side: THREE.DoubleSide, depthWrite: false }),
  );
  const bowl = new THREE.Group();
  bowl.add(bowlMesh);
  const bowlRim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.008, 6, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  bowlRim.rotation.x = Math.PI / 2;
  bowlRim.position.y = 0.14;
  bowl.add(bowlRim);
  const bowlContent = new THREE.Group();
  bowl.add(bowlContent);
  const spoon = new THREE.Group();
  const spoonStick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8), toon(0xd9a066));
  spoonStick.position.y = 0.15;
  spoonStick.rotation.z = 0.3;
  const spoonHead = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), toon(0xd9a066));
  spoonHead.scale.set(1, 0.4, 1.4);
  spoonHead.position.set(0.04, 0.03, 0);
  spoon.add(spoonStick, spoonHead);
  spoon.position.set(0, 0.03, 0);
  spoon.visible = false;
  bowl.add(spoon);
  bowl.position.set(bw.x, isl.h, bw.z);
  scene.add(bowl);
  // горошек и майонез рядом с миской
  const peas = new THREE.Group();
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.11, 18), toon(0xffffff, { map: tex.peasLabel }));
  jar.position.y = 0.055;
  const jarLid = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.051, 0.012, 18), metal);
  jarLid.position.y = 0.115;
  peas.add(jar, jarLid);
  peas.position.set(bw.x + 0.32, isl.h, bw.z + 0.12);
  peas.rotation.y = -0.4;
  scene.add(peas);
  const mayo = new THREE.Group();
  const pack = box(0.1, 0.13, 0.05, toon(0xffffff, { map: tex.mayoLabel }));
  pack.position.y = 0.065;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), toon(0x1f6fbf));
  cap.position.y = 0.145;
  mayo.add(pack, cap);
  mayo.position.set(bw.x + 0.3, isl.h, bw.z - 0.15);
  mayo.rotation.y = -0.3;
  scene.add(mayo);
  k.bowl = { group: bowl, content: bowlContent, spoon, peas, mayo, jarLid };
  tag(bowl, 'bowl');
  tag(peas, 'bowl');
  tag(mayo, 'bowl');
  k.stations.bowl = [bowl, peas, mayo];

  // телефон
  // Небольшое кухонное радио: корпус, решётка, шкала, ручки и индикатор.
  const rp = LAYOUT.stations.radio.anchor;
  const radio = new THREE.Group();
  const casing = box(.48,.27,.16,toon(0x9c5134));
  const face = box(.44,.23,.012,toon(0xf0ddaf)); face.position.z=.085;
  radio.add(casing,face);
  for(let i=0;i<9;i++) {
    const grill=box(.009,.15,.010,toon(0x4b392c));grill.position.set(-.17+i*.019,0,.099);radio.add(grill);
  }
  const scale=box(.12,.047,.010,toon(0x486c5b));scale.position.set(.135,.07,.10);radio.add(scale);
  const oldScale=[scale]; // в кампании шкалу заменяет RadioView (src/view/radio3d.js)
  for(let i=0;i<7;i++) {const tick=box(.002,.017,.003,toon(0xe0d89d));tick.position.set(.085+i*.015,.07,.107);radio.add(tick);oldScale.push(tick);}
  const dial=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.021,18),toon(0x4b392c));dial.rotation.x=Math.PI/2;dial.position.set(.15,-.035,.103);radio.add(dial);
  const led=new THREE.Mesh(new THREE.SphereGeometry(.010,10,8),new THREE.MeshStandardMaterial({color:0x62d48b,emissive:0x2faa64,emissiveIntensity:.8}));led.position.set(.075,-.035,.10);radio.add(led);
  const antenna=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.28,8),metal);antenna.position.set(-.16,.24,-.035);antenna.rotation.z=.25;radio.add(antenna);
  radio.position.set(rp.x,rp.y,rp.z);scene.add(radio);tag(radio,'radio');
  k.radio={group:radio,led,dial,oldScale};k.stations.radio=[radio];
  const ph = LAYOUT.stations.phone.anchor;
  const phone = new THREE.Group();
  const phBody = box(0.09, 0.012, 0.17, toon(0x222233));
  phBody.position.y = 0.006;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.155), new THREE.MeshBasicMaterial({ map: tex.phoneScreen }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.y = 0.0125;
  phone.add(phBody, screen);
  phone.position.set(ph.x, isl.h, ph.z);
  phone.rotation.y = 0.35;
  scene.add(phone);
  k.phone = { group: phone, screen };
  tag(phone, 'phone');
  k.stations.phone = [phone];

  // запасная тарелка с колбасой (цель кота)
  const plate = new THREE.Group();
  const plateMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.02, 24), toon(0xffffff));
  plateMesh.position.y = 0.01;
  plate.add(plateMesh);
  const plateSlices = [];
  for (let i = 0; i < 4; i++) {
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 16), toon(0xffffff, { map: tex.sausage }));
    sl.position.set(-0.06 + i * 0.04, 0.026 + i * 0.004, (i % 2) * 0.03 - 0.015);
    sl.rotation.z = 0.15;
    plate.add(sl);
    plateSlices.push(sl);
  }
  plate.position.set(LAYOUT.plate.x, isl.h, LAYOUT.plate.z);
  scene.add(plate);
  k.plate = { group: plate, slices: plateSlices };

  // декор на острове: свечи и ветки
  for (let i = 0; i < 2; i++) {
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 12), toon(0xd7262b));
    candle.position.set(0.2 + i * 0.07, isl.h + 0.06, 0.85);
    scene.add(candle);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
    flame.scale.set(1, 1.8, 1);
    flame.position.set(0.2 + i * 0.07, isl.h + 0.14, 0.85);
    scene.add(flame);
  }

  // кольца-подсветки станций на полу
  const ringGeo = new THREE.RingGeometry(0.2, 0.26, 40);
  for (const [id, s] of Object.entries(LAYOUT.stations)) {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x2fbf5a, transparent: true, opacity: 0.55, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.stand.x, 0.01, s.stand.z);
    ring.userData.station = id;
    scene.add(ring);
    k.rings[id] = ring;
    k.clickables.push(ring);
  }
  for (const list of Object.values(k.stations)) for (const obj of list) obj.traverse((o) => o.isMesh && k.clickables.push(o));

  return k;
}
