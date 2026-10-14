// 0.11: «рука-призрак» учит жестам — первая встреча с ножом (день 1), три отказа ножа, кот, «?», настройка, «меньше движения»,
// выключенные подсказки и обход всех жестов (рука стоит там, где жест).
//   npx vite build && npx vite preview --port 4187 --strictPort --host 127.0.0.1
//   PW=/opt/node-tools/node_modules/playwright/index.mjs OUT=production/qa/evidence node scripts/v11-ghost-shots.mjs http://127.0.0.1:4187/ all
//   части: knife,refuse,repeat,cat,settings,motion,tour1,tour2,tour3  (через запятую; tour = tour1,tour2,tour3); код выхода 1 при провале.
// Снимки v11_ghost_*.png: рука заморожена в середине движения (GhostHand.hold), чтобы медленный SwiftShader не съел показ.
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4187/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v11_ghost_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(120);
  }
  return false;
}
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  (cond ? ok++ : fail++);
  console.log(cond ? 'OK  ' : 'FAIL', name, extra);
};
const want = (p) => part === 'all' || part.split(',').includes(p) || (p.startsWith('tour') && part.split(',').includes('tour'));
const setting = (key) => S((k) => window.__sueta.save.data.settings[k], key);

// ---------- помощники ----------
async function click(sel) {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) throw new Error('нет элемента ' + sel);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(250);
}

/** Чистое начало: localStorage пуст, игра загружена. n — день, к которому открыт путь (предыдущие пройдены). */
async function fresh(n = 1) {
  await page.goto(url, { timeout: 180000 });
  await S(() => localStorage.clear());
  await page.goto(url, { timeout: 180000 });
  errs.length = 0;
  await waitFor(() => !!window.__sueta?.save, 120000);
  if (n > 1) {
    await S((n) => {
      const sv = window.__sueta.save;
      sv.data.days.forEach((d, i) => {
        if (i < n - 1) Object.assign(d, { completed: true, unlocked: true, best: { D: 90, dishes: {}, order: 100, time: 0 }, last: { D: 90, dishes: {}, order: 100, time: 0 } });
      });
      sv.data.days[n - 1].unlocked = true;
      sv.write();
    }, n);
    await page.reload({ timeout: 180000 });
    await waitFor(() => !!window.__sueta?.save, 120000);
  }
  await wait(600);
}

/** Из меню — в кухню выбранного дня (мышью по кнопкам). */
async function enterDay() {
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click());
  await wait(500);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 });
  await click('[data-ui=enter]');
  await waitFor(() => window.__sueta.mode === 'kitchen', 60000);
  await wait(800);
  await S(() => { window.__sueta.session.triggers = []; });
}

