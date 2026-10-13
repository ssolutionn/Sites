// QR-код без зависимостей (ISO/IEC 18004): режим byte (UTF-8), уровни коррекции L и M, версии 1–25.
// Чистый модуль без DOM: возвращает матрицу модулей, рисует её рецепт-карточка (src/ui/recipe-card.js).
//
//   const qr = makeQr('Список покупок\nКартофель — 3 шт.');   // версия подбирается по длине данных
//   qr.size, qr.version, qr.get(x, y)                         // 1 — тёмный модуль, 0 — светлый
//
// Что внутри, по порядку стандарта: поток битов (режим 0100, длина, байты, терминатор, добивка 0xEC/0x11) →
// деление на блоки и коды Рида–Соломона над GF(256) (полином 0x11D) → перемешивание байтов блоков →
// функциональные шаблоны (поисковые, выравнивающие, полосы синхронизации, тёмный модуль) → змейка данных →
// восемь масок и штраф N1–N4 → информация о формате (BCH 15,5) и версии (BCH 18,6).

/** Наименьшая и наибольшая поддерживаемые версии (17+4·версия модулей по стороне). */
export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 25;

// Номер уровня в формате: L = 01, M = 00 (уровни Q и H не нужны — запас прочности в карточке даёт размер, а не избыточность).
const FORMAT_ECC = { L: 1, M: 0 };

// Байтов коррекции на блок и число блоков по версиям 1..25 (ISO 18004, таблица 9). Индекс 0 не используется.
const ECC_PER_BLOCK = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28],
};
const BLOCKS = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21],
};

const eccKey = (ecc) => {
  if (ecc !== 'L' && ecc !== 'M') throw new RangeError(`QR: уровень коррекции «${ecc}» не поддерживается (нужен L или M)`);
  return ecc;
};
const checkVersion = (v) => {
  if (!Number.isInteger(v) || v < QR_MIN_VERSION || v > QR_MAX_VERSION) throw new RangeError(`QR: версия ${v} вне диапазона ${QR_MIN_VERSION}–${QR_MAX_VERSION}`);
};

/** Сторона матрицы в модулях: 17 + 4·версия. */
export const qrSize = (version) => 17 + 4 * version;

/** Сколько модулей версии отдано под данные и коррекцию (без шаблонов, формата и версии). */
function rawDataModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}

/** Байтов данных (до кодов коррекции) в версии при уровне ecc. */
function dataCodewords(ver, ecc) {
  return Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver] * BLOCKS[ecc][ver];
}

/** Раскладка версии: число блоков, байтов коррекции на блок, всего кодовых слов и байтов данных. */
export function qrLayout(version, ecc = 'M') {
  checkVersion(version);
  const key = eccKey(ecc);
  return { blocks: BLOCKS[key][version], eccPerBlock: ECC_PER_BLOCK[key][version], total: Math.floor(rawDataModules(version) / 8), data: dataCodewords(version, key) };
}

/** Сколько байтов UTF-8 помещается в версию: данные минус 4 бита режима и поле длины (8 бит до версии 9, дальше 16). */
export function qrCapacity(version, ecc = 'M') {
  checkVersion(version);
  const bits = dataCodewords(version, eccKey(ecc)) * 8 - 4 - (version <= 9 ? 8 : 16);
  return Math.floor(bits / 8);
}

/** Наименьшая версия, куда помещаются `byteLength` байтов; 0 — не помещается даже в 25-ю. */
export function qrVersionFor(byteLength, ecc = 'M', minVersion = QR_MIN_VERSION) {
  for (let v = Math.max(minVersion, QR_MIN_VERSION); v <= QR_MAX_VERSION; v++) if (byteLength <= qrCapacity(v, ecc)) return v;
  return 0;
}

/** Текст в байты UTF-8. */
export const utf8 = (text) => new TextEncoder().encode(String(text));

// ---------- GF(256), полином x^8+x^4+x^3+x^2+1 (0x11D) ----------
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Порождающий многочлен Рида–Соломона степени `degree` без старшего члена (коэффициенты от старшего к младшему). */
function rsDivisor(degree) {
  const poly = new Array(degree).fill(0);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = gfMul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = gfMul(root, 2);
  }
  return poly;
}

