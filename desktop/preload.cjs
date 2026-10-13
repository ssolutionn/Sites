// Мост между игрой и оболочкой Electron. Страница игры работает без nodeIntegration (contextIsolation, sandbox):
// наружу выставлены только нужные функции — полный экран (настройки 0.11) и состояние оверлея для OBS (режим стримера).
// Игра видит window.suetaDesktop (src/fullscreen.js, src/stream.js); без этого файла она работает через API браузера.
// Состояние оверлея уходит только в основной процесс — он отдаёт его локальному серверу (overlay-server.cjs).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('suetaDesktop', {
  /** Окно сейчас в полном экране? Promise<boolean>. */
  isFullscreen: () => ipcRenderer.invoke('sueta:fullscreen:get'),
  /** Включить или выключить полный экран. Promise<boolean> — что запрошено. */
  setFullscreen: (on) => ipcRenderer.invoke('sueta:fullscreen:set', !!on),
  /** Окно вошло в полный экран или вышло (в том числе из меню «Вид» и по F11). Возвращает функцию отписки. */
  onFullscreen: (cb) => {
    const handler = (_e, on) => cb(!!on);
    ipcRenderer.on('sueta:fullscreen', handler);
    return () => ipcRenderer.removeListener('sueta:fullscreen', handler);
  },
  /** Отдать оверлею OBS новое состояние голосования (объект; сервер сам отфильтрует поля). */
  publishStream: (state) => ipcRenderer.send('stream:state', state),
  overlay: {
    /** Включить или выключить сервер оверлея и выбрать порт: { enabled, port } → { running, port, url, error }. */
    configure: (cfg) => ipcRenderer.invoke('stream:overlay-config', { enabled: !!cfg?.enabled, port: Number(cfg?.port) }),
  },
});
