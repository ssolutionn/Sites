// 0.9: проверки третьего круга правок мышью. Части: crash (день 3 — зелень в миске), далее по фазам.
//   node scripts/v09-shots.mjs http://localhost:4173/ crash
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v9_${n}.png`, timeout: 90000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const click = (sel) => S((q) => document.querySelector(q)?.click(), sel);
const tip = () => page.locator('#tip button').click({ timeout: 600 }).catch(() => {});
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);

/** Открыть день n (1..7): прошлые дни отмечены пройденными. */
async function openDay(n) {
  await page.goto(url, { timeout: 180000 }); await wait(1200);
  await S((n) => { localStorage.clear(); }, n);
  await page.goto(url, { timeout: 180000 }); await wait(1500);
  await S((n) => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < n - 1) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[n - 1].unlocked = true; sv.write(); }, n);
  await page.reload({ timeout: 180000 }); await wait(1500);
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await click('[data-ui=continue]'); await wait(800);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await click('[data-ui=enter]'); await wait(1200);
}
async function station(st) {
  await S((st) => window.__sueta.session.goTo(st), st);
  await waitFor((st) => window.__sueta.session.panel === st && window.__sueta.sv.camT >= 1, 60000, st);
  await tip();
}
const scr = (st, x, z) => S(([st, x, z]) => window.__sueta.view.localToScreen(st, x, z), [st, x, z]);

try {
  if (want('crash')) {
    // день 3: начинка яиц — майонез, затем зелень (раньше игра падала)
    await openDay(3);
    check('день 3 открыт', (await sess('s.dayIndex')) === 2);
    await S(() => { const s = window.__sueta.session; const d = s.dishes.eggs; for (const id of ['boilEgg', 'peelEgg', 'halves']) d.steps[id].done = true; s.hot = {}; s.bowl.owner = 'eggs'; s.bowl.contents = [{ product: 'egg', kind: 'yolks', pieces: Array(6) }]; });
    await station('bowl');
    const c = await scr('bowl', 0, 0);
    for (const step of ['mayo', 'greens']) {
      const picked = await S((st) => window.__sueta.session.bowlPick('eggs', st), step);
      check(`взяли ${step}`, picked === true);
      await page.mouse.move(c.x - 60, c.y); await page.mouse.down();
      for (let i = 0; i < 24; i++) { await page.mouse.move(c.x + Math.cos(i / 2) * 60, c.y + Math.sin(i / 2) * 30); await wait(30); }
      if (step === 'greens') await shot('d3_bowl_greens');
      await page.mouse.up(); await wait(500);
    }
    check('зелень и майонез в начинке', await sess("s.dishes.eggs.steps.mayo.done && s.dishes.eggs.steps.greens.done"));
    check('нет ошибок консоли после зелени', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log(`итого OK ${ok} FAIL ${fail}; ошибок консоли ${errs.length}`, errs.slice(0, 4));
await browser.close();
