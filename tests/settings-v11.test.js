// 0.11, «Настройки для Steam»: громкость по шинам, мягкие жесты, размер текста, клавиши, сохранение настроек.
// Чистые модули: settings.js, keymap.js, campaign/assist.js, settings-controller.js, шины Sound (на подделке AudioContext).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from '../src/campaign/data.js';
import { emptySave, parseSave, SaveStore, SAVE_KEY } from '../src/campaign/save.js';
import { TEXT_SCALES, defaultSettings, normalizeSettings, normalizeVolume, volumeGain, snapTextScale, scalePercent, pickPreferences, effectiveReduceMotion } from '../src/settings.js';
import { ACTIONS, ACTION_ORDER, Keymap, normalizeKeys, checkCode, keyName, explainBind } from '../src/keymap.js';
import { SettingsController } from '../src/settings-controller.js';
import { assistConfig, soften, clampAssistK, ASSIST_RULES } from '../src/campaign/assist.js';
import { Stroke, classifyCut, CUT_RULES, ShakeTracker } from '../src/campaign/gestures.js';
import { Stirrer, Grater, Scrubber, Waver } from '../src/campaign/mechanics.js';
import { KitchenSession, arrive, waitAction } from './helpers-campaign.js';
import { BOARD_UNIT } from '../src/campaign/st-board.js';
import { CLAYOUT } from '../src/campaign/layout.js';
import { Sound } from '../src/audio/sound.js';
import { FullscreenControl } from '../src/fullscreen.js';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

// ======================= настройки: значения и сохранение =======================

test('настройки нового игрока: громкость 100 %, мягкие жесты выключены, текст 100 %, клавиши по умолчанию', () => {
  const d = defaultSettings();
  assert.deepEqual(d.volume, { master: 1, sfx: 1, music: 1 });
  assert.equal(d.assist, false);
  assert.equal(d.textScale, 1);
  assert.equal(d.quality, 'high');
  assert.equal(d.reduceMotion, null, 'null — как в системе');
  assert.deepEqual(d.keys, {});
  assert.deepEqual(emptySave().settings, d, 'пустое сохранение несёт те же настройки');
});

test('громкость: из любого мусора получается число 0..1, в целых процентах', () => {
  assert.equal(normalizeVolume(0.5), 0.5);
  assert.equal(normalizeVolume(0.123456), 0.12);
  assert.equal(normalizeVolume(-3), 0);
  assert.equal(normalizeVolume(7), 1);
  assert.equal(normalizeVolume(NaN), 1);
  assert.equal(normalizeVolume('0.5'), 1, 'строка — не число: запасное значение');
  assert.equal(normalizeVolume(null, 0.4), 0.4);
});

test('усиление: 0 — тишина, 1 — прежний уровень игры, между — плавная возрастающая кривая', () => {
  assert.equal(volumeGain(0), 0);
  assert.equal(volumeGain(1), 1);
  assert.equal(volumeGain(5), 1, 'выше 1 не бывает');
  assert.equal(volumeGain(NaN), 1);
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const g = volumeGain(i / 20);
    assert.ok(g > prev || i === 0, 'растёт');
    prev = g;
  }
  assert.ok(volumeGain(0.5) < 0.5, 'середина ползунка заметно тише середины');
});

test('размер текста: только 100 / 115 / 130 %, любое другое число прилипает к ближайшему', () => {
  assert.deepEqual(TEXT_SCALES, [1, 1.15, 1.3]);
  for (const s of TEXT_SCALES) assert.equal(snapTextScale(s), s);
  assert.equal(snapTextScale(1.2), 1.15);
  assert.equal(snapTextScale(1.26), 1.3);
  assert.equal(snapTextScale(5), 1.3);
  assert.equal(snapTextScale(0.2), 1);
  assert.equal(snapTextScale('1.3'), 1, 'не число — 100 %');
  assert.equal(snapTextScale(undefined), 1);
  assert.deepEqual(TEXT_SCALES.map(scalePercent), [100, 115, 130]);
});

test('нормализация настроек: старое сохранение без новых полей читается, чужие поля сохраняются', () => {
  const n = normalizeSettings({ quality: 'low', radioFreq: 101.5, inProgress: 'd2', stream: { on: false } });
  assert.equal(n.quality, 'low');
  assert.equal(n.radioFreq, 101.5);
  assert.equal(n.inProgress, 'd2');
  assert.deepEqual(n.stream, { on: false });
  assert.deepEqual(n.volume, { master: 1, sfx: 1, music: 1 });
  assert.equal(n.assist, false);
  assert.equal(n.textScale, 1);
  assert.deepEqual(n.keys, {});
});

test('нормализация настроек: испорченные значения заменяются разумными', () => {
  for (const bad of [null, undefined, 5, 'строка', [], [1, 2]]) {
    const n = normalizeSettings(bad);
    assert.deepEqual({ ...n }, { ...defaultSettings() }, `для ${JSON.stringify(bad)} — настройки по умолчанию`);
  }
  const n = normalizeSettings({ quality: 'ultra', volume: { master: 'тихо', sfx: -1, music: 9 }, assist: 'yes', textScale: 1.4, reduceMotion: 'да', fullscreen: 1, keys: 'w' });
  assert.equal(n.quality, 'high');
  assert.deepEqual(n.volume, { master: 1, sfx: 0, music: 1 });
  assert.equal(n.assist, false, 'только настоящее true');
  assert.equal(n.textScale, 1.3);
  assert.equal(n.reduceMotion, null);
  assert.equal(n.fullscreen, false);
  assert.deepEqual(n.keys, {});
});

test('повторная нормализация ничего не меняет', () => {
  const once = normalizeSettings({ quality: 'low', volume: { master: 0.35, sfx: 0.8, music: 0 }, assist: true, textScale: 1.15, reduceMotion: true, fullscreen: true, keys: { up: 'KeyI', interact: 'KeyE' } });
  assert.deepEqual(normalizeSettings(once), once);
  assert.deepEqual(once.volume, { master: 0.35, sfx: 0.8, music: 0 });
  assert.deepEqual(once.keys, { up: 'KeyI', interact: 'KeyE' });
});

