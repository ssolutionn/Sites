// 0.9: проверки третьего круга правок мышью. Части: crash (день 3 — зелень в миске), далее по фазам.
//   node scripts/v09-shots.mjs http://localhost:4173/ crash
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.WIDTH) || 1280, height: Number(process.env.HEIGHT) || 720 } });
await page.addInitScript(() => { const key = 'novogodnyaya-sueta.campaign'; const data = JSON.parse(localStorage.getItem(key) || '{"version":1,"days":[]}'); data.settings = { ...data.settings, quality: 'low' }; localStorage.setItem(key, JSON.stringify(data)); });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v9_${n}.png`, timeout: 90000 }).catch((e) => { fail++; console.log('shot fail', n, e.message.split('\n')[0]); });
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } throw new Error('Ожидание не выполнено: ' + fn.toString().slice(0, 120)); }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const click = (sel) => S((q) => document.querySelector(q)?.click(), sel);
const tip = () => page.locator('#tip button').click({ timeout: 600 }).catch(() => {});
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);

/** Открыть день n (1..7): прошлые дни отмечены пройденными. */
async function openDay(n) {
  await page.goto(url, { timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000);
  await S((n) => { const sv = window.__sueta.save; localStorage.clear(); sv.reset(); sv.data.days.forEach((d, i) => { if (i < n - 1) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[n - 1].unlocked = true; sv.data.settings.quality = 'low'; sv.write(); }, n);
  await page.reload({ timeout: 180000 }); await wait(1500);
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(800);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await click('[data-ui=enter]'); await wait(1200);
  await S(() => window.__sueta.sv.renderer.setSize(640, 360, false));
}
async function station(st) {
  await S((st) => window.__sueta.session.goTo(st), st);
  await waitFor((st) => window.__sueta.session.panel === st && window.__sueta.sv.camT >= 1, 60000, st);
  await tip();
}
const scr = (st, x, z) => S(([st, x, z]) => window.__sueta.view.localToScreen(st, x, z), [st, x, z]);

try {
  if (want('phone')) {
    await openDay(1);
    await S(() => { const s = window.__sueta.session; s.chatter = null; s.triggers = []; s.msgQueue = []; s.pushMessage('Верка', 'Фото в купальнике 🌊', { photo: 'swimsuit' }); });
    await station('phone');
    await page.locator('[data-nav="andrey"]').click();
    await page.locator('[data-nav="andrey|Верка|chats"]').click();
    await page.locator('.photo-failed').waitFor();
    check('неудачная загрузка фото только в ЛС', await page.locator('.photo-failed').count() === 1);
    check('никто не печатает постоянно', await page.locator('.typing').count() === 0);
    const input = page.locator('[aria-label="Сообщение"]');
    await input.fill('Не грузится 😅');
    // При обновлении телефона текст и курсор не исчезают.
    await S(() => { const s = window.__sueta.session; s.msgQueue.push({ at: s.t + 2, from: 'Верка', text: 'Тут плохой интернет' }); });
    await waitFor(() => !!document.querySelector('.typing'));
    check('черновик и фокус переживают появление «печатает»', await input.inputValue() === 'Не грузится 😅' && await input.evaluate((e) => e === document.activeElement));
    await page.locator('form[data-composer="replyChat"] button[type="submit"]').click();
    await waitFor(() => !!document.querySelector('.bubble.mine'));
    check('своя реплика появилась в чате', await page.locator('.bubble.mine').innerText().then((t) => t.includes('Не грузится 😅')));
    await S(() => window.__sueta.session.fastForward(5));
    await waitFor(() => !document.querySelector('.typing'));
    await shot('phone_dm');
    await page.locator('.back[data-nav="andrey||chats"]').click();
    await page.locator('[data-nav="andrey||feed"]').click();
    const pic = page.locator('[data-photo-like]').first();
    const id = await pic.getAttribute('data-photo-like');
    await pic.dblclick();
    await waitFor((id) => !!window.__sueta.session.phone.liked[id], 10000, id);
    await pic.dblclick();
    check('повторный двойной тап не снимает лайк', await S((id) => !!window.__sueta.session.phone.liked[id], id));
    await page.locator('.com-more').first().click();
    await page.locator('[aria-label="Комментарий"]').fill('Мой комментарий: вкусно!');
    await page.locator('form[data-composer="commentPost"] button[type="submit"]').click();
    await waitFor(() => [...document.querySelectorAll('.comments > .com.own')].some((e) => e.textContent.includes('Мой комментарий: вкусно!')));
    check('комментарий опубликован в открытой ветке', await page.locator('.comments > .com.own').count() === 1);
    await page.locator('.comments > .com.own').scrollIntoViewIfNeeded();
    await shot('phone_comments');
    const clock = await S(() => new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }));
    check('телефон показывает время устройства по минутам', await page.locator('.ph-status b').innerText() === clock);
  }
  if (want('wash')) {
    await openDay(2);
    await S(() => { const s = window.__sueta.session; s.chatter = null; s.triggers = []; });
    await station('sink');
    await page.locator('button[data-act="sinkSelect"][data-args*=bowl]').click();
    await wait(500);
    await shot('wash_dirty_bowl');
    const left = await scr('sink', -0.08, 0), right = await scr('sink', 0.08, 0);
    await page.mouse.move(left.x, left.y); await page.mouse.down();
    for (let k = 0; k < 20 && (await sess('!!s.sinkJob')); k++) {
      const p = k % 2 ? left : right;
      await page.mouse.move(p.x, p.y, { steps: 6 }); await wait(40);
    }
    await page.mouse.up();
    check('миска отмывается мышью в одной полосе', await sess('s.equipment.bowl.clean && !s.sinkJob'));
    await shot('wash_clean_bowl');
    check('нет ошибок рендера губки', errs.length === 0);
  }
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
  if (want('p1')) {
    const stroke = async (st, pts, steps = 10) => {
      let q = await scr(st, ...pts[0]); await page.mouse.move(q.x, q.y); await page.mouse.down();
      for (const pt of pts.slice(1)) { q = await scr(st, ...pt); await page.mouse.move(q.x, q.y, { steps }); }
      await page.mouse.up(); await wait(40);
    };
    // 14/16: звезда на ёлке гаснет → подойти к ёлке → удержать
    await openDay(2);
    await S(() => window.__sueta.session.lightsOff('star'));
    await wait(700);
    await shot('tree_star_off');
    await station('tree');
    check('у ёлки кнопка «Поправить звезду»', await S(() => !!document.querySelector('button[data-hold="star"]')));
    await wait(900); await tip(); // подсказка «звезда погасла» ставит игру на паузу
    const hb = await page.locator('button[data-hold="star"]').boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); const t0 = await sess('s.t'); await page.mouse.down(); await waitFor(() => !window.__sueta.session.star.broken, 8000); await page.mouse.up();
    check('звезда снова горит', (await sess('s.star.broken')) === false, `игровое время удержания ${((await sess('s.t')) - t0).toFixed(1)} с`);
    await wait(500); await shot('tree_star_on');

    // 8: морковь кубиком мышью → сигнал «нарезано», кнопка «В миску» пульсирует
    await openDay(1);
    await station('board');
    await S(() => document.querySelector('button[data-act="boardSelect"][data-args*="carrot"]')?.click()); await wait(1200);
    const body = await sess('({ w: s.boardCur().body.shape.w, d: s.boardCur().body.shape.d, zs: s.boardCur().body.copies.map((c) => c.cz) })');
    const U = 0.021;
    const z0 = Math.min(...body.zs) - body.d / 2 - 0.8, z1 = Math.max(...body.zs) + body.d / 2 + 0.8;
    for (let x = -body.w / 2 + 1; x < body.w / 2 - 0.3; x += 1) await stroke('board', [[x * U, z0 * U], [x * U, z1 * U]]);
    for (const cz of body.zs) for (let z = cz - body.d / 2 + 1; z < cz + body.d / 2 - 0.3; z += 1) await stroke('board', [[(-body.w / 2 - 0.8) * U, z * U], [(body.w / 2 + 0.8) * U, z * U]], 16);
    await wait(400);
    check('нарезка готова — сигнал', (await sess('s.boardCur()?.cutReady')) === true, `качество ${await sess('Math.round(s.boardQuality(s.boardCur()).score * 100)')} %`);
    check('кнопка «В миску» подсвечена', await S(() => !!document.querySelector('button.ready-pulse[data-act="boardTransfer"]')));
    await shot('board_cut_ready');
    await S(() => document.querySelector('button[data-act="boardTransfer"]')?.click()); await wait(600);
    // 1: в миске только морковь — мешается всё равно
    await station('bowl');
    const c = await scr('bowl', 0, 0);
    await page.mouse.move(c.x + 70, c.y); await page.mouse.down();
    for (let i = 0; i <= 60; i++) { const a = (i / 20) * Math.PI * 2; const q = await scr('bowl', Math.cos(a) * 0.1, Math.sin(a) * 0.1); await page.mouse.move(q.x, q.y); await wait(16); }
    await shot('bowl_free_stir');
    await page.mouse.up();
    check('морковь в миске перемешивается', (await sess('s.bowl.blend')) > 0.3, `blend ${await sess('s.bowl.blend.toFixed(2)')}`);
    check('шаг «перемешать» ещё не засчитан', (await sess("s.stepDone('olivier', 'mix')")) === false);
    // 2: соль и перец — точная норма видна
    await S(() => { const s = window.__sueta.session; const d = s.dishes.olivier; for (const st of d.recipe.steps) if (!['season', 'mix', 'taste'].includes(st.id)) d.steps[st.id].done = true; s.hot = {}; });
    await S(() => window.__sueta.session.closePanel()); await station('bowl'); await wait(600);
    const live = await S(() => [...document.querySelectorAll('[data-live]')].map((e) => e.textContent).join(' '));
    check('у миски видна норма: 4 соли и 2 перца', /4 щепотки/.test(live) && /2 щепотки/.test(live), live.slice(0, 90));
    await shot('bowl_season_norm');

    // 13: свёкла — нарисованный значок и корнеплод на тёрке
    await openDay(5);
    await station('fridge');
    check('у свёклы свой значок, не круг', await S(() => document.querySelectorAll('svg.picon').length > 0));
    await shot('fridge_beet_icon');
    await S(() => { const s = window.__sueta.session; s.dishes.shuba.steps.boilBeet.done = true; s.hot = {}; });
    await station('board');
    await S(() => document.querySelector('button[data-act="boardSelect"][data-args*="shuba:beet"]')?.click()); await wait(1200);
    check('свёкла на тёрке', (await sess("s.boardCur()?.product")) === 'beet');
    await shot('board_beet_grater');

    // 15: масло ложится там, где прошла мышь (левая половина ломтика)
    await openDay(3);
    await station('tray');
    await S(() => window.__sueta.session.traySelect('sandwiches')); await wait(800);
    const b0 = await sess('(({ x, z, w, d }) => ({ x, z, w, d }))(s.dishes.sandwiches.work.breads[0])');
    const pts = [];
    for (let r = 0; r <= 6; r++) { const z = b0.z - b0.d * 0.42 + (b0.d * 0.84 * r) / 6; const xl = b0.x - b0.w * 0.45, xr = b0.x - b0.w * 0.05; pts.push(r % 2 ? [xr, z] : [xl, z], r % 2 ? [xl, z] : [xr, z]); }
    await stroke('tray', pts, 6);
    const cov = await sess('s.dishes.sandwiches.work.breads[0].mask.coverage()');
    check('намазана левая половина', cov > 0.2 && cov < 0.75, `${Math.round(cov * 100)} %`);
    await shot('d3_butter_left_half');
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('cat')) {
    // кот на экране (центр + 15 см) в пикселях
    const catPx = () => S(() => { const { sv } = window.__sueta; const v = sv.cat.getWorldPosition(sv.cat.position.clone()); v.y += 0.15; v.project(sv.camera); const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; });
    const catSettled = () => waitFor(() => { const cv = window.__sueta.view.catVis; return !!cv && cv.segs[cv.seg]?.dur > 100; }, 20000);
    const waveAt = async (amp = 40) => { await catSettled(); const c = await catPx(); for (let k = 0; k < 8; k++) { await page.mouse.move(c.x + (k % 2 ? amp : -amp), c.y); await wait(30); } };
    // 10: кот заскучал → не поиграли → лезет на ёлку или к гирлянде; помахать мышью — убежал
    await openDay(2);
    await S(() => { const s = window.__sueta.session; s.catNeeds.hunger = 0; s.catNeeds.boredom = 49.9; });
    await waitFor(() => window.__sueta.session.alerts.some((a) => a.key === 'catBored'), 20000);
    check('кот просит поиграть', await sess("s.alerts.some((a) => a.key === 'catBored')"));
    await wait(400); await shot('cat_bored');
    await S(() => { window.__sueta.session.catNeeds.boredom = 85; });
    await waitFor(() => window.__sueta.session.cat.state === 'mischief', 20000);
    const kind = await sess('s.cat.kind');
    check('кот бесчинствует', !!kind, kind);
    check('на карточке нет кнопки «Прогнать»', await S(() => !document.querySelector('[data-a="shoo"]')));
    await wait(2500); await tip();
    await shot('cat_mischief_' + kind);
    await waveAt();
    await wait(400);
    check('помахала мышью над котом — убежал', (await sess('s.cat.state')) === 'home', await sess('s.cat.state'));
    check(`${kind} не погасла`, (await sess(`s.${kind}.broken`)) === false);
    // 7: кот у доски, а мы в нарезке — сначала выйти
    await station('board');
    await S(() => window.__sueta.session._startCatTheft());
    await wait(500);
    const bc = await scr('board', 0, 0);
    for (let k = 0; k < 6; k++) { await page.mouse.move(bc.x + (k % 2 ? 40 : -40), bc.y); await wait(50); }
    check('в нарезке махать бесполезно — подсказка выйти', (await sess('s.cat.state')) === 'theft' && /Выйди/.test(await sess("s.hint?.text ?? ''")));
    await shot('cat_theft_closeup');
    await page.keyboard.press('Escape'); await waitFor(() => window.__sueta.session.panel === null && window.__sueta.sv.camT >= 1, 10000);
    check('Esc в нарезке — выход в обзор, а не пауза', (await sess('s.panel')) === null && (await S(() => window.__sueta.mode)) === 'kitchen');
    await wait(600);
    await shot('cat_theft_overview');
    await waveAt();
    await wait(400);
    check('вышла в обзор, помахала — кот убежал от колбасы', (await sess('s.cat.state')) === 'home');
    // уведомления чаще: сообщения от разных людей
    await S(() => window.__sueta.session.fastForward?.(150));
    await wait(500);
    const froms = await sess('[...new Set(s.phone.messages.map((m) => m.from))]');
    check('пишут разные люди', froms.length >= 3, froms.join(', '));
    await station('phone'); await wait(800);
    await shot('phone_chats_chatter');
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('tree')) {
    // 24: подарки под ёлкой, игрушки за баллы, повесить на ёлку мышью, сохранится между днями
    await openDay(2);
    await S(() => { const sv = window.__sueta.save; sv.data.bonus = 200; sv.write(); window.__sueta.session.bonus.points = window.__sueta.session.bonus.banked = 200; });
    await station('tree');
    await wait(800); await tip();
    check('у ёлки три подарка', (await S(() => document.querySelectorAll('button[data-act="openGift"]').length)) === 3);
    await shot('tree_closeup_gifts');
    for (let k = 0; k < 3; k++) {
      await S(() => document.querySelector('button[data-act="openGift"]')?.click());
      await waitFor(() => !window.__sueta.session.action, 10000); await wait(300);
    }
    check('подарки открыты', (await sess('s.giftsLeft().length')) === 0);
    check('открытые подарки сохранены сразу', (await S(() => JSON.stringify(window.__sueta.save.data.gifts))) === '{"2":[0,1,2]}', await S(() => JSON.stringify(window.__sueta.save.data.gifts)));
    await S(() => { const s = window.__sueta.session; s.buyToy('ballGold'); s.buyToy('santa'); s.buyToy('icicle'); });
    await wait(500);
    const box = await sess('s.toysInBox().length');
    check('в коробке игрушки (подарки + покупки)', box >= 3, `${box}`);
    // повесить: выбрать в доке, кликнуть по ветке
    const pos = (i) => S((i) => { const { sv, view } = window.__sueta; const c = view.treeSlotScreen(i); return c; }, i);
    for (const slot of [1, 3, 7, 12].slice(0, box)) {
      const chip = page.locator('button[data-act="pickToy"]').first();
      if (!(await chip.count())) break;
      await chip.click(); await wait(200);
      const q = await pos(slot);
      await page.mouse.move(q.x, q.y); await wait(250); await page.mouse.click(q.x, q.y); await wait(300);
    }
    const hung = await sess('s.toys.filter((t) => t.slot != null).length');
    check('мышью повесили игрушки на ёлку', hung >= 3, `${hung}`);
    await wait(500); await shot('tree_toys_hung');
    check('игрушки на местах в сохранении', (await S(() => window.__sueta.save.data.toys.filter((t) => t.slot != null).length)) === hung);
    // кот сбивает игрушки
    await S(() => { const s = window.__sueta.session; s.closePanel(); s.garland.broken = s.star.broken = true; s.catNeeds.hunger = 0; s.catNeeds.boredom = 85; });
    await waitFor(() => window.__sueta.session.cat.state === 'mischief', 20000);
    await S(() => { window.__sueta.session.cat.deadline = window.__sueta.session.t + 0.3; });
    await waitFor(() => window.__sueta.session.toys.some((t) => t.fallen), 20000);
    await wait(1200); await tip();
    check('кот сбил игрушки на пол', (await sess('s.toys.filter((t) => t.fallen).length')) > 0);
    await shot('tree_toys_fallen');
    // новый день: ёлка наряжена, как оставили (сохранение не стираем — перезагрузка и день 3)
    const keep = await S(() => { const sv = window.__sueta.save; sv.data.days[1].completed = true; sv.data.days[1].best = sv.data.days[1].last = { D: 90, dishes: {}, order: 100, time: 0 }; sv.data.days[2].unlocked = true; delete sv.data.settings.inProgress; sv.write(); return sv.data.toys.length; });
    await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(1500);
    await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
    await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(800);
    await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await click('[data-ui=enter]'); await wait(1200);
  await S(() => window.__sueta.sv.renderer.setSize(640, 360, false));
    check('открыт день 3', (await sess('s.day.id')) === 3);
    check('на следующий день игрушки на месте', (await sess('s.toys.length')) === keep && keep >= 3, `${keep}`);
    await station('tree'); await wait(800); await tip();
    await shot('tree_next_day');
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
} catch (e) { fail++; console.log('ERR', e.stack); await shot('error'); }
console.log(`итого OK ${ok} FAIL ${fail}; ошибок консоли ${errs.length}`, errs.slice(0, 4));
await browser.close();
if (fail || errs.length) process.exitCode = 1;
