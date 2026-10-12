// Мост между игрой и оболочкой для режима стримера. Страница игры работает без nodeIntegration (contextIsolation, sandbox):
// наружу выставлены две функции, ничего лишнего. Состояние оверлея уходит только в основной процесс — он отдаёт его
// локальному серверу (overlay-server.cjs); читать из оболочки игра ничего не может, кроме ответа на настройку.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('suetaDesktop', {
  /** Отдать оверлею OBS новое состояние голосования (объект; сервер сам отфильтрует поля). */
  publishStream: (state) => ipcRenderer.send('stream:state', state),
  overlay: {
    /** Включить или выключить сервер оверлея и выбрать порт: { enabled, port } → { running, port, url, error }. */
    configure: (cfg) => ipcRenderer.invoke('stream:overlay-config', { enabled: !!cfg?.enabled, port: Number(cfg?.port) }),
  },
});
