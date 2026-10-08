// Ноты радиостанций. Мелодии — общественное достояние; аранжировки (гармония, бас, ритм) написаны для игры.
//  · «В лесу родилась ёлочка» — мелодия Л. К. Бекмана (1905). Только мелодия, без слов.
//  · «Jingle Bells» — Дж. Пирпонт (1857).
//  · П. И. Чайковский, «Щелкунчик» (1892): аранжировка по теме «Танца Феи Драже».
//  · «Щедрик» — мелодия в обработке М. Д. Леонтовича (1916).
// Формат дорожки — токены через пробел: «C4», «F#3», «Bb4» — нота; «*3» — длительность в единицах score.unit
// (по умолчанию 1); «C3+E3+G3» — аккорд; «.» — пауза; «x» / «X» — удар (тихий / акцент); «|» — только для глаз.

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** «C4» → 60, «Bb3» → 58; не нота — null. */
export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  return NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

/** 60 → «C4» (диезами). */
export function midiToNote(m) {
  return SHARP[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

/** Транспонировать строку токенов на semis полутонов (паузы и удары не трогает). */
export function shift(line, semis) {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const [body, dur] = tok.split('*');
      if (!/^[A-G]/.test(body)) return tok;
      const notes = body
        .split('+')
        .map((n) => midiToNote(noteToMidi(n) + semis))
        .join('+');
      return dur ? `${notes}*${dur}` : notes;
    })
    .join(' ');
}

/** Разобрать дорожку: { events: [{ at, dur, notes: [midi], hit }], length } в единицах score.unit. */
export function parseLine(line) {
  const events = [];
  let at = 0;
  for (const tok of line.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [body, durS] = tok.split('*');
    const dur = durS ? Number(durS) : 1;
    if (!(dur > 0)) throw new Error(`Плохая длительность: ${tok}`);
    if (body === '.') {
      at += dur;
      continue;
    }
    if (body === 'x' || body === 'X') {
      events.push({ at, dur, notes: [], hit: body === 'X' ? 1 : 0.6 });
      at += dur;
      continue;
    }
    const notes = body.split('+').map(noteToMidi);
    if (notes.some((n) => n == null)) throw new Error(`Плохая нота: ${tok}`);
    events.push({ at, dur, notes, hit: 1 });
    at += dur;
  }
  return { events, length: at };
}

/**
 * Собрать партитуру в общий список событий для планировщика.
 * @returns {{unitSec:number, length:number, loopSec:number, bars:number, lengths:number[], events:object[]}}
 */
export function compileScore(score) {
  const unitSec = (60 / score.bpm) * score.unit;
  const lengths = [];
  const events = [];
  for (const tr of score.tracks) {
    const p = parseLine(Array.isArray(tr.notes) ? tr.notes.join(' ') : tr.notes);
    lengths.push(p.length);
    for (const e of p.events) events.push({ at: e.at, dur: e.dur, notes: e.notes, inst: tr.inst, vel: (tr.vol ?? 1) * e.hit });
  }
  events.sort((a, b) => a.at - b.at);
  const length = Math.max(0, ...lengths);
  return { unitSec, length, loopSec: length * unitSec, bars: (length * score.unit) / score.beats, lengths, events };
}

const rep = (s, n) => Array(n).fill(s).join(' ');
const perBeat = (chords, map) => chords.map((c) => map[c]).join(' ');
// Подряд идущие одинаковые аккорды — одной длинной нотой (педаль струнных).
function held(chords, voicing, per) {
  const out = [];
  for (let i = 0; i < chords.length; ) {
    let j = i;
    while (j < chords.length && chords[j] === chords[i]) j++;
    out.push(`${voicing[chords[i]]}*${(j - i) * per}`);
    i = j;
  }
  return out.join(' ');
}

// ---------- «Ёлка FM»: «В лесу родилась ёлочка», музыкальная шкатулка. До мажор, 2/4, единица — восьмая ----------
const Y_VERSE = [
  'G4 E5 E5 D5 E5 C5 G4 G4 G4*2', // фраза 1
  'G4 E5 E5 F5 D5 G5 G5*4', // фраза 2
  'G5 A5 A5 F5 F5 E5 D5 C5*3', // фраза 3
  'G4 E5 E5 D5 E5 C5*5', // фраза 4
].join(' ');
const Y_HARM = 'C C C C G C C G G G7 C F F G7 C C G7 C C C'.split(' '); // по долям
const Y_OOM = { C: 'C3 E4+G4', G: 'G2 B3+D4', G7: 'G2 B3+F4', F: 'F2 A3+C4' };
const Y_ARP = { C: 'C4 G4', G: 'G3 D4', G7: 'G3 F4', F: 'F3 C4' };

