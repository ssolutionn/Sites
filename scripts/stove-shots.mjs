// Плита крупно: крутилки огня мышью, пламя, кипение и пена; остудить под краном; соль кликом и шкала пробы.
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
const shot = (n) => page.screenshot({ path: `${out}/v7_${n}.png`, timeout: 90000 }).catch((e) => log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const tip = () => page.locator('#tip button').click({ timeout: 700 }).catch(() => {});
async function turnKnob(i, heat) {
  const b = await page.locator(`[data-knob="${i}"]`).first().boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2, r = b.width * 0.9;
  const cur = await sess(`s.burners[${i}].heat`);
  const a0 = -Math.PI / 2;
  await page.mouse.move(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); await page.mouse.down();
  const steps = Math.abs(heat - cur) * 3, dir = Math.sign(heat - cur);
  for (let k = 1; k <= steps; k++) { const a = a0 + dir * (k / 3) * (Math.PI / 6); await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a)); await wait(30); }
  await page.mouse.up(); await wait(300);
}
try {
  await page.goto(url, { timeout: 180000 }); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url, { timeout: 180000 }); await wait(2500);
  // клики по меню — через DOM: на программном рендере проверка «элемент неподвижен» может не дождаться кадра
  await page.waitForSelector('[data-ui=new]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=new]').click()); await wait(800);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=enter]').click()); await wait(1500);
  log('loaded');
  await S(() => window.__sueta.session.goTo('stove'));
  await waitFor(() => window.__sueta.session.panel === 'stove' && window.__sueta.sv.camT >= 1);
  await tip(); await wait(300);
  await page.locator('button[data-act="placePot"][data-args*="olivier:boil\\""]').first().click().catch(async () => page.locator('button[data-act="placePot"]').first().click());
  await waitFor(() => !window.__sueta.session.action); await wait(800);
  await shot('stove_closeup_off');
  log('placed heat', await sess('s.burners[0].heat'));
  await turnKnob(0, 8);
  log('knob ->', await sess('s.burners[0].heat'));
  await page.locator('button[data-act="placePot"]').first().click(); await waitFor(() => !window.__sueta.session.action);
  for (let i = 0; i < 4; i++) { await page.locator('button[data-act="setHeat"][data-args="[1,' + (i + 1) + ']"]').first().click().catch(() => {}); await wait(150); }
  await wait(1500); await shot('stove_closeup_flames');
  // до кипения и пены на сильном огне
  await S(() => { const s = window.__sueta.session; s.fastForward(40, () => s.burners[0].water === 'boil'); });
  await wait(1200); await shot('stove_boiling');
  log('water', await sess('s.burners.map(b => b.water + ":" + Math.round(b.temp)).join()'));
  await S(() => { const s = window.__sueta.session; s.fastForward(15, () => !!s.burners[0].overflow); });
  await wait(1000); await shot('stove_foam');
  log('overflow', await sess('!!s.burners[0].overflow'));
  await turnKnob(0, 4);
  log('after knob 4: overflow', await sess('!!s.burners[0].overflow'), 'heat', await sess('s.burners[0].heat'));
  await wait(800); await shot('stove_simmer');
  // яйца готовы → снять → раковина → под кран
  await S(() => { const s = window.__sueta.session; s.fastForward(60, () => s.burners[1].state === 'ready'); });
  await wait(500);
  await page.locator('button[data-act="takePot"]').first().click(); await waitFor(() => !window.__sueta.session.action);
  await S(() => window.__sueta.session.goTo('sink'));
  await waitFor(() => window.__sueta.session.panel === 'sink' && window.__sueta.sv.camT >= 1);
  await tip();
  await page.locator('button[data-act="coolPick"]').first().click(); await wait(800);
  await shot('sink_cool_start');
  const p = await S(() => window.__sueta.view.localToScreen('sink', 0, 0));
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await wait(900);
  await shot('sink_cool_tap');
  await waitFor(() => !window.__sueta.session.sinkCool, 30000);
  await page.mouse.up();
  log('cooled', await sess('!(s.hot.egg > s.t)'));
  // миска: соль кликами, шкала пробы, спасти пересол
  await S(() => { const s = window.__sueta.session; const d = s.dishes.olivier; for (const st of d.recipe.steps) if (!['season', 'mix', 'taste'].includes(st.id)) d.steps[st.id].done = true; const cubes = (n) => Array.from({ length: n }, () => ({ w: 1, d: 1, area: 1 })); s.board.items = {}; s.board.current = null; s.hot = {}; s.bowl.owner = 'olivier'; s.bowl.contents = ['potato', 'carrot', 'sausage', 'pickle', 'egg'].map((p) => ({ product: p, kind: 'pieces', pieces: cubes(40) })).concat([{ product: 'peas', kind: 'add' }, { product: 'mayo', kind: 'add' }]); s.goTo('bowl'); });
  await waitFor(() => window.__sueta.session.panel === 'bowl' && window.__sueta.sv.camT >= 1);
  await tip(); await wait(300);
  await page.locator('button[data-act="seasonPick"][data-args*="salt"]').click(); await wait(300);
  const c = await S(() => window.__sueta.view.localToScreen('bowl', 0, 0));
  for (let i = 0; i < 6; i++) { await page.mouse.click(c.x + (i % 3) * 8, c.y + (i % 2) * 6); await wait(350); }
  log('salt by clicks', await sess('s.dishes.olivier.season.salt'));
  await shot('bowl_salt_clicks');
  await S(() => { const s = window.__sueta.session; s.seasonDone('olivier'); s.bowl.stirrer = null; s.dishes.olivier.steps.mix.done = true; });
  await wait(500);
  await page.locator('button[data-act="seasonTaste"]').click(); await waitFor(() => !window.__sueta.session.action); await wait(600);
  await shot('bowl_taste_scale');
  log('verdict', await sess('s.dishes.olivier.season.last.verdict'));
  await page.locator('button[data-act="seasonDilute"]').click().catch(() => log('no rescue chip')); await waitFor(() => !window.__sueta.session.action); await wait(1500);
  await shot('bowl_rescue_potato');
  log('salt after rescue', await sess('s.dishes.olivier.season.salt'));
} catch (e) { log('ERR', e.message.split('\n')[0]); await shot('stove_error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
