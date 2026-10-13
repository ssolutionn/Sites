// 0.11: кот мышью — крикнуть (F и кнопка), отогнать самой (клик по коту), покормить (потрясти пачку), поиграть («удочка»).
//   PW=… OUT=production/qa/evidence node scripts/v11-cat-shots.mjs http://127.0.0.1:4170/ [shout,chase,feed,play]
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
const shot = (n) => page.screenshot({ path: `${out}/v11_cat_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);

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
  // события дня мешают проверке — отключаем, кота запускаем сами
  await S(() => { window.__sueta.session.triggers = []; });
}
async function catScreen() {
  // экранные координаты кота (мировая точка → пиксели)
  return S(() => { const v = window.__sueta.sv; const c = v.cat.getWorldPosition(new v.cat.position.constructor()); c.y += 0.15; c.project(v.camera); const r = v.canvas.getBoundingClientRect(); return { x: r.left + (c.x * 0.5 + 0.5) * r.width, y: r.top + (-c.y * 0.5 + 0.5) * r.height }; });
}
async function startTheft() {
  await S(() => window.__sueta.session._startCatTheft('crab'));
  await waitFor(() => window.__sueta.session.cat.state === 'theft', 5000);
  await wait(900);
}

if (want('shout')) {
  await openDay(2);
  await startTheft();
  await shot('pill_buttons');
  check('в пилюле кота есть кнопки «крикнуть» и «отогнать самой»', (await S(() => !!document.querySelector('#alerts .alert .shout') && !!document.querySelector('#alerts .alert .chase'))));
  // F: до трёх попыток с паузой на перезарядку — шанс 50 %, поэтому проверяем механику, а не исход
  await S(() => { window.__sueta.session.rng = { next: () => 0.9 }; });
  await page.keyboard.press('KeyF'); await wait(400);
  check('неудачный крик: кот остался, подсказка «ухом не повёл»', (await sess("s.cat.state")) === 'theft' && /ухом не повёл/.test(await sess("s.hint?.text ?? ''")));
  await page.keyboard.press('KeyF'); await wait(300);
  check('сразу второй крик не проходит — голос сел', /Голос сел/.test(await sess("s.hint?.text ?? ''")));
  await S(() => { window.__sueta.session.shoutReadyAt = 0; window.__sueta.session.rng = { next: () => 0.1 }; });
  await page.locator('#alerts .alert .shout').click(); await wait(800);
  check('удачный крик кнопкой прогоняет кота', (await sess("s.cat.state")) === 'home');
  await shot('shout_done');
}

if (want('chase')) {
  await openDay(2);
  await startTheft();
  await S(() => { window.__sueta.session.rng = { next: () => 0.99 }; }); // крик бы не помог
  const c = await catScreen();
  await page.mouse.click(c.x, c.y);
  await wait(500);
  check('клик по коту: героиня пошла к нему', (await sess("!!s.heroine.target?.chase")));
  await shot('chase_walk');
  await waitFor(() => window.__sueta.session.cat.state === 'home', 120000);
  check('дошла — кот прогнан наверняка', (await sess("s.stats.chases")) === 1);
  await shot('chase_done');
}

if (want('feed')) {
  await openDay(2);
  await S(() => { const s = window.__sueta.session; s.catNeeds.hunger = 60; s.goTo('catbowl'); });
  await waitFor(() => window.__sueta.session.panel === 'catbowl', 30000);
  await wait(900);
  await shot('catbowl_dock');
  await page.locator('#panel button', { hasText: 'Корм' }).click(); await wait(300);
  check('пачка корма в руке', (await sess("s.catTool")) === 'kibble');
  const bowl = await S(() => window.__sueta.view.localToScreen('catbowl', 0, 0));
  const r = await S(() => { const b = window.__sueta.sv.canvas.getBoundingClientRect(); return { x: b.left, y: b.top }; });
  const bx = r.x + bowl.x, by = r.y + bowl.y;
  await page.mouse.move(bx, by); await page.mouse.down();
  for (let k = 0; k < 14 && (await sess("s.catTool")); k++) {
    await page.mouse.move(bx, by + (k % 2 ? 26 : -26), { steps: 3 }); await wait(130);
    if (k === 3) await shot('feed_shaking');
  }
  await page.mouse.up(); await wait(400);
  check('потряс над миской — кот накормлен', (await sess("s.catNeeds.hunger")) === 0 && (await sess("s.cat.state")) === 'eat');
  await shot('feed_done');
}

if (want('play')) {
  await openDay(2);
  await S(() => { const s = window.__sueta.session; s.catNeeds.boredom = 70; s.goTo('catbowl'); });
  await waitFor(() => window.__sueta.session.panel === 'catbowl', 30000);
  await wait(900);
  await page.locator('#panel button', { hasText: 'Удочка' }).click(); await wait(300);
  const bowl = await S(() => window.__sueta.view.localToScreen('catbowl', 0, 0));
  const r = await S(() => { const b = window.__sueta.sv.canvas.getBoundingClientRect(); return { x: b.left, y: b.top }; });
  const bx = r.x + bowl.x, by = r.y + bowl.y;
  await page.mouse.move(bx + 30, by); await page.mouse.down();
  for (let k = 0; k < 160 && (await sess("s.catTool")); k++) {
    await page.mouse.move(bx + Math.cos(k * 0.35) * 70, by + Math.sin(k * 0.35) * 28, { steps: 2 }); await wait(40);
    if (k === 20) await shot('play_wand');
  }
  await page.mouse.up(); await wait(400);
  check('водил бантиком — кот наигрался', (await sess("s.catNeeds.boredom")) === 0 && (await sess("s.cat.state")) === 'play');
  await shot('play_done');
}

check('в консоли нет ошибок', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`итого: ${ok} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
