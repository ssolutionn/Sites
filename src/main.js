// Кампания 0.5: меню → карточка дня → кухня ⇄ пауза → итог дня → … → финальный стол.
// Игровое время продвигается только здесь и только в режиме 'kitchen'.
import { CAMPAIGN, DAYS, DISH_ORDER } from './campaign/data.js';
import { KitchenSession } from './campaign/session.js';
import { SaveStore, recordDay, currentDayIndex } from './campaign/save.js';
import { CLAYOUT, TABLE_SLOTS } from './campaign/layout.js';
import { SceneView } from './view/scene.js';
import { CampaignView } from './view/campaign-view.js';
import { loadLogo } from './view/textures.js';
import { CampaignUI } from './ui/campaign-ui.js';
import { Sound } from './audio/sound.js';
import { StreamVotes, dailyChallenge } from './stream.js';

const params = new URLSearchParams(location.search);
const devMode = params.has('dev');
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
let booted = false;

function fatal(title, details = '') {
  const f = document.getElementById('fatal');
  f.classList.remove('hidden');
  f.innerHTML = `<div class="card"><h2 style="margin-top:0">${title}</h2><p>${details}</p>
    <p class="small">Попробуйте свежую версию Chrome или Firefox с включённым аппаратным ускорением.</p></div>`;
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
  let sv, view;
  try {
    sv = new SceneView(canvas);
    view = new CampaignView(sv);
  } catch (err) {
    fatal('Не удалось запустить 3D-сцену', String(err?.message || err));
    return;
  }
  loadLogo();
  const sound = new Sound();
  const save = new SaveStore();
  let mode = 'menu'; // menu | intro | kitchen | paused | dayResult | final
  let session = null;
  let lastLocal = null;
  let lastNdc = null;
  let challenge = null; // { key, mods } — день идёт как испытание
  let stream = null; // голосование чата
  let speedStart = null;

  function applyQuality() {
    const low = save.data.settings.quality === 'low';
    sv.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    sv.renderer.shadowMap.enabled = !low;
    sv.sun.castShadow = !low;
    sv.resize();
  }
  applyQuality();

  const DENY = new Set(['goTo', 'goToPoint', 'boardTransfer', 'boardSelect', 'bowlAdd', 'traySelect', 'confirmDish', 'placePot', 'takePot', 'ovenLoad', 'unpack', 'confirmOrder', 'shubaChoose', 'shubaConfirmLayer', 'serveDish', 'collectOrder', 'takeReplacement', 'setVariant', 'finishDay', 'seasonAdd', 'seasonTaste', 'seasonDilute', 'seasonDone', 'coolProduct', 'feedCat', 'playCat', 'reduceHeat']);
  function act(name, ...args) {
    if (!session || mode !== 'kitchen') return false;
    if (name === 'finishDay') return finishDay();
    const fn = session[name];
    if (typeof fn !== 'function') return false;
    const r = fn.apply(session, args);
    if ((r === false || r === null) && DENY.has(name)) sound.play('deny');
    return r;
  }

  const SOUND_OF = {
    cut: 'chop', rotate: 'rotate', transfer: 'transfer', catStart: 'meow', catShooed: 'shoo', catStole: 'hiss', catSpill: 'spill',
    phoneMsg: 'phone', potBoil: 'boil', spill: 'spill', potSaved: 'fixed', garlandOff: 'garlandOff', garlandFixed: 'fixed',
    radioBroken: 'radioBroken', radioFixed: 'fixed', potatoReady: 'ready', added: 'added', potPlaced: 'added', potatoTaken: 'added',
    replacement: 'added', dishDone: 'success', dayReady: 'ready', ovenReady: 'ready', ovenOver: 'boil', washed: 'fixed', puddleClean: 'fixed',
    grate: 'grate', dose: 'drop', fill: 'drop', scoop: 'select', yolk: 'drop', eggSplit: 'chop', tomatoCap: 'chop', dropOk: 'drop', dropReject: 'deny',
    pinch: 'salt', taste: 'taste', dilute: 'pour', seasoned: 'ready', catFed: 'feed', catPlay: 'ball', catHungry: 'meow', catSleep: 'purr', cooled: 'fizz',
    paid: 'cash', noMoney: 'deny', stream: 'phone', speedDone: 'success', speedRetry: 'deny',
    unpacked: 'added', bagArrived: 'bag', orderPlaced: 'phone', layerDone: 'added', layerUndo: 'rotate', served: 'drop', peel: 'select', mandarinSplit: 'chop', garnish: 'select', unpackWrong: 'deny',
  };

  function dispatch(e) {
    view.onEvent(e);
    ui.onEvent(e, session);
    if (e.type === 'speedDone') speedFinished(e.time);
    if (e.type === 'actionStart' && !['cut', 'shoo', 'cutEgg', 'cap', 'peel', 'split', 'pinch', 'taste', 'dilute', 'feedCat', 'playCat'].includes(e.action)) sound.play('work');
    else if (SOUND_OF[e.type]) sound.play(SOUND_OF[e.type]);
  }

  function completedDishes(upTo = 7) {
    const out = [];
    save.data.days.forEach((d, i) => {
      if (d.completed && i < upTo) out.push(...DAYS[i].dishes);
    });
    return out;
  }

  function startDay(i, resumed = false, ch = null) {
    challenge = ch;
    const seed = ch ? ch.seed : fixedSeed ?? (Math.random() * 1e9) >>> 0;
    const mods = Object.fromEntries((ch?.mods ?? []).map((m) => [m, true]));
    session = new KitchenSession({ dayIndex: i, seed, tableDishes: completedDishes(i), mods });
    view.reset();
    view.setActive(true);
    view.setTableDishes(completedDishes(i));
    ui.hideKitchen();
    mode = 'intro';
    ui.showDayIntro(DAYS[i], save, resumed, ch?.mods ?? []);
  }

  function setupStream() {
    stream?.close();
    stream = null;
    const st = save.data.settings.stream;
    if (!st?.on) return;
    stream = new StreamVotes({
      channel: st.channel ?? '',
      test: !!st.test,
      onWinner: (kind, cmd) => {
        if (session && mode === 'kitchen' && !session.practice) {
          const ok = session.streamEvent(kind);
          if (!ok) ui.toast(`📺 ${cmd}: сейчас нельзя — правила кухни`, '', 2.5);
        }
      },
    });
  }

  function speedFinished(t) {
    const best = save.data.speed?.best;
    const rec = best == null || t < best;
    if (rec) save.data.speed = { best: t };
    save.write();
    ui.toast(`<b>⏱ Скоростная нарезка: ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</b>${rec ? ' — новый рекорд!' : ''}`, 'good', 6);
  }

  function enterKitchen() {
    if (!session) return;
    mode = 'kitchen';
    if (!session.practice) {
      save.data.settings.inProgress = session.day.id;
      save.write();
    }
    ui.hideOverlay();
    ui.showKitchen(session);
    last = performance.now();
  }

  function finishDay() {
    const r = session.finishDay();
    if (!r) {
      sound.play('deny');
      return null;
    }
    if (session.practice) return r;
    if (challenge) {
      r.challenge = true;
      const prev = save.data.challenges[challenge.key];
      if (!prev || r.D > prev.D) save.data.challenges[challenge.key] = { D: r.D, stars: r.stars, day: session.day.id };
      delete save.data.settings.inProgress;
      save.write();
      sound.play('success');
      mode = 'dayResult';
      ui.hideKitchen();
      ui.showDayResult(r, session.day, save, false);
      return r;
    }
    recordDay(save.data, session.day.id, r);
    delete save.data.settings.inProgress;
    save.write();
    sound.play('success');
    mode = 'dayResult';
    ui.hideKitchen();
    ui.showDayResult(r, session.day, save, session.dayIndex === DAYS.length - 1);
    return r;
  }

  function startPractice(activity, product) {
    challenge = null;
    session = new KitchenSession({ practice: { activity, product: product || undefined }, seed: 1 });
    view.reset();
    view.setActive(true);
    view.setTableDishes([]);
    const st = ['cubes', 'rounds', 'grate', 'speed'].includes(activity) ? 'board' : activity === 'mix' ? 'bowl' : 'tray';
    const stand = CLAYOUT.stations[st].stand;
    Object.assign(session.heroine, { x: stand.x, z: stand.z, station: st, facing: CLAYOUT.stations[st].facing });
    session._openPanel(st);
    if (st === 'board') session.boardSelect(activity === 'speed' ? 'practice:p1' : 'practice:p');
    if (st === 'tray') session.traySelect('practice');
    if (st === 'bowl') {
      session.bowl.owner = 'practice';
      session.bowl.contents = [
        { product: 'carrot', kind: 'pieces', pieces: Array(14) },
        { product: 'potato', kind: 'pieces', pieces: Array(14) },
        { product: 'cucumber', kind: 'pieces', pieces: Array(12) },
        { product: 'mayo', kind: 'add' },
      ];
    }
    mode = 'kitchen';
    ui.hideOverlay();
    ui.showKitchen(session);
    sv.setCameraMode(st === 'board' ? 'board' : 'c-' + st, true);
  }

  function showFinal() {
    mode = 'final';
    if (!session) {
      // финал из меню после перезагрузки: сцена ещё не готовилась
      session = new KitchenSession({ dayIndex: 6, seed: 1, tableDishes: DISH_ORDER });
      view.reset();
    }
    view.setActive(true);
    view.setTableDishes(DISH_ORDER);
    ui.hideKitchen();
    ui.showFinal(save);
  }

  // Экранная точка над блюдом на праздничном столе (для реплик гостей).
  function dishScreen(id) {
    const slot = TABLE_SLOTS[session?.table.placed[id] ?? DISH_ORDER.indexOf(id)];
    if (!slot) return null;
    return view.localToScreen('table', slot.x, slot.z, 0.2);
  }

  const app = {
    get session() {
      return session;
    },
    isMuted: () => sound.muted,
    toggleMute() {
      sound.unlock();
      sound.setMuted(!sound.muted);
    },
    pause() {
      if (mode !== 'kitchen') return;
      mode = 'paused';
      ui.releaseHolds();
      session?.pointerUp();
      session?._releaseHolds();
      ui.showPause();
    },
    resume() {
      if (mode !== 'paused') return;
      mode = 'kitchen';
      ui.hideOverlay();
      last = performance.now(); // без скачка времени
    },
    testVote(cmd) {
      stream?.vote('tester' + Math.random(), cmd);
    },
    toMenu() {
      mode = 'menu';
      session = null;
      challenge = null;
      ui.hideFinal();
      view.reset();
      view.setActive(false);
      delete save.data.settings.inProgress;
      save.write();
      ui.hideKitchen();
      sv.setCameraMode('menu');
      ui.showMenu(save);
    },
    dropDish(id, e) {
      if (!session || mode !== 'kitchen') return;
      const r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
      const p = view.pickLocal(ndc, 'table');
      if (!p) return;
      let best = null;
      for (const s of TABLE_SLOTS) {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < s.r && (!best || d < best.d)) best = { s, d };
      }
      if (!best) {
        session.setHint('Поставь блюдо на свободное место стола', 1.5);
        sound.play('deny');
        return;
      }
      act('serveDish', id, best.s.i);
    },
    ui(cmd, arg) {
      switch (cmd) {
        case 'new':
          if (save.hasProgress) ui.showConfirmReset();
          else {
            save.reset();
            startDay(0);
          }
          break;
        case 'resetYes':
          save.reset();
          startDay(0);
          break;
        case 'continue':
          if (save.data.finished) showFinal();
          else startDay(currentDayIndex(save.data));
          break;
        case 'journal':
          if (mode === 'kitchen' || mode === 'paused') return;
          ui.showJournal(save);
          break;
        case 'day':
          startDay(Number(arg));
          break;
        case 'enter':
          enterKitchen();
          break;
        case 'menu':
          app.toMenu();
          break;
        case 'resume':
          app.resume();
          break;
        case 'restartDay':
          if (session?.practice) return startPractice(session.practice.activity, session.practice.product);
          startDay(session.dayIndex, false, challenge);
          break;
        case 'nextDay':
          startDay(Math.min(DAYS.length - 1, session.dayIndex + 1));
          break;
        case 'replay':
          startDay(session.dayIndex, false, challenge);
          break;
        case 'final':
          showFinal();
          break;
        case 'practice':
          ui.showPracticeSelect();
          break;
        case 'challenges': {
          const max = Math.max(0, save.data.days.reduce((m, d, i) => (d.completed ? i : m), 0));
          mode = 'menu';
          ui.hideFinal();
          ui.showChallenges(save, dailyChallenge(new Date(), max));
          break;
        }
        case 'challengeGo': {
          const max = Math.max(0, save.data.days.reduce((m, d, i) => (d.completed ? i : m), 0));
          const ch = dailyChallenge(new Date(), max);
          startDay(ch.dayIndex, false, ch);
          break;
        }
        case 'speedGo':
          startPractice('speed');
          break;
        case 'stream':
          ui.showStream(save);
          break;
        case 'streamOn':
        case 'streamOff': {
          const ch = document.getElementById('stream-channel')?.value ?? '';
          const test = !!document.getElementById('stream-test')?.checked;
          save.data.settings.stream = { on: cmd === 'streamOn', channel: ch, test };
          save.write();
          setupStream();
          ui.showStream(save);
          break;
        }
        case 'practiceGo': {
          const [a, p] = String(arg).split(':');
          startPractice(a, p);
          break;
        }
        case 'controls':
          ui.toggleControls();
          break;
        case 'mute':
          app.toggleMute();
          ui.showMenu(save);
          break;
        case 'quality':
          save.data.settings.quality = save.data.settings.quality === 'low' ? 'high' : 'low';
          save.write();
          applyQuality();
          ui.showMenu(save);
          break;
        default:
      }
    },
  };

  const ui = new CampaignUI({ app, act, sound, view });

  // --- ввод ---
  function ndcOf(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
  }
  const CLOSE = new Set(['board', 'tray', 'bowl', 'sink', 'puddle']);
  function closeupActive() {
    return session && CLOSE.has(session.panel) && !session.heroine.target && sv.camT >= 0.95;
  }
  canvas.addEventListener('pointermove', (e) => {
    lastNdc = ndcOf(e);
    if (closeupActive()) {
      lastLocal = view.pickLocal(lastNdc, session.panel);
      view.pointerLocal = lastLocal;
      if (lastLocal && mode === 'kitchen') session.pointer('move', lastLocal.x, lastLocal.z);
    }
  });
  canvas.addEventListener('pointerleave', () => {
    lastNdc = null;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    sound.unlock();
    if (!session || mode !== 'kitchen') return;
    const ndc = ndcOf(e);
    lastNdc = ndc;
    if (session.panel && CLOSE.has(session.panel)) {
      // клик во время перехода камеры не режет в неожиданной точке
      if (!closeupActive()) return;
      canvas.setPointerCapture?.(e.pointerId);
      const p = view.pickLocal(ndc, session.panel);
      if (!p) return;
      lastLocal = p;
      view.pointerLocal = p;
      const r = session.pointer('down', p.x, p.z);
      if (r === 'too-close' || r === 'limit' || r === 'short') sound.play('deny');
      return;
    }
    if (session.panel === 'table' || session.panel === 'phone') return;
    const hit = view.pick(ndc);
    if (!hit) return;
    if (hit.station) act('goTo', hit.station);
    else if (hit.floor) act('goToPoint', hit.floor.x, hit.floor.z);
  });
  const release = () => {
    if (session && mode === 'kitchen') session.pointer('up', lastLocal?.x ?? 0, lastLocal?.z ?? 0);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', () => session?.pointerUp());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') {
      if (mode === 'kitchen') {
        if (ui.recipeOpen) ui.toggleRecipe(false);
        else if (session?.panel === 'phone') session.closePanel();
        else app.pause();
      } else if (mode === 'paused') app.resume();
    } else if (e.code === 'KeyR') {
      sound.unlock();
      act('rotate');
    } else if (e.code === 'KeyM') app.toggleMute();
    else if (e.code === 'KeyQ' && mode === 'kitchen') ui.toggleRecipe();
  });
  window.addEventListener('blur', () => {
    session?.pointerUp();
    app.pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      session?.pointerUp();
      app.pause();
    }
  });
  window.addEventListener('resize', () => sv.resize());

  // --- режим разработчика ---
  if (devMode)
    ui.showDev({
      skipDay: () => {
        if (!session || mode !== 'kitchen') return;
        for (const d of Object.values(session.dishes)) if (!d.done) session._finishDish(d.id, { prep: 80, comp: 80, asm: 80 }, ['Автозавершение (dev)']);
        if (session.day.finalServe) DISH_ORDER.forEach((id, i) => (session.table.placed[id] = i));
        session._checkDayReady();
      },
      cat: () => session && session.cat.state === 'home' && session._startCatTheft(),
      pot: () => session?.stove.state === 'boiling' && !session.stove.overflow && session._startOverflow(),
      ff: () => session && mode === 'kitchen' && session.fastForward(30),
      unlock: () => {
        save.data.days.forEach((d) => (d.unlocked = true));
        save.write();
        if (mode === 'menu') ui.showMenu(save);
      },
    });

  // --- главный цикл ---
  let last = performance.now();
  let fpsN = 0, fpsT0 = performance.now();
  const stats = {};
  function frame(now) {
    const real = Math.max(0, (now - last) / 1000);
    last = now;
    if (mode === 'kitchen' && session) {
      session.update(real);
      for (const e of session.drain()) dispatch(e);
      if (stream && !session.practice) stream.update(Math.min(real, CAMPAIGN.maxFrameDt));
    }
    ui.renderVotes(stream && mode === 'kitchen' && session && !session.practice ? stream.view() : null);
    if (mode === 'final' && session) ui.updateFinal(Math.min(real, 0.25), dishScreen);
    const animDt = mode === 'paused' ? 0 : Math.min(real, CAMPAIGN.maxFrameDt);
    sound.syncRadio(mode === 'kitchen' && !!session && !session.practice && session.radio.enabled && !session.radio.broken, session?.clock ?? 0);

    if (session && (mode === 'kitchen' || mode === 'paused' || mode === 'final')) {
      if (!closeupActive() && lastNdc && mode === 'kitchen') {
        const hit = view.pick(lastNdc);
        view.hover = hit?.station ?? null;
      } else view.hover = null;
      if (!closeupActive()) view.pointerLocal = null;
      canvas.style.cursor = closeupActive() ? (session.panel === 'board' ? 'crosshair' : 'grab') : view.hover ? 'pointer' : 'default';
      view.update(session, animDt, mode);
    } else {
      canvas.style.cursor = 'default';
      sv.update(null, animDt, 'menu');
    }
    ui.render(session, animDt, mode);
    sv.render();
    if (devMode) {
      fpsN++;
      if (now - fpsT0 > 1000) {
        const info = sv.renderer.info;
        stats.fps = Math.round((fpsN * 1000) / (now - fpsT0));
        stats.calls = info.render.calls;
        stats.tris = info.render.triangles;
        stats.geometries = info.memory.geometries;
        stats.textures = info.memory.textures;
        const el = document.getElementById('dev-stats');
        if (el) el.textContent = `${stats.fps} FPS · ${stats.calls} вызовов · ${Math.round(stats.tris / 1000)}k треуг. · геом. ${stats.geometries} · текст. ${stats.textures}`;
        fpsN = 0;
        fpsT0 = now;
      }
    }
    requestAnimationFrame(frame);
  }

  sv.setCameraMode('menu', true);
  setupStream();
  if (save.data.settings.inProgress) {
    const i = DAYS.findIndex((d) => d.id === save.data.settings.inProgress);
    if (i >= 0) {
      booted = true;
      startDay(i, true);
      requestAnimationFrame(frame);
      window.__sueta = { get session() { return session; }, get mode() { return mode; }, sv, view, app, save };
      return;
    }
  }
  ui.showMenu(save);
  booted = true;
  requestAnimationFrame(frame);
  window.__sueta = { get session() { return session; }, get mode() { return mode; }, sv, view, app, save, stats };
}

boot();
