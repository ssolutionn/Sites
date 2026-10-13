// Кампания 0.5: меню → карточка дня → кухня ⇄ пауза → итог дня → … → финальный стол.
// Игровое время продвигается только здесь и только в режиме 'kitchen'.
import { CAMPAIGN, DAYS, DISH_ORDER } from './campaign/data.js';
import { KitchenSession } from './campaign/session.js';
import { SaveStore, recordDay, currentDayIndex } from './campaign/save.js';
import { markInProgress, applyDecorPurchase, applyTreeEvent, recordStreamDay, rememberViewers } from './campaign/persist.js';
import { CLAYOUT, TABLE_SLOTS, STOVE } from './campaign/layout.js';
import { SceneView } from './view/scene.js';
import { CampaignView } from './view/campaign-view.js';
import { loadLogo, setWindowPhase } from './view/textures.js';
import { dayPhase } from './campaign/clock.js';
import { CampaignUI } from './ui/campaign-ui.js';
import { Sound } from './audio/sound.js';
import { RadioMusic } from './audio/radio-music.js';
import { RADIO } from './campaign/radio-data.js';
import { clampFreq } from './campaign/st-radio.js';
import { StreamVotes, dailyChallenge } from './stream.js';
import { streamSettings, resolvePower } from './campaign/stream-rules.js';
import { cleanChannel } from './stream-parse.js';
import { overlayState } from './stream-overlay-state.js';
import { loadModels, modelStatus } from './view/assets.js';
import { assistConfig } from './campaign/assist.js';
import { Keymap } from './keymap.js';
import { SettingsController } from './settings-controller.js';
import { FullscreenControl } from './fullscreen.js';
import { effectiveReduceMotion } from './settings.js';
import { applyTextScale, applyReduceMotionClass, systemReduceMotion } from './ui/settings-ui.js';

const params = new URLSearchParams(location.search);
const devMode = params.has('dev');
const fixedSeed = params.has('seed') ? Number(params.get('seed')) >>> 0 : null;
let booted = false;