test('«меньше движения»: выбор игрока главнее системной настройки; нет выбора — как в системе', () => {
  assert.equal(effectiveReduceMotion({ reduceMotion: null }, true), true);
  assert.equal(effectiveReduceMotion({ reduceMotion: null }, false), false);
  assert.equal(effectiveReduceMotion({ reduceMotion: false }, true), false);
  assert.equal(effectiveReduceMotion({ reduceMotion: true }, false), true);
});

test('parseSave: сохранение версии 1 без настроек читается; новые поля дописываются; прогресс на месте', () => {
  const old = emptySave();
  old.days[0].completed = true;
  old.bonus = 40;
  old.settings = { quality: 'low', radioFreq: 99.1 }; // как было в 0.10
  const { save, status } = parseSave(JSON.stringify(old));
  assert.equal(status, 'ok');
  assert.equal(save.settings.quality, 'low');
  assert.equal(save.settings.radioFreq, 99.1);
  assert.deepEqual(save.settings.volume, { master: 1, sfx: 1, music: 1 });
  assert.equal(save.settings.assist, false);
  assert.equal(save.days[0].completed, true);
  assert.equal(save.bonus, 40);
  const bare = JSON.parse(JSON.stringify(old));
  delete bare.settings;
  assert.deepEqual(parseSave(bare).save.settings, defaultSettings(), 'совсем без settings — по умолчанию');
});

test('parseSave: настройки переживают запись и чтение, мусор в них не роняет загрузку', () => {
  const s = emptySave();
  s.settings = { ...s.settings, volume: { master: 0.4, sfx: 0.7, music: 0.2 }, assist: true, textScale: 1.3, keys: { up: 'KeyI' }, reduceMotion: true, fullscreen: true };
  const back = parseSave(JSON.stringify(s)).save.settings;
  assert.deepEqual(back.volume, { master: 0.4, sfx: 0.7, music: 0.2 });
  assert.equal(back.assist, true);
  assert.equal(back.textScale, 1.3);
  assert.deepEqual(back.keys, { up: 'KeyI' });
  assert.equal(back.reduceMotion, true);
  assert.equal(back.fullscreen, true);
  const broken = JSON.parse(JSON.stringify(s));
  broken.settings = { volume: 'громко', textScale: 'огромный', keys: { up: 5, nope: 'KeyZ' }, assist: [] };
  const r = parseSave(broken);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.save.settings, defaultSettings());
});

test('«Новая кампания» не стирает настройки, но сбрасывает прогресс и «день идёт»', () => {
  const mem = new Map();
  const store = new SaveStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) });
  store.data.settings.volume = { master: 0.3, sfx: 1, music: 0.5 };
  store.data.settings.assist = true;
  store.data.settings.keys = { up: 'KeyI' };
  store.data.settings.textScale = 1.15;
  store.data.settings.inProgress = 'd3';
  store.data.settings.radioFreq = 104.2;
  store.data.days[0].completed = true;
  store.write();
  store.reset();
  assert.equal(store.hasProgress, false);
  assert.deepEqual(store.data.settings.volume, { master: 0.3, sfx: 1, music: 0.5 });
  assert.equal(store.data.settings.assist, true);
  assert.deepEqual(store.data.settings.keys, { up: 'KeyI' });
  assert.equal(store.data.settings.textScale, 1.15);
  assert.equal(store.data.settings.inProgress, undefined);
  assert.equal(store.data.settings.radioFreq, undefined);
  assert.deepEqual(JSON.parse(mem.get(SAVE_KEY)).settings.volume, { master: 0.3, sfx: 1, music: 0.5 }, 'и на диске тоже');
  assert.deepEqual(Object.keys(pickPreferences(store.data.settings)).sort(), ['assist', 'fullscreen', 'ghostHints', 'ghostSeen', 'keys', 'quality', 'reduceMotion', 'textScale', 'volume']);
});

// ======================= клавиши =======================

test('клавиши по умолчанию: WASD и стрелки, пробел, R, Q, F, Esc, M, F11, P (пауза чата)', () => {
  const k = new Keymap();
  const want = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', Space: 'interact', KeyR: 'rotate', KeyQ: 'recipe', KeyF: 'shout', Escape: 'pause', KeyM: 'mute', F11: 'fullscreen', KeyP: 'pauseChat' };
  for (const [code, action] of Object.entries(want)) assert.equal(k.actionOf(code), action, code);
  assert.equal(k.actionOf('KeyZ'), null);
  assert.equal(k.get('shout'), 'KeyF', 'действие «крикнуть» объявлено заранее, обработчик — в блоке про кота');
  assert.deepEqual(ACTION_ORDER.slice().sort(), Object.keys(want).map((c) => want[c]).filter((v, i, a) => a.indexOf(v) === i).sort());
  assert.deepEqual(k.codes('up'), ['KeyW', 'ArrowUp']);
  assert.equal(k.isPrimary('up', 'KeyW'), true);
  assert.equal(k.isPrimary('up', 'ArrowUp'), false, 'стрелка — запасная, не основная');
  assert.deepEqual(k.toJSON(), {});
});

test('переназначение: новая клавиша работает, старая освобождается, запасные стрелки остаются', () => {
  const k = new Keymap();
  assert.deepEqual(k.bind('up', 'KeyI'), { ok: true });
  assert.equal(k.actionOf('KeyI'), 'up');
  assert.equal(k.actionOf('KeyW'), null);
  assert.equal(k.actionOf('ArrowUp'), 'up');
  assert.deepEqual(k.toJSON(), { up: 'KeyI' });
  assert.deepEqual(k.bind('interact', 'KeyW'), { ok: true }, 'освобождённая W свободна для другого действия');
  assert.equal(k.actionOf('KeyW'), 'interact');
  assert.equal(k.actionOf('Space'), null);
});

