// 0.10: проверки мышью и клавиатурой — подсказки, WASD и пробел, комментарии, ёлочный базар, ёлка, подарок руками.
//   PW=… OUT=production/qa/evidence node scripts/v10-shots.mjs http://localhost:4173/ tips,keys,comments,bazaar,tree,gift
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
const shot = (n) => page.screenshot({ path: `${out}/v10_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const tipVisible = () => S(() => !document.querySelector('#tip').classList.contains('hidden'));
const tipText = () => S(() => document.querySelector('#tip .tip-text')?.textContent ?? '');
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);

/** Открыть день n (1..7) с чистым сохранением; прошлые дни пройдены. */
async function openDay(n, keep = null) {
  await page.goto(url, { timeout: 180000 }); await wait(800);
  await S(() => localStorage.clear());
  await page.goto(url, { timeout: 180000 });
  errs.length = 0;
  await waitFor(() => !!window.__sueta?.save, 120000);
  await S(([n, keep]) => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < n - 1) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[n - 1].unlocked = true; if (keep) Object.assign(sv.data, keep); sv.write(); }, [n, keep]);
  await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(800);
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(600);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=enter]').click());
  await waitFor(() => window.__sueta.mode === 'kitchen', 60000); await wait(800);
}
async function station(st) {
  await S((st) => window.__sueta.session.goTo(st), st);
  await waitFor((st) => window.__sueta.session.panel === st && window.__sueta.sv.camT >= 1, 60000, st);
}
const closeTip = () => page.locator('#tip button').click({ timeout: 800 }).catch(() => {});

try {
  if (want('tips')) {
    // подсказка «пожелание гостей — в рецепте (Q)» закрывается сама, когда игрок нажал Q
    await openDay(2);
    await closeTip();
    await S(() => window.__sueta.session.fastForward(45)); // сообщение гостей с пожеланием
    await waitFor(() => /пожелание/.test(document.querySelector('#tip .tip-text')?.textContent ?? '') && !document.querySelector('#tip').classList.contains('hidden'), 20000);
    check('подсказка про пожелание и Q показана', /пожелание/.test(await tipText()) && (await tipVisible()), await tipText());
    await shot('tip_wish');
    await page.keyboard.press('KeyQ'); await wait(500);
    check('после Q подсказка закрылась сама', !(await tipVisible()));
    check('рецепт открыт', await S(() => !document.querySelector('#recipe').classList.contains('hidden')));
    await page.keyboard.press('KeyQ'); await wait(300);
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('keys')) {
    // WASD ведёт героиню, над станцией рядом — «␣ Доска», пробел открывает; у гирлянды пробел — удержание
    await openDay(1);
    await closeTip();
    const hr = () => S(() => { const h = window.__sueta.session.heroine; return { x: h.x, z: h.z, st: h.station, moving: h.moving }; });
    const p0 = await hr();
    await page.keyboard.down('KeyS');
    await waitFor(() => window.__sueta.session.heroine.moving, 10000);
    check('S — идёт к камере', (await hr()).z > p0.z, JSON.stringify(await hr()));
    await waitFor(() => !window.__sueta.session.heroine.moving || window.__sueta.session.heroine.z > -0.2, 20000);
    await page.keyboard.down('KeyA');
    await waitFor(() => window.__sueta.session.heroine.x < -0.35, 20000);
    await page.keyboard.up('KeyA'); await page.keyboard.up('KeyS'); await wait(300);
    const p1 = await hr();
    check('в остров не вошла', p1.z < 0.1 && (await S(() => { const s = window.__sueta.session; return s.nav.isFree(s.heroine.x, s.heroine.z); })), JSON.stringify(p1));
    await waitFor(() => document.querySelector('.st-label.near') != null, 10000);
    const near = await S(() => document.querySelector('.st-label.near')?.textContent ?? '');
    check('над доской подпись «Пробел · Доска»', /Пробел/.test(near) && /Доска/.test(near), near);
    await shot('keys_near');
    await page.keyboard.press('Space');
    await waitFor(() => window.__sueta.session.panel === 'board', 20000);
    check('пробел открыл доску', await sess('s.panel === "board"'));
    await page.keyboard.down('KeyW'); await wait(400); await page.keyboard.up('KeyW');
    check('в крупном плане W не уводит от доски', await sess('s.panel === "board"'));
    await page.keyboard.press('Escape'); await wait(400);
    await page.keyboard.down('KeyW');
    await waitFor(() => window.__sueta.session.heroine.z < -0.6, 20000);
    await page.keyboard.up('KeyW');
    check('Esc, затем W — ушла от доски', await sess('s.heroine.station === null && s.heroine.z < -0.5'));
    // гирлянда: подойти клавишами не обязательно — проверяем удержание пробелом
    await S(() => window.__sueta.session.lightsOff('garland'));
    await closeTip();
    await station('garland');
    await closeTip();
    await page.keyboard.down('Space');
    const fixed = await waitFor(() => window.__sueta.session.garland.broken === false, 30000);
    await page.keyboard.up('Space');
    check('удержание пробела чинит гирлянду', fixed);
    // кнопка с фокусом не нажимается пробелом
    await S(() => document.querySelector('#btn-help')?.focus());
    const tipBefore = await tipVisible();
    await page.keyboard.press('Space'); await wait(400);
    check('пробел не нажимает кнопку с фокусом', (await tipVisible()) === tipBefore);
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
  if (want('oven')) {
    // плита и духовка: в день без запекания дверца — часть плиты; в день курицы — своё место со своей меткой
    const toScreen = (p) => S((p) => { const sv = window.__sueta.sv; const v = new sv.camera.position.constructor(p[0], p[1], p[2]).project(sv.camera); const r = document.querySelector('canvas').getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; }, p);
    const door = [1.45, 0.42, -1.86], hob = [1.45, 0.92, -2.1];
    const clickAt = async (p) => { const q = await toScreen(p); await page.mouse.click(q.x, q.y); };
    const labelShown = (id) => S((icon) => [...document.querySelectorAll('.st-label')].some((l) => l.style.display !== 'none' && l.querySelector('.ic')?.textContent === icon), id);
    await openDay(1);
    await closeTip(); await wait(1500);
    check('день 1: метки духовки нет', !(await labelShown('🍗')) && (await labelShown('♨️')));
    await clickAt(door);
    await waitFor(() => !!window.__sueta.session.panel, 30000);
    check('день 1: клик по дверце ведёт к плите', await sess('s.panel === "stove"'), await sess('s.panel'));
    await openDay(7);
    await closeTip(); await wait(1500);
    check('день 7: у духовки своя метка 🍗', await labelShown('🍗'));
    await shot('oven_labels');
    await clickAt(door);
    await waitFor(() => !!window.__sueta.session.panel, 30000);
    check('день 7: клик по дверце — духовка', await sess('s.panel === "oven"'), await sess('s.panel'));
    await page.keyboard.press('Escape'); await wait(800);
    await clickAt(hob);
    await waitFor(() => window.__sueta.session.panel === 'stove', 30000);
    check('день 7: клик по конфоркам — плита', await sess('s.panel === "stove"'), await sess('s.panel'));
    check('нет ошибок консоли', errs.length === 0, errs.slice(0, 2).join(' | '));
  }
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fail++; await shot('error'); }
console.log(`итого OK ${ok} FAIL ${fail}; ошибок консоли ${errs.length}`);
await browser.close();
process.exitCode = fail ? 1 : 0;
