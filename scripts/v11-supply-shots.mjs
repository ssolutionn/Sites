// 0.11 B: доставка — «Для ёлки» (игрушки и мишура), привезли → в коробке у ёлки; запас без разбора пакета.
//   PW=… OUT=production/qa/evidence node scripts/v11-supply-shots.mjs http://127.0.0.1:4170/
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4170/';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v11_supply_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const tap = (sel) => page.locator(sel).first().click({ timeout: 20000 });

await page.goto(url, { timeout: 180000 }); await wait(800);
await S(() => localStorage.clear());
await page.goto(url, { timeout: 180000 });
await waitFor(() => !!window.__sueta?.save, 120000);
await S(() => { const sv = window.__sueta.save; sv.data.days.forEach((d, i) => { if (i < 2) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; } }); sv.data.days[2].unlocked = true; sv.write(); });
await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(800);
await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(600);
await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await S(() => document.querySelector('[data-ui=enter]').click());
await waitFor(() => window.__sueta.mode === 'kitchen', 60000); await wait(800);
await S(() => { window.__sueta.session.triggers = []; });

await tap('#btn-phone'); await waitFor(() => window.__sueta.session.panel === 'phone'); await wait(900);
await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
await tap('#phone [data-nav=shop]'); await wait(600);
await page.waitForSelector('#phone h4:has-text("Для ёлки")', { timeout: 30000 }).catch(() => {});
const section = page.locator('#phone h4:has-text("Для ёлки")');
check('в магазине есть раздел «Для ёлки»', (await section.count()) === 1);
await section.scrollIntoViewIfNeeded(); await wait(300);
await tap('#phone .pcard:has(.pn:has-text("Красный шар")) button:has-text("+")'); await wait(200);
await tap('#phone .pcard:has(.pn:has-text("Красный шар")) button:has-text("+")'); await wait(200);
await tap('#phone .pcard:has(.pn:has-text("Золотая мишура")) button:has-text("+")'); await wait(400);
await shot('shop_tree');
check('в корзине два шара и моток', await S(() => { const d = window.__sueta.session.delivery.draft; return d['toy:ballRed'] === 2 && d['tinsel:gold'] === 1; }));
const cartText = await S(() => document.querySelector('#phone .cart-sum b')?.textContent ?? '');
check('сумма корзины считается в рублях', /Корзина: 2\d\d ₽/.test(cartText), cartText);
await S(() => window.__sueta.session.confirmOrder('self'));
// SwiftShader тянет игровое время медленно — ожидание магазина (35 с) прокручиваем самой сессией
await S(() => window.__sueta.session.fastForward(60, () => !window.__sueta.session.delivery.order));
await waitFor(() => !window.__sueta.session.delivery.order && window.__sueta.session.toys.length > 0, 60000);
await wait(1200);
const res = await S(() => { const s = window.__sueta.session; return { box: s.toysInBox().map((t) => t.id), gold: s.tinselLeft('gold') }; });
check('привезли: шары в коробке у ёлки', res.box.filter((x) => x === 'ballRed').length === 2, JSON.stringify(res));
check('привезли: моток золотой мишуры', res.gold >= 1, String(res.gold));
await waitFor(() => window.__sueta.save.data.toys.filter((t) => t.id === 'ballRed').length === 2, 40000);
check('игрушки попали в сохранение', await S(() => window.__sueta.save.data.toys.filter((t) => t.id === 'ballRed').length === 2));
await shot('delivered');
console.log('errors', errs.length, errs.slice(0, 5));
console.log(`${ok} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
