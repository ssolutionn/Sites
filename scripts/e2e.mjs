// Сквозная проверка в настоящем браузере (Chromium через Playwright):
// реальные клики мышью по меткам, доске и кнопкам + скриншоты каждого этапа.
// Запуск: npm run build && npx vite preview --port 4173, затем
//   node scripts/e2e.mjs [url] [ширина] [высота]
const { chromium } = await import(process.env.PW ?? 'playwright');

const url = process.argv[2] || 'http://localhost:4173/';
const W = Number(process.argv[3] || 1280);
const H = Number(process.argv[4] || 720);
const out = 'scripts/shots';
const tag = `${W}x${H}`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const logs = [];
page.on('console', (m) => m.type() !== 'warning' && logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const checks = [];
const check = (name, ok, extra = '') => {
  checks.push(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};
const shot = (n) => page.screenshot({ path: `${out}/${tag}_${n}.png` });
const g = (fn) => page.evaluate(fn);
const wait = (ms) => page.waitForTimeout(ms);
async function waitFor(fn, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn)) return true;
    await wait(100);
  }
  return false;
}
async function clickLabel(text) {
  await page.locator('.st-label', { hasText: text }).click({ force: true });
}
// Клик мышью по точке продукта (координаты доски).
async function boardClick(bx, bz) {
  const p = await page.evaluate(([x, z]) => window.__olivie.scene.boardToScreen(x, z), [bx, bz]);
  await page.mouse.move(p.x, p.y);
  await wait(60);
  await page.mouse.click(p.x, p.y);
}
// Нарезать текущий продукт кубиками, кликая мышью как игрок.
async function cutAll(limit = 60) {
  for (let i = 0; i < limit; i++) {
    const st = await g(() => {
      const ing = window.__olivie.game.board;
      if (!ing) return null;
      const big = ing.pieces.find((p) => p.w > 1.0001 || p.d > 1.0001);
      return big ? { big } : { done: true };
    });
    if (!st || st.done) return true;
    const { big } = st;
    if (big.w <= 1.0001) {
      await page.keyboard.press('KeyR');
      await wait(150);
      continue;
    }
    await boardClick(big.x + 1, big.z + big.d / 2);
    await waitFor(() => !window.__olivie.game.action);
  }
  return false;
}

