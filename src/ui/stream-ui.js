// Режим стримера: разметка экрана настроек и плашки голосования. Строки без DOM — проверяются в node:test.
// В разметку попадает только то, что вернул разбор: команды из таблицы игры, числа, очищенные ники и наши тексты.
import { CAMPAIGN } from '../campaign/data.js';
import { STREAM_COMMANDS } from '../campaign/extras.js';
import { CAM_CORNERS, WHY_TEXT } from '../campaign/stream-rules.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const seg = (key, current, items) =>
  `<div class="seg" role="group">${items.map(([val, label, title]) => `<button type="button" class="seg-b ${String(current) === String(val) ? 'on' : ''}" aria-pressed="${String(current) === String(val)}" data-ui="streamSet" data-arg="${key}=${val}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`).join('')}</div>`;

/** Подпись состояния источника для настроек: «в чате», «подключаюсь…», «нет связи». */
export function sourceStatusLine(view) {
  if (!view) return '';
  if (view.test) return 'тестовый чат';
  return view.statusText || '';
}

/** Строка «Сейчас: …» на экране настроек (обновляется на месте, пока экран открыт). */
export function nowLine(s, view) {
  if (!s.on) return 'Сейчас: выключен';
  const live = !s.test && s.channel;
  const st = sourceStatusLine(view);
  return `Сейчас: <b>включён</b>${live ? ` · канал ${esc(s.channel)}` : ' · тестовый чат'}${live && st ? ' · ' + esc(st) : ''}`;
}

/**
 * Экран «Режим стримера». s — нормализованные настройки (streamSettings), view — снимок голосования или null,
 * overlay — { available, running, url, error } (оверлей есть только в версии для компьютера), best — зачёт с чатом по дням.
 */
export function settingsHtml({ s, view, overlay, note = '', rules = CAMPAIGN.stream }) {
  const powers = Object.entries(rules.powers).map(([id, p]) => [id, p.label, p.note]);
  const power = rules.powers[s.power];
  const cams = Object.entries(CAM_CORNERS).map(([id, label]) => [id, label]);
  const cmds = Object.entries(STREAM_COMMANDS);
  const harm = cmds.filter(([, c]) => c.side === 'chaos').map(([k]) => `<b>${esc(k)}</b>`).join(', ');
  const help = cmds.filter(([, c]) => c.side === 'help').map(([k]) => `<b>${esc(k)}</b>`).join(', ');
  let ov;
  if (!overlay?.available) ov = '<span class="small">Оверлей для OBS работает в версии игры для компьютера.</span>';
  else if (overlay.error) ov = `<span class="small warn">${esc(overlay.error)}</span>`;
  else ov = `<input class="ov-url" readonly value="${esc(overlay.url)}" aria-label="Адрес оверлея" /> <span class="small" id="ov-state">${overlay.running ? 'работает' : 'выключен'}</span>`;
  return `<div class="card dialog stream-set">
    <h2>📺 Режим стримера</h2>
    <p class="small lead">Зрители в чате Twitch голосуют командами, а победившая случается у тебя на кухне: ${harm} — шалят, ${help} — выручает. Чат только читаем: вход анонимный, без пароля и ключей. День с чатом идёт в отдельный зачёт, кампания не меняется.</p>
    <div class="srow"><label for="stream-channel">Канал Twitch</label><div><input id="stream-channel" type="text" value="${esc(s.channel)}" placeholder="имя_канала или ссылка" maxlength="80" autocomplete="off" spellcheck="false" /></div></div>
    <div class="srow"><label>Тестовый чат</label><label class="chk"><input type="checkbox" id="stream-test" ${s.test ? 'checked' : ''}/> без сети: голоса вносят кнопками «+» на экране</label></div>
    <div class="srow"><label>Сила чата</label><div>${seg('power', s.power, powers)}<div class="small snote">${esc(power.note)}: окно ${power.window} с, пауза ${power.cooldown} с.</div></div></div>
    <div class="srow"><label>Ники зрителей</label><label class="chk"><input type="checkbox" id="stream-nicks" ${s.nicks ? 'checked' : ''}/> показывать: курьер, гости за финальным столом</label></div>
    <div class="srow"><label>Веб-камера</label><div>${seg('cam', s.cam, cams)}<div class="small snote">Уведомления, подсказки и голосование обходят этот угол.</div></div></div>
    <div class="srow"><label>Оверлей для OBS</label><div class="ov">${ov}${overlay?.available ? `<div class="small snote">Источник «Браузер» → этот адрес. Порт: <input id="stream-port" type="number" min="1024" max="65535" value="${s.overlayPort}" class="port" /></div>` : ''}</div></div>
    ${note ? `<p class="small warn">${esc(note)}</p>` : ''}
    <p class="small now" id="stream-now">${nowLine(s, view)}</p>
    <div class="actions">
      <button class="primary" data-ui="streamToggle">${s.on ? 'Выключить' : 'Включить'}</button>
      <button class="ghost" data-ui="streamForget" title="Забыть самых активных зрителей">Забыть зрителей</button>
      <button class="ghost big" data-ui="menu">← В меню</button>
    </div>
  </div>`;
}