test('конфликт: клавиша другого действия отказывает с понятной фразой и ничего не меняет', () => {
  const k = new Keymap();
  const r = k.bind('up', 'KeyA');
  assert.deepEqual(r, { ok: false, reason: 'conflict', with: 'left' });
  assert.equal(k.get('up'), 'KeyW');
  assert.equal(k.actionOf('KeyA'), 'left');
  const text = explainBind(r, 'KeyA');
  assert.match(text, /A уже занята/);
  assert.match(text, /«Влево»/);
  assert.ok(text.length <= 70, `${text.length} знаков`);
  assert.doesNotMatch(text, /ошибк|неверн/i);
  const arrow = k.bind('mute', 'ArrowLeft'); // запасная клавиша другого действия — тоже занята
  assert.equal(arrow.reason, 'conflict');
  assert.equal(arrow.with, 'left');
});

test('нельзя назначить Esc, Tab, Enter, Shift и F5: они нужны игре и системе', () => {
  const k = new Keymap();
  for (const code of ['Escape', 'Tab', 'Enter', 'ShiftLeft', 'ControlLeft', 'F5', 'F12', 'MetaLeft']) {
    const r = k.bind('mute', code);
    assert.deepEqual(r, { ok: false, reason: 'reserved' }, code);
  }
  assert.ok(explainBind({ ok: false, reason: 'reserved' }, 'Tab').length <= 70);
  assert.equal(k.bind('mute', 'какой-то мусор').reason, 'invalid');
  assert.equal(k.bind('mute', 5).reason, 'invalid');
  assert.equal(k.bind('несуществующее', 'KeyZ').reason, 'unknown');
  assert.ok(explainBind({ ok: false, reason: 'invalid' }).length <= 70);
  assert.equal(k.get('mute'), 'KeyM');
});

test('пауза: Esc закреплён за ней всегда, даже если основную клавишу поменяли', () => {
  const k = new Keymap();
  assert.deepEqual(k.bind('pause', 'KeyJ'), { ok: true });
  assert.equal(k.actionOf('KeyJ'), 'pause');
  assert.equal(k.actionOf('Escape'), 'pause', '«назад» не пропадает');
  assert.deepEqual(k.codes('pause'), ['KeyJ', 'Escape']);
  assert.deepEqual(k.bind('pause', 'Escape'), { ok: true }, 'вернуть Esc можно');
  assert.deepEqual(k.toJSON(), {});
});

test('сброс: одно действие и всё сразу; сброс уступает, если клавишу заняли', () => {
  const k = new Keymap();
  k.bind('up', 'KeyI');
  k.bind('interact', 'KeyW');
  assert.equal(k.reset('up').reason, 'conflict', 'W уже у «Действия рядом»');
  k.reset('interact');
  assert.deepEqual(k.reset('up'), { ok: true });
  assert.deepEqual(k.toJSON(), {});
  k.bind('left', 'KeyJ');
  k.bind('mute', 'KeyN');
  k.resetAll();
  assert.deepEqual(k.toJSON(), {});
  assert.equal(k.actionOf('KeyA'), 'left');
  assert.equal(k.actionOf('KeyM'), 'mute');
});

test('поменять две клавиши местами можно через свободную; сохранённый обмен читается', () => {
  const k = new Keymap();
  assert.equal(k.bind('left', 'KeyD').reason, 'conflict');
  k.bind('left', 'KeyJ');
  k.bind('right', 'KeyA');
  assert.deepEqual(k.bind('left', 'KeyD'), { ok: true });
  assert.deepEqual(k.toJSON(), { left: 'KeyD', right: 'KeyA' });
  const again = new Keymap(k.toJSON());
  assert.equal(again.actionOf('KeyD'), 'left');
  assert.equal(again.actionOf('KeyA'), 'right');
});

test('сохранённые клавиши проверяются: мусор, неизвестные действия и двойные назначения отбрасываются', () => {
  assert.deepEqual(normalizeKeys(null), {});
  assert.deepEqual(normalizeKeys('KeyW'), {});
  assert.deepEqual(normalizeKeys({ up: 7, nope: 'KeyZ', mute: 'Tab', recipe: 'Escape', rotate: 'KeyR' }), {}, 'и клавиша по умолчанию не хранится');
  // две записи на одну клавишу: уступает та, что позже в порядке действий
  assert.deepEqual(normalizeKeys({ up: 'KeyI', interact: 'KeyI' }), { up: 'KeyI' });
  // новая клавиша занята клавишей другого действия по умолчанию
  assert.deepEqual(normalizeKeys({ interact: 'KeyW' }), {});
  assert.deepEqual(normalizeKeys({ recipe: 'ArrowUp' }), {}, 'запасные стрелки тоже заняты');
  const k = new Keymap({ up: 'KeyI', junk: 1 });
  assert.equal(k.actionOf('KeyI'), 'up');
});

test('имена клавиш для подписей', () => {
  assert.equal(keyName('KeyW'), 'W');
  assert.equal(keyName('Space'), 'Пробел');
  assert.equal(keyName('Escape'), 'Esc');
  assert.equal(keyName('ArrowLeft'), '←');
  assert.equal(keyName('Digit5'), '5');
  assert.equal(keyName('F11'), 'F11');
  assert.equal(keyName('Numpad1'), 'Num 1');
  assert.equal(keyName('BracketLeft'), '[');
  assert.equal(checkCode('Space').ok, true);
  const rows = new Keymap({ up: 'KeyI' }).list();
  assert.equal(rows.length, Object.keys(ACTIONS).length);
  const up = rows.find((r) => r.action === 'up');
  assert.deepEqual([up.name, up.alts, up.changed], ['I', ['↑'], true]);
  for (const r of rows) assert.ok(r.label && !/[A-Za-z]{4,}/.test(r.label), `подпись по-русски: ${r.label}`);
});

