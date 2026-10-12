// 0.11, C1: плита — отдельный прибор. Снимки обзора, крупного плана с кастрюлей и повёрнутой крутилкой, духовки с дверцей.
//   PW=… OUT=production/qa/evidence node scripts/v11-stove-shots.mjs http://127.0.0.1:4181/ [overview,closeup,oven,angles]
// Файлы: v11_stove_overview / v11_stove_closeup / v11_stove_oven (+ v11_stove_angle_* при части angles).
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4181/';
const part = process.argv[3] || 'overview,closeup,oven';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v11_stove_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);
const closeTip = () => page.locator('#tip button').click({ timeout: 800 }).catch(() => {});

/** Открыть день n (1..7) с чистым сохранением; прошлые дни пройдены. */
async function openDay(n) {
  await page.goto(url, { timeout: 180000 }); await wait(800);
  await S(() => localStorage.clear());
  await page.goto(url, { timeout: 180000 });
  errs.length = 0;
  await waitFor(() => !!window.__sueta?.save, 120000);
  await S((n) => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < n - 1) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[n - 1].unlocked = true; sv.write(); }, n);
  await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(800);
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(600);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=enter]').click());
  await waitFor(() => window.__sueta.mode === 'kitchen', 60000); await wait(800);
  await closeTip();
}
/** Свободная камера для снимка (мгновенно): pos и look в метрах; null — вернуть обычную. */
async function freeCam(pos, look) {
  await S(([pos, look]) => {
    const sv = window.__sueta.sv;
    if (!sv.__hooked) { const orig = sv.cameraHook; sv.cameraHook = (m, p, l, a) => { const o = window.__camOverride; if (o) { p.set(...o.pos); l.set(...o.look); return true; } return orig ? orig(m, p, l, a) : false; }; sv.__hooked = true; }
    window.__camOverride = pos ? { pos, look } : null;
    sv.camT = 0; sv.camFrom.pos.copy(sv.camera.position); sv.camFrom.look.copy(sv.camLook);
  }, [pos, look]);
  await waitFor(() => window.__sueta.sv.camT >= 1, 30000); await wait(900);
}
const hideUi = (hide) => S((h) => { for (const sel of ['#panel', '#hud', '#alerts', '#tip', '#labels', '#hint', '#toasts']) document.querySelectorAll(sel).forEach((e) => (e.style.visibility = h ? 'hidden' : '')); }, hide);

try {
  if (want('overview') || want('angles')) {
    await openDay(7);
    await S(() => { const s = window.__sueta.session; s.heroine.x = 0.3; s.heroine.z = -0.95; });
    await wait(1200);
    if (want('overview')) {
      await shot('overview');
      const info = await S(() => { const k = window.__sueta.view.k; return { knobs: k.stoveKnobs?.length, center: k.stoveCenter.toArray() }; });
      check('в сцене 4 крутилки, центр плиты задан', info.knobs === 4 && info.center.length === 3, JSON.stringify(info));
    }
    if (want('angles')) {
      await hideUi(true);
      await freeCam([2.2, 1.3, -0.55], [1.45, 0.62, -2.2]); await shot('angle_right');
      await freeCam([0.6, 1.3, -0.55], [1.45, 0.62, -2.2]); await shot('angle_left');
      await freeCam([1.45, 2.3, -0.9], [1.45, 0.7, -2.2]); await shot('angle_top');
      await freeCam([1.45, 0.55, -1.0], [1.45, 0.5, -2.2]); await shot('angle_front');
      await freeCam(null); await hideUi(false);
    }
  }
  if (want('closeup')) {
    // день 1: варим картофель — кастрюля на конфорке, крутилка повёрнута
    await openDay(1);
    await S(() => window.__sueta.session.goTo('stove'));
    await waitFor(() => window.__sueta.session.panel === 'stove' && window.__sueta.sv.camT >= 1);
    await closeTip(); await wait(300);
    const placed = await S(() => {
      const s = window.__sueta.session;
      const t = s.stoveTasks()[0];
      if (!t) return null;
      s.carry = { product: t.product, qty: t.qty, dishId: t.dishId, stepId: t.stepId, boilStep: t.boilStep, peeled: false };
      return s.placePot(0, null, 0);
    });
    await waitFor(() => !window.__sueta.session.action, 20000); await wait(400);
    // вторая конфорка с яйцами (передняя левая) и пустая включённая справа — видно и крутилки, и огонь
    await S(() => { const s = window.__sueta.session; s.setHeat(0, 5); });
    await wait(1800);
    check('кастрюля стоит на плите', placed === true && (await sess('s.burners[0].state === "boiling"')), `placed=${placed}`);
    check('крутилка 0 повёрнута', Math.abs(await S(() => window.__sueta.view.k.stoveKnobs[0].rotation.y)) > 0.3);
    await shot('closeup');
    await hideUi(true); await wait(200); await shot('closeup_clean'); await hideUi(false);
  }
  if (want('oven')) {
    await openDay(7);
    await S(() => { const s = window.__sueta.session; s.oven = { state: 'baking', owner: 'chicken', t0: s.t - 60, readyAt: s.t + 90, windowEnd: 0, doneness: 0.4 }; });
    await wait(600);
    await hideUi(true);
    await freeCam([1.5, 0.9, -0.95], [1.45, 0.5, -2.2]); await shot('oven');
    check('духовка видна, курица внутри', await S(() => window.__sueta.view.ovenChicken.visible));
    await freeCam([1.8, 1.25, -0.9], [1.45, 0.62, -2.2]); await shot('oven_angle');
    await hideUi(false);
  }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fail++; await shot('error'); }
check('нет ошибок консоли', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`итого OK ${ok} FAIL ${fail}`);
await browser.close();
process.exitCode = fail ? 1 : 0;
