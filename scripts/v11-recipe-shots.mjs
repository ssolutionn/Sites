// 0.11, идея 5 «Рецепт домой»: книга рецептов в телефоне → «Сохранить карточку рецепта» (скачивание перехватывается) и «Показать QR».
//   PW=/opt/node-tools/node_modules/playwright/index.mjs OUT=production/qa/evidence node scripts/v11-recipe-shots.mjs http://127.0.0.1:4188/ [all|ids через запятую]
//   Сохраняет карточки оливье, шубы и курицы в OUT/v11_recipe_card_<id>.png; остальные семь — в TMP_OUT (по умолчанию системная папка).
//   QR проверяется по пикселям: из картинки восстанавливается матрица, она разбирается независимым разбором (tests/helpers-qr-v11.js)
//   и сравнивается с текстом recipeHome(id).qrText; если есть jsQR (JSQR=/путь/к/jsQR.js или пакет jsqr), код ещё и декодируется им.
//   Код выхода 1 при любом провале.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recipeHome } from '../src/campaign/recipe-home.js';
import { RECIPES } from '../src/campaign/data.js';
import { decodeQr } from '../tests/helpers-qr-v11.js';

const { chromium } = await import(process.env.PW ?? 'playwright');
let jsQR = null;
try {
  jsQR = (await import(process.env.JSQR ?? 'jsqr')).default;
} catch {
  /* декодера нет — проверка матрицей */
}
const url = process.argv[2] || 'http://127.0.0.1:4188/';
const part = process.argv[3] || 'all';
const out = process.env.OUT || 'production/qa/evidence';
const tmp = process.env.TMP_OUT || join(tmpdir(), 'v11-recipe-cards');
mkdirSync(out, { recursive: true });
mkdirSync(tmp, { recursive: true });
const KEEP = ['olivier', 'shuba', 'chicken'];
const ids = part === 'all' ? Object.keys(RECIPES) : part.split(',');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
const warns = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errs.push(m.text());
  if (m.type() === 'warning' && /recipe-card/.test(m.text())) warns.push(m.text());
});
const S = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);
// В облачном браузере кадры долгие: перед снимком ждём, пока закончатся появления окон и экранов телефона (бесконечные — гирлянды — не в счёт)
const settle = () =>
  waitFor(() => document.getAnimations({ subtree: true }).every((a) => a.playState === 'finished' || a.effect?.getTiming().iterations === Infinity), 60000).then(() => wait(500));
const shot = async (n) => {
  await settle();
  return page.screenshot({ path: `${out}/v11_recipe_${n}.png`, timeout: 150000 }).catch((e) => console.log('shot fail', n, e.message.split('\n')[0]));
};
async function waitFor(fn, timeout = 30000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, arg)) return true;
    await wait(100);
  }
  return false;
}
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => {
  (cond ? ok++ : fail++);
  console.log(cond ? 'OK  ' : 'FAIL', name, extra);
};
/** Щелчок мышью по центру элемента (Playwright прокручивает его в видимую область сам). */
const tap = async (sel) => {
  await page.locator(sel).first().click({ timeout: 60000 });
  await wait(250);
};

