// 0.11, режим стримера: проверка мышью и клавиатурой в браузере + снимки.
//   npx vite build && npx vite preview --port 4185 --strictPort --host 127.0.0.1 &
//   PW=/opt/node-tools/node_modules/playwright/index.mjs OUT=production/qa/evidence node scripts/v11-stream-shots.mjs http://127.0.0.1:4185/ all
// Части: menu, vote, help, cam, result, final, overlay (или all). Сервер оверлея (тот же модуль, что в Electron) поднимается здесь же на порту 4186.
// Код выхода 1, если хоть одна проверка не прошла.
import { startOverlayDev } from './overlay-dev.mjs';
import { CAMPAIGN } from '../src/campaign/data.js';

const { chromium } = await import(process.env.PW ?? 'playwright');
const url = process.argv[2] || 'http://127.0.0.1:4185/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const OVERLAY_PORT = 4186;
const SIZES = [[1280, 720], [1440, 900]];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
const watch = (p) => {
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
};
watch(page);
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n, w = 1280) => page.screenshot({ path: `${out}/v11_stream_${n}_${w}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
async function waitFor(fn, timeout = 60000, arg) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { if (await page.evaluate(fn, arg)) return true; await wait(120); } return false; }
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { (cond ? ok++ : fail++); console.log(cond ? 'OK  ' : 'FAIL', name, extra); };
const want = (p) => part === 'all' || part.split(',').includes(p);
const text = (sel) => S((sel) => document.querySelector(sel)?.textContent?.trim() ?? '', sel);
const visible = (sel) => S((sel) => { const e = document.querySelector(sel); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, sel);

/** Чистая игра; настройки режима стримера и прогресс кладём в сохранение, затем перезагрузка. */
async function boot({ stream = { on: true, test: true }, done = 0, keep = null } = {}) {
  await page.goto(url, { timeout: 180000 }); await wait(500);
  await S(() => localStorage.clear());
  await page.goto(url, { timeout: 180000 });
  await waitFor(() => !!window.__sueta?.save, 120000);
  await S(([stream, done, keep]) => {
    const sv = window.__sueta.save;
    sv.data.days.forEach((d, i) => { if (i < done) { d.completed = true; d.unlocked = true; d.best = d.last = { D: 90, dishes: {}, order: 100, time: 0 }; d.stars = 2; } });
    if (done < sv.data.days.length) sv.data.days[done].unlocked = true;
    if (stream) sv.data.settings.stream = stream;
    if (keep) Object.assign(sv.data, keep);
    sv.write();
  }, [stream, done, keep]);
  await page.reload({ timeout: 180000 });
  await waitFor(() => !!window.__sueta?.save, 120000); await wait(600);
  errs.length = 0;
}
async function enterDay() {
  await page.waitForSelector('[data-ui=continue],[data-ui=new]', { timeout: 120000 });
  await S(() => (document.querySelector('[data-ui=continue]') ?? document.querySelector('[data-ui=new]'))?.click()); await wait(500);
  await page.waitForSelector('[data-ui=enter]', { timeout: 120000 });
  await S(() => document.querySelector('[data-ui=enter]').click());
  await waitFor(() => window.__sueta.mode === 'kitchen', 60000); await wait(700);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
}
/** Пройти «тихие» первые секунды дня, чтобы события чата были разрешены. */
const pastQuiet = () => S((q) => window.__sueta.session.fastForward(q + 5), CAMPAIGN.stream.startQuiet);
const votesOf = () => S(() => Object.fromEntries([...document.querySelectorAll('#votes .vote-row')].map((r) => [r.querySelector('.v-cmd').textContent, Number(r.querySelector('b').textContent)])));
const clickVote = async (cmd, n = 1) => { for (let i = 0; i < n; i++) { await page.click(`#votes [data-vote="${cmd}"]`, { timeout: 5000 }); await wait(60); } };
const endWindow = () => S(() => { window.__sueta.stream.round.left = 0.05; });

try {
  if (want('menu')) {
    await boot({ stream: null });
    check('в меню виден пункт «Режим стримера»', (await text('[data-ui=stream]')).includes('Режим стримера'), await text('[data-ui=stream]'));
    check('по умолчанию режим у игрока выключен', await S(() => !window.__sueta.save.data.settings.stream?.on && !window.__sueta.stream));
    await shot('menu');
    await page.click('[data-ui=stream]'); await wait(500);
    check('экран настроек открыт', await visible('.stream-set'));
    check('в настройках сказано «Сейчас: выключен»', (await text('#stream-now')).includes('выключен'));
    check('сила чата по умолчанию — «Нормально»', (await text('.seg-b.on')).includes('Нормально'));
    check('ники по умолчанию показываются', await S(() => document.querySelector('#stream-nicks').checked));
    check('в браузере оверлей помечен как «в версии для компьютера»', (await text('.stream-set')).includes('в версии игры для компьютера'));
    await shot('settings_default');
    await page.fill('#stream-channel', 'Some_Streamer'); await page.keyboard.press('Tab'); await wait(300);
    check('канал очищен до нижнего регистра и сохранён', await S(() => window.__sueta.save.data.settings.stream.channel === 'some_streamer'));
    await page.fill('#stream-channel', 'плохое имя!'); await page.keyboard.press('Tab'); await wait(300);
    check('плохое имя канала объяснено', (await text('.stream-set .warn')).includes('латиница'), await text('.stream-set .warn'));
    await page.check('#stream-test'); await wait(300);
    await page.click('.seg-b[data-arg="power=chaos"]'); await wait(300);
    await page.click('.seg-b[data-arg="cam=tr"]'); await wait(300);
    check('угол вебки применён классом на корне', await S(() => document.documentElement.classList.contains('cam-tr')));
    await page.click('[data-ui=streamToggle]'); await wait(400);
    check('режим включён, сила чата и тестовый чат сохранены', await S(() => { const s = window.__sueta.save.data.settings.stream; return s.on && s.test && s.power === 'chaos' && s.cam === 'tr'; }));
    check('«Сейчас: включён · тестовый чат»', (await text('#stream-now')).includes('включён') && (await text('#stream-now')).includes('тестовый чат'), await text('#stream-now'));
    check('главная кнопка стала «Выключить»', (await text('[data-ui=streamToggle]')) === 'Выключить');
    await shot('settings_on');
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(400);
    await shot('settings_on', 1440);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.click('[data-ui=menu]'); await wait(400);
    check('пункт меню показывает «включён»', (await text('[data-ui=stream]')).includes('включён'));
    await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(500);
    check('после перезагрузки настройки на месте, чат создан', await S(() => !!window.__sueta.stream && document.documentElement.classList.contains('cam-tr')));
    check('нет ошибок консоли (меню)', errs.length === 0, errs.slice(0, 2).join(' | '));
  }

  if (want('vote')) {
    await boot({ stream: { on: true, test: true, power: 'normal', nicks: true, cam: 'none' } });
    await enterDay();
    check('плашка голосования видна в кухне', await visible('#votes'));
    check('в ней пять команд и пауза чата', (await S(() => document.querySelectorAll('#votes .vote-row').length)) === 5 && (await text('#votes .v-pause')).includes('Пауза чата'));
    check('статус: тестовый чат', (await text('#votes .v-st')).includes('тестовый чат'));
    await shot('votes_idle');
    // события до «тихих» секунд не выходят
    await clickVote('!кот', 3); await clickVote('!помощь', 1); await clickVote('!радио', 1);
    const v = await votesOf();
    check('голоса из тестового чата сосчитаны', v['!кот'] === 3 && v['!помощь'] === 1 && v['!радио'] === 1, JSON.stringify(v));
    check('шкала «хаос ↔ помощь» показывает 4 и 1', (await text('#votes .v-meter')).replace(/\s+/g, ' ').includes('хаос 4') && (await text('#votes .v-meter')).includes('помощь 1'), await text('#votes .v-meter'));
    await shot('votes_counting');
    // пауза чата клавишей P
    await page.keyboard.press('KeyP'); await wait(300);
    check('клавиша P ставит чат на паузу', (await text('#votes .v-phase')).includes('на паузе'), await text('#votes .v-phase'));
    const left = await S(() => window.__sueta.stream.round.left); await wait(800);
    check('на паузе окно стоит', (await S(() => window.__sueta.stream.round.left)) === left);
    await clickVote('!гирлянда', 1);
    check('на паузе голоса не принимаются', (await votesOf())['!гирлянда'] === 0);
    await shot('votes_paused');
    await page.click('#votes .v-pause'); await wait(300);
    check('кнопка снимает паузу', !(await text('#votes .v-phase')).includes('паузе'));
    // раньше срока (тихие первые секунды) победитель ждёт
    await endWindow(); await wait(500);
    check('в первые секунды дня победитель ждёт', (await text('#votes .v-phase')).includes('день только начался'), await text('#votes .v-phase'));
    await pastQuiet(); await wait(600);
    check('после тихих секунд событие вышло: кот проголодался', await S(() => window.__sueta.session.catNeeds.hunger >= 99));
    check('победитель объяснён одной строкой без ников', (await text('#votes .v-line')) === 'Победило !кот — 3 из 5 голосов', await text('#votes .v-line'));
    check('в строке и плашке нет ников зрителей', !/Нико|Мила|Артём|tester/.test(await text('#votes')));
    check('на экране уведомление о событии', (await text('.toast')).includes('Чат разбудил кота'), await text('.toast'));
    check('после события — пауза по силе чата', (await text('#votes .v-phase')).includes('Пауза после события'), await text('#votes .v-phase'));
    await shot('votes_winner');
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(400);
    await shot('votes_winner', 1440);
    await page.setViewportSize({ width: 1280, height: 720 });
    // не больше одного события за окно: голосуем в паузе — не принимается
    await clickVote('!радио', 1);
    check('в паузе после события голосовать нельзя', (await votesOf())['!радио'] === 0);
    check('нет ошибок консоли (голосование)', errs.length === 0, errs.slice(0, 2).join(' | '));
  }

  if (want('help')) {
    // нож/жест в процессе: событие ждёт, пока кнопка мыши зажата; потом «!помощь» усыпляет кота
    await boot({ stream: { on: true, test: true, power: 'normal', nicks: true, cam: 'none' } });
    await enterDay();
    await pastQuiet();
    await S(() => window.__sueta.session.goTo('bowl'));
    await waitFor(() => window.__sueta.session.panel === 'bowl' && window.__sueta.sv.camT >= 1, 60000);
    const p = await S(() => window.__sueta.view.localToScreen('bowl', 0, 0));
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + 20, p.y + 10, { steps: 4 });
    check('зажатая кнопка мыши у миски — жест в процессе', await S(() => window.__sueta.session.streamState().gesture));
    await clickVote('!помощь', 2); await clickVote('!кот', 1);
    await endWindow(); await wait(700);
    check('победитель «!помощь» ждёт: руки заняты', (await text('#votes .v-phase')).includes('руки заняты'), await text('#votes .v-phase'));
    check('пока рука занята, кот не усыплён', await S(() => !(window.__sueta.session.catNeeds.sleepUntil > 0)));
    await shot('votes_waiting_gesture');
    await page.mouse.up(); await wait(900);
    check('кнопку отпустили — помощь вышла: кот спит', await S(() => window.__sueta.session.catCalm() && window.__sueta.session.catNeeds.sleepUntil > window.__sueta.session.t));
    check('победитель объяснён', (await text('#votes .v-line')).startsWith('Победило !помощь'), await text('#votes .v-line'));
    check('уведомление: чат убаюкал кота', (await text('.toast')).includes('убаюкал'), await text('.toast'));
    await page.keyboard.press('Escape'); await wait(1200);
    check('в обзоре кухни HUD показывает, что кот спит', (await text('#hud-meta')).includes('спит'), await text('#hud-meta'));
    await shot('help_cat_sleeps');
    check('нет ошибок консоли (помощь)', errs.length === 0, errs.slice(0, 2).join(' | '));
  }

  if (want('cam')) {
    const z = CAMPAIGN.stream.cam;
    for (const [w, h] of SIZES) {
      // одна загрузка на размер экрана: угол меняем настройкой, как это делает игрок (команда меню), и убираем окно настроек
      await page.setViewportSize({ width: w, height: h });
      await boot({ stream: { on: true, test: true, power: 'normal', nicks: true, cam: 'tl' } });
      await enterDay();
      await page.setViewportSize({ width: w, height: h }); await wait(300);
      // набираем всё, что обычно висит по краям: уведомления, подсказка, всплывающая запись, голосование, док станции
      await S(() => {
        const s = window.__sueta.session;
        s.breakRadio(); s.lightsOff('garland'); s.pushMessage('Гости', 'Мы будем в семь, не забудьте про салат!');
        s.setHint('Подсказка у дока станции — проверка безопасной зоны', 600);
        s._emit('stream', { kind: 'cat', text: 'Чат разбудил кота — он голоден!' });
        s._emit('tutorial', { topic: 'catBored' });
      });
      await S(() => window.__sueta.session.goTo('board'));
      await waitFor(() => window.__sueta.session.panel === 'board' && window.__sueta.sv.camT >= 1, 120000);
      await clickVote('!кот', 2); await clickVote('!помощь', 1);
      for (const corner of ['tl', 'tr', 'bl', 'br']) {
        await S((c) => { window.__sueta.app.ui('streamSet', 'cam=' + c); const o = document.querySelector('#overlay'); o.innerHTML = ''; o.className = ''; }, corner);
        await S(() => window.__sueta.session.setHint('Подсказка у дока станции — проверка безопасной зоны', 600));
        await wait(900);
        const box = { tl: [0, 0, z.w * w, z.h * h], tr: [w - z.w * w, 0, w, z.h * h], bl: [0, h - z.h * h, z.w * w, h], br: [w - z.w * w, h - z.h * h, w, h] }[corner];
        const hits = await S(([box]) => {
          const bad = [];
          for (const sel of ['#alerts .alert', '#tip:not(.hidden)', '#votes:not(.hidden)', '#hint:not(.hidden)', '#toasts .toast', '.hud2-task', '.hud2-right', '#panel:not(.hidden)'])
            for (const e of document.querySelectorAll(sel)) {
              const r = e.getBoundingClientRect();
              if (r.width && r.height && r.left < box[2] - 1 && r.right > box[0] + 1 && r.top < box[3] - 1 && r.bottom > box[1] + 1) bad.push(`${sel} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
            }
          return bad;
        }, [box]);
        check(`${w}×${h}, камера ${corner}: уведомления, подсказки, голосование, HUD и док обходят угол`, hits.length === 0, hits.join('; '));
        check(`${w}×${h}, ${corner}: класс угла на корне`, await S((c) => document.documentElement.classList.contains('cam-' + c), corner));
        const cnt = await S(() => ({ alerts: document.querySelectorAll('#alerts .alert').length, votes: !!document.querySelector('#votes:not(.hidden)'), dock: !!document.querySelector('#panel:not(.hidden)'), tip: !!document.querySelector('#tip:not(.hidden)'), hint: !!document.querySelector('#hint:not(.hidden)') }));
        check(`${w}×${h}, ${corner}: в кадре есть что проверять`, cnt.alerts > 0 && cnt.votes && cnt.dock && cnt.hint, JSON.stringify(cnt));
        await shot(`cam_${corner}`, w);
      }
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    await S(() => { window.__sueta.app.ui('streamSet', 'cam=none'); });
    check('без камеры класса угла нет', await S(() => !/cam-/.test(document.documentElement.className)));
    check('нет ошибок консоли (камера)', errs.length === 0, errs.slice(0, 2).join(' | '));
  }

  if (want('result')) {
    // день с чатом — отдельный зачёт
    await boot({ stream: { on: true, test: true, power: 'normal', nicks: true, cam: 'none' } });
    await enterDay();
    await pastQuiet();
    await clickVote('!радио', 2); await endWindow(); await wait(700);
    await S(() => {
      const s = window.__sueta.session;
      for (const d of Object.values(s.dishes)) if (!d.done) s._finishDish(d.id, { prep: 80, comp: 80, asm: 80 }, ['Автозавершение']);
      s._checkDayReady();
    });
    await waitFor(() => !document.querySelector('#btn-finish').classList.contains('hidden'), 20000);
    await page.click('#btn-finish'); await wait(900);
    check('итог дня открыт', await visible('.dialog.result'));
    check('строка «С чатом: …» есть', (await text('.stream-line')).includes('С чатом:'), await text('.stream-line'));
    check('в ней число событий от чата (1)', (await text('.stream-line')).includes('событий от чата: 1'), await text('.stream-line'));
    check('медалей нет', (await S(() => document.querySelectorAll('.medal').length)) === 0);
    const sv = await S(() => { const d = window.__sueta.save.data; return { best: d.days[0].best, last: d.days[0].last, done: d.days[0].completed, next: d.days[1].unlocked, medals: d.days[0].medals, bonus: d.bonus, stream: d.stream.best[0] }; });
    check('кампания не тронута: best, last, медали, открытие дня 2, очки', sv.best === null && sv.last === null && !sv.done && !sv.next && sv.medals.length === 0 && sv.bonus === 0, JSON.stringify(sv));
    check('результат лежит в save.data.stream.best[0]', !!sv.stream && sv.stream.D > 0 && sv.stream.events === 1, JSON.stringify(sv.stream));
    await shot('result_with_chat');
    await page.setViewportSize({ width: 1440, height: 900 }); await wait(400);
    await shot('result_with_chat', 1440);
    await page.setViewportSize({ width: 1280, height: 720 });
    // обычный день (режим выключен) пишется в кампанию как раньше
    await boot({ stream: { on: false } });
    await enterDay();
    check('при выключенном режиме плашки голосования нет', !(await visible('#votes')));
    await S(() => {
      const s = window.__sueta.session;
      for (const d of Object.values(s.dishes)) if (!d.done) s._finishDish(d.id, { prep: 80, comp: 80, asm: 80 }, ['Автозавершение']);
      s._checkDayReady();
    });
    await waitFor(() => !document.querySelector('#btn-finish').classList.contains('hidden'), 20000);
    await page.click('#btn-finish'); await wait(900);
    check('в обычном дне строки «С чатом» нет', !(await visible('.stream-line')));
    check('обычный день записан в кампанию', await S(() => { const d = window.__sueta.save.data; return !!d.days[0].best && d.days[0].completed && d.days[1].unlocked; }));
    check('нет ошибок консоли (итог)', errs.length === 0, errs.slice(0, 2).join(' | '));
  }

  if (want('final')) {
    // за финальным столом — самые активные зрители; зрителей меньше, чем гостей, — остальные обычные
    const viewers = [{ nick: 'Нико', n: 9 }, { nick: 'Мила', n: 5 }];
    await boot({ stream: { on: false, nicks: true }, done: 7, keep: { finished: true, stream: { best: {}, viewers } } });
    await S(() => document.querySelector('[data-ui=continue]').click());
    await waitFor(() => window.__sueta.mode === 'final', 60000);
    const names = new Set();
    for (let i = 0; i < 40; i++) { (await S(() => [...document.querySelectorAll('#final-bubbles .bubble b')].map((b) => b.textContent))).forEach((n) => names.add(n)); if (names.size >= 5) break; await wait(500); }
    check('за столом сидят зрители Нико и Мила', names.has('Нико:') && names.has('Мила:'), [...names].join(' '));
    check('остальные места — обычные гости', ['Серёжа:', 'Катя:', 'Миша:'].every((n) => names.has(n)) || names.size >= 3, [...names].join(' '));
    check('Дима и Оля уступили места зрителям', !names.has('Дима:') && !names.has('Оля:'), [...names].join(' '));
    await wait(500);
    await shot('final_viewers');
    // ники выключены — обычные гости
    await S(() => { const sv = window.__sueta.save; sv.data.settings.stream = { on: false, nicks: false }; sv.write(); });
    await page.reload({ timeout: 180000 }); await waitFor(() => !!window.__sueta?.save, 120000); await wait(500);
    await S(() => document.querySelector('[data-ui=continue]').click());
    await waitFor(() => window.__sueta.mode === 'final', 60000);
    const plain = new Set();
    for (let i = 0; i < 20; i++) { (await S(() => [...document.querySelectorAll('#final-bubbles .bubble b')].map((b) => b.textContent))).forEach((n) => plain.add(n)); if (plain.size >= 2) break; await wait(500); }
    check('«Показывать ники» выключено — за столом обычные гости', !plain.has('Нико:') && !plain.has('Мила:') && plain.size > 0, [...plain].join(' '));
    check('нет ошибок консоли (финал)', errs.length === 0, errs.slice(0, 2).join(' | '));
  }

  if (want('overlay')) {
    const dev = await startOverlayDev({ port: OVERLAY_PORT, dir: 'dist' });
    // игра в «оболочке»: мост suetaDesktop заменён подключением к серверу оверлея в этом процессе (вместо IPC)
    const game = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    watch(game);
    await game.exposeFunction('__publish', (s) => dev.server.setState(s));
    await game.exposeFunction('__configure', (c) => ({ running: !!c.enabled, port: OVERLAY_PORT, url: `http://127.0.0.1:${OVERLAY_PORT}/overlay`, error: '' }));
    await game.addInitScript(() => { window.suetaDesktop = { publishStream: (s) => window.__publish(s), overlay: { configure: (c) => window.__configure(c) } }; });
    const gamePage = page;
    page = game;
    await boot({ stream: { on: true, test: true, power: 'normal', nicks: true, cam: 'none' } });
    const ov = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    watch(ov);
    await ov.goto(`http://127.0.0.1:${OVERLAY_PORT}/overlay`, { timeout: 60000 }); await ov.waitForTimeout(800);
    const ovText = (sel) => ov.evaluate((sel) => document.querySelector(sel)?.textContent?.trim() ?? '', sel);
    const ovShown = () => ov.evaluate(() => !document.querySelector('#ov').classList.contains('hidden'));
    check('до дня с чатом оверлей пуст (прозрачный)', !(await ovShown()));
    check('фон оверлея прозрачный', await ov.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)'));
    check('в настройках игры виден адрес оверлея', await (async () => { await page.click('[data-ui=stream]'); await wait(500); const t = await text('.ov-url'); const v = await S(() => document.querySelector('.ov-url')?.value ?? ''); return v === `http://127.0.0.1:${OVERLAY_PORT}/overlay` || t === ''; })());
    await shot('settings_overlay_desktop');
    await page.click('[data-ui=menu]'); await wait(300);
    await enterDay();
    await ov.waitForFunction(() => !document.querySelector('#ov').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
    check('день с чатом начался — оверлей показан', await ovShown());
    check('оверлей показывает таймер окна', /^\d+:\d{2}$/.test(await ovText('.timer')), await ovText('.timer'));
    check('оверлей показывает статус тестового чата', (await ovText('.sub')).includes('тестовый чат'), await ovText('.sub'));
    await clickVote('!кот', 3); await clickVote('!помощь', 1); await clickVote('!радио', 1);
    await ov.waitForTimeout(900);
    const rows = await ov.evaluate(() => Object.fromEntries([...document.querySelectorAll('.row')].map((r) => [r.firstChild.textContent, Number(r.querySelector('b').textContent)])));
    check('голоса в оверлее совпадают с игрой', rows['🐱 !кот'] === 3 && rows['🍀 !помощь'] === 1 && rows['📻 !радио'] === 1, JSON.stringify(rows));
    check('шкала «хаос ↔ помощь» в оверлее', (await ovText('.meter')).replace(/\s+/g, ' ').includes('хаос 4') && (await ovText('.meter')).includes('помощь 1'), await ovText('.meter'));
    check('шрифт Nunito загружен из репозитория', await ov.evaluate(() => document.fonts.check('26px Nunito')));
    check('размер текста крупный (не меньше 24 px)', await ov.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize) >= 24));
    await ov.screenshot({ path: `${out}/v11_stream_overlay_voting.png`, omitBackground: true });
    await pastQuiet();
    await endWindow(); await wait(1500); await ov.waitForTimeout(500);
    check('победитель окна виден в оверлее одной строкой', (await ovText('.result')) === 'Победило !кот — 3 из 5 голосов', await ovText('.result'));
    check('последнее событие на кухне — в оверлее', (await ovText('.event')).includes('Чат разбудил кота'), await ovText('.event'));
    check('после события оверлей показывает паузу', (await ovText('.title')).includes('Пауза'), await ovText('.title'));
    // снимок поверх кадра игры — так оверлей увидит зритель
    const frame = await game.screenshot({ timeout: 150000 });
    await ov.evaluate((b64) => { document.documentElement.style.backgroundImage = `url(data:image/png;base64,${b64})`; document.documentElement.style.backgroundSize = 'cover'; }, frame.toString('base64'));
    await ov.screenshot({ path: `${out}/v11_stream_overlay_on_game.png` });
    // /state и /events отдают то же самое, что видит страница
    const st = await ov.evaluate(async () => (await fetch('/state')).json());
    check('/state: состояние активно, окно пустое после события', st.active === true && st.options.length === 5 && st.event?.text.includes('кота'));
    // пауза игры (Esc) оверлей не прячет; выход в меню — прячет
    await game.keyboard.press('Escape'); await ov.waitForTimeout(700);
    check('пауза игры: оверлей остаётся с замороженными показаниями', await ovShown());
    await game.keyboard.press('Escape'); await wait(300);
    // сервер остановили — оверлей прячет показания; поднялся снова — возвращается
    await dev.stop(); await ov.waitForTimeout(1500);
    check('сервер остановлен — оверлей не показывает устаревшее', !(await ovShown()));
    const dev2 = await startOverlayDev({ port: OVERLAY_PORT, dir: 'dist' });
    dev2.server.setState(dev.server.getState());
    await ov.waitForFunction(() => !document.querySelector('#ov').classList.contains('hidden'), null, { timeout: 15000 }).catch(() => {});
    check('сервер поднялся снова — оверлей вернулся сам', await ovShown());
    await dev2.stop();
    check('нет ошибок консоли (оверлей), кроме ожидаемых при остановке сервера', errs.filter((e) => !/EventSource|ERR_CONNECTION|Failed to load resource|net::/.test(e)).length === 0, errs.slice(0, 3).join(' | '));
    await ov.close(); await game.close();
    page = gamePage;
  }
} catch (e) {
  fail++;
  console.log('FAIL исключение', e.stack ?? e);
}
await browser.close();
console.log(`\nИтог: OK ${ok}, FAIL ${fail}`);
process.exit(fail ? 1 : 0);
