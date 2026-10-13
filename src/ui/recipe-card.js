// «Рецепт домой» (0.11, идея 5): карточка рецепта картинкой 1080×1350 с QR и окошко с крупным QR.
// Данные — src/campaign/recipe-home.js, раскладка — recipe-card-layout.js (чистая, с тестами), QR — src/qr.js.
// Здесь только canvas, сохранение файла и окошко. Состояние игры не трогаем. Стили окошка — recipe-card.css (подключён в index.html:
// импорт css из js ломает тесты в node).
import { recipeHome } from '../campaign/recipe-home.js';
import { makeQr } from '../qr.js';
import { layoutRecipeCard, CARD_W, CARD_H, COLORS, QR_QUIET } from './recipe-card-layout.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** QR для текста карточки: уровень M, а если не помещается — L (пакет ≤ 780 байт этого почти не требует). */
export function qrForHome(home) {
  try {
    return makeQr(home.qrText, { ecc: 'M' });
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    return makeQr(home.qrText, { ecc: 'L' });
  }
}

// Шрифт Nunito подгружается кусками по алфавиту: просим те, что нужны карточке, иначе canvas нарисует запасным шрифтом.
async function loadFonts() {
  try {
    const probe = 'АбВг ёЁ 0123 ½ ·';
    await Promise.all(['900 40px', '800 30px', '700 30px', '600 30px'].map((w) => document.fonts.load(`${w} Nunito`, probe)));
    await document.fonts.ready;
  } catch {
    /* без шрифта картинка получится запасным — это не отказ */
  }
}

/** Рисует QR на canvas: белый блок с тихой зоной в QR_QUIET модулей и чёрные модули целыми пикселями. */
export function paintQr(g, qr, x, y, module) {
  const block = (qr.size + QR_QUIET * 2) * module;
  g.fillStyle = COLORS.white;
  g.fillRect(x, y, block, block);
  g.fillStyle = COLORS.black;
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (!qr.get(c, r)) continue;
      let end = c;
      while (end + 1 < qr.size && qr.get(end + 1, r)) end++;
      g.fillRect(x + (QR_QUIET + c) * module, y + (QR_QUIET + r) * module, (end - c + 1) * module, module);
      c = end;
    }
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Гирлянда под верхней полосой: провисающая нить и лампочки трёх цветов.
function garland(g, op) {
  const bulbs = [COLORS.berry, COLORS.gold, COLORS.pineHi];
  const n = 6;
  const step = (op.w - 80) / n;
  g.lineWidth = 3;
  g.strokeStyle = '#7a6a58';
  let k = 0;
  for (let i = 0; i < n; i++) {
    const x0 = 40 + i * step, x1 = x0 + step;
    g.beginPath();
    g.moveTo(x0, op.y + 4);
    g.quadraticCurveTo((x0 + x1) / 2, op.y + 34, x1, op.y + 4);
    g.stroke();
    for (const t of [0.22, 0.5, 0.78]) {
      const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2) + t * t * x1;
      const by = (1 - t) * (1 - t) * (op.y + 4) + 2 * (1 - t) * t * (op.y + 34) + t * t * (op.y + 4);
      g.fillStyle = bulbs[k++ % bulbs.length];
      g.beginPath();
      g.ellipse(bx, by + 10, 7, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** Рисует карточку рецепта на новом canvas и возвращает его вместе с раскладкой. */
export function renderRecipeCard(home, qr = qrForHome(home)) {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  const g = c.getContext('2d');
  const measure = (t, font) => {
    g.font = font;
    return g.measureText(t).width;
  };
  const layout = layoutRecipeCard(home, measure, { qrSize: qr.size });
  if (!layout.fits) console.warn(`recipe-card: «${home.id}» не помещается (масштаб ${layout.scale}, шагов ${layout.steps})`);
  g.textBaseline = 'alphabetic';
  for (const op of layout.ops) {
    switch (op.t) {
      case 'bg': {
        const grad = g.createLinearGradient(0, 0, 0, op.h);
        grad.addColorStop(0, COLORS.paper);
        grad.addColorStop(1, COLORS.paper2);
        g.fillStyle = grad;
        g.fillRect(0, 0, op.w, op.h);
        break;
      }
      case 'rect':
        g.fillStyle = op.fill;
        if (op.r) {
          roundRect(g, op.x, op.y, op.w, op.h, op.r);
          g.fill();
          if (op.stroke) {
            g.lineWidth = op.lw ?? 2;
            g.strokeStyle = op.stroke;
            g.stroke();
          }
        } else g.fillRect(op.x, op.y, op.w, op.h);
        break;
      case 'dot':
        g.fillStyle = op.fill;
        g.beginPath();
        g.arc(op.x, op.y, op.r, 0, Math.PI * 2);
        g.fill();
        break;
      case 'text':
        g.font = op.font;
        g.fillStyle = op.color;
        g.textAlign = op.align;
        g.fillText(op.text, op.x, op.y);
        break;
      case 'garland':
        garland(g, op);
        break;
      case 'qr':
        // тонкая рамка под белым блоком отделяет код от бумаги, сам блок остаётся чистым чёрным на белом
        g.fillStyle = 'rgba(43, 34, 28, 0.18)';
        roundRect(g, op.x - 3, op.y - 3, op.block + 6, op.block + 6, 6);
        g.fill();
        paintQr(g, qr, op.x, op.y, op.module);
        break;
      default:
        break;
    }
  }
  g.textAlign = 'left';
  return { canvas: c, layout, qr };
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    const viaData = () => {
      try {
        const [head, b64] = canvas.toDataURL('image/png').split(',');
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve(new Blob([bytes], { type: /:(.*?);/.exec(head)?.[1] ?? 'image/png' }));
      } catch (e) {
        reject(e);
      }
    };
    if (!canvas.toBlob) return viaData();
    try {
      canvas.toBlob((b) => (b ? resolve(b) : viaData()), 'image/png');
    } catch {
      viaData();
    }
  });
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000); // ссылка нужна, пока браузер начинает скачивание
}

