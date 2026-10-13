// 0.11, идея 5 «Рецепт домой»: генератор QR без зависимостей (src/qr.js).
// Эталоны: ёмкость версий и биты формата — из ISO 18004; матрицы и хеши сняты с независимой реализации (qrcode-generator 2.0.4, MIT)
// при той же маске; кроме того каждая матрица разбирается заново «как сканером» (tests/helpers-qr-v11.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeQr, qrCapacity, qrVersionFor, qrSize, qrFormatBits, qrVersionBits, qrLayout, rsRemainder, utf8, QR_MAX_VERSION } from '../src/qr.js';
import { decodeQr } from './helpers-qr-v11.js';

const fnv = (rows) => {
  let h = 0x811c9dc5;
  for (const ch of rows.join('')) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
const fill = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + ((i * 7 + 3) % 26))).join('');

test('сторона матрицы — 17 + 4·версия, версии 1–25', () => {
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    assert.equal(qrSize(v), 17 + 4 * v);
    const q = makeQr(fill(qrCapacity(v, 'M')), { ecc: 'M' });
    assert.equal(q.version, v, `версия ${v}`);
    assert.equal(q.size, 17 + 4 * v);
    assert.equal(q.rows().length, q.size);
    assert.ok(q.rows().every((r) => r.length === q.size));
  }
  assert.equal(makeQr('HELLO WORLD').size, 21);
});

test('ёмкость в байтах — по таблице стандарта (режим byte)', () => {
  const L = { 1: 17, 2: 32, 3: 53, 4: 78, 5: 106, 6: 134, 7: 154, 8: 192, 9: 230, 10: 271, 15: 520, 20: 858, 25: 1273 };
  const M = { 1: 14, 2: 26, 3: 42, 4: 62, 5: 84, 6: 106, 7: 122, 8: 152, 9: 180, 10: 213, 15: 412, 20: 666, 25: 997 };
  for (const [v, cap] of Object.entries(L)) assert.equal(qrCapacity(+v, 'L'), cap, `L${v}`);
  for (const [v, cap] of Object.entries(M)) assert.equal(qrCapacity(+v, 'M'), cap, `M${v}`);
});

test('раскладка по блокам: 1-M — один блок и 10 байтов коррекции, 5-M и 10-L — как в стандарте', () => {
  assert.deepEqual(qrLayout(1, 'M'), { blocks: 1, eccPerBlock: 10, total: 26, data: 16 });
  assert.deepEqual(qrLayout(5, 'M'), { blocks: 2, eccPerBlock: 24, total: 134, data: 86 });
  assert.deepEqual(qrLayout(10, 'L'), { blocks: 4, eccPerBlock: 18, total: 346, data: 274 });
  assert.deepEqual(qrLayout(25, 'L'), { blocks: 12, eccPerBlock: 26, total: 1588, data: 1276 });
});

test('версия округляется вверх под длину данных: на границе остаётся, на байт больше — следующая', () => {
  for (const ecc of ['L', 'M']) {
    for (let v = 1; v < QR_MAX_VERSION; v++) {
      const cap = qrCapacity(v, ecc);
      assert.equal(qrVersionFor(cap, ecc), v, `${ecc}${v} на границе`);
      assert.equal(qrVersionFor(cap + 1, ecc), v + 1, `${ecc}${v}+1`);
    }
  }
  assert.equal(qrVersionFor(0, 'M'), 1);
  assert.equal(qrVersionFor(14, 'M'), 1);
  assert.equal(qrVersionFor(15, 'M'), 2);
  assert.equal(qrVersionFor(17, 'L'), 1);
  assert.equal(qrVersionFor(18, 'L'), 2);
  assert.equal(makeQr(fill(15), { ecc: 'M' }).version, 2);
  assert.equal(makeQr(fill(14), { ecc: 'M' }).version, 1);
  assert.equal(makeQr(fill(14), { ecc: 'M', minVersion: 4 }).version, 4, 'minVersion поднимает версию');
});

