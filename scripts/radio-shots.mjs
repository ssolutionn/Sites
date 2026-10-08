// Радио крупным планом: ручка настройки мышью, станции, поломка и ремонт ручкой; уровни звука офлайн-рендером.
// Запуск: npx vite build && npx vite preview --port 4180 --strictPort; затем
// PW=/opt/node-tools/node_modules/playwright/index.mjs node scripts/radio-shots.mjs http://localhost:4180/
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://localhost:4180/';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(180000);
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const T0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - T0) / 1000).toFixed(0)}s`, ...a);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/radio_${n}.png` });
async function waitFor(fn, timeout = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await wait(150);
  }
  return false;
}
const sess = (expr) => S(new Function(`const s = window.__sueta.session; return (${expr});`));
const scr = (x, z) => S(([x, z]) => window.__sueta.view.localToScreen('radio', x, z), [x, z]);
const K = { x: 0.162, z: 0.055 }; // RADIO.knob в координатах панели (z — вниз)
const knobPt = (a, r = 0.045) => scr(K.x + Math.cos(a) * r, K.z + Math.sin(a) * r);
const tip = () => page.locator('#tip button').click({ timeout: 700 }).catch(() => {});
const state = () => sess("({ f: +s.radio.freq.toFixed(2), tuned: s.radioTuning().tuned?.name ?? null, sig: +s.radioTuning().signal.toFixed(2), broken: s.radio.broken, playing: window.__sueta.radio.playing, station: window.__sueta.radio.stationId })");

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(1500);
  await S(() => localStorage.clear());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(2500);
  await page.click('[data-ui=new]');
  await wait(500);
  await page.click('[data-ui=enter]');
  await wait(1500);
  log('кухня', await sess('s.panel'), 'звук до жеста:', await S(() => window.__sueta.radio.playing));
  // героиня сразу у радио (ходьба при 1–3 FPS слишком долгая)
  await S(() => {
    const s = window.__sueta.session;
    Object.assign(s.heroine, { x: -1.85, z: -1.6, station: 'radio', facing: Math.PI, path: [], target: null });
    s._openPanel('radio');
  });
  await waitFor(() => window.__sueta.sv.camT >= 1);
  await wait(800);
  await shot('tip');
  await tip();
  // ▶ ▶ — к «Ретро 102» (клик — жест пользователя, звук разблокируется)
  await page.locator('#panel .radio-seek').nth(1).click();
  await page.locator('#panel .radio-seek').nth(1).click();
  await wait(2500);
  log('после ▶▶', await state(), 'readout:', await page.locator('.radio-readout').innerText());
  await shot('tuned');
  // ручка мышью: по часовой ≈ четверть оборота → между станциями
  let p = await knobPt(-Math.PI / 2);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    p = await knobPt(-Math.PI / 2 + (i / 12) * (Math.PI / 2));
    await page.mouse.move(p.x, p.y, { steps: 2 });
  }
  await wait(2500);
  log('ручка в руке', await state());
  await shot('turning_static');
  await page.mouse.up();
  await wait(400);
  log('отпустила', await state(), 'readout:', await page.locator('.radio-readout').innerText());
  // поломка: треск, ремонт удержанием ручки
  await S(() => window.__sueta.session.breakRadio());
  await wait(600);
  await tip();
  p = await knobPt(0, 0.01);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await waitFor(() => window.__sueta.session.radio.progress > 0.8, 40000);
  log('ремонт идёт', await state(), 'readout:', await page.locator('.radio-readout').innerText());
  await shot('broken_repair');
  await waitFor(() => !window.__sueta.session.radio.broken, 40000);
  await page.mouse.up();
  log('починено', await state());
  // уровни: офлайн-рендер 6 с каждой станции и шума (до общего master 0,5)
  const levels = await S(async () => {
    const RM = window.__sueta.radio.constructor;
    const res = {};
    for (const id of ['elka', 'fireplace', 'retro', 'snow', null]) {
      const off = new OfflineAudioContext(1, 44100 * 6, 44100);
      const m = new RM({ ctx: off, master: off.destination, muted: false });
      m._build(off);
      clearInterval(m.timer);
      m._switch(id);
      m._levels(id ? { music: 1, noise: 0, signal: 1, near: false, station: m.stations.find((st) => st.id === id) } : { music: 0, noise: 1, signal: 0, near: false });
      m._tick(6);
      const d = (await off.startRendering()).getChannelData(0);
      let peak = 0, sum = 0, n = 0;
      for (let i = 22050; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); sum += d[i] * d[i]; n++; }
      res[id ?? 'static'] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / n).toFixed(4) };
    }
    return res;
  });
  log('уровни', JSON.stringify(levels));
  // пауза глушит радио
  await page.keyboard.press('Escape');
  await waitFor(() => window.__sueta.mode === 'paused', 30000);
  await wait(3000);
  log('режим', await S(() => window.__sueta.mode), '→ радио играет?', await S(() => window.__sueta.radio.playing));
} catch (e) {
  log('ERR', e.message.split('\n')[0]);
  await shot('error');
}
console.log('errors', errs.length, errs.slice(0, 5));
await browser.close();