/** Короткая плашка поверх всего (в том числе поверх телефона), исчезает сама. */
function notify(text, kind = '') {
  document.querySelectorAll('.rc-toast').forEach((n) => n.remove());
  const d = document.createElement('div');
  d.className = `rc-toast ${kind}`;
  d.setAttribute('role', 'status');
  d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 3600);
}

/**
 * Сохраняет карточку рецепта картинкой (PNG через <a download>; в Electron работает так же).
 * При отказе браузера показывает плашку «что случилось — как исправить» и возвращает false.
 * @param {string} id id блюда
 * @returns {Promise<boolean>}
 */
export async function saveRecipeCard(id) {
  const home = recipeHome(id);
  if (!home) return false;
  try {
    await loadFonts();
    const { canvas } = renderRecipeCard(home);
    const blob = await toBlob(canvas);
    download(blob, `recept-${id}.png`);
    notify(`Карточка «${home.title}» сохранена`, 'good');
    return true;
  } catch (e) {
    console.warn('recipe-card: не сохранилось', e);
    notify('Картинка не сохранилась — попробуй ещё раз или разреши загрузки', 'bad');
    return false;
  }
}

let popup = null;

/** Закрывает окошко с QR, если оно открыто. */
export function closeRecipeQr() {
  if (!popup) return;
  const { el, onKey, prevFocus } = popup;
  popup = null;
  window.removeEventListener('keydown', onKey, true);
  el.remove();
  try {
    prevFocus?.focus?.({ preventScroll: true });
  } catch {
    /* телефон мог перерисоваться — фокус вернуть некуда */
  }
}

/**
 * Показывает крупный QR со списком покупок в окошке поверх игры. Закрывается кнопкой, щелчком вне окошка и Esc.
 * @param {string} id id блюда
 * @returns {boolean} открылось ли окошко
 */
export function showRecipeQr(id) {
  const home = recipeHome(id);
  if (!home) return false;
  closeRecipeQr();
  let qr;
  try {
    qr = qrForHome(home);
  } catch (e) {
    console.warn('recipe-card: QR не собрался', e);
    notify('Код не собрался — закрой телефон и открой рецепт снова', 'bad');
    return false;
  }
  const module = Math.max(4, Math.floor(520 / (qr.size + QR_QUIET * 2)));
  const el = document.createElement('div');
  el.className = 'rc-pop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'rc-title');
  el.innerHTML = `<div class="rc-card">
    <h3 id="rc-title">${esc(home.title)} — список покупок</h3>
    <p class="rc-sub">${esc(home.servingsText)}</p>
    <canvas class="rc-qr" aria-label="QR-код со списком покупок"></canvas>
    <p class="rc-note">Наведи камеру телефона на код — продукты и нормы появятся обычным текстом. Внутри нет ссылок.</p>
    <div class="rc-actions"><button class="primary" data-rc="close">Готово</button><button class="ghost" data-rc="save">Сохранить карточку</button></div>
  </div>`;
  const cv = el.querySelector('canvas');
  cv.width = cv.height = (qr.size + QR_QUIET * 2) * module;
  paintQr(cv.getContext('2d'), qr, 0, 0, module);
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation(); // Esc закрывает окошко, а не ставит игру на паузу
    closeRecipeQr();
  };
  el.addEventListener('click', (e) => {
    if (e.target === el) return closeRecipeQr();
    const b = e.target.closest('[data-rc]');
    if (!b) return;
    if (b.dataset.rc === 'close') closeRecipeQr();
    else saveRecipeCard(id);
  });
  window.addEventListener('keydown', onKey, true);
  popup = { el, onKey, prevFocus: document.activeElement };
  document.body.appendChild(el);
  el.querySelector('[data-rc=close]').focus({ preventScroll: true });
  return true;
}
