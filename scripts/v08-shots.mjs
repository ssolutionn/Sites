// 0.8: снимки и проверки мышью — сжатые уведомления в крупном плане, выход в меню посреди дня, предупреждения о сохранении.
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
const shot = (n) => page.screenshot({ path: `${out}/v8_${n}.png`, timeout: 90000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(100); } return false; }
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const click = (sel) => S((q) => document.querySelector(q)?.click(), sel);
const tip = () => page.locator('#tip button').click({ timeout: 600 }).catch(() => {});
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
try {
  await page.goto(url, { timeout: 180000 }); await wait(1500);
  await S(() => localStorage.clear()); await page.goto(url, { timeout: 180000 }); await wait(2500);
  await page.waitForSelector('[data-ui=new]', { timeout: 120000 }); await click('[data-ui=new]'); await wait(800);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 }); await click('[data-ui=enter]'); await wait(1500);

  // 1. крупный план доски: несколько уведомлений → значки, срочное — карточкой
  await S(() => window.__sueta.session.goTo('board'));
  await waitFor(() => window.__sueta.session.panel === 'board' && window.__sueta.sv.camT >= 1);
  await tip();
  await S(() => { const s = window.__sueta.session; s.boardSelect('olivier:sausage'); s.breakRadio(); if (s.garland) s.garland.broken = true; s._emit?.('garlandOff'); });
  await wait(1500);
  await shot('board_alerts_compact');
  check('в крупном плане блок уведомлений сжат', await S(() => document.getElementById('alerts').classList.contains('compact')));
  const chips = await S(() => [...document.querySelectorAll('#alerts .alert:not(.urgent)')].map((a) => ({ w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height), title: a.title })));
  check('обычные уведомления — значки (узкие)', chips.length > 0 && chips.every((c) => c.w <= 48), JSON.stringify(chips));
  // совет про радио не всплыл поверх работы, а ждёт
  check('совет про радио ждёт выхода из станции', await S(() => !document.getElementById('tip').textContent.includes('Радио замолчало')));
  await S(() => window.__sueta.session.closePanel?.());
  await wait(1500);
  check('в обзоре уведомления снова карточками', await S(() => !document.getElementById('alerts').classList.contains('compact')));
  await shot('overview_alerts_cards');

  // 2. пауза → «В меню» спрашивает подтверждение
  await S(() => window.__sueta.app.pause());
  await wait(500);
  await shot('pause');
  await click('[data-ui=exitAsk]'); await wait(500);
  await shot('exit_confirm');
  check('«В меню» посреди дня спрашивает подтверждение', await S(() => document.getElementById('overlay').textContent.includes('Выйти в меню?')));
  await click('[data-ui=pauseBack]'); await wait(400);
  check('«Остаться» возвращает на паузу', await S(() => document.getElementById('overlay').textContent.includes('Пауза')));
  await click('[data-ui=exitAsk]'); await wait(300);
  await click('[data-ui=menu]'); await wait(800);
  check('«Выйти в меню» открывает меню', await sess('true') === false || await S(() => !!document.querySelector('[data-ui=new],[data-ui=continue]')));

  // 3. предупреждение о сохранении в меню: хранилище отказывает в записи
  await S(() => { window.__sueta.save.storage = { getItem: () => null, setItem() { throw new Error('quota'); } }; });
  await S(() => { window.__sueta.save.write(); });
  await S(() => window.__sueta.app.toMenu());
  await S(() => window.__sueta.save.write());
  await wait(300);
  await S(() => document.querySelector('#overlay') && window.__sueta.app.ui?.('menu'));
  await wait(500);
  const warn = await S(() => document.querySelector('#overlay .warn')?.textContent ?? '');
  console.log('menu warn:', warn);
} catch (e) { console.log('ERR', e.message.split('\n')[0]); await shot('error'); }
console.log(`итого OK ${ok} FAIL ${fail}; ошибок консоли ${errs.length}`, errs.slice(0, 4));
await browser.close();