/** Байты коррекции Рида–Соломона для блока данных: остаток от деления data·x^degree на порождающий многочлен. */
export function rsRemainder(data, degree) {
  const divisor = rsDivisor(degree);
  const rem = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= gfMul(divisor[i], factor);
  }
  return rem;
}

// ---------- информация о формате и версии ----------
/** 15 бит формата: [уровень (2) | маска (3)] + BCH(15,5) с порождающим 0x537, затем XOR 0x5412. */
export function qrFormatBits(ecc, mask) {
  const data = (FORMAT_ECC[eccKey(ecc)] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** 18 бит версии (для версий от 7): номер (6) + BCH(18,6) с порождающим 0x1F25. */
export function qrVersionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

// ---------- сборка потока байтов ----------
function dataStream(bytes, version, ecc) {
  const bits = [];
  const put = (value, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4); // режим byte
  put(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capBits = dataCodewords(version, ecc) * 8;
  put(0, Math.min(4, capBits - bits.length)); // терминатор
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; out.length < capBits / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** Делит данные на блоки, считает коррекцию и перемешивает байты блоков по столбцам (как требует стандарт). */
function interleave(data, version, ecc) {
  const nBlocks = BLOCKS[ecc][version];
  const eccLen = ECC_PER_BLOCK[ecc][version];
  const raw = Math.floor(rawDataModules(version) / 8);
  const nShort = nBlocks - (raw % nBlocks);
  const shortLen = Math.floor(raw / nBlocks);
  const blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    blocks.push({ dat, ecc: rsRemainder(dat, eccLen) });
  }
  const out = [];
  for (let i = 0; i < shortLen - eccLen + 1; i++) for (const b of blocks) if (i < b.dat.length) out.push(b.dat[i]);
  for (let i = 0; i < eccLen; i++) for (const b of blocks) out.push(b.ecc[i]);
  return out;
}

// ---------- матрица ----------
/** Центры выравнивающих шаблонов по одной оси (для версии 1 — пусто). */
function alignmentCenters(version) {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const size = qrSize(version);
  const step = Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
  const pos = [6];
  for (let p = size - 7, k = n - 1; k >= 1; k--, p -= step) pos.splice(1, 0, p);
  return pos;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
];

class Matrix {
  constructor(version) {
    this.version = version;
    this.size = qrSize(version);
    this.m = new Uint8Array(this.size * this.size); // 1 — тёмный
    this.fn = new Uint8Array(this.size * this.size); // 1 — функциональный модуль (маска его не трогает)
  }

  set(x, y, dark, fn = true) {
    this.m[y * this.size + x] = dark ? 1 : 0;
    if (fn) this.fn[y * this.size + x] = 1;
  }

  get(x, y) {
    return this.m[y * this.size + x];
  }

  /** Поисковые узоры 7×7 с белой каймой, полосы синхронизации, выравнивающие узоры, зарезервированные места формата и версии. */
  drawFunctionPatterns() {
    const { size, version } = this;
    for (let i = 0; i < size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x < 0 || y < 0 || x >= size || y >= size) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          this.set(x, y, d !== 2 && d !== 4);
        }
      }
    }
    const c = alignmentCenters(version);
    for (let i = 0; i < c.length; i++) {
      for (let j = 0; j < c.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === c.length - 1) || (i === c.length - 1 && j === 0)) continue; // углы заняты поисковыми
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(c[i] + dx, c[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    this.drawFormat(0, 'L'); // место под формат
    this.drawVersion();
  }

  /** Обе копии 15 бит формата и «тёмный модуль» (8, size−8). */
  drawFormat(mask, ecc) {
    const bits = qrFormatBits(ecc, mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    const { size } = this;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, size - 15 + i, bit(i));
    this.set(8, size - 8, true);
  }

  /** Две копии 18 бит версии (версии от 7). */
  drawVersion() {
    if (this.version < 7) return;
    const bits = qrVersionBits(this.version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = this.size - 11 + (i % 3), b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  /** Змейка по парам столбцов справа налево, снизу вверх и обратно; столбец синхронизации (x = 6) пропускается. */
  drawCodewords(codewords) {
    const { size } = this;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (this.fn[y * size + x] || i >= codewords.length * 8) continue;
          this.set(x, y, ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1, false);
          i++;
        }
      }
    }
  }

  /** XOR маски с модулями данных; повторный вызов снимает маску. */
  applyMask(mask) {
    const f = MASKS[mask];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (!this.fn[y * this.size + x] && f(x, y)) this.m[y * this.size + x] ^= 1;
  }

  /**
   * Штраф маски (ISO 18004, 7.8.3): N1 = 3 + (длина − 5) за каждую линию из 5+ одноцветных модулей;
   * N2 = 3 за каждый блок 2×2; N3 = 40 за 1:1:3:1:1 (тёмный-светлый-тёмный×3-светлый-тёмный) с четырьмя светлыми рядом — за пределами
   * матрицы считается тихая зона, то есть светлое; N4 = 10 за каждые 5 % отклонения доли тёмных от 50 %.
   */
  penalty() {
    const { size: n, m } = this;
    let score = 0;
    const lineScore = (get) => {
      let s = 0;
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && get(i) === get(i - 1)) run++;
        else {
          if (run >= 5) s += 3 + (run - 5);
          run = 1;
        }
      }
      const at = (i) => (i < 0 || i >= n ? 0 : get(i));
      for (let i = 0; i + 7 <= n; i++) {
        if (at(i) && !at(i + 1) && at(i + 2) && at(i + 3) && at(i + 4) && !at(i + 5) && at(i + 6)) {
          if (!at(i - 1) && !at(i - 2) && !at(i - 3) && !at(i - 4)) s += 40;
          if (!at(i + 7) && !at(i + 8) && !at(i + 9) && !at(i + 10)) s += 40;
        }
      }
      return s;
    };
    for (let k = 0; k < n; k++) {
      score += lineScore((i) => m[k * n + i]);
      score += lineScore((i) => m[i * n + k]);
    }
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = m[y * n + x];
        if (c === m[y * n + x + 1] && c === m[(y + 1) * n + x] && c === m[(y + 1) * n + x + 1]) score += 3;
      }
    }
    let dark = 0;
    for (let i = 0; i < n * n; i++) dark += m[i];
    score += (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
    return score;
  }
}

