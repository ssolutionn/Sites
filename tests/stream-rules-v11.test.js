// 0.11, режим стримера: правила голосования — сила чата, окна и паузы, «не больше одного события за окно»,
// canFire (нож, урок, книга, телефон, конец дня), шкала «хаос ↔ помощь», зрители для финального стола.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAMPAIGN } from '../src/campaign/data.js';
import { STREAM_COMMANDS } from '../src/campaign/extras.js';
import { VoteRound, canFire, estimateRemaining, streamSettings, resolvePower, winnerLine, mergeViewers, tableGuests, WHY_TEXT, CAM_CORNERS } from '../src/campaign/stream-rules.js';

const R = CAMPAIGN.stream;
const ok = () => ({ live: true, phase: 'kitchen', t: R.startQuiet + 100, remaining: null, gesture: false, lesson: false, book: false, typing: false, paused: false });
const idle = () => ({ ok: true });
const later = (round, seconds, state = ok(), check = canFire) => {
  const out = [];
  for (let i = 0; i < seconds * 10; i++) out.push(...round.update(0.1, state, check));
  return out;
};
const types = (ev) => ev.map((e) => e.type);

test('настройки игрока: умолчания, ступени силы чата, угол вебки и порт проверяются', () => {
  assert.deepEqual(streamSettings(undefined), { on: false, channel: '', test: false, power: 'normal', nicks: true, cam: 'none', overlay: true, overlayPort: 17771 });
  const s = streamSettings({ on: true, channel: 'abc', power: 'chaos', cam: 'tr', nicks: false, overlayPort: 18000 });
  assert.equal(s.power, 'chaos');
  assert.equal(s.cam, 'tr');
  assert.equal(s.nicks, false);
  assert.equal(s.overlayPort, 18000);
  const bad = streamSettings({ power: 'ultra', cam: 'center', overlayPort: 80, channel: 5 });
  assert.equal(bad.power, 'normal');
  assert.equal(bad.cam, 'none');
  assert.equal(bad.overlayPort, 17771, 'порты ниже 1024 не берём');
  assert.equal(bad.channel, '');
  assert.equal(streamSettings({ overlayPort: 70000 }).overlayPort, 17771);
  assert.deepEqual(Object.keys(CAM_CORNERS), ['none', 'tl', 'tr', 'bl', 'br']);
});

test('единый флаг CAMPAIGN.stream.enabled: выключен — режим не включается, даже если в сохранении «вкл»', () => {
  assert.equal(R.enabled, true, 'по умолчанию флаг включён: пункт меню виден');
  assert.equal(streamSettings({ on: true }, { ...R, enabled: false }).on, false);
  assert.equal(streamSettings({}).on, false, 'сам режим по умолчанию выключен у игрока');
});

test('сила чата: три ступени с разной длиной окна, паузой и весом вредных событий', () => {
  const { soft, normal, chaos } = R.powers;
  assert.ok(soft.window > normal.window && normal.window > chaos.window, 'Мягко — окно длиннее, Хаос — короче');
  assert.ok(soft.cooldown > normal.cooldown && normal.cooldown > chaos.cooldown);
  assert.ok(soft.harmWeight < normal.harmWeight && normal.harmWeight < chaos.harmWeight);
  assert.deepEqual(['Мягко', 'Нормально', 'Хаос'], [soft.label, normal.label, chaos.label]);
  assert.equal(resolvePower('нет такой').id, 'normal');
  assert.equal(resolvePower('chaos').window, chaos.window);
});

test('canFire: без помех — можно', () => {
  assert.deepEqual(canFire(ok()), { ok: true, why: null });
});

test('canFire: нож или жест в процессе — нельзя', () => {
  assert.deepEqual(canFire({ ...ok(), gesture: true }), { ok: false, why: 'gesture' });
});

test('canFire: урок перед блюдом, открытая книга и ввод в телефоне — нельзя', () => {
  assert.equal(canFire({ ...ok(), lesson: true }).why, 'lesson');
  assert.equal(canFire({ ...ok(), book: true }).why, 'book');
  assert.equal(canFire({ ...ok(), typing: true }).why, 'typing');
});

