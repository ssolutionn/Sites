// Музыка кухонного радио: синтез WebAudio по нотам radio-scores.js, планировщик с упреждением,
// шум и треск между станциями. Уровни и станции — src/campaign/radio-data.js.
// Дизайн: design/gdd/interaction-spec.md §3.8; решение владельца 2026-10-08 — музыка кодом.
// Звук идёт через общий master (Sound): mute и громкость игры действуют сами. Без AudioContext
// (node, тесты, до первого жеста игрока) — молчит и ничего не планирует.
import { RADIO, RADIO_STATIONS } from '../campaign/radio-data.js';
import { SCORES, compileScore } from './radio-scores.js';

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- кирпичики ----------
function voiceGain(ctx, out, t) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.connect(out);
  return g;
}
function tone(ctx, type, f, t, end, dest, { detune = 0, wave = null } = {}) {
  const o = ctx.createOscillator();
  if (wave) o.setPeriodicWave(wave);
  else o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (detune) o.detune.setValueAtTime(detune, t);
  o.connect(dest);
  o.start(t);
  o.stop(end);
  return o;
}
// Синус-обертон со своим затуханием.
function partial(ctx, f, t, end, dest, level, decay) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(level, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  g.connect(dest);
  return tone(ctx, 'sine', f, t, Math.min(end, t + decay + 0.02), g);
}
function filter(ctx, type, f, out, q = 0.7) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.connect(out);
  return b;
}
function noiseHit(ctx, kit, t, len, dest) {
  const s = ctx.createBufferSource();
  s.buffer = kit.noise;
  s.connect(dest);
  s.start(t, Math.random() * 1.5, len);
  return s;
}
function chip(ctx, out, f, t, d, peak, cut, wave, type = 'square') {
  const g = voiceGain(ctx, out, t);
  const end = t + d + 0.08;
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.setTargetAtTime(peak * 0.7, t + 0.004, 0.12);
  g.gain.setTargetAtTime(0, t + d * 0.9, 0.02);
  const lp = filter(ctx, 'lowpass', cut, g);
  return { srcs: [tone(ctx, type, f, t, end, lp, { wave })], g };
}

