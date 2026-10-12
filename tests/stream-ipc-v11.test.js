// 0.11, режим стримера: IPC оболочки (desktop/stream-ipc.cjs) без Electron — поддельный ipcMain и поддельные серверы.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { registerStreamIpc, isGameUrl } = require('../desktop/stream-ipc.cjs');
const { createOverlayServer } = require('../desktop/overlay-server.cjs');

const GAME = { senderFrame: { url: 'app://game/index.html' } };
const STRANGER = { senderFrame: { url: 'https://evil.example/' } };

function rig(over = {}) {
  const handlers = {};
  const ipcMain = { on: (ch, fn) => (handlers[`on:${ch}`] = fn), handle: (ch, fn) => (handlers[`handle:${ch}`] = fn) };
  const made = [];
  const createServer = over.createServer ?? (({ port }) => {
    const s = { port, started: false, stopped: false, states: [], async start() { s.started = true; }, async stop() { s.stopped = true; }, setState(x) { s.states.push(x); } };
    made.push(s);
    return s;
  });
  const host = registerStreamIpc({ ipcMain, staticDir: '/game', createServer });
  return { host, made, state: (e, x) => handlers['on:stream:state'](e, x), config: (e, c) => handlers['handle:stream:overlay-config'](e, c) };
}

test('доверяем только странице игры app://game/', () => {
  assert.equal(isGameUrl('app://game/index.html'), true);
  for (const u of ['https://evil.example/', 'app://other/x', 'file:///etc/passwd', '', undefined, 'http://127.0.0.1:17771/overlay']) assert.equal(isGameUrl(u), false, String(u));
});

test('включение: сервер стартует на порту по умолчанию 17771 из папки игры, состояние доходит до него', async () => {
  const r = rig();
  const info = await r.config(GAME, { enabled: true, port: 17771 });
  assert.deepEqual(info, { running: true, port: 17771, url: 'http://127.0.0.1:17771/overlay', error: '' });
  assert.equal(r.made.length, 1);
  r.state(GAME, { v: 1, active: true });
  assert.deepEqual(r.made[0].states.at(-1), { v: 1, active: true });
});

test('состояние, присланное до запуска сервера, доставляется при запуске', async () => {
  const r = rig();
  r.state(GAME, { v: 1, active: true, left: 12 });
  await r.config(GAME, { enabled: true, port: 18000 });
  assert.deepEqual(r.made[0].states, [{ v: 1, active: true, left: 12 }]);
});

test('чужая страница не настраивает сервер и не присылает состояние', async () => {
  const r = rig();
  const info = await r.config(STRANGER, { enabled: true, port: 17771 });
  assert.equal(info.running, false);
  assert.match(info.error, /Нет доступа/);
  assert.equal(r.made.length, 0);
  await r.config(GAME, { enabled: true, port: 17771 });
  r.state(STRANGER, { v: 1, active: true });
  assert.equal(r.made[0].states.length, 1, 'только повтор последнего известного (пустого) состояния при запуске');
  assert.equal(r.made[0].states[0].active, false);
});

test('порт проверяется: вне 1024–65535 и не число — порт по умолчанию', async () => {
  for (const port of [80, 70000, NaN, 1.5, undefined, null]) {
    const r = rig();
    const info = await r.config(GAME, { enabled: true, port });
    assert.equal(info.port, 17771, String(port));
  }
  const r = rig();
  assert.equal((await r.config(GAME, { enabled: true, port: 19000 })).port, 19000);
});

test('тот же порт — без перезапуска; новый порт — старый сервер остановлен; выключение — остановка', async () => {
  const r = rig();
  await r.config(GAME, { enabled: true, port: 18001 });
  await r.config(GAME, { enabled: true, port: 18001 });
  assert.equal(r.made.length, 1);
  await r.config(GAME, { enabled: true, port: 18002 });
  assert.equal(r.made.length, 2);
  assert.equal(r.made[0].stopped, true);
  const off = await r.config(GAME, { enabled: false, port: 18002 });
  assert.equal(off.running, false);
  assert.equal(r.made[1].stopped, true);
  r.state(GAME, { v: 1, active: true });
  assert.equal(r.made[1].states.length, 1, 'после выключения состояние никому не уходит');
});

test('порт занят: понятная ошибка вместо падения, потом можно выбрать другой', async () => {
  let n = 0;
  const r = rig({
    createServer: ({ port }) => ({
      async start() {
        if (n++ === 0) throw Object.assign(new Error('busy'), { code: 'EADDRINUSE' });
      },
      async stop() {},
      setState() {},
      port,
    }),
  });
  const bad = await r.config(GAME, { enabled: true, port: 17771 });
  assert.equal(bad.running, false);
  assert.match(bad.error, /Порт 17771 занят/);
  const good = await r.config(GAME, { enabled: true, port: 17772 });
  assert.equal(good.running, true);
  assert.equal(good.error, '');
});

test('быстрые щелчки в настройках применяются по очереди: итог — последний запрос', async () => {
  const r = rig();
  const all = await Promise.all([r.config(GAME, { enabled: true, port: 18010 }), r.config(GAME, { enabled: false, port: 18010 }), r.config(GAME, { enabled: true, port: 18011 })]);
  assert.equal(all.at(-1).port, 18011);
  assert.equal(r.host.info().running, true);
  assert.equal(r.made.filter((s) => !s.stopped).length, 1);
});

test('со настоящим сервером: состояние из игры видно в /state, остановка освобождает порт', async () => {
  const free = await new Promise((ok) => net.createServer().listen(0, '127.0.0.1', function () { const p = this.address().port; this.close(() => ok(p)); }));
  const r = rig({ createServer: createOverlayServer });
  const info = await r.config(GAME, { enabled: true, port: free });
  assert.equal(info.running, true, info.error);
  r.state(GAME, { active: true, status: 'online', phase: 'voting', left: 20, options: [] });
  const body = await new Promise((ok, bad) => http.get({ host: '127.0.0.1', port: free, path: '/state', agent: false }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => ok(JSON.parse(d))); }).on('error', bad));
  assert.equal(body.active, true);
  assert.equal(body.left, 20);
  // тот же порт занимает второй экземпляр — понятная ошибка
  const busy = rig({ createServer: createOverlayServer });
  const err = await busy.config(GAME, { enabled: true, port: free });
  assert.equal(err.running, false);
  assert.match(err.error, /занят/);
  await r.host.stop();
});
