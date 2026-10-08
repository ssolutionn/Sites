// Снимки доски кампании: настоящие росчерки мышью по продуктам (не замена e2e).
// Запуск: npx vite preview --port 4173 & PW=/opt/node-tools/node_modules/playwright/index.mjs node scripts/board-shots.mjs
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
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
async function waitFor(fn, timeout = 30000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const scr = (x, z) => S(([x, z]) => window.__sueta.view.localToScreen('board', x * 0.042, z * 0.042), [x, z]);
// Росчерк мышью в единицах доски; pause — снимок посреди движения.
async function slash(x0, z0, x1, z1, { steps = 12, mid = null } = {}) {
  const a = await scr(x0, z0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= steps; k++) {
    const p = await scr(x0 + ((x1 - x0) * k) / steps, z0 + ((z1 - z0) * k) / steps);
    await page.mouse.move(p.x, p.y);
    await wait(30);
    if (mid && k === Math.round(steps * 0.6)) { await wait(200); await shot(mid); }
  }
  await page.mouse.up();
  await waitFor(() => !window.__sueta.session.action);
  await wait(250);
}
const log = (...a) => console.log(...a);
try {
  await page.goto(url + '?dev&seed=5'); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url + '?dev&seed=5'); await wait(2000);
  await page.click('[data-ui=new]'); await wait(400); await page.click('[data-ui=enter]'); await wait(1500);
  await S(() => window.__sueta.session.goTo('board'));
  await waitFor(() => window.__sueta.session.panel === 'board' && window.__sueta.sv.camT >= 1, 60000);
  await S(() => window.__sueta.session.boardSelect('olivier:carrot'));
  await wait(1200);
  await shot('d1_board_tutorial');
  await page.locator('button', { hasText: 'Понятно' }).first().click().catch(() => {});
  await wait(1200);
  await shot('d1_board_carrot_whole');
  // полоски сверху вниз через обе морковки
  await slash(-1, -3.2, -1, 3.2, { mid: 'd1_board_knife_drag' });
  await slash(0, -3.2, 0, 3.2);
  await slash(1, -3.2, 1, 3.2);
  await shot('d1_board_carrot_strips');
  // кривой росчерк — подсказка
  await slash(-2, -2, 2, 2);
  await wait(100);
  await shot('d1_board_diagonal_hint');
  log('hint', await sess('s.hint?.text'));
  // поперёк — кубики
  for (const z of [-2.35, -1.35, 0.35, 1.35]) await slash(-2.8, z, 2.8, z);
  await wait(800);
  await shot('d1_board_carrot_cubes');
  log('carrot', JSON.stringify(await sess('({ pieces: s.boardCur().pieces.length, q: s.boardQuality(s.boardCur()) })')));
  // яйца и картофель: сразу «сварены и остыли»
  await S(() => { const s = window.__sueta.session; s.dishes.olivier.steps.boilEgg.done = true; s.dishes.olivier.steps.boil.done = true; s.hot = {}; });
  await S(() => window.__sueta.session.boardSelect('olivier:egg'));
  await wait(1500);
  await shot('d1_board_egg_whole');
  await slash(0, -3.6, 0, 3.6);
  await slash(-2.6, -1.85, 2.6, -1.85);
  await slash(-2.6, 1.85, 2.6, 1.85);
  await wait(800);
  await shot('d1_board_egg_yolk');
  await S(() => window.__sueta.session.boardSelect('olivier:sausage'));
  await wait(1200);
  await slash(-0.5, -2, -0.5, 2); await slash(0.5, -2, 0.5, 2); await slash(-2, 0, 2, 0);
  await wait(800);
  await shot('d1_board_sausage');
  await S(() => window.__sueta.session.boardSelect('olivier:cucumber'));
  await wait(1200);
  await slash(0, -3, 0, 3); await slash(-1.5, -3, -1.5, 3); await slash(-3, -1.35, 3, -1.35);
  await wait(800);
  await shot('d1_board_cucumber');
  await S(() => window.__sueta.session.boardSelect('olivier:potato'));
  await wait(1200);
  await slash(0, -4, 0, 4); await slash(-3, -1.85, 3, -1.85);
  await wait(800);
  await shot('d1_board_potato');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('board_error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