test('canFire: последние 30 с дня и первые секунды — тишина; ровно на границе ещё тишина, секундой позже — можно', () => {
  assert.equal(canFire({ ...ok(), remaining: R.endQuiet }).why, 'ending');
  assert.equal(canFire({ ...ok(), remaining: R.endQuiet - 5 }).why, 'ending');
  assert.equal(canFire({ ...ok(), remaining: R.endQuiet + 1 }).ok, true);
  assert.equal(canFire({ ...ok(), t: R.startQuiet - 1 }).why, 'early');
  assert.equal(canFire({ ...ok(), t: R.startQuiet }).ok, true);
});

test('canFire: день готов или закончен, чат на паузе, практика/не-стрим — нет', () => {
  assert.equal(canFire({ ...ok(), phase: 'ready' }).ok, false);
  assert.equal(canFire({ ...ok(), phase: 'finished' }).ok, false);
  assert.equal(canFire({ ...ok(), paused: true }).ok, false);
  assert.equal(canFire({ ...ok(), live: false }).ok, false);
  assert.equal(canFire(null).ok, false);
});

test('canFire: у каждой причины есть фраза для интерфейса', () => {
  for (const s of [{ gesture: true }, { lesson: true }, { book: true }, { typing: true }, { remaining: 1 }, { t: 1 }, { live: false }]) {
    const c = canFire({ ...ok(), ...s });
    assert.ok(WHY_TEXT[c.why], c.why);
  }
});

test('оценка конца дня по темпу: мало данных — неизвестно, всё сделано — 0, иначе остаток × средний шаг', () => {
  assert.equal(estimateRemaining({ t: 10, done: 0, total: 20, phase: 'kitchen' }), null);
  assert.equal(estimateRemaining({ t: 200, done: 1, total: 20, phase: 'kitchen' }), null);
  assert.equal(estimateRemaining({ t: 300, done: 10, total: 20, phase: 'kitchen' }), 300);
  assert.equal(estimateRemaining({ t: 300, done: 20, total: 20, phase: 'kitchen' }), 0);
  assert.equal(estimateRemaining({ t: 300, done: 5, total: 20, phase: 'ready' }), 0);
  assert.equal(estimateRemaining({ t: 300, done: 5, total: 0, phase: 'kitchen' }), null);
});

test('один голос на зрителя за окно; чужие команды и повтор не считаются', () => {
  const r = new VoteRound();
  assert.equal(r.vote('id:1', '!кот'), true);
  assert.equal(r.vote('id:1', '!радио'), false, 'второй голос того же зрителя');
  assert.equal(r.vote('id:2', '!неизвестно'), false);
  assert.equal(r.vote('', '!кот'), false);
  assert.equal(r.vote('id:3', '!constructor'), false);
  assert.equal(r.total(), 1);
});

test('окно закончилось: победитель — у кого больше голосов; одно событие, без списка ников', () => {
  const r = new VoteRound({ power: 'normal' });
  for (let i = 0; i < 5; i++) r.vote('a' + i, '!кот');
  for (let i = 0; i < 3; i++) r.vote('b' + i, '!радио');
  const ev = later(r, R.powers.normal.window + 1);
  assert.deepEqual(types(ev), ['winner', 'fire']);
  assert.equal(ev[0].cmd, '!кот');
  assert.equal(ev[0].kind, 'cat');
  assert.equal(ev[0].line, 'Победило !кот — 5 из 8 голосов');
  assert.doesNotMatch(JSON.stringify(r.view()), /a0|b0/);
});

test('равенство голосов: выигрывает команда, получившая голос первой', () => {
  const r = new VoteRound();
  r.vote('x', '!радио');
  r.vote('y', '!кот');
  r.vote('z', '!кот');
  r.vote('w', '!радио');
  assert.equal(r.tally().cmd, '!радио');
});

