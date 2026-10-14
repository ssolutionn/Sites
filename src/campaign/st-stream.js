// Режим стримера внутри дня (0.11): ники зрителей в игре, состояние кухни для canFire, «помощь чата».
// Сессия ничего не знает о сети и чате: ники ей даёт функция streamViewers() (main.js), все ники уже очищены sanitizeNick.
// Чужой текст в игру не попадает: комментарии зрителей — только заготовки VIEWER_REACTIONS.
import { DISH_ORDER } from './data.js';
import { VIEWER_REACTIONS } from './feed-data.js';
import { estimateRemaining } from './stream-rules.js';

// Хеш строки → неотрицательное число: выбор без общего генератора дня (остальные события дня от чата не сдвигаются).
function hash(str) {
  let h = 0;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export const streamMethods = {
  /** Ники зрителей, которые можно показать в игре (пусто — ники выключены или зрителей нет). */
  _viewers() {
    const v = this.streamViewers?.();
    return v && v.show !== false && Array.isArray(v.nicks) ? v.nicks : [];
  },

  /** «Курьер» или «Курьер Нико»: ник выбирается один раз на заказ, чтобы в «в пути» и «приехал» курьер был тот же. */
  courierName() {
    const o = this.delivery.order;
    if (!o || o.self) return 'Курьер';
    if (o.courier === undefined) {
      const nicks = this._viewers();
      o.courier = nicks.length ? nicks[o.id % nicks.length] : null;
    }
    return o.courier ? `Курьер ${o.courier}` : 'Курьер';
  },

  /**
   * Состояние кухни для canFire (stream-rules.js): время, фаза, оценка конца дня по темпу, жест в процессе.
   * Что видно только интерфейсу (урок, книга, ввод в телефоне) и пауза чата добавляет main.js.
   */
  streamState() {
    let total = 0, done = 0;
    for (const d of Object.values(this.dishes))
      for (const s of d.recipe.steps) {
        if (this.isSkipped(d, s)) continue;
        total++;
        if (d.steps[s.id].done) done++;
      }
    if (this.day.finalServe) {
      total += DISH_ORDER.length;
      done += DISH_ORDER.filter((id) => this.table.placed[id] != null).length;
    }
    return {
      live: !!this.live && !this.practice,
      phase: this.phase,
      t: this.t,
      remaining: estimateRemaining({ t: this.t, done, total, phase: this.phase }),
      gesture: !!(this.pointerDown || this.action || this.gift || this.treeHand != null || this.tray?.drag || Object.values(this.holds).some(Boolean)),
    };
  },

  /** «!помощь»: кот засыпает на stream.help.catSleep секунд, а если курьер в пути — он едет на courierBoost быстрее. По ситуации. */
  _streamHelp() {
    const h = this.cfg.stream.help;
    const o = this.delivery.order;
    const options = [];
    if (o && !o.self && o.status === 'onTheWay' && !o.boosted) options.push('courier');
    if (this.t >= (this.catNeeds.sleepUntil ?? 0)) options.push('cat');
    if (!options.length) options.push('cat'); // оба уже заняты: продлеваем сон
    const pick = options.length === 1 ? options[0] : options[Math.floor(this.rng.next() * options.length)];
    if (pick === 'courier') {
      const left = Math.max(0, o.wait - (this.t - o.t0));
      o.wait = this.t - o.t0 + left / (1 + h.courierBoost); // осталось ехать на courierBoost быстрее
      o.boosted = true;
      this._emit('stream', { kind: 'help', effect: 'courier', text: 'Чат подгоняет курьера — он едет быстрее' });
      return true;
    }
    this.catNeeds.sleepUntil = this.t + h.catSleep;
    if (['theft', 'spill', 'mischief'].includes(this.cat.state)) {
      // кот, как раз тянувшийся к еде, засыпает на месте: беда отменена
      this.cat = { state: 'home' };
      this.catWaver?.reset();
      this._removeAlert('cat');
      this._removeAlert('spillWarn');
    }
    this._emit('stream', { kind: 'help', effect: 'cat', text: `Чат убаюкал кота — он спит ${h.catSleep} с` });
    return true;
  },

  /** Фото героини опубликовано: через несколько секунд зритель оставит заготовленный комментарий. */
  _viewerReacts(post) {
    if (!this.live || !this._viewers().length) return;
    const [a, b] = this.cfg.stream.commentDelay;
    this.viewerQueue ??= [];
    this.viewerQueue.push({ at: this.t + a + ((b - a) * (hash(post.id) % 1000)) / 1000, key: `me-${post.id}`, Q: post.Q ?? 0, salt: post.id });
  },

  _updateViewerComments() {
    const q = this.viewerQueue;
    if (!q?.length) return;
    for (const c of q) {
      if (this.t < c.at) continue;
      c.done = true;
      const nicks = this._viewers();
      if (!nicks.length) continue;
      const nick = nicks[hash(c.key) % nicks.length];
      const pool = VIEWER_REACTIONS.filter((r) => (r.minQ == null || c.Q >= r.minQ) && (r.maxQ == null || c.Q <= r.maxQ));
      const text = pool[hash(c.key + nick) % pool.length].text;
      (this.phone.comments[c.key] ??= []).push({ who: `📺 ${nick}`, text, t: this.t, to: null, viewer: true });
      this._emit('viewerComment', { key: c.key, nick });
    }
    if (q.some((c) => c.done)) this.viewerQueue = q.filter((c) => !c.done);
  },
};
