// «Рука-призрак» (0.11): когда её показывать. Чистая логика без DOM и Three.js; время приходит снаружи (секунды сессии),
// настройки и память «уже видела» — через колбэки, поэтому всё проверяется в node:test.
//
// Три повода показать жест:
//  • first(id)  — первая встреча с жестом, один раз за игру (память — save.data.settings.ghostSeen);
//  • refuse(id, reason, t) — refuseCount одинаковых отказов (жест и причина те же) за refuseWindow с → refuseShow с,
//    не чаще раза в refuseGap с;
//  • repeat(id) — игрок нажал «?».
// Выключенная настройка «Подсказки рукой» гасит все три повода и ничего не запоминает: включит позже — увидит при встрече.
import { CAMPAIGN } from '../campaign/data.js';
import { DEMOS } from './ghost-demos.js';

const EPS = 1e-9;

/**
 * @typedef {object} GhostShow
 * @property {string} id      жест (ключ DEMOS)
 * @property {'first'|'refuse'|'repeat'} why  что его вызвало
 * @property {number} dur     сколько секунд длится показ (проходы вместе с паузами)
 * @property {number} loops   сколько раз рука повторяет движение
 * @property {number} speed   во сколько раз путь проигрывается быстрее естественного (отказ ужимает показ до refuseShow)
 */

export class GhostTrigger {
  /**
   * @param {object} [o]
   * @param {object} [o.cfg]            CAMPAIGN.ghost
   * @param {() => boolean} [o.enabled] включена ли настройка «Подсказки рукой»
   * @param {(id:string) => boolean} [o.isSeen]   показывали ли этот жест раньше
   * @param {(id:string) => void} [o.markSeen]    запомнить, что показали
   * @param {object} [o.demos]          реестр демонстраций
   */
  constructor({ cfg = CAMPAIGN.ghost, enabled = () => true, isSeen = () => false, markSeen = () => {}, demos = DEMOS } = {}) {
    this.cfg = cfg;
    this.enabled = enabled;
    this.isSeen = isSeen;
    this.markSeen = markSeen;
    this.demos = demos;
    this.reset();
  }

  /** Новый день или новая кухня: время сессии начинается заново, старые отказы и пауза больше ничего не значат. */
  reset() {
    this.fails = new Map(); // 'жест:причина' → времена отказов внутри окна
    this.lastRefuse = null; // когда показывали призрака после отказов в последний раз
  }

  _show(id, why, dur, loops = 1) {
    const natural = this.demos[id].dur;
    return { id, why, dur, loops, speed: natural > 0 ? (natural * loops) / (dur - (loops - 1) * this.cfg.loopPause) : 1 };
  }

  // Показ с loops проходами: между ними пауза loopPause.
  _full(id, why) {
    const loops = Math.max(1, this.cfg.loops | 0);
    return this._show(id, why, this.demos[id].dur * loops + (loops - 1) * this.cfg.loopPause, loops);
  }

  /** Первая встреча с жестом. Показ или null (уже видела, настройка выключена, жеста нет). Запоминает только настоящий показ. */
  first(id) {
    if (!this.demos[id] || !this.enabled() || this.isSeen(id)) return null;
    this.markSeen(id);
    return this._full(id, 'first');
  }

  /**
   * Отказ жеста. t — секунды сессии. Показ — на третьем одинаковом отказе, если с прошлого показа после отказов
   * прошло не меньше refuseGap; иначе null (счёт отказов остаётся, следующий может сработать).
   */
  refuse(id, reason, t) {
    if (!this.demos[id] || !this.enabled() || !Number.isFinite(t)) return null;
    const c = this.cfg;
    const key = `${id}:${reason}`;
    let times = this.fails.get(key) ?? [];
    if (times.length && t < times[times.length - 1] - EPS) times = []; // время пошло назад: началась другая сессия
    if (this.lastRefuse != null && t < this.lastRefuse - EPS) this.lastRefuse = null;
    times = times.filter((x) => t - x <= c.refuseWindow + EPS);
    times.push(t);
    this.fails.set(key, times);
    if (times.length < c.refuseCount) return null;
    if (this.lastRefuse != null && t - this.lastRefuse < c.refuseGap - EPS) return null;
    this.lastRefuse = t;
    this.fails.delete(key);
    this.markSeen(id);
    return this._show(id, 'refuse', c.refuseShow);
  }

  /** Кнопка «?»: показать жест ещё раз, когда бы ни было. Только при включённой настройке. */
  repeat(id) {
    if (!this.demos[id] || !this.enabled()) return null;
    this.markSeen(id);
    return this._full(id, 'repeat');
  }
}
