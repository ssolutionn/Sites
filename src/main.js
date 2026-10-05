// Точка входа: состояния приложения (меню → инструкция → попытка ⇄ пауза → результат)
// и главный цикл. Игровое время продвигается только здесь и только в режиме 'playing'.
import { CONFIG } from './config.js';
import { Game } from './game/game.js';
import { SceneView } from './view/scene.js';
import { loadLogo } from './view/textures.js';
import { UI } from './ui/ui.js';
import { Sound } from './audio/sound.js';

const params = new URLSearchParams(location.search);
const devMode = params.has('dev');
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
let booted = false;

function fatal(title, details = '') {
  const f = document.getElementById('fatal');
  f.classList.remove('hidden');
  f.innerHTML = `<div class="card"><h2 style="margin-top:0">${title}</h2><p>${details}</p>
    <p class="small">Попробуйте свежую версию Chrome, Safari или Firefox и включённое аппаратное ускорение.</p></div>`;
}

window.addEventListener('error', (e) => {
  if (!booted) fatal('Игра не загрузилась', String(e.message || 'Ошибка загрузки ресурсов'));
});
window.addEventListener('unhandledrejection', (e) => {
  if (!booted) fatal('Игра не загрузилась', String(e.reason?.message || e.reason || ''));
});

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function boot() {
  if (!webglAvailable()) {
    fatal('WebGL недоступен', 'Браузер не может показать 3D-кухню: WebGL выключен или не поддерживается.');
    return;
  }
  const canvas = document.getElementById('scene');
  let scene;
  try {
    scene = new SceneView(canvas);
  } catch (err) {
    fatal('Не удалось запустить 3D-сцену', String(err?.message || err));
    return;
  }
  loadLogo();

  const sound = new Sound();
  let mode = 'menu'; // menu | instructions | playing | paused | result
  let game = null;
  let resultTimer = 0;
  let lastNdc = null;

  // Все действия игрока идут через act(): только при активной попытке.
  const DENY_ON_FALSE = new Set(['goTo', 'transfer', 'takePotato', 'selectIngredient', 'setHold', 'reduceHeat', 'takeReplacement']);
  function act(name, ...args) {
    if (!game || mode !== 'playing') return false;
    const fn = game[name];
    if (typeof fn !== 'function') return false;
    const r = fn.apply(game, args);
    if (r === false && DENY_ON_FALSE.has(name) && !(name === 'setHold' && args[1] === false)) sound.play('deny');
    return r;
  }

  const SOUND_OF = {
    cut: 'chop',
    select: 'select',
    rotate: 'rotate',
    transfer: 'transfer',
    catStart: 'meow',
    catShooed: 'shoo',
    catStole: 'hiss',
    phoneNotify: 'phone',
    potBoil: 'boil',
    spill: 'spill',
    potSaved: 'fixed',
    garlandOff: 'garlandOff',
    garlandFixed: 'fixed',
    potatoReady: 'ready',
    added: 'added',
    potPlaced: 'added',
    potatoTaken: 'added',
    replacement: 'added',
  };

  function dispatch(e) {
    scene.onEvent(e);
    ui.onEvent(e, game);
    if (e.type === 'actionStart' && e.action !== 'cut' && e.action !== 'shoo') sound.play('work');
    else if (e.type === 'finish') sound.play(e.success ? 'success' : 'fail');
    else if (SOUND_OF[e.type]) sound.play(SOUND_OF[e.type]);
  }

  const app = {
    devMode,
    isMuted: () => sound.muted,
    toggleMute() {
      sound.unlock();
      sound.setMuted(!sound.muted);
    },
    play() {
      newAttempt();
      mode = 'instructions';
      ui.showInstructions();
    },
    startRound() {
      mode = 'playing';
      ui.hideOverlay();
      ui.showGame();
    },
    pause() {
      if (mode !== 'playing') return;
      mode = 'paused';
      ui.releaseHolds();
      if (game) game.holds.mix = game.holds.garland = false;
      ui.showPause();
    },
    resume() {
      if (mode !== 'paused') return;
      mode = 'playing';
      ui.hideOverlay();
      last = performance.now(); // без скачка времени
    },
    toMenu() {
      mode = 'menu';
      game = null;
      scene.reset();
      ui.showMenu();
    },
    retry() {
      newAttempt();
      app.startRound();
    },
  };

  const ui = new UI({ act, app, sound });

  function newAttempt() {
    const seed = fixedSeed ?? (Math.random() * 1e9) >>> 0;
    game = new Game({ config: CONFIG, seed });
    resultTimer = 0;
    scene.reset();
    ui.hideGame();
    if (devMode) ui.showDev(devHandlers, seed);
  }

  const devHandlers = {
    jump: () => game && mode === 'playing' && game.devJumpTo(CONFIG.potatoReadyAt - 2),
    cat: () => game && mode === 'playing' && game.devCat(),
    prepare: () => game && mode === 'playing' && game.devPrepare(),
    end: () => game && mode === 'playing' && game.devJumpTo(CONFIG.roundDuration - 3),
  };

  // --- ввод ---
  function ndcOf(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }
  canvas.addEventListener('pointermove', (e) => {
    lastNdc = ndcOf(e);
  });
  canvas.addEventListener('pointerleave', () => {
    lastNdc = null;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    sound.unlock();
    if (!game || mode !== 'playing') return;
    const ndc = ndcOf(e);
    lastNdc = ndc;
    if (game.panel === 'board') {
      const h = scene.pickBoard(ndc, game);
      if (!h) return;
      const r = act('boardClick', h.x, h.z);
      if (r === 'too-close' || r === 'limit') sound.play('deny');
    } else {
      const st = scene.pickStation(ndc);
      if (st) act('goTo', st);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Escape') {
      if (mode === 'playing') app.pause();
      else if (mode === 'paused') app.resume();
    } else if (e.code === 'KeyR') {
      sound.unlock();
      act('rotate');
    } else if (e.code === 'KeyM') {
      app.toggleMute();
    }
  });

  // Потеря фокуса или скрытие вкладки — пауза; продолжение только кнопкой.
  window.addEventListener('blur', () => app.pause());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) app.pause();
  });
  window.addEventListener('resize', () => scene.resize());

  // --- главный цикл ---
  let last = performance.now();
  function frame(now) {
    const real = Math.max(0, (now - last) / 1000);
    last = now;
    if (mode === 'playing' && game) {
      game.update(real);
      for (const e of game.drain()) dispatch(e);
      if (game.isOver()) {
        resultTimer += Math.min(real, 0.1);
        if (resultTimer > 1.0) {
          mode = 'result';
          ui.showResult(game.getResult());
        }
      }
    }
    const animDt = mode === 'paused' ? 0 : Math.min(real, CONFIG.maxFrameDt);

    if (game && mode === 'playing' && game.panel === 'board' && lastNdc) {
      scene.setBoardHover(scene.pickBoard(lastNdc, game));
      scene.hoverStation = null;
    } else {
      scene.setBoardHover(null);
      scene.hoverStation = game && mode === 'playing' && lastNdc ? scene.pickStation(lastNdc) : null;
    }
    canvas.style.cursor = game?.panel === 'board' ? 'crosshair' : scene.hoverStation ? 'pointer' : 'default';

    scene.update(mode === 'menu' ? null : game, animDt, mode);
    ui.render(mode === 'menu' || mode === 'instructions' ? null : game, scene, animDt, mode);
    scene.render();
    requestAnimationFrame(frame);
  }

  scene.setCameraMode('menu', true);
  ui.showMenu();
  booted = true;
  requestAnimationFrame(frame);

  // Для отладки из консоли браузера.
  window.__olivie = { get game() { return game; }, get mode() { return mode; }, scene, app };
}

boot();
