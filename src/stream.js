// Режим стрима: зрители голосуют командами в чате, победитель окна становится событием на кухне.
// Здесь только связка: источник событий (stream-sources.js) → круг голосования (campaign/stream-rules.js) → кухня.
// Подключение анонимное и только на чтение, токены не нужны и не хранятся. Без канала — тестовый чат на экране.
import { CAMPAIGN } from './campaign/data.js';
import { STREAM_COMMANDS } from './campaign/extras.js';
import { VoteRound } from './campaign/stream-rules.js';
import { createSource, STATUS_TEXT } from './stream-sources.js';
import { cleanChannel, parseVoteCommand } from './stream-parse.js';
import { sanitizeNick, isRealNick } from './stream-nick.js';

/**
 * Горячие клавиши режима стримера. src/keymap.js в этой ветке ещё нет, поэтому клавиша объявлена здесь:
 * при слиянии с раскладкой клавиш перенести в неё (main.js читает STREAM_KEYS.pauseChat).
 */
export const STREAM_KEYS = { pauseChat: 'KeyP' };

// Имена зрителей в тестовом чате: настоящие ники в нём не нужны, а на экране должны выглядеть как живые.
const TEST_NAMES = ['Нико', 'Мила', 'Артём', 'Зоя', 'Богдан', 'Ляля', 'Сава', 'Ника', 'Тимур', 'Лиса'];

export class StreamVotes {
  /**
   * channel — имя канала Twitch (очищается cleanChannel); test — тестовый чат; power — сила чата (soft | normal | chaos);
   * getState() — состояние кухни для canFire; fire(kind, info) → true, если кухня приняла событие.
   * createSource подменяется в тестах.
   */
  constructor({ channel = '', test = false, power, rules = CAMPAIGN.stream, getState = () => ({ live: false }), fire = () => false, makeSource = createSource } = {}) {
    this.rules = rules;
    this.channel = cleanChannel(channel);
    this.test = !!test || !this.channel;
    this.round = new VoteRound({ power, rules });
    this.getState = getState;
    this.fire = fire;
    this.activity = {}; // очищенный ник → принятые голоса (для гостей финального стола)
    this.testN = 0;
    this.source = makeSource(this.test ? 'test' : 'twitch', { channel: this.channel, onVote: (user, cmd, display) => this._onVote(user, cmd, display) });
    this.source.connect();
  }

  _onVote(user, cmd, display) {
    if (!this.round.vote(user, cmd)) return false;
    const nick = sanitizeNick(display);
    if (isRealNick(nick)) this.activity[nick] = (this.activity[nick] ?? 0) + 1;
    return true;
  }

  /** Голос из текста сообщения (тестовый чат, кнопки на экране). Один голос на user за окно. */
  vote(user, text, display = user) {
    const cmd = parseVoteCommand(text, STREAM_COMMANDS);
    return cmd ? this._onVote(user, cmd, display) : false;
  }

  /** Голос «нового зрителя» тестового чата: для кнопок «+» на экране. */
  testVote(cmd) {
    const n = this.testN++;
    return this.vote('test:' + n, cmd, TEST_NAMES[n % TEST_NAMES.length]);
  }

  /** Начало дня: чистое окно, без остатков прошлого. */
  begin() {
    this.round.paused = false;
    this.round.last = null;
    this.round.startWindow();
  }

  get paused() {
    return this.round.paused;
  }

  /** Пауза чата: окно и голоса стоят, события не выходят. */
  setPaused(on) {
    this.round.paused = !!on;
  }

  setPower(id) {
    this.round.setPower(id);
  }

  /** Шаг по кадру (секунды игрового времени). */
  update(dt) {
    for (const e of this.round.update(dt, this.getState)) {
      if (e.type !== 'fire') continue;
      const ok = !!this.fire(e.kind, e);
      this.round.settle(ok, e.line);
    }
  }

  /** Накопленная активность зрителей { ник: голоса }; счётчик обнуляется. */
  takeActivity() {
    const a = this.activity;
    this.activity = {};
    return a;
  }

  /** Снимок для интерфейса и оверлея. Ников и чужого текста в нём нет. */
  view() {
    const v = this.round.view();
    const status = this.source.status;
    return { ...v, test: this.test, channel: this.test ? '' : this.channel, status, statusText: STATUS_TEXT[status] ?? '' };
  }

  close() {
    this.source.close();
  }
}

// Испытание дня: одинаковое для всех в эту дату.
export function dailyChallenge(date = new Date(), unlockedMax = 6) {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const mods = ['hungryCat', 'oneBurner', 'tightBudget', 'rush', 'noExpress'];
  const a = h % mods.length;
  const b = (a + 1 + ((h >>> 8) % (mods.length - 1))) % mods.length;
  return { key, seed: h, dayIndex: (h >>> 16) % (unlockedMax + 1), mods: [mods[a], mods[b]], label: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) };
}
