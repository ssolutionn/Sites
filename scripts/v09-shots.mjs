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
  await page.goto(url, { timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000);
  await S((n) => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < n - 1) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[n - 1].unlocked = true; sv.write(); }, n);
  await page.reload({ timeout: 180000 }); await wait(1500);
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(800);
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
  if (want('stove')) {
    // день 1: яйца из холодильника → огонь включён заранее → положить → огонь не погас; пена → залило → снять → вытереть
    await openDay(1);
    await station('fridge');
    await shot('fridge_take');
    const tk = await S(() => { const b = [...document.querySelectorAll('button[data-act="fridgeTake"]')].find((x) => x.dataset.args.includes('boilEgg')); b?.click(); return !!b; });
    check('в холодильнике есть «Достать: яйцо»', tk);
    await waitFor(() => !window.__sueta.session.action && !!window.__sueta.session.carry);
    check('яйца в руках', (await sess('s.carry?.product')) === 'egg');
    await station('stove');
    await page.locator('#tip button').click({ timeout: 600 }).catch(() => {});
    // крутилка конфорки 2 мышью до 8 ДО того, как положили яйца
    const kb = await page.locator('[data-knob="2"]').first().boundingBox();
    const cx = kb.x + kb.width / 2, cy = kb.y + kb.height / 2, r = kb.width * 0.36, a0 = -Math.PI / 2;
    await page.mouse.move(cx + r * Math.cos(a0), cy + r * Math.sin(a0)); await page.mouse.down();
    for (let k = 1; k <= 24; k++) { const a = a0 + (k / 3) * (Math.PI / 6); await page.mouse.move(cx + r * Math.cos(a), cy + r * Math.sin(a)); await wait(25); }
    await page.mouse.up(); await wait(300);
    const h0 = await sess('s.burners[2].heat');
    check('крутилка повёрнута мышью до 8 на пустой конфорке', h0 === 8, `огонь ${h0}`);
    check('кнопок −/+ у плиты нет', await S(() => !document.querySelector('button[data-act="setHeat"]')));
    check('четыре крутилки', (await S(() => document.querySelectorAll('[data-knob]').length)) === 4);
    await shot('stove_four_knobs');
    await S(() => document.querySelector('button[data-act="placePot"][data-args^="[2"]')?.click());
    await waitFor(() => !window.__sueta.session.action);
    check('положила яйца — огонь не погас', (await sess('s.burners[2].heat')) === 8, `огонь ${await sess('s.burners[2].heat')}`);
    await S(() => { const s = window.__sueta.session; s.fastForward(40, () => s.burners[2].water === 'boil' && s.burners[2].cooked > 3); });
    await wait(1200); await shot('stove_ring_cooking');
    await S(() => { const s = window.__sueta.session; s.fastForward(30, () => !!s.burners[2].overflow); });
    await wait(800); await shot('stove_foam');
    await S(() => { const s = window.__sueta.session; s.fastForward(30, () => s.burners[2].dirty); });
    check('убежало — конфорка залита', await sess('s.burners[2].dirty'));
    await S(() => { const s = window.__sueta.session; s.fastForward(60, () => s.burners[2].state === 'ready'); });
    await wait(800); await shot('stove_ready_dirty');
    await S(() => document.querySelector('button[data-act="takePot"]')?.click());
    await waitFor(() => !window.__sueta.session.action);
    // вытереть тряпкой: зажать на пятне и тереть туда-обратно
    const st = await S(() => { const b = window.__sueta.session; return null; });
    const c2 = await scr('stove', 0.15, -0.14);
    await page.mouse.move(c2.x - 30, c2.y); await page.mouse.down();
    for (let k = 0; k < 30 && (await sess('s.burners[2].dirty')); k++) { await page.mouse.move(c2.x + (k % 2 ? 30 : -30), c2.y + ((k % 3) - 1) * 6, { steps: 3 }); await wait(30); if (k === 6) await shot('stove_wiping'); }
    await page.mouse.up();
    check('конфорку вытерли мышью', !(await sess('s.burners[2].dirty')));
  }
  if (want('peel')) {
    // картофель для оливье: из кладовой → почистить сырым → снова в руках; яйцо: постучать → снять скорлупу пальцами
    await openDay(1);
    await station('fridge');
    await S(() => [...document.querySelectorAll('button[data-act="fridgeTake"]')].find((x) => x.dataset.args.includes('peelPotato'))?.click());
    await waitFor(() => !!window.__sueta.session.carry);
    await station('board');
    await S(() => document.querySelector('button[data-act="boardSelect"][data-args*="peelPotato"]')?.click());
    await wait(800);
    check('сырой картофель на доске для чистки', (await sess('s.boardCur()?.stepId')) === 'peelPotato');
    await shot('board_raw_potato');
    await S(() => { const s = window.__sueta.session; const it = s.boardCur(); it.peel.level.fill(1); it.peel.version++; s._peelComplete(it); });
    await wait(500);
    check('почищенный картофель снова в руках', (await sess('s.carry?.peeled')) === true);
    await shot('board_potato_peeled_hands');
    // яйца уже сварены и остыли
    await S(() => { const s = window.__sueta.session; s.carry = null; s.dishes.olivier.steps.boilEgg.done = true; s.hot = {}; });
    await S(() => document.querySelector('button[data-act="boardSelect"][data-args*="peelEgg"]')?.click()) ;
    await wait(1000);
    const zones = await sess('s.boardCur().peel.zones.map((q) => [q.x, q.z])');
    check('яйца на доске для чистки руками', (await sess('!!s.boardCur()?.hand')) === true);
    for (const [x, z] of zones) for (let k = 0; k < 2; k++) { const p = await scr('board', x, z); await page.mouse.click(p.x, p.y); await wait(250); }
    check('скорлупа треснула от ударов', await sess('s.boardCur().cracks.every((n) => n >= 2)'));
    await shot('board_egg_cracked');
    const zz = await sess('s.boardCur().peel.zones');
    for (let pass = 0; pass < 4 && (await sess("!!s.board.items['olivier:peelEgg']")); pass++) {
      for (const q of zz) {
        for (let r = -3; r <= 3; r++) {
          const a = await scr('board', q.x - q.rx * 1.15, q.z + (r * q.rz) / 3.3 + pass * 0.002);
          const b = await scr('board', q.x + q.rx * 1.15, q.z + (r * q.rz) / 3.3 + pass * 0.002);
          await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up(); await wait(40);
        }
      }
      if (pass === 0) await shot('board_egg_peeling');
    }
    check('яйца почищены пальцами', await sess("s.stepDone('olivier', 'peelEgg')"));
  }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log(`итого OK ${ok} FAIL ${fail}; ошибок консоли ${errs.length}`, errs.slice(0, 4));
await browser.close();