function fatal(title, details = '') {
  document.getElementById('loading')?.classList.add('hidden');
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

async function boot() {
  if (!webglAvailable()) {
    fatal('WebGL недоступен', 'Браузер не может показать 3D-кухню: WebGL выключен или не поддерживается.');
    return;
  }
  const canvas = document.getElementById('scene');
  await loadModels({ procedural: params.has('procedural'), onProgress:({completed,total}) => {
    if (!total) return;
    const percent = Math.round(completed/total*100);
    document.getElementById('loading-progress').value = percent;
    document.getElementById('loading-detail').textContent = `Готово на ${percent} %`;
  } });
  let sv, view;
  try {
    sv = new SceneView(canvas);
    view = new CampaignView(sv);
  } catch (err) {
    fatal('Не удалось запустить 3D-сцену', String(err?.message || err));
    return;
  }
  loadLogo();
  // за окном — то же время суток, что у игрока; сверяемся раз в минуту
  const syncWindow = () => setWindowPhase(dayPhase(new Date().getHours()));
  syncWindow();
  setInterval(syncWindow, 60000);
  const sound = new Sound();
  const radioMusic = new RadioMusic(sound);
  const save = new SaveStore();
  let mode = 'menu'; // menu | intro | kitchen | paused | dayResult | final
  let session = null;
  let lastLocal = null;
  let lastNdc = null;
  let challenge = null; // { key, mods } — день идёт как испытание
  let stream = null; // голосование чата (режим стримера, 0.11)
  let lastStreamEvent = null; // последнее событие от чата — для оверлея OBS
  let overlayInfo = null; // состояние локального сервера оверлея (только в версии для компьютера)
  let overlaySent = '';
  let viewerFlushT = 0;

  function applyQuality() {
    const low = save.data.settings.quality === 'low';
    sv.renderer.setPixelRatio(low ? 1 : Math.min(window.devicePixelRatio, 2));
    sv.renderer.shadowMap.enabled = !low;
    sv.sun.castShadow = !low;
    sv.resize();
  }
  applyQuality();

  // Запись сохранения с честным ответом игроку: молча терять прогресс нельзя (причины — SaveStore.writeError).
  const SAVE_WARN = {
    noStorage: 'Браузер не даёт сохранять — прогресс пропадёт при закрытии игры',
    failed: 'Не удалось сохранить прогресс (браузер отказал в записи)',
    protected: 'Сохранение от более новой версии игры: в этом запуске прогресс не записывается. «Новая кампания» начнёт заново, старое останется в копии',
  };
  let warnedSave = null;
  function persist(loud = false) {
    const ok = save.write();
    if (!ok && (loud || warnedSave !== save.writeError)) {
      warnedSave = save.writeError;
      ui.toast(`⚠ ${SAVE_WARN[save.writeError] ?? SAVE_WARN.failed}`, 'bad', 6);
    }
    return ok;
  }

  // --- настройки 0.11: громкость, мягкие жесты, размер текста, меньше движения, клавиши, полный экран ---
  const keymap = new Keymap(save.data.settings.keys);
  const fullscreen = new FullscreenControl();
  // «мягкие жесты»: сессия получает копию CAMPAIGN с допусками шире в CAMPAIGN.assist.k раз (campaign/assist.js)
  const cfgNow = () => (save.data.settings.assist ? assistConfig(CAMPAIGN) : CAMPAIGN);
  function applyMotion(choice) {
    const on = effectiveReduceMotion({ reduceMotion: choice }, systemReduceMotion());
    applyReduceMotionClass(on);
    sv.reduceMotion = on; // камера без качки и с быстрым переездом (view/scene.js)
    view.particles.density = on ? 0.5 : 1; // искр вдвое меньше (view/campaign-view.js)
  }
  const settings = new SettingsController({
    settings: () => save.data.settings,
    persist: () => persist(),
    sound,
    keymap,
    hooks: {
      assist: () => {
        if (!session) return;
        session.cfg = cfgNow();
        session.catWaver = null; // взмах считается заново по новым допускам
      },
      textScale: (v) => applyTextScale(v),
      quality: () => applyQuality(),
      motion: applyMotion,
      fullscreen: (on) => fullscreen.set(on),
    },
  });
  // игрок вышел из полного экрана сам (Esc, F11, меню окна) — запоминаем как выбор
  fullscreen.onChange((on) => settings.setFullscreen(on));

  const DENY = new Set(['goTo', 'goToPoint', 'boardTransfer', 'boardSelect', 'bowlAdd', 'traySelect', 'confirmDish', 'placePot', 'takePot', 'ovenLoad', 'confirmOrder', 'shubaChoose', 'shubaConfirmLayer', 'serveDish', 'collectOrder', 'takeReplacement', 'setVariant', 'finishDay', 'seasonAdd', 'seasonTaste', 'seasonDilute', 'seasonDone', 'coolProduct', 'reduceHeat']);
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
    dwDoor: 'dwDoor', dwLoad: 'dwClink', dwTake: 'dwClink', dwPick: 'select', dwStart: 'dwStart', dwHum: 'dwHum', dwDone: 'dwDone', dwDeny: 'deny', // 0.11: посудомойка (st-dishwasher.js)
    cut: 'chop', rotate: 'rotate', transfer: 'transfer', catStart: 'meow', catShooed: 'shoo', catStole: 'hiss', catSpill: 'spill',
    phoneMsg: 'phone', potBoil: 'boil', spill: 'spill', potSaved: 'fixed', garlandOff: 'garlandOff', garlandFixed: 'fixed', starOff: 'garlandOff', starFixed: 'fixed', catBored: 'meow', catMischief: 'hiss', giftOpened: 'success', toyBought: 'cash', toyHung: 'jingle', toyTaken: 'select', toyPicked: 'added', toyReturned: 'rotate', toyBroken: 'jingle', treeFell: 'treeFall', treeUp: 'fixed', treeLiftTick: 'rustle', tinselBought: 'cash', tinselDraw: 'rustle', tinselHung: 'jingle', tinselTaken: 'rotate', tinselEmpty: 'deny', setComplete: 'success', giftStart: 'select', giftTick: 'rustle', giftBow: 'added', giftPaper: 'bag',
    radioBroken: 'radioBroken', radioFixed: 'fixed', potatoReady: 'ready', added: 'added', potPlaced: 'added', potatoTaken: 'added',
    replacement: 'added', dishDone: 'success', dayReady: 'ready', ovenReady: 'ready', ovenOver: 'boil', washed: 'fixed', puddleClean: 'fixed',
    grate: 'grate', dose: 'drop', fill: 'drop', scoop: 'select', yolk: 'drop', eggSplit: 'chop', tomatoCap: 'chop', dropOk: 'drop', dropReject: 'deny', pierced: 'chop', pierceStart: 'select',
    pinch: 'salt', taste: 'taste', dilute: 'pour', seasoned: 'ready', catFed: 'feed', catPlay: 'ball', catHungry: 'meow', catSleep: 'purr', cooled: 'fizz', heat: 'select', potBoils: 'boil', coolStart: 'select',
    paid: 'cash', noMoney: 'deny', peeled: 'added', mixed: 'ready', bonus: 'cash', decorBought: 'success', posted: 'phone', timerDone: 'ready', timerSet: 'select', pick: 'select', stream: 'phone', speedDone: 'success', speedRetry: 'deny',
    delivered: 'bag', catPick: 'select', kibble: 'pour', wand: 'ball', chase: 'meow', orderPlaced: 'phone', layerDone: 'added', layerUndo: 'rotate', served: 'drop', mandarinSplit: 'chop', garnish: 'select',
    stir: 'stir', peel: 'peelSkin', cutDenied: 'scuff', // перемешивание, чистка и отказ ножа раньше молчали
    cutReady: 'ready', taken: 'select', returned: 'select', eggCrack: 'crack', overcooked: 'deny', potLow: 'boil', potDry: 'hiss', potBurnt: 'fail', burnerIdle: 'select', stoveClean: 'fixed', wipe: 'scrub', wash: 'scrub', // 0.9: руки, яйцо, плита, мытьё
    feedLike: 'select', // лайк в ленте «Андрея»; новые посты приходят без звука — только значок
    commentReply: 'phone', // 0.10: друг ответил на комментарий
  };

  function dispatch(e) {
    // декор кухни сохраняется сразу — это покупка, а не результат дня; баллы дня сюда не попадают (persist.js)
    if (e.type === 'decorBought' && applyDecorPurchase(save.data, { id: e.id, practice: !!session.practice, challenge: session.challenge })) persist();
    // ёлка: подарки, игрушки и их места сохраняются сразу (persist.js)
    if (applyTreeEvent(save.data, e, { toys: session.toysForSave?.(), tinsel: session.tinselForSave?.(), practice: !!session.practice, challenge: session.challenge })) persist();
    // любимая волна радио переходит из дня в день
    if (e.type === 'radioTuned' && !session.practice) {
      save.data.settings.radioFreq = e.freq;
      persist();
    }
    view.onEvent(e);
    ui.onEvent(e, session);
    if (e.type === 'stream') lastStreamEvent = { id: (lastStreamEvent?.id ?? 0) + 1, text: e.text };
    if (e.type === 'speedDone') speedFinished(e.time);
    if (e.type === 'shout') sound.play(e.ok ? 'shoo' : 'deny'); // 0.11: крик не всегда помогает
    if (e.type === 'actionStart' && !['cut', 'shoo', 'cutEgg', 'cap', 'peel', 'split', 'pinch', 'taste', 'dilute', 'gift'].includes(e.action)) sound.play('work');
    else if (SOUND_OF[e.type]) sound.play(SOUND_OF[e.type], e);
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
    // день с чатом (0.11) — отдельный зачёт: для кампании он как испытание (баллы, декор, медали, best не трогаем)
    const live = !!stream && !ch;
    session = new KitchenSession({ dayIndex: i, seed, challenge: !!ch || live, tableDishes: completedDishes(i), mods, bonus: ch || live ? 0 : save.data.bonus ?? 0, decor: save.data.decor ?? [], toys: save.data.toys ?? [], tinsel: { threads: save.data.tinsel ?? [], rolls: save.data.tinselRolls ?? {} }, giftsOpened: save.data.gifts?.[DAYS[i].id] ?? [], setsDone: save.data.sets ?? [] });
    session.cfg = cfgNow();
    if (Number.isFinite(save.data.settings.radioFreq)) session.radio.freq = clampFreq(save.data.settings.radioFreq);
    session.live = live;
    session.streamViewers = viewerList;
    if (live) {
      stream.begin();
      lastStreamEvent = null;
    }
    view.reset();
    view.setActive(true);
    view.setTableDishes(completedDishes(i));
    ui.hideKitchen();
    mode = 'intro';
    ui.showDayIntro(DAYS[i], save, resumed, ch?.mods ?? []);
  }

  // ---------- режим стримера (0.11) ----------
  const streamCfg = () => streamSettings(save.data.settings.stream);
  // ники для игры: кто голосовал в этой игре (самые активные первыми) и самые активные из сохранения; ники уже очищены
  const viewerNicks = () => [...new Set([...(stream?.activeNicks() ?? []), ...(save.data.stream?.viewers ?? []).map((v) => v.nick)])].slice(0, 12);
  const viewerList = () => ({ nicks: viewerNicks(), show: streamCfg().nicks });

  function setupStream() {
    stream?.close();
    stream = null;
    const st = streamCfg();
    // CAMPAIGN.stream.enabled — единый флаг: false — режима нет совсем
    if (!st.on || !CAMPAIGN.stream.enabled) return;
    stream = new StreamVotes({
      channel: st.channel,
      test: st.test,
      power: st.power,
      getState: () => ({ ...(session?.streamState() ?? { live: false }), ...ui.streamBusy() }),
      fire: (kind) => !!(session && mode === 'kitchen' && session.live && session.streamEvent(kind)),
    });
  }

  // активность зрителей → сохранение (гости финального стола); пишем, только если что-то изменилось
  function flushViewers() {
    const a = stream?.takeActivity();
    if (a && Object.keys(a).length && rememberViewers(save.data, a)) persist();
  }

  // локальный сервер оверлея OBS живёт в оболочке для компьютера (desktop/main.cjs); в браузере его нет
  const overlayApi = () => window.suetaDesktop?.overlay ?? null;
  function overlayView() {
    const api = overlayApi();
    if (!api) return { available: false };
    const st = streamCfg();
    return { available: true, running: !!overlayInfo?.running, url: overlayInfo?.url ?? `http://127.0.0.1:${st.overlayPort}/overlay`, error: overlayInfo?.error ?? '' };
  }
  async function configureOverlay() {
    const api = overlayApi();
    if (!api) return;
    const st = streamCfg();
    try {
      overlayInfo = await api.configure({ enabled: st.on && st.overlay && CAMPAIGN.stream.enabled, port: st.overlayPort });
    } catch {
      overlayInfo = { running: false, error: 'Оверлей не запустился' };
    }
    overlaySent = '';
    if (document.getElementById('stream-now')) showStreamScreen();
  }
  function showStreamScreen(note = '') {
    ui.showStream(save, stream?.view() ?? null, overlayView(), note);
  }
  function publishOverlay() {
    const send = window.suetaDesktop?.publishStream;
    if (!send) return;
    const view = stream && session?.live && (mode === 'kitchen' || mode === 'paused') ? stream.view() : null;
    const sig = JSON.stringify(overlayState(view, lastStreamEvent));
    if (sig === overlaySent) return;
    overlaySent = sig;
    try {
      send(JSON.parse(sig));
    } catch {
      /* оверлей необязателен: игре он не нужен */
    }
  }

  // изменение настройки режима из экрана настроек: key=value
  function setStreamOption(key, raw) {
    const cur = { ...(save.data.settings.stream ?? {}) };
    let note = '';
    const on = (v) => v === '1' || v === 'true' || v === true;
    switch (key) {
      case 'channel': {
        const c = cleanChannel(raw);
        cur.channel = c;
        if (String(raw).trim() && !c) note = 'Имя канала: латиница, цифры и «_», от 3 до 25 знаков. Можно вставить ссылку на канал.';
        break;
      }
      case 'test':
        cur.test = on(raw);
        break;
      case 'nicks':
        cur.nicks = on(raw);
        break;
      case 'power':
        cur.power = resolvePower(raw).id;
        break;
      case 'cam':
        cur.cam = raw;
        break;
      case 'overlayPort': {
        const n = Math.round(Number(raw));
        if (Number.isInteger(n) && n >= 1024 && n <= 65535) cur.overlayPort = n;
        else note = 'Порт оверлея — число от 1024 до 65535.';
        break;
      }
      default:
        return;
    }
    save.data.settings.stream = streamSettings(cur);
    persist();
    if (key === 'power') stream?.setPower(streamCfg().power);
    else if (['channel', 'test'].includes(key) && stream) setupStream();
    if (key === 'cam') ui.setCam(streamCfg().cam);
    if (key === 'overlayPort') configureOverlay();
    showStreamScreen(note);
  }

  function speedFinished(t) {
    const best = save.data.speed?.best;
    const rec = best == null || t < best;
    if (rec) save.data.speed = { best: t };
    persist();
    ui.toast(`<b>⏱ Скоростная нарезка: ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</b>${rec ? ' — новый рекорд!' : ''}`, 'good', 6);
  }

  function enterKitchen() {
    if (!session) return;
    mode = 'kitchen';
    if (markInProgress(save.data, { dayId: session.day.id, practice: !!session.practice, challenge: session.challenge })) persist();
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
    if (session.live) {
      // день с чатом — отдельный зачёт: кампания, медали и баллы не меняются (persist.recordStreamDay)
      r.medals = [];
      r.stream = { ...recordStreamDay(save.data, session.dayIndex, r), D: r.D };
      flushViewers();
      persist(true);
      sound.play('success');
      mode = 'dayResult';
      ui.hideKitchen();
      ui.showDayResult(r, session.day, save, session.dayIndex === DAYS.length - 1);
      return r;
    }
    if (challenge) {
      r.challenge = true;
      const prev = save.data.challenges[challenge.key];
      if (!prev || r.D > prev.D) save.data.challenges[challenge.key] = { D: r.D, stars: r.stars, day: session.day.id };
      delete save.data.settings.inProgress;
      persist(true);
      sound.play('success');
      mode = 'dayResult';
      ui.hideKitchen();
      ui.showDayResult(r, session.day, save, false);
      return r;
    }
    recordDay(save.data, session.day.id, r);
    save.data.bonus = session.bonus.points;
    save.data.decor = [...session.decor];
    save.data.toys = session.toysForSave();
    const ts = session.tinselForSave();
    save.data.tinsel = ts.threads;
    save.data.tinselRolls = ts.rolls;
    delete save.data.settings.inProgress;
    persist(true);
    sound.play('success');
    mode = 'dayResult';
    ui.hideKitchen();
    ui.showDayResult(r, session.day, save, session.dayIndex === DAYS.length - 1);
    return r;
  }

  function startPractice(activity, product) {
    challenge = null;
    session = new KitchenSession({ practice: { activity, product: product || undefined }, seed: 1 });
    session.cfg = cfgNow();
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
    settings,
    // «Подсказки рукой» (src/ghost/): включена ли рука-призрак и какие жесты она уже показывала
    ghost: {
      enabled: () => save.data.settings.ghostHints !== false,
      isSeen: (id) => !!save.data.settings.ghostSeen?.[id],
      markSeen: (id) => settings.markGhostSeen(id),
    },
    keymap,
    fullscreen,
    toggleMute() {
      sound.unlock();
      sound.setMuted(!sound.muted);
      ui.refreshSettings();
    },
    pause() {
      if (mode !== 'kitchen') return;
      mode = 'paused';
      ui.releaseHolds();
      session?.pointerUp();
      session?._releaseHolds();
      ui.showPause(!session?.practice && !session?.challenge);
    },
    resume() {
      if (mode !== 'paused') return;
      mode = 'kitchen';
      ui.hideOverlay();
      last = performance.now(); // без скачка времени
    },
    testVote(cmd) {
      stream?.testVote(cmd);
    },
    // пауза чата стримера: окно и голоса стоят, события не выходят (клавиша STREAM_KEYS.pauseChat и кнопка на плашке)
    toggleChatPause() {
      if (stream && session?.live) stream.setPaused(!stream.paused);
    },
    toMenu() {
      flushViewers();
      mode = 'menu';
      session = null;
      challenge = null;
      ui.hideFinal();
      view.reset();
      view.setActive(false);
      if (delete save.data.settings.inProgress) persist();
      ui.hideKitchen();
      sv.setCameraMode('menu');
      ui.showMenu(save);
    },
    // 0.10: ёлка — игрушку отпустили после перетаскивания: над свободной точкой — повесить, мимо — назад.
    // 0.11: точка — любая на поверхности ёлки (луч мыши → tree-geo), а не заготовленная ветка
    toyHover(e) {
      if (session?.panel !== 'tree') return;
      const r = canvas.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      view.tree.pointer = inside && !e.target?.closest?.('#panel') ? ndcOf(e) : null;
    },
    dropToy(e, back = null) {
      if (!session || mode !== 'kitchen' || session.panel !== 'tree') return;
      const r = canvas.getBoundingClientRect();
      const overPanel = e.target?.closest?.('#panel');
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      const hit = inside && !overPanel ? view.tree.hit(ndcOf(e)) : null;
      const hung = act('dropToy', hit?.p ?? null, ...(back ? [back] : []));
      if (!hung && hit) sound.play('deny');
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
        case 'exitAsk':
          ui.showExitConfirm();
          break;
        case 'pauseBack':
          if (mode === 'paused') ui.showPause(!session?.practice && !session?.challenge);
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
          showStreamScreen();
          break;
        case 'streamToggle': {
          const cur = streamCfg();
          save.data.settings.stream = { ...cur, on: !cur.on };
          persist();
          setupStream();
          configureOverlay();
          showStreamScreen();
          break;
        }
        case 'streamSet': {
          const [k, ...rest] = String(arg).split('=');
          setStreamOption(k, rest.join('='));
          break;
        }
        case 'streamForget':
          save.data.stream.viewers = [];
          stream?.takeActivity();
          persist();
          showStreamScreen('Список зрителей очищен.');
          break;
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
          settings.setQuality(save.data.settings.quality === 'low' ? 'high' : 'low');
          ui.showMenu(save);
          break;
        case 'settings':
          // настройки открываются из меню и из паузы; «Готово» и Esc возвращают туда же
          if (mode === 'menu' || mode === 'paused') ui.showSettings();
          break;
        case 'settingsBack':
          if (mode === 'paused') ui.showPause(!session?.practice && !session?.challenge);
          else if (mode === 'menu') ui.showMenu(save);
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
  const CLOSE = new Set(['board', 'tray', 'bowl', 'sink', 'dishwasher', 'puddle', 'radio', 'stove']);
  // рабочий крупный план: станции с жестами и подарок в руках у ёлки (0.10)
  const handsOn = () => session && (CLOSE.has(session.panel) || (session.panel === 'tree' && !!session.gift));
  function closeupActive() {
    return handsOn() && !session.heroine.target && sv.camT >= 0.95;
  }
  const GIFT_DENY = new Set(['bow-miss', 'lid-miss']);
  canvas.addEventListener('pointermove', (e) => {
    lastNdc = ndcOf(e);
    if (closeupActive()) {
      lastLocal = view.pickLocal(lastNdc, session.panel);
      view.pointerLocal = lastLocal;
      if (lastLocal && mode === 'kitchen') session.pointer('move', lastLocal.x, lastLocal.z);
    }
    // 0.11: пачка корма или «удочка» у миски кота — мышь ведёт их по полу вокруг миски
    if (session?.panel === 'catbowl' && session.catTool && session.pointerDown && mode === 'kitchen') {
      lastLocal = view.pickLocal(lastNdc, 'catbowl');
      view.pointerLocal = lastLocal;
      if (lastLocal) session.pointer('move', lastLocal.x, lastLocal.z);
    }
    // кот безобразничает: помахать мышью над ним в обзоре — прогнать (0.9; в крупном плане — подсказка выйти)
    if (session && mode === 'kitchen' && ['theft', 'spill', 'mischief'].includes(session.cat.state)) {
      if (closeupActive()) session.catWave(0);
      else if (view.catHit(lastNdc)) {
        canvas.style.cursor = 'grab';
        session.catWave(e.clientY !== undefined ? e.clientX / Math.max(1, canvas.clientHeight) : 0);
        return;
      }
    }
    if (session && mode === 'kitchen' && session.panel === 'tree' && !session.gift) {
      // 0.11: ёлка — мишуру ведут по поверхности, упавшую ёлку тянут вверх; hover и призрак игрушки — в view.tree
      view.tree.pointer = lastNdc;
      if (session.tinsel.draw) act('tinselMove', view.tree.hit(lastNdc)?.p ?? null);
      else if (session.treeFall.grab) act('treeLiftMove', view.tree.liftAngle(lastNdc));
      return;
    }
    if (canvas.style.cursor) canvas.style.cursor = '';
  });
  canvas.addEventListener('pointerleave', () => {
    lastNdc = null;
    view.tree.pointer = null;
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    sound.unlock();
    if (!session || mode !== 'kitchen') return;
    const ndc = ndcOf(e);
    lastNdc = ndc;
    if (handsOn()) {
      // клик во время перехода камеры не режет в неожиданной точке
      if (!closeupActive()) return;
      canvas.setPointerCapture?.(e.pointerId);
      let p = view.pickLocal(ndc, session.panel);
      if (!p) return;
      // 0.11: кастрюля стоит выше плоскости плиты — берём её по самому телу, а не по пятну под ним
      if (session.panel === 'stove') {
        const bi = view.potAt(ndc);
        if (bi != null) p = { x: STOVE.burners[bi].x, z: STOVE.burners[bi].z };
      }
      lastLocal = p;
      view.pointerLocal = p;
      const r = session.pointer('down', p.x, p.z);
      if (r === 'too-close' || r === 'limit' || GIFT_DENY.has(r)) sound.play('deny');
      return;
    }
    // 0.11: корм/«удочка» в руках у миски кота — жест над полом вокруг миски; мимо — обычный клик
    if (session.panel === 'catbowl' && session.catTool && !session.heroine.target) {
      const p = view.pickLocal(ndc, 'catbowl');
      if (p && Math.hypot(p.x, p.z) <= session.cfg.cat.play.radius * 1.2) {
        canvas.setPointerCapture?.(e.pointerId);
        lastLocal = p;
        view.pointerLocal = p;
        session.pointer('down', p.x, p.z);
        return;
      }
    }
    // 0.11: клик по безобразничающему коту — героиня сама подбегает и прогоняет его (наверняка, но уходит от дел)
    if (session.catActive?.() && view.catHit(ndc)) {
      act('chaseCat');
      return;
    }
    if (session.panel === 'table' || session.panel === 'phone') return;
    // ёлка крупным планом: клик по ветке — повесить игрушку из руки; зажать висящую — снять и тянуть на другую ветку
    if (session.panel === 'tree' && sv.camT >= 0.95) {
      // подарок под ёлкой — взять в руки и открыть
      const gift = view.giftAt(ndc);
      if (gift != null && session.giftsLeft().includes(gift)) {
        act('startGift', gift);
        return;
      }
      const T = view.tree;
      // игрушка на полу: клик подбирает, перетаскивание в коробку — тоже (0.11)
      const onFloor = T.floorToyAt(ndc);
      if (onFloor != null) {
        ui.startFloorDrag(onFloor, e);
        return;
      }
      // кот уронил ёлку: зажать ствол или верхушку и тянуть вверх (угол мыши вокруг основания — view.tree.liftAngle)
      if (session.treeFall.down) {
        const g = T.liftGrab(ndc);
        if (g && act('treeLiftStart', g.zone, g.angle)) canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      const tool = session.tinsel.tool;
      if (tool === 'cut') {
        const id = T.threadAt(ndc);
        if (id != null) act('tinselRemove', id);
        return;
      }
      const hit = T.hit(ndc);
      if (tool) {
        // моток в руке: зажать на ёлке и вести — точки берёт tree-geo на каждом движении
        if (hit && act('tinselStart', hit.p)) canvas.setPointerCapture?.(e.pointerId);
        else sound.play('deny');
        return;
      }
      const empty = session.treeHand == null;
      const ok = act('treeClick', hit?.p ?? null, empty ? T.toyAt(ndc) : null);
      if (!ok && !empty) sound.play('deny');
      if (empty && session.treeHand != null) ui.startToyDrag(session.treeHand, e);
      return;
    }
    const hit = view.pick(ndc);
    if (!hit) return;
    if (hit.station) act('goTo', hit.station);
    else if (hit.floor) act('goToPoint', hit.floor.x, hit.floor.z);
  });
  let turnHeld = null;
  // 0.10: WASD и стрелки — ходьба в обзоре (камера смотрит вдоль −z: W — вглубь кухни, D — вправо); пробел — контакт.
  // 0.11: какая клавиша что делает — keymap.js (настройки); здесь только направления действий
  const MOVE_DIR = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const moveHeld = new Set();
  let moveSent = '', moveFor = null;
  const syncMove = () => {
    let x = 0, z = 0;
    for (const c of moveHeld) {
      const d = MOVE_DIR[keymap.actionOf(c)];
      if (!d) continue;
      x += d[0];
      z += d[1];
    }
    const sig = `${x},${z}`;
    if (!session || (sig === moveSent && moveFor === session)) return;
    moveSent = sig;
    moveFor = session;
    session.setMoveInput(x, z);
  };
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  const TURN_HOLD = 180; // мс: дольше — уже не тап, а вращение
  const KNIFE_DENY = new Set(['too-close', 'limit', 'short', 'diagonal', 'wobbly', 'rounds-only', 'outside']);
  const release = () => {
    if (!session || mode !== 'kitchen') return;
    const r = session.pointer('up', lastLocal?.x ?? 0, lastLocal?.z ?? 0);
    if (session.panel === 'board' && KNIFE_DENY.has(r)) sound.play('deny');
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', () => session?.pointerUp());
  // радио: колёсико мыши — точная подстройка частоты
  let wheelAcc = 0;
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!session || mode !== 'kitchen' || session.panel !== 'radio') return;
      e.preventDefault();
      wheelAcc += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      const steps = Math.trunc(wheelAcc / RADIO.wheelPx);
      if (!steps) return;
      wheelAcc -= steps * RADIO.wheelPx;
      act('tuneRadio', -steps * RADIO.wheelStep);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const key = keymap.actionOf(e.code); // действие по настройкам клавиш (keymap.js)
    // пробел не должен «нажимать» кнопку, на которой остался фокус после клика мышью
    if (key === 'interact' && mode === 'kitchen') e.preventDefault();
    if (e.repeat) return;
    if (key === 'interact' && mode === 'kitchen') {
      sound.unlock();
      const r = act('interact');
      if (r === false && !session.panel) sound.play('deny');
    } else if (key === 'pause') {
      if (ui.settingsOpen) app.ui('settingsBack');
      else if (mode === 'kitchen') {
        // Esc — «назад»: закрыть рецепт, выйти со станции (крупный план → обзор, как подписано на «←»), в обзоре — пауза
        if (ui.recipeOpen) ui.toggleRecipe(false);
        else if (session?.panel) act('closePanel');
        else app.pause();
      } else if (mode === 'paused') app.resume();
    } else if (key === 'rotate') {
      sound.unlock();
      act('rotate');
    } else if ((key === 'left' || key === 'right') && keymap.isPrimary(key, e.code) && mode === 'kitchen' && session?.panel === 'board') {
      // A/D: короткое нажатие — доска на четверть оборота, удержание — плавно на любой угол
      sound.unlock();
      turnHeld = { code: e.code, dir: key === 'left' ? 1 : -1, t0: performance.now(), spun: false };
    } else if (MOVE_DIR[key] && mode === 'kitchen') {
      sound.unlock();
      moveHeld.add(e.code);
    } else if (key === 'mute') app.toggleMute();
    else if (key === 'pauseChat' && mode === 'kitchen') app.toggleChatPause();
    else if (key === 'recipe' && mode === 'kitchen') ui.toggleRecipe();
    else if (key === 'fullscreen') {
      // F11 по умолчанию: свой переключатель вместо системного, чтобы состояние совпадало с настройками
      e.preventDefault();
      settings.requestFullscreen(!fullscreen.active);
    } else if (key === 'shout' && mode === 'kitchen') act('shout'); // 0.11: крикнуть на кота (клавиша F по умолчанию, переназначается в настройках)
  });
  window.addEventListener('keyup', (e) => {
    moveHeld.delete(e.code);
    if (keymap.actionOf(e.code) === 'interact') {
      if (!typing(e) && mode === 'kitchen') e.preventDefault();
      session?.interactUp();
    }
    if (!turnHeld || e.code !== turnHeld.code) return;
    if (!turnHeld.spun) act('boardTurn', turnHeld.dir);
    turnHeld = null;
  });
  window.addEventListener('blur', () => {
    turnHeld = null;
    moveHeld.clear();
    session?.interactUp();
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
        persist();
        if (mode === 'menu') ui.showMenu(save);
      },
    });

  // --- главный цикл ---
  let last = performance.now();
  let streamNowT = 0;
  let fpsN = 0, fpsT0 = performance.now();
  const stats = {};
  function frame(now) {
    const real = Math.max(0, (now - last) / 1000);
    last = now;
    if (mode === 'kitchen' && session) {
      syncMove();
      if (turnHeld && now - turnHeld.t0 > TURN_HOLD) {
        turnHeld.spun = true;
        session.boardSpin(turnHeld.dir, Math.min(real, CAMPAIGN.maxFrameDt));
      }
      session.update(real);
      const batch = session.drain();
      // блюдо закончено в этот кадр: поздравления и заметки книги уступают одной карточке блюда (0.11 A3)
      if (batch.some((e) => e.type === 'dishDone')) ui.quietFor(CAMPAIGN.ui.dishQuiet);
      for (const e of batch) dispatch(e);
      if (stream && session.live) {
        stream.update(Math.min(real, CAMPAIGN.maxFrameDt));
        if ((viewerFlushT += real) > 20) {
          viewerFlushT = 0;
          flushViewers();
        }
      }
    }
    if (stream) stream.active = mode === 'kitchen' && !!session?.live;
    ui.renderVotes(stream && mode === 'kitchen' && session?.live ? stream.view() : null);
    publishOverlay();
    if (mode === 'menu' && stream && (streamNowT += real) > 0.5) {
      streamNowT = 0;
      ui.refreshStreamNow(save, stream.view());
    }
    if (mode === 'final' && session) ui.updateFinal(Math.min(real, 0.25), dishScreen);
    const animDt = mode === 'paused' ? 0 : Math.min(real, CAMPAIGN.maxFrameDt);
    // радио звучит только на кухне во время дня: пауза, итоги, меню и практика — тишина
    radioMusic.sync(mode === 'kitchen' && session && !session.practice && !session.isOver() ? session.radioTuning() : null);

    if (session && (mode === 'kitchen' || mode === 'paused' || mode === 'final')) {
      if (!closeupActive() && lastNdc && mode === 'kitchen') {
        const hit = view.pick(lastNdc);
        view.hover = hit?.station ?? null;
      } else view.hover = null;
      if (!closeupActive()) view.pointerLocal = null;
      canvas.style.cursor = closeupActive() ? (session.panel === 'board' ? 'crosshair' : 'grab') : view.tree.cursor(session) ?? (view.hover ? 'pointer' : 'default');
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

  settings.applyAll();
  // полный экран прошлого раза: в настольной версии сразу, в браузере — с первого действия игрока (иначе браузер откажет)
  if (save.data.settings.fullscreen && fullscreen.supported && !fullscreen.active) {
    if (window.suetaDesktop) fullscreen.set(true);
    else {
      const again = () => {
        window.removeEventListener('pointerdown', again, true);
        window.removeEventListener('keydown', again, true);
        fullscreen.set(true);
      };
      window.addEventListener('pointerdown', again, true);
      window.addEventListener('keydown', again, true);
    }
  }
  sv.setCameraMode('menu', true);
  ui.setCam(streamCfg().cam);
  setupStream();
  configureOverlay();
  if (save.data.settings.inProgress) {
    const i = DAYS.findIndex((d) => d.id === save.data.settings.inProgress);
    if (i >= 0) {
      document.getElementById('loading').classList.add('hidden');
      booted = true;
      startDay(i, true);
      requestAnimationFrame(frame);
      window.__sueta = { models: modelStatus(), get session() { return session; }, get stream() { return stream; }, get mode() { return mode; }, sv, view, app, save, radio: radioMusic };
      return;
    }
  }
  ui.showMenu(save);
  document.getElementById('loading').classList.add('hidden');
  booted = true;
  requestAnimationFrame(frame);
  window.__sueta = { models: modelStatus(), get session() { return session; }, get stream() { return stream; }, get mode() { return mode; }, sv, view, app, save, stats, radio: radioMusic };
}

boot();
