// Раскладка карточки «Рецепт домой» 1080×1350 (0.11, идея 5). Чистый модуль без DOM: на входе данные из recipe-home.js и функция
// измерения текста, на выходе список операций рисования. Рисует их recipe-card.js (canvas), проверяют tests/recipe-card-v11.test.js.
//
// Сверху вниз: полоса и гирлянда → название и порции → «Продукты» в две колонки → плашка «Соль и перец» (ложки на вес блюда) →
// «Как готовить» слева и справа от шагов подпись с QR (QR прижат к низу, под ним полоса с названием игры).
// Шрифты продуктов и шагов подбираются ступенями: короткому рецепту — крупнее, длинному — мельче (до 0,82); если и так тесно,
// лишние шаги с конца убираются.

export const CARD_W = 1080;
export const CARD_H = 1350;
export const CARD_MARGIN = 70;
/** Тихая зона QR вокруг кода, в модулях (стандарт требует не меньше четырёх). */
export const QR_QUIET = 4;
/** Ширина блока QR вместе с тихой зоной не больше этого, px; сам код при этом не меньше QR_MIN_PX. */
export const QR_BLOCK_MAX = 390;
export const QR_MIN_PX = 240;

export const FONT = "Nunito, ui-rounded, system-ui, 'Segoe UI', Roboto, Arial, sans-serif";
export const COLORS = {
  paper: '#fff8ec', paper2: '#f6e6c8', line: '#e6d6b8', ink: '#2b221c', ink2: '#6e5e50', pine: '#1f5c46', pineHi: '#2c8a5f',
  berry: '#d23c3c', berryDark: '#a32a2f', gold: '#f2b544', goldSoft: '#fff1cf', white: '#ffffff', black: '#000000',
};
// Ступени размера текста продуктов и шагов: короткий рецепт растёт до 1,3, длинный сжимается до 0,82
const SCALES = [1.3, 1.22, 1.14, 1.07, 1, 0.94, 0.88, 0.82];
const FOOTER_H = 64;
export const HASHTAG = '#новогодняясуета';
export const GAME_NAME = 'Симулятор новогодней суеты';
export const QR_CAPTION = 'Сканируй — список покупок';
export const QR_NOTE = 'Внутри обычный текст: продукты и нормы в ложках и граммах. Без ссылок.';

const f = (weight, px) => `${weight} ${Math.round(px * 10) / 10}px ${FONT}`;

/** Клей для переносов: число не отрывается от меры («½ ч. л.», «3 шт.»), тире не уходит в начало строки. */
export function glue(text) {
  return String(text)
    .replace(/([\d½¼¾⅛⅜⅝⅞≈])\s+(?=\S)/g, '$1 ')
    .replace(/(ч|ст)\.\s+(?=л\.)/g, '$1. ')
    .replace(/\s—\s/g, ' — ');
}

/** Сколько пикселей занимает модуль QR: наибольшее целое, при котором код с тихой зоной не шире QR_BLOCK_MAX. */
export function qrModulePx(size) {
  return Math.max(2, Math.floor(QR_BLOCK_MAX / (size + QR_QUIET * 2)));
}

/**
 * Жадный перенос: runs — куски текста со своим шрифтом и цветом, режутся по пробелам; слова с неразрывным пробелом остаются вместе.
 * @returns {{ lines: {items: {text:string, x:number, font:string, color:string}[]}[] }}
 */
function flow(runs, measure, maxW) {
  const words = [];
  for (const r of runs) for (const w of glue(r.text).split(' ')) if (w) words.push({ text: w, font: r.font, color: r.color });
  const lines = [];
  let cur = [];
  let x = 0;
  for (const w of words) {
    const ww = measure(w.text, w.font);
    const gap = cur.length ? measure(' ', cur[cur.length - 1].font) : 0;
    if (cur.length && x + gap + ww > maxW) {
      lines.push({ items: cur });
      cur = [];
      x = 0;
    }
    const at = cur.length ? x + gap : 0;
    cur.push({ ...w, x: at });
    x = at + ww;
  }
  if (cur.length) lines.push({ items: cur });
  return { lines };
}

