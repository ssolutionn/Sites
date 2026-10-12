// Локальный сервер оверлея для OBS (Browser Source): страница /overlay, состояние /state (JSON) и поток /events (SSE).
// Слушает только 127.0.0.1 и отвечает только локальным запросам. Состояние принимает не по сети, а из игры (setState через IPC
// оболочки): записывающих запросов нет вовсе. Модуль без Electron — те же функции работают в тестах и в scripts/overlay-dev.mjs.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 17771;
const HEARTBEAT_MS = 15000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

// Страница оверлея грузит только свои файлы и подключается только к этому же серверу.
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Адрес сокета — петля (127.0.0.0/8, ::1 или IPv4 внутри IPv6). */
function isLoopbackAddress(addr) {
  const a = String(addr ?? '');
  return a === '::1' || /^(::ffff:)?127(\.\d{1,3}){3}$/i.test(a);
}

/**
 * Запрос локальный: сокет с петли и заголовок Host указывает на этот же сервер (127.0.0.1, localhost или [::1] с нашим портом).
 * Проверка Host защищает от «DNS rebinding»: чужая страница в браузере не прочитает состояние через подменённое имя.
 */
function isLocalRequest(req, port) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  const host = String(req.headers?.host ?? '').toLowerCase();
  const m = host.match(/^(127\.0\.0\.1|localhost|\[::1\])(?::(\d+))?$/);
  if (!m) return false;
  return m[2] === undefined ? port === 80 : Number(m[2]) === port;
}

const pick = (v, list, d = '') => (list.includes(v) ? v : d);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, '').slice(0, max) : '');
const int = (v, lo, hi) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

/**
 * Белый список полей состояния оверлея. Всё, что пришло извне модуля, проходит здесь: типы, длины, допустимые значения.
 * Чужие поля отбрасываются, строки укорачиваются, управляющие знаки вырезаются; страница оверлея выводит текст только через textContent.
 */
function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || raw.active !== true) return { v: 1, active: false };
  const options = Array.isArray(raw.options)
    ? raw.options
        .slice(0, 8)
        .filter((o) => o && typeof o.cmd === 'string' && /^![\p{L}\p{N}_]{1,20}$/u.test(o.cmd))
        .map((o) => ({ cmd: o.cmd, icon: clean(o.icon, 8), side: pick(o.side, ['chaos', 'help'], 'chaos'), n: int(o.n, 0, 1e6) }))
    : [];
  const m = raw.meter && typeof raw.meter === 'object' ? raw.meter : {};
  const share = Number(m.share);
  const w = raw.waiting && typeof raw.waiting === 'object' ? raw.waiting : null;
  const e = raw.event && typeof raw.event === 'object' ? raw.event : null;
  return {
    v: 1,
    active: true,
    status: pick(raw.status, ['idle', 'connecting', 'online', 'offline', 'test'], 'idle'),
    statusText: clean(raw.statusText, 40),
    channel: typeof raw.channel === 'string' && /^[a-z0-9_]{3,25}$/.test(raw.channel) ? raw.channel : '',
    test: raw.test === true,
    phase: pick(raw.phase, ['voting', 'pending', 'cooldown'], 'voting'),
    paused: raw.paused === true,
    left: int(raw.left, 0, 3600),
    window: int(raw.window, 0, 3600),
    power: pick(raw.power, ['soft', 'normal', 'chaos']),
    powerLabel: clean(raw.powerLabel, 20),
    options,
    total: int(raw.total, 0, 1e6),
    meter: { chaos: int(m.chaos, 0, 1e6), help: int(m.help, 0, 1e6), share: Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0.5 },
    waiting: w && typeof w.cmd === 'string' && /^![\p{L}\p{N}_]{1,20}$/u.test(w.cmd) ? { cmd: w.cmd, why: clean(w.why, 60) } : null,
    result: clean(raw.result, 120),
    event: e ? { id: int(e.id, 0, 1e9), text: clean(e.text, 120) } : null,
  };
}

