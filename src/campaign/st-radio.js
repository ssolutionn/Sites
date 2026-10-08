// Радио: ручка настройки (круговой жест в крупном плане), сила сигнала, поиск станций и ремонт
// удержанием ручки. Состояние — session.radio: { enabled, broken, progress, repairs, breaks, freq }.
// Дизайн: design/gdd/interaction-spec.md §3.8; решение владельца 2026-10-08 — крутилка частоты.
// Числа — RADIO и RADIO_STATIONS в radio-data.js.
import { RADIO, RADIO_STATIONS } from './radio-data.js';

const TAU = Math.PI * 2;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Частота в пределах шкалы; мусор — частота по умолчанию. */
export function clampFreq(f, cfg = RADIO) {
  if (!Number.isFinite(f)) return cfg.startFreq;
  return Math.min(cfg.max, Math.max(cfg.min, f));
}

/** Поворот ручки на dAngle радиан (по часовой — плюс) → новая частота в пределах шкалы. */
export function turnKnob(freq, dAngle, cfg = RADIO) {
  return clampFreq(clampFreq(freq, cfg) + (dAngle / TAU) * cfg.mhzPerTurn, cfg);
}

/** Угол ручки для отрисовки: радианы по часовой от положения «левый край шкалы». */
export function knobAngle(freq, cfg = RADIO) {
  return ((clampFreq(freq, cfg) - cfg.min) / cfg.mhzPerTurn) * TAU;
}

/** Положение стрелки на шкале: 0 — левый край, 1 — правый. */
export function needlePos(freq, cfg = RADIO) {
  return (clampFreq(freq, cfg) - cfg.min) / (cfg.max - cfg.min);
}

/** Сила сигнала станции: 1 в пределах ±full МГц, 0 от ±zero, между — плавный спад (smoothstep). */
export function signalAt(freq, stationFreq, cfg = RADIO) {
  const d = Math.abs(freq - stationFreq);
  const eps = 1e-9; // 99,4 − 100 в двоичной арифметике чуть меньше 0,6
  if (d <= cfg.full + eps) return 1;
  if (d >= cfg.zero - eps) return 0;
  const k = (cfg.zero - d) / (cfg.zero - cfg.full);
  return k * k * (3 - 2 * k);
}

/** Ближайшая станция: { station, dist, signal }; без станций — station = null. */
export function nearestStation(freq, stations = RADIO_STATIONS, cfg = RADIO) {
  let best = null;
  for (const st of stations) {
    const dist = Math.abs(freq - st.freq);
    if (!best || dist < best.dist) best = { station: st, dist };
  }
  return best ? { ...best, signal: signalAt(freq, best.station.freq, cfg) } : { station: null, dist: Infinity, signal: 0 };
}

/** Соседняя станция для кнопок ◀ ▶: dir > 0 — выше по частоте, иначе ниже; за краем — по кругу. */
export function seekStation(freq, dir, stations = RADIO_STATIONS) {
  const eps = 0.05;
  const up = [...stations].sort((a, b) => a.freq - b.freq);
  if (!up.length) return null;
  if (dir > 0) return up.find((s) => s.freq > freq + eps) ?? up[0];
  return [...up].reverse().find((s) => s.freq < freq - eps) ?? up[up.length - 1];
}

/**
 * Что звучит из приёмника. Уровни 0..1 — до общей громкости (radio-data.js → audio).
 * Выключено — тишина. Исправно — музыка и шум делят мощность по силе сигнала.
 * Сломано — музыки нет («Радио замолчало»); у самого радио слышен треск, который стихает по ходу
 * ремонта, а музыка проступает (GDD §3.8). Вдали от радио сломанный приёмник молчит — без бесконечного треска.
 * @param {{freq:number, enabled?:boolean, broken?:boolean, repair?:number, near?:boolean}} st
 */
export function radioMix({ freq, enabled = true, broken = false, repair = 0, near = false }, stations = RADIO_STATIONS, cfg = RADIO) {
  const n = nearestStation(clampFreq(freq, cfg), stations, cfg);
  const base = { station: n.station, signal: n.signal, near };
  if (!enabled) return { ...base, music: 0, noise: 0 };
  if (broken) {
    if (!near) return { ...base, music: 0, noise: 0 };
    const p = clamp01(repair);
    return { ...base, music: n.signal * p * p, noise: 1 - p };
  }
  const a = (n.signal * Math.PI) / 2;
  return { ...base, music: Math.sin(a), noise: Math.cos(a) };
}

