// 0.11, ёлка: голая на старте, игрушки в любых местах мышью, мишура мышью, подарок и базар целы, кот уронил ёлку и подъём жестом.
//   npx vite preview --port 4182 --strictPort --host 127.0.0.1
//   PW=/opt/node-tools/node_modules/playwright/index.mjs OUT=production/qa/evidence node scripts/v11-tree-shots.mjs http://127.0.0.1:4182/ bare,hang,tinsel,gift,fall
// Код выхода 1 при провале. Снимки: v11_tree_*.png.
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4182/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v11_tree_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);
const closeTip = () => page.locator('#tip button').click({ timeout: 800 }).catch(() => {});

/** Открыть день n (1..7) с чистым сохранением; прошлые дни пройдены; keep — поля сохранения. */
async function openDay(n, keep = null) {
  await page.goto(url, { timeout: 180000 }); await wait(800);
  await S(() => localStorage.clear());
  await page.goto(url, { timeout: 180000 });
  errs.length = 0;
  await waitFor(() => !!window.__sueta?.save, 120000);
  await S(([n, keep]) => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < n - 1) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[n - 1].unlocked = true; if (keep) Object.assign(sv.data, keep); sv.write(); }, [n, keep]);
  await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(800);
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(600);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=enter]').click());
  await waitFor(() => window.__sueta.mode === 'kitchen', 60000); await wait(800);
}
async function station(st, cam = 'c-tree') {
  await S((st) => window.__sueta.session.goTo(st), st);
  // под нагрузкой SwiftShader кадр идёт секундами — ждём дольше обычного
  const ok = await waitFor(([st, cam]) => window.__sueta.session.panel === st && window.__sueta.sv.camMode === cam && window.__sueta.sv.camT >= 1, 300000, [st, cam]);
  if (!ok) console.log('WARN камера не дошла до', cam, await S(() => JSON.stringify({ p: window.__sueta.session.panel, m: window.__sueta.sv.camMode, t: window.__sueta.sv.camT })));
}
/** Точка ёлки на экране около доли (fx, fy) холста: { x, y (пиксели), p (точка ёлки) } — ближайшая, куда попадает луч. */
const hitAt = (fx, fy) => S(([fx, fy]) => {
  const c = document.querySelector('#scene').getBoundingClientRect();
  const { view } = window.__sueta;
  for (let r = 0; r < 120; r += 4) for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const x = c.left + c.width * fx + dx, y = c.top + c.height * fy + dy;
    const h = view.tree.hit({ x: ((x - c.left) / c.width) * 2 - 1, y: -((y - c.top) / c.height) * 2 + 1 });
    if (h) return { x, y, p: h.p };
  }
  return null;
}, [fx, fy]);
const dragToyTo = async (q) => {
  const chip = await page.locator('#panel [data-drag-toy]').first().boundingBox();
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2);
  await page.mouse.down();
  await page.mouse.move((chip.x + q.x) / 2, (chip.y + q.y) / 2, { steps: 4 });
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await wait(250);
};
const near = (a, b, d = 0.02) => !!a && !!b && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= d;

