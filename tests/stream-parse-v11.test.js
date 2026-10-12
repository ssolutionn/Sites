// 0.11, режим стримера: разбор чата Twitch без сети — строки с тегами, пакеты из нескольких сообщений, команды, имя канала.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, parsePacket, parseTags, classify, readPacket, normalizeCommand, parseVoteCommand, cleanChannel, anonNick } from '../src/stream-parse.js';
import { STREAM_COMMANDS } from '../src/campaign/extras.js';

const TAGS = '@badge-info=;badges=;color=#FF0000;display-name=Нико\\sМаркс;emotes=;id=abc;mod=0;room-id=1;tmi-sent-ts=1;user-id=4242';
const msg = (text, extra = TAGS) => `${extra} :niko!niko@niko.tmi.twitch.tv PRIVMSG #streamer :${text}`;

test('PING → ping с остатком для PONG', () => {
  assert.deepEqual(classify(parseLine('PING :tmi.twitch.tv')), { type: 'ping', payload: 'tmi.twitch.tv' });
  assert.deepEqual(classify(parseLine('PING')), { type: 'ping', payload: 'tmi.twitch.tv' });
});

test('теги: display-name с пробелом (\\s), экранирование ; и \\', () => {
  const t = parseTags('display-name=Нико\\sМаркс;x=a\\:b\\\\c;empty=;flag');
  assert.equal(t['display-name'], 'Нико Маркс');
  assert.equal(t.x, 'a;b\\c');
  assert.equal(t.empty, '');
  assert.equal(t.flag, '');
});

test('PRIVMSG с тегами: ник, display-name, канал, текст с двоеточиями и пробелами', () => {
  const e = classify(parseLine(msg('!кот: вот это да :)')));
  assert.equal(e.type, 'message');
  assert.equal(e.login, 'niko');
  assert.equal(e.display, 'Нико Маркс');
  assert.equal(e.channel, 'streamer');
  assert.equal(e.text, '!кот: вот это да :)');
  assert.equal(e.voter, 'id:4242');
  assert.equal(e.action, false);
});

test('PRIVMSG без тегов: голос по логину', () => {
  const e = classify(parseLine(':Vasya!vasya@vasya.tmi.twitch.tv PRIVMSG #Streamer :!гость'));
  assert.equal(e.login, 'vasya');
  assert.equal(e.display, 'vasya');
  assert.equal(e.voter, 'login:vasya');
  assert.equal(e.text, '!гость');
});

test('несколько сообщений в одном пакете: порядок сохраняется, CRLF и пустые строки не мешают', () => {
  const pack = [':tmi.twitch.tv 001 justinfan1 :Welcome, GLHF!', 'PING :tmi.twitch.tv', msg('!радио'), '', msg('привет', '@user-id=7'), ':justinfan1!justinfan1@justinfan1.tmi.twitch.tv JOIN #streamer', ':tmi.twitch.tv 366 justinfan1 #streamer :End of /NAMES list', ''].join('\r\n');
  const ev = readPacket(pack);
  assert.deepEqual(ev.map((e) => e.type), ['welcome', 'ping', 'message', 'message', 'join', 'names']);
  assert.equal(ev[2].text, '!радио');
  assert.equal(ev[3].voter, 'id:7');
  assert.equal(ev[4].login, 'justinfan1');
  assert.equal(parsePacket(pack).length, 6);
});

test('мусор не роняет разбор: пустая строка, только теги, огромная строка, префикс без команды', () => {
  assert.equal(parseLine(''), null);
  assert.equal(parseLine('@a=b'), null);
  assert.equal(parseLine(':prefix'), null);
  assert.equal(parseLine('x'.repeat(10000)), null);
  assert.deepEqual(classify(null), { type: 'other' });
  assert.deepEqual(readPacket(undefined), []);
  assert.equal(classify(parseLine(':tmi.twitch.tv PRIVMSG #x :без логина')).type, 'other');
});

test('/me и RECONNECT: действие — не команда, RECONNECT отдельным событием', () => {
  const act = classify(parseLine(msg('\u0001ACTION !кот\u0001')));
  assert.equal(act.action, true);
  assert.equal(act.text, '');
  assert.equal(classify(parseLine(':tmi.twitch.tv RECONNECT')).type, 'reconnect');
  assert.equal(classify(parseLine(':tmi.twitch.tv NOTICE * :Login unsuccessful')).text, 'Login unsuccessful');
});

test('команды по-русски: регистр, хвост, знаки в конце, ответ с @упоминанием', () => {
  assert.equal(normalizeCommand('!кот'), '!кот');
  assert.equal(normalizeCommand('!КОТ'), '!кот');
  assert.equal(normalizeCommand('!Кот пожалуйста, очень надо'), '!кот');
  assert.equal(normalizeCommand('   !Гирлянда   '), '!гирлянда');
  assert.equal(normalizeCommand('!радио!!!'), '!радио');
  assert.equal(normalizeCommand('!ПоМоЩь)'), '!помощь');
  assert.equal(normalizeCommand('@streamer !гость'), '!гость');
  assert.equal(normalizeCommand('!кот\u{E0000}'), '!кот', 'невидимый хвост 7TV');
  assert.equal(normalizeCommand('!к​от'), '!кот', 'нулевая ширина внутри');
});

test('не команды: без «!», «!» не первым словом, пустое, одни знаки', () => {
  for (const t of ['кот', 'вот !кот', '!', '!!!', '', null, undefined, 'мяу!кот', '/кот', '! кот']) assert.equal(normalizeCommand(t), '', String(t));
});

test('parseVoteCommand: только команды из таблицы игры, чужие и прототипные имена — нет', () => {
  for (const cmd of Object.keys(STREAM_COMMANDS)) assert.equal(parseVoteCommand(`${cmd.toUpperCase()} хвост`, STREAM_COMMANDS), cmd);
  assert.equal(parseVoteCommand('!неизвестная', STREAM_COMMANDS), null);
  assert.equal(parseVoteCommand('!constructor', STREAM_COMMANDS), null);
  assert.equal(parseVoteCommand('!__proto__', STREAM_COMMANDS), null);
  assert.equal(parseVoteCommand('привет всем', STREAM_COMMANDS), null);
});

test('имя канала: регистр, «#», ссылка, длина 3–25, только [a-z0-9_]', () => {
  assert.equal(cleanChannel('#SomeStreamer'), 'somestreamer');
  assert.equal(cleanChannel('  Some_Streamer1  '), 'some_streamer1');
  assert.equal(cleanChannel('https://www.twitch.tv/SomeStreamer?sr=a'), 'somestreamer');
  assert.equal(cleanChannel('twitch.tv/abc/videos'), 'abc');
  assert.equal(cleanChannel('ab'), '');
  assert.equal(cleanChannel('a'.repeat(26)), '');
  assert.equal(cleanChannel('a'.repeat(25)), 'a'.repeat(25));
  assert.equal(cleanChannel('стример'), '');
  assert.equal(cleanChannel('имя канала'), '');
  assert.equal(cleanChannel('bad-name'), '');
  assert.equal(cleanChannel('chan\r\nJOIN #other'), 'chan', 'перевод строки не уходит в IRC');
  assert.equal(cleanChannel(null), '');
  assert.equal(cleanChannel('##'), '');
});

test('анонимный ник — justinfan и пять цифр', () => {
  assert.match(anonNick(() => 0), /^justinfan10000$/);
  assert.match(anonNick(() => 0.999999), /^justinfan\d{5}$/);
});
