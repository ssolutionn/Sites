// Правила режима стримера без DOM, сети и Three.js: настройки игрока, «сила чата», круг голосования, когда событие
// можно выпускать на кухню (canFire), самые активные зрители. Все числа — в CAMPAIGN.stream (data.js).
import { CAMPAIGN } from './data.js';
import { STREAM_COMMANDS } from './extras.js';
import { pluralRu } from './words.js';

/** Углы под веб-камеру: код → подпись в настройках. */
export const CAM_CORNERS = { none: 'Нет', tl: 'Слева сверху', tr: 'Справа сверху', bl: 'Слева снизу', br: 'Справа снизу' };

// ---------- настройки игрока ----------

/**
 * Настройки режима из сохранения → полный объект с умолчаниями. Лишнее и неверное отбрасывается:
 * сила чата — одна из трёх ступеней, угол — один из пяти, порт — число 1024–65535, канал — строка до 80 знаков.
 */
export function streamSettings(raw, rules = CAMPAIGN.stream) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const port = Math.round(Number(r.overlayPort));
  return {
    on: !!r.on && rules.enabled !== false,
    channel: typeof r.channel === 'string' ? r.channel.slice(0, 80) : '',
    test: !!r.test,
    power: Object.hasOwn(rules.powers, r.power) ? r.power : rules.power,
    nicks: r.nicks !== false,
    cam: Object.hasOwn(CAM_CORNERS, r.cam) ? r.cam : 'none',
    overlay: r.overlay !== false,
    overlayPort: Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : rules.overlayPort,
  };
}

/** Ступень «силы чата» с id: { id, label, note, window, cooldown, harmWeight }. Неизвестная → ступень по умолчанию. */
export function resolvePower(id, rules = CAMPAIGN.stream) {
  const key = Object.hasOwn(rules.powers, id) ? id : rules.power;
  return { id: key, ...rules.powers[key] };
}

// ---------- когда можно выпускать событие ----------

/** Почему событие ждёт: код → короткая фраза для строки голосования. */
export const WHY_TEXT = {
  off: 'режим не работает',
  early: 'день только начался',
  ending: 'день подходит к концу',
  gesture: 'руки заняты',
  lesson: 'идёт урок',
  book: 'открыта книга',
  typing: 'ты пишешь в телефоне',
};

/**
 * Оценка секунд до конца дня по темпу: сколько шагов осталось × средняя длина шага. Мало данных → null (неизвестно).
 * done и total — шаги блюд (на последнем дне ещё и места на столе), t — секунды дня, phase — фаза сессии.
 */
export function estimateRemaining({ t, done, total, phase }) {
  if (phase !== 'kitchen') return 0;
  if (!total) return null;
  if (done >= total) return 0;
  if (done < 2 || t < 30) return null;
  return ((total - done) * t) / done;
}

/**
 * Можно ли сейчас выпустить событие чата. state:
 *  live — идёт день кампании с чатом; phase — фаза сессии; t — секунды дня; remaining — оценка секунд до конца (или null);
 *  gesture — нож или другой жест в процессе (кнопка зажата, действие идёт, подарок в руках);
 *  lesson — на экране заметка из книги; book — открыта книга рецептов; typing — игрок вводит текст в телефоне;
 *  paused — стример поставил чат на паузу.
 * Возвращает { ok, why }: why — код из WHY_TEXT. Порядок проверок = приоритет причины.
 */
export function canFire(state, rules = CAMPAIGN.stream) {
  if (!state?.live || state.paused) return { ok: false, why: 'off' };
  if (state.phase !== 'kitchen') return { ok: false, why: 'ending' };
  if (state.t < rules.startQuiet) return { ok: false, why: 'early' };
  if (state.remaining != null && state.remaining <= rules.endQuiet) return { ok: false, why: 'ending' };
  if (state.gesture) return { ok: false, why: 'gesture' };
  if (state.lesson) return { ok: false, why: 'lesson' };
  if (state.book) return { ok: false, why: 'book' };
  if (state.typing) return { ok: false, why: 'typing' };
  return { ok: true, why: null };
}

// ---------- голосование ----------