try {
  if (want('bare')) {
    // новая игра: ёлка голая, звезда и гирлянда на месте
    await openDay(1);
    await closeTip();
    await station('tree');
    await wait(1000);
    await closeTip();
    check('на старте на ёлке нет игрушек и мишуры', await sess('s.toys.length === 0 && s.tinsel.threads.length === 0'));
    check('в доке «на ёлке 0»', await S(() => /на ёлке 0/.test(document.querySelector('#panel h2')?.textContent ?? '')), await S(() => document.querySelector('#panel h2')?.textContent));
    check('нет «из 18»', await S(() => !/из 18/.test(document.querySelector('#panel')?.textContent ?? '')));
    check('в сохранении ёлка пуста', await S(() => window.__sueta.save.data.toys.length === 0));
    await shot('bare');
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('hang')) {
    // три игрушки в произвольных местах: зажать в коробке, донести до ёлки, отпустить; тесно — отказ; перевесить; снять мимо
    await openDay(2, { toys: [{ id: 'ballRed', at: null }, { id: 'cone', at: null }, { id: 'bell', at: null }, { id: 'santa', at: null }] });
    await closeTip();
    await station('tree');
    await wait(1000);
    await closeTip();
    const targets = [[0.5, 0.42], [0.43, 0.6], [0.58, 0.72]];
    const placed = [];
    for (const [fx, fy] of targets) {
      const q = await hitAt(fx, fy);
      check(`луч попадает в ёлку около (${fx}, ${fy})`, !!q);
      await dragToyTo(q);
      if (placed.length === 0) {
        check('пока тянешь — призрак игрушки под курсором', await S(() => !!window.__sueta.view.tree.ghost?.visible));
        check('точек-«слотов» больше нет', await S(() => window.__sueta.view.slotDots === undefined));
        await shot('drag');
      }
      await page.mouse.up();
      await wait(300);
      placed.push(q.p);
    }
    const hung = await sess('s.toys.filter((t) => t.at).map((t) => t.at)');
    check('повешено три игрушки', hung.length === 3, `${hung.length}`);
    check('каждая — в той точке, куда отпустили (±1 см)', placed.every((p) => hung.some((h) => near(h, p, 0.011))), JSON.stringify([placed, hung]));
    // сохранение и док обновляются на следующем кадре (в SwiftShader он долгий) — ждём условие, а не время
    check('в сохранении те же точки', await waitFor((n) => window.__sueta.save.data.toys.filter((t) => t.at).length === n, 30000, 3));
    check('счётчик «на ёлке 3»', await waitFor(() => /на ёлке 3/.test(document.querySelector('#panel h2')?.textContent ?? ''), 30000));
    await wait(2800);
    await shot('hung');
    // тесно: отпустить вплотную к уже висящей — игрушка возвращается в коробку
    const t0 = await S((p) => window.__sueta.view.tree.pointScreen(p), hung[0]);
    await dragToyTo({ x: t0.x + 6, y: t0.y + 4 });
    await page.mouse.up();
    await wait(400);
    check('вплотную к соседней — отказ, игрушка в коробке', (await sess('s.toys.filter((t) => t.at).length')) === 3 && (await sess('s.treeHand === null && s.toysInBox().length === 1')));
    check('подсказка про тесноту', await sess('/тесно/.test(s.hint?.text ?? "")'), await sess('s.hint?.text'));
    // перевесить: зажать висящую и отпустить в другом месте
    const from = await S((p) => window.__sueta.view.tree.pointScreen(p), hung[1]);
    const to = await hitAt(0.62, 0.52);
    // целимся в саму игрушку: центр её меша на экране (точка «ниже крючка по поверхности» у игрушки сбоку уезжает мимо)
    const toyPx = await S((p) => {
      const s = window.__sueta.session, T = window.__sueta.view.tree;
      const toy = s.toys.find((t) => t.at && Math.hypot(t.at.x - p.x, t.at.y - p.y, t.at.z - p.z) < 1e-6);
      const m = T.meshes.get(toy.uid);
      const box = new (window.__sueta.sv.camera.position.constructor)();
      m.updateMatrixWorld(true);
      const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      m.traverse((o) => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); const g = o.geometry.boundingBox; for (const x of [g.min.x, g.max.x]) for (const y of [g.min.y, g.max.y]) for (const z of [g.min.z, g.max.z]) { box.set(x, y, z).applyMatrix4(o.matrixWorld); ['x', 'y', 'z'].forEach((k, i) => { b.min[i] = Math.min(b.min[i], box[k]); b.max[i] = Math.max(b.max[i], box[k]); }); } });
      box.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2).project(window.__sueta.sv.camera);
      const c = document.querySelector('#scene').getBoundingClientRect();
      return { x: c.left + (box.x * 0.5 + 0.5) * c.width, y: c.top + (-box.y * 0.5 + 0.5) * c.height };
    }, hung[1]);
    await page.mouse.move(toyPx.x, toyPx.y);
    await wait(600);
    const pickInfo = await S((q) => { const c = document.querySelector('#scene').getBoundingClientRect(); const T = window.__sueta.view.tree; return JSON.stringify({ toyAt: T.toyAt({ x: ((q.x - c.left) / c.width) * 2 - 1, y: -((q.y - c.top) / c.height) * 2 + 1 }), anim: [...T.anim.keys()], hover: T.hoverToy, hand: window.__sueta.session.treeHand, tool: window.__sueta.session.tinsel.tool }); }, toyPx);
    await page.mouse.down();
    await waitFor(() => window.__sueta.session.treeHand != null, 15000);
    console.log('перевес: под курсором', pickInfo, 'в руке после нажатия', await sess('s.treeHand'));
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    await waitFor((p) => window.__sueta.session.toys.some((t) => t.at && Math.hypot(t.at.x - p.x, t.at.y - p.y, t.at.z - p.z) < 0.011), 15000, to.p);
    const moved = await sess('s.toys.filter((t) => t.at).map((t) => t.at)');
    check('перевесила висящую игрушку в другое место', moved.length === 3 && moved.some((m) => near(m, to.p, 0.011)) && !moved.some((m) => near(m, hung[1], 0.011)), JSON.stringify(moved));
    void from;
    // отпустить мимо ёлки с висящей в руке: вернётся на своё место
    const toy2 = await S((p) => window.__sueta.view.tree.pointScreen({ x: p.x, y: p.y - 0.1, z: p.z }), moved[0]);
    await page.mouse.move(toy2.x, toy2.y);
    await page.mouse.down();
    await page.mouse.move(80, 300, { steps: 6 });
    await page.mouse.up();
    await wait(400);
    const after = await sess('s.toys.filter((t) => t.at).map((t) => t.at)');
    check('мимо ёлки — игрушка вернулась на прежнее место', after.length === 3 && after.some((a) => near(a, moved[0], 0.011)));
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('tinsel')) {
    // мишура мышью: купить в базаре за очки, взять моток, зажать на ёлке и вести, отпустить; снять ножницами
    await openDay(2, { bonus: 300 });
    await closeTip();
    await S(() => { const s = window.__sueta.session; s.bonus.banked = s.bonus.points; });
    await station('phone', 'c-overview');
    await closeTip();
    await page.locator('#phone [data-nav="bazaar"]').first().click();
    await waitFor(() => !!document.querySelector('#phone .bazaar'), 20000);
    check('в базаре есть раздел «Мишура» с четырьмя мотками', await S(() => document.querySelectorAll('#phone .toy-set:last-of-type .decor').length === 4), await S(() => document.querySelector('#phone .toy-set:last-of-type h4')?.textContent));
    await wait(900);
    await shot('bazaar_tinsel');
    const before = await sess('s.bonus.points');
    await page.locator('#phone .toy-set:last-of-type .decor button').first().click();
    await waitFor((n) => window.__sueta.session.bonus.points < n, 20000, before);
    check('купила моток золотой мишуры за очки', (await sess('s.tinselLeft("gold")')) === 2 && (await sess('s.bonus.points')) < before, await sess('s.bonus.points'));
    check('покупка в сохранении (моток и очки)', await waitFor(() => window.__sueta.save.data.tinselRolls?.gold === 2 && window.__sueta.save.data.bonus < 300, 30000));
    await page.locator('#phone .toy-set:last-of-type .decor button').nth(2).click(); await wait(300);
    await S(() => window.__sueta.session.closePanel()); await wait(600);
    await station('tree');
    await wait(1000);
    await closeTip();
    check('в доке моточки: золото и красная', await S(() => document.querySelectorAll('#panel .tinsel-chip').length >= 2));
    await page.locator('#panel .tinsel-chip').first().click();
    await wait(300);
    check('моток в руке', await sess('s.tinsel.tool === "gold"'));
    // нитка по ёлке: туда-сюда змейкой
    const path = [];
    for (let i = 0; i <= 14; i++) path.push(await hitAt(0.5 + 0.09 * Math.sin(i * 0.9), 0.38 + i * 0.022));
    check('все точки пути на ёлке', path.every(Boolean));
    await page.mouse.move(path[0].x, path[0].y);
    await page.mouse.down();
    // моток 2 м кончается раньше конца змейки — «растёт» проверяем на середине пути
    for (const q of path.slice(1, 6)) await page.mouse.move(q.x, q.y, { steps: 3 });
    check('пока ведёшь — нитка растёт', await waitFor(() => window.__sueta.session.tinsel.draw?.thread.pts.length > 5, 15000), await sess('s.tinsel.draw?.thread.pts.length'));
    for (const q of path.slice(6)) await page.mouse.move(q.x, q.y, { steps: 3 });
    await wait(300);
    await shot('tinsel_drawing');
    await page.mouse.up();
    await wait(400);
    const th = await sess('s.tinsel.threads.map((t) => ({ n: t.pts.length, len: s.tinselLength(t.id) }))');
    check('отпустила — нитка закончилась и осталась на ёлке', th.length === 1 && th[0].n >= 8 && (await sess('s.tinsel.draw === null')), JSON.stringify(th));
    const left = await sess('s.tinselLeft("gold")');
    check('длина списана с мотка', Math.abs(left - (2 - th[0].len)) < 0.005, `${left} + ${th[0].len}`);
    check('точки нитки не ближе 3 см', await sess('s.tinsel.threads[0].pts.every((p, i, a) => i === 0 || Math.hypot(p.x - a[i-1].x, p.y - a[i-1].y, p.z - a[i-1].z) >= 0.0299)'));
    check('нитка в сохранении', await S(() => window.__sueta.save.data.tinsel.length === 1 && window.__sueta.save.data.tinselRolls.gold < 2));
    // красная нитка и игрушка рядом: всё вместе
    await S(() => window.__sueta.session._addToy('ballBlue'));
    await wait(300);
    await page.locator('#panel .tinsel-chip', { hasText: /м/ }).nth(1).click();
    const p2 = [];
    for (let i = 0; i <= 10; i++) p2.push(await hitAt(0.56 - 0.1 * Math.sin(i * 0.7), 0.52 + i * 0.02));
    await page.mouse.move(p2[0].x, p2[0].y); await page.mouse.down();
    for (const q of p2.slice(1)) await page.mouse.move(q.x, q.y, { steps: 3 });
    await page.mouse.up();
    await wait(300);
    check('вторая нитка другого цвета', (await sess('s.tinsel.threads.length')) === 2 && (await sess('s.tinsel.threads[1].color')) !== (await sess('s.tinsel.threads[0].color')), await sess('s.tinsel.threads.map((t) => t.color).join()'));
    await wait(500);
    await shot('tinsel_two');
    check('не больше двух вызовов отрисовки на нитку', await S(() => window.__sueta.view.tree.tinsel.drawCalls() <= 2 * window.__sueta.session.tinsel.threads.length));
    // снять: ножницы, клик по нитке
    await page.locator('#panel .tinsel-chip', { hasText: 'Снять' }).click();
    await wait(300);
    const mid = await S(() => { const s = window.__sueta.session, v = window.__sueta.view.tree; const th = s.tinsel.threads[0]; const p = th.pts[Math.floor(th.pts.length / 2)]; return { px: v.pointScreen(p), id: th.id, len: s.tinselLength(th.id), left: s.tinselLeft(th.color) }; });
    await page.mouse.move(mid.px.x, mid.px.y); await wait(250);
    check('над ниткой «ножницы» подсвечивают её', await S(() => window.__sueta.view.tree.hoverThread != null));
    await page.mouse.click(mid.px.x, mid.px.y);
    await wait(400);
    check('снятая нитка вернула длину в моток', (await sess('s.tinsel.threads.length')) === 1 && Math.abs((await sess(`s.tinselLeft("gold")`)) - (mid.left + mid.len)) < 0.005, `${await sess('s.tinselLeft("gold")')} vs ${mid.left + mid.len}`);
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('gift')) {
    // подарок и базар не сломаны: открыть подарок руками (как в v10), купить игрушку, повесить её
    await openDay(2, { bonus: 200 });
    await closeTip();
    await S(() => { const s = window.__sueta.session; s.bonus.banked = s.bonus.points; });
    await station('tree');
    await wait(800);
    await closeTip();
    check('у ёлки три подарка', await S(() => document.querySelectorAll('#panel button[data-act="startGift"]').length === 3));
    await page.locator('#panel button[data-act="startGift"]').first().click();
    await waitFor(() => { const g = window.__sueta.session.gift, sv = window.__sueta.sv; return !!g && sv.camMode === 'c-gift' + g.index && sv.camT >= 1; }, 30000);
    await wait(500);
    const L = (x, z) => S(([x, z]) => window.__sueta.view.localToScreen('tree', x, z), [x, z]);
    const G = await sess('s.cfg.gift');
    let p = await L(0, 0);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (let k = 1; k <= 8; k++) { const q = await L((G.bowPull * 1.4 * k) / 8, 0.02 * k / 8); await page.mouse.move(q.x, q.y); }
    await page.mouse.up();
    check('бант развязан жестом', await waitFor(() => window.__sueta.session.gift?.stage === 'paper', 10000));
    await page.keyboard.press('Escape'); await wait(500);
    check('Esc — подарок отложен, остались у ёлки', await sess('!s.gift && s.panel === "tree"'));
    await S(() => { window.__sueta.session.buyToy('bell'); });
    await wait(400);
    check('купленная игрушка — в коробке', await sess('s.toysInBox().length === 1'));
    const q = await hitAt(0.5, 0.5);
    await dragToyTo(q);
    await page.mouse.up();
    await wait(400);
    check('и вешается мышью', await sess('s.toys.filter((t) => t.at).length === 1'));
    await shot('gift_ok');
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('fall')) {
    // кот уронил ёлку: игрушки на полу (часть стеклянных разбилась), мишура в мотках, звезда погасла; поднять жестом; игрушки — в коробку
    await openDay(2, { toys: [{ id: 'ballRed', at: null }, { id: 'ballBlue', at: null }, { id: 'cone', at: null }, { id: 'bell', at: null }, { id: 'icicle', at: null }, { id: 'santa', at: null }] });
    await closeTip();
    await station('tree');
    await wait(900);
    await closeTip();
    for (const [fx, fy] of [[0.5, 0.42], [0.43, 0.6], [0.58, 0.7], [0.5, 0.82], [0.4, 0.5], [0.6, 0.55]]) {
      const q = await hitAt(fx, fy);
      await dragToyTo(q);
      await page.mouse.up();
      await wait(250);
    }
    await S(() => { const s = window.__sueta.session; s.addTinselRoll('red'); });
    await wait(300);
    await page.locator('#panel .tinsel-chip').first().click();
    const pth = [];
    for (let i = 0; i <= 8; i++) pth.push(await hitAt(0.5 + 0.08 * Math.cos(i), 0.36 + i * 0.03));
    await page.mouse.move(pth[0].x, pth[0].y); await page.mouse.down();
    for (const q of pth.slice(1)) await page.mouse.move(q.x, q.y, { steps: 3 });
    await page.mouse.up();
    await wait(300);
    const hungBefore = await sess('s.toys.filter((t) => t.at).length');
    check('перед падением на ёлке 6 игрушек и нитка', hungBefore === 6 && (await sess('s.tinsel.threads.length')) === 1, `${hungBefore}`);
    await shot('before_fall');
    // кот: срочное дело с таймером — дать срок истечь
    await S(() => { const s = window.__sueta.session; s.garland.broken = true; s.catNeeds.hunger = 0; s.catNeeds.boredom = 85; s.cfg.cat.mischiefWeights = { garland: 0, star: 0, toys: 0, tree: 1 }; });
    await S(() => window.__sueta.session.closePanel()); await wait(600);
    await waitFor(() => window.__sueta.session.cat.state === 'mischief', 30000);
    check('кот затеял уронить ёлку', await sess('s.cat.kind === "tree"'), await sess('s.cat.kind'));
    await wait(1200);
    await shot('cat_rocking');
    await S(() => { const s = window.__sueta.session; s.cat.deadline = s.t + 0.3; });
    await waitFor(() => window.__sueta.session.treeFall.down, 20000);
    check('ёлка упала', await sess('s.treeFall.down'));
    check('игрушки на полу или разбиты', (await sess('s.toys.filter((t) => t.fallen).length')) + (await sess('6 - s.toys.length')) === 6 && (await sess('s.toys.filter((t) => t.at).length')) === 0, await sess('JSON.stringify({ floor: s.toys.filter((t) => t.fallen).length, left: s.toys.length })'));
    check('мишура вернулась в моток', (await sess('s.tinsel.threads.length === 0 && s.tinselLeft("red") > 1.9')), await sess('s.tinselLeft("red")'));
    check('звезда погасла', await sess('s.star.broken'));
    check('после падения всё в сохранении: ёлка пуста, моток цел', await S(() => window.__sueta.save.data.toys.every((t) => !t.at) && window.__sueta.save.data.tinsel.length === 0 && window.__sueta.save.data.tinselRolls.red > 1.9));
    await station('tree', 'c-treedown');
    await wait(1800);
    await closeTip();
    check('ёлка лежит под наклоном', await S(() => window.__sueta.view.tree.ang > 60), await S(() => window.__sueta.view.tree.ang));
    await shot('fallen');
    // подъём: зажать верхушку и тянуть вверх (угол мыши вокруг основания)
    const grab = await S(() => {
      const c = document.querySelector('#scene').getBoundingClientRect(), v = window.__sueta.view.tree;
      for (let fy = 0.1; fy < 0.9; fy += 0.025) for (let fx = 0.05; fx < 0.95; fx += 0.025) {
        const x = c.left + c.width * fx, y = c.top + c.height * fy;
        const g = v.liftGrab({ x: ((x - c.left) / c.width) * 2 - 1, y: -((y - c.top) / c.height) * 2 + 1 });
        if (g?.zone === 'tip') return { x, y, angle: g.angle };
      }
      return null;
    });
    check('верхушку лежащей ёлки можно зажать', !!grab, JSON.stringify(grab));
    // середина — не берётся
    const mid = await S(() => {
      const c = document.querySelector('#scene').getBoundingClientRect(), v = window.__sueta.view.tree;
      for (let fy = 0.1; fy < 0.9; fy += 0.025) for (let fx = 0.05; fx < 0.95; fx += 0.025) {
        const x = c.left + c.width * fx, y = c.top + c.height * fy;
        const g = v.liftGrab({ x: ((x - c.left) / c.width) * 2 - 1, y: -((y - c.top) / c.height) * 2 + 1 });
        if (g && g.zone === null && v.hoverFloor == null) return { x, y };
      }
      return null;
    });
    if (mid) {
      await page.mouse.move(mid.x, mid.y); await page.mouse.down(); await page.mouse.up(); await wait(200);
      check('за середину не взяться — подсказка', await sess('/ствол/.test(s.hint?.text ?? "")'), await sess('s.hint?.text'));
    }
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await wait(200);
    check('жест подъёма начат', await sess('s.treeFall.grab != null'));
    // тянем вверх по экрану: наклон должен уменьшаться
    const tilts = [];
    for (let k = 1; k <= 10; k++) {
      await page.mouse.move(grab.x - k * 12, grab.y - k * 28, { steps: 2 });
      await wait(120);
      tilts.push(await sess('s.treeFall.tilt'));
      if (!(await sess('s.treeFall.down'))) break;
    }
    check('наклон уменьшается за мышью', tilts[tilts.length - 1] < tilts[0] && tilts[0] < 75, tilts.map((t) => t.toFixed(0)).join(','));
    await page.mouse.up();
    await wait(500);
    const tiltAfter = await sess('s.treeFall.tilt');
    check('отпустила — ёлка осталась, где была', Math.abs(tiltAfter - tilts[tilts.length - 1]) < 0.01 || !(await sess('s.treeFall.down')), `${tiltAfter}`);
    await shot('lifting');
    // донести до конца
    if (await sess('s.treeFall.down')) {
      const g2 = await S(() => { const v = window.__sueta.view.tree; const s = window.__sueta.session; return null; });
      void g2;
      const top = await S(() => {
        const c = document.querySelector('#scene').getBoundingClientRect(), v = window.__sueta.view.tree;
        for (let fy = 0.05; fy < 0.9; fy += 0.025) for (let fx = 0.05; fx < 0.95; fx += 0.025) {
          const x = c.left + c.width * fx, y = c.top + c.height * fy;
          const g = v.liftGrab({ x: ((x - c.left) / c.width) * 2 - 1, y: -((y - c.top) / c.height) * 2 + 1 });
          if (g?.zone) return { x, y };
        }
        return null;
      });
      await page.mouse.move(top.x, top.y); await page.mouse.down();
      for (let k = 1; k <= 24 && (await sess('s.treeFall.down')); k++) { await page.mouse.move(top.x - k * 6, top.y - k * 24, { steps: 2 }); await wait(80); }
      await page.mouse.up();
    }
    await waitFor(() => !window.__sueta.session.treeFall.down, 10000);
    check('ёлка снова стоит', await sess('!s.treeFall.down'));
    await waitFor(() => window.__sueta.sv.camMode === 'c-tree' && window.__sueta.sv.camT >= 1, 20000);
    await wait(1500);
    await shot('stands_toys_floor');
    // игрушки с пола: клик по каждой — в коробку
    const floorN = await sess('s.toysOnFloor().length');
    check('на полу остались игрушки', floorN >= 1, `${floorN}`);
    for (let guard = 0; guard < 8 && (await sess('s.toysOnFloor().length')) > 0; guard++) {
      const px = await S(() => {
        const c = document.querySelector('#scene').getBoundingClientRect(), v = window.__sueta.view.tree, s = window.__sueta.session;
        const t = s.toysOnFloor()[0];
        const m = v.meshes.get(t.uid);
        const w = m.getWorldPosition(new m.position.constructor());
        w.project(window.__sueta.sv.camera);
        return { x: c.left + ((w.x + 1) / 2) * c.width, y: c.top + ((1 - w.y) / 2) * c.height, uid: t.uid, vis: v.floorToyAt({ x: w.x, y: w.y }) };
      });
      await page.mouse.click(px.x, px.y);
      await wait(900);
    }
    check('игрушки подобраны кликом — все в коробке', (await sess('s.toysOnFloor().length === 0')) && (await sess('s.toysInBox().length')) === floorN, await sess('s.toysOnFloor().length'));
    check('кнопки «Поднять игрушки» нет', await S(() => !/Поднять игрушки/.test(document.querySelector('#panel')?.textContent ?? '')));
    await shot('picked');
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fail++; await shot('error'); }
console.log(`итого OK ${ok} FAIL ${fail}; ошибок консоли ${errs.length}`);
await browser.close();
process.exitCode = fail || errs.length ? 1 : 0;
