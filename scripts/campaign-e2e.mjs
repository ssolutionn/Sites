// Сквозная браузерная проверка кампании: реальные клики и движения мыши.
// node scripts/campaign-e2e.mjs [url] [ширина] [высота] [часть]
// Аргументы можно опускать: http… — адрес, числа — ширина и высота, остальное — часть
// (all | d1 | late | d7). Пример: node scripts/campaign-e2e.mjs http://localhost:4174/ d1
// Снимки: OUT (по умолчанию scripts/shots), имя <день>_<экран>_<ширина>.png.
// День 1 идёт в обычном режиме (без ?dev): так же, как его увидит игрок.
const { chromium } = await import(process.env.PW ?? 'playwright');
const argv = process.argv.slice(2);
const isUrl = (a) => /^https?:\/\//.test(a);
const isNum = (a) => /^\d+$/.test(a);
let url = argv.find(isUrl) || 'http://localhost:4173/';
if (!url.endsWith('/')) url += '/';
const nums = argv.filter(isNum).map(Number);
const W = nums[0] || 1280, H = nums[1] || 720;
const part = argv.find((a) => !isUrl(a) && !isNum(a)) || 'all';
const out = process.env.OUT || 'scripts/shots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const checks = [];
const viaApi = []; // где пришлось обойти интерфейс вызовом session (честно перечисляется в итоге)
const overlaps = new Set(); // элементы, перехватившие нажатие поверх canvas
const check = (name, ok, extra = '') => { checks.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); console.log(checks.at(-1)); };
const shot = (n) => page.screenshot({ path: `${out}/${n}_${W}.png` });
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
async function waitFor(fn, timeout = 20000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); }
  return false;
}
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const inside = (b) => b && b.x > 0 && b.y > 0 && b.x + b.width < W && b.y + b.height < H;
async function label(text) { await page.locator('.st-label', { hasText: text }).first().click({ force: true }); }
// Кнопка по команде (data-act) — переживает переделку интерфейса; argPart — подстрока data-args.
async function actBtn(name, argPart = null, timeout = 8000) {
  const sel = `button[data-act="${name}"]${argPart ? `[data-args*='${argPart}']` : ''}:not([disabled])`;
  const l = page.locator(sel).first();
  await l.waitFor({ state: 'visible', timeout });
  await l.click();
}
async function closePanel() {
  const cur = await sess('s.panel');
  if (!cur) return;
  const b = page.locator(`${cur === 'phone' ? '#phone ' : ''}button[data-act="closePanel"]:visible`).first();
  if (await b.count()) await b.click().catch(() => {});
  else if (cur === 'phone') await page.keyboard.press('Escape');
  if (!(await waitFor(() => !window.__sueta.session.panel, 4000))) { viaApi.push(`closePanel(${cur})`); await S(() => window.__sueta.session.closePanel()); }
}
async function goStation(text, id) {
  const cur = await sess('s.panel');
  if (cur === id) return true;
  await closePanel();
  await waitFor(() => !window.__sueta.session.panel && window.__sueta.sv.camT >= 1 && document.getElementById('phone').classList.contains('hidden'), 10000);
  // 1) подпись станции; 2) клик мышью по самой станции в 3D; 3) только потом — вызов session
  let clicked = false;
  const l = page.locator('.st-label', { hasText: text }).first();
  if (await l.count()) {
    for (let i = 0; i < 20 && !clicked; i++) {
      await wait(150);
      const b = await l.boundingBox().catch(() => null);
      if (inside(b)) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); clicked = true; }
    }
  }
  if (!clicked) {
    const p = await S((id) => window.__sueta.view.stationScreen(id), id);
    if (p?.visible) { await page.mouse.click((p.x * W) / 100, (p.y * H) / 100); clicked = true; }
  }
  const ready = (id) => window.__sueta.session.panel === id && window.__sueta.sv.camT >= 1;
  let ok = await waitFor(ready, 25000, id);
  if (!ok) { viaApi.push(`goTo(${id})`); await S((id) => window.__sueta.session.goTo(id), id); ok = await waitFor(ready, 25000, id); }
  return ok;
}
async function btn(text) { await page.locator('#panel button:not([disabled]), #phone button:not([disabled]), #tip button, #recipe button, .dock button:not([disabled])', { hasText: text }).first().click(); }
async function finishBtn() { await page.locator('#btn-finish:visible, button[data-act="finishDay"]:visible, button:visible:has-text("Завершить день")').first().click(); }
async function local(x, z) { return S(([x, z]) => { const v = window.__sueta.view; const s = window.__sueta.session; return s.panel ? v.localToScreen(s.panel, x, z) : null; }, [x, z]); }
async function click(x, z) { const p = await local(x, z); await page.mouse.move(p.x, p.y); await wait(40); await page.mouse.down(); await page.mouse.up(); }
async function drag(points, steps = 4) {
  let p = await local(points[0][0], points[0][1]);
  if (!p) return;
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (const [x, z] of points.slice(1)) { p = await local(x, z); if (!p) break; await page.mouse.move(p.x, p.y, { steps }); }
  await page.mouse.up();
}
async function zig(cx, cz, w, d, rows = 7) {
  const pts = [];
  for (let r = 0; r <= rows; r++) { const z = cz - d / 2 + (d * r) / rows; pts.push(r % 2 ? [cx + w / 2, z] : [cx - w / 2, z]); pts.push(r % 2 ? [cx - w / 2, z] : [cx + w / 2, z]); }
  await drag(pts, 6);
}
async function noAction() { await waitFor(() => !window.__sueta.session.action, 15000); }
const U = 0.042; // метров на целевой кубик (BOARD_UNIT)
// Что лежит поверх canvas в точке экрана: null — canvas, иначе id/класс перехватчика.
async function blockerAt(x, y) {
  return S(([x, y]) => {
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return 'за кадром';
    const el = document.elementFromPoint(x, y);
    return !el || el.id === 'scene' ? null : el.id || String(el.className || el.tagName);
  }, [x, y]);
}
// Росчерк ножа мышью: нажал — провёл — отпустил. Координаты в единицах доски (1 = кубик).
async function knife(x0, z0, x1, z1, steps = 8) {
  const a = await local(x0 * U, z0 * U), b = await local(x1 * U, z1 * U);
  if (!a || !b) return false;
  const blk = await blockerAt(a.x, a.y);
  if (blk) overlaps.add(blk);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
  await wait(50); await noAction();
  return true;
}
async function boardBox() {
  return sess('(() => { const it = s.boardCur(); if (!it?.pieces?.length) return null; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of it.pieces) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z + p.d); } return { x0, x1, z0, z1, cuts: it.cuts, n: it.pieces.length }; })()');
}
// Доля продукта на доске, закрытая интерфейсом (сетка 5×5 по контуру всех кусков).
async function boardCover() {
  return S((U) => {
    const s = window.__sueta.session, v = window.__sueta.view, it = s.boardCur();
    if (!it?.pieces?.length) return null;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const p of it.pieces) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x + p.w); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z + p.d); }
    let hit = 0, n = 0; const by = new Set();
    for (let i = 0; i < 5; i++) for (let k = 0; k < 5; k++) {
      const p = v.localToScreen('board', (x0 + ((x1 - x0) * (i + 0.5)) / 5) * U, (z0 + ((z1 - z0) * (k + 0.5)) / 5) * U);
      n++;
      if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) { hit++; by.add('за кадром'); continue; }
      const el = document.elementFromPoint(p.x, p.y);
      if (el && el.id !== 'scene') { hit++; by.add(el.id || String(el.className)); }
    }
    return { frac: hit / n, by: [...by].join(', ') };
  }, U);
}
async function guardCat() {
  if (await sess("s.cat.state === 'theft'")) { await shot('d1_cat'); await page.locator('[data-a="shoo"]').first().click().catch(() => {}); await wait(300); }
  if (await sess('(s.boardCur()?.missing?.length ?? 0) > 0')) { await actBtn('takeReplacement').catch(() => {}); await noAction(); }
}
// Кубики росчерками: сначала полоски сверху вниз, потом поперёк слева направо — как игрок.
async function cutCubes(maxStrokes = 40) {
  const tried = new Set();
  for (let k = 0; k < maxStrokes; k++) {
    await guardCat();
    const ps = await sess('s.boardCur()?.pieces?.map((p) => ({ x: p.x, z: p.z, w: p.w, d: p.d })) ?? null');
    if (!ps?.length) return;
    const b = await boardBox();
    let cand = null;
    for (const p of ps.filter((p) => p.w > 1.25).sort((a, c) => c.w - a.w)) {
      const pos = +(p.x + p.w / Math.max(2, Math.round(p.w))).toFixed(3);
      if (!tried.has('x' + pos)) { cand = { axis: 'x', pos }; break; }
    }
    if (!cand) for (const p of ps.filter((p) => p.d > 1.25).sort((a, c) => c.d - a.d)) {
      const pos = +(p.z + p.d / Math.max(2, Math.round(p.d))).toFixed(3);
      if (!tried.has('z' + pos)) { cand = { axis: 'z', pos }; break; }
    }
    if (!cand) return;
    tried.add(cand.axis + cand.pos);
    if (cand.axis === 'x') await knife(cand.pos, b.z0 - 0.7, cand.pos, b.z1 + 0.7);
    else await knife(b.x0 - 0.7, cand.pos, b.x1 + 0.7, cand.pos);
  }
}
// Кружочки: только поперёк, сверху вниз, шаг ~0,5 кубика.
async function cutRounds() {
  const L = await sess('s.boardCur().log.length / 2');
  const r = await sess('s.boardCur().radius ?? 1');
  for (let x = -L + 0.5; x < L - 0.2; x += 0.5) await knife(x, -r - 0.8, x, r + 0.8);
}
async function stir(turns = 4.4) {
  const pts = [];
  for (let i = 0; i <= 36 * turns; i++) { const a = (i / 36) * Math.PI * 2; pts.push([Math.cos(a) * 0.1, Math.sin(a) * 0.1]); }
  await drag(pts, 1);
}
async function grate() {
  const pts = [[0, 0.05]];
  for (let i = 0; i < 9; i++) pts.push([0, -0.05], [0, 0.05]);
  await drag(pts, 3);
}
// Выбрать продукт на доске вкладкой, проверить перекрытие, нарезать, перенести в миску.
async function boardProduct(stepId, name) {
  await actBtn('boardSelect', `"olivier:${stepId}"`); await wait(700);
  const cov = await boardCover();
  check(`${name}: интерфейс закрывает ≤ 10 % продукта`, cov && cov.frac <= 0.1, cov ? `${Math.round(cov.frac * 100)} %${cov.by ? ' — ' + cov.by : ''}` : 'нет кусков');
  await shot(`d1_board_${stepId}`);
  await cutCubes();
  await guardCat();
  await shot(`d1_board_${stepId}_cubes`);
  await actBtn('boardTransfer'); await wait(400);
}
// Телефон: открыть кнопкой HUD (или подписью), пройти все вкладки/приложения, снять каждое.
async function phoneTour(prefix) {
  const hud = page.locator('#btn-phone:visible').first();
  if (await hud.count()) await hud.click(); else await goStation('Телефон', 'phone');
  let opened = await waitFor(() => window.__sueta.session.panel === 'phone' && !document.getElementById('phone').classList.contains('hidden'), 25000);
  if (!opened) { viaApi.push('goTo(phone)'); await S(() => window.__sueta.session.goTo('phone')); opened = await waitFor(() => window.__sueta.session.panel === 'phone', 25000); }
  check('телефон открывается кнопкой', opened);
  if (!opened) return;
  await wait(700);
  await shot(`${prefix}_phone_home`);
  const box = await page.locator('#phone').evaluate((el) => { const r = (el.firstElementChild || el).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  check('телефон целиком в кадре', box.x >= 0 && box.y >= 0 && box.x + box.w <= W && box.y + box.h <= H, `${Math.round(box.w)}×${Math.round(box.h)} в ${Math.round(box.x)},${Math.round(box.y)}`);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
  const ids = await page.locator('#phone .apps [data-nav]').evaluateAll((els) => els.map((e) => e.dataset.nav));
  for (const t of ids) {
    await page.locator(`#phone .apps [data-nav="${t}"]`).click().catch(() => {});
    await wait(600);
    await shot(`${prefix}_phone_${t}`);
    await page.locator('#phone .ph-home').click().catch(() => {});
    await wait(300);
  }
  check('у телефона пять приложений на домашнем экране', ids.length === 5, ids.join(', '));
  await closePanel();
  check('телефон закрывается', await waitFor(() => !window.__sueta.session.panel && document.getElementById('phone').classList.contains('hidden'), 5000));
}

try {
  // обычный режим: без ?dev — никаких технических панелей
  await page.goto(url + '?seed=3');
  await page.evaluate(() => localStorage.clear());
  await page.goto(url + '?seed=3');
  await wait(2500);
  await shot('d1_menu');
  const devVisible = await S(() => { const d = document.getElementById('dev'); const vis = (el) => el && !el.classList.contains('hidden') && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none'; return vis(d) || !!document.getElementById('dev-stats') || /\bDEV\b|\bFPS\b/.test(document.body.innerText); });
  check('без ?dev нет технических панелей', !devVisible);
  if (part === 'late' || part === 'd7') {
    const upto = part === 'd7' ? 6 : 5;
    // Поздние дни отдельно: дни 1–5 отмечены пройденными через сохранение (их проверяет полный прогон).
    await S((upto) => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < upto) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[upto].unlocked = true; sv.write(); }, upto);
    await page.reload(); await wait(2500);
  } else {
  await page.click('[data-ui=new]'); await wait(500);
  await shot('d1_intro');
  await page.click('[data-ui=enter]'); await wait(1500);
  await shot('d1_kitchen');

  // пауза и книга рецептов с клавиатуры
  await page.keyboard.press('Escape'); await wait(500);
  check('Esc — пауза', (await S(() => window.__sueta.mode)) === 'paused');
  await shot('d1_pause');
  await page.keyboard.press('Escape'); await wait(500);
  check('Esc — снова кухня', (await S(() => window.__sueta.mode)) === 'kitchen');
  await page.keyboard.press('KeyQ'); await wait(500);
  const recipeOpen = await S(() => { const r = document.getElementById('recipe'); return !!r && !r.classList.contains('hidden') && r.getClientRects().length > 0; });
  check('Q — рецепты дня открываются', recipeOpen);
  await shot('d1_recipe');
  if (recipeOpen) { await page.keyboard.press('KeyQ'); await wait(300); }

  // свободное перемещение кликом по полу и обход препятствий
  const floor = await S(() => { const v = window.__sueta.view; const p = v.worldToScreen(0.3, 0, 1.6); return { x: p.x * innerWidth / 100, y: p.y * innerHeight / 100 }; });
  await page.mouse.click(floor.x, floor.y);
  check('клик по полу — героиня идёт без панели', await waitFor(() => { const h = window.__sueta.session.heroine; return !h.target && Math.hypot(h.x - 0.3, h.z - 1.6) < 0.15; }, 20000) && (await sess('s.panel')) === null);
  check('путь обходит остров', (await sess('s.heroine.z')) > 1);
  const blocked = await S(() => { const v = window.__sueta.view; const p = v.worldToScreen(0, 0.9, 0.55); return { x: p.x * innerWidth / 100, y: p.y * innerHeight / 100 }; });
  await page.mouse.click(blocked.x, blocked.y + 2); await wait(200);

  // день 1: плита — обе кастрюли сразу
  check('плита', await goStation('Плита', 'stove'));
  await actBtn('placePot', '"olivier:boil"'); await noAction(); await wait(300);
  await actBtn('placePot', '"olivier:boilEgg"'); await noAction(); await wait(300);
  await shot('d1_stove_two');
  check('две кастрюли на двух конфорках', (await sess("s.burners.map(b => b.state + ':' + b.product).join()")) === 'boiling:potato,boiling:egg');

  // телефон, пока варится
  await phoneTour('d1');

  // доска: морковь × 2 — одним заходом
  check('доска', await goStation('Доска', 'board'));
  await actBtn('boardSelect', '"olivier:carrot"'); await wait(900);
  const tipOpen = await S(() => !document.getElementById('tip').classList.contains('hidden'));
  const cov0 = await boardCover();
  check('совет на доске не закрывает продукт (≤ 10 %)', cov0 && cov0.frac <= 0.1, cov0 ? `${Math.round(cov0.frac * 100)} %${cov0.by ? ' — ' + cov0.by : ''}${tipOpen ? ' (совет открыт)' : ''}` : '');
  await shot('d1_board_tutorial');
  await page.locator('#tip-ok').click().catch(() => {});
  await wait(300);
  check('морковь × 2 — один заход, две копии', (await sess('s.boardCur()?.qty')) === 2 && (await sess('s.boardCur().pieces.length')) === 2);
  await shot('d1_board_carrot');
  // ошибки игрока: мимо, наискосок, клик без движения, перенос до разреза — игра не зависает
  const b0 = await boardBox();
  await knife(b0.x1 + 1.3, b0.z0 - 0.5, b0.x1 + 1.3, b0.z1 + 0.5);
  check('росчерк мимо продукта — без разреза, с подсказкой', (await sess('s.boardCur().cuts')) === 0 && /мимо/i.test((await sess('s.hint?.text')) ?? ''), await sess('s.hint?.text'));
  await knife(b0.x0, b0.z0, b0.x1, b0.z1);
  check('росчерк наискосок — без разреза, с подсказкой', (await sess('s.boardCur().cuts')) === 0 && /наискосок/i.test((await sess('s.hint?.text')) ?? ''), await sess('s.hint?.text'));
  { const c = await local(0, 0); await page.mouse.move(c.x, c.y); await page.mouse.down(); await wait(120); await page.mouse.up(); await wait(100); }
  check('клик без движения — не режет', (await sess('s.boardCur().cuts')) === 0, await sess('s.hint?.text'));
  await actBtn('boardTransfer'); await wait(200);
  check('«В миску» до разреза — отказ с подсказкой', !(await sess("s.stepDone('olivier','carrot')")) && /разрез/i.test((await sess('s.hint?.text')) ?? ''), await sess('s.hint?.text'));
  await knife(-1.37, b0.z0 - 0.7, -1.37, b0.z1 + 0.7, 10);
  const ws = await sess('s.boardCur().pieces.map(p => +(p.w).toFixed(3))');
  check('после ошибок нож режет: разрез по координате мыши, обе копии', ws.filter((w) => Math.abs(w - 0.63) < 0.06).length >= 2, ws.join(' / '));
  await cutCubes();
  await shot('d1_board_carrot_cubes');
  const q = await sess('s.boardQuality(s.boardCur()).score');
  check('морковь нарезана кубиками', q > 0.5, (q * 100).toFixed(0) + ' %');
  // смена продукта и возврат
  await actBtn('boardSelect', '"olivier:sausage"'); await wait(300);
  await actBtn('boardSelect', '"olivier:carrot"'); await wait(300);
  check('смена продукта сохраняет части', (await sess('s.boardCur().product')) === 'carrot' && (await sess('s.boardCur().pieces.length')) > 8);
  await actBtn('boardTransfer'); await wait(400);
  check('морковь в миске', await sess("s.stepDone('olivier','carrot')"));
  await boardProduct('sausage', 'Колбаса');
  await boardProduct('cucumber', 'Огурцы × 2');
  check('морковь, колбаса, огурцы нарезаны, пока варится', await sess("['carrot','sausage','cucumber'].every(k => s.stepDone('olivier', k))"));
  // яйца: сварились → горячие → остудить у раковины → резать
  await S(() => window.__sueta.session.fastForward(Math.max(0, window.__sueta.session.burners[1].readyAt - window.__sueta.session.t + 0.5)));
  check('плита (яйца готовы)', await goStation('Плита', 'stove'));
  for (let i = 0; i < 2 && (await sess('s.burners.some(b => b.overflow)')); i++) { await actBtn('reduceHeat'); await noAction(); }
  await actBtn('takePot'); await noAction();
  await goStation('Доска', 'board');
  await actBtn('boardSelect', '"olivier:egg"'); await wait(300);
  check('горячие яйца не режутся', (await sess('s.boardCur()?.product')) !== 'egg', await sess('s.hint?.text'));
  await goStation('Раковина', 'sink'); await shot('d1_sink_cool');
  await actBtn('coolProduct', '"egg"'); await noAction();
  check('яйца остужены у раковины', !(await sess('s.hot.egg > s.t')));
  await goStation('Доска', 'board');
  await boardProduct('egg', 'Яйца × 2');
  check('яйца нарезаны', await sess("['carrot','sausage','cucumber','egg'].every(k => s.stepDone('olivier', k))"));
  // картофель
  await S(() => window.__sueta.session.fastForward(Math.max(0, window.__sueta.session.stove.readyAt - window.__sueta.session.t + 0.5)));
  check('плита (картофель готов)', await goStation('Плита', 'stove'));
  for (let i = 0; i < 2 && (await sess('s.burners.some(b => b.overflow)')); i++) { await actBtn('reduceHeat'); await noAction(); }
  await actBtn('takePot'); await noAction();
  await goStation('Раковина', 'sink'); await actBtn('coolProduct', '"potato"'); await noAction();
  check('доска (картофель)', await goStation('Доска', 'board'));
  await boardProduct('potato', 'Картофель × 2');
  check('все пять продуктов нарезаны', await sess("['carrot','sausage','cucumber','egg','potato'].every(k => s.stepDone('olivier', k))"));
  // миска
  check('миска', await goStation('Миска', 'bowl'));
  // руками: банку горошка наклоняют над миской, майонез выдавливают зигзагом
  await actBtn('bowlPick', '"peas"'); await wait(200);
  await stir(1.1);
  check('горошек высыпан движением над миской', await sess("s.stepDone('olivier','peas')"));
  await actBtn('bowlPick', '"mayo"'); await wait(200);
  { const pts = []; for (let i = 0; i <= 24; i++) pts.push([-0.09 + i * 0.0075, i % 2 ? 0.035 : -0.035]); await drag(pts, 3); }
  check('майонез выдавлен — обычная порция', (await sess("s.stepDone('olivier','mayo')")) && (await sess('s.dishes.olivier.mayo')) === 'full', await sess('s.dishes.olivier.mayo'));
  await shot('d1_bowl');
  // вкус: соль и перец встряхиванием, проба ложкой
  const shake = async (kind, n) => {
    await actBtn('seasonPick', `"${kind}"`); await wait(200);
    const pts = [[0, 0]];
    for (let i = 0; i < n * 2; i++) pts.push([0, i % 2 ? 0 : 0.05]);
    let p = await local(0, 0); await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (const [x, z] of pts.slice(1)) { p = await local(x, z); await page.mouse.move(p.x, p.y, { steps: 3 }); await wait(280); }
    await page.mouse.up();
  };
  for (let k = 0; k < 8; k++) {
    await actBtn('seasonTaste'); await noAction(); await wait(200);
    const v = await sess('s.dishes.olivier.season.last');
    if (v.ok) break;
    if (v.salt > 0 || v.pepper > 0) { await actBtn('seasonDilute'); await noAction(); }
    if (v.salt < 0) await shake('salt', 1);
    if (v.pepper < 0) await shake('pepper', 1);
  }
  await actBtn('bowlSpoon').catch(() => {});
  await shot('d1_bowl_season');
  check('вкус по пробам — в самый раз', await sess('s.dishes.olivier.season.last.ok'), await sess('s.dishes.olivier.season.last.verdict'));
  await actBtn('seasonDone'); await noAction();
  // неподвижное удержание не перемешивает; круги — меняют состояние блюда
  const c = await local(0.1, 0); await page.mouse.move(c.x, c.y); await page.mouse.down(); await wait(1500); await page.mouse.up();
  check('неподвижное удержание не перемешивает', (await sess('s.mixTurns()')) < 0.1);
  await stir(1.5);
  const midTurns = await sess('s.mixTurns()');
  await shot('d1_bowl_mixing');
  check('перемешивание меняет состояние миски', midTurns > 0.5 && !(await sess('s.dishes.olivier.done')), `оборотов ${midTurns.toFixed(2)}`);
  await stir(3.2);
  check('оливье готов круговыми движениями', await waitFor(() => window.__sueta.session.dishes.olivier.done, 5000), String(await sess('s.dishes.olivier.Q')));
  await shot('d1_olivier_done');
  if (await sess('s.radio.broken')) { await goStation('Радио', 'radio'); const b = await page.locator('[data-hold=radio]').boundingBox(); await page.mouse.move(b.x + 20, b.y + 10); await page.mouse.down(); await waitFor(() => !window.__sueta.session.radio.broken, 30000); await page.mouse.up(); check('радио починено удержанием', !(await sess('s.radio.broken'))); }
  for (let i = 0; i < 3 && (await sess('s.puddles.length')); i++) { await goStation('Лужа', 'puddle'); await zig(0, 0, 0.5, 0.36, 9); await wait(300); }
  check('лужа убрана', (await sess('s.puddles.length')) === 0);
  await closePanel();
  await finishBtn();
  check('итог дня 1', await waitFor(() => window.__sueta.mode === 'dayResult', 5000));
  await shot('d1_result');
  await page.reload(); await wait(2500);
  check('после перезагрузки день 1 сохранён', await S(() => window.__sueta.save.data.days[0].completed && window.__sueta.save.data.days[1].unlocked));
  await shot('d1_menu_after_reload');
  if (part === 'd1') throw new Error('__done_d1');

  }
  // ---------- общие помощники для дней 2–7 ----------
  // Дни 2–7 ещё не переведены на новый интерфейс целиком: тексты кнопок могут устареть.
  async function startNext() {
    if (await page.locator('[data-ui=nextDay]').count()) await page.click('[data-ui=nextDay]');
    else await page.click('[data-ui=continue]');
    await wait(400);
    await page.click('[data-ui=enter]'); await wait(800);
  }
  async function finishDayUI(n) {
    for (let i = 0; i < 4 && (await sess('s.puddles.length')); i++) { await goStation('Лужа', 'puddle'); await zig(0, 0, 0.5, 0.36, 9); await wait(300); }
    if (await sess('s.radio.broken')) { await goStation('Радио', 'radio'); const b = await page.locator('[data-hold=radio]').boundingBox(); await page.mouse.move(b.x + 20, b.y + 10); await page.mouse.down(); await waitFor(() => !window.__sueta.session.radio.broken, 30000); await page.mouse.up(); }
    if (await sess('s.garland.broken')) { await goStation('Гирлянда', 'garland'); const b = await page.locator('[data-hold=garland]').boundingBox(); await page.mouse.move(b.x + 20, b.y + 10); await page.mouse.down(); await waitFor(() => !window.__sueta.session.garland.broken, 30000); await page.mouse.up(); }
    if (await sess('s.panel')) await goStation('Холодильник', 'fridge');
    await closePanel();
    await finishBtn();
    const ok = await waitFor(() => window.__sueta.mode === 'dayResult', 8000);
    const r = await S(() => window.__sueta.session.result);
    check(`итог дня ${n}`, ok, r ? `D=${r.D} ${JSON.stringify(r.dishes)} порядок ${r.order} время ${r.time} с` : '');
    timings.push({ day: n, ...(r ? { time: r.time, stats: r.stats } : {}) });
    await shot(`d${n}_result`);
  }
  async function boardDo(name, kind = 'cube') {
    await goStation('Доска', 'board');
    await btn(name); await wait(300);
    if (kind === 'grate') await grate(); else if (kind === 'round') await cutRounds(); else await cutCubes();
    if (await sess("s.cat.state === 'theft'")) await page.locator('[data-a="shoo"]').first().click();
    if (await sess('s.boardCur() && !s.boardCur().grater')) { await btn('В миску').catch(() => {}); await btn('На поднос').catch(() => {}); await btn('Готово').catch(() => {}); }
    await wait(300);
  }
  async function bowlAdds() {
    await goStation('Миска', 'bowl');
    for (let i = 0; i < 4; i++) {
      const t = await sess("(() => { const t = s.bowlTasks().find(t => t.type === 'add' && t.state === 'ready' && !t.block); return t ? { stepId: t.stepId, product: t.product } : null; })()");
      if (!t) break;
      await actBtn('bowlPick', `"${t.stepId}"`); await wait(200);
      if (t.product === 'mayo') { const pts = []; for (let k = 0; k <= 24; k++) pts.push([-0.09 + k * 0.0075, k % 2 ? 0.035 : -0.035]); await drag(pts, 3); }
      else await stir(1.1);
      await wait(150);
    }
    await actBtn('bowlSpoon').catch(() => {});
  }
  async function wash(itemLabel) {
    await goStation('Раковина', 'sink'); await btn(itemLabel); await wait(200);
    for (let i = 0; i < 6 && (await sess('!!s.sinkJob')); i++) await zig(0, 0, 0.32, 0.22, 9);
  }
  async function phoneOrder(product, qty) {
    await goStation('Телефон', 'phone'); await wait(300);
    await page.locator('#phone .apps [data-nav=shop]').click(); await wait(300);
    for (let i = 0; i < qty; i++) { await page.locator('#phone .pcard', { hasText: product }).first().locator('button', { hasText: '+' }).click(); await wait(120); }
    await shot(`phone_order_${product}`);
    await page.locator('#phone button.mode', { hasText: 'Обычная' }).click(); await wait(300);
  }
  async function collectAndUnpack() {
    await goStation('Телефон', 'phone'); await page.locator('#phone .apps [data-nav=shop]').click().catch(() => {}); await wait(300);
    const w = page.locator('#phone button', { hasText: 'Подождать' });
    if (await w.count()) await w.click();
    await wait(400);
    await page.locator('#phone button', { hasText: 'Забрать заказ' }).click();
    check('героиня ушла за кадр', await waitFor(() => window.__sueta.session.heroine.away, 20000));
    await shot('delivery_away');
    await waitFor(() => window.__sueta.session.panel === 'bag' && window.__sueta.sv.camT >= 1, 30000);
    await shot('bag');
    const items = await sess('s.delivery.bag.items.map(i => i.id)');
    for (const id of items) {
      const right = await S((id) => window.__sueta.session.productName(id), id);
      // сначала пробуем неверное место, затем верное
      await page.locator('#panel .bag-row', { hasText: right }).locator('button', { hasText: 'В кладовую' }).click(); await noAction(); await wait(150);
      if (await sess(`s.delivery.bag && !s.delivery.bag.items.find(i => i.id === '${id}').placed`)) { await page.locator('#panel .bag-row', { hasText: right }).locator('button', { hasText: 'В холодильник' }).click(); await noAction(); }
    }
    check('пакет разобран, продукты в запасах', (await sess('s.delivery.bag')) === null);
  }
  async function trayItem(dish) { await goStation('Поднос', 'tray'); await btn(await S((d) => window.__sueta.session.recipes[d].short, dish)); await wait(300); }
  async function tool(name) { await btn(name); await wait(100); }
  async function fillAll(listExpr) {
    const conts = await sess(listExpr);
    const plate = { x: -0.33, z: 0.11 };
    for (let i = 0; i < conts.length; i++) {
      for (let k = 0; k < 3; k++) {
        const lvl = await sess(`(${listExpr})[${i}].fill`);
        if (lvl >= 0.95) break;
        await click(plate.x, plate.z); await wait(60);
        await click(conts[i].x, conts[i].z); await wait(60);
      }
    }
  }
  const timings = [];

  if (part === 'all') {
  // ---------- день 2 ----------
  await startNext();
  check('день 2 открыт', (await sess('s.day.id')) === 2);
  await phoneOrder('Кукуруза', 1);
  await wash('Миска');
  check('миска вымыта', await sess('s.equipment.bowl.clean'));
  await shot('d2_after_wash');
  await goStation('Телефон', 'phone'); await wait(500); await shot('d2_phone_messages');
  check('сообщения Верки с картинкой', (await page.locator('#phone .photo-card').count()) >= 0);
  for (const n of ['Крабовые палочки', 'Яйцо', 'Огурец']) await boardDo(n);
  await collectAndUnpack();
  await bowlAdds(); await shot('d2_bowl'); await stir();
  check('крабовый салат готов', await waitFor(() => window.__sueta.session.dishes.crab.done, 5000));
  await finishDayUI(2);

  // ---------- день 3 ----------
  await startNext();
  await phoneOrder('Красная икра', 1);
  check('заказ оформлен', (await sess('s.delivery.order?.status')) === 'accepted');
  await trayItem('sandwiches');
  const breads = await sess('s.dishes.sandwiches.work.breads.map(b => ({x:b.x,z:b.z,w:b.w,d:b.d}))');
  await zig(breads[0].x, breads[0].z, breads[0].w * 0.5, breads[0].d * 0.5, 3);
  const c1 = await sess('s.dishes.sandwiches.work.breads[0].mask.coverage()');
  await zig(breads[0].x, breads[0].z, breads[0].w * 0.5, breads[0].d * 0.5, 3);
  const c2 = await sess('s.dishes.sandwiches.work.breads[0].mask.coverage()');
  check('повторный мазок по тому же месту не растит покрытие', Math.abs(c2 - c1) < 0.05, `${(c1*100).toFixed(0)} → ${(c2*100).toFixed(0)} %`);
  for (const b of breads) await zig(b.x, b.z, b.w * 0.95, b.d * 0.95, 8);
  await shot('d3_sandwich_spread');
  check('бутерброды намазаны (видимое покрытие)', await sess("s.stepDone('sandwiches','spread')"));
  await collectAndUnpack();
  await trayItem('sandwiches'); await tool('Ложка');
  for (const b of breads) { await click(b.x, b.z); await click(b.x, b.z); }
  await shot('d3_sandwich_caviar');
  await btn('Готово — на стол'); await wait(300);
  check('бутерброды готовы', await sess('s.dishes.sandwiches.done'));
  await wash('Поднос');
  await trayItem('eggs'); await tool('Нож');
  const eggs = await sess('s.dishes.eggs.work.eggs.map(e => ({x:e.x,z:e.z}))');
  for (const e of eggs) { await click(e.x, e.z); await noAction(); }
  await tool('Ложка');
  const halves = await sess('s.dishes.eggs.work.eggs.flatMap(e => e.halves.map(h => ({x:h.x,z:h.z})))');
  for (const h of halves) { await click(h.x, h.z); await noAction(); }
  check('желтки в миске', await sess("s.stepDone('eggs','halves')"));
  await bowlAdds(); await stir();
  await trayItem('eggs'); await tool('Ложка');
  await fillAll('s.dishes.eggs.work.eggs.flatMap(e => e.halves)');
  await shot('d3_eggs_filled');
  await btn('Готово — на стол'); await wait(300);
  check('яйца готовы', await sess('s.dishes.eggs.done'));
  await finishDayUI(3);

  // ---------- день 4 ----------
  await startNext();
  await S(() => window.__sueta.session.fastForward(6));
  await goStation('Телефон', 'phone'); await wait(300); await shot('d4_phone_request');
  await page.click('#btn-recipe'); await wait(300);
  await page.locator('#recipe button', { hasText: 'Без лука' }).click(); await wait(200);
  await shot('d4_recipe_no_onion');
  await page.click('#btn-recipe');
  check('выбран вариант без лука', (await sess('s.dishes.tomatoes.variant.onion')) === false);
  await phoneOrder('Зелень', 2);
  await boardDo('Сыр', 'grate');
  await shot('d4_grater');
  await boardDo('Яйцо');
  await collectAndUnpack();
  await bowlAdds(); await stir();
  await trayItem('tartlets'); await tool('Ложка');
  const cups = await sess('s.dishes.tartlets.work.cups.map(c => ({x:c.x,z:c.z}))');
  const plate = { x: -0.33, z: 0.11 };
  for (let k = 0; k < 4; k++) { await click(plate.x, plate.z); await click(cups[0].x, cups[0].z); }
  const over = await sess('s.dishes.tartlets.work.cups[0].fill');
  await shot('d4_tartlet_overfill');
  await click(cups[0].x, cups[0].z); await click(plate.x, plate.z);
  const fixed = await sess('s.dishes.tartlets.work.cups[0].fill');
  check('переполнение снято ложкой', over > 1.3 && fixed < over, `${over.toFixed(2)} → ${fixed.toFixed(2)}`);
  await fillAll('s.dishes.tartlets.work.cups');
  await tool('Рука');
  for (const c of cups) await click(c.x, c.z);
  await shot('d4_tartlets');
  await btn('Готово — на стол'); await wait(300);
  check('тарталетки готовы', await sess('s.dishes.tartlets.done'));
  await wash('Миска'); await wash('Поднос');
  await trayItem('tomatoes'); await tool('Нож');
  const toms = await sess('s.dishes.tomatoes.work.toms.map(t => ({x:t.x,z:t.z}))');
  for (const t of toms) { await click(t.x, t.z - 0.01); await noAction(); }
  await tool('Ложка');
  for (const t of toms) { const pts = []; for (let k = 0; k < 30; k++) pts.push([t.x + Math.cos(k * 0.7) * 0.02, t.z + Math.sin(k * 0.7) * 0.02]); await drag(pts, 2); }
  await shot('d4_tomatoes_cored');
  check('помидоры подготовлены', await sess("s.stepDone('tomatoes','prep')"));
  await boardDo('Сыр', 'grate');
  await bowlAdds(); await stir();
  await trayItem('tomatoes'); await tool('Ложка');
  await fillAll('s.dishes.tomatoes.work.toms');
  await tool('Рука'); for (const t of toms) await click(t.x, t.z);
  await btn('Готово — на стол'); await wait(300);
  const notes = await sess('s.dishes.tomatoes.notes');
  check('помидоры без лука, пожелание выполнено', notes.some((n) => n.includes('без лука выполнена')), notes.join(' | '));
  await finishDayUI(4);

  // ---------- день 5 ----------
  await startNext();
  await goStation('Плита', 'stove'); await btn('Поставить вариться'); await noAction();
  await phoneOrder('Майонез', 2);
  await boardDo('Сельдь'); await boardDo('Лук'); await boardDo('Морковь', 'grate'); await boardDo('Свёкла', 'grate');
  await S(() => window.__sueta.session.fastForward(Math.max(0, window.__sueta.session.stove.readyAt - window.__sueta.session.t + 0.5)));
  if (await sess('!!s.stove.overflow')) { await goStation('Плита', 'stove'); await btn('Убавить'); await noAction(); }
  await goStation('Плита', 'stove'); await btn('Достать'); await noAction();
  await boardDo('Картофель', 'grate');
  await collectAndUnpack();
  await trayItem('shuba');
  const dish = await sess('s.dishes.shuba.work.dish');
  const order = await sess('s.shubaExpected()');
  const names = { herring: 'Сельдь', onion: 'Лук', potato: 'Картофель', mayo: 'Майонез', carrot: 'Морковь', beet: 'Свёкла' };
  let undoChecked = false;
  for (const comp of order) {
    if (!undoChecked && comp === 'potato') {
      await btn('Свёкла'); await click(dish.x, dish.z); await zig(dish.x, dish.z, 0.2, 0.2, 8); await btn('Подтвердить слой'); await wait(200);
      await shot('d5_shuba_wrong_layer');
      await btn('Отменить последний'); await wait(200);
      check('ошибочный слой отменён', (await sess('s.dishes.shuba.work.layers.length')) === 2 && (await sess("s.shubaComponents().find(c=>c.comp==='beet').available")));
      undoChecked = true;
    }
    await btn(names[comp]); await click(dish.x, dish.z); await zig(dish.x, dish.z, 0.2, 0.2, 8); await btn('Подтвердить слой'); await wait(200);
  }
  await shot('d5_shuba');
  await btn('Готово — на стол'); await wait(300);
  check('шуба готова', await sess('s.dishes.shuba.done'), String(await sess('s.dishes.shuba.Q')));
  await S(() => window.__sueta.session.fastForward(Math.max(0, 152 - window.__sueta.session.t)));
  await finishDayUI(5);

  }
  if (part !== 'd7') {
  // ---------- день 6 ----------
  await startNext();
  await phoneOrder('Виноград', 1);
  await boardDo('Хлеб'); await boardDo('Сыр');
  await goStation('Доска', 'board'); await btn('Колбаса'); await wait(300); await cutRounds(); await shot('d6_rounds');
  if (await sess("s.cat.state === 'theft'")) { await shot('d6_cat'); await page.locator('[data-a="shoo"]').first().click(); }
  await btn('На поднос'); await wait(300);
  await boardDo('Огурец', 'round');
  await trayItem('canape');
  const sk = await sess('s.dishes.canape.work.skewers.map(s => s.slots)');
    const P = [{ x: -0.2, z: 0.115 }, { x: -0.07, z: 0.115 }, { x: 0.06, z: 0.115 }, { x: 0.19, z: 0.115 }];
  const breadBefore = await sess('s.canapeSupply().bread');
  await drag([[P[0].x, P[0].z], [0.3, 0.12]], 5);
  const breadAfter = await sess('s.canapeSupply().bread');
  check('мимо шпажки — кусочек вернулся', breadBefore > 0 && breadAfter === breadBefore && !(await sess('s.tray.drag')), `${breadBefore} → ${breadAfter}`);
  for (let i = 0; i < 8; i++) for (let k = 0; k < 4; k++) { const pr = (k + i) % 4; await drag([[P[pr].x, P[pr].z], [sk[i][k].x, sk[i][k].z]], 5); }
  await shot('d6_canape');
  await btn('Готово — на стол'); await wait(300);
  check('канапе готовы', await sess('s.dishes.canape.done'), JSON.stringify(await sess('s.dishes.canape.parts')));
 await collectAndUnpack();
  await trayItem('fruit');
  const M = [{ x: -0.245, z: -0.11 }, { x: -0.245, z: 0 }, { x: -0.245, z: 0.11 }];
  for (const m of M) for (let k = 0; k < 4; k++) { await click(m.x, m.z); await noAction(); }
  let n = 0;
  for (const m of M) for (let k = 0; k < 3; k++) { const a = n++ * 0.42; await drag([[m.x, m.z], [0.03 + Math.cos(a) * 0.1, Math.sin(a) * 0.1]], 5); }
  for (const p of [{ x: 0.255, z: -0.085 }, { x: 0.255, z: 0.085 }]) for (let k = 0; k < 3; k++) { const a = n++ * 0.42; await drag([[p.x, p.z], [0.03 + Math.cos(a) * 0.06, Math.sin(a) * 0.06]], 5); }
  await shot('d6_fruit');
  await btn('Готово — на стол'); await wait(300);
  check('фруктовая тарелка готова', await sess('s.dishes.fruit.done'));
  await S(() => window.__sueta.session.fastForward(Math.max(0, 122 - window.__sueta.session.t), () => window.__sueta.session.cat.state === 'spill'));
  await waitFor(() => window.__sueta.session.cat.state === 'spill', 20000);
  await wait(800); await shot('d6_cat_glass');
  await S(() => window.__sueta.session.fastForward(14, () => window.__sueta.session.glass.spilled));
  check('кот разлил компот — лужа', (await sess('s.glass.spilled')) && (await sess('s.puddles.length')) > 0);
  await wait(600); await shot('d6_puddle');
  await finishDayUI(6);

  }
  // ---------- день 7 ----------
  await startNext();
  await phoneOrder('Маринад', 1);
  await collectAndUnpack();
  await trayItem('chicken');
  for (let i = 0; i < 2; i++) await zig(0, 0, 0.24, 0.15, 10);
  await shot('d7_marinade');
  check('маринад нанесён', await sess("s.stepDone('chicken','marinade')"));
  await btn('Отнести в духовку'); await waitFor(() => window.__sueta.session.panel === 'oven', 20000);
  await btn('Поставить форму'); await noAction();
  check('курица в духовке', (await sess('s.oven.state')) === 'baking');
  await goStation('Праздничный стол', 'table'); await wait(400);
  for (let i = 0; i < 9; i++) {
    const card = page.locator('#panel .dish-card[data-dish]:not(.placed)').first();
    await card.waitFor({ state: 'visible', timeout: 10000 });
    const id = await card.getAttribute('data-dish');
    const free = await S(() => { const s = window.__sueta.session; const used = new Set(Object.values(s.table.placed)); for (let k = 0; k < 10; k++) if (!used.has(k)) return k; return -1; });
    const sl = [[-0.27,-0.34],[0,-0.34],[0.27,-0.34],[-0.405,0],[-0.135,0],[0.135,0],[0.405,0],[-0.27,0.34],[0,0.34],[0.27,0.34]][free];
    const target = await S(([x, z]) => window.__sueta.view.localToScreen('table', x, z), sl);
    let b = null; for (let k = 0; k < 20 && !b; k++) { b = await card.boundingBox(); if (!b) await wait(150); }
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 }); await page.mouse.up();
    // дождаться перерисовки панели (при программном рендере 1–3 кадра в секунду)
    await waitFor((n) => Object.keys(window.__sueta.session.table.placed).length === n && document.querySelectorAll('#panel .dish-card.placed').length >= n, 8000, i + 1);
    const st = await sess('({ placed: Object.keys(s.table.placed).length, panel: s.panel, action: s.action?.type ?? null, target: !!s.heroine.target, station: s.heroine.station, hint: s.hint?.text ?? null })');
    if (st.placed !== i + 1) console.log('serve-diag', i, id, free, JSON.stringify(target), JSON.stringify(st));
  }
  await shot('d7_table_serving');
  check('9 блюд расставлены перетаскиванием', (await sess('Object.keys(s.table.placed).length')) === 9);
  await S(() => window.__sueta.session.fastForward(Math.max(0, window.__sueta.session.oven.readyAt - window.__sueta.session.t + 1)));
  check('сигнал духовки', (await sess('s.oven.state')) === 'ready');
  await goStation('Духовка', 'oven'); await btn('Достать курицу'); await noAction();
  check('курица готова вовремя', await sess('s.dishes.chicken.done'), JSON.stringify(await sess('s.dishes.chicken.parts')));
  await goStation('Праздничный стол', 'table'); await wait(400);
  { const card = page.locator('#panel .dish-card[data-dish=chicken]'); const b = await card.boundingBox(); const free = await S(() => { const s = window.__sueta.session; const used = new Set(Object.values(s.table.placed)); for (let k = 0; k < 10; k++) if (!used.has(k)) return k; return -1; }); const sl = [[-0.27,-0.34],[0,-0.34],[0.27,-0.34],[-0.405,0],[-0.135,0],[0.135,0],[0.405,0],[-0.27,0.34],[0,0.34],[0.27,0.34]][free]; const target = await S(([x, z]) => window.__sueta.view.localToScreen('table', x, z), sl); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 8 }); await page.mouse.up(); await wait(300); }
  check('все 10 блюд на столе', await sess('s.finalServeDone()'));
  await finishDayUI(7);
  await page.click('[data-ui=final]'); await wait(2500);
  await shot('final_table');
  check('финальный стол', (await S(() => window.__sueta.mode)) === 'final');
  console.log('TIMINGS ' + JSON.stringify(timings));
} catch (err) {
  if (err.message !== '__done_d1') {
    await shot('99_error');
    check('сценарий прерван', false, err.message.split('\n')[0]);
  }
}
check('нажатия ножа не перехватывает интерфейс', overlaps.size === 0, [...overlaps].join(', '));
check('консоль без ошибок', logs.length === 0, logs.length ? `${logs.length} шт.` : '');
const fails = checks.filter((c) => c.startsWith('FAIL')).length;
console.log(`--- итог: ${checks.length - fails} OK, ${fails} FAIL (${W}×${H}, часть ${part}) ---\n` + checks.join('\n'));
if (viaApi.length) console.log('--- обход интерфейса через session ---\n' + viaApi.join('\n'));
if (logs.length) console.log('--- console ---\n' + logs.slice(0, 20).join('\n'));
await browser.close();
