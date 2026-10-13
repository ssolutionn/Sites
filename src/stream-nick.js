// Ник зрителя на экране игры. Чужой текст в игру не попадает никогда — только то, что прошло через sanitizeNick:
// короткое имя из букв (латиница, кириллица), цифр, подчёркивания и пробела. При малейшем сомнении — «Зритель».

/** Что показываем вместо сомнительного ника. */
export const FALLBACK_NICK = 'Зритель';

// Невидимое и управляющее: нулевая ширина, смена направления письма, теги U+E00xx, BOM, C0/C1.
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F​-‏‪-‮⁠-⁯﻿\u{E0000}-\u{E007F}]/gu;
// Разрешённые знаки — те, что есть в шрифте игры (Nunito: латиница с Latin-1 и кириллица).
const ALLOWED = /^[A-Za-z0-9_ À-ÖØ-öø-ÿА-яЁёІіЇїЄєҐґЎў]$/u;
const LETTER_OR_DIGIT = /[A-Za-z0-9À-ÖØ-öø-ÿА-яЁёІіЇїЄєҐґЎў]/u;

// Небольшой список основ, которые не должны появиться на экране у героини. Сверяется «скелет» ника:
// без пробелов, подчёркиваний и повторов, с заменой похожих знаков (xуй, sh1t, f_u_c_k).
const BLOCKED_CYR = ['хуй', 'хуе', 'хуя', 'пизд', 'пидор', 'пидар', 'педик', 'ебан', 'ебал', 'ебат', 'выеб', 'заеб', 'блят', 'бляд', 'сука', 'мудак', 'мудил', 'залуп', 'гондон', 'гандон', 'шлюх', 'дроч', 'говн', 'жопа', 'нацист', 'фашист', 'гитлер', 'порно', 'ниггер', 'негр', 'чурка', 'убей', 'суицид'];
const BLOCKED_LAT = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fagg', 'whore', 'slut', 'hitler', 'porn', 'suicide', 'cyka', 'blyat', 'pidor', 'pizd'];

const LAT_TO_CYR = { a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', k: 'к', m: 'м', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', '0': 'о', '3': 'з', '4': 'ч', '6': 'б' };
const CYR_TO_LAT = { а: 'a', в: 'b', с: 'c', е: 'e', ё: 'e', н: 'h', к: 'k', м: 'm', о: 'o', р: 'p', т: 't', х: 'x', у: 'y', и: 'i', й: 'i', з: '3' };
const DIGIT_TO_LAT = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };

// «Скелет» для сверки: строчные, без всего кроме букв и цифр, подряд идущие одинаковые знаки сжаты в один.
const squash = (s) => s.replace(/([\p{L}\p{N}])\1+/gu, '$1');
const bare = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function skeletons(s) {
  const base = bare(s);
  const cyr = [...base].map((c) => LAT_TO_CYR[c] ?? c).join('');
  const lat = [...base].map((c) => CYR_TO_LAT[c] ?? DIGIT_TO_LAT[c] ?? c).join('');
  return { cyr: [cyr, squash(cyr)], lat: [lat, squash(lat), squash(bare(s).replace(/[0-9]/g, (d) => DIGIT_TO_LAT[d] ?? d))] };
}

const BLOCK_CYR = BLOCKED_CYR.map((w) => [w, squash(w)]);
const BLOCK_LAT = BLOCKED_LAT.map((w) => [w, squash(w)]);

/** true, если в нике есть основа из списка недопустимых слов (в том числе с подменой букв и цифр). */
export function isBlockedNick(s) {
  const k = skeletons(String(s ?? ''));
  const hit = (variants, list) => variants.some((v) => list.some(([w, sw]) => v.includes(w) || v.includes(sw)));
  return hit(k.cyr, BLOCK_CYR) || hit(k.lat, BLOCK_LAT);
}

/**
 * Безопасный ник для экрана. Правила: нормализация (полноширинные буквы → обычные), без невидимых знаков, оставляем
 * латиницу, кириллицу, цифры, «_» и пробел; если пришлось выбросить больше 40 % знаков, ник похож на адрес, в нём меньше двух
 * букв или цифр либо есть недопустимое слово — «Зритель». Длина — не больше max знаков (по умолчанию 14).
 */
export function sanitizeNick(raw, max = 14) {
  if (raw == null) return FALLBACK_NICK;
  const src = String(raw).normalize('NFKC').replace(INVISIBLE, '');
  if (!src.trim() || /:\/\/|www\./i.test(src)) return FALLBACK_NICK;
  const all = [...src];
  const kept = all.filter((ch) => ALLOWED.test(ch));
  if (kept.length < all.length * 0.6) return FALLBACK_NICK;
  let s = kept.join('').replace(/ {2,}/g, ' ').trim();
  if ([...s].filter((ch) => LETTER_OR_DIGIT.test(ch)).length < 2 || isBlockedNick(s)) return FALLBACK_NICK;
  s = [...s].slice(0, Math.max(2, max)).join('').trim();
  if ([...s].filter((ch) => LETTER_OR_DIGIT.test(ch)).length < 2 || isBlockedNick(s)) return FALLBACK_NICK;
  return s;
}

/** Ник прошёл очистку по-настоящему, а не заменён на «Зритель». */
export function isRealNick(nick) {
  return nick !== FALLBACK_NICK;
}
