// Лента «Андрея»: новые посты, мем, ИДЕАЛЬНОЕ оливье, лайк, своё фото, 31 декабря. Снимки 1280×720.
// node scripts/feed-shots.mjs http://localhost:4181/  (PW — путь к playwright, OUT — папка снимков)
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
const shot = (n) => page.screenshot({ path: `${out}/phone_feed_${n}.png` });
async function waitFor(fn, timeout = 30000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn)) return true; await wait(100); } return false; }
// Программный рендер медленный: ждём, пока экран приложения доиграет появление.
const settled = () => waitFor(() => { const sc = document.querySelector('#phone .app-screen'); return !sc || getComputedStyle(sc).opacity === '1'; }, 20000);
const frames = () => S(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const tap = async (sel) => { await page.locator(sel).first().click(); await frames(); await settled(); };
// Прокрутить ленту так, чтобы пост оказался вверху экрана телефона.
const scrollTo = (key) => page.locator('#phone .app-body').evaluate((b, k) => { const p = b.querySelector(`[data-post="${k}"]`); b.scrollTop = p.offsetTop - b.offsetTop - 8; }, key);
const layout = () => S(() => ({
  overflow: [...document.querySelectorAll('#phone .post')].filter((p) => p.scrollWidth > p.clientWidth + 1).map((p) => p.dataset.post),
  cutNames: [...document.querySelectorAll('#phone .post-h .who b')].filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent),
}));
async function startDay(i, t) {
  await S((d) => window.__sueta.app.ui('day', d), i); await wait(1200);
  await S(() => window.__sueta.app.ui('enter')); await wait(1500);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
  await S((sec) => window.__sueta.session.fastForward(sec), t);
}
async function openFeed() {
  await tap('#btn-phone'); await waitFor(() => window.__sueta.session.panel === 'phone'); await wait(1500);
  await page.locator('#tip button').click({ timeout: 1500 }).catch(() => {});
}
const go = { waitUntil: 'domcontentloaded', timeout: 90000 };
try {
  await page.goto(url, go); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url, go); await wait(4000);
  // День 5: история за 4 дня + два свежих поста и сообщение Верки
  await startDay(4, 40);
  console.log('unread', await S(() => [window.__sueta.session.phone.unread, window.__sueta.session.feedUnread()]));
  await openFeed();
  await shot('home_badge');
  await tap('#phone [data-nav=andrey]'); await wait(600);
  await shot('chats_badge');
  await tap('#phone [data-nav="andrey||feed"]'); await wait(700);
  await shot('top');
  console.log('после ленты unread', await S(() => window.__sueta.session.phone.unread), 'новых отмечено', await page.locator('#phone .post.new').count(), 'постов', await page.locator('#phone .post').count());
  await scrollTo('d3-cattree'); await wait(400); await shot('meme');
  await scrollTo('d1-catbowl'); await wait(400); await shot('meme_bowl');
  await scrollTo('d4-poll'); await wait(400); await shot('poll');
  await scrollTo('d1-olivier'); await wait(400); await shot('olivier');
  const like = page.locator('#phone [data-post="d1-olivier"] button.like');
  const before = await like.innerText();
  await like.click(); await wait(90); await shot('like_pop');
  await wait(400); await shot('liked');
  console.log('лайк', before.trim(), '→', (await page.locator('#phone [data-post="d1-olivier"] button.like').innerText()).trim(), 'прокрутка сохранена', await page.locator('#phone .app-body').evaluate((b) => b.scrollTop > 0));
  console.log('раскладка', JSON.stringify(await layout()));
  // своё фото в той же ленте
  await S(() => { const s = window.__sueta.session; s._finishDish('shuba', { prep: 92, comp: 100, asm: 100 }, []); });
  await page.locator('#phone .app-body').evaluate((b) => (b.scrollTop = 0)); await wait(300);
  await tap('#phone button[data-act=postPhoto]'); await wait(300);
  await S(() => window.__sueta.session.fastForward(62)); await wait(600);
  await page.locator('#phone .app-body').evaluate((b) => (b.scrollTop = 0)); await wait(300);
  await shot('myphoto');
  // 31 декабря: «а ещё ничего не нарезано»
  await page.keyboard.press('Escape'); await wait(600);
  await startDay(6, 100);
  await openFeed();
  await tap('#phone [data-nav=andrey]'); await wait(500);
  await tap('#phone [data-nav="andrey||feed"]'); await wait(700);
  await shot('d7_top');
  await scrollTo('d7-catpanic'); await wait(400); await shot('d7_meme');
  console.log('раскладка d7', JSON.stringify(await layout()));
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
