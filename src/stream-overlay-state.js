// Состояние для оверлея OBS: игра собирает его из снимка голосования и отдаёт в локальный сервер (desktop/overlay-server.cjs).
// Чистая функция. В состояние попадают только числа, команды из таблицы игры и наши тексты — ников и чужих слов нет.
import { CAMPAIGN } from './campaign/data.js';
import { WHY_TEXT } from './campaign/stream-rules.js';

/**
 * view — снимок StreamVotes.view() или null (вне дня с чатом); event — последнее событие кухни { id, text } или null.
 * Возвращает объект, который сервер оверлея пропускает через свой белый список полей.
 */
export function overlayState(view, event = null, rules = CAMPAIGN.stream) {
  if (!view) return { v: 1, active: false };
  return {
    v: 1,
    active: true,
    status: view.status,
    statusText: view.test ? 'тестовый чат' : view.statusText,
    channel: view.channel,
    test: !!view.test,
    phase: view.phase,
    paused: !!view.paused,
    left: Math.ceil(view.left),
    window: view.window,
    power: view.power,
    powerLabel: rules.powers[view.power]?.label ?? '',
    options: view.options.map((o) => ({ cmd: o.cmd, icon: o.icon, side: o.side, n: o.n })),
    total: view.total,
    meter: { chaos: view.meter.chaos, help: view.meter.help, share: view.meter.share },
    waiting: view.waiting ? { cmd: view.waiting.cmd, why: view.waiting.why ? WHY_TEXT[view.waiting.why] ?? '' : '' } : null,
    result: view.last?.text ?? '',
    event: event ? { id: event.id, text: event.text } : null,
  };
}

/** Подпись состояния: пока она та же, в оверлей ничего не отправляем. */
export function overlaySig(state) {
  return JSON.stringify(state);
}
