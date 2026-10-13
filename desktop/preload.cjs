// Мост между игрой и окном Electron (0.11, настройки): только полный экран, больше ничего наружу не отдаём.
// Игра видит window.suetaDesktop (src/fullscreen.js); без этого файла она работает через Fullscreen API браузера.
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
});