/** «Победило !кот — 7 из 12 голосов». Без ников. note — необязательная вставка (например, про силу чата). */
export function winnerLine(cmd, n, total, note = '') {
  return `Победило ${cmd} — ${n} из ${total} ${pluralRu(total, ['голоса', 'голосов', 'голосов'])}${note ? ' · ' + note : ''}`;
}

/**
 * Круг голосования. Фазы: voting (идёт окно, голоса считаются) → pending (победитель ждёт спокойного момента) →
 * cooldown (пауза после события) → снова voting. За окно — не больше одного события. update() возвращает массив
 * событий круга: winner, fire (выпускать!), drop (не дождался), quiet (в окне никто не голосовал). Результат выпуска
 * сообщают через settle(ok).
 */
export class VoteRound {
  constructor({ power = CAMPAIGN.stream.power, rules = CAMPAIGN.stream, commands = STREAM_COMMANDS } = {}) {
    this.rules = rules;
    this.commands = commands;
    this.power = resolvePower(power, rules);
    this.paused = false;
    this.last = null; // { text, kind: 'win' | 'wait' | 'drop' | 'refused', ttl }
    this.startWindow();
  }

  /** Сменить силу чата: действует со следующего окна (текущее не режем на лету). */
  setPower(id) {
    this.power = resolvePower(id, this.rules);
  }

  startWindow() {
    this.phase = 'voting';
    this.window = this.power.window;
    this.left = this.window;
    this.counts = {};
    this.voters = new Set();
    this.order = []; // команды в порядке первого голоса — для равенства
    this.pending = null;
    this.waited = 0;
    this.fired = false; // 'fire' выдан и ждёт settle(): второй раз не выдаём
  }

  /** Один голос от зрителя за окно. false — не принят (пауза, не время, команда неизвестна, уже голосовал). */
  vote(voter, cmd) {
    if (this.paused || this.phase !== 'voting') return false;
    if (!Object.hasOwn(this.commands, cmd) || !voter || this.voters.has(voter)) return false;
    this.voters.add(voter);
    if (!this.counts[cmd]) this.order.push(cmd);
    this.counts[cmd] = (this.counts[cmd] ?? 0) + 1;
    return true;
  }

  weight(cmd) {
    return this.commands[cmd].side === 'chaos' ? this.power.harmWeight : 1;
  }

  /** Победитель окна: наибольший взвешенный счёт, при равенстве — кто раньше получил первый голос. null — голосов нет. */
  tally() {
    let best = null;
    for (const cmd of this.order) {
      const score = this.counts[cmd] * this.weight(cmd);
      if (!best || score > best.score + 1e-9) best = { cmd, score };
    }
    if (!best) return null;
    const total = this.total();
    const n = this.counts[best.cmd];
    const topRaw = Math.max(...Object.values(this.counts));
    const note = n < topRaw ? `сила чата «${this.power.label}»` : '';
    return { cmd: best.cmd, kind: this.commands[best.cmd].kind, n, total, line: winnerLine(best.cmd, n, total, note) };
  }

  total() {
    return Object.values(this.counts).reduce((a, b) => a + b, 0);
  }

  /** Шкала «хаос ↔ помощь» по голосам окна: число голосов с каждой стороны и доля помощи (0…1; 0,5 — голосов нет). */
  meter() {
    let chaos = 0, help = 0;
    for (const [cmd, n] of Object.entries(this.counts)) if (this.commands[cmd].side === 'help') help += n;
    else chaos += n;
    return { chaos, help, share: chaos + help ? help / (chaos + help) : 0.5 };
  }

  /** Шаг круга. dt — секунды, state — для canFire (объект или функция, которую зовут только пока победитель ждёт). Возвращает массив событий круга (часто пустой). */
  update(dt, state, check = canFire) {
    const out = [];
    if (this.paused) return out;
    if (this.last && (this.last.ttl -= dt) <= 0) this.last = null;
    switch (this.phase) {
      case 'voting': {
        this.left -= dt;
        if (this.left > 0) break;
        const win = this.tally();
        if (!win) {
          this.startWindow();
          out.push({ type: 'quiet' });
          break;
        }
        this.phase = 'pending';
        this.pending = win;
        this.waited = 0;
        this.last = { text: win.line, kind: 'win', ttl: this.rules.resultShow };
        out.push({ type: 'winner', ...win });
        // дальше — в той же итерации: вдруг момент уже спокойный
        out.push(...this._pendingStep(0, state, check));
        break;
      }
      case 'pending':
        out.push(...this._pendingStep(dt, state, check));
        break;
      case 'cooldown':
        this.left -= dt;
        if (this.left <= 0) this.startWindow();
        break;
      default:
    }
    return out;
  }

