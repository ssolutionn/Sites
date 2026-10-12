// Источники событий режима стримера за одним интерфейсом StreamSource. Сейчас два:
//   twitch — анонимное чтение чата Twitch (IRC через WebSocket, без токенов и входа);
//   test   — тестовый чат без сети: голоса вносят кнопками на экране.
// Другие площадки и платформы (баллы канала, донаты, VK, YouTube) подключаются так же: класс-наследник StreamSource,
// который вызывает onVote(user, command, display) и onStatus(status), + строка в SOURCES. Игра о них ничего не знает.
import { CAMPAIGN } from './campaign/data.js';
import { STREAM_COMMANDS } from './campaign/extras.js';
import { readPacket, parseVoteCommand, anonNick } from './stream-parse.js';

export const TWITCH_IRC = 'wss://irc-ws.chat.twitch.tv:443';

/** Состояния источника → слова в интерфейсе голосования. */
export const STATUS_TEXT = { idle: '', connecting: 'подключаюсь…', online: 'в чате', offline: 'нет связи', test: 'тестовый чат' };

/**
 * Пауза перед попыткой номер attempt (с 0): base · factor^attempt, не больше max; jitter 0…1 даёт разброс ±15 %,
 * чтобы тысячи клиентов не стучались одновременно (rand = () => 0.5 — без разброса).
 */
export function reconnectDelay(attempt, rules = CAMPAIGN.stream.reconnect, rand = Math.random) {
  const raw = Math.min(rules.max, rules.base * rules.factor ** Math.max(0, attempt));
  return raw * (0.85 + 0.3 * rand());
}

/**
 * Базовый источник. Наследник вызывает this._status(...) и this.onVote(user, command, display).
 * user — устойчивый ключ зрителя («один голос на ник»), command — команда из таблицы игры, display — имя для показа
 * (до очистки sanitizeNick; на экран оно не попадает без неё).
 */
export class StreamSource {
  constructor({ onVote = () => {}, onStatus = () => {} } = {}) {
    this.onVote = onVote;
    this.onStatus = onStatus;
    this.status = 'idle';
  }
  /** Начать работу (подключиться). */
  connect() {}
  /** Закончить работу и освободить ресурсы. Повторный вызов безопасен. */
  close() {}
  _status(s) {
    if (s === this.status) return;
    this.status = s;
    this.onStatus(s);
  }
}

/** Тестовый чат: сети нет, голоса вносят вручную через say(). */
export class TestChatSource extends StreamSource {
  constructor(opts = {}) {
    super(opts);
    this.known = opts.known ?? STREAM_COMMANDS;
  }
  connect() {
    this._status('test');
  }
  close() {
    this._status('idle');
  }
  /** Сообщение «из чата»: распознаётся так же, как настоящее. */
  say(user, text, display = user) {
    const cmd = parseVoteCommand(text, this.known);
    if (cmd) this.onVote(user, cmd, display);
    return !!cmd;
  }
}

/** Анонимное чтение чата Twitch. Все зависимости подменяются — сеть и таймеры в тестах не нужны. */
export class TwitchChatSource extends StreamSource {
  constructor({ channel, createSocket = (url) => new WebSocket(url), setTimer = setTimeout, clearTimer = clearTimeout, rand = Math.random, rules = CAMPAIGN.stream.reconnect, known = STREAM_COMMANDS, staleAfter = 420, ...opts } = {}) {
    super(opts);
    this.channel = channel;
    this.createSocket = createSocket;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.rand = rand;
    this.rules = rules;
    this.known = known;
    this.staleAfter = staleAfter; // секунд тишины, после которых соединение считается мёртвым (Twitch шлёт PING раз в пять минут)
    this.ws = null;
    this.nick = '';
    this.attempt = 0;
    this.closed = true;
    this.retryTimer = null;
    this.staleTimer = null;
  }

  connect() {
    if (!this.closed) return;
    this.closed = false;
    this.attempt = 0;
    this._open();
  }

  _open() {
    this._status('connecting');
    let ws;
    try {
      ws = this.createSocket(TWITCH_IRC);
    } catch {
      this._lost();
      return;
    }
    this.ws = ws;
    this.nick = anonNick(this.rand);
    ws.onopen = () => {
      if (this.ws !== ws) return;
      // только чтение: анонимный вход justinfan, пароль-заглушка, теги нужны ради user-id и display-name
      ws.send('CAP REQ :twitch.tv/tags');
      ws.send('PASS SCHMOOPIIE');
      ws.send(`NICK ${this.nick}`);
      ws.send(`JOIN #${this.channel}`);
      this._watch();
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      this._watch();
      for (const e of readPacket(ev.data)) this._handle(ws, e);
    };
    ws.onerror = () => {
      if (this.ws === ws) this._status('offline');
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (!this.closed) this._lost();
    };
  }

  _handle(ws, e) {
    switch (e.type) {
      case 'ping':
        ws.send(`PONG :${e.payload}`);
        break;
      case 'join':
        if (e.login === this.nick) this._joined();
        break;
      case 'names':
        this._joined();
        break;
      case 'reconnect':
        try {
          ws.close();
        } catch {
          /* уже закрыт */
        }
        break;
      case 'message': {
        if (e.action || e.channel !== this.channel) return;
        const cmd = parseVoteCommand(e.text, this.known);
        if (cmd) this.onVote(e.voter, cmd, e.display);
        break;
      }
      default:
    }
  }

  _joined() {
    this.attempt = 0;
    this._status('online');
  }

  // Связь потеряна или не получилась: ждём всё дольше (2, 4, 8… до max секунд) и пробуем снова, пока не закрыли.
  _lost() {
    this._status('offline');
    this.clearTimer(this.staleTimer);
    this.staleTimer = null;
    if (this.closed) return;
    const ms = reconnectDelay(this.attempt++, this.rules, this.rand) * 1000;
    this.clearTimer(this.retryTimer);
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      if (!this.closed) this._open();
    }, ms);
  }

  // Сторож тишины: Twitch регулярно шлёт PING; если не слышно ничего долго — соединение мёртвое, переподключаемся.
  _watch() {
    this.clearTimer(this.staleTimer);
    this.staleTimer = this.setTimer(() => {
      this.staleTimer = null;
      const ws = this.ws;
      this.ws = null;
      try {
        ws?.close();
      } catch {
        /* уже закрыт */
      }
      if (!this.closed) this._lost();
    }, this.staleAfter * 1000);
  }

  close() {
    this.closed = true;
    this.clearTimer(this.retryTimer);
    this.clearTimer(this.staleTimer);
    this.retryTimer = this.staleTimer = null;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      /* уже закрыт */
    }
    this._status('idle');
  }
}

/** Фабрика источников: kind → класс. Новый источник добавляется сюда одной строкой. */
export const SOURCES = { twitch: TwitchChatSource, test: TestChatSource };

export function createSource(kind, opts) {
  const Source = SOURCES[kind];
  if (!Source) throw new Error(`Неизвестный источник событий: ${kind}`);
  return new Source(opts);
}
