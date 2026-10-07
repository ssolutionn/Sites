// Прицельные снимки механик 0.5 на свежей сборке (не замена e2e).
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4173/';
const out = process.env.OUT || 'scripts/shots';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
async function waitFor(fn, timeout = 30000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
async function openPanel(id) {
  await S((id) => window.__sueta.session.goTo(id), id);
  await waitFor((id) => window.__sueta.session.panel === id && window.__sueta.sv.camT >= 1, 60000, id);
  await wait(600);
}
async function btn(t) { await page.locator('#panel button:not([disabled]), #phone button:not([disabled])', { hasText: t }).first().click(); await wait(300); }
const log = (...a) => console.log(...a);
try {
  await page.goto(url + '?dev&seed=5'); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url + '?dev&seed=5'); await wait(2000);
  await shot('v5_menu');
  await page.click('[data-ui=new]'); await wait(400); await shot('v5_intro'); await page.click('[data-ui=enter]'); await wait(1500);
  await shot('v5_kitchen_hud');
  // две конфорки
  await openPanel('stove');
  await btn('Картофель'); await waitFor(() => !window.__sueta.session.action);
  await wait(400); await btn('Яйцо'); await waitFor(() => !window.__sueta.session.action);
  await wait(1500); await shot('v5_stove_two');
  log('burners', JSON.stringify(await sess('s.burners.map(b => b.state + ":" + b.product)')));
  // кот
  await S(() => { window.__sueta.session.catNeeds.hunger = 60; });
  await wait(800); await shot('v5_cat_hungry');
  await openPanel('catbowl'); await shot('v5_catbowl_panel');
  await btn('Покормить'); await waitFor(() => !window.__sueta.session.action);
  await page.click('#panel button:has-text("Назад")').catch(() => {});
  await wait(3500); await shot('v5_cat_eating');
  log('cat', await sess('s.cat.state'), await sess('Math.round(s.catNeeds.hunger)'));
  // яйца сварились → горячие → раковина
  await S(() => window.__sueta.session.fastForward(62));
  await openPanel('stove'); await btn('Достать'); await waitFor(() => !window.__sueta.session.action);
  await wait(1500); await shot('v5_stove_taken');
  await openPanel('sink'); await shot('v5_sink_cool');
  // вкус: подготовим миску (все шаги, кроме вкуса)
  await S(() => { const s = window.__sueta.session; const d = s.dishes.olivier; for (const st of d.recipe.steps) if (!['season', 'mix'].includes(st.id)) d.steps[st.id].done = true; s.bowl.owner = 'olivier'; s.bowl.contents = [{ product: 'carrot', kind: 'pieces', pieces: Array(16).fill(0).map((_, i) => ({ x: i % 4, z: i >> 2, w: 1, d: 1 })) }, { product: 'potato', kind: 'pieces', pieces: Array(16).fill(0).map((_, i) => ({ x: i % 4, z: i >> 2, w: 1, d: 1 })) }, { product: 'mayo', kind: 'add' }]; });
  await openPanel('bowl');
  await btn('Соль'); await waitFor(() => !window.__sueta.session.action); await btn('Соль'); await waitFor(() => !window.__sueta.session.action);
  await btn('Попробовать'); await wait(200); await shot('v5_taste_popup'); await waitFor(() => !window.__sueta.session.action); await wait(300);
  await shot('v5_bowl_season');
  log('season', JSON.stringify(await sess('s.dishes.olivier.season')));
  // телефон: деньги и способы доставки
  await S(() => { const s = window.__sueta.session; s.draftSet('mayo', 1); });
  await openPanel('phone'); await page.click('#phone [data-tab=order]'); await wait(800); await shot('v5_phone_order');
  await page.click('#phone button:has-text("Закрыть")'); await wait(500);
  // итог дня (dev)
  await page.locator('[data-d=skipDay]').click(); await wait(500);
  await page.click('#btn-finish'); await wait(1500); await shot('v5_day_result');
  // журнал, испытания, стрим
  await page.click('[data-ui=journal]'); await wait(800); await shot('v5_journal');
  await page.click('[data-ui=menu]'); await wait(800);
  await page.$eval('[data-ui=challenges]', (b) => b.click()); await wait(800); await shot('v5_challenges');
  await page.click('[data-ui=menu]'); await wait(500);
  await page.$eval('[data-ui=stream]', (b) => b.click()); await wait(500);
  await page.check('#stream-test'); await page.click('[data-ui=streamOn]'); await wait(500); await shot('v5_stream_menu');
  await page.click('[data-ui=menu]'); await wait(500);
  // испытание дня с голосованием
  await page.$eval('[data-ui=challenges]', (b) => b.click()); await wait(500); await page.click('[data-ui=challengeGo]'); await wait(800); await shot('v5_challenge_intro');
  await page.click('[data-ui=enter]'); await wait(1500);
  for (let i = 0; i < 3; i++) await page.locator('#votes [data-vote="!кот"]').click();
  await page.locator('#votes [data-vote="!радио"]').click();
  await wait(500); await shot('v5_votes');
  log('mods', JSON.stringify(await sess('s.mods')), 'votes ok');
  // финал с гостями
  await S(() => { const sv = window.__sueta.save; sv.data.days.forEach((d) => { d.completed = true; d.unlocked = true; d.best = d.last = { D: 88, dishes: { olivier: 95, crab: 80, sandwiches: 92, eggs: 70, tartlets: 90, tomatoes: 60, shuba: 85, canape: 93, fruit: 99, chicken: 91 }, order: 100, time: 300, stars: 2 }; d.stars = 2; d.medals = ['fast']; }); sv.data.finished = true; delete sv.data.settings.inProgress; sv.data.settings.stream = { on: false }; sv.write(); });
  await page.reload(); await wait(2500);
  await page.click('[data-ui=continue]'); await wait(9000); await shot('v5_final_guests');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('v5_error'); }
console.log('errors', errs.length, errs.slice(0, 5).join(' | '));
await browser.close();
