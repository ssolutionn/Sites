// Режим стрима: голосование зрителей командами в чате Twitch.
// Подключение анонимное и только на чтение (IRC через WebSocket). Без канала — тестовый чат на экране.
import { STREAM_COMMANDS } from './campaign/extras.js';

const WINDOW = 45; // секунд на одно голосование

export class StreamVotes {
  constructor({ channel = '', test = false, onWinner }) {
    this.channel = channel.trim().toLowerCase().replace(/^#/, '');
    this.test = test || !this.channel;
    this.onWinner = onWinner;
    this.left = WINDOW;
    this.counts = {};
    this.voters = new Set();
    this.status = this.test ? 'тестовый чат' : 'подключение…';
    this.ws = null;
    if (!this.test) this._connect();
  }

  _connect() {
    try {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      this.ws = ws;
      ws.onopen = () => {
        ws.send('CAP REQ :twitch.tv/tags');
        ws.send('PASS SCHMOOPIIE');
        ws.send(`NICK justinfan${10000 + Math.floor(Math.random() * 80000)}`);
        ws.send(`JOIN #${this.channel}`);
        this.status = `#${this.channel}`;
      };
      ws.onmessage = (ev) => {
        for (const line of String(ev.data).split('\r\n')) {
          if (line.startsWith('PING')) ws.send('PONG :tmi.twitch.tv');
          const m = line.match(/:([^!\s]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
          if (m) this.vote(m[1], m[2]);
        }
      };
      ws.onerror = () => (this.status = 'нет связи с чатом');
      ws.onclose = () => {
        if (this.ws === ws) this.status = 'чат отключён';
      };
    } catch {
      this.status = 'нет связи с чатом';
    }
  }

  // Один голос от зрителя за окно; команда — первое слово сообщения.
  vote(user, text) {
    const cmd = String(text).trim().split(/\s+/)[0].toLowerCase();
    if (!STREAM_COMMANDS[cmd]) return false;
    if (this.voters.has(user)) return false;
    this.voters.add(user);
    this.counts[cmd] = (this.counts[cmd] ?? 0) + 1;
    return true;
  }

  update(dt) {
    this.left -= dt;
    if (this.left > 0) return;
    const best = Object.entries(this.counts).sort((a, b) => b[1] - a[1])[0];
    if (best) this.onWinner?.(STREAM_COMMANDS[best[0]].kind, best[0]);
    this.left = WINDOW;
    this.counts = {};
    this.voters = new Set();
  }

  view() {
    const options = Object.keys(STREAM_COMMANDS).map((cmd) => ({ cmd, n: this.counts[cmd] ?? 0 }));
    return { options, total: options.reduce((a, o) => a + o.n, 0), left: this.left, test: this.test, status: this.status };
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* уже закрыт */
    }
    this.ws = null;
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
