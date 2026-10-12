// Полный экран (0.11): в браузере — Fullscreen API, в настольной версии — окно Electron через мост preload
// (desktop/preload.cjs: window.suetaDesktop). Окно может уйти в полный экран и само (меню «Вид», F11, Ctrl+Cmd+F),
// поэтому состояние берём не из переключателя, а из событий окна.

export class FullscreenControl {
  /**
   * @param {object} [o]
   * @param {Document} [o.doc] — document (в тестах подделка)
   * @param {object|null} [o.desktop] — мост настольной версии: isFullscreen(), setFullscreen(on), onFullscreen(cb)
   */
  constructor({ doc = globalThis.document, desktop = globalThis.suetaDesktop ?? null } = {}) {
    this.doc = doc ?? null;
    this.desktop = desktop;
    this.active = !!this.doc?.fullscreenElement;
    this.listeners = new Set();
    if (this.desktop) {
      this.desktop.onFullscreen?.((v) => this._set(v));
      Promise.resolve(this.desktop.isFullscreen?.()).then((v) => this._set(v), () => {});
    } else this.doc?.addEventListener?.('fullscreenchange', () => this._set(!!this.doc.fullscreenElement));
  }

  /** Умеет ли это окно полный экран (в iframe без разрешения и в старых браузерах — нет). */
  get supported() {
    return !!this.desktop || !!this.doc?.fullscreenEnabled;
  }

  _set(v) {
    const on = !!v;
    if (on === this.active) return;
    this.active = on;
    for (const fn of this.listeners) fn(on);
  }

  /** Включить или выключить. true — команда принята (браузер без жеста игрока может отказать: тогда false). */
  async set(on) {
    const want = !!on;
    try {
      if (this.desktop) {
        const v = await this.desktop.setFullscreen(want);
        this._set(typeof v === 'boolean' ? v : want);
        return true;
      }
      if (!this.doc) return false;
      if (want && !this.doc.fullscreenElement) await this.doc.documentElement.requestFullscreen();
      else if (!want && this.doc.fullscreenElement) await this.doc.exitFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  toggle() {
    return this.set(!this.active);
  }

  /** Подписка на смену состояния; возвращает отписку. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
