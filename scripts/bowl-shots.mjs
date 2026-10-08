// Миска руками: горошек, майонез, соль, проба, перемешивание — настоящей мышью (не замена e2e).
// Запуск: npx vite preview --port 4173 & PW=/opt/node-tools/node_modules/playwright/index.mjs node scripts/bowl-shots.mjs
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/d1_bowl_${n}.png` });
async function waitFor(fn, timeout = 30000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const scr = (x, z) => S(([x, z]) => window.__sueta.view.localToScreen('bowl', x, z), [x, z]);
async function path(points, { mid = null } = {}) {
  const a = await scr(...points[0]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i < points.length; i++) {
    const p = await scr(...points[i]);
    await page.mouse.move(p.x, p.y);
    await wait(25);
    if (mid && i === Math.floor(points.length * (mid.startsWith('stir') ? 0.6 : 0.3))) await shot(mid);
  }
  await page.mouse.up();
  await wait(300);
}
const circle = (r, turns, n = 28) => Array.from({ length: Math.round(n * turns) + 1 }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r]);
const chip = (t) => page.locator('#panel button', { hasText: t }).first().click();
try {
  await page.goto(url); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url); await wait(2500);
  await page.click('[data-ui=new]'); await wait(500); await page.click('[data-ui=enter]'); await wait(1500);
  // нарезанное уже в миске: настоящие кусочки 1×1 из пяти продуктов
  await S(() => {
    const s = window.__sueta.session;
    const d = s.dishes.olivier;
    for (const id of ['boil', 'boilEgg', 'carrot', 'sausage', 'cucumber', 'egg', 'potato']) d.steps[id].done = true;
    const cubes = (n) => Array.from({ length: n }, (_, i) => ({ x: i % 4, z: i >> 2, w: 0.9 + (i % 3) * 0.1, d: 1 }));
    s.bowl.owner = 'olivier';
    s.bowl.contents = [{ product: 'potato', kind: 'pieces', pieces: cubes(22) }, { product: 'carrot', kind: 'pieces', pieces: cubes(14) }, { product: 'sausage', kind: 'pieces', pieces: cubes(12) }, { product: 'cucumber', kind: 'pieces', pieces: cubes(16) }, { product: 'egg', kind: 'pieces', pieces: cubes(16) }];
    s.goTo('bowl');
  });
  await waitFor(() => window.__sueta.session.panel === 'bowl' && window.__sueta.sv.camT >= 1, 60000);
  await page.locator('#tip button').click({ timeout: 1500 }).catch(() => {});
  await wait(800); await shot('clusters');
  await chip('Горошек'); await wait(300);
  await path(circle(0.07, 1), { mid: 'peas_pouring' });
  console.log('peas', await sess("s.stepDone('olivier','peas')"));
  await chip('Майонез'); await wait(300);
  const zig = []; for (let i = 0; i <= 16; i++) zig.push([-0.08 + i * 0.01, i % 2 ? 0.03 : -0.03]);
  await path(zig, { mid: 'mayo_squeeze' });
  console.log('mayo', await sess("s.stepDone('olivier','mayo') + ':' + s.dishes.olivier.mayo"));
  await wait(400); await shot('mayo_zigzag');
  await chip('Соль');
  const target = await sess('s.dishes.olivier.season.target.salt');
  const shake = [[0, 0]]; for (let i = 0; i < target * 2; i++) shake.push([0, i % 2 ? 0 : 0.05]);
  const a = await scr(0, 0); await page.mouse.move(a.x, a.y); await page.mouse.down();
  for (const [x, z] of shake) { const p = await scr(x, z); await page.mouse.move(p.x, p.y, { steps: 3 }); await wait(260); }
  await page.mouse.up(); await wait(300);
  await shot('salt');
  console.log('salt', await sess('s.dishes.olivier.season.salt'), 'of', target);
  await chip('Перец');
  const pt = await sess('s.dishes.olivier.season.target.pepper');
  await page.mouse.down();
  for (let i = 0; i < pt * 2; i++) { const p = await scr(0, i % 2 ? 0 : 0.05); await page.mouse.move(p.x, p.y, { steps: 3 }); await wait(260); }
  await page.mouse.up(); await wait(300);
  await chip('Попробовать'); await waitFor(() => !window.__sueta.session.action); await wait(300);
  await shot('taste');
  console.log('taste', await sess('s.dishes.olivier.season.last?.verdict'));
  await chip('Вкус готов'); await waitFor(() => !window.__sueta.session.action); await wait(500);
  await chip('Ложка').catch(() => {});
  await path(circle(0.08, 2.2), { mid: 'stir_half' });
  console.log('mix turns', await sess('s.mixTurns()'));
  await shot('stir_more');
  await path(circle(0.08, 2.2));
  console.log('done', await sess('s.dishes.olivier.done'));
  await wait(1500); await shot('done');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