// ======================= контроллер настроек =======================

function fakeSound() {
  const calls = [];
  return { calls, muted: false, setVolumes: (v) => calls.push(['vol', { ...v }]), setMuted(m) { this.muted = m; calls.push(['mute', m]); }, preview: (b) => calls.push(['preview', b]) };
}
function makeController({ hooks = {}, persist } = {}) {
  const settings = defaultSettings();
  const sound = fakeSound();
  const saved = [];
  const keymap = new Keymap(settings.keys);
  const c = new SettingsController({ settings: () => settings, persist: persist ?? (() => saved.push(JSON.stringify(settings))), sound, keymap, hooks });
  return { c, settings, sound, saved, keymap };
}

test('контроллер: громкость сохраняется, доходит до звука и может проиграть пример', () => {
  const { c, settings, sound, saved } = makeController();
  assert.equal(c.setVolume('music', 0.3), 0.3);
  assert.deepEqual(settings.volume, { master: 1, sfx: 1, music: 0.3 });
  assert.deepEqual(sound.calls.at(-1), ['vol', { master: 1, sfx: 1, music: 0.3 }]);
  assert.equal(saved.length, 1);
  c.setVolume('sfx', 0.456, { preview: true });
  assert.equal(settings.volume.sfx, 0.46);
  assert.deepEqual(sound.calls.at(-1), ['preview', 'sfx']);
  assert.equal(c.setVolume('нет-такой', 1), false);
  c.setVolume('master', 'тихо');
  assert.equal(settings.volume.master, 1, 'не число — прежнее значение');
});

test('контроллер: мягкие жесты, размер текста, качество и «меньше движения» вызывают применение', () => {
  const seen = [];
  const hooks = { assist: (v) => seen.push(['assist', v]), textScale: (v) => seen.push(['text', v]), quality: (v) => seen.push(['q', v]), motion: (v) => seen.push(['motion', v]) };
  const { c, settings } = makeController({ hooks });
  c.setAssist(true);
  c.setTextScale(1.2);
  c.setQuality('low');
  c.setQuality('bad');
  c.setReduceMotion(true);
  c.setReduceMotion('да');
  assert.deepEqual(seen, [['assist', true], ['text', 1.15], ['q', 'low'], ['motion', true], ['motion', null]]);
  assert.equal(settings.quality, 'low');
  assert.equal(settings.reduceMotion, null);
  c.applyAll();
  assert.deepEqual(seen.slice(-4), [['assist', true], ['text', 1.15], ['q', 'low'], ['motion', null]]);
});

test('контроллер: клавиша сохраняется только при успехе; конфликт ничего не пишет', () => {
  const { c, settings, saved, keymap } = makeController();
  assert.equal(c.bindKey('up', 'KeyA').ok, false);
  assert.equal(saved.length, 0);
  assert.deepEqual(settings.keys, {});
  assert.equal(c.bindKey('up', 'KeyI').ok, true);
  assert.deepEqual(settings.keys, { up: 'KeyI' });
  assert.equal(keymap.actionOf('KeyI'), 'up');
  c.resetKeys();
  assert.deepEqual(settings.keys, {});
  assert.equal(saved.length, 2);
});

test('контроллер: полный экран запоминается, если окно согласилось, и не запоминается при отказе', async () => {
  const asked = [];
  const { c, settings } = makeController({ hooks: { fullscreen: async (on) => (asked.push(on), on) } });
  assert.equal(await c.requestFullscreen(true), true);
  assert.equal(settings.fullscreen, true);
  const denied = makeController({ hooks: { fullscreen: async () => false } });
  assert.equal(await denied.c.requestFullscreen(true), false);
  assert.equal(denied.settings.fullscreen, false, 'браузер не дал — выбор не запоминаем');
  assert.deepEqual(asked, [true]);
});

// ======================= звуковые шины =======================

/** Подделка AudioContext: записывает, что к чему подключено. */
function fakeAudio() {
  const nodes = [];
  const mk = (kind) => {
    const n = { kind, out: [], gain: { value: 1, target: null, setTargetAtTime(v) { this.target = v; }, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } };
    n.connect = (to) => (n.out.push(to), to);
    n.disconnect = () => {};
    nodes.push(n);
    return n;
  };
  class Ctx {
    constructor() { this.destination = mk('destination'); this.currentTime = 0; this.state = 'running'; this.sampleRate = 8000; }
    createGain() { return mk('gain'); }
    createOscillator() { const o = mk('osc'); o.frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} }; o.start = () => {}; o.stop = () => {}; return o; }
    createBuffer(c, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { const o = mk('src'); o.start = () => {}; return o; }
    createBiquadFilter() { const f = mk('filter'); f.frequency = { value: 0 }; f.Q = { value: 0 }; return f; }
    resume() {}
    suspend() {}
  }
  return { Ctx, nodes };
}
const withAudio = (fn) => {
  const { Ctx, nodes } = fakeAudio();
  const had = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = { AudioContext: Ctx };
  try {
    return fn(nodes);
  } finally {
    if (had) Object.defineProperty(globalThis, 'window', had);
    else delete globalThis.window;
  }
};
const gainOf = (n) => (n.gain.target ?? n.gain.value);

test('звук: эффекты и радио идут через свои шины в общую, общая — на выход', () =>
  withAudio(() => {
    const s = new Sound();
    s.muted = false;
    s.unlock();
    assert.ok(s.master && s.sfx && s.music, 'три шины');
    assert.deepEqual(s.sfx.out, [s.master]);
    assert.deepEqual(s.music.out, [s.master]);
    assert.deepEqual(s.master.out, [s.ctx.destination]);
    near(gainOf(s.master), 0.5, 1e-12); // при 100 % — ровно прежний уровень игры (0,5)
    near(gainOf(s.sfx), 1);
    near(gainOf(s.music), 1);
  }));

