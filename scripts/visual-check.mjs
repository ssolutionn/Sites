// Прицельные снимки визуальных состояний на свежей сборке (не замена e2e).
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.env.OUT || 'scripts/shots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
async function waitFor(fn, timeout = 20000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
async function local(x, z) { return S(([x, z]) => window.__sueta.view.localToScreen(window.__sueta.session.panel, x, z), [x, z]); }
async function click(x, z) { const p = await local(x, z); await page.mouse.move(p.x, p.y); await wait(40); await page.mouse.down(); await page.mouse.up(); }
async function btn(t) { await page.locator('#panel button:not([disabled])', { hasText: t }).first().click(); await wait(200); }
async function openPanel(id) {
  await S((id) => { const s = window.__sueta.session; s.goTo(id); }, id);
  await waitFor((id) => window.__sueta.session.panel === id && window.__sueta.sv.camT >= 1, 60000, id);
  await wait(500);
}
async function day(i) {
  await page.goto(url + '?dev&seed=5'); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url + '?dev&seed=5'); await wait(2000);
  await page.click('[data-ui=new]'); await wait(300); await page.click('[data-ui=enter]'); await wait(800);
  await page.locator('[data-d=unlock]').click(); await wait(300);
  await page.keyboard.press('Escape'); await wait(300);
  await page.click('[data-ui=menu]'); await wait(300);
  await page.click('[data-ui=journal]'); await wait(300);
  await page.click(`[data-ui=day][data-arg="${i}"]`); await wait(300);
  await page.click('[data-ui=enter]'); await wait(1000);
}
try {
  // День 3: икра на бутербродах
  if (!process.env.SKIP3) {
  await day(2);
  await S(() => { const s = window.__sueta.session; s.inventory.add('caviar', 2); s.events = []; s.triggers = []; });
  await openPanel('tray');
  await btn('Бутерброды');
  const breads = await sess('s.dishes.sandwiches.work.breads.map(b => ({x:b.x,z:b.z}))');
  await S(() => { const s = window.__sueta.session; for (const b of s.dishes.sandwiches.work.breads) b.mask.fill(1); if (!s.stepDone('sandwiches','spread')) s._completeStep('sandwiches','spread',1); });
  await btn('Ложка');
  for (const b of breads) { await click(b.x, b.z); await wait(80); await click(b.x, b.z); await wait(80); }
  await wait(600); await shot('v_d3_caviar');
  console.log('caviar dose', JSON.stringify(await sess('s.dishes.sandwiches.work.breads.map(b => b.doses)')));
  }
  // День 4: пустые тарталетки, помидоры
  await day(3);
  await S(() => { window.__sueta.session.triggers = []; });
  await openPanel('tray');
  await btn('Тарталетки'); await wait(500); await shot('v_d4_tartlets_empty');
  await S(() => { window.__sueta.session.tray.owner = null; }); await btn('Помидоры'); await btn('Нож');
  const toms = await sess('s.dishes.tomatoes.work.toms.map(t => ({x:t.x,z:t.z}))');
  await click(toms[0].x, toms[0].z - 0.01); await waitFor(() => !window.__sueta.session.action, 15000);
  await click(toms[1].x, toms[1].z - 0.01); await waitFor(() => !window.__sueta.session.action, 15000);
  await btn('Ложка');
  const t = toms[1]; const p0 = await local(t.x + 0.02, t.z); await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  for (let k = 0; k < 30; k++) { const p = await local(t.x + Math.cos(k * 0.7) * 0.02, t.z + Math.sin(k * 0.7) * 0.02); await page.mouse.move(p.x, p.y, { steps: 2 }); }
  await page.mouse.up(); await wait(600);
  await shot('v_d4_tomatoes_cut');
  console.log('toms', JSON.stringify(await sess('s.dishes.tomatoes.work.toms.map(t => ({cap:t.cap, core:t.core}))')));
  // тёрка
  await page.locator('#panel button', { hasText: 'Назад' }).first().click(); await wait(500);
  await openPanel('board');
  await btn('Сыр');
  const p1 = await local(0, 0.05); await page.mouse.move(p1.x, p1.y); await page.mouse.down();
  for (let i = 0; i < 4; i++) { for (const z of [-0.05, 0.05]) { const p = await local(0, z); await page.mouse.move(p.x, p.y, { steps: 3 }); } }
  await shot('v_d4_grater_mid'); await page.mouse.up(); await wait(400);
  console.log('grate', JSON.stringify(await sess('s.boardCur().grater')));
} catch (e) { console.log('ERR', e.message); await shot('v_error'); }
console.log('pageerrors', errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
