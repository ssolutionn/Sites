// Радио: ручка настройки, сила сигнала, станции, поломка и ремонт ручкой, ноты станций.
// Дизайн: design/gdd/interaction-spec.md §3.8; данные — src/campaign/radio-data.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KitchenSession } from '../src/campaign/session.js';
import { RADIO, RADIO_STATIONS } from '../src/campaign/radio-data.js';
import { clampFreq, turnKnob, knobAngle, signalAt, nearestStation, seekStation, radioMix, formatFreq } from '../src/campaign/st-radio.js';
import { SCORES, compileScore, noteToMidi, parseLine, shift } from '../src/audio/radio-scores.js';
import { RadioMusic } from '../src/audio/radio-music.js';
import { arrive, run } from './helpers-campaign.js';

const TAU = Math.PI * 2;
const K = RADIO.knob;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
// Точка на окружности вокруг ручки в координатах панели (x вправо, z вниз); угол растёт по часовой.
const onKnob = (a, r = 0.04) => [K.x + Math.cos(a) * r, -K.y + Math.sin(a) * r];
function turn(s, from, to, steps = 36) {
  s.pointer('down', ...onKnob(from));
  for (let i = 1; i <= steps; i++) s.pointer('move', ...onKnob(from + ((to - from) * i) / steps));
  return s.pointer('up', ...onKnob(to));
}
function atRadio() {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  arrive(s, 'radio');
  return s;
}

test('ручка: оборот по часовой — +6 МГц, против — вниз, края шкалы держат частоту', () => {
  assert.ok(near(turnKnob(90, TAU), 90 + RADIO.mhzPerTurn));
  assert.ok(near(turnKnob(96, -TAU / 2), 96 - RADIO.mhzPerTurn / 2));
  assert.equal(turnKnob(107, TAU), RADIO.max);
  assert.equal(turnKnob(89, -TAU), RADIO.min);
  assert.equal(clampFreq(NaN), RADIO.startFreq);
  assert.ok(near(knobAngle(RADIO.min + RADIO.mhzPerTurn), TAU));
  assert.equal(formatFreq(102.4), '102,4 МГц');
});

test('сигнал: полный в ±0,15 МГц, нет от ±0,6, между — плавный спад', () => {
  assert.equal(signalAt(100, 100), 1);
  assert.equal(signalAt(100 + RADIO.full, 100), 1);
  assert.equal(signalAt(100 - RADIO.zero, 100), 0);
  assert.equal(signalAt(101.5, 100), 0);
  assert.ok(near(signalAt(100 + (RADIO.full + RADIO.zero) / 2, 100), 0.5));
  let prev = 1;
  for (let d = RADIO.full; d <= RADIO.zero; d += 0.01) {
    const v = signalAt(100 + d, 100);
    assert.ok(v <= prev + 1e-12, `спад монотонный на ${d}`);
    prev = v;
  }
});

test('станции: ближайшая, поиск ◀ ▶ по кругу, станции не перекрываются', () => {
  const sorted = [...RADIO_STATIONS].sort((a, b) => a.freq - b.freq);
  assert.equal(nearestStation(102.3).station.id, 'retro');
  assert.equal(nearestStation(102.3).signal, 1);
  assert.equal(seekStation(RADIO.min, 1).id, sorted[0].id);
  assert.equal(seekStation(RADIO.max, 1).id, sorted[0].id, 'за правым краем — снова первая');
  assert.equal(seekStation(sorted[0].freq, -1).id, sorted.at(-1).id);
  assert.equal(seekStation(sorted[1].freq, -1).id, sorted[0].id);
  for (let i = 0; i < sorted.length; i++) {
    const st = sorted[i];
    assert.ok(st.freq > RADIO.min && st.freq < RADIO.max, `${st.name} на шкале`);
    if (i) assert.ok(st.freq - sorted[i - 1].freq > 2 * RADIO.zero, `${st.name} не перекрывает соседку`);
  }
});

test('звук: на станции музыка, между станциями шум, выключено — тишина, сломано — без музыки', () => {
  const tuned = radioMix({ freq: 102.4 });
  assert.ok(near(tuned.music, 1) && near(tuned.noise, 0));
  const between = radioMix({ freq: 99.5 });
  assert.equal(between.music, 0);
  assert.ok(near(between.noise, 1));
  const edge = radioMix({ freq: 102.4 + 0.35 });
  assert.ok(edge.music > 0 && edge.noise > 0, 'на краю станции — смесь');
  assert.deepEqual([radioMix({ freq: 102.4, enabled: false }).music, radioMix({ freq: 102.4, enabled: false }).noise], [0, 0]);
  const broken = radioMix({ freq: 102.4, broken: true, near: true });
  assert.equal(broken.music, 0);
  assert.equal(broken.noise, 1, 'у сломанного радио — только треск');
  assert.equal(radioMix({ freq: 102.4, broken: true, near: false }).noise, 0, 'вдали сломанное радио молчит');
  const fixing = radioMix({ freq: 102.4, broken: true, near: true, repair: 0.5 });
  assert.ok(fixing.music > 0 && fixing.noise < 1, 'по ходу ремонта треск стихает, музыка проступает');
});