test('не больше одного события за окно: после выпуска пауза, голоса в паузе не принимаются, потом новое окно', () => {
  const r = new VoteRound({ power: 'normal' });
  r.vote('a', '!гость');
  const ev = later(r, R.powers.normal.window + 1);
  assert.deepEqual(types(ev), ['winner', 'fire']);
  r.settle(true);
  assert.equal(r.phase, 'cooldown');
  assert.equal(r.vote('b', '!кот'), false, 'в паузе голосовать нельзя');
  assert.deepEqual(types(later(r, R.powers.normal.cooldown - 1)), [], 'пока идёт пауза, событий нет');
  later(r, 2);
  assert.equal(r.phase, 'voting');
  assert.equal(r.vote('b', '!кот'), true, 'новое окно открыто');
  assert.equal(r.total(), 1);
});

test('сила чата меняет длину окна и паузу', () => {
  for (const id of ['soft', 'normal', 'chaos']) {
    const r = new VoteRound({ power: id });
    assert.equal(r.view().left, R.powers[id].window, id);
    r.vote('a', '!кот');
    const ev = later(r, R.powers[id].window + 0.5);
    assert.equal(types(ev)[0], 'winner', id);
    r.settle(true);
    assert.equal(r.view().left, R.powers[id].cooldown, id);
  }
});

test('вес вредных событий: «Мягко» — помощь выигрывает при равенстве и небольшом перевесе хаоса; «Хаос» — наоборот', () => {
  const run = (power, chaosN, helpN) => {
    const r = new VoteRound({ power });
    for (let i = 0; i < chaosN; i++) r.vote('c' + i, '!кот');
    for (let i = 0; i < helpN; i++) r.vote('h' + i, '!помощь');
    return r.tally();
  };
  assert.equal(run('normal', 4, 4).cmd, '!кот', 'в «Нормально» равенство решает первый голос');
  assert.equal(run('soft', 4, 4).cmd, '!помощь', 'мягкий чат: 4 хаоса × 0,7 < 4 помощи');
  assert.equal(run('soft', 6, 5).cmd, '!помощь', 'мягкий чат: 6 хаоса × 0,7 < 5 помощи');
  assert.match(run('soft', 6, 5).line, /сила чата «Мягко»/, 'если победил тот, у кого меньше голосов, это объяснено');
  assert.equal(run('chaos', 4, 5).cmd, '!кот', 'хаос: 4 × 1,5 > 5');
  assert.doesNotMatch(run('normal', 5, 4).line, /сила чата/);
});

test('никто не голосовал: тихое окно, без события, новое окно сразу', () => {
  const r = new VoteRound();
  const ev = later(r, R.powers.normal.window + 1);
  assert.deepEqual(types(ev), ['quiet']);
  assert.equal(r.phase, 'voting');
  assert.ok(r.view().left > R.powers.normal.window - 2);
});

test('победитель ждёт спокойного момента (нож в руках), затем событие выходит', () => {
  const r = new VoteRound();
  r.vote('a', '!радио');
  const busy = { ...ok(), gesture: true };
  const ev1 = later(r, R.powers.normal.window + 1, busy);
  assert.deepEqual(types(ev1), ['winner']);
  assert.equal(r.view().waiting.why, 'gesture');
  assert.deepEqual(types(later(r, 5, busy)), [], 'пока нож в руках — ждём');
  const ev2 = later(r, 0.2, ok());
  assert.deepEqual(types(ev2), ['fire']);
  assert.equal(ev2[0].kind, 'radio');
});

test('не дождался за holdMax — событие отменяется с причиной, дальше короткая пауза', () => {
  const r = new VoteRound();
  r.vote('a', '!радио');
  const busy = { ...ok(), book: true };
  later(r, R.powers.normal.window + 1, busy);
  let drop = null;
  for (let i = 0; i < (R.holdMax + 2) * 10 && !drop; i++) drop = r.update(0.1, busy).find((e) => e.type === 'drop');
  assert.ok(drop, 'событие отменено');
  assert.equal(drop.why, 'book');
  assert.equal(r.phase, 'cooldown');
  assert.equal(r.view().left, R.refusedCooldown);
  assert.match(r.view().last.text, /открыта книга/);
});

test('кухня отказала в событии: короткая пауза и сообщение «сейчас нельзя»', () => {
  const r = new VoteRound();
  r.vote('a', '!радио');
  later(r, R.powers.normal.window + 1);
  r.settle(false);
  assert.equal(r.phase, 'cooldown');
  assert.equal(r.view().left, R.refusedCooldown);
  assert.equal(r.view().last.kind, 'refused');
});