/** Делит записи на две колонки так, чтобы длиннее была как можно короче. `heights` — высота каждой записи. */
function splitColumns(heights) {
  let best = 0;
  let bestMax = Infinity;
  for (let i = 0; i <= heights.length; i++) {
    const left = heights.slice(0, i).reduce((a, b) => a + b, 0);
    const right = heights.slice(i).reduce((a, b) => a + b, 0);
    if (Math.max(left, right) < bestMax) {
      bestMax = Math.max(left, right);
      best = i;
    }
  }
  return best;
}

/**
 * Раскладывает карточку.
 * @param {ReturnType<import('../campaign/recipe-home.js').recipeHome>} home данные карточки
 * @param {(text: string, font: string) => number} measure ширина текста в px для CSS-шрифта
 * @param {{ qrSize: number }} opts qrSize — сторона матрицы QR в модулях
 * @returns {{ ops: object[], scale: number, fits: boolean, steps: number, qr: {x:number,y:number,module:number,size:number,block:number}, bottom: number }}
 */
export function layoutRecipeCard(home, measure, { qrSize }) {
  for (const scale of SCALES) {
    const out = attempt(home, measure, qrSize, scale, home.steps.length);
    if (out.fits) return out;
  }
  let last = null;
  for (let n = home.steps.length - 1; n >= Math.min(3, home.steps.length); n--) {
    last = attempt(home, measure, qrSize, SCALES.at(-1), n);
    if (last.fits) return last;
  }
  return last ?? attempt(home, measure, qrSize, SCALES.at(-1), home.steps.length);
}

