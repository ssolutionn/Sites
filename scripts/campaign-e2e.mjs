// Сквозная браузерная проверка кампании: реальные клики и движения мыши.
// node scripts/campaign-e2e.mjs [url] [ширина] [высота] [часть]
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const W = Number(process.argv[3] || 1280), H = Number(process.argv[4] || 720);
const part = process.argv[5] || 'all';
const out = process.env.OUT || 'scripts/shots';
const tag = `${W}x${H}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => m.type() === 'error' && logs.push(`[error] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const checks = [];
const check = (name, ok, extra = '') => { checks.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); console.log(checks.at(-1)); };
const shot = (n) => page.screenshot({ path: `${out}/${tag}_${n}.png` });
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
async function waitFor(fn, timeout = 20000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); }
  return false;
}
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
async function label(text) { await page.locator('.st-label', { hasText: text }).first().click({ force: true }); }
async function goStation(text, id) {
  const cur = await sess('s.panel');
  if (cur === id) return true;
  if (cur === 'phone') await page.locator('#phone button', { hasText: 'Закрыть' }).first().click();
  else if (cur) await page.locator('#panel button', { hasText: 'Назад' }).first().click();
  await waitFor(() => !window.__sueta.session.panel && window.__sueta.sv.camT >= 1, 10000);
  const l = page.locator('.st-label', { hasText: text }).first();
  await l.waitFor({ state: 'visible', timeout: 15000 });
  for (let i = 0; i < 20; i++) {
    await wait(150);
    const b = await l.boundingBox();
    if (b && b.x > 0 && b.y > 0 && b.x + b.width < W && b.y + b.height < H) { await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); break; }
  }
  return waitFor((id) => window.__sueta.session.panel === id && window.__sueta.sv.camT >= 1, 25000, id);
}
async function btn(text) { await page.locator('#panel button:not([disabled]), #phone button:not([disabled]), #tip button, #recipe button', { hasText: text }).first().click(); }
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
const U = 0.042;
// Нарезка кубиками мышью: полоски, R, поперёк.
async function cutCubes() {
  for (let pass = 0; pass < 2; pass++) {
    for (let g = 0; g < 12; g++) {
      const wide = await sess(`(() => { const it = s.boardCur(); const w = it.pieces.filter(p => p.w > 1.25).sort((a,b)=>a.x-b.x)[0]; return w ? { x: w.x, z: w.z + w.d/2, w: w.w } : null; })()`);
      if (!wide) break;
      await click((wide.x + 1) * U, wide.z * U); await wait(80); await noAction();
      const n = await sess('s.boardCur().cuts');
      if (g > 10) break;
    }
    await page.keyboard.press('KeyR'); await wait(150);
  }
}
async function cutRounds() {
  const L = await sess('s.boardCur().log.length / 2');
  for (let x = -L + 0.3; x < L - 0.2; x += 0.5) { await click(x * U, 0); await wait(60); await noAction(); }
}
async function stir() {
  const pts = [];
  for (let i = 0; i <= 36 * 4.4; i++) { const a = (i / 36) * Math.PI * 2; pts.push([Math.cos(a) * 0.1, Math.sin(a) * 0.1]); }
  await drag(pts, 1);
}
async function grate() {
  const pts = [[0, 0.05]];
  for (let i = 0; i < 9; i++) pts.push([0, -0.05], [0, 0.05]);
  await drag(pts, 3);
}