test('звук: громкости шин независимы, «без звука» глушит общую и возвращает прежнюю', () =>
  withAudio(() => {
    const s = new Sound();
    s.muted = false;
    s.unlock();
    s.setVolumes({ master: 1, sfx: 0.5, music: 0 });
    near(gainOf(s.sfx), volumeGain(0.5));
    near(gainOf(s.music), 0, 1e-12);
    near(gainOf(s.master), 0.5);
    s.setMuted(true);
    near(gainOf(s.master), 0);
    s.setVolumes({ master: 0.6 });
    near(gainOf(s.master), 0, 1e-12);
    near(gainOf(s.sfx), volumeGain(0.5), 1e-12);
    s.setMuted(false);
    near(gainOf(s.master), 0.5 * volumeGain(0.6));
  }));

test('звук: громкость, заданная до первого щелчка игрока, применяется при создании контекста', () =>
  withAudio(() => {
    const s = new Sound();
    s.muted = false;
    s.setVolumes({ master: 0.8, sfx: 0.4, music: 0.2 });
    s.unlock();
    near(gainOf(s.master), 0.5 * volumeGain(0.8));
    near(gainOf(s.sfx), volumeGain(0.4));
    near(gainOf(s.music), volumeGain(0.2));
  }));

test('звук: тон радио подключён к шине музыки, остальные — к шине эффектов', () =>
  withAudio((nodes) => {
    const s = new Sound();
    s.muted = false;
    s.unlock();
    s._tone(440, 0.1, {});
    s._tone(440, 0.1, { radio: true });
    s._noise(0.1, {});
    const gains = nodes.filter((n) => n.kind === 'gain' && n !== s.master && n !== s.sfx && n !== s.music);
    const targets = gains.map((g) => g.out[0]).filter(Boolean);
    assert.equal(targets.filter((t) => t === s.music).length, 1, 'радио — в music');
    assert.ok(targets.filter((t) => t === s.sfx).length >= 1, 'остальное — в sfx');
    assert.equal(targets.filter((t) => t === s.master).length, 0, 'напрямую в общую никто не подключён');
  }));

// ======================= мягкие жесты =======================

const SOFT = assistConfig(CAMPAIGN);
const K = CAMPAIGN.assist.k;

test('мягкий режим: множитель в CAMPAIGN.assist.k = 1,5, пределы 1–2, настройка по умолчанию выключена', () => {
  assert.equal(K, 1.5);
  assert.equal(clampAssistK(1.5), 1.5);
  assert.equal(clampAssistK(0.5), 1);
  assert.equal(clampAssistK(9), 2);
  assert.equal(clampAssistK('x'), 1);
  assert.equal(assistConfig(CAMPAIGN, 1), CAMPAIGN, 'k = 1 — без копирования');
  assert.equal(assistConfig(CAMPAIGN, NaN), CAMPAIGN);
  assert.equal(CAMPAIGN.assist.on, undefined, 'исходные числа не тронуты');
});

test('мягкий режим: каждое правило меняет число в нужную сторону, исходный CAMPAIGN не портится', () => {
  const before = JSON.stringify(CAMPAIGN);
  const soft = assistConfig(CAMPAIGN);
  assert.equal(JSON.stringify(CAMPAIGN), before);
  assert.equal(soft.assist.on, true);
  const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
  for (const [path, op, limit] of ASSIST_RULES) {
    const a = get(CAMPAIGN, path), b = get(soft, path);
    assert.equal(typeof a, 'number', `${path} есть в CAMPAIGN`);
    near(b, soften(a, op, K, limit), 1e-12);
    assert.notEqual(b, a, `${path} изменилось`);
    assert.ok(op === 'mul' ? Math.abs(b) > Math.abs(a) : Math.abs(b) < Math.abs(a), `${path}: ${a} → ${b}`);
  }
  // не относящееся к жестам остаётся тем же объектом
  assert.equal(soft.scoring, CAMPAIGN.scoring);
  assert.equal(soft.stove.heatRate, CAMPAIGN.stove.heatRate);
  assert.equal(soft.cutRules.minLength, CAMPAIGN.cutRules.minLength);
  assert.equal(soft.cat.hungerStart, CAMPAIGN.cat.hungerStart);
});

test('мягкий режим: угол ножа не доходит до 45°, иначе «вдоль» и «поперёк» перекроются', () => {
  const wide = assistConfig(CAMPAIGN, 2);
  assert.ok(wide.cutRules.angleTolerance < 45);
  assert.equal(wide.cutRules.angleTolerance, 44);
});

// Росчерк под углом a (градусов) к оси Z, длиной len, 12 точек.
function tilted(a, len = 4) {
  const s = new Stroke();
  const r = (a * Math.PI) / 180;
  for (let i = 0; i <= 12; i++) s.add(Math.sin(r) * len * (i / 12), Math.cos(r) * len * (i / 12), i * 0.02);
  return s;
}
// Зигзаг: n шагов вдоль Z на длину c, боковой размах a; путь / хорда = sqrt(1 + (a / dz)²).
function zig(ratio, c = 4, n = 40) {
  const s = new Stroke();
  const dz = c / n, a = dz * Math.sqrt(ratio * ratio - 1);
  for (let i = 0; i <= n; i++) s.add(i % 2 ? a : 0, i * dz, i * 0.02);
  return s;
}
const rulesOf = (cfg) => ({ ...CUT_RULES, ...cfg.cutRules });
const EPS_DEG = 1e-6;