/** Из пикселей картинки достаёт матрицу QR: чисто чёрные (#000) пиксели есть только у модулей кода. */
const PIXELS_TO_MATRIX = (img) => {
  const { data, w, h } = img;
  const black = (x, y) => { const i = (y * w + x) * 4; return data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 255; };
  const white = (x, y) => { const i = (y * w + x) * 4; return data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255; };
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (black(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return { error: 'нет чёрных пикселей' };
  let run = 0;
  while (black(x0 + run, y0)) run++;
  const m = run / 7; // верхняя строка поискового узора — 7 тёмных модулей подряд
  const size = Math.round((x1 - x0 + 1) / m);
  const rows = [];
  for (let r = 0; r < size; r++) {
    let line = '';
    for (let c = 0; c < size; c++) line += black(Math.round(x0 + (c + 0.5) * m), Math.round(y0 + (r + 0.5) * m)) ? '1' : '0';
    rows.push(line);
  }
  // тихая зона: рамка шириной 4 модуля вокруг кода — чисто белая (и не выходит за картинку)
  const q = Math.round(4 * m);
  let quiet = x0 - q >= 0 && y0 - q >= 0 && x0 + size * m + q <= w && y0 + size * m + q <= h;
  for (let y = y0 - q; quiet && y < y0 + size * m + q; y++) for (let x = x0 - q; x < x0 + size * m + q; x++) {
    const inside = x >= x0 && x < x0 + size * m && y >= y0 && y < y0 + size * m;
    if (!inside && !white(x, y)) { quiet = false; break; }
  }
  return { rows, size, module: m, px: x1 - x0 + 1, x0, y0, quiet, crop: { x: x0 - q, y: y0 - q, w: size * m + 2 * q } };
};

/** Загружает картинку (dataURL/путь) в страницу, рисует на canvas и возвращает матрицу QR и вырезку для jsQR. */
async function readQr(source) {
  return page.evaluate(
    async ({ src, fnSrc }) => {
      const toMatrix = new Function(`return (${fnSrc})`)();
      let w, h, data;
      if (src.selector) {
        const cv = document.querySelector(src.selector);
        w = cv.width; h = cv.height;
        data = cv.getContext('2d').getImageData(0, 0, w, h).data;
      } else {
        const img = new Image();
        img.src = src.dataUrl;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = w = img.naturalWidth; cv.height = h = img.naturalHeight;
        const g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
        data = g.getImageData(0, 0, w, h).data;
      }
      const res = toMatrix({ data, w, h });
      if (res.crop) {
        const { x, y, w: cw } = res.crop;
        const crop = new Uint8ClampedArray(cw * cw * 4);
        for (let r = 0; r < cw; r++) for (let c = 0; c < cw; c++) for (let k = 0; k < 4; k++) crop[(r * cw + c) * 4 + k] = data[((y + r) * w + x + c) * 4 + k];
        res.cropData = Array.from(crop);
      }
      res.imgW = w; res.imgH = h;
      return res;
    },
    { src: source, fnSrc: PIXELS_TO_MATRIX.toString() },
  );
}

/** Матрица из пикселей → независимый разбор → тот ли текст; плюс jsQR, если он есть. */
function verifyQr(label, res, id) {
  const want = recipeHome(id).qrText;
  check(`${label}: QR найден`, !res.error && res.size >= 21, res.error ?? `версия ${(res.size - 17) / 4}, модуль ${res.module} px, код ${res.px} px`);
  if (res.error) return;
  check(`${label}: код не меньше 240 px`, res.px >= 240, `${res.px} px`);
  check(`${label}: тихая зона 4 модуля чисто белая`, res.quiet);
  check(`${label}: модуль — целое число пикселей`, Number.isInteger(res.module), String(res.module));
  const qr = { size: res.size, get: (x, y) => (res.rows[y]?.[x] === '1' ? 1 : 0) };
  let dec = null;
  try {
    dec = decodeQr(qr);
  } catch (e) {
    check(`${label}: матрица разбирается`, false, e.message);
    return;
  }
  check(`${label}: матрица разбирается, коррекция сходится`, true, `версия ${dec.version}, уровень ${dec.ecc}, маска ${dec.mask}`);
  check(`${label}: текст QR совпадает с recipeHome("${id}").qrText`, dec.text === want, dec.text === want ? `${want.length} знаков` : JSON.stringify(dec.text.slice(0, 60)));
  if (jsQR && res.cropData) {
    const r = jsQR(Uint8ClampedArray.from(res.cropData), res.crop.w, res.crop.w);
    check(`${label}: jsQR декодирует`, r?.data === want, r ? `${r.data.length} знаков` : 'не распознал');
  }
}

/** Читает PNG: размер из заголовка и dataURL для страницы. */
function pngInfo(path) {
  const b = readFileSync(path);
  const isPng = b.subarray(1, 4).toString() === 'PNG';
  return { isPng, w: b.readUInt32BE(16), h: b.readUInt32BE(20), size: statSync(path).size, dataUrl: `data:image/png;base64,${b.toString('base64')}` };
}

try {
  await page.goto(url);
  await wait(1500);
  await S(() => localStorage.clear());
  await page.goto(url);
  await wait(2500);
  await tap('[data-ui=new]');
  await wait(500);
  await tap('[data-ui=enter]');
  await wait(1500);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});
  // все десять рецептов открыты в книге: как после последнего дня
  await S(() => { window.__sueta.session.dayIndex = 6; });
  await tap('#btn-phone');
  check('телефон открылся', await waitFor(() => window.__sueta.session.panel === 'phone'));
  await wait(900);
  await page.locator('#tip button').click({ timeout: 800 }).catch(() => {});

  // телефон перерисовывается в кадре игры, а в облачном браузере кадр долгий: после каждого шага ждём нужную разметку, а не паузу
  const present = (sel) => waitFor((q) => !!document.querySelector(q), 60000, sel);
  const openLesson = async (id) => {
    await tap('#phone .ph-home');
    await present('#phone .apps');
    await tap('#phone [data-nav=book]');
    await present('#phone .book-row');
    await tap(`#phone [data-nav="book|${id}"]`);
    return (await present(`#phone [data-card="${id}"]`)) ? 1 : 0;
  };

  for (const id of ids) {
    const label = `${id}`;
    check(`${label}: рецепт открыт мышью, обе кнопки на месте`, (await openLesson(id)) === 1 && (await page.locator(`#phone [data-qr="${id}"]`).count()) === 1);
    if (id === ids[0]) {
      await page.locator('#phone .app-body').evaluate((e) => (e.scrollTop = e.scrollHeight));
      await wait(300);
      await shot(`book_${id}_buttons`);
      const labels = await S(() => [...document.querySelectorAll('#phone [data-card], #phone [data-qr]')].map((b) => b.textContent.trim()));
      check('кнопки: «Сохранить карточку рецепта» и «Показать QR»', labels.some((t) => /Сохранить карточку рецепта/.test(t)) && labels.includes('Показать QR'), labels.join(' | '));
      const head = await S(() => document.querySelector('#phone .app-head small')?.textContent);
      check('шапка рецепта: порции склонены', /порц(ия|ии|ий)$/.test(head ?? ''), head);
    }
    // сохранить карточку: перехват скачивания
    const dl = page.waitForEvent('download', { timeout: 60000 });
    await tap(`#phone [data-card="${id}"]`);
    const d = await dl.catch(() => null);
    check(`${label}: скачивание началось`, !!d);
    if (!d) continue;
    check(`${label}: имя файла recept-${id}.png`, d.suggestedFilename() === `recept-${id}.png`, d.suggestedFilename());
    const dest = KEEP.includes(id) ? `${out}/v11_recipe_card_${id}.png` : `${tmp}/v11_recipe_card_${id}.png`;
    await d.saveAs(dest);
    const info = pngInfo(dest);
    check(`${label}: PNG 1080×1350`, info.isPng && info.w === 1080 && info.h === 1350 && info.size > 20000, `${info.w}×${info.h}, ${Math.round(info.size / 1024)} КБ → ${dest}`);
    const toast = await S(() => document.querySelector('.rc-toast')?.textContent ?? '');
    check(`${label}: плашка «сохранена»`, /сохранена/.test(toast), toast);
    verifyQr(`${label} (картинка)`, await readQr({ dataUrl: info.dataUrl }), id);
  }
  check('в консоли нет предупреждений «не помещается»', warns.length === 0, warns.join('; '));

  // окно QR: открыть, снять, проверить пиксели, закрыть тремя способами
  const first = ids[0];
  await openLesson(first);
  await tap(`#phone [data-qr="${first}"]`);
  check('окошко QR открылось', await waitFor(() => !!document.querySelector('.rc-pop .rc-qr')));
  await wait(400);
  await shot(`qr_window_${first}`);
  const box = await S(() => {
    const r = document.querySelector('.rc-card').getBoundingClientRect();
    const q = document.querySelector('.rc-qr').getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, qw: q.width, qh: q.height, vw: innerWidth, vh: innerHeight };
  });
  check('окошко целиком в окне 1280×720', box.l >= 0 && box.t >= 0 && box.r <= box.vw && box.b <= box.vh, JSON.stringify(box));
  check('QR в окошке не меньше 240 px и квадратный', box.qw >= 240 && Math.abs(box.qw - box.qh) < 1, `${Math.round(box.qw)}×${Math.round(box.qh)}`);
  verifyQr('окошко QR', await readQr({ selector: '.rc-pop .rc-qr' }), first);
  const title = await S(() => document.querySelector('.rc-card h3').textContent);
  check('заголовок окошка', /список покупок/.test(title), title);
  const noteText = await S(() => document.querySelector('.rc-note').textContent);
  check('в подписи нет ссылок и брендов', !/https?:|www\.|пят[её]рочк|промокод/i.test(noteText), noteText);
  await page.keyboard.press('Escape');
  await wait(300);
  check('Esc закрыл окошко', (await page.locator('.rc-pop').count()) === 0);
  check('Esc не закрыл телефон и не поставил паузу', await S(() => window.__sueta.session.panel === 'phone'));
  await tap(`#phone [data-qr="${first}"]`);
  await page.mouse.click(8, 8); // щелчок вне окошка
  await wait(300);
  check('щелчок вне окошка закрывает его', (await page.locator('.rc-pop').count()) === 0);
  await tap(`#phone [data-qr="${first}"]`);
  await tap('.rc-pop [data-rc=close]');
  check('«Готово» закрывает окошко', (await page.locator('.rc-pop').count()) === 0);

  // «Сохранить карточку» из окошка
  await tap(`#phone [data-qr="${first}"]`);
  const dl2 = page.waitForEvent('download', { timeout: 60000 });
  await tap('.rc-pop [data-rc=save]');
  check('из окошка тоже можно сохранить карточку', !!(await dl2.catch(() => null)));
  await tap('.rc-pop [data-rc=close]');

  // отказ браузера: toBlob молчит, toDataURL бросает — плашка «что случилось — как исправить», игра цела
  await S(() => {
    // плашка живёт 3,6 с, а кадры в облачном браузере долгие: чтобы успеть снять, на время проверки она не исчезает
    window.__timeout = window.setTimeout;
    window.setTimeout = (fn, ms, ...rest) => window.__timeout(fn, ms >= 3000 && ms < 4000 ? 600000 : ms, ...rest);
    window.__blob = HTMLCanvasElement.prototype.toBlob;
    window.__url = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); };
    HTMLCanvasElement.prototype.toDataURL = function () { throw new Error('refused'); };
  });
  await tap(`#phone [data-card="${first}"]`);
  await waitFor(() => !!document.querySelector('.rc-toast.bad'), 20000);
  const bad = await S(() => document.querySelector('.rc-toast.bad')?.textContent ?? '');
  check('отказ: плашка с понятным текстом (до 70 знаков, без «ошибка»)', bad.length > 0 && bad.length <= 70 && !/ошибк|неверн/i.test(bad), `«${bad}» (${bad.length})`);
  await shot('save_refused');
  await S(() => {
    HTMLCanvasElement.prototype.toBlob = window.__blob;
    HTMLCanvasElement.prototype.toDataURL = window.__url;
    window.setTimeout = window.__timeout;
  });
  check('после отказа телефон и игра на месте', await S(() => window.__sueta.session.panel === 'phone'));
} catch (e) {
  fail++;
  console.log('FAIL сценарий оборвался:', e.message.split('\n').slice(0, 3).join(' / '));
  await shot('error');
}
check('в консоли нет ошибок', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log(`jsQR: ${jsQR ? 'использован' : 'нет — проверка матрицей'}; итого OK ${ok}, FAIL ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