try {
await page.goto(url + '?dev&seed=5');
await wait(2000);
await shot('01_menu');
await page.click('[data-ui=play]');
await wait(500);
await page.click('[data-ui=start]');
await wait(600);
await shot('02_prestart');
check('до установки кастрюли время стоит', (await g(() => window.__olivie.game.t)) === 0);
await clickLabel('Доска');
await wait(300);
check('до кастрюли к доске не пускает', (await g(() => window.__olivie.game.heroine.target)) === null);

await clickLabel('Плита');
await waitFor(() => window.__olivie.game.panel === 'stove');
await shot('03_stove_panel');
await page.click('[data-act=placePot]');
await wait(300);
check('кастрюля поставлена — время пошло', (await g(() => window.__olivie.game.phase)) === 'running');

await clickLabel('Доска');
await waitFor(() => window.__olivie.game.panel === 'board');
await waitFor(() => window.__olivie.scene.camT >= 1);
await shot('04_board_closeup');
// разрез на трети ширины первого куска
const first = await g(() => ({ ...window.__olivie.game.board.pieces[0] }));
await boardClick(first.x + first.w / 3, first.z + first.d / 2);
await wait(120);
await shot('05_knife_down');
await waitFor(() => !window.__olivie.game.action);
const after = await g(() => window.__olivie.game.board.pieces.map((p) => p.w));
check('разрез на трети даёт 1:2', after.length === 2 && Math.abs(Math.max(...after) / Math.min(...after) - 2) < 0.15, after.map((w) => w.toFixed(2)).join(' / '));
check('морковь нарезана кликами', await cutAll());
await shot('06_carrot_cut');
await page.click('[data-act=transfer]');
await wait(700);
check('морковь в миске', await g(() => window.__olivie.game.added.carrot));
await shot('07_after_transfer');

// кот: вызвать и прогнать
await page.click('#dev [data-d=cat]');
await wait(1600);
await shot('08_cat_alert');
await page.locator('.alert button', { hasText: 'Прогнать' }).click();
await wait(400);
await shot('09_cat_shoo');
check('кот прогнан', (await g(() => window.__olivie.game.stats.shoos)) === 1);
check('после «Прогнать» — общий вид', (await g(() => window.__olivie.game.panel)) === null);

// телефон
await g(() => window.__olivie.game.devJumpTo(54.5));
await wait(900);
await page.locator('.alert button', { hasText: 'Открыть' }).click();
await waitFor(() => window.__olivie.game.panel === 'phone');
await waitFor(() => window.__olivie.game.phone.sessionTime > 4.2);
await wait(300);
await shot('10_phone');
const phoneText = await page.locator('#panel').innerText();
check('фото Верки не загружается', phoneText.includes('Загрузка фотографии') && phoneText.includes('интернет тоже ушёл на каникулы'));
await page.locator('#panel button', { hasText: 'Закрыть' }).click();

// кастрюля выкипает
await g(() => window.__olivie.game.devJumpTo(99.5));
await wait(900);
await shot('11_pot_boil');
await page.locator('.alert button', { hasText: 'К плите' }).click();
await waitFor(() => window.__olivie.game.panel === 'stove');
await page.locator('#panel button', { hasText: 'Убавить огонь' }).click();
await waitFor(() => !window.__olivie.game.action);
check('выкипание остановлено', (await g(() => window.__olivie.game.stats.potsSaved)) === 1);

// гирлянда
await g(() => window.__olivie.game.devJumpTo(134.5));
await wait(900);
await shot('12_garland_off');
await page.locator('.alert button', { hasText: 'Починить' }).click();
await waitFor(() => window.__olivie.game.panel === 'garland');
const hb = await page.locator('[data-hold=garland]').boundingBox();
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
await page.mouse.down();
await waitFor(() => window.__olivie.game.garland.repaired);
await page.mouse.up();
check('гирлянда починена удержанием', await g(() => window.__olivie.game.garland.repaired));

// пауза: время стоит
await page.keyboard.press('Escape');
const tp = await g(() => window.__olivie.game.t);
await wait(1500);
await shot('13_pause');
check('пауза останавливает время', (await g(() => window.__olivie.game.t)) === tp);
await page.click('[data-ui=resume]');
await wait(200);
const tr = await g(() => window.__olivie.game.t);
check('продолжение без скачка времени', tr - tp < 0.35, `${(tr - tp).toFixed(3)} с`);

// Радио: отдельный тест нового события и ремонта.
await g(() => window.__olivie.game.breakRadio());
await clickLabel('Радио');
await waitFor(() => window.__olivie.game.panel === 'radio');
const rb = await page.locator('[data-hold=radio]').boundingBox();
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
await page.mouse.down();
await waitFor(() => !window.__olivie.game.radio.broken);
await page.mouse.up();
check('радио починено', (await g(() => window.__olivie.game.radio.repairs)) === 1);

// финал: остальные ингредиенты готовы, картошка в 2:00
await page.click('#dev [data-d=prepare]');
await page.click('#dev [data-d=jump]');
await waitFor(() => window.__olivie.game.t > 120.3);
await shot('14_potato_ready');
check('картошка готова в 2:00', (await g(() => window.__olivie.game.potato)) === 'ready');
const t0 = await g(() => window.__olivie.game.t);
await clickLabel('Плита');
await waitFor(() => window.__olivie.game.panel === 'stove');
await page.locator('#panel button', { hasText: 'Достать картошку' }).click();
await waitFor(() => window.__olivie.game.panel === 'board' && window.__olivie.game.boardIng === 'potato');
await wait(700);
check('картошка нарезана', await cutAll());
await page.click('[data-act=transfer]');
await wait(300);
await page.locator('#panel button', { hasText: 'К миске' }).click();
await waitFor(() => window.__olivie.game.panel === 'bowl');
const mb = await page.locator('[data-hold=mix]').boundingBox();
await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2);
await page.mouse.down();
await waitFor(() => window.__olivie.game.bowl.mixProgress > 1.4);
await shot('15_mixing');
await waitFor(() => window.__olivie.game.isOver());
await page.mouse.up();
const t1 = await g(() => window.__olivie.game.t);
check('финал уложился в 30 секунд', t1 - t0 < 30, `${(t1 - t0).toFixed(1)} с`);
check('успех', (await g(() => window.__olivie.game.phase)) === 'success');
await waitFor(() => window.__olivie.mode === 'result');
await wait(300);
await shot('16_result');
const res = await g(() => window.__olivie.game.getResult());
check('результат показан', (await page.locator('.result').count()) === 1, `${res.title}, S=${res.S}, A=${res.A.toFixed(0)}`);

// перезапуски
for (let i = 0; i < 5; i++) {
  await page.click('[data-ui=retry]');
  await wait(250);
  await page.click('#dev [data-d=end]');
  await waitFor(() => window.__olivie.mode === 'result', 30000);
}
const st = await g(() => ({ alerts: window.__olivie.game.alerts.length, bowl: window.__olivie.game.bowl.pieces.length, t: window.__olivie.game.t, meshes: window.__olivie.scene.board.bowlMeshes.length }));
check('пять перезапусков без старых кусочков', st.bowl === 0 && st.meshes === 0, JSON.stringify(st));
await shot('17_fail_result');
check('поражение по времени', (await page.locator('.result.fail').count()) === 1);

// потеря фокуса ставит паузу
await page.click('[data-ui=retry]');
await wait(300);
await g(() => window.dispatchEvent(new Event('blur')));
await wait(200);
check('потеря фокуса — пауза', (await g(() => window.__olivie.mode)) === 'paused');
await page.click('[data-ui=resume]');

// звук и fps
const fps = await g(
  () =>
    new Promise((res) => {
      let n = 0;
      const t0 = performance.now();
      const f = () => (++n, performance.now() - t0 < 2000 ? requestAnimationFrame(f) : res((n * 1000) / (performance.now() - t0)));
      requestAnimationFrame(f);
    }),
);
check('частота кадров (SwiftShader, без GPU)', true, `${fps.toFixed(1)} fps`);

} catch (err) {
  await shot('99_error');
  check('сценарий прерван', false, err.message.split('\n')[0]);
}
console.log(checks.join('\n'));
if (logs.length) console.log('--- console ---\n' + logs.join('\n'));
await browser.close();