  _pendingStep(dt, state, check) {
    if (this.fired) return [];
    const c = check(typeof state === 'function' ? state() : state, this.rules);
    if (c.ok) {
      this.fired = true;
      return [{ type: 'fire', ...this.pending }];
    }
    this.waited += dt;
    this.pending.why = c.why;
    if (this.waited < this.rules.holdMax) return [];
    const p = this.pending;
    this._cooldown(this.rules.refusedCooldown);
    this.last = { text: `${p.cmd}: ${WHY_TEXT[c.why] ?? 'не вышло'} — событие отменено`, kind: 'drop', ttl: this.rules.resultShow };
    return [{ type: 'drop', cmd: p.cmd, why: c.why }];
  }

  _cooldown(seconds) {
    this.phase = 'cooldown';
    this.left = seconds;
    this.pending = null;
    this.fired = false;
  }

  /** Итог выпуска события: ok — кухня приняла (пауза силы чата), иначе короткая пауза и новое окно. */
  settle(ok, text = '') {
    if (this.phase !== 'pending' && !this.pending) return;
    const p = this.pending;
    this._cooldown(ok ? this.power.cooldown : this.rules.refusedCooldown);
    if (ok) this.last = { text: text || p?.line || '', kind: 'win', ttl: this.rules.resultShow };
    else this.last = { text: `${p?.cmd ?? 'Команда'}: сейчас нельзя — правила кухни`, kind: 'refused', ttl: this.rules.resultShow };
  }

  /** Снимок для интерфейса и оверлея: ничего лишнего (ни ников, ни чужого текста). */
  view() {
    const options = Object.keys(this.commands).map((cmd) => ({ cmd, icon: this.commands[cmd].icon, side: this.commands[cmd].side, n: this.counts[cmd] ?? 0 }));
    const total = this.total();
    return {
      phase: this.phase,
      left: this.phase === 'pending' ? 0 : Math.max(0, this.left),
      window: this.phase === 'cooldown' ? this.power.cooldown : this.window,
      power: this.power.id,
      paused: this.paused,
      options,
      total,
      meter: this.meter(),
      waiting: this.pending ? { cmd: this.pending.cmd, why: this.pending.why ?? null, line: this.pending.line } : null,
      last: this.last ? { text: this.last.text, kind: this.last.kind } : null,
    };
  }
}

// ---------- самые активные зрители ----------

/**
 * Объединить сохранённый список зрителей [{ nick, n }] со счётчиками этой игры { nick: n } и оставить самых активных.
 * Ники уже очищены sanitizeNick; «Зритель» и пустые сюда не попадают. Порядок: больше активности — выше, равные — по нику.
 */
export function mergeViewers(saved, counts, keep = CAMPAIGN.stream.viewers.keep) {
  const total = new Map();
  for (const v of saved ?? []) if (v && typeof v.nick === 'string' && v.nick && Number.isFinite(v.n) && v.n > 0) total.set(v.nick, (total.get(v.nick) ?? 0) + Math.round(v.n));
  for (const [nick, n] of Object.entries(counts ?? {})) if (nick && n > 0) total.set(nick, (total.get(nick) ?? 0) + n);
  return [...total.entries()]
    .map(([nick, n]) => ({ nick, n }))
    .sort((a, b) => b.n - a.n || (a.nick < b.nick ? -1 : 1))
    .slice(0, Math.max(0, keep));
}

/** Имена гостей финального стола: самые активные зрители вместо первых обычных гостей; не хватает зрителей — обычные. */
export function tableGuests(defaults, viewers, show = true) {
  const nicks = show ? (viewers ?? []).map((v) => v.nick) : [];
  return defaults.map((name, i) => nicks[i] ?? name);
}
