// 0.11, F1: посудомойка мышью — станция в обзоре и крупным планом, дверца потянута ручкой, посуда перетащена в проём,
// дверца поднята, кнопка пуска нажата, идущий цикл, конец цикла; грязный нож после разреза и его мытьё в раковине.
//   PW=… OUT=production/qa/evidence node scripts/v11-washer-shots.mjs http://127.0.0.1:4183/
// Код выхода 1, если хоть одна проверка не прошла.
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4183/';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v11_washer_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };

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
}
const closeTip = () => page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
const camReady = (mode) => waitFor((m) => window.__sueta.sv.camMode === m && window.__sueta.sv.camT >= 1, 60000, mode);
// Точка плоскости станции (локальные метры) → пиксели страницы.
const px = (st, x, z) => S(([st, x, z]) => { const v = window.__sueta.view.localToScreen(st, x, z); const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left + v.x, y: r.top + v.y }; }, [st, x, z]);
// Мышь ведут по точкам, не отпуская; отпускание — отдельным вызовом page.mouse.up().
async function drag(from, to, steps = 14) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await carry(from, to, steps);
}
async function carry(from, to, steps = 14) {
  for (let k = 1; k <= steps; k++) { await page.mouse.move(from.x + ((to.x - from.x) * k) / steps, from.y + ((to.y - from.y) * k) / steps); await wait(25); }
}

const DW = await import('../src/campaign/layout.js').then((m) => m.DISHWASHER);
const TRAVEL = (await import('../src/campaign/data.js')).CAMPAIGN.dishwasher.door.travel;

