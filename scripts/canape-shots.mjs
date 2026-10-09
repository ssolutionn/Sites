// Канапе как в жизни мышью: хлеб на место → сыр, колбаса, огурец сверху → шпажка сверху вниз.
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const T0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - T0) / 1000).toFixed(0)}s`, ...a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v7_canape_${n}.png`, timeout: 90000 }).catch((e) => log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const scr = (x, z) => S(([x, z]) => window.__sueta.view.localToScreen('tray', x, z), [x, z]);
async function drag(pts, steps = 3) {
  let p = await scr(...pts[0]);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (const q of pts.slice(1)) { p = await scr(...q); await page.mouse.move(p.x, p.y, { steps }); await wait(40); }
  await page.mouse.up(); await wait(200);
}
const P = { bread: [-0.2, 0.115], cheese: [-0.07, 0.115], sausage: [0.06, 0.115], cucumber: [0.19, 0.115] };
try {
  await page.goto(url, { timeout: 180000 }); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url, { timeout: 180000 }); await wait(2500);
  // дни 1–5 пройдены — сразу день 6
  await S(() => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < 5) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[5].unlocked = true; sv.write(); });
  await page.reload({ timeout: 180000 }); await wait(2500);
  const next = (await page.locator('[data-ui=nextDay]').count()) ? '[data-ui=nextDay]' : '[data-ui=continue]';
  await S((sel) => document.querySelector(sel).click(), next); await wait(800);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=enter]').click()); await wait(1500);
  log('day', await sess('s.dayIndex + 1'));
  // продукты нарезаны заранее — проверяем только сборку
  await S(() => { const s = window.__sueta.session; const d = s.dishes.canape; for (const id of ['bread', 'cheese', 'sausage', 'cucumber']) { d.steps[id].done = true; d.pieces[id] = Array.from({ length: 10 }, (_, i) => ({ id: 900 + i, product: id, used: false, w: 2.5, d: 2.5 })); } s.goTo('tray'); });
  await waitFor(() => window.__sueta.session.panel === 'tray' && window.__sueta.sv.camT >= 1);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
  await S(() => document.querySelector('button[data-act="traySelect"][data-args*="canape"]').click()); await wait(1200);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
  await shot('empty');
  const st = await sess('s.dishes.canape.work.stacks.map(b => [b.x, b.z])');
  await drag([P.cheese, st[0]]);
  log('cheese first:', await sess('s.dishes.canape.work.stacks[0].pieces.length'), await sess('s.hint?.text'));
  await shot('bread_first_hint');
  for (let i = 0; i < 8; i++) {
    for (const p of ['bread', 'cheese', 'sausage', 'cucumber']) await drag([P[p], st[i]]);
    if (i === 1) await shot('two_stacks');
  }
  log('stacks', await sess("s.dishes.canape.work.stacks.map(b => b.pieces.map(p => p.product[0]).join('')).join(' ')"));
  await shot('stacks_ready');
  await S(() => document.querySelector('button[data-act="setTool"][data-args*="skewer"]').click()); await wait(400);
  // прокол: зажать над стопкой и протянуть вниз; середина — снимок
  let p = await scr(st[0][0], st[0][1] - 0.005);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  p = await scr(st[0][0], st[0][1] + 0.025); await page.mouse.move(p.x, p.y, { steps: 3 }); await wait(500);
  await shot('pierce_mid');
  p = await scr(st[0][0], st[0][1] + 0.06); await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.up(); await wait(300);
  for (let i = 1; i < 8; i++) await drag([[st[i][0], st[i][1] - 0.005], [st[i][0], st[i][1] + 0.03], [st[i][0], st[i][1] + 0.06]]);
  log('pierced', await sess('s.dishes.canape.work.stacks.filter(b => b.pierced).length'), 'step', await sess("s.stepDone('canape','skewers')"));
  await wait(800); await shot('done');
  await S(() => document.querySelector('button[data-act="confirmDish"]')?.click()); await wait(1000);
  log('parts', JSON.stringify(await sess('s.dishes.canape.parts')));
} catch (e) { log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