test('нож, наклон: эталон и граница проходят, граница + 10 % — «наискосок»; мягко — граница шире в 1,5 раза', () => {
  const normal = rulesOf(CAMPAIGN), soft = rulesOf(SOFT);
  const tol = CAMPAIGN.cutRules.angleTolerance;
  assert.equal(classifyCut(tilted(0), { rules: normal }).ok, true, 'эталон');
  assert.equal(classifyCut(tilted(tol - EPS_DEG), { rules: normal }).ok, true, 'граница');
  const over = classifyCut(tilted(tol * 1.1), { rules: normal });
  assert.deepEqual([over.ok, over.reason], [false, 'diagonal'], 'граница + 10 %');
  // то же движение в мягком режиме
  assert.equal(classifyCut(tilted(tol * 1.1), { rules: soft }).ok, true, 'жест, который был на границе, засчитан');
  assert.equal(classifyCut(tilted(tol * K - EPS_DEG), { rules: soft }).ok, true, 'новая граница');
  const softOver = classifyCut(tilted(tol * K * 1.1), { rules: soft });
  assert.deepEqual([softOver.ok, softOver.reason], [false, 'diagonal'], 'новая граница + 10 % — отказ с той же причиной');
  assert.equal(classifyCut(tilted(0), { rules: soft }).ok, true, 'эталон проходит и мягко');
});

test('нож, дрожь: путь / хорда — эталон, граница, +10 % отказ «wobbly»; мягко шире в 1,5 раза', () => {
  const normal = rulesOf(CAMPAIGN), soft = rulesOf(SOFT);
  const lim = CAMPAIGN.cutRules.maxWobble;
  assert.equal(classifyCut(zig(1.2), { rules: normal }).ok, true, 'эталон');
  assert.equal(classifyCut(zig(lim - 1e-6), { rules: normal }).ok, true, 'граница');
  assert.equal(classifyCut(zig(lim * 1.1), { rules: normal }).reason, 'wobbly', 'граница + 10 %');
  assert.equal(classifyCut(zig(lim * 1.1), { rules: soft }).ok, true, 'мягко: засчитано');
  assert.equal(classifyCut(zig(lim * K - 1e-6), { rules: soft }).ok, true);
  assert.equal(classifyCut(zig(lim * K * 1.1), { rules: soft }).reason, 'wobbly');
});

// Размахи вверх-вниз размером swing с интервалом 0.3 с; сколько щепоток засчитано.
function shakes(cfg, swing, n = 8) {
  const t = new ShakeTracker(cfg.shake);
  let count = 0;
  for (let i = 0; i <= n; i++) if (t.move(i % 2 ? swing : 0, i * 0.3)) count++;
  return count;
}

test('солонка: размах ровно в норму — щепотка; на 10 % короче — нет; мягко норма в 1,5 раза меньше', () => {
  const amp = CAMPAIGN.shake.amplitude;
  assert.ok(shakes(CAMPAIGN, amp * 2) > 0, 'эталон: широкий взмах');
  assert.ok(shakes(CAMPAIGN, amp) > 0, 'граница');
  assert.equal(shakes(CAMPAIGN, amp / 1.1), 0, 'граница + 10 %: короткий взмах');
  assert.ok(shakes(SOFT, amp / 1.1) > 0, 'мягко: тот же короткий взмах засчитан');
  assert.ok(shakes(SOFT, SOFT.shake.amplitude) > 0);
  assert.equal(shakes(SOFT, SOFT.shake.amplitude / 1.1), 0);
  near(SOFT.shake.amplitude, amp / K, 1e-12);
});

// Размахи мыши над котом: swing в долях высоты экрана; true — прогнали.
function waves(cfg, swing) {
  const w = new Waver(cfg.cat.wave);
  for (let i = 0; i < 14; i++) if (w.move(i % 2 ? swing : 0, i * 0.2)) return true;
  return false;
}

test('кот, взмах мышью: размах в норму — прогнали; на 10 % уже — нет; мягко норма в 1,5 раза меньше, радиус попадания больше', () => {
  const amp = CAMPAIGN.cat.wave.minAmp;
  assert.equal(waves(CAMPAIGN, amp * 2), true, 'эталон');
  assert.equal(waves(CAMPAIGN, amp), true, 'граница');
  assert.equal(waves(CAMPAIGN, amp / 1.1), false, 'граница + 10 %');
  assert.equal(waves(SOFT, amp / 1.1), true, 'мягко: засчитано');
  assert.equal(waves(SOFT, SOFT.cat.wave.minAmp / 1.1), false);
  near(SOFT.cat.wave.hitRadius, CAMPAIGN.cat.wave.hitRadius * K, 1e-12);
  assert.equal(SOFT.cat.wave.reversals, CAMPAIGN.cat.wave.reversals, 'число разворотов не меняется');
});

// Круги ложкой радиуса r по step рад: суммарно оборотов.
function stirTurns(cfg, r, step = 0.4, laps = 3) {
  const s = new Stirrer(cfg.mix);
  const n = Math.round((laps * Math.PI * 2) / step);
  for (let i = 0; i <= n; i++) s.move(Math.cos(i * step) * r, Math.sin(i * step) * r);
  return s.turns;
}

test('ложка, радиус круга: внутри допуска мешает, снаружи на 10 % — нет; мягко коридор шире', () => {
  const { minRadius: lo, maxRadius: hi } = CAMPAIGN.mix;
  assert.ok(stirTurns(CAMPAIGN, 0.1) > 2, 'эталон');
  assert.ok(stirTurns(CAMPAIGN, hi * 0.999999) > 2, 'внешняя граница');
  assert.equal(stirTurns(CAMPAIGN, hi * 1.1), 0, 'внешняя граница + 10 %');
  assert.ok(stirTurns(SOFT, hi * 1.1) > 2, 'мягко: большой круг засчитан');
  assert.ok(stirTurns(SOFT, SOFT.mix.maxRadius * 0.999999) > 2);
  assert.equal(stirTurns(SOFT, SOFT.mix.maxRadius * 1.1), 0);
  assert.ok(stirTurns(CAMPAIGN, lo * 1.001, 0.9) > 1, 'внутренняя граница');
  assert.equal(stirTurns(CAMPAIGN, lo / 1.1, 0.9), 0, 'внутренняя граница − 10 %');
  assert.ok(stirTurns(SOFT, lo / 1.1, 0.9) > 1, 'мягко: маленький круг засчитан');
});

