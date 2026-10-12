// IPC режима стримера в основном процессе: игра присылает состояние голосования и просит включить/выключить сервер оверлея.
// Отдельный модуль без прямой зависимости от Electron (ipcMain передаётся снаружи) — проверяется в node:test.
'use strict';
const { createOverlayServer, DEFAULT_PORT } = require('./overlay-server.cjs');

/** Доверяем только странице самой игры (app://game/…): чужой фрейм или окно с другим адресом сервер не настраивает. */
const isGameUrl = (url) => /^app:\/\/game\//.test(String(url ?? ''));

/**
 * Подключить обработчики IPC. staticDir — папка собранной игры (в ней overlay.html).
 * Возвращает { info(), stop() }: текущее состояние сервера и остановка при выходе из приложения.
 */
function registerStreamIpc({ ipcMain, staticDir, createServer = createOverlayServer, trusted = isGameUrl }) {
  let server = null;
  let port = DEFAULT_PORT;
  let lastState = { v: 1, active: false };
  let error = '';
  let queue = Promise.resolve(); // настройки применяются по очереди: быстрые щелчки в меню не гонятся друг с другом

  const info = () => ({ running: !!server, port, url: `http://127.0.0.1:${port}/overlay`, error });
  const stop = async () => {
    const s = server;
    server = null;
    await s?.stop();
  };

  async function apply(cfg) {
    const wanted = Number.isInteger(cfg?.port) && cfg.port >= 1024 && cfg.port <= 65535 ? cfg.port : DEFAULT_PORT;
    error = '';
    if (!cfg?.enabled) {
      await stop();
      port = wanted;
      return info();
    }
    if (server && wanted === port) return info();
    await stop();
    port = wanted;
    const next = createServer({ staticDir, port });
    try {
      await next.start();
      server = next;
      server.setState(lastState);
    } catch (err) {
      error = err?.code === 'EADDRINUSE' ? `Порт ${port} занят другой программой — выбери другой порт` : 'Оверлей не запустился';
    }
    return info();
  }

  ipcMain.on('stream:state', (event, state) => {
    if (!trusted(event?.senderFrame?.url)) return;
    lastState = state;
    server?.setState(state);
  });
  ipcMain.handle('stream:overlay-config', (event, cfg) => {
    if (!trusted(event?.senderFrame?.url)) return { running: false, port, url: '', error: 'Нет доступа' };
    queue = queue.then(() => apply(cfg), () => apply(cfg));
    return queue;
  });

  return { info, stop };
}

module.exports = { registerStreamIpc, isGameUrl };