/** Фраза о том, что сейчас происходит с голосованием. */
export function phaseText(v) {
  if (v.paused) return 'Чат на паузе';
  switch (v.phase) {
    case 'voting':
      return `Голосование · ${Math.ceil(v.left)} с`;
    case 'pending':
      return `Выбор сделан · ${v.waiting?.cmd ?? ''}${v.waiting?.why ? ' ждёт: ' + (WHY_TEXT[v.waiting.why] ?? '') : ''}`;
    case 'cooldown':
      return `Пауза после события · ${Math.ceil(v.left)} с`;
    default:
      return '';
  }
}

/** Подпись, меняющаяся вместе с плашкой: пока она та же, DOM не трогаем. */
export function voteSig(v) {
  return [v.phase, v.paused ? 1 : 0, Math.ceil(v.left), v.statusText, v.test ? 1 : 0, v.options.map((o) => o.n).join(','), v.waiting?.why ?? '', v.last?.text ?? ''].join('|');
}

/**
 * Подпись состава плашки: меняется — разметку собирают заново. Секунды, голоса и шкала сюда не входят — их правят на месте
 * (votesLive), иначе кнопки («+», «Пауза чата») пересоздавались бы раз в секунду и клик на смене секунды терялся.
 */
export function voteShapeSig(v) {
  return [v.phase, v.paused ? 1 : 0, v.statusText, v.status, v.channel ?? '', v.test ? 1 : 0, v.options.map((o) => o.cmd + ':' + o.side).join(','), v.waiting?.cmd ?? '', v.waiting?.why ?? '', v.last?.text ?? '', v.last?.kind ?? ''].join('|');
}

/** Что в плашке меняется на месте: строка фазы с секундами, голоса и ширина полосок, шкала «хаос ↔ помощь». */
export function votesLive(v) {
  const max = Math.max(1, ...v.options.map((o) => o.n));
  const m = v.meter;
  return {
    phase: phaseText(v),
    rows: v.options.map((o) => ({ n: String(o.n), w: `${(o.n / max) * 100}%` })),
    chaos: `хаос ${m.chaos}`,
    help: `помощь ${m.help}`,
    chaosW: `${Math.round((1 - m.share) * 100)}%`,
    helpW: `${Math.round(m.share * 100)}%`,
  };
}

/** Плашка голосования во время дня. Кнопки «+» — только в тестовом чате. */
export function votesHtml(v) {
  const max = Math.max(1, ...v.options.map((o) => o.n));
  const rows = v.options
    .map((o) => `<div class="vote-row ${o.side}"><span class="v-cmd">${esc(o.cmd)}</span><span class="vbar"><i style="width:${(o.n / max) * 100}%"></i></span><b>${o.n}</b>${v.test ? `<button type="button" class="mini" data-vote="${esc(o.cmd)}" aria-label="Голос за ${esc(o.cmd)}">+</button>` : ''}</div>`)
    .join('');
  const m = v.meter;
  const status = v.test ? 'тестовый чат' : [v.statusText, v.channel ? '#' + v.channel : ''].filter(Boolean).join(' · ');
  const dot = v.test || v.status === 'online' ? 'ok' : v.status === 'connecting' ? 'wait' : 'bad';
  return `<div class="v-head"><b>📺 Чат решает</b><span class="v-st"><i class="dot ${dot}"></i>${esc(status)}</span></div>
    <div class="v-phase ${v.paused ? 'paused' : v.phase}">${esc(phaseText(v))}</div>
    ${rows}
    <div class="v-meter" title="Голоса окна: вредные команды против «!помощь»"><span>хаос ${m.chaos}</span><span class="mbar"><i style="width:${Math.round((1 - m.share) * 100)}%"></i><u style="width:${Math.round(m.share * 100)}%"></u></span><span>помощь ${m.help}</span></div>
    ${v.last ? `<div class="v-line ${v.last.kind}">${esc(v.last.text)}</div>` : ''}
    <button type="button" class="mini v-pause" data-chat="pause" title="Поставить чат на паузу (P)">${v.paused ? '▶ Продолжить чат' : '⏸ Пауза чата'} <kbd>P</kbd></button>`;
}