// ---------- инструменты: (ctx, kit, out, f, t, d, v) → { srcs, g } ----------
// srcs[0] звучит дольше всех (по нему снимается нота), g — выходной gain ноты (для мягкой остановки).
const INST = {
  // музыкальная шкатулка: стальной язычок — основной тон, октава и короткий «дзынь»
  musicbox(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const end = t + 1.7;
    g.gain.linearRampToValueAtTime(0.2 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, end - 0.05);
    return { srcs: [tone(ctx, 'sine', f, t, end, g), partial(ctx, f * 2, t, end, g, 0.28, 0.6), partial(ctx, f * 5.4, t, end, g, 0.07, 0.15)], g };
  },
  // челеста: мягче шкатулки, с третьим обертоном
  celesta(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const end = t + 1.3;
    g.gain.linearRampToValueAtTime(0.19 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, end - 0.05);
    return { srcs: [tone(ctx, 'sine', f, t, end, g), partial(ctx, f * 2, t, end, g, 0.35, 0.35), partial(ctx, f * 3, t, end, g, 0.1, 0.12)], g };
  },
  // струнная педаль: две расстроенные «пилы» за фильтром, медленная атака
  pad(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const peak = 0.045 * v;
    const rel = 0.6;
    const end = t + d + rel + 0.05;
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.35, d * 0.5));
    g.gain.setValueAtTime(peak, t + d);
    g.gain.linearRampToValueAtTime(0, t + d + rel);
    const lp = filter(ctx, 'lowpass', 1500, g);
    return { srcs: [tone(ctx, 'sawtooth', f, t, end, lp, { detune: -7 }), tone(ctx, 'sawtooth', f, t, end, lp, { detune: 7 })], g };
  },
  // струнные голосом: быстрее атака, лёгкое вибрато
  strings(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const peak = 0.075 * v;
    const end = t + d + 0.3;
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.08, d * 0.4));
    g.gain.setValueAtTime(peak, t + d);
    g.gain.linearRampToValueAtTime(0, t + d + 0.25);
    const lp = filter(ctx, 'lowpass', 2200, g);
    const a = tone(ctx, 'sawtooth', f, t, end, lp, { detune: -5 });
    const b = tone(ctx, 'sawtooth', f, t, end, lp, { detune: 5 });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lg = ctx.createGain();
    lg.gain.value = 9;
    lfo.connect(lg);
    lg.connect(a.detune);
    lg.connect(b.detune);
    lfo.start(t);
    lfo.stop(end);
    return { srcs: [a, b, lfo], g };
  },
  // пиццикато: короткий щипок
  pizz(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const end = t + 0.42;
    g.gain.linearRampToValueAtTime(0.22 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0005, end - 0.02);
    const lp = filter(ctx, 'lowpass', 1100, g);
    return { srcs: [tone(ctx, 'triangle', f, t, end, lp), partial(ctx, f * 2, t, end, lp, 0.25, 0.15)], g };
  },
  // электропиано (FM): яркий удар, тёплый хвост
  epiano(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const hold = Math.min(d, 1.6);
    const end = t + hold + 0.4;
    const peak = 0.13 * v;
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.setTargetAtTime(peak * 0.3, t + 0.004, 0.45);
    g.gain.setTargetAtTime(0, t + hold, 0.07);
    const car = ctx.createOscillator();
    car.frequency.setValueAtTime(f, t);
    const mod = ctx.createOscillator();
    mod.frequency.setValueAtTime(f, t);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 1.1 * v, t);
    mg.gain.setTargetAtTime(f * 0.12, t, 0.25);
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(g);
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
    return { srcs: [car, mod], g };
  },
  // бас-гитара эстрады
  bass(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const peak = 0.26 * v;
    const end = t + d + 0.25;
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.setTargetAtTime(peak * 0.45, t + 0.006, 0.3);
    g.gain.setTargetAtTime(0, t + d * 0.92, 0.04);
    const lp = filter(ctx, 'lowpass', 650, g);
    const tri = ctx.createGain();
    tri.gain.value = 0.35;
    tri.connect(lp);
    return { srcs: [tone(ctx, 'sine', f, t, end, lp), tone(ctx, 'triangle', f, t, end, tri)], g };
  },
  // щётки по малому барабану: v ≥ 0,8 — «шшух», меньше — лёгкий удар
  brush(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const swish = v >= 0.8;
    const bp = filter(ctx, 'bandpass', swish ? 3800 : 5200, g, 0.6);
    if (swish) {
      g.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g.gain.setTargetAtTime(0, t + 0.06, 0.07);
    } else {
      g.gain.linearRampToValueAtTime(0.035, t + 0.003);
      g.gain.setTargetAtTime(0, t + 0.004, 0.025);
    }
    return { srcs: [noiseHit(ctx, kit, t, 0.45, bp)], g };
  },
  // бубенцы саней: три быстрых звяка
  bells(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const hp = filter(ctx, 'highpass', 6500, g, 0.8);
    for (const [k, dt] of [[1, 0.001], [0.6, 0.055], [0.8, 0.1]]) {
      g.gain.setValueAtTime(0.03 * v * k, t + dt);
      g.gain.setTargetAtTime(0, t + dt + 0.002, 0.018);
    }
    return { srcs: [noiseHit(ctx, kit, t, 0.3, hp)], g };
  },
  // приставка: прямоугольник 25 % и 12,5 %, треугольный бас, «тсс» шума
  pulse: (ctx, kit, out, f, t, d, v) => chip(ctx, out, f, t, d, 0.06 * v, 2600, kit.duty25),
  pulse12: (ctx, kit, out, f, t, d, v) => chip(ctx, out, f, t, d, 0.045 * v, 3400, kit.duty12),
  tri: (ctx, kit, out, f, t, d, v) => chip(ctx, out, f, t, d, 0.2 * v, 1800, null, 'triangle'),
  chiphat(ctx, kit, out, f, t, d, v) {
    const g = voiceGain(ctx, out, t);
    const hp = filter(ctx, 'highpass', 7500, g);
    g.gain.linearRampToValueAtTime(0.03 * v, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.003, 0.015);
    return { srcs: [noiseHit(ctx, kit, t, 0.12, hp)], g };
  },
};

