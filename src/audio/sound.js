// Временные синтезированные эффекты через WebAudio — внешних файлов нет.
// AudioContext создаётся только после первого действия пользователя.

// Нож звучит по продукту: твёрдое глухо, хрусткое — шипением высоких, сыр звенит, мягкое — приглушённо.
const CHOP_KIND = {
  potato: 'hard', carrot: 'hard', beet: 'hard',
  cucumber: 'crisp', pickle: 'crisp', onion: 'crisp', apple: 'crisp', tomato: 'crisp',
  cheese: 'ring',
  egg: 'soft', bread: 'soft', crab: 'soft', herring: 'soft',
};
// Частые события не должны сливаться в «кашу»: минимальный промежуток между одинаковыми звуками, с.
const MIN_GAP = { chop: 0.04, stir: 0.3, peelSkin: 0.14, grate: 0.05, scuff: 0.25, scrub: 0.12, crack: 0.08 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.lastAt = {};
    this.muted = false;
    this.radioNodes = new Set();
    this.radioStep = -1;
    try {
      this.muted = localStorage.getItem('olivie.muted') === '1';
    } catch {
      /* хранилище недоступно — звук включён */
    }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    try {
      localStorage.setItem('olivie.muted', m ? '1' : '0');
    } catch {
      /* без сохранения */
    }
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.005, radio = false } = {}) {
    const c = this.ctx;
    const t0 = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
    if (radio) this.radioNodes.add(o);
    o.onended = () => { this.radioNodes.delete(o); o.disconnect(); g.disconnect(); };
  }

  // Собственная негромкая мелодия. Шаг берётся из игрового clock: без скрытых таймеров.
  syncRadio(playing, elapsed) {
    if (!playing || this.muted || !this.ctx || this.ctx.state !== 'running') {
      for (const o of this.radioNodes) { try { o.stop(); } catch { /* уже завершён */ } }
      this.radioNodes.clear(); this.radioStep = -1;
      return;
    }
    const step = Math.floor(elapsed / 0.30);
    if (step === this.radioStep) return;
    this.radioStep = step;
    const melody = [64, 67, 69, 67, 64, 62, 60, null, 62, 65, 67, 65, 62, 60, 59, null];
    const note = melody[step % melody.length];
    if (note !== null) this._tone(440 * 2 ** ((note - 69) / 12), 0.26, {type:'triangle',vol:0.075,attack:0.018,radio:true});
    if (step % 2 === 0) this._tone(440 * 2 ** (((step % 16 < 8 ? 48 : 43) - 69) / 12),0.30,{type:'sine',vol:0.045,attack:0.02,radio:true});
  }

  _noise(dur, { vol = 0.3, at = 0, freq = 2000, q = 1, type = 'bandpass' } = {}) {
    const c = this.ctx;
    const t0 = c.currentTime + at;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
  }

  /** name — звук; info — событие игры (нужен продукт для ножа). */
  play(name, info = null) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const gap = MIN_GAP[name];
    if (gap) {
      const now = this.ctx.currentTime;
      if (now - (this.lastAt[name] ?? -9) < gap) return;
      this.lastAt[name] = now;
    }
    const j = 0.93 + Math.random() * 0.14; // разброс высоты: повтор не звучит «как из автомата»
    switch (name) {
      case 'chop': {
        const kind = CHOP_KIND[String(info?.key ?? '').split(':').pop()];
        if (kind === 'hard') {
          this._noise(0.06, { vol: 0.5, freq: 2600 * j, q: 0.8 });
          this._tone(140 * j, 0.09, { type: 'triangle', vol: 0.3, slideTo: 70 });
        } else if (kind === 'crisp') {
          this._noise(0.09, { vol: 0.4, freq: 5200 * j, q: 0.9, type: 'highpass' });
          this._tone(260 * j, 0.05, { type: 'triangle', vol: 0.12, slideTo: 150 });
        } else if (kind === 'ring') {
          this._noise(0.05, { vol: 0.4, freq: 3800 * j, q: 0.8 });
          this._tone(620 * j, 0.12, { vol: 0.1, slideTo: 480 * j });
        } else if (kind === 'soft') {
          this._noise(0.08, { vol: 0.3, freq: 1500 * j, q: 0.6 });
          this._tone(110 * j, 0.08, { type: 'triangle', vol: 0.18, slideTo: 70 });
        } else {
          this._noise(0.06, { vol: 0.5, freq: 3500 * j, q: 0.8 });
          this._tone(180 * j, 0.08, { type: 'triangle', vol: 0.25, slideTo: 90 });
        }
        break;
      }
      case 'stir':
        this._noise(0.22, { vol: 0.09, freq: 900 * j, q: 0.5, type: 'lowpass' });
        this._tone(200 * j, 0.2, { vol: 0.03, slideTo: 260 * j, attack: 0.05 });
        break;
      case 'peelSkin':
        this._noise(0.12, { vol: 0.1, freq: 3000 * j, q: 0.7 });
        break;
      case 'crack':
        // скорлупа о доску: короткий сухой щелчок
        this._noise(0.035, { vol: 0.45, freq: 3200 * j, q: 2.5 });
        this._tone(900 * j, 0.03, { type: 'square', vol: 0.05 });
        break;
      case 'scrub':
        // губка или тряпка: шорох
        this._noise(0.12, { vol: 0.12, freq: 1800 * j, q: 0.6 });
        break;
      case 'scuff':
        this._noise(0.08, { vol: 0.12, freq: 700, q: 0.8 });
        this._tone(150, 0.08, { type: 'triangle', vol: 0.08, slideTo: 110 });
        break;
      case 'select':
        this._tone(900, 0.05, { vol: 0.12 });
        break;
      case 'deny':
        this._tone(220, 0.12, { type: 'square', vol: 0.08 });
        this._tone(180, 0.14, { type: 'square', vol: 0.08, at: 0.08 });
        break;
      case 'rotate':
        this._noise(0.12, { vol: 0.15, freq: 900, q: 0.5 });
        break;
      case 'transfer':
        [0, 0.05, 0.1].forEach((at, i) => this._tone(500 + i * 180, 0.09, { vol: 0.18, at, slideTo: 900 + i * 200 }));
        break;
      case 'meow':
        this._tone(520, 0.55, { type: 'sawtooth', vol: 0.12, slideTo: 860, attack: 0.05 });
        this._tone(860, 0.35, { type: 'triangle', vol: 0.1, at: 0.3, slideTo: 420 });
        break;
      case 'hiss':
        this._noise(0.4, { vol: 0.35, freq: 5000, q: 0.4, type: 'highpass' });
        break;
      case 'shoo':
        this._noise(0.25, { vol: 0.35, freq: 2500, q: 0.6 });
        this._tone(300, 0.2, { type: 'triangle', vol: 0.15, slideTo: 500 });
        break;
      case 'phone':
        this._tone(1318, 0.12, { vol: 0.2 });
        this._tone(1760, 0.18, { vol: 0.2, at: 0.13 });
        break;
      case 'boil':
        for (let i = 0; i < 7; i++) this._tone(300 + Math.random() * 500, 0.06, { vol: 0.12, at: i * 0.06, slideTo: 900 });
        this._tone(660, 0.15, { type: 'square', vol: 0.08, at: 0.45 });
        this._tone(660, 0.15, { type: 'square', vol: 0.08, at: 0.7 });
        break;
      case 'spill':
        this._noise(0.7, { vol: 0.4, freq: 800, q: 0.3, type: 'lowpass' });
        this._tone(400, 0.4, { type: 'triangle', vol: 0.15, slideTo: 120 });
        break;
      case 'fixed':
        [0, 0.08, 0.16].forEach((at, i) => this._tone(660 * (1 + i * 0.25), 0.15, { vol: 0.15, at }));
        break;
      case 'garlandOff':
        this._tone(900, 0.35, { type: 'sawtooth', vol: 0.1, slideTo: 60 });
        this._noise(0.1, { vol: 0.2, freq: 6000, at: 0.02 });
        break;
      case 'radioBroken':
        this._noise(0.28, {vol:0.20,freq:1700,q:0.3});
        this._tone(420,0.20,{type:'triangle',vol:0.08,slideTo:75});
        break;
      case 'ready':
        [0, 0.12, 0.24].forEach((at) => this._tone(1046, 0.5, { vol: 0.25, at }));
        break;
      case 'work':
        this._noise(0.15, { vol: 0.12, freq: 1200, q: 0.7 });
        break;
      case 'added':
        this._tone(700, 0.12, { vol: 0.18, slideTo: 1050 });
        break;
      case 'success':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.4, { type: 'triangle', vol: 0.22, at: i * 0.11 }));
        break;
      case 'fail':
        [392, 349, 311, 262].forEach((f, i) => this._tone(f, 0.45, { type: 'triangle', vol: 0.2, at: i * 0.18 }));
        break;
      case 'grate':
        this._noise(0.12, { vol: 0.18, freq: 4200, q: 1.5 });
        break;
      case 'drop':
        this._tone(520, 0.08, { vol: 0.14, slideTo: 380 });
        break;
      case 'bag':
        this._noise(0.35, { vol: 0.25, freq: 1500, q: 0.4 });
        break;
      case 'salt':
        for (let i = 0; i < 4; i++) this._noise(0.03, { vol: 0.12, freq: 6000, q: 2, at: i * 0.05 });
        break;
      case 'taste':
        this._tone(330, 0.18, { type: 'triangle', vol: 0.12, slideTo: 420 });
        this._tone(420, 0.22, { type: 'triangle', vol: 0.12, at: 0.18, slideTo: 300 });
        break;
      case 'pour':
        this._noise(0.6, { vol: 0.18, freq: 700, q: 0.6, type: 'lowpass' });
        break;
      case 'feed':
        for (let i = 0; i < 5; i++) this._noise(0.04, { vol: 0.16, freq: 2500, q: 1.2, at: i * 0.09 });
        this._tone(700, 0.3, { type: 'triangle', vol: 0.08, at: 0.45, slideTo: 900 });
        break;
      case 'ball':
        [0, 0.18, 0.32].forEach((at, i) => this._tone(500 - i * 60, 0.08, { vol: 0.14, at, slideTo: 300 }));
        break;
      case 'purr':
        this._tone(48, 0.9, { type: 'sawtooth', vol: 0.05, attack: 0.15 });
        break;
      case 'fizz':
        this._noise(0.5, { vol: 0.2, freq: 5000, q: 0.5, type: 'highpass' });
        break;
      case 'cash':
        this._tone(1568, 0.08, { vol: 0.15 });
        this._tone(2093, 0.2, { vol: 0.15, at: 0.08 });
        break;
      case 'click':
        this._tone(1200, 0.03, { vol: 0.06 });
        break;
      default:
    }
  }
}