test('переполнение: за пределом версии 25 — RangeError с понятным текстом, ровно на пределе — работает', () => {
  assert.throws(() => makeQr(fill(998), { ecc: 'M' }), (e) => e instanceof RangeError && /не помещаются/.test(e.message) && /997/.test(e.message));
  assert.throws(() => makeQr(fill(1274), { ecc: 'L' }), RangeError);
  assert.equal(qrVersionFor(998, 'M'), 0);
  assert.equal(makeQr(fill(997), { ecc: 'M' }).version, 25);
  assert.equal(makeQr(fill(1273), { ecc: 'L' }).version, 25);
  assert.throws(() => makeQr('x', { ecc: 'Q' }), RangeError, 'уровни Q и H не поддерживаются');
  assert.throws(() => qrCapacity(26, 'L'), RangeError);
  assert.throws(() => qrCapacity(0, 'L'), RangeError);
});

test('UTF-8: кириллица — два байта на букву, дробь ½ и тире считаются байтами, эмодзи — четыре', () => {
  assert.equal(utf8('Соль').length, 8);
  assert.equal(utf8('½').length, 2);
  assert.equal(utf8('—').length, 3);
  assert.equal(utf8('🐈').length, 4);
  for (const s of ['Оливье — ½ ч. л. на 1,5 кг', 'Список покупок\nКартофель — 3 шт. (≈300 г)', 'ёЁ ⅛ ¼ ≈ —', 'a🐈b']) {
    const q = makeQr(s);
    assert.equal(q.bytes, utf8(s).length);
    const d = decodeQr(q);
    assert.equal(d.text, s);
    assert.deepEqual([...d.bytes], [...utf8(s)]);
  }
  assert.deepEqual(decodeQr(makeQr(new Uint8Array([0x48, 0x49]))).text, 'HI', 'готовые байты тоже принимаются');
});

test('биты формата: известные значения из стандарта (L/M × маски), копии в матрице совпадают', () => {
  const want = {
    L0: '111011111000100', L1: '111001011110011', L2: '111110110101010', L3: '111100010011101',
    L4: '110011000101111', L5: '110001100011000', L6: '110110001000001', L7: '110100101110110',
    M0: '101010000010010', M1: '101000100100101', M2: '101111001111100', M3: '101101101001011',
    M4: '100010111111001', M5: '100000011001110', M6: '100111110010111', M7: '100101010100000',
  };
  for (const [k, bits] of Object.entries(want)) assert.equal(qrFormatBits(k[0], +k[1]).toString(2).padStart(15, '0'), bits, k);
  // в матрице: 15 бит у левого верхнего угла, старший бит — в (0,8)
  const q = makeQr('HELLO WORLD', { ecc: 'M', mask: 5 });
  const a = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  assert.equal(a.reduce((v, [x, y], i) => v | (q.get(x, y) << i), 0), qrFormatBits('M', 5));
});

test('биты версии (от 7-й): 7 — 000111110010010100, 8 — 001000010110111100; в матрице обе копии', () => {
  assert.equal(qrVersionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
  assert.equal(qrVersionBits(8).toString(2).padStart(18, '0'), '001000010110111100');
  const q = makeQr(fill(qrCapacity(7, 'L')), { ecc: 'L' });
  assert.equal(q.version, 7);
  let a = 0, b = 0;
  for (let i = 0; i < 18; i++) {
    a |= q.get(q.size - 11 + (i % 3), Math.floor(i / 3)) << i;
    b |= q.get(Math.floor(i / 3), q.size - 11 + (i % 3)) << i;
  }
  assert.equal(a, qrVersionBits(7));
  assert.equal(b, qrVersionBits(7));
});

test('Рид–Соломон над GF(256): «HELLO WORLD» 1-M — известные 10 байтов коррекции', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  assert.deepEqual(rsRemainder([0, 0, 0], 7), [0, 0, 0, 0, 0, 0, 0], 'нулевые данные — нулевая коррекция');
  assert.equal(rsRemainder([1, 2, 3, 4, 5], 7).length, 7);
});