// ---------- общие буферы и формы волны (по одному набору на AudioContext) ----------
const KITS = new WeakMap();
function pulseWave(ctx, duty) {
  const N = 32;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}
// Эфирный шум: «шипение» с медленным колыханием и редкими щелчками треска; петля 3 с без шва.
function makeStatic(ctx, sec = 3) {
  const sr = ctx.sampleRate;
  const n = Math.floor(sr * sec);
  const b = ctx.createBuffer(1, n, sr);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.55 * (0.75 + 0.25 * Math.sin((i / n) * Math.PI * 4));
  const pops = Math.round(sec * 16);
  for (let k = 0; k < pops; k++) {
    const at = Math.floor(Math.random() * (n - 600));
    const amp = (Math.random() < 0.15 ? 1 : 0.45) * (Math.random() < 0.5 ? -1 : 1);
    const len = 40 + Math.floor(Math.random() * 260);
    for (let j = 0; j < len; j++) d[at + j] += amp * Math.exp(-j / (len / 4)) * (0.4 + Math.random() * 0.6);
  }
  return b;
}
function kitFor(ctx) {
  let kit = KITS.get(ctx);
  if (kit) return kit;
  const n = Math.floor(ctx.sampleRate * 2);
  const noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  kit = { noise, static: makeStatic(ctx), duty25: pulseWave(ctx, 0.25), duty12: pulseWave(ctx, 0.125) };
  KITS.set(ctx, kit);
  return kit;
}

/**
 * Радиоприёмник: каждый кадр получает session.radioTuning() (или null — радио молчит) и
 * сам решает, какую станцию синтезировать и сколько шума подмешать.
 * Станции «вещают» по общему эфирному времени: переключился — попал в середину песни, как на настоящем радио.
 */
export class RadioMusic {
  /** @param {{ctx: AudioContext|null, master?: AudioNode, muted?: boolean}} sound — общий Sound игры */
  constructor(sound, { cfg = RADIO, stations = RADIO_STATIONS, scores = SCORES } = {}) {
    this.sound = sound;
    this.cfg = cfg;
    this.A = cfg.audio;
    this.stations = stations;
    this.songs = {};
    for (const st of stations) if (scores[st.score]) this.songs[st.id] = compileScore(scores[st.score]);
    this.graph = null;
    this.voice = null;
    this.air = 0; // эфирное время, с (идёт, пока радио звучит)
    this.lastNow = null;
    this.live = new Set();
    this.timer = null;
  }

  /** Звучит ли сейчас что-нибудь. */
  get playing() {
    return !!this.graph;
  }

  /** Станция, которую сейчас синтезирует планировщик (id или null). */
  get stationId() {
    return this.voice?.id ?? null;
  }

  /** Каждый кадр: mix — { station, signal, music, noise, near } или null (не кухня, пауза, практика). */
  sync(mix) {
    const ctx = this.sound?.ctx;
    const audible = !!mix && (mix.music > 0.001 || mix.noise > 0.001);
    if (!audible || !ctx || ctx.state !== 'running' || this.sound.muted) {
      this.stop();
      return;
    }
    if (!this.graph || this.graph.ctx !== ctx) this._build(ctx);
    const id = mix.music > 0.001 ? (mix.station?.id ?? null) : null;
    if (id !== this.stationId) this._switch(id);
    this._levels(mix);
    this._tick();
  }

  /** Плавно заглушить всё и освободить узлы. */
  stop() {
    const G = this.graph;
    if (!G) return;
    this.graph = null;
    clearInterval(this.timer);
    this.timer = null;
    const now = G.ctx.currentTime;
    hold(G.out.gain, now);
    G.out.gain.setTargetAtTime(0, now, 0.04);
    this._silence(G.ctx, now + 0.25, 0.04);
    try {
      G.staticSrc.stop(now + 0.3);
    } catch {
      /* уже остановлен */
    }
    this.voice = null;
    this.lastNow = null;
    setTimeout(() => {
      try {
        G.out.disconnect();
      } catch {
        /* уже отключён */
      }
    }, 500);
  }

