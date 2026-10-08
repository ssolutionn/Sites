// Телефон: домашний экран и все пять приложений, клики мышью (не замена e2e).
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/d1_phone2_${n}.png` });
async function waitFor(fn, timeout = 30000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return true; await wait(100); } return false; }
const tap = (sel) => page.locator(sel).first().click();
try {
  await page.goto(url); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url); await wait(2500);
  await page.click('[data-ui=new]'); await wait(500); await page.click('[data-ui=enter]'); await wait(1500);
  // готовое блюдо и пара сообщений — чтобы приложениям было что показать
  await S(() => { const s = window.__sueta.session; s.pushMessage('Верка', 'Смотри, какой у нас вид!', { photo: 'sea' }); s.bonus.points = 64; });
  await tap('#btn-phone'); await waitFor(() => window.__sueta.session.panel === 'phone'); await wait(900);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
  await shot('home');
  await tap('#phone [data-nav=shop]'); await wait(600); await shot('shop');
  await tap('#phone .pcard button:has-text("+")'); await wait(300); await page.locator('#phone .app-body').evaluate((e) => (e.scrollTop = 600)); await wait(300); await shot('shop_scroll');
  await tap('#phone .back'); await wait(400);
  await tap('#phone [data-nav=andrey]'); await wait(600); await shot('andrey_chats');
  await tap('#phone .chat-row'); await wait(500); await shot('andrey_chat');
  await tap('#phone .back'); await wait(300); await tap('#phone [data-nav="andrey||feed"]'); await wait(400); await shot('andrey_feed');
  await tap('#phone .ph-home'); await wait(400);
  await tap('#phone [data-nav=bank]'); await wait(600); await shot('bank');
  await tap('#phone button:has-text("⭐ 20")'); await wait(400); await shot('bank_bought');
  await tap('#phone .ph-home'); await wait(300);
  await tap('#phone [data-nav=book]'); await wait(600); await shot('book');
  await tap('#phone [data-nav="book|olivier"]'); await wait(600); await shot('book_olivier');
  await page.locator('#phone .app-body').evaluate((e) => (e.scrollTop = 900)); await wait(300); await shot('book_olivier_steps');
  await tap('#phone .ph-home'); await wait(300);
  await S(() => { const s = window.__sueta.session; s.goTo('phone'); });
  await tap('#phone [data-nav=timers]'); await wait(600); await shot('timers');
  console.log('decor', await S(() => JSON.stringify(window.__sueta.session.decor)), 'saved', await S(() => JSON.stringify(window.__sueta.save.data.decor)));
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