test('функциональные шаблоны: три поисковых узора, полосы синхронизации, тёмный модуль, светлые разделители', () => {
  for (const v of [1, 2, 7, 14, 25]) {
    const q = makeQr(fill(qrCapacity(v, 'L')), { ecc: 'L' });
    const n = q.size;
    // поисковый узор 7×7: тёмная рамка, светлое кольцо, тёмный центр 3×3
    for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const d = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          assert.equal(q.get(ox + x, oy + y), d === 2 ? 0 : 1, `v${v} (${ox},${oy}) ${x},${y}`);
        }
      }
    }
    // светлый разделитель шириной 1 вокруг поисковых узоров
    for (let i = 0; i < 8; i++) {
      assert.equal(q.get(7, i), 0);
      assert.equal(q.get(i, 7), 0);
      assert.equal(q.get(n - 8, i), 0);
      assert.equal(q.get(n - 1 - i, 7), 0);
      assert.equal(q.get(7, n - 1 - i), 0);
      assert.equal(q.get(i, n - 8), 0);
    }
    // синхронизация: чередуется, начиная с тёмного
    for (let i = 8; i < n - 8; i++) {
      assert.equal(q.get(i, 6), i % 2 === 0 ? 1 : 0, `v${v} строка 6, ${i}`);
      assert.equal(q.get(6, i), i % 2 === 0 ? 1 : 0, `v${v} столбец 6, ${i}`);
    }
    assert.equal(q.get(8, n - 8), 1, 'тёмный модуль');
    assert.equal(q.get(-1, 0), 0, 'за границей — светло');
  }
  // выравнивающий узор версии 2 — центр (18, 18): тёмный центр, светлое кольцо, тёмная рамка
  const q2 = makeQr(fill(20), { ecc: 'L', minVersion: 2 });
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) assert.equal(q2.get(18 + dx, 18 + dy), Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 0 : 1);
});

test('сканер-проверка: матрицы версий 1–25 обоих уровней разбираются, коррекция сходится, текст тот же', () => {
  for (const ecc of ['L', 'M']) {
    for (let v = 1; v <= QR_MAX_VERSION; v++) {
      for (const len of [qrCapacity(v, ecc), Math.max(1, qrCapacity(v, ecc) - 9)]) {
        const s = fill(len);
        const q = makeQr(s, { ecc, minVersion: v });
        const d = decodeQr(q);
        assert.equal(d.text, s, `${ecc}${v} len ${len}`);
        assert.equal(d.ecc, ecc);
        assert.equal(d.version, q.version);
        assert.equal(d.mask, q.mask);
      }
    }
  }
});

test('все восемь масок дают разбираемый код, каждая — со своим форматом', () => {
  const s = 'Список покупок\nСоль — ½ ч. л. на 1,5 кг';
  const rows = new Set();
  for (let m = 0; m < 8; m++) {
    const q = makeQr(s, { mask: m });
    assert.equal(q.mask, m);
    assert.equal(decodeQr(q).text, s);
    rows.add(q.rows().join());
  }
  assert.equal(rows.size, 8, 'маски различаются');
});

// штраф маски по ISO 18004 — независимая запись на строках
function penalty(rows) {
  const n = rows.length;
  const lines = [...rows];
  for (let x = 0; x < n; x++) lines.push(rows.map((r) => r[x]).join(''));
  let s = 0;
  for (const l of lines) {
    for (const m of l.matchAll(/0{5,}|1{5,}/g)) s += 3 + (m[0].length - 5);
    const padded = `0000${l}0000`;
    for (let i = 0; i + 11 <= padded.length; i++) {
      const w = padded.slice(i, i + 11);
      if (w === '00001011101') s += 40;
      if (w === '10111010000') s += 40;
    }
  }
  for (let y = 0; y < n - 1; y++) {
    for (let x = 0; x < n - 1; x++) {
      const c = rows[y][x];
      if (rows[y][x + 1] === c && rows[y + 1][x] === c && rows[y + 1][x + 1] === c) s += 3;
    }
  }
  const dark = rows.join('').split('1').length - 1;
  return s + (Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1) * 10;
}