test('пауза чата: время и голоса стоят', () => {
  const r = new VoteRound();
  r.vote('a', '!кот');
  r.paused = true;
  const left = r.view().left;
  assert.deepEqual(later(r, 100), []);
  assert.equal(r.view().left, left);
  assert.equal(r.vote('b', '!кот'), false);
  r.paused = false;
  assert.equal(r.vote('b', '!кот'), true);
});

test('шкала «хаос ↔ помощь» считает голоса сторон', () => {
  const r = new VoteRound();
  assert.deepEqual(r.meter(), { chaos: 0, help: 0, share: 0.5 });
  r.vote('a', '!кот');
  r.vote('b', '!радио');
  r.vote('c', '!гирлянда');
  r.vote('d', '!помощь');
  assert.deepEqual(r.meter(), { chaos: 3, help: 1, share: 0.25 });
});

test('результат окна — одна строка и она гаснет сама', () => {
  const r = new VoteRound();
  r.vote('a', '!кот');
  const ev = later(r, R.powers.normal.window + 0.5);
  r.settle(true, 'Победило !кот — 1 из 1 голоса');
  assert.equal(r.view().last.text, 'Победило !кот — 1 из 1 голоса');
  later(r, R.resultShow + 1);
  assert.equal(r.view().last, null);
  assert.ok(ev.length);
});

test('строка победителя склоняет «голоса»', () => {
  assert.equal(winnerLine('!кот', 1, 1), 'Победило !кот — 1 из 1 голоса');
  assert.equal(winnerLine('!кот', 2, 5), 'Победило !кот — 2 из 5 голосов');
  assert.equal(winnerLine('!кот', 7, 21), 'Победило !кот — 7 из 21 голоса');
  assert.equal(winnerLine('!кот', 7, 12), 'Победило !кот — 7 из 12 голосов');
});

test('команды: у каждой есть событие, сторона и короткая подпись; «!помощь» — помогающая', () => {
  for (const [cmd, c] of Object.entries(STREAM_COMMANDS)) {
    assert.match(cmd, /^![а-я]+$/);
    assert.ok(['chaos', 'help'].includes(c.side), cmd);
    assert.ok(c.kind && c.icon && c.short, cmd);
  }
  assert.equal(STREAM_COMMANDS['!помощь'].side, 'help');
  assert.equal(STREAM_COMMANDS['!помощь'].kind, 'help');
});

test('зрители для финального стола: самые активные, вместе с сохранёнными; меньше зрителей — обычные гости', () => {
  const saved = [{ nick: 'Нико', n: 5 }, { nick: 'Мила', n: 2 }];
  const m = mergeViewers(saved, { Мила: 4, Артём: 1, Зева: 0 }, 3);
  assert.deepEqual(m, [{ nick: 'Мила', n: 6 }, { nick: 'Нико', n: 5 }, { nick: 'Артём', n: 1 }]);
  assert.deepEqual(mergeViewers([{ nick: 5 }, null, { nick: 'x', n: -1 }], {}, 3), []);
  const defaults = ['Дима', 'Оля', 'Серёжа', 'Катя', 'Миша'];
  assert.deepEqual(tableGuests(defaults, m), ['Мила', 'Нико', 'Артём', 'Катя', 'Миша']);
  assert.deepEqual(tableGuests(defaults, [], true), defaults);
  assert.deepEqual(tableGuests(defaults, m, false), defaults, 'ники выключены — обычные гости');
});

test('пустой список зрителей не ломает слияние; хранится не больше keep', () => {
  assert.deepEqual(mergeViewers(undefined, undefined), []);
  const many = Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['Зритель' + i, i + 1]));
  assert.equal(mergeViewers([], many).length, R.viewers.keep);
  assert.equal(mergeViewers([], many)[0].nick, 'Зритель29');
});

test('круг не зависит от того, кто голосовал: view() не содержит идентификаторов зрителей', () => {
  const r = new VoteRound();
  r.vote('id:777', '!кот');
  assert.doesNotMatch(JSON.stringify(r.view()), /777/);
});
