// Чистка картофеля и яиц мышью + вкус по порядку «посолить → перемешать → попробовать» (не замена e2e).
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
const shot = (n) => page.screenshot({ path: `${out}/d1_${n}.png` });
async function waitFor(fn, timeout = 60000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const scr = (st, x, z) => S(([st, x, z]) => window.__sueta.view.localToScreen(st, x, z), [st, x, z]);
async function drag(st, pts, { mid = null, pause = 20 } = {}) {
  let p = await scr(st, ...pts[0]);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i < pts.length; i++) {
    p = await scr(st, ...pts[i]);
    await page.mouse.move(p.x, p.y, { steps: 2 });
    await wait(pause);
    if (mid && i === Math.floor(pts.length * 0.45)) await shot(mid);
  }
  await page.mouse.up(); await wait(300);
}
const tip = () => page.locator('#tip button').click({ timeout: 700 }).catch(() => {});
const chip = (t) => page.locator('#panel button', { hasText: t }).first().click();
async function peelZig(midName) {
  const b = await sess('(() => { const it = s.boardCur(); let a = 1e9, c = -1e9, d = 1e9, e = -1e9; for (const p of it.pieces) { a = Math.min(a, p.x); c = Math.max(c, p.x + p.w); d = Math.min(d, p.z); e = Math.max(e, p.z + p.d); } return [a, c, d, e]; })()');
  const U = 0.042;
  for (let pass = 0; pass < 4 && (await sess('!!s.boardCur()?.peel')); pass++) {
    const pts = [];
    for (let r = 0; r <= 12; r++) { const z = (b[2] + ((b[3] - b[2]) * r) / 12 + pass * 0.12) * U; pts.push([(r % 2 ? b[1] + 0.2 : b[0] - 0.2) * U, z], [(r % 2 ? b[0] - 0.2 : b[1] + 0.2) * U, z]); }
    await drag('board', pts, { mid: pass === 0 ? midName : null, pause: 10 });
  }
}
try {
  await page.goto(url); await wait(1500); log('loaded');
  await S(() => localStorage.clear()); await page.goto(url); await wait(2500);
  await page.click('[data-ui=new]'); await wait(500); await page.click('[data-ui=enter]'); await wait(1500);
  // сразу «сварено и остыло»
  await S(() => { const s = window.__sueta.session; s.dishes.olivier.steps.boil.done = true; s.dishes.olivier.steps.boilEgg.done = true; s.hot = {}; s.goTo('board'); });
  await waitFor(() => window.__sueta.session.panel === 'board' && window.__sueta.sv.camT >= 1);
  await tip();
  await chip('Картофель'); await wait(1500); await tip(); await wait(400);
  await shot('peel_potato_start'); log('potato on board');
  await peelZig('peel_potato_mid');
  await wait(800); await shot('peel_potato_done');
  log('potato peeled', await sess("s.stepDone('olivier','peelPotato')"), 'now on board:', await sess('s.boardCur()?.key'));
  await chip('Яйцо'); await wait(1500); await tip(); await wait(400);
  await shot('peel_egg_start');
  await peelZig('peel_egg_mid');
  await wait(800);
  log('egg peeled', await sess("s.stepDone('olivier','peelEgg')"));
  await chip('Огурец'); await wait(1500); await shot('pickle_whole');
  // миска: всё нарезано, порядок вкуса
  await S(() => { const s = window.__sueta.session; const d = s.dishes.olivier; for (const st of d.recipe.steps) if (!['season', 'mix', 'taste'].includes(st.id)) d.steps[st.id].done = true; const cubes = (n) => Array.from({ length: n }, (_, i) => ({ x: i % 4, z: i >> 2, w: 1, d: 1 })); s.board.items = {}; s.board.current = null; s.bowl.owner = 'olivier'; s.bowl.contents = ['potato', 'carrot', 'sausage', 'pickle', 'egg'].map((p) => ({ product: p, kind: 'pieces', pieces: cubes(16) })).concat([{ product: 'peas', kind: 'add' }, { product: 'mayo', kind: 'add' }]); s.goTo('bowl'); });
  await waitFor(() => window.__sueta.session.panel === 'bowl' && window.__sueta.sv.camT >= 1);
  await tip(); await wait(400);
  await shot('bowl_spice');
  log('phase', await sess("s.seasonState('olivier').phase"));
  await chip('Соль');
  const salt = [[0, 0]]; for (let i = 0; i < 4; i++) salt.push([0, i % 2 ? 0 : 0.05]);
  let p = await scr('bowl', 0, 0); await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (const [x, z] of salt.slice(1)) { p = await scr('bowl', x, z); await page.mouse.move(p.x, p.y, { steps: 3 }); await wait(280); }
  await page.mouse.up(); await wait(300);
  await chip('Посолено'); await wait(400);
  const circle = (turns) => Array.from({ length: Math.round(28 * turns) + 1 }, (_, i) => [Math.cos((i / 28) * Math.PI * 2) * 0.08, Math.sin((i / 28) * Math.PI * 2) * 0.08]);
  await drag('bowl', circle(4.3), { pause: 5 });
  log('phase after mix', await sess("s.seasonState('olivier').phase"));
  await shot('bowl_taste_phase');
  await chip('Попробовать'); await waitFor(() => !window.__sueta.session.action); await wait(300);
  await shot('bowl_tasted');
  log('verdict', await sess('s.dishes.olivier.season.last?.verdict'));
} catch (e) { log('ERR', e.message.split('\n')[0]); await shot('peel_error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
