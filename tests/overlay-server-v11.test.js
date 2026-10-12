// 0.11, режим стримера: локальный сервер оверлея для OBS (desktop/overlay-server.cjs) — запуск, страница, JSON, SSE,
// отказ не-локальным запросам, белый список полей состояния.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { createOverlayServer, normalizeState, isLocalRequest, isLoopbackAddress, DEFAULT_PORT } = createRequire(import.meta.url)('../desktop/overlay-server.cjs');

// папка «собранной игры»: overlay.html и assets/ (ничего настоящего не нужно)
function site() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-test-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'overlay.html'), '<!doctype html><title>Оверлей</title><p id="ov">ok</p>');
  fs.writeFileSync(path.join(dir, 'assets', 'a.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dir, 'assets', 'font.woff2'), 'FONT');
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'секрет');
  return dir;
}
async function up(opts = {}) {
  const dir = site();
  const srv = createOverlayServer({ staticDir: dir, port: 0, ...opts });
  const port = await srv.start();
  return { srv, port, dir, done: async () => { await srv.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
const get = (port, p, { method = 'GET', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: p, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
const ACTIVE = { active: true, status: 'online', statusText: 'в чате', channel: 'streamer', phase: 'voting', left: 30, window: 45, power: 'normal', powerLabel: 'Нормально', options: [{ cmd: '!кот', icon: '🐱', side: 'chaos', n: 3 }], total: 3, meter: { chaos: 3, help: 0, share: 0 } };

test('запуск: слушает 127.0.0.1, порт по умолчанию 17771, начальное состояние «не активен»', async () => {
  assert.equal(DEFAULT_PORT, 17771);
  const t = await up();
  try {
    assert.equal(t.srv.port, t.port);
    const r = await get(t.port, '/state');
    assert.equal(r.status, 200);
    assert.match(r.headers['content-type'], /^application\/json/);
    assert.deepEqual(JSON.parse(r.body), { v: 1, active: false });
    assert.equal(r.headers['cache-control'], 'no-store');
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.equal(t.srv.getState().active, false);
  } finally {
    await t.done();
  }
});

test('сервер не принимает адрес, кроме петли: наружу не слушает', () => {
  for (const host of ['0.0.0.0', '192.168.1.5', '::', 'example.com']) assert.throws(() => createOverlayServer({ port: 0, host }), /127\.0\.0\.1/, host);
  assert.doesNotThrow(() => createOverlayServer({ port: 0, host: '127.0.0.1' }));
});

test('/overlay отдаёт страницу оверлея, с защитной политикой; /assets — только файлы из assets', async () => {
  const t = await up();
  try {
    const page = await get(t.port, '/overlay');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /^text\/html/);
    assert.match(page.body, /id="ov"/);
    assert.match(page.headers['content-security-policy'], /default-src 'self'/);
    assert.match(page.headers['content-security-policy'], /connect-src 'self'/);
    assert.equal((await get(t.port, '/')).status, 200);
    const js = await get(t.port, '/assets/a.js');
    assert.equal(js.status, 200);
    assert.match(js.headers['content-type'], /javascript/);
    assert.equal((await get(t.port, '/assets/font.woff2')).headers['content-type'], 'font/woff2');
    assert.equal((await get(t.port, encodeURI('/assets/нет.js'))).status, 404);
    assert.equal((await get(t.port, '/assets/a.exe')).status, 404, 'неизвестный тип не отдаём');
    assert.equal((await get(t.port, '/nothing')).status, 404);
    assert.equal((await get(t.port, '/secret.txt')).status, 404, 'файлы вне assets не отдаём');
  } finally {
    await t.done();
  }
});

test('обход каталогов (../, %2e%2e, обратные слэши) не выводит за assets', async () => {
  const t = await up();
  try {
    for (const p of ['/assets/../secret.txt', '/assets/%2e%2e/secret.txt', '/assets/..%2fsecret.txt', '/assets/%2e%2e%2f%2e%2e%2fetc/passwd', '/assets/..\\secret.txt']) {
      const r = await get(t.port, p);
      assert.notEqual(r.status, 200, p);
      assert.doesNotMatch(r.body, /секрет/, p);
    }
  } finally {
    await t.done();
  }
});

test('setState: состояние проходит белый список и отдаётся в /state; повтор того же — без изменений', async () => {
  const t = await up();
  try {
    assert.equal(t.srv.setState({ ...ACTIVE, evil: '<script>', options: [...ACTIVE.options, { cmd: 'не команда', n: 1 }] }), true);
    const s = JSON.parse((await get(t.port, '/state')).body);
    assert.equal(s.active, true);
    assert.equal(s.options.length, 1);
    assert.equal('evil' in s, false);
    assert.equal(t.srv.setState({ ...ACTIVE }), false, 'то же состояние — не рассылаем заново');
  } finally {
    await t.done();
  }
});

// читает поток SSE, пока не накопится нужное число событий state
function sse(port, headers = {}) {
  const events = [];
  let waiter = null;
  const req = http.get({ host: '127.0.0.1', port, path: '/events', headers, agent: false });
  const p = new Promise((resolve, reject) => {
    req.on('response', (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block.split('\n').find((l) => l.startsWith('data: '));
          if (data) events.push(JSON.parse(data.slice(6)));
          waiter?.();
        }
      });
      resolve({ res, events, close: () => req.destroy(), next: (n) => new Promise((ok) => { const check = () => (events.length >= n ? ok(events) : (waiter = check)); check(); }) });
    });
    req.on('error', reject);
  });
  return p;
}

test('SSE /events: сразу текущее состояние, затем каждое изменение', async () => {
  const t = await up();
  const c = await sse(t.port);
  try {
    assert.match(c.res.headers['content-type'], /^text\/event-stream/);
    const first = await c.next(1);
    assert.deepEqual(first[0], { v: 1, active: false });
    t.srv.setState(ACTIVE);
    const two = await c.next(2);
    assert.equal(two[1].active, true);
    assert.equal(two[1].options[0].cmd, '!кот');
    t.srv.setState({ ...ACTIVE, left: 29 });
    const three = await c.next(3);
    assert.equal(three[2].left, 29);
    assert.equal(t.srv.clients(), 1);
  } finally {
    c.close();
    await t.done();
  }
});

test('новый подписчик SSE сразу получает актуальное состояние, а не пустое', async () => {
  const t = await up();
  t.srv.setState(ACTIVE);
  const c = await sse(t.port);
  try {
    assert.equal((await c.next(1))[0].left, 30);
  } finally {
    c.close();
    await t.done();
  }
});

test('stop() закрывает подписчиков и освобождает порт', async () => {
  const t = await up();
  const c = await sse(t.port);
  await c.next(1);
  const closed = new Promise((ok) => c.res.on('close', ok));
  await t.srv.stop();
  await closed;
  assert.equal(t.srv.clients(), 0);
  await new Promise((ok, bad) => net.createServer().once('error', bad).listen(t.port, '127.0.0.1', function () { this.close(ok); }));
  fs.rmSync(t.dir, { recursive: true, force: true });
});

test('чужой Host (DNS rebinding) и чужое имя — 403, даже если сокет локальный', async () => {
  const t = await up();
  try {
    for (const host of ['evil.example', 'evil.example:' + t.port, '127.0.0.1.evil.example:' + t.port, '127.0.0.1:1', 'localhost:' + (t.port + 1), '0.0.0.0:' + t.port]) {
      for (const p of ['/state', '/overlay', '/events']) {
        const r = await get(t.port, p, { headers: { Host: host } });
        assert.equal(r.status, 403, `${host} ${p}`);
        assert.doesNotMatch(r.body, /active/, 'состояние не утекает');
      }
    }
    assert.equal((await get(t.port, '/state', { headers: { Host: `localhost:${t.port}` } })).status, 200);
    assert.equal((await get(t.port, '/state', { headers: { Host: `127.0.0.1:${t.port}` } })).status, 200);
  } finally {
    await t.done();
  }
});

test('isLocalRequest: нелокальный адрес сокета отклоняется, петля — принимается', () => {
  const req = (addr, host) => ({ socket: { remoteAddress: addr }, headers: { host } });
  assert.equal(isLocalRequest(req('127.0.0.1', '127.0.0.1:17771'), 17771), true);
  assert.equal(isLocalRequest(req('::1', '[::1]:17771'), 17771), true);
  assert.equal(isLocalRequest(req('::ffff:127.0.0.1', 'localhost:17771'), 17771), true);
  for (const addr of ['192.168.1.20', '10.0.0.5', '8.8.8.8', '::ffff:192.168.1.20', 'fe80::1', '', undefined]) assert.equal(isLocalRequest(req(addr, '127.0.0.1:17771'), 17771), false, String(addr));
  assert.equal(isLocalRequest({ headers: {} }, 17771), false);
  assert.equal(isLocalRequest(req('127.0.0.1', undefined), 17771), false, 'без Host не принимаем');
  assert.equal(isLoopbackAddress('127.255.0.1'), true);
  assert.equal(isLoopbackAddress('128.0.0.1'), false);
});

test('записать состояние по сети нельзя: POST/PUT/DELETE — 405, состояние не меняется', async () => {
  const t = await up();
  try {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const r = await get(t.port, '/state', { method });
      assert.equal(r.status, 405, method);
      assert.match(r.headers.allow, /GET/);
    }
    assert.equal(t.srv.getState().active, false);
    assert.equal((await get(t.port, '/state', { method: 'HEAD' })).status, 200);
  } finally {
    await t.done();
  }
});

