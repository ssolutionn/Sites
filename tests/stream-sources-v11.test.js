// 0.11, режим стримера: источники событий — подключение к чату Twitch без сети (поддельный сокет и таймеры),
// переподключение с нарастающей паузой, статусы, тестовый чат.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TwitchChatSource, TestChatSource, createSource, reconnectDelay, STATUS_TEXT, TWITCH_IRC } from '../src/stream-sources.js';
import { CAMPAIGN } from '../src/campaign/data.js';

// Поддельный сокет и таймеры: всё происходит только по команде теста.
function rig(opts = {}) {
  const sockets = [];
  const timers = [];
  class Fake {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.closed = false;
      sockets.push(this);
    }
    send(x) {
      this.sent.push(x);
    }
    close() {
      this.closed = true;
      this.onclose?.();
    }
  }
  const votes = [];
  const statuses = [];
  const src = new TwitchChatSource({
    channel: 'streamer',
    createSocket: (url) => new Fake(url),
    setTimer: (fn, ms) => {
      const t = { fn, ms, off: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => t && (t.off = true),
    rand: () => 0.5,
    onVote: (...a) => votes.push(a),
    onStatus: (s) => statuses.push(s),
    ...opts,
  });
  const live = () => timers.filter((t) => !t.off);
  // таймер повтора с пометкой: сработавший гасим, чтобы он не мешал искать следующий
  const retry = () => {
    const t = live().find((x) => x.ms < 100000);
    return t && { ms: t.ms, off: t.off, fn: () => { t.off = true; t.fn(); } };
  };
  return { src, sockets, timers, votes, statuses, live, retry, last: () => sockets.at(-1) };
}
const msg = (login, text, tags = 'display-name=' + login + ';user-id=1') => `@${tags} :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #streamer :${text}`;
const feed = (sock, ...lines) => sock.onmessage({ data: lines.join('\r\n') + '\r\n' });

test('подключение: анонимный вход только на чтение — теги, заглушка пароля, justinfan, JOIN в нижнем регистре', () => {
  const r = rig();
  r.src.connect();
  assert.equal(r.src.status, 'connecting');
  assert.equal(r.last().url, TWITCH_IRC);
  r.last().onopen();
  const [cap, pass, nick, join] = r.last().sent;
  assert.equal(cap, 'CAP REQ :twitch.tv/tags');
  assert.equal(pass, 'PASS SCHMOOPIIE');
  assert.match(nick, /^NICK justinfan\d{5}$/);
  assert.equal(join, 'JOIN #streamer');
  assert.equal(r.last().sent.length, 4, 'ничего лишнего: писать в чат нельзя');
  assert.doesNotMatch(r.last().sent.join('\n'), /PRIVMSG|oauth/i);
});

test('«в чате» наступает после своего JOIN или конца списка зрителей, не раньше', () => {
  const r = rig();
  r.src.connect();
  r.last().onopen();
  feed(r.last(), ':tmi.twitch.tv 001 x :Welcome, GLHF!');
  assert.equal(r.src.status, 'connecting');
  const me = r.last().sent[2].replace('NICK ', '');
  feed(r.last(), `:${me}!${me}@${me}.tmi.twitch.tv JOIN #streamer`);
  assert.equal(r.src.status, 'online');
  assert.deepEqual(r.statuses, ['connecting', 'online']);
  const r2 = rig();
  r2.src.connect();
  r2.last().onopen();
  feed(r2.last(), ':tmi.twitch.tv 366 x #streamer :End of /NAMES list');
  assert.equal(r2.src.status, 'online');
});

test('чужой JOIN (другой зритель) не считается нашим входом', () => {
  const r = rig();
  r.src.connect();
  r.last().onopen();
  feed(r.last(), ':somebody!somebody@somebody.tmi.twitch.tv JOIN #streamer');
  assert.equal(r.src.status, 'connecting');
});

test('PING → PONG с тем же остатком', () => {
  const r = rig();
  r.src.connect();
  r.last().onopen();
  feed(r.last(), 'PING :tmi.twitch.tv');
  assert.equal(r.last().sent.at(-1), 'PONG :tmi.twitch.tv');
});

test('пакет из нескольких сообщений: голоса по порядку, регистр и хвост команды, чужой канал и /me не считаются', () => {
  const r = rig();
  r.src.connect();
  r.last().onopen();
  feed(
    r.last(),
    msg('nick1', '!КОТ'),
    msg('nick2', '!Радио пожалуйста'),
    msg('nick3', 'просто болтаю'),
    msg('nick4', '\u0001ACTION !кот\u0001'),
    ':n5!n5@n5.tmi.twitch.tv PRIVMSG #other :!кот',
    'PING :tmi.twitch.tv',
    msg('nick6', '!помощь!!!', 'display-name=Нико\\sМаркс;user-id=77'),
  );
  assert.deepEqual(r.votes, [['id:1', '!кот', 'nick1'], ['id:1', '!радио', 'nick2'], ['id:77', '!помощь', 'Нико Маркс']]);
  assert.equal(r.last().sent.at(-1), 'PONG :tmi.twitch.tv');
});

test('обрыв связи: переподключение с нарастающей паузой 2, 4, 8, 16, 30, 30 с', () => {
  const r = rig();
  r.src.connect();
  const delays = [];
  for (let i = 0; i < 6; i++) {
    r.last().close(); // сервер оборвал
    assert.equal(r.src.status, 'offline');
    const t = r.retry();
    delays.push(t.ms / 1000);
    t.fn();
    assert.equal(r.src.status, 'connecting');
  }
  assert.deepEqual(delays, [2, 4, 8, 16, 30, 30]);
  assert.equal(r.sockets.length, 7);
});

test('удачное подключение сбрасывает счёт попыток: следующий обрыв снова ждёт 2 с', () => {
  const r = rig();
  r.src.connect();
  r.last().close();
  r.retry().fn();
  r.last().close();
  assert.equal(r.retry().ms / 1000, 4);
  r.retry().fn();
  r.last().onopen();
  feed(r.last(), ':tmi.twitch.tv 366 x #streamer :End');
  assert.equal(r.src.status, 'online');
  r.last().close();
  assert.equal(r.retry().ms / 1000, 2);
});

test('close() останавливает повторы и закрывает сокет; повторный close безопасен', () => {
  const r = rig();
  r.src.connect();
  r.last().close();
  const t = r.retry();
  r.src.close();
  assert.equal(r.live().length, 0, 'таймеры повтора и сторожа сняты');
  assert.equal(r.src.status, 'idle');
  r.src.close();
  assert.equal(r.sockets.length, 1, 'после close() новых соединений нет');
  assert.ok(t, 'повтор был назначен');
});

test('RECONNECT от Twitch: закрываем и подключаемся заново', () => {
  const r = rig();
  r.src.connect();
  r.last().onopen();
  feed(r.last(), ':tmi.twitch.tv RECONNECT');
  assert.equal(r.sockets[0].closed, true);
  assert.equal(r.src.status, 'offline');
  r.retry().fn();
  assert.equal(r.sockets.length, 2);
});

test('сокет не создаётся (исключение): «нет связи» и повтор, игра не падает', () => {
  let n = 0;
  const r = rig({
    createSocket: () => {
      n++;
      throw new Error('нет сети');
    },
  });
  r.src.connect();
  assert.equal(r.src.status, 'offline');
  assert.equal(n, 1);
  r.retry().fn();
  assert.equal(n, 2);
});

test('ошибка сокета — «нет связи»; старый сокет после переподключения не шлёт события', () => {
  const r = rig();
  r.src.connect();
  const old = r.last();
  old.onerror();
  assert.equal(r.src.status, 'offline');
  old.close();
  r.retry().fn();
  const before = r.votes.length;
  old.onmessage({ data: msg('ghost', '!кот') });
  assert.equal(r.votes.length, before, 'события старого сокета отброшены');
});

test('сторож тишины: долго ничего не слышно — соединение мёртвое, переподключаемся', () => {
  const r = rig();
  r.src.connect();
  r.last().onopen();
  const stale = r.live().find((t) => t.ms === 420000);
  assert.ok(stale, 'сторож заведён');
  stale.fn();
  assert.equal(r.src.status, 'offline');
  assert.equal(r.sockets[0].closed, true);
  r.retry().fn();
  assert.equal(r.sockets.length, 2);
});

test('пауза переподключения: формула и потолок из данных игры', () => {
  const rules = CAMPAIGN.stream.reconnect;
  const mid = () => 0.5;
  assert.equal(reconnectDelay(0, rules, mid), rules.base);
  assert.equal(reconnectDelay(1, rules, mid), rules.base * rules.factor);
  assert.equal(reconnectDelay(50, rules, mid), rules.max);
  assert.ok(reconnectDelay(3, rules, () => 0) < reconnectDelay(3, rules, () => 1), 'разброс');
});

test('тестовый чат: статус, команды распознаются как в настоящем', () => {
  const votes = [];
  const t = new TestChatSource({ onVote: (...a) => votes.push(a) });
  t.connect();
  assert.equal(t.status, 'test');
  assert.equal(t.say('u1', '!ГИРЛЯНДА'), true);
  assert.equal(t.say('u2', 'привет'), false);
  assert.deepEqual(votes, [['u1', '!гирлянда', 'u1']]);
  t.close();
  assert.equal(t.status, 'idle');
});

test('фабрика источников и подписи статусов', () => {
  assert.ok(createSource('test') instanceof TestChatSource);
  assert.ok(createSource('twitch', { channel: 'abc' }) instanceof TwitchChatSource);
  assert.throws(() => createSource('vk'), /Неизвестный источник/);
  assert.equal(STATUS_TEXT.connecting, 'подключаюсь…');
  assert.equal(STATUS_TEXT.online, 'в чате');
  assert.equal(STATUS_TEXT.offline, 'нет связи');
});