// ---------- «Ретро 102»: «Jingle Bells», эстрада. Пишется в до мажоре, звучит в фа (+5); 4/4, единица — восьмая ----------
const JB_CHORUS = [
  'E4*2 E4*2 E4*4', 'E4*2 E4*2 E4*4', 'E4*2 G4*2 C4*3 D4', 'E4*8',
  'F4*2 F4*2 F4*3 F4', 'F4*2 E4*2 E4*2 E4 E4', 'E4*2 D4*2 D4*2 E4*2', 'D4*4 G4*4',
  'E4*2 E4*2 E4*4', 'E4*2 E4*2 E4*4', 'E4*2 G4*2 C4*3 D4', 'E4*8',
  'F4*2 F4*2 F4*3 F4', 'F4*2 E4*2 E4*2 E4 E4', 'G4*2 G4*2 F4*2 D4*2', 'C4*8',
].join(' ');
const JB_VERSE = [
  'G3*2 E4*2 D4*2 C4*2', 'G3*6 G3 G3', 'G3*2 E4*2 D4*2 C4*2', 'A3*8',
  'A3*2 F4*2 E4*2 D4*2', 'B3*8', 'G4*2 G4*2 F4*2 D4*2', 'E4*8',
  'G3*2 E4*2 D4*2 C4*2', 'G3*8', 'G3*2 E4*2 D4*2 C4*2', 'A3*6 A3*2',
  'A3*2 F4*2 E4*2 D4*2', 'G4*2 G4*2 G4*2 G4*2', 'A4*2 G4*2 F4*2 D4*2', 'C4*6 .*2',
].join(' ');
const JB_HARM = 'C C C C F C D7 G7 C C C C F C G7 C  C C C F F G7 G7 C C C C F F G7 G7 C'.split(/\s+/); // по тактам
const JB_BASS = { C: 'C2*2 G2*2 C2*2 G2*2', F: 'F2*2 C3*2 F2*2 C3*2', G7: 'G2*2 D2*2 G2*2 D2*2', D7: 'D2*2 A2*2 D2*2 A2*2' };
const JB_COMP = { C: 'E3+G3+C4', F: 'F3+A3+C4', G7: 'F3+B3+D4', D7: 'F#3+A3+C4' };

// ---------- «Классика у камина»: Чайковский, тема Феи Драже. Ми минор, 2/4, единица — восьмая ----------
const SP_A = ['B4 G4 B4 A#4', 'F#4 G4 E4*2', 'B4 G4 B4 A#4', 'F#4 G4 E4*2', 'E5 C5 E5 D#5', 'B4 C5 A4*2', 'C5 B4 A4 F#4', 'G4 F#4 E4*2'].join(' ');
const SP_B = ['D5 B4 D5 C#5', 'A4 B4 G4*2', 'D5 B4 D5 C#5', 'A4 B4 G4*2', 'B4 G4 B4 A#4', 'F#4 G4 E4*2', 'C5 B4 A4 F#4', 'E4*4'].join(' ');
const SP_HA = 'Em Em B7 Em Em Em B7 Em Am Am E7 Am Am B7 Em Em'.split(' ');
const SP_HB = 'G G D7 G G G D7 G Em Em B7 Em Am B7 Em Em'.split(' ');
const SP_HARM = [...Array(8).fill('Em'), ...SP_HA, ...SP_HA, ...SP_HB, 'Em', 'Em', 'B7', 'Em', 'Em', 'Em', 'Em', 'Em']; // по долям
const SP_PIZZ = { Em: 'E3 .', B7: 'B2 .', Am: 'A2 .', E7: 'E3 .', G: 'G2 .', D7: 'D3 .' };
const SP_PAD = { Em: 'E3+G3+B3', B7: 'D#3+A3+B3', Am: 'E3+A3+C4', E7: 'E3+G#3+D4', G: 'D3+G3+B3', D7: 'D3+F#3+C4' };

