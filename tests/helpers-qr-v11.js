// Независимый разбор матрицы QR для тестов 0.11: читает формат, снимает маску, достаёт байты змейкой, проверяет коды Рида–Соломона
// и возвращает текст. Функциональные места считает сам (по таблице центров выравнивающих узоров из ISO 18004), а не берёт из генератора.
import { qrLayout, qrFormatBits, qrVersionBits, rsRemainder } from '../src/qr.js';

/** Центры выравнивающих узоров по версиям 2..25 (ISO 18004, приложение E). */
export const ALIGN = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
  18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90], 21: [6, 28, 50, 72, 94], 22: [6, 26, 50, 74, 98], 23: [6, 30, 54, 78, 102],
  24: [6, 28, 54, 80, 106], 25: [6, 32, 58, 84, 110],
};

const MASK = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
];

/** Карта функциональных модулей: true там, где не данные. */
export function functionMap(version) {
  const n = 17 + 4 * version;
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const rect = (x0, y0, w, h) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (x >= 0 && y >= 0 && x < n && y < n) fn[y][x] = true;
  };
  rect(0, 0, 9, 9); // угол + разделитель + формат
  rect(n - 8, 0, 8, 9);
  rect(0, n - 8, 9, 8);
  rect(6, 0, 1, n); // полосы синхронизации
  rect(0, 6, n, 1);
  const c = ALIGN[version] ?? [];
  for (let i = 0; i < c.length; i++) {
    for (let j = 0; j < c.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === c.length - 1) || (i === c.length - 1 && j === 0)) continue;
      rect(c[i] - 2, c[j] - 2, 5, 5);
    }
  }
  if (version >= 7) {
    rect(n - 11, 0, 3, 6);
    rect(0, n - 11, 6, 3);
  }
  return fn;
}

/**
 * Разбирает QR как сканер. Бросает Error с понятным текстом, если что-то не сходится.
 * @returns {{ version:number, ecc:string, mask:number, text:string, bytes:Uint8Array }}
 */
export function decodeQr(qr) {
  const n = qr.size;
  const version = (n - 17) / 4;
  const dark = (x, y) => qr.get(x, y) === 1;

  // формат: две копии по 15 бит; номера битов — как в стандарте (бит 0 — младший)
  const readA = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const readB = [...Array.from({ length: 8 }, (_, i) => [n - 1 - i, 8]), ...Array.from({ length: 7 }, (_, i) => [8, n - 7 + i])];
  const read = (cells) => cells.reduce((v, [x, y], i) => v | ((dark(x, y) ? 1 : 0) << i), 0);
  const fa = read(readA), fb = read(readB);
  if (fa !== fb) throw new Error(`копии формата различаются: ${fa.toString(2)} и ${fb.toString(2)}`);
  let found = null;
  for (const ecc of ['L', 'M']) for (let m = 0; m < 8; m++) if (qrFormatBits(ecc, m) === fa) found = { ecc, mask: m };
  if (!found) throw new Error(`формат ${fa.toString(2)} не опознан`);

  if (version >= 7) {
    const want = qrVersionBits(version);
    let a = 0, b = 0;
    for (let i = 0; i < 18; i++) {
      a |= (dark(n - 11 + (i % 3), Math.floor(i / 3)) ? 1 : 0) << i;
      b |= (dark(Math.floor(i / 3), n - 11 + (i % 3)) ? 1 : 0) << i;
    }
    if (a !== want || b !== want) throw new Error(`информация о версии: ${a.toString(2)}, ${b.toString(2)}, ждали ${want.toString(2)}`);
  }

  // змейка
  const fn = functionMap(version);
  const bits = [];
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const up = ((right + 1) & 2) === 0;
    for (let v = 0; v < n; v++) {
      for (const x of [right, right - 1]) {
        const y = up ? n - 1 - v : v;
        if (fn[y][x]) continue;
        bits.push(dark(x, y) !== MASK[found.mask](x, y) ? 1 : 0);
      }
    }
  }
  const lay = qrLayout(version, found.ecc);
  const words = [];
  for (let i = 0; i + 8 <= bits.length && words.length < lay.total; i += 8) words.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  if (words.length !== lay.total) throw new Error(`кодовых слов ${words.length}, ждали ${lay.total}`);

  // разбор по блокам
  const shortLen = Math.floor(lay.total / lay.blocks);
  const nShort = lay.blocks - (lay.total % lay.blocks);
  const dataLens = Array.from({ length: lay.blocks }, (_, i) => shortLen - lay.eccPerBlock + (i < nShort ? 0 : 1));
  const blocks = dataLens.map(() => ({ dat: [], ecc: [] }));
  let p = 0;
  for (let col = 0; col < Math.max(...dataLens); col++) blocks.forEach((b, i) => col < dataLens[i] && b.dat.push(words[p++]));
  for (let col = 0; col < lay.eccPerBlock; col++) for (const b of blocks) b.ecc.push(words[p++]);
  blocks.forEach((b, i) => {
    const want = rsRemainder(b.dat, lay.eccPerBlock);
    if (want.join() !== b.ecc.join()) throw new Error(`код коррекции блока ${i} не сходится`);
  });
  const data = blocks.flatMap((b) => b.dat);

  // поток: 0100, длина, байты
  const stream = data.map((w) => w.toString(2).padStart(8, '0')).join('');
  if (stream.slice(0, 4) !== '0100') throw new Error(`режим ${stream.slice(0, 4)}, ждали 0100 (byte)`);
  const lenBits = version <= 9 ? 8 : 16;
  const len = parseInt(stream.slice(4, 4 + lenBits), 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(stream.slice(4 + lenBits + i * 8, 4 + lenBits + i * 8 + 8), 2);
  // добивка после терминатора: 0xEC, 0x11 по очереди
  let tail = 4 + lenBits + len * 8;
  const term = Math.min(4, stream.length - tail);
  if (/1/.test(stream.slice(tail, tail + term))) throw new Error('терминатор не из нулей');
  tail += term;
  tail = Math.ceil(tail / 8) * 8;
  for (let i = 0, pad = 0xec; tail + 8 <= stream.length; i++, pad ^= 0xec ^ 0x11, tail += 8) {
    if (parseInt(stream.slice(tail, tail + 8), 2) !== pad) throw new Error(`байт добивки ${i} не ${pad.toString(16)}`);
  }
  return { version, ...found, bytes, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
}