try {
  await page.goto(url + '?dev&seed=3');
  await page.evaluate(() => localStorage.clear());
  await page.goto(url + '?dev&seed=3');
  await wait(2500);
  await shot('01_menu');
  await page.click('[data-ui=new]'); await wait(500);
  await shot('02_intro');
  await page.click('[data-ui=enter]'); await wait(1500);
  await shot('03_kitchen');

  // свободное перемещение кликом по полу и обход препятствий
  const floor = await S(() => { const v = window.__sueta.view; const p = v.worldToScreen(0.3, 0, 1.6); return { x: p.x * innerWidth / 100, y: p.y * innerHeight / 100 }; });
  await page.mouse.click(floor.x, floor.y);
  check('клик по полу — героиня идёт без панели', await waitFor(() => { const h = window.__sueta.session.heroine; return !h.target && Math.hypot(h.x - 0.3, h.z - 1.6) < 0.15; }, 20000) && (await sess('s.panel')) === null);
  check('путь обходит остров', (await sess('s.heroine.z')) > 1);
  const blocked = await S(() => { const v = window.__sueta.view; const p = v.worldToScreen(0, 0.9, 0.55); return { x: p.x * innerWidth / 100, y: p.y * innerHeight / 100 }; });
  await page.mouse.click(blocked.x, blocked.y + 2); await wait(200);

  // день 1
  check('плита', await goStation('Плита', 'stove'));
  await btn('Поставить вариться'); await noAction();
  check('кастрюля поставлена', (await sess('s.stove.state')) === 'boiling');
  check('доска', await goStation('Доска', 'board'));
  await btn('Морковь'); await wait(300);
  await shot('04_board');
  const p0 = await sess('s.boardCur().pieces[0]');
  // промах по пустому углу ограничивающего прямоугольника
  const missR = await S(([x, z]) => { const s = window.__sueta.session; return s.pointer('down', x, z); }, [(p0.x + 0.02) * U, (p0.z + 0.02) * U]);
  await S(() => window.__sueta.session.pointer('up', 0, 0));
  check('клик по пустому углу — промах без операции', missR === 'miss' && (await sess('s.boardCur().cuts')) === 0);
  await click(-1.37 * U, 0); await noAction();
  const ws = await sess('s.boardCur().pieces.map(p => +(p.w).toFixed(3))');
  check('разрез по координате мыши без привязки к сетке', ws.some((w) => Math.abs(w - 0.63) < 0.06), ws.join(' / '));
  await cutCubes();
  await shot('05_board_cubes');
  const q = await sess('s.boardQuality(s.boardCur()).score');
  check('морковь нарезана кубиками', q > 0.5, (q * 100).toFixed(0) + ' %');
  // смена продукта и возврат
  await btn('Яйцо'); await wait(200);
  await btn('Морковь'); await wait(200);
  check('смена продукта сохраняет части', (await sess('s.boardCur().product')) === 'carrot' && (await sess('s.boardCur().pieces.length')) > 4);
  await btn('В миску'); await wait(400);
  check('морковь в миске', await sess("s.stepDone('olivier','carrot')"));
  for (const name of ['Морковь', 'Колбаса', 'Огурец', 'Огурец', 'Яйцо', 'Яйцо']) {
    await btn(name); await wait(300); await cutCubes();
    if (await sess("s.cat.state === 'theft'")) { await shot('06_cat'); await page.locator('.alert button', { hasText: 'Прогнать' }).click(); }
    await btn('В миску'); await wait(300);
  }
  check('семь порций нарезаны', await sess("['carrot','carrot2','sausage','cucumber','cucumber2','egg','egg2'].every(k => s.stepDone('olivier', k))"));
  // кот: вызвать и прогнать
  if ((await sess('s.cat.state')) === 'home') {
    await btn('Колбаса').catch(() => {});
  }
  await S(() => window.__sueta.session.fastForward(Math.max(0, window.__sueta.session.stove.readyAt - window.__sueta.session.t + 0.5)));
  if (await sess('!!s.stove.overflow')) { await goStation('Плита', 'stove'); await btn('Убавить'); await noAction(); }
  check('плита (готово)', await goStation('Плита', 'stove'));
  await btn('Достать картофель'); await noAction();
  check('доска (картофель)', await goStation('Доска', 'board'));
  for (let i = 0; i < 2; i++) { await btn('Картофель'); await wait(300); await cutCubes(); await btn('В миску'); await wait(300); }
  check('миска', await goStation('Миска', 'bowl'));
  await btn('горошек'); await noAction(); await btn('майонез'); await noAction();
  await shot('07_bowl');
  // неподвижное удержание не перемешивает
  const c = await local(0.1, 0); await page.mouse.move(c.x, c.y); await page.mouse.down(); await wait(1500); await page.mouse.up();
  check('неподвижное удержание не перемешивает', (await sess('s.mixTurns()')) < 0.1);
  await stir();
  check('оливье готов круговыми движениями', await waitFor(() => window.__sueta.session.dishes.olivier.done, 5000), String(await sess('s.dishes.olivier.Q')));
  await shot('08_olivier_done');
  if (await sess('s.radio.broken')) { await goStation('Радио', 'radio'); const b = await page.locator('[data-hold=radio]').boundingBox(); await page.mouse.move(b.x + 20, b.y + 10); await page.mouse.down(); await waitFor(() => !window.__sueta.session.radio.broken, 30000); await page.mouse.up(); check('радио починено удержанием', !(await sess('s.radio.broken'))); }
  for (let i = 0; i < 3 && (await sess('s.puddles.length')); i++) { await goStation('Лужа', 'puddle'); await zig(0, 0, 0.5, 0.36, 9); await wait(300); }
  check('лужа убрана', (await sess('s.puddles.length')) === 0);
  await page.click('#btn-finish');
  check('итог дня 1', await waitFor(() => window.__sueta.mode === 'dayResult', 5000));
  await shot('09_day1_result');
  await page.reload(); await wait(2500);
  check('после перезагрузки день 1 сохранён', await S(() => window.__sueta.save.data.days[0].completed && window.__sueta.save.data.days[1].unlocked));
  await shot('10_menu_after_reload');

  // ---------- общие помощники для дней 2–7 ----------
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
    await page.click('#btn-finish');
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
    if (await sess("s.cat.state === 'theft'")) await page.locator('.alert button', { hasText: 'Прогнать' }).click();
    if (await sess('s.boardCur() && !s.boardCur().grater')) { await btn('В миску').catch(() => {}); await btn('На поднос').catch(() => {}); await btn('Готово').catch(() => {}); }
    await wait(300);
  }
  async function bowlAdds() {
    await goStation('Миска', 'bowl');
    for (let i = 0; i < 4; i++) {
      const lbl = await sess("(() => { const t = s.bowlTasks().find(t => t.type === 'add' && t.state === 'ready' && !t.block); return t ? t.label : null; })()");
      if (!lbl) break;
      await btn(lbl.split(' ').slice(-1)[0]); await noAction(); await wait(150);
    }
  }
  async function wash(itemLabel) {
    await goStation('Раковина', 'sink'); await btn(itemLabel); await wait(200);
    for (let i = 0; i < 6 && (await sess('!!s.sinkJob')); i++) await zig(0, 0, 0.32, 0.22, 9);
  }
  async function phoneOrder(product, qty) {
    await goStation('Телефон', 'phone'); await wait(300);
    await page.locator('#phone [data-tab=order]').click(); await wait(200);
    for (let i = 0; i < qty; i++) { await page.locator('#phone tr', { hasText: product }).locator('button', { hasText: '+' }).click(); await wait(120); }
    await shot(`phone_order_${product}`);
    await page.locator('#phone button', { hasText: 'Подтвердить заказ' }).click(); await wait(300);
  }
  async function collectAndUnpack() {
    await goStation('Телефон', 'phone'); await page.locator('#phone [data-tab=order]').click(); await wait(200);
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
      const storage = await S(async (id) => (await import('/src/campaign/data.js').catch(() => null)) ? null : null, id);
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

  // ---------- день 2 ----------
  await startNext();
  check('день 2 открыт', (await sess('s.day.id')) === 2);
  await phoneOrder('Кукуруза', 1);
  await wash('Миска');
  check('миска вымыта', await sess('s.equipment.bowl.clean'));
  await shot('d2_after_wash');
  await goStation('Телефон', 'phone'); await wait(500); await shot('d2_phone_messages');
  check('сообщения Верки с картинкой', (await page.locator('#phone .photo-card').count()) >= 0);
  for (const n of ['Крабовые палочки', 'Крабовые палочки', 'Яйцо', 'Яйцо', 'Огурец']) await boardDo(n);
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
  await boardDo('Сыр', 'grate');
  await boardDo('Яйцо'); await boardDo('Яйцо');
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
  await boardDo('Сельдь'); await boardDo('Сельдь'); await boardDo('Лук'); await boardDo('Морковь', 'grate'); await boardDo('Свёкла', 'grate'); await boardDo('Свёкла', 'grate');
  await S(() => window.__sueta.session.fastForward(Math.max(0, window.__sueta.session.stove.readyAt - window.__sueta.session.t + 0.5)));
  if (await sess('!!s.stove.overflow')) { await goStation('Плита', 'stove'); await btn('Убавить'); await noAction(); }
  await goStation('Плита', 'stove'); await btn('Достать картофель'); await noAction();
  await boardDo('Картофель', 'grate'); await boardDo('Картофель', 'grate');
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

  // ---------- день 6 ----------
  await startNext();
  await phoneOrder('Виноград', 1);
  await boardDo('Хлеб'); await boardDo('Сыр');
  await goStation('Доска', 'board'); await btn('Колбаса'); await wait(300); await cutRounds(); await shot('d6_rounds');
  if (await sess("s.cat.state === 'theft'")) { await shot('d6_cat'); await page.locator('.alert button', { hasText: 'Прогнать' }).click(); }
  await btn('На поднос'); await wait(300);
  await boardDo('Огурец', 'round');
  await trayItem('canape');
  const sk = await sess('s.dishes.canape.work.skewers.map(s => s.slots)');
  const piles = await S(async () => (await import('/src/campaign/layout.js').catch(() => null))?.CANAPE_PILES ?? null);
  const P = [{ x: -0.2, z: 0.165 }, { x: -0.07, z: 0.165 }, { x: 0.06, z: 0.165 }, { x: 0.19, z: 0.165 }];
  await drag([[P[0].x, P[0].z], [0.4, 0.3]], 5);
  check('мимо шпажки — кусочек вернулся', (await sess('s.canapeSupply().bread')) === 8);
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
  const cards = await page.locator('#panel .dish-card[data-dish]').count();
  for (let i = 0; i < 9; i++) {
    const card = page.locator('#panel .dish-card[data-dish]').filter({ hasNotText: '✓' }).first();
    const id = await card.getAttribute('data-dish');
    const free = await S(() => { const s = window.__sueta.session; const used = new Set(Object.values(s.table.placed)); for (let k = 0; k < 10; k++) if (!used.has(k)) return k; return -1; });
    const slot = await S(async (k) => { const v = window.__sueta.view; const L = await import('/src/campaign/layout.js').catch(() => null); return null; }, free);
    const sl = [[-0.27,-0.34],[0,-0.34],[0.27,-0.34],[-0.405,0],[-0.135,0],[0.135,0],[0.405,0],[-0.27,0.34],[0,0.34],[0.27,0.34]][free];
    const target = await S(([x, z]) => window.__sueta.view.localToScreen('table', x, z), sl);
    const b = await card.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 }); await page.mouse.up(); await wait(200);
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
  await shot('99_error');
  check('сценарий прерван', false, err.message.split('\n')[0]);
}
console.log('--- итог ---\n' + checks.join('\n'));
if (logs.length) console.log('--- console ---\n' + logs.slice(0, 20).join('\n'));
await browser.close();
