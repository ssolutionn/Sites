// Кот (0.11): три способа прогнать — помахать мышью (st-home.js), крикнуть (шанс 50 %) и отогнать самой (100 %, но уходишь от дел);
// покормить и поиграть — жестами у миски, а не кнопками: потряси пачку корма и води «удочкой с бантиком».
import { CAT_CHASE } from './layout.js';
import { KibbleShake, WandPlay } from './cat-gestures.js';

const ACTIVE = ['theft', 'spill', 'mischief'];

export const catMethods = {
  /** Кот сейчас безобразничает (есть что прогонять). */
  catActive() {
    return ACTIVE.includes(this.cat.state);
  },

  /** Куда встать героине, чтобы прогнать кота; null — прогонять некого. */
  chaseSpot() {
    const c = this.cat;
    if (!this.catActive()) return null;
    return CAT_CHASE[c.state === 'mischief' ? c.kind : c.state] ?? null;
  },

  /**
   * Крикнуть («Брысь!», клавиша F): работает откуда угодно, даже из крупного плана, но не наверняка — шанс cat.shoutChance.
   * После крика голос «садится» на cat.shoutCooldown секунд. Возвращает 'shoo' | 'miss' | 'cooldown' | false.
   */
  shout() {
    if (this.isOver() || this.heroine.away) return false;
    if (!this.catActive()) {
      this.setHint('Кот сейчас не безобразничает — кричать не на кого', 2);
      return false;
    }
    const c = this.cfg.cat;
    if (this.t < (this.shoutReadyAt ?? 0)) {
      this.setHint('Голос сел — подожди пару секунд', 1.5);
      return 'cooldown';
    }
    this.shoutReadyAt = this.t + c.shoutCooldown;
    const ok = this.rng.next() < c.shoutChance;
    this._emit('shout', { ok });
    if (ok) {
      this.stats.shouts = (this.stats.shouts ?? 0) + 1;
      this.shoo();
      return 'shoo';
    }
    this.stats.shoutMisses = (this.stats.shoutMisses ?? 0) + 1;
    this.setHint('Кот и ухом не повёл — крикни ещё, помаши мышью или отгони сама', 2.5);
    return 'miss';
  },

  /** Отогнать самой: героиня идёт к коту и прогоняет наверняка, пока не кончилось окно. Тратит время — бросает станцию. */
  chaseCat() {
    if (!this.catActive()) {
      this.setHint('Кот сейчас не безобразничает', 2);
      return false;
    }
    if (!this._canMove()) return false;
    const spot = this.chaseSpot();
    if (!spot) return false;
    const hr = this.heroine;
    if (hr.target?.chase) return true;
    if (!hr.target && Math.hypot(spot.x - hr.x, spot.z - hr.z) < 0.35) {
      this._leaveStation();
      return this._chased();
    }
    const path = this.nav.findPath(hr, spot);
    if (!path) {
      this.setHint('К коту сейчас не пройти — мешает лужа', 2);
      this._emit('navFail', { x: spot.x, z: spot.z });
      return false;
    }
    this._leaveStation();
    hr.path = path;
    hr.target = { chase: true, point: { x: spot.x, z: spot.z } };
    this._emit('walk', { chase: true });
    return true;
  },

  /** Дошла до кота: он убегает. Если за дорогу кот уже сделал своё, прогонять поздно. */
  _chased() {
    if (!this.catActive()) return false;
    this.stats.chases = (this.stats.chases ?? 0) + 1;
    this._emit('chase');
    return this.shoo();
  },

  // ---------- миска кота: корм и игра жестами ----------
  /** Взять в руки пачку корма ('kibble') или «удочку» ('wand'); повторный выбор — положить. */
  catPick(tool) {
    if (!this._isIdleAt('catbowl')) return false;
    if (this.catActive()) {
      this.setHint('Сначала прогони кота', 2);
      return false;
    }
    if (this.cat.state === 'eat' || this.cat.state === 'play') {
      this.setHint('Кот сейчас занят — подожди пару секунд', 2);
      return false;
    }
    if (tool !== 'kibble' && tool !== 'wand') return false;
    this.catTool = this.catTool === tool ? null : tool;
    this.catFeed = null;
    this.catPlay = null;
    this.catWand = null;
    if (this.catTool === 'kibble') {
      this.catFeed = new KibbleShake(this.cfg.cat.feed);
      this.setHint('Зажми пачку над миской и потряси вниз-вверх — корм сыплется', 3.5);
    } else if (this.catTool === 'wand') {
      this.catPlay = new WandPlay(this.cfg.cat.play);
      this.setHint('Зажми «удочку» и води бантиком по полу — кот прыгает за ним', 3.5);
    }
    this._emit('catPick', { tool: this.catTool });
    return true;
  },

  /** Указатель у миски кота. Координаты — метры от центра миски. */
  _catbowlPointer(type, x, z) {
    const tool = this.catTool;
    if (!tool) return 'ignored';
    if (type === 'up') {
      this.catFeed?.release();
      this.catPlay?.release();
      this.catWand = null;
      return 'up';
    }
    if (tool === 'kibble') {
      if (!this.catFeed) return 'ignored';
      if (type === 'down' && Math.hypot(x, z) > this.cfg.cat.feed.radius * 1.8) return 'ignored';
      const r = this.catFeed.move(x, z, this.clock);
      this.catWand = this.pointerDown ? { x, z } : null; // рука с пачкой — для вида
      if (type === 'down' && r === 'away') this.setHint('Пачку надо держать над миской', 1.5);
      if (r === 'shake') {
        this._emit('kibble', { amount: this.catFeed.amount });
        if (this.catFeed.done) this._catFed();
      }
      return r;
    }
    if (!this.catPlay) return 'ignored';
    if (type === 'down' && Math.hypot(x, z) > this.cfg.cat.play.radius) return 'ignored';
    const gain = this.catPlay.move(x, z);
    this.catWand = this.pointerDown ? { x, z } : null; // бантик под мышью
    if (gain > 0) {
      this._wandAcc = (this._wandAcc ?? 0) + gain;
      if (this._wandAcc >= 0.45) {
        this._wandAcc = 0;
        this._emit('wand', { progress: this.catPlay.progress });
      }
    }
    if (this.catPlay.done) this._catPlayed();
    return gain > 0 ? 'play' : 'hover';
  },

  _catFed() {
    this.catTool = null;
    this.catFeed = null;
    this.catHunger0 = this.catNeeds.hunger;
    this.catNeeds.hunger = 0;
    this.catNeeds.warned = false;
    this.stats.catFed = (this.stats.catFed ?? 0) + 1;
    this._removeAlert('catHungry');
    this.cat = { state: 'eat', until: this.t + 10, startedAt: this.t };
    this._emit('catFed');
    this.setHint('Кот хрустит кормом. Сытый кот спит и к еде не лезет', 3);
    return true;
  },

  _catPlayed() {
    this.catTool = null;
    this.catPlay = null;
    this.catWand = null;
    this.catNeeds.boredom = 0;
    this.catNeeds.boredWarned = false;
    this._removeAlert('catBored');
    this.cat = { state: 'play', until: this.t + this.cfg.cat.playTime, startedAt: this.t };
    this._emit('catPlay');
    this.setHint(`Кот гоняет бантик ${this.cfg.cat.playTime} с и больше не скучает — но голод это не отменяет`, 3);
    return true;
  },
};
