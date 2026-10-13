// Разбор чата Twitch (IRC поверх WebSocket) без сети и DOM: строки, теги, команды зрителей, имя канала.
// Чистые функции — проверяются в node:test. Всё, что пришло из чата, считается недоверенным текстом:
// наружу отсюда выходят только разобранные поля, а в игру попадает лишь распознанная команда (и очищенный ник —
// это уже src/stream-nick.js).

/** Строки длиннее этого не разбираем: настоящие сообщения Twitch (с тегами) заметно короче. */
export const MAX_LINE = 8192;

// Невидимые знаки, которыми клиенты чата «обходят» повтор сообщения: теги U+E0000…, нулевая ширина, BOM, направление письма.
const INVISIBLE = /[​-‏‪-‮⁠-⁯﻿\u{E0000}-\u{E007F}]/gu;

const TAG_ESC = { ':': ';', s: ' ', r: '\r', n: '\n', '\\': '\\' };

/** Теги IRCv3: `a=1;b=x\sy` → { a: '1', b: 'x y' }. Значения раскрываются по правилам escape из спецификации. */
export function parseTags(raw) {
  const out = {};
  for (const part of String(raw ?? '').split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = eq < 0 ? part : part.slice(0, eq);
    if (!key) continue;
    const val = eq < 0 ? '' : part.slice(eq + 1);
    out[key] = val.replace(/\\(.?)/gs, (_, c) => TAG_ESC[c] ?? c);
  }
  return out;
}

/**
 * Одна строка IRC → { tags, prefix, login, command, params } или null (пусто, слишком длинно, битый формат).
 * Формат: `[@теги ][:префикс ]КОМАНДА параметры [:остаток]`; остаток после « :» — один параметр с пробелами.
 */
export function parseLine(raw) {
  let s = String(raw ?? '').replace(/[\r\n]+$/, '');
  if (!s || s.length > MAX_LINE) return null;
  let tags = {};
  if (s[0] === '@') {
    const sp = s.indexOf(' ');
    if (sp < 0) return null;
    tags = parseTags(s.slice(1, sp));
    s = s.slice(sp + 1).replace(/^ +/, '');
  }
  let prefix = null;
  if (s[0] === ':') {
    const sp = s.indexOf(' ');
    if (sp < 0) return null;
    prefix = s.slice(1, sp);
    s = s.slice(sp + 1).replace(/^ +/, '');
  }
  if (!s) return null;
  const sp = s.indexOf(' ');
  const command = (sp < 0 ? s : s.slice(0, sp)).toUpperCase();
  let rest = sp < 0 ? '' : s.slice(sp + 1);
  const params = [];
  while (rest) {
    if (rest[0] === ':') {
      params.push(rest.slice(1));
      break;
    }
    const i = rest.indexOf(' ');
    if (i < 0) {
      params.push(rest);
      break;
    }
    params.push(rest.slice(0, i));
    rest = rest.slice(i + 1).replace(/^ +/, '');
  }
  const bang = prefix ? prefix.indexOf('!') : -1;
  return { tags, prefix, login: bang > 0 ? prefix.slice(0, bang).toLowerCase() : null, command, params };
}

/** Пакет WebSocket (несколько строк через CRLF) → разобранные строки по порядку. Битые строки пропускаются. */
export function parsePacket(data) {
  return String(data ?? '')
    .split(/\r?\n/)
    .map(parseLine)
    .filter(Boolean);
}

/**
 * Что значит строка для игры. Типы: ping { payload }, message { channel, login, voter, display, text, action },
 * join { login, channel }, welcome, names (конец списка зрителей — мы в комнате), reconnect, notice { text }, other.
 * voter — устойчивый ключ «один голос на зрителя»: числовой user-id из тегов, а без него логин (ник можно сменить, id — нет).
 */
export function classify(line) {
  if (!line) return { type: 'other' };
  switch (line.command) {
    case 'PING':
      return { type: 'ping', payload: line.params[0] ?? 'tmi.twitch.tv' };
    case 'PRIVMSG': {
      const channel = String(line.params[0] ?? '').replace(/^#/, '').toLowerCase();
      let text = line.params[1] ?? '';
      const action = /^\u0001ACTION[ \u0001]/.test(text); // «/me …» — не команда
      if (action) text = '';
      const login = line.login;
      if (!login) return { type: 'other' };
      const uid = line.tags['user-id'];
      return { type: 'message', channel, login, voter: uid && /^\d+$/.test(uid) ? `id:${uid}` : `login:${login}`, display: line.tags['display-name'] || login, text, action };
    }
    case 'JOIN':
      return { type: 'join', login: line.login, channel: String(line.params[0] ?? '').replace(/^#/, '').toLowerCase() };
    case '001':
      return { type: 'welcome' };
    case '366':
      return { type: 'names' };
    case 'RECONNECT':
      return { type: 'reconnect' };
    case 'NOTICE':
      return { type: 'notice', text: line.params[1] ?? '' };
    default:
      return { type: 'other' };
  }
}

/** Пакет → события для игры (порядок сохраняется). */
export function readPacket(data) {
  return parsePacket(data).map(classify);
}

/**
 * Команда зрителя из текста сообщения: первое слово, строчными, без хвоста и знаков в конце. `!КОТ`, `!Кот пожалуйста`,
 * `!кот!!!`, `@стример !кот` → '!кот'. Не команда (нет «!» в начале слова или нет букв) → ''.
 */
export function normalizeCommand(text) {
  const words = String(text ?? '')
    .normalize('NFC')
    .replace(INVISIBLE, '')
    .trim()
    .split(/\s+/);
  while (words.length && words[0].startsWith('@')) words.shift(); // ответ в ветке Twitch начинается с @упоминания
  const w = (words[0] ?? '').toLowerCase().replace(/[.,!?…;:)\]»"'~*]+$/u, '');
  return /^![\p{L}\p{N}_]+$/u.test(w) ? w : '';
}

/** Команда из чата, если она есть в таблице known (объект с ключами-командами); иначе null. */
export function parseVoteCommand(text, known) {
  const cmd = normalizeCommand(text);
  return cmd && Object.hasOwn(known, cmd) ? cmd : null;
}

/**
 * Имя канала Twitch для JOIN: строчные, без «#» и без адреса (можно вставить ссылку), только [a-z0-9_] длиной 3–25.
 * Не подошло — пустая строка (канал не задан).
 */
export function cleanChannel(input) {
  let s = String(input ?? '').trim().toLowerCase().replace(/^#+/, '');
  s = s.replace(/^https?:\/\//, '').replace(/^(?:www\.|m\.)?twitch\.tv\//, '');
  s = s.split(/[/?#\s]/)[0];
  return /^[a-z0-9_]{3,25}$/.test(s) ? s : '';
}

/** Анонимный ник для чтения чата: justinfan + пять цифр. rand — функция 0…1 (в тестах подменяется). */
export function anonNick(rand = Math.random) {
  return `justinfan${10000 + Math.floor(rand() * 80000)}`;
}