// ---------- «Снежная волна»: «Щедрик», восьмибитная приставка. Соль минор, 3/4, единица — восьмая ----------
const SH_M = 'Bb4*2 A4 Bb4 G4*2';
const SH_UP = 'D5*2 C5 D5 Bb4*2';
const SH_ROOTS = ['G2', 'F2', 'Eb2', 'D2'];
const SH_ARP = { G2: 'D5 G5 Bb5 G5 D5 G5', F2: 'C5 F5 A5 F5 C5 F5', Eb2: 'Eb5 G5 Bb5 G5 Eb5 G5', D2: 'D5 F#5 A5 F#5 D5 F#5' };

/** Партитуры станций: bpm — четвертей в минуту, unit — единица длительности в четвертях, beats — четвертей в такте. */
export const SCORES = {
  yolochka: {
    title: '«В лесу родилась ёлочка»',
    author: 'Л. Бекман, 1905 — мелодия',
    bpm: 96,
    unit: 0.5,
    beats: 2,
    tracks: [
      { inst: 'musicbox', vol: 1, notes: ['C5 E5 G5 C6 E6*2 .*2', Y_VERSE, '.*40', 'G5 E5 C5 G4 C5*4'] },
      { inst: 'musicbox', vol: 0.72, notes: ['.*48', shift(Y_VERSE, 12), '.*8'] },
      { inst: 'musicbox', vol: 0.5, notes: ['C3 E4+G4 C3 E4+G4 C3*2 .*2', perBeat(Y_HARM, Y_OOM), perBeat(Y_HARM, Y_ARP), 'C3 E4+G4 C3 E4+G4 C3*4'] },
    ],
  },
  jingleBells: {
    title: '«Jingle Bells»',
    author: 'Дж. Пирпонт, 1857',
    bpm: 116,
    unit: 0.5,
    beats: 4,
    tracks: [
      { inst: 'epiano', vol: 1, notes: shift(`${JB_CHORUS} ${JB_VERSE}`, 5) },
      { inst: 'epiano', vol: 0.42, notes: shift(JB_HARM.map((c) => `.*2 ${JB_COMP[c]}*2 .*2 ${JB_COMP[c]}*2`).join(' '), 5) },
      { inst: 'bass', vol: 1, notes: shift(JB_HARM.map((c) => JB_BASS[c]).join(' '), 5) },
      { inst: 'brush', vol: 1, notes: rep('x*2 X*2 x*2 X*2', 32) },
      { inst: 'bells', vol: 1, notes: [rep('X*2 x*2 X*2 x*2', 16), rep('.*8', 16)] },
    ],
  },
  sugarPlum: {
    title: '«Щелкунчик»: Танец Феи Драже',
    author: 'П. И. Чайковский, 1892',
    bpm: 76,
    unit: 0.5,
    beats: 2,
    tracks: [
      { inst: 'celesta', vol: 1, notes: ['.*16', SP_A, shift(SP_A, 12), SP_B, 'B5 G5 B5 A#5 F#5 G5 E5*2 .*8'] },
      { inst: 'strings', vol: 0.8, notes: ['.*48', SP_A, shift(SP_B, -12), '.*16'] },
      { inst: 'pad', vol: 1, notes: held(SP_HARM, SP_PAD, 2) },
      { inst: 'pizz', vol: 0.9, notes: perBeat(SP_HARM, SP_PIZZ) },
    ],
  },
  shchedryk: {
    title: '«Щедрик»',
    author: 'М. Леонтович, 1916 — обработка народной мелодии',
    bpm: 150,
    unit: 0.5,
    beats: 3,
    tracks: [
      { inst: 'pulse', vol: 1, notes: [rep(SH_M, 8), rep(SH_UP, 8), rep(SH_M, 8)] },
      { inst: 'tri', vol: 1, notes: rep(SH_ROOTS.map((r) => `${r}*2 ${r}*2 ${r}*2`).join(' '), 6) },
      { inst: 'pulse', vol: 0.5, notes: ['.*48', rep('G5*6 F5*6 Eb5*6 D5*6', 2), '.*48'] },
      { inst: 'pulse12', vol: 0.6, notes: ['.*96', rep(SH_ROOTS.map((r) => SH_ARP[r]).join(' '), 2)] },
      { inst: 'chiphat', vol: 1, notes: ['.*48', rep('. x . x . x', 16)] },
    ],
  },
};