function attempt(home, measure, qrSize, k, nSteps) {
  const W = CARD_W, H = CARD_H, M = CARD_MARGIN;
  const ops = [];
  const text = (t, x, y, font, color, align = 'left') => ops.push({ t: 'text', text: t, x, y, font, color, align });

  // фон, полоса, гирлянда
  ops.push({ t: 'bg', w: W, h: H });
  ops.push({ t: 'rect', x: 0, y: 0, w: W, h: 22, fill: COLORS.berry });
  ops.push({ t: 'garland', x: 0, y: 22, w: W });

  // название: до 84 px, длинное сжимается, чтобы влезть в одну строку
  let tPx = 84;
  while (tPx > 54 && measure(home.title, f(900, tPx)) > W - 2 * M) tPx -= 2;
  let y = 52 + tPx * 0.95;
  text(home.title, M, y, f(900, tPx), COLORS.pine);
  y += 46;
  text(`${home.servingsText} · рецепт домой`, M, y, f(700, 32), COLORS.ink2);
  y += 34;

  // продукты
  text('Продукты', M, y + 22, f(900, 36), COLORS.ink);
  ops.push({ t: 'rect', x: M, y: y + 36, w: W - 2 * M, h: 3, fill: COLORS.line });
  y += 62;
  const gap = 44;
  const colW = (W - 2 * M - gap) / 2;
  const indent = 26;
  const nameF = f(900, 30 * k), amtF = f(600, 30 * k);
  const lineH = 38 * k, rowGap = 9 * k;
  const entries = home.items.map((it) => {
    const { lines } = flow([{ text: it.name, font: nameF, color: COLORS.ink }, { text: ` — ${it.amount}`, font: amtF, color: COLORS.ink2 }], measure, colW - indent);
    return { lines, h: lines.length * lineH + rowGap };
  });
  const split = splitColumns(entries.map((e) => e.h));
  let bottomOfIngredients = y;
  [entries.slice(0, split), entries.slice(split)].forEach((col, ci) => {
    let cy = y;
    const x0 = M + ci * (colW + gap);
    for (const e of col) {
      ops.push({ t: 'dot', x: x0 + 8, y: cy + lineH * 0.55, r: 6, fill: COLORS.berry });
      e.lines.forEach((ln, li) => ln.items.forEach((it) => text(it.text, x0 + indent + it.x, cy + li * lineH + 28 * k, it.font, it.color)));
      cy += e.h;
    }
    bottomOfIngredients = Math.max(bottomOfIngredients, cy);
  });
  y = bottomOfIngredients + 8;

  // соль и перец в ложках на вес блюда
  if (home.season) {
    const ph = 124;
    ops.push({ t: 'rect', x: M, y, w: W - 2 * M, h: ph, r: 26, fill: COLORS.goldSoft, stroke: COLORS.gold, lw: 3 });
    const tiles = [['Соль', home.season.salt], ...(home.season.pepper ? [['Перец', home.season.pepper]] : [])];
    tiles.forEach(([label, amount], i) => {
      const x = M + 34 + i * 290;
      text(label, x, y + 42, f(800, 28), COLORS.ink2);
      text(amount, x, y + 96, f(900, 50), COLORS.berryDark);
    });
    const baseX = M + 34 + tiles.length * 290 + 6;
    const baseW = W - M - 28 - baseX;
    const { lines } = flow([{ text: `на ${home.season.gramsText} ${home.season.base}`, font: f(800, 32), color: COLORS.ink }], measure, baseW);
    const top = y + ph / 2 - (lines.length * 40) / 2 + 30;
    lines.forEach((ln, li) => ln.items.forEach((it) => text(it.text, baseX + it.x, top + li * 40, it.font, it.color)));
    y += ph + 26;
  } else y += 12;

  // QR: прижат к низу, под ним полоса с названием игры
  const mod = qrModulePx(qrSize);
  const block = (qrSize + QR_QUIET * 2) * mod;
  const limit = H - FOOTER_H - 26;
  const qr = { x: W - M - block, y: limit - block, module: mod, size: qrSize, block };

  // шаги слева от QR
  const stepsHead = y;
  text('Как готовить', M, y + 22, f(900, 36), COLORS.ink);
  ops.push({ t: 'rect', x: M, y: y + 36, w: qr.x - 28 - M, h: 3, fill: COLORS.line });
  y += 66;
  const stepsW = qr.x - 28 - M;
  const stepF = f(600, 28 * k), stepLH = 35 * k;
  home.steps.slice(0, nSteps).forEach((s, i) => {
    const { lines } = flow([{ text: s, font: stepF, color: COLORS.ink }], measure, stepsW - 58);
    ops.push({ t: 'dot', x: M + 21, y: y + 15 * k, r: 21, fill: COLORS.berry });
    text(String(i + 1), M + 21, y + 25 * k, f(900, 26), COLORS.white, 'center');
    lines.forEach((ln, li) => ln.items.forEach((it) => text(it.text, M + 58 + it.x, y + 24 * k + li * stepLH, it.font, it.color)));
    y += Math.max(lines.length * stepLH, 42) + 14 * k;
  });
  const bottom = y;

  // подпись к QR — над кодом, в правой колонке
  const cap = flow([{ text: QR_CAPTION, font: f(900, 40), color: COLORS.pine }], measure, block);
  const note = flow([{ text: QR_NOTE, font: f(600, 25), color: COLORS.ink2 }], measure, block);
  const capH = cap.lines.length * 48 + 10 + note.lines.length * 32;
  const capBoxTop = qr.y - 20 - capH;
  let cy = capBoxTop + 38;
  cap.lines.forEach((ln, li) => ln.items.forEach((it) => text(it.text, qr.x + it.x, cy + li * 48, it.font, it.color)));
  cy += cap.lines.length * 48 + 6;
  note.lines.forEach((ln, li) => ln.items.forEach((it) => text(it.text, qr.x + it.x, cy + li * 32, it.font, it.color)));

  ops.push({ t: 'qr', ...qr });

  // нижняя полоса
  ops.push({ t: 'rect', x: 0, y: H - FOOTER_H, w: W, h: FOOTER_H, fill: COLORS.pine });
  text(`${GAME_NAME} · ${HASHTAG}`, W / 2, H - 22, f(800, 30), COLORS.white, 'center');

  // влезло ли: шаги кончаются выше нижнего поля, подпись не заходит на плашку соли и перца, код не мельче QR_MIN_PX
  const fits = bottom <= limit && capBoxTop >= stepsHead && qrSize * mod >= QR_MIN_PX;
  return { ops, scale: k, fits, steps: Math.min(nSteps, home.steps.length), qr, bottom, capTop: capBoxTop };
}
