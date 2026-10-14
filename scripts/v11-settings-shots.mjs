// 0.11: экран «Настройки» мышью и клавиатурой — звук, мягкие жесты, размер текста 130 %, переназначение клавиш, пауза.
//   PW=/opt/node-tools/node_modules/playwright/index.mjs OUT=production/qa/evidence node scripts/v11-settings-shots.mjs http://127.0.0.1:4184/ all
//   части: open,sound,assist,text,keys,pause,game,persist,audio  (через запятую); код выхода 1 при провале.
const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4184/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
// запись соединений Web Audio: радио должно идти через шину «радио и музыка»
await ctx.addInitScript(() => {
  const orig = AudioNode.prototype.connect;
  window.__conn = [];
  AudioNode.prototype.connect = function (dest, ...rest) {
    window.__conn.push([this, dest]);
    return orig.call(this, dest, ...rest);
  };
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: `${out}/v11_settings_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(120);
  }
  return false;
}
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  (cond ? ok++ : fail++);
  console.log(cond ? 'OK  ' : 'FAIL', name, extra);
};
const want = (p) => part === 'all' || part.split(',').includes(p);
const setting = (path) => S((p) => p.split('.').reduce((a, k) => a?.[k], window.__sueta.save.data.settings), path);

/** Щелчок мышью по центру элемента (как рука игрока). */
async function click(sel, { x = 0.5, y = 0.5 } = {}) {
  const box = await page.locator(sel).first().boundingBox();
  if (!box) throw new Error('нет элемента ' + sel);
  await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
  await wait(250);
}
/** Ничего из слоёв интерфейса не вылезает за окно и не обрезано по краям. */
const overflow = () =>
  S(() => {
    const bad = [];
    const sels = ['#hud > *', '#panel', '#recipe', '#phone .device', '#overlay > .card', '#overlay .menu2', '#tip', '#alerts', '#toasts'];
    for (const sel of sels)
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('.hidden')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1) bad.push(`${sel} ${Math.round(r.left)},${Math.round(r.top)}…${Math.round(r.right)},${Math.round(r.bottom)}`);
      }
    return bad;
  });

async function fresh() {
  await page.goto(url, { timeout: 180000 });
  await S(() => localStorage.clear());
  await page.goto(url, { timeout: 180000 });
  errs.length = 0;
  await waitFor(() => !!window.__sueta?.save && document.querySelector('[data-ui=settings]'), 120000);
  await wait(500);
}
async function startGame() {
  await click('[data-ui=new]');
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 });
  await click('[data-ui=enter]');
  await waitFor(() => window.__sueta.mode === 'kitchen', 60000);
  await wait(800);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
}

try {
  if (want('open')) {
    await fresh();
    await shot('menu');
    check('в меню есть «Настройки», старого переключателя качества нет', (await page.locator('[data-ui=settings]').count()) === 1 && (await page.locator('[data-ui=quality]').count()) === 0);
    await click('[data-ui=settings]');
    check('экран настроек открылся мышью', await S(() => !!document.querySelector('.dialog.settings')));
    const t = await S(() => document.querySelector('.dialog.settings').innerText);
    check('подписи по-русски, без английских слов', !/[A-Za-z]{4,}/.test(t.replace(/Esc|F11/g, '')), t.slice(0, 80).replace(/\n/g, ' | '));
    await shot('open');
    const fit = await S(() => { const d = document.querySelector('.dialog.settings'); return [d.scrollHeight, d.clientHeight, d.scrollWidth, d.clientWidth]; });
    check('на 1280×720 диалог помещается без прокрутки', fit[0] <= fit[1] + 1 && fit[2] <= fit[3] + 1, JSON.stringify(fit));
    const small = await S(() => [...document.querySelectorAll('.dialog.settings *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12.5).map((e) => e.tagName + '.' + e.className));
    check('шрифт не меньше 12,5 px', small.length === 0, small.join(','));
    await click('[data-ui=settingsBack]');
    check('«Готово» возвращает в меню', await S(() => !!document.querySelector('.menu2')));
  }

  if (want('sound')) {
    await fresh();
    await click('[data-ui=settings]');
    // три ползунка, движение мышью
    const sl = async (bus, frac) => {
      const box = await page.locator(`[data-vol=${bus}]`).boundingBox();
      await page.mouse.move(box.x + box.width * 0.99, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * frac, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await wait(200);
    };
    await sl('music', 0.35);
    const v = await setting('volume');
    check('ползунок «Радио и музыка» двигается мышью и пишется в настройки', v.music > 0.2 && v.music < 0.5 && v.sfx === 1 && v.master === 1, JSON.stringify(v));
    await sl('sfx', 0.6);
    await sl('master', 0.8);
    const v2 = await setting('volume');
    check('три шины независимы', v2.sfx > 0.45 && v2.sfx < 0.75 && v2.master > 0.65 && v2.master < 0.95 && v2.music === v.music, JSON.stringify(v2));
    const out2 = await S(() => [...document.querySelectorAll('[data-out]')].map((o) => o.textContent));
    check('подписи процентов рядом с ползунками', out2.every((t) => /^\d+ %$/.test(t)), out2.join(','));
    // звук Sound получил значения (контекст создаётся после жеста: он уже был)
    const sv = await S(() => ({ ...window.__sueta.radio.sound.volumes, sfxGain: window.__sueta.radio.sound.sfx?.gain.value, musicGain: window.__sueta.radio.sound.music?.gain.value }));
    check('громкости дошли до звука', Math.abs(sv.music - v2.music) < 0.011 && sv.musicGain != null && sv.musicGain < 0.2, JSON.stringify(sv));
    await shot('slider');
    // «Без звука»
    await click('[data-sw=muted]');
    check('«Без звука» включается мышью', (await S(() => window.__sueta.app.isMuted())) === true && (await page.locator('[data-sw=muted]').getAttribute('aria-checked')) === 'true');
    await page.keyboard.press('KeyM');
    await wait(300);
    check('клавиша M снова включает звук, переключатель на экране следует за ней', (await S(() => window.__sueta.app.isMuted())) === false && (await page.locator('[data-sw=muted]').getAttribute('aria-checked')) === 'false');
    check('ключ olivie.muted остался', (await S(() => localStorage.getItem('olivie.muted'))) === '0');
  }

  if (want('assist')) {
    await fresh();
    await click('[data-ui=settings]');
    await click('[data-sw=assist]');
    check('«Мягкие жесты» включились мышью', (await setting('assist')) === true && (await page.locator('[data-sw=assist]').getAttribute('aria-checked')) === 'true');
    await shot('assist_on');
    await click('[data-ui=settingsBack]');
    await startGame();
    const soft = await S(() => ({ on: !!window.__sueta.session.cfg.assist?.on, tol: window.__sueta.session.cfg.cutRules.angleTolerance }));
    check('день начался с мягкими допусками (угол 28° × 1,5 = 42°)', soft.on && Math.abs(soft.tol - 42) < 1e-9, JSON.stringify(soft));
    // выключаем в паузе — сессия получает обычные допуски сразу
    await page.keyboard.press('Escape');
    await waitFor(() => window.__sueta.mode === 'paused', 10000);
    await click('[data-ui=settings]');
    await click('[data-sw=assist]');
    const hard = await S(() => ({ on: !!window.__sueta.session.cfg.assist?.on, tol: window.__sueta.session.cfg.cutRules.angleTolerance }));
    check('выключили в паузе — допуски обычные без перезапуска дня', !hard.on && hard.tol === 28, JSON.stringify(hard));
  }

  if (want('text')) {
    await fresh();
    await click('[data-ui=settings]');
    await click('[data-ts="1.3"]');
    check('130 % выбран мышью', (await setting('textScale')) === 1.3 && (await S(() => document.body.dataset.ts)) === '130');
    await shot('text130');
    const fit = await S(() => { const d = document.querySelector('.dialog.settings'); const r = d.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight, d.scrollWidth <= d.clientWidth + 1]; });
    check('экран настроек при 130 % в окне 1280×720 (с прокруткой внутри, «Готово» на виду)', fit[0] >= 0 && fit[1] <= fit[2] + 1 && fit[3], JSON.stringify(fit));
    const done = await S(() => { const b = document.querySelector('[data-ui=settingsBack]').getBoundingClientRect(); return b.bottom <= innerHeight + 1 && b.top >= 0; });
    check('кнопка «Готово» видна', done);
    await click('[data-ui=settingsBack]');
    check('меню при 130 % без выхода за окно', (await overflow()).length === 0, (await overflow()).join(' | '));
    await shot('menu130');
    // 1440×900
    await page.setViewportSize({ width: 1440, height: 900 });
    await wait(500);
    await click('[data-ui=settings]');
    await shot('text130_1440');
    check('1440×900 при 130 %: экран настроек не обрезан', (await overflow()).length === 0, (await overflow()).join(' | '));
    await click('[data-ts="1"]');
    check('100 % возвращает обычный вид (атрибута нет)', (await S(() => document.body.dataset.ts)) === undefined && (await setting('textScale')) === 1);
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  if (want('keys')) {
    await fresh();
    await click('[data-ui=settings]');
    // слушаем клавишу, конфликт, отмена, успех
    await click('[data-key=up]');
    check('кнопка клавиши ждёт нажатия', (await page.locator('[data-key=up]').textContent()).includes('Нажми'));
    await shot('key_listen');
    await page.keyboard.press('KeyA');
    await wait(200);
    const msg = await S(() => document.querySelector('#st-msg').textContent);
    check('A уже занята — понятная фраза, клавиша не изменилась', /A уже занята/.test(msg) && /Влево/.test(msg) && msg.length <= 70 && (await page.locator('[data-key=up]').getAttribute('class')).includes('listening'), msg);
    await shot('key_conflict');
    await page.keyboard.press('Escape');
    await wait(200);
    check('Esc отменяет ожидание и не закрывает экран', !(await page.locator('[data-key=up]').getAttribute('class')).includes('listening') && (await S(() => !!document.querySelector('.dialog.settings'))));
    await click('[data-key=up]');
    await page.keyboard.press('Tab');
    await wait(150);
    check('Tab назначить нельзя — фраза про игру/систему', /нужна игре или системе/.test(await S(() => document.querySelector('#st-msg').textContent)));
    await page.keyboard.press('KeyI');
    await wait(250);
    check('«Вперёд» теперь I (запасные стрелки остались)', (await S(() => window.__sueta.app.keymap.get('up'))) === 'KeyI' && (await page.locator('[data-key=up]').textContent()).trim() === 'I' && (await setting('keys.up')) === 'KeyI');
    await click('[data-key=recipe]');
    await page.keyboard.press('KeyE');
    await wait(250);
    await shot('key_done');
    await click('[data-ui=settingsBack]');
    await startGame();
    // клавиши в игре
    await page.keyboard.press('KeyQ');
    await wait(300);
    check('старая Q больше не открывает рецепт', await S(() => document.querySelector('#recipe').classList.contains('hidden')));
    await page.keyboard.press('KeyE');
    await wait(300);
    check('новая E открывает рецепт', await S(() => !document.querySelector('#recipe').classList.contains('hidden')));
    await page.keyboard.press('KeyE');
    await wait(200);
    const z0 = await S(() => window.__sueta.session.heroine.z);
    await page.keyboard.down('KeyI');
    await waitFor(() => window.__sueta.session.heroine.moving, 8000);
    await wait(400);
    await page.keyboard.up('KeyI');
    const z1 = await S(() => window.__sueta.session.heroine.z);
    check('новая I ведёт героиню вглубь кухни', z1 < z0 - 0.1, `${z0.toFixed(2)} → ${z1.toFixed(2)}`);
    // сначала героиня останавливается после I (кадр в SwiftShader долгий), потом проверяем, что W не двигает
    await waitFor(() => !window.__sueta.session.heroine.moving, 8000);
    await page.keyboard.down('KeyW');
    await wait(1500);
    check('W больше не ходит (освобождена)', !(await S(() => window.__sueta.session.heroine.moving)));
    await page.keyboard.up('KeyW');
    await page.keyboard.down('ArrowUp');
    await waitFor(() => window.__sueta.session.heroine.moving, 8000);
    check('запасные стрелки продолжают работать', await S(() => window.__sueta.session.heroine.moving));
    await page.keyboard.up('ArrowUp');
    // сброс
    await page.keyboard.press('Escape');
    await waitFor(() => window.__sueta.mode === 'paused', 10000);
    await click('[data-ui=settings]');
    await click('[data-act=keysReset]');
    check('«Вернуть по умолчанию» возвращает W и Q', (await S(() => window.__sueta.app.keymap.get('up'))) === 'KeyW' && (await S(() => window.__sueta.app.keymap.get('recipe'))) === 'KeyQ' && Object.keys(await setting('keys')).length === 0);
  }

  if (want('pause')) {
    await fresh();
    await startGame();
    await page.keyboard.press('Escape');
    await waitFor(() => window.__sueta.mode === 'paused', 10000);
    check('в паузе есть «Настройки»', (await page.locator('[data-ui=settings]').count()) === 1);
    await shot('pause');
    await click('[data-ui=settings]');
    check('настройки открылись из паузы', await S(() => !!document.querySelector('.dialog.settings')));
    await click('[data-ts="1.15"]');
    await shot('from_pause');
    await page.keyboard.press('Escape');
    await wait(300);
    check('Esc в настройках возвращает в паузу, а не в игру', (await S(() => window.__sueta.mode)) === 'paused' && (await S(() => document.querySelector('#overlay').innerText)).includes('Пауза'));
    await click('[data-ui=resume]');
    check('«Продолжить» возвращает в игру', (await S(() => window.__sueta.mode)) === 'kitchen');
    check('размер 115 % остался', (await S(() => document.body.dataset.ts)) === '115');
  }

  if (want('game')) {
    // кухня при 130 %: HUD, док станции, телефон, книга — на двух разрешениях
    await fresh();
    await startGame();
    for (const [w, h] of [[1280, 720], [1440, 900]]) {
      await page.setViewportSize({ width: w, height: h });
      await S(() => window.__sueta.app.settings.setTextScale(1.3));
      await wait(600);
      const tag = `${w}x${h}`;
      await shot(`hud130_${tag}`);
      check(`${tag}: HUD при 130 % не вылезает за окно`, (await overflow()).length === 0, (await overflow()).join(' | '));
      await page.keyboard.press('KeyQ');
      await wait(400);
      await shot(`recipe130_${tag}`);
      check(`${tag}: книга при 130 % целиком в окне`, (await overflow()).length === 0, (await overflow()).join(' | '));
      await page.keyboard.press('KeyQ');
      await S(() => window.__sueta.session.goTo('board'));
      await waitFor(() => window.__sueta.session.panel === 'board' && window.__sueta.sv.camT >= 1, 60000);
      await wait(500);
      await shot(`dock130_${tag}`);
      check(`${tag}: док доски при 130 % в окне`, (await overflow()).length === 0, (await overflow()).join(' | '));
      await S(() => window.__sueta.session.closePanel());
      await wait(800);
      await S(() => window.__sueta.session.goTo('phone'));
      await waitFor(() => window.__sueta.session.panel === 'phone', 60000);
      await wait(700);
      await shot(`phone130_${tag}`);
      check(`${tag}: телефон при 130 % в окне`, (await overflow()).length === 0, (await overflow()).join(' | '));
      await S(() => window.__sueta.session.closePanel());
      await wait(600);
    }
    await S(() => window.__sueta.app.settings.setTextScale(1));
  }

  if (want('persist')) {
    await fresh();
    await click('[data-ui=settings]');
    await click('[data-ts="1.15"]');
    await click('[data-sw=assist]');
    await click('[data-q=low]');
    await click('[data-sw=motion]');
    await click('[data-key=mute]');
    await page.keyboard.press('KeyN');
    await wait(300);
    await page.reload({ timeout: 180000 });
    await waitFor(() => !!window.__sueta?.save && document.querySelector('[data-ui=settings]'), 120000);
    const st = await S(() => ({ ...window.__sueta.save.data.settings }));
    check('настройки пережили перезагрузку', st.textScale === 1.15 && st.assist === true && st.quality === 'low' && st.reduceMotion === true && st.keys.mute === 'KeyN', JSON.stringify(st));
    check('размер текста и «меньше движения» применены при запуске', (await S(() => document.body.dataset.ts)) === '115' && (await S(() => document.body.classList.contains('reduce-motion'))) && (await S(() => window.__sueta.sv.reduceMotion)) === true);
    check('частиц вдвое меньше', (await S(() => window.__sueta.view.particles.density)) === 0.5);
    // «Новая кампания» настройки не стирает
    await click('[data-ui=new]');
    await page.waitForSelector('[data-ui=enter]', { timeout: 120000 });
    check('новая кампания не стёрла настройки', (await setting('textScale')) === 1.15 && (await setting('assist')) === true);
    // старое сохранение без новых полей читается
    await page.evaluate(() => { localStorage.setItem('novogodnyaya-sueta.campaign', JSON.stringify({ version: 1, days: [], settings: { quality: 'low' } })); });
    await page.reload({ timeout: 180000 });
    await waitFor(() => !!window.__sueta?.save && document.querySelector('[data-ui=settings]'), 120000);
    const old = await S(() => window.__sueta.save.data.settings);
    check('сохранение 0.10 без новых полей читается', old.quality === 'low' && old.volume.master === 1 && old.assist === false && old.textScale === 1, JSON.stringify(old));
  }

  if (want('audio')) {
    await fresh();
    await click('[data-ui=settings]');
    await click('[data-sw=muted]'); // жест игрока: создаёт AudioContext
    await click('[data-sw=muted]');
    await click('[data-ui=settingsBack]');
    await startGame();
    await waitFor(() => window.__sueta.radio.playing, 30000);
    const r = await S(() => {
      const snd = window.__sueta.radio.sound;
      const out = window.__sueta.radio.graph?.out;
      const conn = window.__conn.filter(([a, b]) => a === out);
      return { playing: window.__sueta.radio.playing, toMusic: conn.some(([, b]) => b === snd.music), toMaster: conn.some(([, b]) => b === snd.master), musicToMaster: window.__conn.some(([a, b]) => a === snd.music && b === snd.master), sfxToMaster: window.__conn.some(([a, b]) => a === snd.sfx && b === snd.master) };
    });
    check('радио подключено к шине «радио и музыка», а не напрямую к общей', r.playing && r.toMusic && !r.toMaster && r.musicToMaster && r.sfxToMaster, JSON.stringify(r));
  }

  check('нет ошибок консоли', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  console.log('СБОЙ СКРИПТА', e.stack ?? e);
  fail++;
}
console.log(`\nитого: ${ok} OK, ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
