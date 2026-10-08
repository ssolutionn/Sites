// Снимки интерфейса без ?dev (как у игрока): меню, интро, HUD, доска, плита, раковина, миска.
// Запуск: npx vite preview --port 4173 & PW=/opt/node-tools/node_modules/playwright/index.mjs node scripts/ui-shots.mjs [url] [WxH]
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const [W, H] = (process.argv[3] || '1280x720').split('x').map(Number);
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/ui_${n}_${W}.png` });
async function waitFor(fn, timeout = 30000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
async function openPanel(id) {
  await S((id) => window.__sueta.session.goTo(id), id);
  await waitFor((id) => window.__sueta.session.panel === id && window.__sueta.sv.camT >= 1, 60000, id);
  await wait(700);
}
const closeTip = () => page.locator('#tip button').click({ timeout: 500 }).catch(() => {});
try {
  await page.goto(url); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url); await wait(2500);
  await shot('menu');
  const dev = await page.locator('#dev:not(.hidden)').count();
  console.log('dev panel visible:', dev);
  await page.click('[data-ui=new]'); await wait(600); await shot('intro');
  await page.click('[data-ui=enter]'); await wait(2000);
  await shot('kitchen');
  await openPanel('stove'); await closeTip(); await shot('stove');
  await page.locator('#panel button[data-act=placePot]').first().click(); await waitFor(() => !window.__sueta.session.action);
  await wait(300); await page.locator('#panel button[data-act=placePot]').first().click().catch(() => {}); await waitFor(() => !window.__sueta.session.action);
  await wait(800); await shot('stove_two');
  await openPanel('board'); await wait(300);
  await page.locator('#panel button[data-act=boardSelect]').first().click(); await wait(1500); await shot('board_tip');
  await closeTip(); await wait(500); await shot('board');
  await S(() => window.__sueta.session.fastForward(62));
  await openPanel('sink'); await closeTip(); await shot('sink');
  await openPanel('bowl'); await closeTip(); await shot('bowl');
  await S(() => window.__sueta.session.closePanel?.()); await wait(1500); await shot('kitchen_timers');
  await page.keyboard.press('Escape'); await wait(800); await shot('pause');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
