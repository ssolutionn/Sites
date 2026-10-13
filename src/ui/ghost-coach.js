// «Рука-призрак» (0.11): связка логики (src/ghost/) со слоем показа (ghost-hand.js) и событиями игры.
// CampaignUI зовёт четыре метода: onEvent (событие сессии), frame (каждый кадр), repeat («?») и reset (новая кухня).
// Состояния игры слой не меняет: он смотрит на сессию, считает отказы и рисует руку.
import { CAMPAIGN } from '../campaign/data.js';
import { DEMOS, demoPath } from '../ghost/ghost-demos.js';
import { GhostTrigger } from '../ghost/ghost-trigger.js';
import { gestureNow, paramsFor, placeOk, cueOf, stillRelevant, PressWatch } from '../ghost/ghost-cues.js';
import { makeMapper, startAnchor, cameraSettled } from '../view/ghost-space.js';
import { GhostHand } from './ghost-hand.js';

export class GhostCoach {
  /**
   * @param {object} o
   * @param {object} o.view CampaignView
   * @param {HTMLElement} o.host контейнер слоя
   * @param {{enabled:()=>boolean, isSeen:(id:string)=>boolean, markSeen:(id:string)=>void}} o.prefs настройка и память (main.js → settings)
   * @param {() => boolean} o.reduceMotion «Меньше движения»
   */
  constructor({ view, host, prefs, reduceMotion }) {
    this.view = view;
    this.cfg = CAMPAIGN.ghost;
    this.trigger = new GhostTrigger({ cfg: this.cfg, enabled: prefs.enabled, isSeen: prefs.isSeen, markSeen: prefs.markSeen });
    this.hand = new GhostHand({ host, reduceMotion });
    this.watch = new PressWatch();
    this.s = null;
    this.mode = 'menu';
    this.pending = null; // { show, waited }: показ ждёт, пока камера доедет и игрок окажется на месте
    this.releasing = null; // { t }: нажатие отпущено, разберём в следующем кадре, когда придут все события
    // игрок сам взялся за дело — рука уходит; заодно считаем нажатия на сцене, которые не получились
    window.addEventListener('pointerdown', (e) => this._down(e), true);
    window.addEventListener('pointermove', (e) => this._move(e), true);
    window.addEventListener('pointerup', () => this._up(), true);
    window.addEventListener('pointercancel', () => this.watch.cancel(), true);
  }

  /** Новая кухня или выход в меню: время сессии начинается заново, рука убирается. */
  reset() {
    this.trigger.reset();
    this.hand.hide();
    this.pending = null;
    this.releasing = null;
    this.watch.cancel();
  }

  /** Событие сессии: первая встреча с жестом или отказ. */
  onEvent(e, s) {
    this.s = s;
    this.watch.event(e.type);
    const cue = cueOf(e, s);
    if (!cue) return;
    const show = cue.kind === 'first' ? this.trigger.first(cue.id) : this.trigger.refuse(cue.id, cue.reason, s.t);
    if (show) this._queue(show);
  }

  /** Кнопка «?»: показать жест, который сейчас в руках. true — рука пошла. */
  repeat(s) {
    this.s = s;
    const id = gestureNow(s);
    const show = id ? this.trigger.repeat(id) : null;
    if (show) this._queue(show);
    return !!show;
  }

  _queue(show) {
    this.hand.hide();
    this.pending = { show, waited: 0 };
  }

  _down(e) {
    this.hand.hide();
    this.pending = null;
    if (e.button !== 0 || this.mode !== 'kitchen' || !this.s) return;
    this._settle();
    const c = this.view.sv.canvas;
    if (e.target !== c) {
      this.watch.cancel();
      return;
    }
    const h = Math.max(1, c.clientHeight);
    this.watch.down(gestureNow(this.s), this.s.t, e.clientX / h, e.clientY / h);
  }

  _move(e) {
    if (!this.watch.cur) return;
    const h = Math.max(1, this.view.sv.canvas.clientHeight);
    this.watch.move(e.clientX / h, e.clientY / h);
  }

  _up() {
    if (this.watch.cur) this.releasing = { t: this.s?.t ?? 0 };
  }

  // Разобрать отпущенное нажатие: водила впустую — это отказ жеста
  _settle() {
    if (!this.releasing) return;
    const { t } = this.releasing;
    this.releasing = null;
    const miss = this.watch.up(t);
    if (!miss || !this.s) return;
    const show = this.trigger.refuse(miss.id, miss.reason, this.s.t);
    if (show) this._queue(show);
  }

  // Начать показ, когда всё готово; null — ещё нельзя
  _start(show, s) {
    const id = show.id;
    if (!placeOk(id, s) || !cameraSettled(this.view)) return false;
    const params = paramsFor(id, s);
    const view = this.view;
    if (!makeMapper(view, id, params)) return false; // станции или крутилки в доке ещё нет
    this.hand.play({
      show,
      demo: DEMOS[id],
      path: demoPath(id, params),
      params,
      makeMap: () => makeMapper(view, id, params),
      anchor: DEMOS[id].startDom ? () => startAnchor(id) : null,
    });
    return true;
  }

  /** Каждый кадр: пауза и меню убирают руку, ожидающий показ стартует, идущий двигается. */
  frame(s, dt, mode) {
    this.s = s;
    this.mode = mode;
    if (mode !== 'kitchen' || !s) {
      this.hand.hide();
      this.pending = null;
      this.releasing = null;
      this.watch.cancel();
      return;
    }
    this._settle();
    const p = this.pending;
    if (p) {
      p.waited += dt;
      if (this._start(p.show, s)) this.pending = null;
      // кот и убегающая пена ждут игрока, пока всё это длится; остальным хватает cfg.wait секунд
      else if (p.waited > this.cfg.wait && !stillRelevant(p.show.id, s)) this.pending = null;
    }
    const cur = this.hand.cur;
    if (!cur) return;
    // жест уже не тот, что показывали (ушла со станции, кота прогнали) — рука уходит
    if (!placeOk(cur.show.id, s)) this.hand.hide();
    else this.hand.frame(dt);
  }
}