/** Частота для шкалы и дока: «102,4 МГц». */
export function formatFreq(f, cfg = RADIO) {
  return `${clampFreq(f, cfg).toFixed(1).replace('.', ',')} МГц`;
}

export const radioMethods = {
  /** Приём сейчас — для звука, шкалы и дока: { freq, station, signal, music, noise, near, tuned, grab }. */
  radioTuning() {
    const r = this.radio;
    const near = this.panel === 'radio' && !this.heroine.target;
    const repair = r.broken ? r.progress / this.cfg.durations.radioHold : 0;
    const mix = radioMix({ freq: r.freq, enabled: r.enabled, broken: r.broken, repair, near });
    const tuned = r.enabled && !r.broken && mix.signal >= RADIO.lock ? mix.station : null;
    return { freq: clampFreq(r.freq), ...mix, tuned, grab: !!this._radioDrag };
  },

  /** Точная подстройка (колёсико мыши): delta — МГц. Только стоя у радио. */
  tuneRadio(delta) {
    if (!this._isIdleAt('radio') || this.action || !Number.isFinite(delta)) return false;
    return this._setRadioFreq(this.radio.freq + delta, true);
  },

  /** Поиск станции кнопками ◀ ▶: dir = −1 | +1. */
  seekRadio(dir) {
    if (!this._isIdleAt('radio') || this.action) return false;
    const st = seekStation(clampFreq(this.radio.freq), Number(dir) > 0 ? 1 : -1);
    return st ? this._setRadioFreq(st.freq, true) : false;
  },

  _setRadioFreq(f, emit) {
    const nf = clampFreq(f); // без округления: ошибка копилась бы на каждом шаге ручки
    if (Math.abs(nf - this.radio.freq) < 1e-9) return false;
    this.radio.freq = nf;
    if (emit) this._emitRadioTuned();
    return true;
  },

  _emitRadioTuned() {
    this._emit('radioTuned', { freq: this.radio.freq, station: this.radioTuning().tuned?.id ?? null });
  },

  // Указатель в крупном плане радио: x — вправо, z — вниз по лицевой панели (м от центра корпуса).
  // Зажал ручку и ведёшь по кругу — частота идёт за углом; сломанное радио чинится удержанием ручки.
  _radioPointer(type, x, z) {
    const k = RADIO.knob;
    const dx = x - k.x;
    const dz = z + k.y; // ось панели вверх, экран — вниз
    const r = Math.hypot(dx, dz);
    if (type === 'down') {
      this._radioDrag = null;
      if (this.action) return 'busy';
      if (r > k.grab) {
        if (this.clock - (this._radioHintT ?? -1e9) >= RADIO.missHintGap) {
          this._radioHintT = this.clock;
          this.setHint('Возьмись за ручку настройки — она справа внизу', 2);
        }
        return 'miss';
      }
      this._radioDrag = { a: Math.atan2(dz, dx), turned: 0, hold: false };
      if (this.radio.broken && this.setHold('radio', true)) this._radioDrag.hold = true;
      return 'grab';
    }
    const d = this._radioDrag;
    if (type !== 'move' || !d) return 'idle';
    if (r < k.minR) return 'turn'; // в самом центре угол не определён
    const a = Math.atan2(dz, dx);
    let da = a - d.a;
    da -= TAU * Math.round(da / TAU);
    d.a = a;
    if (Math.abs(da) > RADIO.maxTurnStep) return 'jump';
    if (this._setRadioFreq(turnKnob(this.radio.freq, da), false)) d.turned += Math.abs(da);
    return 'turn';
  },

  // Отпустил ручку (или ушёл, потерял фокус): ремонт ставится на паузу, новая частота запоминается.
  _radioRelease() {
    const d = this._radioDrag;
    if (!d) return;
    this._radioDrag = null;
    if (d.hold) this.setHold('radio', false);
    if (d.turned > 0) this._emitRadioTuned();
  },
};
