// Оверлей чата для OBS: подписывается на поток /events локального сервера игры и рисует голосование.
// Весь текст выводится через textContent: даже испорченное состояние не станет разметкой.
const params = new URLSearchParams(location.search);
const scale = Math.min(3, Math.max(0.5, Number(params.get('scale')) || 1));
document.documentElement.style.setProperty('--s', String(scale));
if (params.get('side') === 'right') document.body.classList.add('right');

const root = document.getElementById('ov');
const EVENT_SHOW_MS = 12000; // сколько висит строка последнего события

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

// ---------- каркас ----------
const card = el('section', 'card');
const title = el('span', 'title', '📺 Чат решает');
const timer = el('span', 'timer', '');
const head = el('div', 'head');
head.append(title, timer);
const dot = el('i', 'dot');
const statusText = el('span', '', '');
const statusWrap = el('span');
statusWrap.append(dot, statusText);
const phaseText = el('span', '', '');
const sub = el('div', 'sub');
sub.append(statusWrap, phaseText);
const rows = el('div', 'rows');
const mChaos = el('span', '', '');
const mHelp = el('span', '', '');
const mBar = el('span', 'bar');
const mBad = el('i');
const mGood = el('u');
mBar.append(mBad, mGood);
const meter = el('div', 'meter');
meter.append(mChaos, mBar, mHelp);
const result = el('div', 'result');
card.append(head, sub, rows, meter, result);
const eventBox = el('div', 'event hidden');
root.append(card, eventBox);

// ---------- отрисовка ----------
const fmt = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
let rowEls = new Map();
let shownEvent = 0;
let eventTimer = null;
let online = false; // есть связь с игрой; пока её нет, показания не рисуем — чтобы не врать
let current = null;

function renderRows(options) {
  const key = options.map((o) => o.cmd).join('|');
  if (rows.dataset.key !== key) {
    rows.dataset.key = key;
    rows.replaceChildren();
    rowEls = new Map();
    for (const o of options) {
      const name = el('span', '', `${o.icon} ${o.cmd}`);
      const fill = el('i');
      const bar = el('span', 'bar');
      bar.append(fill);
      const n = el('b', '', '0');
      const row = el('div', `row ${o.side}`);
      row.append(name, bar, n);
      rows.append(row);
      rowEls.set(o.cmd, { fill, n });
    }
  }
  const max = Math.max(1, ...options.map((o) => o.n));
  for (const o of options) {
    const r = rowEls.get(o.cmd);
    r.fill.style.width = `${(o.n / max) * 100}%`;
    if (r.n.textContent !== String(o.n)) r.n.textContent = String(o.n);
  }
}

function render(state) {
  current = state;
  if (!state?.active || !online) {
    root.classList.add('hidden');
    return;
  }
  root.classList.remove('hidden');
  const phase = state.paused ? 'paused' : state.phase;
  timer.className = `timer ${phase}`;
  timer.textContent = phase === 'pending' ? '…' : phase === 'paused' ? '⏸' : fmt(state.left);
  title.textContent = phase === 'cooldown' ? '📺 Пауза после события' : phase === 'pending' ? '📺 Выбор сделан' : '📺 Чат решает';
  dot.className = `dot ${state.status === 'connecting' ? 'connecting' : state.status === 'offline' ? 'offline' : ''}`;
  statusText.textContent = state.test ? 'тестовый чат' : [state.statusText, state.channel ? '#' + state.channel : ''].filter(Boolean).join(' · ');
  phaseText.textContent = state.paused ? 'чат на паузе' : state.waiting ? `${state.waiting.cmd}${state.waiting.why ? ' ждёт: ' + state.waiting.why : ''}` : state.powerLabel;
  renderRows(state.options);
  mChaos.textContent = `хаос ${state.meter.chaos}`;
  mHelp.textContent = `помощь ${state.meter.help}`;
  mBad.style.width = `${Math.round((1 - state.meter.share) * 100)}%`;
  mGood.style.width = `${Math.round(state.meter.share * 100)}%`;
  result.textContent = state.result;
  result.classList.toggle('hidden', !state.result);
  showEvent(state.event);
}

// Последнее событие на кухне: новая запись показывается на EVENT_SHOW_MS, затем гаснет.
function showEvent(ev) {
  if (!ev || !ev.id || ev.id === shownEvent) return;
  shownEvent = ev.id;
  eventBox.textContent = ev.text;
  eventBox.className = `event ${/помощ|убаюкал|подгоняет/i.test(ev.text) ? 'help' : ''}`;
  eventBox.style.animation = 'none';
  void eventBox.offsetWidth;
  eventBox.style.animation = '';
  clearTimeout(eventTimer);
  eventTimer = setTimeout(() => eventBox.classList.add('hidden'), EVENT_SHOW_MS);
}

function accept(raw) {
  online = true;
  render(raw);
}

// ---------- связь с игрой: SSE, запасной вариант — опрос /state ----------
let poll = null;
function startPolling() {
  if (poll) return;
  const tick = async () => {
    try {
      const r = await fetch('./state', { cache: 'no-store' });
      if (r.ok) accept(await r.json());
    } catch {
      online = false;
      render(current);
    }
  };
  tick();
  poll = setInterval(tick, 2000);
}

if (typeof EventSource === 'function') {
  const es = new EventSource('./events');
  es.onopen = () => {
    online = true;
    render(current);
  };
  es.addEventListener('state', (e) => {
    try {
      accept(JSON.parse(e.data));
    } catch {
      /* битый кадр пропускаем */
    }
  });
  es.onerror = () => {
    // EventSource переподключается сам; пока связи нет — прячем показания
    online = false;
    render(current);
  };
} else startPolling();
