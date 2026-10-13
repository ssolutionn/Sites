// Оверлей для OBS отдельно от игры — для проверки в браузере. Тот же сервер, что в оболочке для компьютера (desktop/overlay-server.cjs).
//   npx vite build && node scripts/overlay-dev.mjs [--port 4186] [--dir dist] [--demo]
// --demo: сервер сам гонит выдуманное голосование (45 секунд по кругу), чтобы посмотреть страницу без игры.
// Из других скриптов: import { startOverlayDev } from './overlay-dev.mjs' → { server, port, stop() }; server.setState(...) заменяет IPC игры.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const { createOverlayServer } = createRequire(import.meta.url)('../desktop/overlay-server.cjs');

const OPTIONS = [['!кот', '🐱', 'chaos'], ['!гость', '🙏', 'chaos'], ['!радио', '📻', 'chaos'], ['!гирлянда', '💡', 'chaos'], ['!помощь', '🍀', 'help']];

/** Выдуманное состояние для демо: t — секунды от начала круга. Без случайности — каждый показ одинаков. */
export function demoState(t, window = 45) {
  const k = Math.min(1, t / window);
  const options = OPTIONS.map(([cmd, icon, side], i) => ({ cmd, icon, side, n: Math.round(k * [7, 3, 4, 2, 5][i]) }));
  const chaos = options.filter((o) => o.side === 'chaos').reduce((a, o) => a + o.n, 0);
  const help = options.filter((o) => o.side === 'help').reduce((a, o) => a + o.n, 0);
  const total = chaos + help;
  return {
    v: 1, active: true, status: 'online', statusText: 'в чате', channel: 'demo_channel', test: false, phase: 'voting', paused: false,
    left: Math.max(0, Math.ceil(window - t)), window, power: 'normal', powerLabel: 'Нормально', options, total,
    meter: { chaos, help, share: total ? help / total : 0.5 },
    waiting: null,
    result: t > 4 && t < 12 ? 'Победило !кот — 7 из 12 голосов' : '',
    event: t > 4 ? { id: 1, text: 'Чат разбудил кота — он голоден!' } : null,
  };
}

export async function startOverlayDev({ port = 4186, dir = 'dist', demo = false } = {}) {
  const server = createOverlayServer({ staticDir: dir, port });
  const actual = await server.start();
  let timer = null;
  if (demo) {
    const t0 = Date.now();
    const tick = () => server.setState(demoState(((Date.now() - t0) / 1000) % 45));
    tick();
    timer = setInterval(tick, 1000);
  }
  return {
    server,
    port: actual,
    async stop() {
      clearInterval(timer);
      await server.stop();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, d) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const dev = await startOverlayDev({ port: Number(arg('port', 4186)), dir: arg('dir', 'dist'), demo: process.argv.includes('--demo') });
  console.log(`Оверлей: http://127.0.0.1:${dev.port}/overlay  (Ctrl+C — остановить)`);
  process.on('SIGINT', async () => {
    await dev.stop();
    process.exit(0);
  });
}