/**
 * Сервер оверлея. staticDir — папка с собранной игрой (в ней overlay.html и assets/). port 0 — любой свободный (тесты).
 * Методы: start() → Promise<число порта>, stop() → Promise, setState(сырое состояние), getState(), clients().
 */
function createOverlayServer({ staticDir, port = DEFAULT_PORT, host = HOST } = {}) {
  if (!isLoopbackAddress(host)) throw new Error('Оверлей слушает только 127.0.0.1');
  let state = { v: 1, active: false };
  let rev = 0;
  let json = JSON.stringify(state);
  let actualPort = port;
  const sse = new Set();
  let beat = null;
  const root = staticDir ? path.resolve(staticDir) : null;

  const headers = (type, extra = {}) => ({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin', ...extra });
  const deny = (res, code, text) => {
    res.writeHead(code, headers('text/plain; charset=utf-8'));
    res.end(text);
  };
  const frame = () => `event: state\nid: ${rev}\ndata: ${json}\n\n`;

  function sendFile(req, res, file, type, extra = {}) {
    fs.readFile(file, (err, buf) => {
      if (err) return deny(res, 404, 'Not found');
      res.writeHead(200, headers(type, { 'Content-Length': buf.length, ...extra }));
      res.end(req.method === 'HEAD' ? undefined : buf);
    });
  }

  const server = http.createServer((req, res) => {
    if (!isLocalRequest(req, actualPort)) return deny(res, 403, 'Forbidden');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return deny(res, 405, 'Method not allowed');
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      return deny(res, 400, 'Bad request');
    }
    if (pathname === '/overlay' || pathname === '/overlay.html' || pathname === '/') {
      if (!root) return deny(res, 404, 'Not found');
      return sendFile(req, res, path.join(root, 'overlay.html'), MIME['.html'], { 'Content-Security-Policy': CSP });
    }
    if (pathname === '/state') {
      res.writeHead(200, headers(MIME['.json']));
      return res.end(req.method === 'HEAD' ? undefined : json);
    }
    if (pathname === '/events') {
      res.writeHead(200, headers('text/event-stream; charset=utf-8', { Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }));
      res.write('retry: 2000\n\n');
      res.write(frame());
      sse.add(res);
      req.on('close', () => sse.delete(res));
      return;
    }
    if (pathname.startsWith('/assets/') && root) {
      const file = path.resolve(root, '.' + pathname);
      const assets = path.join(root, 'assets') + path.sep;
      const type = MIME[path.extname(file).toLowerCase()];
      if (!file.startsWith(assets) || !type) return deny(res, 404, 'Not found');
      return sendFile(req, res, file, type);
    }
    return deny(res, 404, 'Not found');
  });

  return {
    /** Запустить; промис отклоняется с err.code (например, EADDRINUSE), если порт занят. */
    start() {
      return new Promise((resolve, reject) => {
        const onError = (err) => reject(err);
        server.once('error', onError);
        server.listen(port, host, () => {
          server.off('error', onError);
          actualPort = server.address().port;
          beat = setInterval(() => {
            for (const res of sse) res.write(': ping\n\n');
          }, HEARTBEAT_MS);
          beat.unref?.();
          resolve(actualPort);
        });
      });
    },
    stop() {
      clearInterval(beat);
      for (const res of sse) res.end();
      sse.clear();
      return new Promise((resolve) => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
    /** Принять новое состояние из игры и разослать подписчикам, если оно изменилось. */
    setState(raw) {
      const next = normalizeState(raw);
      const nextJson = JSON.stringify(next);
      if (nextJson === json) return false;
      state = next;
      json = nextJson;
      rev++;
      const f = frame();
      for (const res of sse) res.write(f);
      return true;
    },
    getState: () => state,
    clients: () => sse.size,
    get port() {
      return actualPort;
    },
  };
}

module.exports = { createOverlayServer, normalizeState, isLocalRequest, isLoopbackAddress, DEFAULT_PORT, HOST };