const coachState = () => S(() => { const c = window.__sueta.app.ghost.coach; const h = c.hand; return h.cur ? { id: h.cur.show.id, why: h.cur.show.why, t: h.cur.t, dur: h.cur.show.dur, pending: !!c.pending } : { pending: !!c.pending }; });
/** Ждём, пока рука пойдёт; замораживаем её на доле frac одного прохода и ждём кадр отрисовки. */
async function freeze(frac = 0.55, timeout = 90000) {
  const started = await waitFor(() => !!window.__sueta.app.ghost.coach.hand.cur, timeout);
  if (!started) return false;
  await S((frac) => {
    const h = window.__sueta.app.ghost.coach.hand;
    h.hold = true;
    h.cur.t = Math.min(h.cur.pass * frac, h.cur.show.dur - 0.01);
  }, frac);
  await waitFor(() => getComputedStyle(document.getElementById('ghost-hand')).opacity === '1', 30000); // слой уже проявился (gh-in), снимок не поймает середину
  await wait(500);
  return true;
}
const unfreeze = () => S(() => { const c = window.__sueta.app.ghost.coach; c.hand.hold = false; c.hand.hide(); c.pending = null; });
const ghostState = () => S(() => {
  const r = document.getElementById('ghost-hand');
  if (!r || r.classList.contains('hidden')) return null;
  const hb = r.querySelector('.gh-hand').getBoundingClientRect();
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(r.querySelector('.gh-hand').getAttribute('transform') ?? '');
  const head = r.querySelector('.gh-head');
  return { gesture: r.dataset.gesture, why: r.dataset.why, label: r.querySelector('.gh-label').textContent, tip: m ? { x: +m[1], y: +m[2] } : null, box: { l: hb.left, t: hb.top, r: hb.right, b: hb.bottom }, route: (r.querySelector('.gh-route').getAttribute('d') ?? '').length, trail: (r.querySelector('.gh-trail').getAttribute('d') ?? '').length, down: r.querySelector('.gh-hand').classList.contains('gh-down'), stat: r.classList.contains('gh-static'), head: !!head && head.style.display !== 'none' };
});
/** Экранные координаты точки станции (пиксели окна). */
const station = (st, x, z) => S(([st, x, z]) => { const v = window.__sueta.view; const q = v.localToScreen(st, x, z); const r = v.sv.canvas.getBoundingClientRect(); return { x: r.left + q.x, y: r.top + q.y }; }, [st, x, z]);
// в разметке руки нет шестнадцатеричных цветов и жёстких fill/stroke: всё через переменные темы
const hasHardColors = () => S(() => /#[0-9a-fA-F]{3,8}\b|\b(?:fill|stroke)="(?!none)/.test(document.getElementById('ghost-hand').outerHTML));
const midReport = async (name, near) => {
  const g = await ghostState();
  check(`${name}: рука на экране, жест «${g?.gesture}», подпись «${g?.label}»`, !!g && g.tip && g.route > 20);
  if (near && g?.tip) {
    const d = Math.hypot(g.tip.x - near.x, g.tip.y - near.y);
    check(`${name}: кончик пальца у цели (${Math.round(d)} px от ${Math.round(near.x)},${Math.round(near.y)})`, d < (near.r ?? 90));
  }
  return g;
};
const catScreen = () => S(() => { const v = window.__sueta.sv; const c = v.cat.getWorldPosition(new v.cat.position.constructor()); c.y += 0.15; c.project(v.camera); const r = v.canvas.getBoundingClientRect(); return { x: r.left + (c.x * 0.5 + 0.5) * r.width, y: r.top + (-c.y * 0.5 + 0.5) * r.height }; });

// ---------- обход всех жестов: рука стоит там, где жест ----------
const sessS = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
/** Пойти к станции и дождаться крупного плана. */
async function goStation(st) {
  let arrived = false;
  for (let k = 0; k < 4 && !arrived; k++) {
    await S((st) => window.__sueta.session.goTo(st), st);
    arrived = await waitFor((st) => window.__sueta.session.panel === st && window.__sueta.sv.camT >= 0.95 && !window.__sueta.session.heroine.target, 60000, st);
  }
  check(`пришла к станции «${st}»`, arrived, arrived ? '' : await S(() => window.__sueta.session.hint?.text ?? ''));
  await wait(900);
}
/** Показать жест id принудительно (как «?»), заморозить и снять кадр рядом с рукой. near — {x, y, r}: где должен быть кончик. */
async function tourShot(id, { near = null, frac = 0.55, where = '' } = {}) {
  await unfreeze();
  const queued = await S((id) => {
    const c = window.__sueta.app.ghost.coach;
    const sh = c.trigger.repeat(id);
    if (sh) c._queue(sh);
    return !!sh;
  }, id);
  const started = queued && (await freeze(frac, 90000));
  const g = started ? await ghostState() : null;
  const inside = !!g?.tip && g.tip.x >= 0 && g.tip.x <= 1280 && g.tip.y >= 0 && g.tip.y <= 720;
  check(`обход: ${id}${where ? ` (${where})` : ''} — рука пошла, кончик в окне, путь виден`, !!g && g.gesture === id && inside && g.route > 20, g ? `tip ${Math.round(g.tip.x)},${Math.round(g.tip.y)} «${g.label}»` : 'руки нет');
  if (near && g?.tip) {
    const target = typeof near === 'function' ? await near() : near; // цель, что двигается (кот), меряем уже после заморозки руки
    const d = Math.hypot(g.tip.x - target.x, g.tip.y - target.y);
    check(`обход: ${id} — кончик у цели (${Math.round(d)} px)`, d < (target.r ?? 120));
  }
  if (g?.tip) {
    const clip = { x: Math.max(0, Math.min(1280 - 760, g.tip.x - 380)), y: Math.max(0, Math.min(720 - 480, g.tip.y - 240)), width: 760, height: 480 };
    await page.screenshot({ path: `${out}/v11_ghost_tour_${id}.png`, clip, timeout: 150000 }).catch((e) => console.log('shot fail', id, e.message.split('\n')[0]));
  }
  return g;
}
const knobScreen = (i) => S((i) => { const r = document.querySelector(`[data-knob="${i}"]`)?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, i);

try {
  // ======================= нож: первая встреча в день 1 =======================
  if (want('knife') || want('refuse') || want('repeat')) {
    await fresh(1);
    await shot('00_menu');
    await enterDay();
    await S(() => window.__sueta.session.goTo('board'));
    await waitFor(() => window.__sueta.session.panel === 'board', 60000);
    await wait(900);
    check('до выбора задачи руки нет', (await ghostState()) === null);
    // задача на доске — мышью по кнопке в доке
    await page.locator('#panel [data-act=boardSelect][data-args*=carrot]').click();
    const started = await freeze(0.55);
    check('первая встреча с ножом: рука пошла сама', started);
    const h = await coachState();
    check('это первая встреча, показ cut-v', h.id === 'cut-v' && h.why === 'first', JSON.stringify(h));
    const g = await midReport('нож');
    check('показ длится два прохода и укладывается в 5 секунд', h.dur >= 3 && h.dur <= 5.5, `dur ${h.dur?.toFixed?.(2)}`);
    check('рука нажимает кнопку в середине движения', g?.down === true);
    check('в разметке руки нет шестнадцатеричных цветов и жёстких fill/stroke', !(await hasHardColors()));
    // рука не закрывает продукт целиком: площадь её рамки внутри рамки продукта мала
    const cover = await S(() => {
      const v = window.__sueta.view, it = window.__sueta.session.boardCur();
      const U = 0.021, w = (it.body.shape.w / 2) * U, d = ((it.body.copies.length * it.body.shape.d) / 2) * U;
      const pts = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, z]) => v.localToScreen('board', x, z));
      const r = v.sv.canvas.getBoundingClientRect();
      const px = pts.map((p) => p.x + r.left), py = pts.map((p) => p.y + r.top);
      const P = { l: Math.min(...px), r: Math.max(...px), t: Math.min(...py), b: Math.max(...py) };
      const hb = document.querySelector('#ghost-hand .gh-hand').getBoundingClientRect();
      const ix = Math.max(0, Math.min(P.r, hb.right) - Math.max(P.l, hb.left)), iy = Math.max(0, Math.min(P.b, hb.bottom) - Math.max(P.t, hb.top));
      return { frac: (ix * iy) / Math.max(1, (P.r - P.l) * (P.b - P.t)), prod: P };
    });
    check('кончик пальца на продукте (рамка моркови ± 60 px)', g.tip.x >= cover.prod.l - 60 && g.tip.x <= cover.prod.r + 60 && g.tip.y >= cover.prod.t - 60 && g.tip.y <= cover.prod.b + 60, JSON.stringify(g.tip));
    check('рука закрывает меньше половины продукта', cover.frac < 0.5, `${Math.round(cover.frac * 100)} %`);
    await shot('01_knife_first');
    check('первая встреча запомнилась в настройках', (await S(() => window.__sueta.save.data.settings.ghostSeen['cut-v'])) === true);
    // игрок взялся за дело — рука уходит
    await S(() => { window.__sueta.app.ghost.coach.hand.hold = false; });
    const b0 = await station('board', 0, 0);
    await page.mouse.move(b0.x - 30, b0.y - 60);
    await page.mouse.down();
    check('нажал кнопку сам — рука ушла', (await ghostState()) === null);
    await page.mouse.up();
  }

  // ======================= три отказа ножа =======================
  if (want('refuse')) {
    // морковь уже выбрана, первая встреча показана. Росчерки мимо продукта: «Нож прошёл мимо продукта»
    const miss = async () => {
      const a = await station('board', -0.25, 0.13), b = await station('board', 0.25, 0.13);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move(b.x, b.y, { steps: 8 });
      await page.mouse.up();
      await wait(500);
    };
    await miss();
    await miss();
    check('после двух отказов призрака нет', (await ghostState()) === null && !(await coachState()).pending);
    await miss();
    const started = await freeze(0.5);
    const h = await coachState();
    check('после третьего отказа за 20 с рука пошла', started && h.id === 'cut-v' && h.why === 'refuse', JSON.stringify(h));
    check('показ после отказа короткий — 1,5 с', Math.abs(h.dur - 1.5) < 1e-6, `dur ${h.dur}`);
    await midReport('отказ ножа');
    await shot('02_knife_refuse');
    await unfreeze();
    // следующая тройка раньше чем через 20 с не показывает
    await miss();
    await miss();
    await miss();
    await wait(600);
    check('не чаще раза в 20 с: следующие три отказа подряд молчат', (await ghostState()) === null && !(await coachState()).pending);
  }

  // ======================= «?» =======================
  if (want('repeat')) {
    await S(() => { const c = window.__sueta.app.ghost.coach; c.hand.hold = false; c.hand.hide(); c.pending = null; });
    await click('#btn-help');
    const started = await freeze(0.6);
    const h = await coachState();
    check('«?» на доске: рука показывает нож ещё раз', started && h.id === 'cut-v' && h.why === 'repeat', JSON.stringify(h));
    await midReport('повтор');
    await shot('05_repeat');
    await unfreeze();
    // выйти из крупного плана: жеста в руках нет — «?» остаётся текстовой подсказкой
    await S(() => window.__sueta.session.closePanel());
    await waitFor(() => !window.__sueta.session.panel, 20000);
    await wait(900);
    await click('#btn-help');
    await wait(900);
    check('«?» в обзоре без жеста: руки нет', (await ghostState()) === null && !(await coachState()).pending);
  }

  // ======================= кот: рука над котом =======================
  if (want('cat')) {
    await fresh(2);
    await enterDay();
    await S(() => window.__sueta.session._startCatTheft('crab'));
    await waitFor(() => window.__sueta.session.cat.state === 'theft', 5000);
    const started = await freeze(0.5);
    const h = await coachState();
    check('первый catStart: рука пошла над котом', started && h.id === 'cat-wave' && h.why === 'first', JSON.stringify(h));
    const cat = await catScreen();
    const g = await midReport('кот', { ...cat, r: 150 });
    check('мах без нажатия кнопки', g?.down === false);
    await shot('03_cat_wave');
    // кота прогнали — рука уходит сама
    await S(() => window.__sueta.session.shoo());
    check('кота прогнали — рука ушла', await waitFor(() => document.getElementById('ghost-hand').classList.contains('hidden'), 20000));
    await unfreeze();
    // второй раз тот же жест сам не показывается
    await S(() => { window.__sueta.session.catNeeds.hunger = 0; window.__sueta.session._startCatTheft('crab'); });
    await wait(1500);
    check('второй раз кот приходит — руки нет (один раз за игру)', (await ghostState()) === null && !(await coachState()).pending);
  }

  // ======================= настройка «Подсказки рукой» =======================
  if (want('settings')) {
    await fresh(1);
    await click('[data-ui=settings]');
    check('в настройках есть «Подсказки рукой», по умолчанию включено', (await page.locator('[data-sw=ghost]').getAttribute('aria-checked')) === 'true' && /Подсказки рукой/.test(await S(() => document.querySelector('.dialog.settings').innerText)));
    const fit = await S(() => { const d = document.querySelector('.dialog.settings'); return [d.scrollHeight, d.clientHeight, d.scrollWidth, d.clientWidth]; });
    check('на 1280×720 диалог по-прежнему помещается без прокрутки', fit[0] <= fit[1] + 1 && fit[2] <= fit[3] + 1, JSON.stringify(fit));
    await shot('06_settings_on');
    await click('[data-sw=ghost]');
    check('мышью выключается: переключатель и сохранение', (await page.locator('[data-sw=ghost]').getAttribute('aria-checked')) === 'false' && (await setting('ghostHints')) === false);
    await shot('07_settings_off');
    await click('[data-ui=settingsBack]');
    // выбор сохранился после перезагрузки страницы
    await page.reload({ timeout: 180000 });
    await waitFor(() => !!window.__sueta?.save, 120000);
    check('после перезагрузки настройка осталась выключенной', (await setting('ghostHints')) === false);
    await enterDay();
    await S(() => window.__sueta.session.goTo('board'));
    await waitFor(() => window.__sueta.session.panel === 'board', 60000);
    await wait(900);
    await page.locator('#panel [data-act=boardSelect][data-args*=carrot]').click();
    await wait(4000);
    check('рука выключена — первая встреча её не показывает и ничего не запоминает', (await ghostState()) === null && !(await coachState()).pending && (await S(() => Object.keys(window.__sueta.save.data.settings.ghostSeen).length)) === 0);
    await click('#btn-help');
    await wait(1500);
    check('«?» при выключенной руке показывает только текст', (await ghostState()) === null && !(await coachState()).pending);
  }

  // ======================= «меньше движения» =======================
  if (want('motion')) {
    await fresh(1);
    await S(() => window.__sueta.app.settings.setReduceMotion(true));
    await enterDay();
    await S(() => window.__sueta.session.goTo('board'));
    await waitFor(() => window.__sueta.session.panel === 'board', 60000);
    await wait(900);
    await page.locator('#panel [data-act=boardSelect][data-args*=carrot]').click();
    const started = await freeze(0.5);
    const g = await ghostState();
    check('«Меньше движения»: рука стоит, путь — стрелкой', started && g?.stat === true && g.head === true && g.trail > 20, JSON.stringify({ stat: g?.stat, head: g?.head, trail: g?.trail }));
    await shot('08_reduced_motion');
  }

  // ======================= обход: доска, чистка, миска, практика =======================
  if (want('tour1')) {
    await fresh(1);
    await enterDay();
    await goStation('board');
    await S(() => window.__sueta.session.boardSelect('olivier:carrot'));
    await freeze(0.2); // первая встреча с ножом идёт сама — даём ей отыграть, потом показываем поперечный росчерк
    await unfreeze();
    await tourShot('cut-h', { where: 'морковь, поперёк' });
    // нож плашмя: показ смаха к миске (для показа флаг ставим напрямую — резать морковь до готовности тут незачем)
    await unfreeze();
    await S(() => { window.__sueta.session.board.flat = true; });
    const brd = await station('board', 0, 0);
    await tourShot('sweep', { near: { ...brd, r: 260 }, where: 'нож плашмя, к миске' });
    await unfreeze();
    await S(() => { window.__sueta.session.board.flat = false; });
    // чистка картофеля: достать из холодильника, принести на доску
    await unfreeze();
    await goStation('fridge');
    await S(() => window.__sueta.session.fridgeTake('olivier', 'peelPotato'));
    await S(() => window.__sueta.session.fastForward(4, () => !window.__sueta.session.action));
    await goStation('board');
    await S(() => window.__sueta.session.boardSelect('olivier:peelPotato'));
    await wait(600);
    const prod = await station('board', 0, 0);
    await tourShot('peel', { near: { ...prod, r: 200 }, where: 'картофель' });
    await unfreeze();
    await goStation('bowl');
    const bowl = await station('bowl', 0, 0);
    await tourShot('salt', { near: { ...bowl, r: 150 } });
    await tourShot('pour', { near: { ...bowl, r: 150 }, frac: 0.4 });
    await tourShot('stir', { near: { ...bowl, r: 150 }, where: 'миска' });
    // практика: кружочки и тёрка — свой продукт и своя станция (практика мешания падает в bowl3d, это не рука: см. заметки)
    await unfreeze();
    for (const [id, arg, st] of [['round', 'rounds:sausage', 'board'], ['grate', 'grate:cheese', 'board']]) {
      await S((a) => window.__sueta.app.ui('practiceGo', a), arg);
      await waitFor((st) => window.__sueta.session?.panel === st && window.__sueta.sv.camT >= 0.95, 120000, st);
      await wait(1200);
      await unfreeze();
      const c0 = await station(st, 0, 0);
      await tourShot(id, { near: { ...c0, r: 220 }, where: 'практика' });
    }
  }

  // ======================= обход: кот, уборка, плита =======================
  if (want('tour2')) {
    await fresh(2);
    await enterDay();
    await S(() => window.__sueta.session._startCatTheft('crab'));
    await waitFor(() => window.__sueta.session.cat.state === 'theft', 5000);
    await wait(600);
    await tourShot('cat-wave', { near: async () => ({ ...(await catScreen()), r: 170 }), where: 'обзор' });
    await unfreeze();
    await S(() => window.__sueta.session.shoo());
    await wait(1200);
    await goStation('catbowl');
    const cb = await station('catbowl', 0, 0);
    await tourShot('cat-kibble', { near: { ...cb, r: 200 } });
    await tourShot('cat-wand', { near: { ...cb, r: 260 } });
    await unfreeze();
    // лужа и залитая конфорка
    await S(() => window.__sueta.session._addPuddle('spill', { x: 1.05, z: 1.3, r: 0.32 }));
    await goStation('puddle');
    const pd = await station('puddle', 0, 0);
    await tourShot('wipe', { near: { ...pd, r: 200 }, where: 'лужа' });
    await unfreeze();
    await S(() => { window.__sueta.session.puddles = []; });
    await goStation('stove');
    // крутилка огня: 1-я конфорка стоит пустой, показываем на ней
    const k0 = await knobScreen(0);
    await tourShot('knob', { near: { ...k0, r: 130 } });
    await unfreeze();
    await S(() => { window.__sueta.session.burners[0].dirty = true; });
    await wait(500);
    await tourShot('wipe', { where: 'конфорка' });
    await unfreeze();
    await S(() => { window.__sueta.session.burners[0].dirty = false; });
    // продукт на конфорку: достали яйца → к плите
    await goStation('fridge');
    const t = await S(() => { const s = window.__sueta.session; const x = s.fridgeTasks().find((q) => q.product === 'egg') ?? s.fridgeTasks()[0]; return { d: x.dishId, st: x.stepId }; });
    await S((t) => window.__sueta.session.fridgeTake(t.d, t.st), t);
    await S(() => window.__sueta.session.fastForward(4, () => !window.__sueta.session.action));
    await goStation('stove');
    await wait(700);
    await tourShot('stove-place', { where: 'продукт в руках', frac: 0.7 });
    await unfreeze();
    // поставили, довели до готовности — оттаскиваем
    await S(() => { const s = window.__sueta.session; s.stoveDrop(0.15, -0.14); s.fastForward(3, () => !s.action); });
    await S(() => { const s = window.__sueta.session; const i = s.burners.findIndex((b) => b.state === 'boiling'); s.setHeat(i, 9); s.fastForward(400, () => s.burners[i].state === 'ready'); });
    await wait(700);
    await tourShot('stove-pot', { where: 'кастрюля готова', frac: 0.6 });
    check('есть готовая кастрюля, жест не пропал', await sessS("s.burners.some((b) => b.state === 'ready')"));
  }

  // ======================= обход: ёлка, подарок, посудомойка =======================
  if (want('tour3')) {
    await fresh(2);
    await enterDay();
    await goStation('tree');
    await S(() => { const s = window.__sueta.session; s.addTinselRoll('gold'); s.tinselPick('gold'); });
    await wait(600);
    const tree = await S(() => { const v = window.__sueta.view; const g = v.tree.g; const c = g.getWorldPosition(new g.position.constructor()); c.y += 1.0; c.project(v.sv.camera); const r = v.sv.canvas.getBoundingClientRect(); return { x: r.left + (c.x * 0.5 + 0.5) * r.width, y: r.top + (-c.y * 0.5 + 0.5) * r.height }; });
    await tourShot('tinsel', { near: { ...tree, r: 280 } });
    await unfreeze();
    await S(() => { const s = window.__sueta.session; const uid = s.addToy('bell'); s.pickToy(uid); });
    await wait(900);
    await tourShot('toy-drag', { where: 'игрушка в руке', frac: 0.7 });
    await unfreeze();
    await S(() => { const s = window.__sueta.session; s.treeHand = null; s.tinsel.tool = null; s.startGift(0); });
    await waitFor(() => /^c-gift/.test(window.__sueta.sv.camMode) && window.__sueta.sv.camT >= 0.95, 90000);
    await wait(900);
    const gift = await station('tree', 0, 0);
    await tourShot('gift-bow', { near: { ...gift, r: 140 }, frac: 0.6 });
    await tourShot('gift-paper', { near: { ...gift, r: 140 } });
    await tourShot('gift-lid', { near: { ...gift, r: 160 }, frac: 0.6 });
    await unfreeze();
    await S(() => window.__sueta.session.leaveGift());
    await wait(900);
    await goStation('dishwasher');
    const door = await station('dishwasher', 0, -0.19 + 0.15);
    await tourShot('washer-door', { near: { ...door, r: 160 }, frac: 0.6 });
    await unfreeze();
    await S(() => { const s = window.__sueta.session; s.equipment.bowl.clean = false; s._dwSetDoor(true); s.dwPick('bowl'); });
    await wait(1200);
    await tourShot('washer-drag', { where: 'дверца открыта, миска в руке', frac: 0.6 });
  }

  check('в консоли нет ошибок', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log(`итого: ${ok} OK, ${fail} FAIL`);
} finally {
  await browser.close();
}
process.exit(fail ? 1 : 0);