test('выбрана маска с наименьшим штрафом (N1–N4), при равенстве — с меньшим номером', () => {
  for (const [s, ecc] of [['HELLO WORLD', 'L'], ['HELLO WORLD', 'M'], ['Оливье — ½ ч. л. на 1,5 кг', 'M'], ['abcdefghij'.repeat(30), 'L'], ['Список покупок'.repeat(12), 'M']]) {
    const chosen = makeQr(s, { ecc });
    const scores = Array.from({ length: 8 }, (_, k) => penalty(makeQr(s, { ecc, mask: k }).rows()));
    assert.equal(chosen.mask, scores.indexOf(Math.min(...scores)), `${ecc} ${s.slice(0, 12)}: ${scores.join()}`);
  }
});

const HELLO_L = [
  '#######.#.###.#######', '#.....#...##..#.....#', '#.###.#.##.#..#.###.#', '#.###.#.##..#.#.###.#', '#.###.#.#..#..#.###.#', '#.....#..####.#.....#', '#######.#.#.#.#######',
  '...........##........', '####..#.######..###.#', '.#.###.#..######.##..', '####..#.#..#.#.#...##', '######.#...#...#.#.#.', '###...##.#..##....#.#', '........##.#..##..#.#',
  '#######...#######....', '#.....#......#.#.####', '#.###.#...#.#.#..#...', '#.###.#.#.#...#..###.', '#.###.#.###.#..#..#..', '#.....#.##.#.####...#', '#######.#..#.#.#.....',
];
const HELLO_M = [
  '#######.#...#.#######', '#.....#.#...#.#.....#', '#.###.#.......#.###.#', '#.###.#.#.#.#.#.###.#', '#.###.#..###..#.###.#', '#.....#...###.#.....#', '#######.#.#.#.#######',
  '........#####........', '#.##.###.#.##.#..#.##', '.##....#.#######.##..', '.....#####.#.#.#...##', '#.#.##.##..#...#.#.#.', '#...#.##.##.##....#.#', '........#.##..##..#.#',
  '#######.#.#######....', '#.....#.###..#.#.####', '#.###.#..#..#.#..#...', '#.###.#.###...#..###.', '#.###.#.##..#..#..#..', '#.....#..###.####...#', '#######.##.#.#.#.....',
];
const toRows = (a) => a.map((r) => r.replace(/#/g, '1').replace(/\./g, '0'));

test('эталонные матрицы: «HELLO WORLD» версии 1, уровни L и M (маска 3), побитно как у независимой реализации', () => {
  assert.deepEqual(makeQr('HELLO WORLD', { ecc: 'L', mask: 3 }).rows(), toRows(HELLO_L));
  assert.deepEqual(makeQr('HELLO WORLD', { ecc: 'M', mask: 3 }).rows(), toRows(HELLO_M));
  assert.equal(makeQr('HELLO WORLD', { ecc: 'L', mask: 3 }).version, 1);
});

test('эталонные хеши матриц (версии 1, 3, 5, 7, 11, 13, 20, 25) совпадают с независимой реализацией при той же маске', () => {
  const cases = [
    ['01234567', 'M', 6, 1, 'f5249d85'],
    ['Оливье — ½ ч. л. на 1,5 кг', 'M', 1, 3, 'ae602735'],
    ['x'.repeat(100), 'L', 0, 5, 'f13d504d'],
    ['abcdefg'.repeat(17), 'M', 2, 7, 'c890841b'],
    ['abcdefghij'.repeat(30), 'L', 2, 11, 'd2dc6707'],
    ['Список покупок'.repeat(12), 'M', 6, 13, '3615dff3'],
    ['Z9'.repeat(400), 'L', 3, 20, 'c748f77f'],
    ['Яблоко. '.repeat(85), 'L', 3, 25, '8c2951b0'],
  ];
  for (const [s, ecc, mask, version, hash] of cases) {
    const q = makeQr(s, { ecc, mask });
    assert.equal(q.version, version, s.slice(0, 10));
    assert.equal(fnv(q.rows()), hash, `${ecc}${version} ${s.slice(0, 10)}`);
  }
});

test('результат детерминирован: два вызова дают одну и ту же матрицу', () => {
  const s = 'Список покупок\nКартофель — 3 шт.';
  assert.deepEqual(makeQr(s).rows(), makeQr(s).rows());
});