test('CORS не включён: чужая страница не может читать состояние из браузера', async () => {
  const t = await up();
  try {
    const r = await get(t.port, '/state', { headers: { Origin: 'https://evil.example' } });
    assert.equal(r.headers['access-control-allow-origin'], undefined);
    assert.equal(r.headers['cross-origin-resource-policy'], 'same-origin');
  } finally {
    await t.done();
  }
});

test('занятый порт: запуск отклоняется с кодом EADDRINUSE (игра покажет «порт занят»)', async () => {
  const t = await up();
  const other = createOverlayServer({ staticDir: t.dir, port: t.port });
  try {
    await assert.rejects(other.start(), (e) => e.code === 'EADDRINUSE');
  } finally {
    await t.done();
  }
});

test('белый список состояния: типы, длины, команды, диапазоны', () => {
  assert.deepEqual(normalizeState(null), { v: 1, active: false });
  assert.deepEqual(normalizeState({ active: 'yes' }), { v: 1, active: false });
  assert.deepEqual(normalizeState('строка'), { v: 1, active: false });
  const s = normalizeState({
    active: true,
    status: 'взлом',
    statusText: 'в\u0000 чате'.padEnd(200, 'я'),
    channel: 'Bad Channel!',
    phase: 'какая-то',
    left: -5,
    window: 1e9,
    options: [{ cmd: '!кот', icon: '🐱', side: 'x', n: -3 }, { cmd: '<img>', n: 1 }, { cmd: '!радио', n: 1e12 }, null, 5],
    meter: { chaos: 2, help: 'много', share: 7 },
    waiting: { cmd: '!гость', why: 'ж'.repeat(500) },
    result: 'r\n'.repeat(500),
    event: { id: 'x', text: 'событие' },
    extra: { deep: 1 },
  });
  assert.equal(s.status, 'idle');
  assert.ok(s.statusText.length <= 40 && !s.statusText.includes('\u0000'));
  assert.equal(s.channel, '');
  assert.equal(s.phase, 'voting');
  assert.equal(s.left, 0);
  assert.equal(s.window, 3600);
  assert.deepEqual(s.options.map((o) => o.cmd), ['!кот', '!радио']);
  assert.equal(s.options[0].side, 'chaos');
  assert.equal(s.options[0].n, 0);
  assert.equal(s.options[1].n, 1e6);
  assert.deepEqual(s.meter, { chaos: 2, help: 0, share: 1 });
  assert.equal(s.waiting.why.length, 60);
  assert.ok(s.result.length <= 120 && !s.result.includes('\n'));
  assert.deepEqual(s.event, { id: 0, text: 'событие' });
  assert.equal('extra' in s, false);
  assert.equal(normalizeState({ active: true, channel: 'streamer_1' }).channel, 'streamer_1');
});
