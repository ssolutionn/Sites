// 0.11, режим стримера: ник зрителя на экране — только очищенный; чужой текст не доходит до игры.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeNick, isBlockedNick, FALLBACK_NICK } from '../src/stream-nick.js';

test('обычные ники проходят как есть', () => {
  for (const n of ['Nico_77', 'Нико', 'Ёлочка', 'Кот Матроскин', 'ab', 'Anna2000', 'Максим_К', 'Kolya_Xx']) assert.equal(sanitizeNick(n), n);
});

test('длина не больше 14 знаков (по знакам, а не по кускам юникода)', () => {
  assert.equal(sanitizeNick('Very_Long_Nickname_Here'), 'Very_Long_Nick');
  assert.equal([...sanitizeNick('Очень_длинный_ник_зрителя')].length <= 14, true);
  assert.equal(sanitizeNick('abcdefghijklmnopqrstuvwxyz', 6), 'abcdef');
  assert.equal(sanitizeNick('Привет_привет__ы'), 'Привет_привет_');
});

test('пробелы схлопываются и обрезаются', () => {
  assert.equal(sanitizeNick('   Нико     Маркс  '), 'Нико Маркс');
});

test('невидимое и управляющее выбрасывается', () => {
  assert.equal(sanitizeNick('Ни​ко'), 'Нико');
  assert.equal(sanitizeNick('‮gnirts'), 'gnirts');
  assert.equal(sanitizeNick('Нико\u{E0000}'), 'Нико');
  assert.equal(sanitizeNick('Ни\u0000ко\n'), 'Нико');
});

test('полноширинные и «математические» буквы становятся обычными', () => {
  assert.equal(sanitizeNick('Ｎｉｃｏ'), 'Nico');
  assert.equal(sanitizeNick('𝓝𝓲𝓬𝓸'), 'Nico');
});

test('эмодзи и значки отбрасываются, но не больше 40 % ника', () => {
  assert.equal(sanitizeNick('Нико😀'), 'Нико');
  assert.equal(sanitizeNick('★Нико★'), 'Нико');
  assert.equal(sanitizeNick('😀😀😀'), FALLBACK_NICK);
  assert.equal(sanitizeNick('Ни😀😀😀😀'), FALLBACK_NICK);
});

test('сомнительное → «Зритель»: пусто, одна буква, чужие письменности, адреса', () => {
  for (const n of [null, undefined, '', '   ', 'a', '_', '日本語名前', 'ユーザー', 'user://x', 'www.spam.ru', 'http://x.y']) assert.equal(sanitizeNick(n), FALLBACK_NICK, String(n));
});

test('разметка и скрипты безвредны: знаки <>"\'& не доживают до интерфейса', () => {
  const n = sanitizeNick('<img src=x onerror=alert(1)>');
  assert.match(n, /^[\p{L}\p{N}_ ]+$/u);
  assert.equal(n.includes('<'), false);
  assert.equal(sanitizeNick('"><svg/onload=1>').includes('>'), false);
});

test('недопустимые слова: прямые, с повторами, подменой букв и цифр, разделителями', () => {
  for (const n of ['Хуйло', 'xуй123', 'ПИЗДЕЦ', 'sh1t', 'f_u_c_k', 'fuuuck', 'Сука', 'нацист88', 'H1tler', 'пид0р', 'б л я д ь', 'bl9at'.replace('9', 'y')]) assert.equal(sanitizeNick(n), FALLBACK_NICK, n);
  assert.equal(isBlockedNick('Хорошее имя'), false);
});

test('обычные имена не режутся зря', () => {
  for (const n of ['Huy', 'Grapes', 'Hancock', 'Nazir', 'Fukushima', 'Хулиган', 'Мандарин', 'Аксёнов', 'Алексей', 'Scooter']) assert.equal(sanitizeNick(n), n, n);
});

test('основа, оказавшаяся за границей длины, не прячет слово: проверяется весь ник', () => {
  assert.equal(sanitizeNick('Aaaaaaaaaaafuck_'), FALLBACK_NICK);
  assert.equal(sanitizeNick('Привет_привет_хуй'), FALLBACK_NICK);
});