try {
  await openDay(2); // в день 2 миска «со вчера» уже грязная
  await closeTip();
  // грязная посуда для показа: нож, поднос (миска уже грязная по сценарию дня)
  await S(() => { const s = window.__sueta.session; s.triggers = []; s.equipment.knife.clean = false; s.equipment.tray.clean = false; });
  await wait(1200);
  const lbl = await S(() => [...document.querySelectorAll('.st-label')].filter((l) => l.style.display !== 'none').map((l) => l.textContent));
  check('в обзоре есть метка «Посудомойка»', lbl.some((t) => /Посудомойка/.test(t)), lbl.join(' | '));
  await shot('01_overview');

  // идём к посудомойке кликом по метке
  await S(() => [...document.querySelectorAll('.st-label')].find((l) => /Посудомойка/.test(l.textContent))?.click());
  await waitFor(() => window.__sueta.session.panel === 'dishwasher', 60000);
  await camReady('c-dishwasher');
  await wait(400);
  check('открылась панель посудомойки', await sess('s.panel === "dishwasher"'));
  check('подсказка про посудомойку показана', await S(() => /Посудомойка/.test(document.querySelector('#tip .tip-text')?.textContent ?? '')));
  await shot('02_closeup_tip');
  await closeTip(); await wait(300);
  await shot('03_closeup_closed');

  // тянем ручку вниз: дверца открывается
  const h0 = await px('dishwasher', DW.handle.x, DW.handle.z);
  const h1 = await px('dishwasher', DW.handle.x, DW.handle.z + TRAVEL * 0.5);
  await drag(h0, h1, 8);
  await wait(300);
  await shot('04_door_half');
  const h2 = await px('dishwasher', DW.handle.x, DW.handle.z + TRAVEL * 1.1);
  await carry(h1, h2, 8);
  await page.mouse.up();
  await waitFor(() => window.__sueta.session.dishwasher.door === 'open', 8000);
  await wait(900);
  check('дверца открылась потянутой ручкой', await sess('s.dishwasher.door === "open"'));
  await shot('05_door_open');

  // перетаскиваем фишку миски в проём
  const chip = async (id) => S((id) => { const r = document.querySelector(`[data-drag-dw="${id}"]`)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, id);
  const cav = await px('dishwasher', 0, 0.0);
  let c = await chip('bowl');
  check('есть фишка миски', !!c);
  await drag(c, cav, 16);
  await wait(500);
  await shot('06_drag_bowl_over_cavity');
  await page.mouse.up();
  await waitFor(() => window.__sueta.session.dishwasher.loaded.includes('bowl'), 8000);
  check('миска в машине после перетаскивания', await sess('s.dishwasher.loaded.includes("bowl")'));
  await wait(500);
  for (const id of ['knife', 'tray']) {
    c = await chip(id);
    if (!c) { check(`есть фишка ${id}`, false); continue; }
    await drag(c, await px('dishwasher', 0.05, 0.05), 14);
    await page.mouse.up();
    await waitFor((id) => window.__sueta.session.dishwasher.loaded.includes(id), 6000, id);
    check(`${id} в машине`, await sess(`s.dishwasher.loaded.includes("${id}")`));
  }
  await wait(800);
  await shot('07_loaded');
  check('загруженное не считается немытым', await sess('s.dirtyItems().length === 0'));
  check('миска недоступна для работы', await sess('/в посудомойке/.test(s._bowlBlock("crab") ?? "")'), await sess('s._bowlBlock("crab")'));

  // фишка брошена мимо проёма: возвращается, с фразой
  await sess('(s.equipment.form.clean = false, s.dishwasher.loaded.length)');
  await wait(300);
  c = await chip('form');
  if (c) {
    await drag(c, { x: 640, y: 120 }, 10);
    await page.mouse.up(); await wait(400);
    check('фишка мимо проёма не положена', await sess('!s.dishwasher.loaded.includes("form")'));
    check('отказ говорит по-человечески', await sess('/проём/.test(s.hint?.text ?? "")'), await sess('s.hint?.text'));
  }

  // закрываем дверцу: тянем нижнюю кромку вверх
  const d0 = await px('dishwasher', 0, 0.6);
  const d1 = await px('dishwasher', 0, 0.6 - TRAVEL * 1.05);
  await drag(d0, d1, 10);
  await page.mouse.up();
  await waitFor(() => window.__sueta.session.dishwasher.door === 'closed', 8000);
  await wait(900);
  check('дверца закрылась', await sess('s.dishwasher.door === "closed"'));
  await shot('08_closed_loaded');

  // кнопка пуска на дверце
  const b = await px('dishwasher', DW.start.x, DW.start.z);
  await page.mouse.click(b.x, b.y);
  await waitFor(() => !!window.__sueta.session.dishwasher.run, 6000);
  check('нажатие кнопки запустило цикл', await sess('!!s.dishwasher.run'));
  await wait(700);
  await shot('09_running');
  await S(() => window.__sueta.session.fastForward(20)); await wait(600);
  await shot('10_running_half');
  check('в середине цикла миска ещё недоступна', await sess('/ещё/.test(s.equipBlock("bowl") ?? "")'), await sess('s.equipBlock("bowl")'));
  await S(() => window.__sueta.session.fastForward(24));
  await waitFor(() => !window.__sueta.session.dishwasher.run, 8000);
  await wait(700);
  check('цикл кончился, посуда чистая', await sess('s.equipment.bowl.clean && s.equipment.knife.clean && s.equipment.tray.clean'));
  await shot('11_done');

  // нож пачкается от разреза и моется в раковине
  await S(() => window.__sueta.session.closePanel()); await camReady('c-overview');
  await openDay(1);
  await closeTip();
  await S(() => { const s = window.__sueta.session; s.triggers = []; s.goTo('board'); });
  await waitFor(() => window.__sueta.session.panel === 'board' && window.__sueta.sv.camT >= 1, 60000);
  await closeTip();
  await S(() => window.__sueta.session.boardSelect('olivier:carrot'));
  await wait(400);
  const a = await px('board', -0.1, -0.1);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y + 40, { steps: 8 }); await page.mouse.up();
  await wait(500);
  const cut = await sess('s.equipment.knife.clean === false');
  check('первый разрез пачкает нож', cut || (await sess('s.boardCur()?.cuts > 0') === false), 'нож ' + (await sess('s.equipment.knife.clean')));
  if (!(await sess('s.equipment.knife.clean === false'))) await S(() => window.__sueta.session._emit('cut', {}));
  check('нож в списке немытого', await sess('s.dirtyItems().some((x) => x.id === "knife")'));
  await S(() => window.__sueta.session.goTo('sink'));
  await waitFor(() => window.__sueta.session.panel === 'sink' && window.__sueta.sv.camT >= 1, 60000);
  await closeTip(); await wait(400);
  await S(() => window.__sueta.session.sinkSelect('knife'));
  await wait(500);
  const k0 = await px('sink', -0.12, 0), k1 = await px('sink', 0.12, 0);
  await page.mouse.move(k0.x, k0.y); await page.mouse.down();
  for (let i = 0; i < 6; i++) { await page.mouse.move(i % 2 ? k0.x : k1.x, i % 2 ? k0.y : k1.y, { steps: 6 }); }
  await shot('12_sink_knife');
  for (let i = 0; i < 12 && !(await sess('s.equipment.knife.clean')); i++) await page.mouse.move(i % 2 ? k0.x : k1.x, i % 2 ? k0.y : k1.y, { steps: 6 });
  await page.mouse.up();
  check('нож отмыт губкой мышью', await sess('s.equipment.knife.clean'));
  check('нет ошибок консоли', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  fail++;
  console.log('FAIL исключение', e.message);
}
await browser.close();
console.log(`\nитого: ${ok} ок, ${fail} не прошло`);
process.exit(fail ? 1 : 0);