/**
 * Собирает QR-код из текста (UTF-8) или готовых байтов.
 * @param {string|Uint8Array} data
 * @param {{ ecc?: 'L'|'M', minVersion?: number, mask?: number }} [opts] ecc — уровень коррекции (по умолчанию M, ≈15 %);
 *   minVersion — не меньше этой версии; mask 0–7 — зафиксировать маску (по умолчанию выбирается по штрафу).
 * @returns {{ version: number, size: number, ecc: string, mask: number, bytes: number, get: (x:number, y:number) => number, rows: () => string[] }}
 * @throws {RangeError} если данные не помещаются в версию 25 выбранного уровня.
 */
export function makeQr(data, opts = {}) {
  const ecc = eccKey(opts.ecc ?? 'M');
  const bytes = typeof data === 'string' ? utf8(data) : Uint8Array.from(data);
  const version = qrVersionFor(bytes.length, ecc, opts.minVersion ?? QR_MIN_VERSION);
  if (!version) throw new RangeError(`QR: ${bytes.length} байт не помещаются в версию ${QR_MAX_VERSION} (уровень ${ecc}, предел ${qrCapacity(QR_MAX_VERSION, ecc)})`);
  const codewords = interleave(dataStream(bytes, version, ecc), version, ecc);
  const mx = new Matrix(version);
  mx.drawFunctionPatterns();
  mx.drawCodewords(codewords);
  let best = opts.mask ?? -1;
  if (best < 0) {
    let low = Infinity;
    for (let k = 0; k < 8; k++) {
      mx.applyMask(k);
      mx.drawFormat(k, ecc);
      const p = mx.penalty();
      if (p < low) {
        low = p;
        best = k;
      }
      mx.applyMask(k);
    }
  }
  mx.applyMask(best);
  mx.drawFormat(best, ecc);
  const { size } = mx;
  return {
    version,
    size,
    ecc,
    mask: best,
    bytes: bytes.length,
    get: (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : mx.get(x, y)),
    /** Строки из «1» и «0» (1 — тёмный модуль) — удобно сравнивать в тестах. */
    rows: () => Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => mx.get(x, y)).join('')),
  };
}
