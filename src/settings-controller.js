// Изменение настроек (0.11): проверка значения → запись в save.data.settings → сохранение → применение.
// Без DOM: всё, что трогает страницу, сцену или окно, приходит снаружи колбэками (hooks) — так логика проверяется в node:test.
import { VOLUME_BUSES, QUALITIES, normalizeVolume, snapTextScale } from './settings.js';
import { isGhostId } from './ghost/ghost-ids.js';

export class SettingsController {
  /**
   * @param {object} o
   * @param {() => object} o.settings — save.data.settings (функция: «Новая кампания» подменяет объект)
   * @param {() => any} [o.persist] — записать сохранение
   * @param {{setVolumes(v:object):void, setMuted(m:boolean):void, muted:boolean, preview?:(bus:string)=>void}} o.sound
   * @param {import('./keymap.js').Keymap} o.keymap
   * @param {object} [o.hooks] — assist(on), textScale(scale), quality(q), motion(reduce|null), fullscreen(on)
   */
  constructor({ settings, persist = () => true, sound, keymap, hooks = {} }) {
    this.settings = settings;
    this.persist = persist;
    this.sound = sound;
    this.keymap = keymap;
    this.hooks = hooks;
  }

  get s() {
    return this.settings();
  }

  /** Применить всё сохранённое: при запуске игры и после «Новой кампании». */
  applyAll() {
    const s = this.s;
    this.sound.setVolumes(s.volume);
    this.hooks.assist?.(s.assist);
    this.hooks.textScale?.(s.textScale);
    this.hooks.quality?.(s.quality);
    this.hooks.motion?.(s.reduceMotion);
  }

  /**
   * Громкость шины 'master' | 'sfx' | 'music', 0..1. preview — проиграть пример (при отпускании ползунка);
   * save: false — не писать на диск, пока ползунок тянут (запись — на отпускании).
   */
  setVolume(bus, value, { preview = false, save = true } = {}) {
    if (!VOLUME_BUSES.includes(bus)) return false;
    const v = normalizeVolume(value, this.s.volume[bus]);
    this.s.volume = { ...this.s.volume, [bus]: v };
    this.sound.setVolumes(this.s.volume);
    if (save) this.persist();
    if (preview) this.sound.preview?.(bus);
    return v;
  }

  /** «Без звука» (клавиша M, ключ localStorage 'olivie.muted' остаётся за Sound). */
  setMuted(m) {
    this.sound.setMuted(!!m);
    return this.sound.muted;
  }

  setAssist(on) {
    this.s.assist = !!on;
    this.persist();
    this.hooks.assist?.(this.s.assist);
    return this.s.assist;
  }

  setTextScale(scale) {
    this.s.textScale = snapTextScale(scale);
    this.persist();
    this.hooks.textScale?.(this.s.textScale);
    return this.s.textScale;
  }

  setQuality(q) {
    if (!QUALITIES.includes(q)) return this.s.quality;
    this.s.quality = q;
    this.persist();
    this.hooks.quality?.(q);
    return q;
  }

  /** true / false — выбор игрока; null — как в системе. */
  setReduceMotion(v) {
    this.s.reduceMotion = typeof v === 'boolean' ? v : null;
    this.persist();
    this.hooks.motion?.(this.s.reduceMotion);
    return this.s.reduceMotion;
  }

  /** «Подсказки рукой»: рука-призрак показывает жесты (src/ghost/). */
  setGhostHints(on) {
    this.s.ghostHints = !!on;
    this.persist();
    return this.s.ghostHints;
  }

  /** Рука показала жест id: запомнить, чтобы не повторять при каждой встрече. true — запись новая. */
  markGhostSeen(id) {
    if (!isGhostId(id)) return false;
    const seen = (this.s.ghostSeen ??= {});
    if (seen[id]) return false;
    seen[id] = true;
    this.persist();
    return true;
  }

  /** Запомнить выбор полноэкранного режима (сам режим включает hooks.fullscreen). */
  setFullscreen(on) {
    this.s.fullscreen = !!on;
    this.persist();
    return this.s.fullscreen;
  }

  /** Включить или выключить полный экран по просьбе игрока. */
  async requestFullscreen(on) {
    const ok = await this.hooks.fullscreen?.(!!on);
    if (ok !== false) this.setFullscreen(!!on);
    return ok !== false;
  }

  /** Переназначить клавишу. Результат keymap.bind; при успехе сохраняется. */
  bindKey(action, code) {
    const r = this.keymap.bind(action, code);
    if (r.ok) this._saveKeys();
    return r;
  }

  resetKeys() {
    this.keymap.resetAll();
    this._saveKeys();
  }

  _saveKeys() {
    this.s.keys = this.keymap.toJSON();
    this.persist();
  }
}