test('ложка, рывок: шаг ровно maxJump мешает, на 10 % больше — нет; мягко рывок допустим в 1,5 раза больше', () => {
  const r = 0.15;
  const stepFor = (jump) => 2 * Math.asin(jump / (2 * r)); // угол между точками с хордой jump
  const hi = CAMPAIGN.mix.maxJump;
  assert.ok(stirTurns(CAMPAIGN, r, stepFor(hi * 0.999)) > 1, 'граница');
  assert.equal(stirTurns(CAMPAIGN, r, stepFor(hi * 1.1)), 0, 'граница + 10 %');
  assert.ok(stirTurns(SOFT, r, stepFor(hi * 1.1)) > 1, 'мягко: засчитано');
  assert.equal(stirTurns(SOFT, r, stepFor(SOFT.mix.maxJump * 1.1)), 0);
});

// Тёрка: туда-обратно между z1 и z2, сколько циклов засчитано.
function grated(cfg, a, b, rounds = 4) {
  const g = new Grater(cfg.grate, 99);
  for (let i = 0; i < rounds * 2 + 1; i++) g.move(i % 2 ? b : a);
  return g.done;
}

test('тёрка, размах: до зоны — цикл, не дошла на 10 % — нет; мягко зона ближе к центру', () => {
  const zt = CAMPAIGN.grate.zoneTop, zb = CAMPAIGN.grate.zoneBottom;
  assert.ok(grated(CAMPAIGN, zt * 1.5, zb * 1.5) >= 3, 'эталон');
  assert.ok(grated(CAMPAIGN, zt, zb) >= 3, 'граница');
  assert.equal(grated(CAMPAIGN, zt / 1.1, zb / 1.1), 0, 'граница + 10 %: не дошла до края');
  assert.ok(grated(SOFT, zt / 1.1, zb / 1.1) >= 3, 'мягко: засчитано');
  assert.equal(grated(SOFT, SOFT.grate.zoneTop / 1.1, SOFT.grate.zoneBottom / 1.1), 0);
});

test('тёрка, рывок: движение на maxJump — считается, на 10 % больше — «телепорт»; мягко допускается больше', () => {
  const j = CAMPAIGN.grate.maxJump;
  assert.ok(grated(CAMPAIGN, -j / 2, j / 2) >= 3, 'граница');
  assert.equal(grated(CAMPAIGN, (-j * 1.1) / 2, (j * 1.1) / 2), 0, 'граница + 10 %');
  assert.ok(grated(SOFT, (-j * 1.1) / 2, (j * 1.1) / 2) >= 3, 'мягко: засчитано');
});

// Губка: водим туда-сюда шагами step, сколько накоплено пути.
function scrubbed(cfg, step) {
  const s = new Scrubber(cfg.wash);
  s.move(0, 0, true);
  for (let i = 1; i <= 6; i++) s.move((i % 2) * step, 0, true);
  return s.done;
}

test('губка, шаг мыши: до maxStep — путь считается, на 10 % больше — рывок не в счёт; мягко шаг допустим больше', () => {
  const m = CAMPAIGN.wash.maxStep;
  assert.ok(scrubbed(CAMPAIGN, m * 0.5) > 0, 'эталон');
  assert.ok(scrubbed(CAMPAIGN, m) > 0, 'граница');
  assert.equal(scrubbed(CAMPAIGN, m * 1.1), 0, 'граница + 10 %');
  assert.ok(scrubbed(SOFT, m * 1.1) > 0, 'мягко: засчитан');
  assert.equal(scrubbed(SOFT, SOFT.wash.maxStep * 1.1), 0);
});

// Сессия кухни с нужной конфигурацией, героиня у ёлки с подарком в руках.
const atTree = (cfg) => {
  const s = new KitchenSession({ dayIndex: 0, seed: 1, bonus: 0, cfg });
  arrive(s, 'tree');
  s.drain();
  s.startGift(0);
  return s;
};
const pullBow = (s, len, steps = 8) => {
  s.pointer('down', 0, 0);
  for (let k = 1; k <= steps; k++) s.pointer('move', (len * k) / steps, 0);
  s.pointer('up', len, 0);
};

test('подарок, бант: захват в радиусе bowR; на 10 % дальше — «мимо банта»; мягко радиус шире, тянуть меньше', () => {
  const R = CAMPAIGN.gift.bowR;
  assert.equal(atTree(CAMPAIGN).pointer('down', R * 0.999, 0), 'grab', 'граница');
  const miss = atTree(CAMPAIGN);
  assert.equal(miss.pointer('down', R * 1.1, 0), 'bow-miss', 'граница + 10 %');
  assert.equal(atTree(SOFT).pointer('down', R * 1.1, 0), 'grab', 'мягко: бант пойман');
  assert.equal(atTree(SOFT).pointer('down', SOFT.gift.bowR * 1.1, 0), 'bow-miss');
  // сколько тянуть: норма bowPull; на 10 % меньше — ещё нет
  const s = atTree(CAMPAIGN);
  pullBow(s, CAMPAIGN.gift.bowPull * 0.9);
  assert.equal(s.gift.stage, 'bow');
  const soft = atTree(SOFT);
  pullBow(soft, CAMPAIGN.gift.bowPull * 0.9);
  assert.equal(soft.gift.stage, 'paper', 'мягко: бант развязан тем же движением');
  const soft2 = atTree(SOFT);
  pullBow(soft2, SOFT.gift.bowPull * 0.9);
  assert.equal(soft2.gift.stage, 'bow', 'мягкая норма − 10 % — ещё нет');
});

test('мягкая сессия получает копию конфигурации; обычная — исходный CAMPAIGN', () => {
  assert.equal(new KitchenSession({ dayIndex: 0, seed: 1 }).cfg, CAMPAIGN);
  const s = new KitchenSession({ dayIndex: 0, seed: 1, cfg: SOFT });
  assert.equal(s.cfg.assist.on, true);
  assert.equal(CAMPAIGN.assist.on, undefined);
});

