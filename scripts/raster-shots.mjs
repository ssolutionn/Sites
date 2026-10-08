// Нарезка по сетке мышью: прямые росчерки, поворот доски A/D, рубка зигзагом, кривой росчерк; плита с двумя кастрюлями.
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
const shot = (n) => page.screenshot({ path: `${out}/v7_${n}.png` });
async function waitFor(fn, timeout = 60000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const U = 0.021;
// точка в системе продукта (u) → экран, с учётом поворота доски
const scr = (x, z) => S(([x, z, U]) => { const s = window.__sueta.session, it = s.boardCur(), a = it?.angle ?? 0; const X = x * Math.cos(a) + z * Math.sin(a), Z = -x * Math.sin(a) + z * Math.cos(a); return window.__sueta.view.localToScreen('board', X * U, Z * U); }, [x, z, U]);
async function stroke(pts, steps = 3) {
  let p = await scr(...pts[0]);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (const q of pts.slice(1)) { p = await scr(...q); await page.mouse.move(p.x, p.y, { steps }); }
  await page.mouse.up(); await wait(250);
}
const tip = () => page.locator('#tip button').click({ timeout: 700 }).catch(() => {});
const info = () => sess("(() => { const it = s.boardCur(); const q = s.boardQuality(it); return { pieces: it.pieces.length, neat: q.neat, score: +q.score.toFixed(2), angle: +(it.angle ?? 0).toFixed(2) }; })()");
try {
  await page.goto(url); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url); await wait(2500);
  await page.click('[data-ui=new]'); await wait(500); await page.click('[data-ui=enter]'); await wait(1500);
  log('loaded');
  // плита: две кастрюли сразу
  await S(() => { const s = window.__sueta.session; s.goTo('stove'); });
  await waitFor(() => window.__sueta.session.panel === 'stove' && window.__sueta.sv.camT >= 1);
  await tip();
  await page.locator('button[data-act="placePot"]').first().click(); await waitFor(() => !window.__sueta.session.action);
  await page.locator('button[data-act="placePot"]').first().click(); await waitFor(() => !window.__sueta.session.action);
  await wait(1200); await shot('stove_two_pots');
  log('pots', await sess("s.burners.map(b => b.state + ':' + b.product).join()"));
  await S(() => window.__sueta.session.closePanel()); await wait(2500); await shot('kitchen_two_pots');
  // доска: колбаса — прямые росчерки сверху вниз
  await S(() => window.__sueta.session.goTo('board'));
  await waitFor(() => window.__sueta.session.panel === 'board' && window.__sueta.sv.camT >= 1);
  await tip();
  await page.locator('button[data-act="boardSelect"][data-args*="sausage"]').click(); await wait(1200); await tip();
  await shot('board_sausage_whole');
  for (const x of [-3, -2, -1, 0, 1, 2, 3]) await stroke([[x, -4.5], [x, -1.5], [x, 1.5], [x, 4.5]]);
  log('sausage strips', await info());
  await shot('board_sausage_strips');
  // поворот доски: тап D — четверть оборота
  await page.keyboard.down('KeyD'); await wait(60); await page.keyboard.up('KeyD');
  await waitFor(() => Math.abs(Math.abs(window.__sueta.session.boardCur().angle) - Math.PI / 2) < 0.01, 10000);
  await wait(400); await shot('board_sausage_turned');
  log('turned', await info());
  // в системе продукта полоски теперь идут поперёк ножа: режем поперёк продукта, но мышь ведём сверху вниз по экрану
  for (const z of [-2, -1, 0, 1, 2]) await stroke([[-4.6, z], [-1.5, z], [1.5, z], [4.6, z]]);
  log('sausage cubes', await info());
  await shot('board_sausage_cubes');
  // огурец: рубка зигзагом — качаем нож вверх-вниз, сдвигая вправо
  await page.locator('button[data-act="boardSelect"][data-args*="pickle"]').click(); await wait(1200); await tip();
  const zig = [[-4.4, -5]];
  for (let k = 0; k < 9; k++) zig.push([-4 + k, 5], [-3.5 + k, -5]);
  await stroke(zig, 2);
  log('pickle chop', await info());
  await shot('board_pickle_chop');
  // морковь: дрожащая рука — волнистый росчерк
  await page.locator('button[data-act="boardSelect"][data-args*="carrot"]').click(); await wait(1200); await tip();
  const wob = [];
  for (let k = 0; k <= 20; k++) wob.push([0.5 * Math.sin(k * 1.3), -6 + k * 0.6]);
  await stroke(wob, 2);
  await stroke([[-3.4, -6], [-2.6, 6]]);
  log('carrot wobbly', await info());
  await shot('board_carrot_wobbly');
  // свободный поворот: держим A
  await page.keyboard.down('KeyA'); await wait(900); await page.keyboard.up('KeyA');
  await wait(300); await shot('board_carrot_free_turn');
  log('free turn', await info());
} catch (e) { log('ERR', e.message.split('\n')[0]); await shot('raster_error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