  _build(ctx) {
    const A = this.A;
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.setTargetAtTime(A.volume, now, 0.08);
    out.connect(this.sound.master ?? ctx.destination);
    const musicGain = ctx.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(out);
    const lp = filter(ctx, 'lowpass', A.lowpassMax, musicGain, 0.5);
    const hp = filter(ctx, 'highpass', A.highpass, lp, 0.5);
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseGain.connect(out);
    const bp = filter(ctx, 'bandpass', A.noiseBand, noiseGain, 0.45);
    const kit = kitFor(ctx);
    const staticSrc = ctx.createBufferSource();
    staticSrc.buffer = kit.static;
    staticSrc.loop = true;
    staticSrc.connect(bp);
    staticSrc.start(now, Math.random() * 2.5);
    this.graph = { ctx, out, musicIn: hp, lp, musicGain, noiseGain, staticSrc, kit, set: {} };
    this.timer = setInterval(() => this._tick(), A.tick * 1000);
  }

  // Новая станция: глушим старые ноты и встаём в её песню по эфирному времени.
  _switch(id) {
    const G = this.graph;
    const now = G.ctx.currentTime;
    this._silence(G.ctx, now + 0.1, 0.03);
    const song = id ? this.songs[id] : null;
    if (!song || !song.events.length) {
      this.voice = null;
      return;
    }
    const pos = this.air % song.loopSec;
    let i = song.events.findIndex((e) => e.at * song.unitSec >= pos - 1e-6);
    let loop = 0;
    if (i < 0) {
      i = 0;
      loop = 1;
    }
    this.voice = { id, song, i, loop, t0: now + 0.04 - pos };
  }

  _levels(mix) {
    const G = this.graph;
    const A = this.A;
    const now = G.ctx.currentTime;
    const k = mix.near ? A.near : 1;
    this._param('music', G.musicGain.gain, mix.music * A.music * k * (mix.station?.gain ?? 1), now);
    this._param('noise', G.noiseGain.gain, mix.noise * A.noise * k, now);
    this._param('cut', G.lp.frequency, A.lowpassMin + (A.lowpassMax - A.lowpassMin) * clamp01(mix.signal), now);
  }

  _param(key, p, v, now) {
    const S = this.graph.set;
    if (S[key] != null && Math.abs(S[key] - v) < Math.max(0.002, Math.abs(v) * 0.01)) return;
    S[key] = v;
    p.setTargetAtTime(v, now, this.A.fade);
  }

  // Планировщик: всё, что начнётся до now + lookahead (или до until), ставится в очередь WebAudio.
  _tick(until = null) {
    const G = this.graph;
    if (!G) return;
    const now = G.ctx.currentTime;
    if (this.lastNow != null) this.air += Math.max(0, Math.min(1, now - this.lastNow));
    this.lastNow = now;
    const v = this.voice;
    if (!v) return;
    const S = v.song;
    const horizon = until ?? now + this.A.lookahead;
    for (let guard = 0; guard < 4096; guard++) {
      const e = S.events[v.i];
      const t = v.t0 + (v.loop * S.length + e.at) * S.unitSec;
      if (t > horizon) break;
      if (now - t > 2) {
        // вкладка спала: не догоняем пропущенное, встаём в эфир заново
        this._switch(v.id);
        return;
      }
      if (t >= now - 0.03) this._play(e, Math.max(t, now), S.unitSec);
      if (++v.i >= S.events.length) {
        v.i = 0;
        v.loop++;
      }
    }
  }

  _play(e, t, unitSec) {
    const G = this.graph;
    const fn = INST[e.inst];
    if (!fn) return;
    const d = e.dur * unitSec;
    for (const m of e.notes.length ? e.notes : [null]) {
      const n = fn(G.ctx, G.kit, G.musicIn, m == null ? 0 : mtof(m), t, d, e.vel);
      this.live.add(n);
      n.srcs[0].onended = () => {
        this.live.delete(n);
        try {
          n.g.disconnect();
        } catch {
          /* уже отключён */
        }
      };
    }
  }

  _silence(ctx, at, tau) {
    const now = ctx.currentTime;
    for (const n of this.live) {
      try {
        hold(n.g.gain, now);
        n.g.gain.setTargetAtTime(0, now, tau);
        for (const s of n.srcs) s.stop(at);
      } catch {
        /* нота уже доиграла */
      }
    }
    this.live.clear();
  }
}

function hold(param, now) {
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(now);
  else param.cancelScheduledValues(now);
}
