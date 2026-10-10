// Десктопная оболочка «Симулятора новогодней суеты» (macOS, Windows).
// Игра — та же веб-сборка dist/, загружается из файлов приложения через протокол app://,
// чтобы работали ES-модули, localStorage и звук без веб-сервера.
const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const fs = require('node:fs');
// в собранном приложении игра лежит рядом (game/), при запуске из исходников — в ../dist
const GAME_DIR = fs.existsSync(path.join(__dirname, 'game')) ? path.join(__dirname, 'game') : path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'Симулятор новогодней суеты',
    backgroundColor: '#f3e6cf',
    show: false,
    // в собранной игре консоль разработчика выключена: через неё правятся баллы и сохранение (в запуске из исходников она нужна)
    webPreferences: { contextIsolation: true, sandbox: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false, devTools: !app.isPackaged },
  });
  win.once('ready-to-show', () => win.show());
  // внешние ссылки — в системный браузер
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('app://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL('app://game/index.html');
  if (process.env.SUETA_SMOKE) smoke(win);
}

// Самопроверка сборки (SUETA_SMOKE=путь.png): ошибки консоли, состояние игры, снимок окна, выход.
function smoke(win) {
  const errors = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') errors.push(e.message);
  });
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      const state = await win.webContents.executeJavaScript(`({ mode: window.__sueta?.mode, ls: (() => { try { localStorage.setItem('t','1'); return localStorage.getItem('t'); } catch (e) { return String(e); } })(), webgl: !!document.createElement('canvas').getContext('webgl2') })`);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SUETA_SMOKE, img.toPNG());
      console.log('SMOKE', JSON.stringify({ state, errors }));
      app.quit();
    }, 8000);
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ label: app.name, submenu: [{ role: 'about', label: 'О игре' }, { type: 'separator' }, { role: 'hide', label: 'Скрыть' }, { role: 'quit', label: 'Выйти' }] }] : []),
      { label: 'Вид', submenu: [{ role: 'togglefullscreen', label: 'Полный экран' }, { role: 'reload', label: 'Перезапустить' }, ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools', label: 'Инструменты разработчика' }])] },
      { label: 'Окно', submenu: [{ role: 'minimize', label: 'Свернуть' }, ...(isMac ? [] : [{ role: 'quit', label: 'Выйти' }])] },
    ]),
  );
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(GAME_DIR, decodeURIComponent(pathname)));
    // файл должен лежать внутри папки игры: «GAME_DIR + разделитель», иначе соседняя папка с тем же началом имени тоже прошла бы
    if (file !== GAME_DIR && !file.startsWith(GAME_DIR + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
