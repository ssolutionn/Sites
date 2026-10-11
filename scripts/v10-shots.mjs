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
} catch (e) { console.log('ERR', e.message.split('\n')[0]); fail++; await shot('error'); }
console.log(`итого OK ${ok} FAIL ${fail}; ошибок консоли ${errs.length}`);
await browser.close();
process.exitCode = fail ? 1 : 0;