// Росчерк ножом по огурцу (кружочки) под углом a к оси Z — настоящий pointer сессии, как в практике из меню.
// Нож по сетке (кубики) допусков угла не знает: режет там, где прошёл; допуски ножа живут в кружочках (classifyCut).
function knifeTilted(cfg, angleDeg) {
  const s = new KitchenSession({ practice: { activity: 'rounds', product: 'cucumber' }, seed: 1, cfg });
  const st = CLAYOUT.stations.board;
  Object.assign(s.heroine, { x: st.stand.x, z: st.stand.z, station: 'board', facing: st.facing });
  s._openPanel('board');
  s.boardSelect('practice:p');
  s.drain();
  const r = (angleDeg * Math.PI) / 180, len = 6;
  const pt = (k) => [Math.sin(r) * len * (k / 10 - 0.5) * BOARD_UNIT, Math.cos(r) * len * (k / 10 - 0.5) * BOARD_UNIT];
  s.pointer('down', ...pt(0));
  for (let k = 1; k <= 10; k++) s.pointer('move', ...pt(k));
  const res = s.pointer('up', ...pt(10));
  waitAction(s);
  return { res, hint: s.hint?.text ?? '', events: s.drain() };
}

test('кружочки в сессии: косой росчерк на границе + 10 % отказ «наискосок»; в мягком режиме — разрез', () => {
  const tol = CAMPAIGN.cutRules.angleTolerance;
  assert.equal(knifeTilted(CAMPAIGN, 0).res, 'cut', 'эталон');
  assert.equal(knifeTilted(CAMPAIGN, tol - 0.01).res, 'cut', 'граница');
  const denied = knifeTilted(CAMPAIGN, tol * 1.1);
  assert.equal(denied.res, 'diagonal', 'граница + 10 %');
  assert.match(denied.hint, /наискосок/);
  assert.ok(denied.events.some((e) => e.type === 'cutDenied' && e.reason === 'diagonal'));
  assert.equal(denied.events.some((e) => e.type === 'cut'), false, 'отказ ничего не режет');
  const soft = knifeTilted(SOFT, tol * 1.1);
  assert.equal(soft.res, 'cut', 'мягко: тот же росчерк режет');
  assert.ok(soft.events.some((e) => e.type === 'cut'));
  assert.equal(knifeTilted(SOFT, tol * K * 1.1).res, 'diagonal', 'мягкая граница + 10 % — снова отказ');
});

// ======================= полный экран и фразы отказа =======================

/** Подделка document: Fullscreen API. */
function fakeDoc({ enabled = true, denies = false } = {}) {
  const handlers = [];
  const doc = {
    fullscreenEnabled: enabled,
    fullscreenElement: null,
    addEventListener: (t, f) => t === 'fullscreenchange' && handlers.push(f),
    documentElement: { requestFullscreen: async () => { if (denies) throw new Error('нужен жест'); doc.fullscreenElement = doc.documentElement; handlers.forEach((f) => f()); } },
    exitFullscreen: async () => { doc.fullscreenElement = null; handlers.forEach((f) => f()); },
  };
  return doc;
}

test('полный экран в браузере: включается, выключается, сообщает о смене; отказ браузера — false', async () => {
  const fs = new FullscreenControl({ doc: fakeDoc(), desktop: null });
  const seen = [];
  fs.onChange((v) => seen.push(v));
  assert.equal(fs.supported, true);
  assert.equal(fs.active, false);
  assert.equal(await fs.set(true), true);
  assert.equal(fs.active, true);
  assert.equal(await fs.toggle(), true);
  assert.equal(fs.active, false);
  assert.deepEqual(seen, [true, false]);
  const denied = new FullscreenControl({ doc: fakeDoc({ denies: true }), desktop: null });
  assert.equal(await denied.set(true), false, 'браузер без жеста игрока отказал');
  assert.equal(denied.active, false);
  assert.equal(new FullscreenControl({ doc: fakeDoc({ enabled: false }), desktop: null }).supported, false);
});

test('полный экран в настольной версии: команда идёт через мост, состояние — из событий окна', async () => {
  const calls = [];
  let push = () => {};
  const desktop = { isFullscreen: async () => true, setFullscreen: async (on) => (calls.push(on), on), onFullscreen: (cb) => (push = cb) };
  const fs = new FullscreenControl({ doc: fakeDoc(), desktop });
  await Promise.resolve();
  assert.equal(fs.supported, true);
  assert.equal(fs.active, true, 'окно уже было в полном экране');
  await fs.set(false);
  assert.deepEqual(calls, [false]);
  assert.equal(fs.active, false);
  const seen = [];
  fs.onChange((v) => seen.push(v));
  push(true); // пользователь нажал F11 или «Вид → Полный экран»
  assert.equal(fs.active, true);
  assert.deepEqual(seen, [true]);
  const broken = new FullscreenControl({ doc: fakeDoc(), desktop: { ...desktop, setFullscreen: async () => { throw new Error('нет окна'); } } });
  assert.equal(await broken.set(true), false);
});

test('фразы отказа по клавишам: до 70 знаков для любых действий и клавиш, без слов «ошибка» и «неверно»', () => {
  const k = new Keymap();
  for (const action of ACTION_ORDER) {
    for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyR', 'KeyQ', 'KeyF', 'KeyM', 'F11', 'ArrowUp', 'Backspace', 'Escape', 'Tab', 'ShiftLeft', 'нечто']) {
      const r = k.bind(action, code);
      if (r.ok) {
        k.reset(action);
        continue;
      }
      const text = explainBind(r, code);
      assert.ok(text.length > 0 && text.length <= 70, `${action} ← ${code}: «${text}» (${text.length})`);
      assert.doesNotMatch(text, /ошибк|неверн/i);
    }
  }
});