test('сессия: ручку крутят по кругу в крупном плане, мимо ручки и рывком не крутится', () => {
  const s = atRadio();
  const f0 = s.radio.freq;
  assert.equal(f0, RADIO.startFreq);
  assert.equal(s.radioTuning().tuned?.id, 'elka');
  s.drain();
  turn(s, 0, Math.PI); // пол-оборота по часовой
  assert.ok(near(s.radio.freq, f0 + RADIO.mhzPerTurn / 2, 0.01), `частота ${s.radio.freq}`);
  const ev = s.drain().filter((e) => e.type === 'radioTuned');
  assert.equal(ev.length, 1, 'отпустил ручку — частота запомнена одним событием');
  turn(s, Math.PI, 0); // назад
  assert.ok(near(s.radio.freq, f0, 0.01));
  assert.equal(s.pointer('down', K.x - 0.3, 0), 'miss');
  s.pointer('move', K.x - 0.25, 0.05);
  s.pointer('up', 0, 0);
  assert.ok(near(s.radio.freq, f0, 0.01), 'мимо ручки частота не меняется');
  assert.ok(s.hint?.text.includes('ручку'));
  s.pointer('down', ...onKnob(0));
  s.pointer('move', ...onKnob(2.5)); // рывок больше maxTurnStep
  s.pointer('up', ...onKnob(2.5));
  assert.ok(near(s.radio.freq, f0, 0.01), 'рывок через полкруга не считается');
});

test('сессия: колёсико и ◀ ▶ работают только у радио', () => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  assert.equal(s.tuneRadio(0.1), false);
  assert.equal(s.seekRadio(1), false);
  arrive(s, 'radio');
  assert.ok(s.tuneRadio(RADIO.wheelStep));
  assert.ok(near(s.radio.freq, RADIO.startFreq + RADIO.wheelStep));
  assert.ok(s.seekRadio(1));
  assert.equal(s.radioTuning().tuned?.id, 'fireplace');
  assert.ok(s.seekRadio(-1));
  assert.equal(s.radioTuning().tuned?.id, 'elka');
});

test('сломанное радио: только треск, ремонт — удержанием ручки, частота не теряется', () => {
  const s = atRadio();
  s.seekRadio(1);
  s.seekRadio(1);
  const f = s.radio.freq;
  assert.ok(s.breakRadio());
  let tu = s.radioTuning();
  assert.equal(tu.music, 0, 'сломано — музыки нет');
  assert.ok(tu.noise > 0.9, 'у радио — треск');
  assert.equal(tu.tuned, null);
  s.pointer('down', ...onKnob(-Math.PI / 2, 0.01)); // зажала ручку
  assert.equal(s.holds.radio, true);
  run(s, 1);
  tu = s.radioTuning();
  assert.ok(tu.music > 0 && tu.noise < 1, 'по ходу ремонта музыка проступает');
  s.pointer('up', ...onKnob(-Math.PI / 2, 0.01));
  assert.equal(s.holds.radio, false, 'отпустила — ремонт на паузе');
  assert.ok(s.radio.broken);
  s.pointer('down', ...onKnob(0, 0.01));
  run(s, 1.2);
  assert.equal(s.radio.broken, false);
  assert.equal(s.radio.repairs, 1);
  s.pointer('up', ...onKnob(0, 0.01));
  assert.ok(near(s.radio.freq, f, 1e-3), 'частота пережила поломку и ремонт');
  assert.equal(s.radioTuning().tuned?.id, 'retro');
});

test('частота живёт в состоянии дня: уход, выключение и возвращение её не сбрасывают', () => {
  const s = atRadio();
  s.seekRadio(-1); // по кругу — к последней станции
  const f = s.radio.freq;
  assert.equal(s.radioTuning().tuned?.id, 'snow');
  assert.ok(s.toggleRadio());
  assert.equal(s.radioTuning().music, 0);
  arrive(s, 'board');
  assert.equal(s.radioTuning().near, false);
  arrive(s, 'radio');
  assert.ok(s.toggleRadio());
  assert.equal(s.radio.freq, f);
  assert.equal(s.radioTuning().tuned?.id, 'snow');
  assert.ok(s.radioTuning().music > 0.99);
});

test('ноты: у каждой станции своя партитура, дорожки одной длины, петля 16–32 такта', () => {
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('Bb3'), 58);
  assert.equal(noteToMidi('F#5'), 78);
  assert.equal(shift('C4+E4*2 . x', 12), 'C5+E5*2 . x');
  assert.equal(parseLine('C4*2 . E4').length, 4);
  const used = new Set();
  const leads = new Set(RADIO_STATIONS.map((st) => SCORES[st.score]?.tracks[0].inst));
  assert.equal(leads.size, RADIO_STATIONS.length, 'у каждой станции свой ведущий тембр');
  for (const st of RADIO_STATIONS) {
    const sc = SCORES[st.score];
    assert.ok(sc, `партитура ${st.score}`);
    assert.ok(!used.has(st.score), 'у каждой станции своя мелодия');
    used.add(st.score);
    const c = compileScore(sc);
    assert.ok(c.lengths.every((l) => l === c.length), `${st.score}: дорожки ${c.lengths.join('/')}`);
    assert.ok(c.bars >= 16 && c.bars <= 32, `${st.score}: ${c.bars} тактов`);
    assert.ok(c.loopSec >= 15 && c.loopSec <= 90, `${st.score}: петля ${c.loopSec.toFixed(1)} с`);
    for (const e of c.events) for (const n of e.notes) assert.ok(n >= 26 && n <= 98, `${st.score}: нота ${n} в слышимом диапазоне`);
  }
});

test('музыка без AudioContext молчит и не падает', () => {
  const m = new RadioMusic({ ctx: null, muted: false });
  const s = new KitchenSession({ dayIndex: 0, seed: 1 });
  m.sync(s.radioTuning());
  assert.equal(m.playing, false);
  m.sync(null);
  m.stop();
  assert.equal(m.playing, false);
  const muted = new RadioMusic({ ctx: { state: 'running' }, muted: true });
  muted.sync(s.radioTuning());
  assert.equal(muted.playing, false, 'выключенный звук — радио не строит граф');
});
