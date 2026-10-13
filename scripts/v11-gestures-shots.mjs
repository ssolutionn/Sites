// 0.11 G: физические действия — жестом, а не кнопкой. Мышью: плита (продукт → конфорка, кастрюля — со стола).
//   PW=… OUT=production/qa/evidence node scripts/v11-gestures-shots.mjs http://127.0.0.1:4170/ [stove]
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4170/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v11_gest_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);

async function openDay(n) {
  await page.goto(url, { timeout: 180000 }); await wait(800);
  await S(() => localStorage.clear());
  await page.goto(url, { timeout: 180000 });
  await waitFor(() => !!window.__sueta?.save, 120000);
  await S((n) => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < n - 1) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[n - 1].unlocked = true; sv.write(); }, n);
  await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(800);
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(600);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=enter]').click());
  await waitFor(() => window.__sueta.mode === 'kitchen', 60000); await wait(800);
  await S(() => { window.__sueta.session.triggers = []; });
}
// экранная точка плоскости станции (локальные метры → пиксели страницы)
const screenOf = (station, x, z, dy = 0) => S(({ station, x, z, dy }) => { const v = window.__sueta.view; const p = v.localToScreen(station, x, z, dy); const r = v.sv.canvas.getBoundingClientRect(); return { x: r.left + p.x, y: r.top + p.y }; }, { station, x, z, dy });

if (want('stove')) {
  await openDay(1);
  // достали яйца, пришли к плите
  await S(() => { const s = window.__sueta.session; s.fridgeTasks(); });
  await S(() => { const s = window.__sueta.session; s.goTo('fridge'); });
  await waitFor(() => window.__sueta.session.panel === 'fridge', 90000); await wait(500);
  const t = await S(() => { const s = window.__sueta.session; const x = s.fridgeTasks().find((q) => q.product === 'egg') ?? s.fridgeTasks()[0]; return { d: x.dishId, st: x.stepId }; });
  await S((t) => window.__sueta.session.fridgeTake(t.d, t.st), t);
  await S(() => window.__sueta.session.fastForward(4, () => !window.__sueta.session.action));
  await S(() => window.__sueta.session.goTo('stove'));
  await S(() => window.__sueta.session.fastForward(20, () => window.__sueta.session.panel === 'stove'));
  await waitFor(() => window.__sueta.session.panel === 'stove' && window.__sueta.sv.camT >= 0.95, 120000); await wait(700);
  console.log('state', await S(() => { const s = window.__sueta.session; return JSON.stringify({ panel: s.panel, carry: s.carry, camT: window.__sueta.sv.camT, tasks: s.stoveTasks().length, heroine: !!s.heroine.target, action: s.action?.name }); }));
  await shot('stove_start');
  await page.waitForSelector('[data-drag-stove]', { timeout: 60000 }).catch(() => {});
  const chip = page.locator('[data-drag-stove]');
  check('в доке плиты есть фишка продукта для переноса', (await chip.count()) === 1);
  check('кнопок «Положить сюда» и «Достать» нет', await S(() => ![...document.querySelectorAll('#panel button')].some((b) => /Положить сюда|Достать/.test(b.textContent))));
  const stoveXZ = await S(() => window.__sueta.view.pots.map((p, i) => ({ x: p.on.x - window.__sueta.view.k.stoveCenter.x, z: p.on.z - window.__sueta.view.k.stoveCenter.z })));
  const target = await screenOf('stove', stoveXZ[2].x, stoveXZ[2].z);
  const cb = await chip.boundingBox();
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x - 40, target.y - 40, { steps: 8 });
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await wait(500);
  check('кольцо под курсором подсвечено', await S(() => window.__sueta.view.stoveHot === 2));
  await shot('stove_drag_product');
  await page.mouse.up();
  await S(() => window.__sueta.session.fastForward(3, () => !window.__sueta.session.action));
  await wait(500);
  check('жестом: кастрюля встала на третью конфорку', await S(() => window.__sueta.session.burners[2].state === 'boiling'));
  await shot('stove_placed');
  // готовая кастрюля: ускоряем варку, утаскиваем со стола
  await S(() => { const s = window.__sueta.session; s.setHeat(2, 9); s.fastForward(400, () => s.burners[2].state === 'ready'); });
  await wait(500);
  check('кастрюля сварилась', await S(() => window.__sueta.session.burners[2].state === 'ready'));
  const from = await screenOf('stove', stoveXZ[2].x, stoveXZ[2].z, 0.1);
  const to = await screenOf('stove', stoveXZ[2].x + 0.45, stoveXZ[2].z + 0.2, 0.1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await wait(500);
  check('кастрюля идёт за курсором', await S(() => !!window.__sueta.session.potDrag));
  await shot('stove_drag_pot');
  await page.mouse.up();
  await S(() => window.__sueta.session.fastForward(3, () => !window.__sueta.session.action));
  await wait(500);
  check('жестом: кастрюля снята с конфорки', await S(() => window.__sueta.session.burners[2].state === 'empty'));
}
console.log('errors', errs.length, errs.slice(0, 5));
console.log(`${ok} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
