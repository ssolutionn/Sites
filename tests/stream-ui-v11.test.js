// 0.11, режим стримера: разметка интерфейса (экран настроек, плашка голосования) и состояние оверлея — без DOM.
// Главное: чужой текст в разметку не попадает ни при каких входных данных.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsHtml, votesHtml, voteSig, voteShapeSig, votesLive, phaseText, nowLine, esc } from '../src/ui/stream-ui.js';
import { overlayState } from '../src/stream-overlay-state.js';
import { VoteRound, streamSettings } from '../src/campaign/stream-rules.js';
import { CAMPAIGN } from '../src/campaign/data.js';

const view = (extra = {}) => {
  const r = new VoteRound();
  r.vote('a', '!кот');
  r.vote('b', '!кот');
  r.vote('c', '!помощь');
  return { ...r.view(), test: false, channel: 'streamer', status: 'online', statusText: 'в чате', ...extra };
};

test('esc экранирует всё, что ломает разметку', () => {
  assert.equal(esc('<img src=x onerror="a()"> & \''), '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;');
});

test('плашка голосования: пять команд, счёт, шкала, строка победителя; «+» только в тестовом чате', () => {
  const html = votesHtml(view());
  assert.equal((html.match(/class="vote-row/g) ?? []).length, 5);
  assert.match(html, /хаос 2/);
  assert.match(html, /помощь 1/);
  assert.doesNotMatch(html, /data-vote=/, 'в настоящем чате кнопок «+» нет');
  assert.match(html, /data-chat="pause"/);
  assert.match(votesHtml(view({ test: true })), /data-vote="!кот"/);
});

test('плашка: всё, что приходит снаружи, экранируется (статус, канал, строка результата)', () => {
  const evil = '<script>alert(1)</script>';
  const html = votesHtml(view({ statusText: evil, channel: evil, last: { text: evil, kind: 'win' }, waiting: null }));
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /&lt;script&gt;/);
});

test('плашка: статус «подключаюсь», «в чате», «нет связи» и точка состояния', () => {
  assert.match(votesHtml(view({ status: 'connecting', statusText: 'подключаюсь…' })), /dot wait/);
  assert.match(votesHtml(view({ status: 'online', statusText: 'в чате' })), /dot ok/);
  assert.match(votesHtml(view({ status: 'offline', statusText: 'нет связи' })), /dot bad/);
  assert.match(votesHtml(view({ status: 'offline', statusText: 'нет связи' })), /нет связи/);
  assert.match(votesHtml(view({ test: true, status: 'test', statusText: 'тестовый чат' })), /тестовый чат/);
});

test('фаза голосования словами: окно, ожидание с причиной, пауза после события, пауза чата', () => {
  assert.equal(phaseText({ phase: 'voting', left: 31.2 }), 'Голосование · 32 с');
  assert.equal(phaseText({ phase: 'pending', waiting: { cmd: '!кот', why: 'gesture' } }), 'Выбор сделан · !кот ждёт: руки заняты');
  assert.equal(phaseText({ phase: 'cooldown', left: 12.1 }), 'Пауза после события · 13 с');
  assert.equal(phaseText({ phase: 'voting', left: 5, paused: true }), 'Чат на паузе');
});

test('подпись плашки меняется вместе со временем, голосами, фазой и строкой результата', () => {
  const a = voteSig(view());
  assert.equal(voteSig(view()), a);
  assert.notEqual(voteSig(view({ left: 3 })), a);
  assert.notEqual(voteSig(view({ phase: 'cooldown' })), a);
  assert.notEqual(voteSig(view({ last: { text: 'Победило', kind: 'win' } })), a);
  assert.notEqual(voteSig(view({ paused: true })), a);
});

test('секунды и голоса не меняют состав плашки — кнопки не пересоздаются раз в секунду (регрессия ревью 0.11)', () => {
  const a = view({ test: true });
  const shape = voteShapeSig(a);
  // идёт время, приходят голоса — подпись меняется (плашку надо обновить), состав — нет (правим на месте)
  const later = { ...a, left: a.left - 3, options: a.options.map((o, i) => ({ ...o, n: o.n + i })), meter: { ...a.meter, chaos: a.meter.chaos + 2 } };
  assert.notEqual(voteSig(later), voteSig(a));
  assert.equal(voteShapeSig(later), shape);
  // фаза, пауза, строка результата, тестовый чат — новый состав
  assert.notEqual(voteShapeSig({ ...a, phase: 'cooldown' }), shape);
  assert.notEqual(voteShapeSig({ ...a, paused: true }), shape);
  assert.notEqual(voteShapeSig({ ...a, last: { text: 'Победило', kind: 'win' } }), shape);
  assert.notEqual(voteShapeSig({ ...a, test: false }), shape);
  // то, что правится на месте, совпадает с тем, что нарисовала бы разметка
  const live = votesLive(later), html = votesHtml(later);
  assert.equal(live.phase, phaseText(later));
  assert.ok(html.includes(`<b>${live.rows[1].n}</b>`) && html.includes(`width:${live.rows[1].w}`));
  assert.ok(html.includes(live.chaos) && html.includes(live.help) && html.includes(`width:${live.chaosW}`));
});

test('экран настроек: умолчания — режим выключен, «Включить», сила чата «Нормально», ники включены, оверлей только в версии для компьютера', () => {
  const html = settingsHtml({ s: streamSettings(undefined), view: null, overlay: { available: false } });
  assert.match(html, />Включить</);
  assert.match(html, /Сейчас: выключен/);
  assert.match(html, /seg-b on"[^>]*data-arg="power=normal"/);
  assert.match(html, /id="stream-nicks" checked/);
  assert.match(html, /версии игры для компьютера/);
  for (const label of ['Мягко', 'Нормально', 'Хаос', 'Нет', 'Слева сверху', 'Справа сверху', 'Слева снизу', 'Справа снизу']) assert.ok(html.includes(label), label);
  for (const cmd of ['!кот', '!гость', '!радио', '!гирлянда', '!помощь']) assert.ok(html.includes(cmd), cmd);
});

test('экран настроек: включённый режим, канал, адрес оверлея и порт; канал экранируется', () => {
  const s = streamSettings({ on: true, channel: 'streamer', cam: 'br', power: 'chaos' });
  const html = settingsHtml({ s, view: view(), overlay: { available: true, running: true, url: 'http://127.0.0.1:17771/overlay', error: '' } });
  assert.match(html, />Выключить</);
  assert.match(html, /value="streamer"/);
  assert.match(html, /value="http:\/\/127\.0\.0\.1:17771\/overlay"/);
  assert.match(html, /id="stream-port"[^>]*value="17771"/);
  assert.match(html, /включён<\/b> · канал streamer · в чате/);
  const evil = settingsHtml({ s: { ...s, channel: '"><script>x</script>' }, view: null, overlay: { available: false }, note: '<b>x</b>' });
  assert.doesNotMatch(evil, /<script>x/);
  assert.doesNotMatch(evil, /<b>x<\/b>/);
});

test('строка «Сейчас»: выключен, тестовый чат, канал со статусом', () => {
  assert.equal(nowLine(streamSettings({}), null), 'Сейчас: выключен');
  assert.match(nowLine(streamSettings({ on: true, test: true }), null), /тестовый чат/);
  assert.match(nowLine(streamSettings({ on: true, channel: 'abc' }), view({ status: 'connecting', statusText: 'подключаюсь…' })), /канал abc · подключаюсь…/);
});

test('оверлей: вне дня с чатом — «не активен»; в дне — числа, команды, наши тексты; ников и идентификаторов нет', () => {
  assert.deepEqual(overlayState(null), { v: 1, active: false });
  const v = view({ left: 31.4, waiting: { cmd: '!кот', why: 'gesture', line: 'Победило !кот' }, last: { text: 'Победило !кот — 2 из 3 голосов', kind: 'win' } });
  const s = overlayState(v, { id: 4, text: 'Чат разбудил кота — он голоден!' });
  assert.equal(s.active, true);
  assert.equal(s.left, 32);
  assert.equal(s.powerLabel, CAMPAIGN.stream.powers.normal.label);
  assert.equal(s.options.length, 5);
  assert.deepEqual(s.meter, { chaos: 2, help: 1, share: 1 / 3 });
  assert.deepEqual(s.waiting, { cmd: '!кот', why: 'руки заняты' });
  assert.equal(s.result, 'Победило !кот — 2 из 3 голосов');
  assert.deepEqual(s.event, { id: 4, text: 'Чат разбудил кота — он голоден!' });
  assert.doesNotMatch(JSON.stringify(s), /"a"|"b"|"c"|id:/);
  assert.equal(overlayState(view({ test: true, statusText: '' })).statusText, 'тестовый чат');
});
