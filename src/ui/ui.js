// DOM-интерфейс. Только отображает состояние и вызывает действия игры через act().
// Ничего не начисляет сам.
import { CONFIG } from '../config.js';
import { LAYOUT } from '../game/layout.js';
import { LOGO_URL } from '../view/textures.js';
import { accuracy, pieceVolume } from '../game/cutting.js';

const ICONS = { carrot: '🥕', sausage: '🌭', cucumber: '🥒', egg: '🥚', peas: '🫛', mayo: '🫙', potato: '🥔' };
const ALERT_ICONS = { cat: '🐱', pot: '♨️', garland: '💡', phone: '📱', potatoReady: '🥔', radio: '📻' };
const $ = (sel, root = document) => root.querySelector(sel);

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-9));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export class UI {
  constructor({ act, app, sound }) {
    this.act = act; // (name, ...args) => result
    this.app = app; // { play, startRound, pause, resume, toMenu, retry, toggleMute, isMuted }
    this.sound = sound;
    this.el = {
      hud: $('#hud'),
      labels: $('#labels'),
      panel: $('#panel'),
      alerts: $('#alerts'),
      hint: $('#hint'),
      banner: $('#banner'),
      toasts: $('#toasts'),
      overlay: $('#overlay'),
      dev: $('#dev'),
      sample: $('#sample-tag'),
    };
    this.panelSig = null;
    this.alertEls = new Map();
    this.toasts = [];
    this.bannerT = 0;
    this._buildLabels();
    this._bindPanel();
  }

  // ---------- экраны ----------
  _overlay(html, cls = '') {
    this.el.overlay.className = cls;
    this.el.overlay.innerHTML = html;
  }

  showMenu() {
    this.hideGame();
    this._overlay(`
      <div class="menu">
        <div class="title-card">
          <span class="snow">❄</span>
          <h1>Симулятор<br/>новогодней<br/>суеты</h1>
          <div class="by"><img src="${LOGO_URL}" alt="" /> от «Пятёрочки»</div>
        </div>
        <div class="card controls" style="padding:14px 18px">
          <b>31 декабря. 5 минут. Один оливье.</b>
          <div class="small" style="margin-top:4px">Нарежь всё ровными кубиками, отбейся от кота, не дай кастрюле выкипеть — и успей добавить картошку.</div>
        </div>
        <div class="actions">
          <button class="primary big" data-ui="play">▶ Играть</button>
          <button class="ghost big" data-ui="practice">🔪 Тренировка нарезки</button>
          <a class="model-link" href="./gallery.html">Девушка и кот · 3D</a>
          <button class="ghost big" data-ui="controls">Управление</button>
          <button class="ghost big" data-ui="mute" title="Звук (M)">${this.app.isMuted() ? '🔇' : '🔊'}</button>
        </div>
        <div class="card controls hidden" id="controls-card">${this._controlsTable()}</div>
      </div>`);
    this._bindOverlay();
  }

  _controlsTable() {
    return `<table>
      <tr><td>Кухня</td><td>Клик по станции или по её метке — героиня идёт и открывает действие</td></tr>
      <tr><td>Доска: клик</td><td>Нож режет все части под лезвием</td></tr>
      <tr><td>Доска: движение мыши</td><td>Где пройдёт нож</td></tr>
      <tr><td>Нарезка на глаз</td><td>Размер зависит от положения ножа; линии-подсказки нет</td></tr>
      <tr><td>«Повернуть» или <kbd>R</kbd></td><td>Повернуть продукт на 90°</td></tr>
      <tr><td>Кнопки продуктов</td><td>Сменить продукт (нарезка сохраняется)</td></tr>
      <tr><td>«В миску»</td><td>Перенести нарезанное</td></tr>
      <tr><td>«Назад»</td><td>Общий вид (время идёт)</td></tr>
      <tr><td><kbd>Esc</kbd> или «Пауза»</td><td>Остановить время</td></tr>
      <tr><td><kbd>M</kbd></td><td>Звук вкл/выкл</td></tr>
    </table>`;
  }

  showInstructions() {
    this._overlay(
      `<div class="card dialog">
        <h2>Как готовим</h2>
        <ol>
          <li><b>Подойди к плите и поставь картошку вариться.</b> С этого момента пошли 5 минут.</li>
          <li>Кликай по станциям — героиня идёт туда и открывает действие.</li>
          <li><b>На доске:</b> мышь — положение ножа, клик по продукту — разрез через все полоски под лезвием. «Повернуть» (<kbd>R</kbd>) — для поперечной нарезки. Определяй размер на глаз по кубику-образцу в углу доски.</li>
          <li>Морковь → колбаса → огурец → яйцо, затем у миски — горошек и майонез.</li>
          <li><b>В ${fmtTime(CONFIG.potatoReadyAt)} картошка готова.</b> Достань, нарежь, добавь последней и удерживай «Перемешать» 3 секунды. Радио играет на кухне; если замолчит — подойди и почини.</li>
          <li>Мешать будут кот, телефон, кастрюля и гирлянда.</li>
        </ol>
        <div class="actions"><button class="primary big" data-ui="start">На кухню!</button></div>
      </div>`,
      'dim',
    );
    this._bindOverlay();
  }

  showPause() {
    this._overlay(
      `<div class="card dialog" style="width:min(380px,100%);text-align:center">
        <h2>Пауза</h2>
        <p class="small">Время остановлено. Кот тоже ждёт.</p>
        <div class="actions" style="justify-content:center">
          <button class="primary big" data-ui="resume">Продолжить</button>
          <button class="ghost" data-ui="menu">В меню</button>
        </div>
      </div>`,
      'dim',
    );
    this._bindOverlay();
    document.body.classList.add('paused-anim');
  }

  showResult(r) {
    const name = (id) => CONFIG.ingredients.find((d) => d.id === id)?.name ?? id;
    const emoji = !r.success ? '🍕' : r.S >= 85 ? '🏆' : r.S >= 60 ? '🥗' : '😅';
    const comments = [];
    if (!r.success) {
      if (r.missing.length) comments.push(`Не хватило: ${r.missing.map((i) => name(i).toLowerCase()).join(', ')}.`);
      if (!r.mixed) comments.push('Салат так и не перемешан.');
    }
    if (r.phoneTime >= 1) comments.push(`На загрузку фото Верки ушло ${Math.round(r.phoneTime)} с. Фото так и не загрузилось — интернет ушёл на каникулы.`);
    if (r.thefts) comments.push(`Кот утащил колбасу: ${r.thefts} раз(а). Он доволен.`);
    if (r.spills) comments.push(`Кастрюля выкипела: ${r.spills} раз(а). Пол помоют гости.`);
    if (r.garlandError) comments.push('Гирлянда так и не загорелась — праздник без огоньков.');
    if (r.radioError) comments.push('Радио осталось сломанным — праздник без музыки.');
    else if (r.radioRepairs) comments.push('Радио починено — музыка вернулась.');
    if (r.success && r.A < 50) comments.push('Кубики получились очень разными — зато с характером.');
    if (r.success && r.remaining >= 20) comments.push(`Ещё ${Math.floor(r.remaining)} с в запасе — можно успеть нарядиться.`);
    if (!comments.length) comments.push('Идеальная смена. Можно открывать шампанское.');

    this._overlay(
      `<div class="card dialog result ${r.success ? '' : 'fail'}">
        <div class="head">
          <div class="emoji">${emoji}</div>
          <h2>${esc(r.title)}</h2>
          <div class="small">${r.success ? 'Оливье приготовлен!' : 'Время вышло — оливье не готов'}</div>
        </div>
        <div style="text-align:center"><span class="score">${r.S}</span><span class="small"> / 100 очков</span></div>
        <table>
          <tr><td>Аккуратность нарезки</td><td>${Math.round(r.A)}%</td></tr>
          <tr><td>Состав</td><td>${r.added.length} из 7 ${r.added.map((i) => ICONS[i]).join('')}</td></tr>
          <tr><td>Перемешано</td><td>${r.mixed ? 'да' : 'нет'}</td></tr>
          <tr><td>Остаток времени</td><td>${fmtTime(r.remaining)}</td></tr>
          <tr><td>Кражи кота</td><td>${r.thefts} ${r.shoos ? `<span class="small">(прогнан ${r.shoos})</span>` : ''}</td></tr>
          <tr><td>Кухонные ошибки</td><td>${r.kitchenErrors}</td></tr>
          <tr><td>Просмотр телефона</td><td>${r.phoneTime.toFixed(1)} с</td></tr>
        </table>
        <div class="comments">${comments.map((c) => `<p>${esc(c)}</p>`).join('')}</div>
        <div class="actions" style="justify-content:center;margin-top:14px">
          <button class="primary big" data-ui="retry">Ещё раз</button>
          <button class="ghost big" data-ui="menu">В меню</button>
        </div>
      </div>`,
      'dim',
    );
    this._bindOverlay();
  }

  hideOverlay() {
    this.el.overlay.innerHTML = '';
    this.el.overlay.className = '';
    document.body.classList.remove('paused-anim');
  }

  _bindOverlay() {
    this.el.overlay.querySelectorAll('[data-ui]').forEach((b) => {
      b.addEventListener('click', () => {
        this.sound.unlock();
        this.sound.play('click');
        const a = b.dataset.ui;
        if (a === 'play') this.app.play();
        else if (a === 'practice') this.app.practice();
        else if (a === 'controls') $('#controls-card')?.classList.toggle('hidden');
        else if (a === 'mute') {
          this.app.toggleMute();
          b.textContent = this.app.isMuted() ? '🔇' : '🔊';
        } else if (a === 'start') this.app.startRound();
        else if (a === 'resume') this.app.resume();
        else if (a === 'menu') this.app.toMenu();
        else if (a === 'retry') this.app.retry();
      });
    });
  }

  // ---------- игровой экран ----------
  showGame() {
    this.el.hud.classList.remove('hidden');
    this.el.hud.innerHTML = `
      <div class="card hud-recipe">
        <h3>🥗 Оливье <span class="small" id="recipe-count"></span></h3>
        <div class="bar"><i id="recipe-bar"></i></div>
        <ul id="recipe-list">${CONFIG.suggestedOrder
          .map((id) => `<li data-id="${id}"><span class="chk"></span>${ICONS[id]} ${CONFIG.ingredients.find((d) => d.id === id).name}</li>`)
          .join('')}</ul>
      </div>
      <div class="card hud-timer">
        <div class="time" id="hud-time">05:00</div>
        <div class="label" id="hud-time-label">осталось</div>
        <div class="potato" id="hud-potato"></div>
      </div>
      <div class="hud-buttons">
        <button id="btn-mute" title="Звук (M)"></button>
        <button id="btn-pause" title="Пауза (Esc)"><span class="pause-ico"></span></button>
      </div>`;
    $('#btn-pause').addEventListener('click', () => this.app.pause());
    $('#btn-mute').addEventListener('click', () => this.app.toggleMute());
    this.panelSig = null;
    for (const el of this.alertEls.values()) el.remove();
    this.alertEls.clear();
    this.toasts = [];
    this.el.toasts.innerHTML = '';
    this.el.banner.classList.add('hidden');
    this.bannerT = 0;
  }

  hideGame() {
    this.el.hud.classList.add('hidden');
    this.el.panel.classList.add('hidden');
    this.el.hint.classList.add('hidden');
    this.el.banner.classList.add('hidden');
    this.el.sample.classList.add('hidden');
    this.el.labels.querySelectorAll('.st-label').forEach((l) => (l.style.display = 'none'));
    for (const el of this.alertEls.values()) el.remove();
    this.alertEls.clear();
    this.el.toasts.innerHTML = '';
    this.toasts = [];
    this.panelSig = null;
  }

  _buildLabels() {
    this.labelEls = {};
    for (const [id, st] of Object.entries(LAYOUT.stations)) {
      const d = document.createElement('div');
      d.className = 'st-label';
      d.textContent = st.label;
      d.style.display = 'none';
      d.addEventListener('click', () => {
        this.sound.unlock();
        this.act('goTo', id);
      });
      this.el.labels.appendChild(d);
      this.labelEls[id] = d;
    }
  }

  toast(text, kind = '', seconds = 2.6) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    this.toasts.push({ el: d, t: seconds });
    while (this.toasts.length > 3) this.toasts.shift().el.remove();
  }

  banner(text, red = false, seconds = 3) {
    this.el.banner.textContent = text;
    this.el.banner.classList.toggle('red', red);
    this.el.banner.classList.remove('hidden');
    this.bannerT = seconds;
  }

  onEvent(e, game) {
    switch (e.type) {
      case 'potPlaced':
        this.banner('Картошка варится! Пошли 5 минут', false, 2.4);
        break;
      case 'potatoReady':
        this.banner(`Картошка готова! До конца ${fmtTime(game.remaining)}`, false, 3.2);
        break;
      case 'catStole':
        this.toast(e.from === 'board' ? 'Кот утащил кусок колбасы с доски! Возьми замену' : 'Кот стащил колбасу с запасной тарелки', 'bad', 3.2);
        break;
      case 'catShooed':
        this.toast('Брысь! Кот убежал', 'good');
        break;
      case 'spill':
        this.toast('Вода пролилась на плиту! Кухонная ошибка', 'bad', 3);
        break;
      case 'potSaved':
        this.toast('Огонь убавлен', 'good');
        break;
      case 'garlandFixed':
        this.toast('Гирлянда снова горит ✨', 'good');
        break;
      case 'radioBroken':
        this.toast('Радио замолчало — можно починить 📻', '', 3);
        break;
      case 'radioFixed':
        this.toast('Музыка снова играет 📻', 'good');
        break;
      case 'transfer':
        this.toast(`${ICONS[e.ingredient]} ${game.ingredientName(e.ingredient)} — в миске`, 'good', 1.8);
        break;
      case 'added':
        this.toast(`${ICONS[e.ingredient]} ${game.ingredientName(e.ingredient)} — в миске`, 'good', 1.8);
        break;
      case 'replacement':
        this.toast('Замена на доске — её нужно дорезать', '', 2.4);
        break;
      default:
    }
  }

  // ---------- кадр ----------
  render(game, scene, dt, mode) {
    // тосты и баннер живут по анимационному времени (на паузе стоят)
    for (const t of this.toasts) {
      t.t -= dt;
      if (t.t <= 0) t.el.remove();
    }
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.add('hidden');
    }
    if (!game || mode === 'menu') return;
    this._renderHud(game);
    this._renderLabels(game, scene, mode);
    this._renderAlerts(game);
    this._renderPanel(game, scene);
    // подсказка
    const hint = game.hint?.text ?? (game.phase === 'prestart' ? 'Подойди к плите и поставь картошку вариться' : null);
    if (hint && mode !== 'result') {
      this.el.hint.textContent = hint;
      this.el.hint.classList.remove('hidden');
      this.el.hint.style.bottom = game.panel ? '' : '24px';
    } else this.el.hint.classList.add('hidden');
  }

  _renderHud(game) {
    const time = $('#hud-time');
    if (!time) return;
    time.textContent = fmtTime(game.remaining);
    time.classList.toggle('low', game.phase === 'running' && game.remaining <= 30);
    $('#hud-time-label').textContent = game.phase === 'prestart' ? 'старт — когда поставишь кастрюлю' : 'осталось';
    const pot = $('#hud-potato');
    let ptxt = '🥔 ';
    if (game.potato === 'raw') ptxt += 'Картошка ещё не на плите';
    else if (game.potato === 'boiling') ptxt += `Варится · готова через ${fmtTime(CONFIG.potatoReadyAt - game.t)}`;
    else if (game.potato === 'ready') ptxt += 'Готова! Достань из кастрюли';
    else if (game.potato === 'taken') ptxt += 'На доске — нарежь';
    else ptxt += 'В миске';
    pot.textContent = ptxt;
    pot.classList.toggle('ready', game.potato === 'ready' || game.potato === 'taken');
    let n = 0;
    for (const li of this.el.hud.querySelectorAll('#recipe-list li')) {
      const id = li.dataset.id;
      const done = !!game.added[id];
      if (done) n++;
      li.classList.toggle('done', done);
      li.classList.toggle('current', !done && game.boardIng === id && game.panel === 'board');
      li.querySelector('.chk').textContent = done ? '✓' : '';
    }
    $('#recipe-count').textContent = `${n}/7`;
    $('#recipe-bar').style.width = `${(n / 7) * 100}%`;
    $('#btn-mute').textContent = this.app.isMuted() ? '🔇' : '🔊';
  }

  _renderLabels(game, scene, mode) {
    const show = mode === 'playing' || mode === 'paused';
    const inBoard = game.panel === 'board';
    for (const [id, el] of Object.entries(this.labelEls)) {
      if (!show || inBoard || game.isOver()) {
        el.style.display = 'none';
        continue;
      }
      const p = scene.stationScreen(id);
      el.style.display = p.visible ? '' : 'none';
      el.style.left = `${p.x}%`;
      el.style.top = `${p.y}%`;
      const urgent =
        (id === 'stove' && (game.pot.active || game.potato === 'ready' || game.phase === 'prestart')) ||
        (id === 'garland' && game.garland.broken && !game.garland.repaired) ||
        (id === 'radio' && game.radio.broken) ||
        (id === 'phone' && game.alerts.some((a) => a.type === 'phone'));
      el.classList.toggle('urgent', urgent);
      el.classList.toggle('locked', game.phase === 'prestart' && id !== 'stove');
      el.classList.toggle('here', game.heroine.station === id && !game.heroine.target);
      el.classList.toggle('hover', scene.hoverStation === id);
    }
    // метка образца
    const s = this.el.sample;
    if (inBoard && !game.isOver()) {
      const p = scene.boardSampleScreen();
      s.style.left = `${p.x}%`;
      s.style.top = `${p.y}%`;
      s.classList.remove('hidden');
    } else s.classList.add('hidden');
  }

  _renderAlerts(game) {
    const ids = new Set();
    for (const a of game.alerts) {
      ids.add(a.id);
      let el = this.alertEls.get(a.id);
      if (!el) {
        el = document.createElement('div');
        const urgent = a.type === 'cat' || a.type === 'pot';
        el.className = `card alert ${urgent ? 'urgent' : ''}`;
        let acts = '';
        if (a.type === 'cat') acts = `<button class="danger" data-a="shoo">👋 Прогнать</button>`;
        if (a.type === 'pot') acts = `<button class="danger" data-a="goto" data-s="stove">К плите</button>`;
        if (a.type === 'garland') acts = `<button class="primary" data-a="goto" data-s="garland">Починить</button>`;
        if (a.type === 'radio') acts = `<button class="primary" data-a="goto" data-s="radio">К радио</button>`;
        if (a.type === 'potatoReady') acts = `<button class="primary" data-a="goto" data-s="stove">К плите</button>`;
        if (a.type === 'phone') acts = `<button class="primary" data-a="goto" data-s="phone">Открыть</button><button class="ghost" data-a="dismiss">Позже</button>`;
        el.innerHTML = `<div class="ico">${ALERT_ICONS[a.type] ?? '❗'}</div><div class="txt">${esc(a.text)}</div><div class="acts">${acts}</div>${a.deadline != null ? '<div class="timer"><i></i></div>' : ''}`;
        el.querySelectorAll('button').forEach((b) =>
          b.addEventListener('click', () => {
            this.sound.unlock();
            if (b.dataset.a === 'shoo') this.act('shoo');
            else if (b.dataset.a === 'goto') this.act('goTo', b.dataset.s);
            else if (b.dataset.a === 'dismiss') this.act('dismissAlert', a.id);
          }),
        );
        this.el.alerts.appendChild(el);
        this.alertEls.set(a.id, el);
      }
      if (a.deadline != null) {
        const bar = el.querySelector('.timer i');
        bar.style.width = `${Math.max(0, ((a.deadline - game.t) / a.window) * 100)}%`;
      }
    }
    for (const [id, el] of this.alertEls) {
      if (!ids.has(id)) {
        el.remove();
        this.alertEls.delete(id);
      }
    }
  }

  // ---------- панели станций ----------
  _bindPanel() {
    const p = this.el.panel;
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.dataset.hold) return;
      this.sound.unlock();
      const arg = b.dataset.arg;
      if (b.dataset.act === 'resetPractice') { this.app.resetPractice(); return; }
      if (b.dataset.act === 'practiceMenu') { this.app.toMenu(); return; }
      this.act(b.dataset.act, arg);
    });
    const holdOn = (e) => {
      const b = e.target.closest('button[data-hold]');
      if (!b) return;
      e.preventDefault();
      this.sound.unlock();
      this.holding = b.dataset.hold;
      this.act('setHold', b.dataset.hold, true);
    };
    const holdOff = () => {
      if (!this.holding) return;
      this.act('setHold', this.holding, false);
      this.holding = null;
    };
    p.addEventListener('pointerdown', holdOn);
    window.addEventListener('pointerup', holdOff);
    window.addEventListener('pointercancel', holdOff);
    p.addEventListener('pointerleave', holdOff);
  }

  releaseHolds() {
    if (this.holding) {
      this.act('setHold', this.holding, false);
      this.holding = null;
    }
  }

  _sig(game) {
    const st = game.panel;
    if (!st || game.isOver()) return 'none';
    const busy = game.action ? game.action.type : '';
    if (st === 'board') {
      const ing = game.board;
      const tabs = ['carrot', 'sausage', 'cucumber', 'egg', 'potato']
        .map((id) => `${id}:${game.ingredients[id].available ? 1 : 0}${game.ingredients[id].added ? 1 : 0}`)
        .join(',');
      return `board|${game.boardIng}|${tabs}|${ing?.missing.length}|${busy}|${game.transferBlockReason()}|${ing?.pieces.length}|${ing?.cuts}`;
    }
    if (st === 'stove') return `stove|${game.phase}|${game.potato}|${game.pot.active}|${busy}|${this.app.devMode ? 'd' : ''}`;
    if (st === 'bowl') return `bowl|${Object.values(game.added).join()}|${busy}|${game.bowl.mixed}`;
    if (st === 'garland') return `garland|${game.garland.broken}|${game.garland.repaired}`;
    if (st === 'radio') return `radio|${game.radio.broken}|${game.radio.enabled}|${busy}`;
    if (st === 'phone') {
      const alerts = game.alerts.filter((a) => a.type === 'cat' || a.type === 'pot').map((a) => a.text).join(';');
      return `phone|${game.phone.idx}|${game.phone.sessionTime >= CONFIG.events.phone.insightAfter}|${alerts}|${Math.floor(game.t / 30)}`;
    }
    return st;
  }

  _renderPanel(game, scene) {
    const p = this.el.panel;
    const sig = this._sig(game);
    if (sig !== this.panelSig) {
      this.panelSig = sig;
      if (sig === 'none') {
        p.classList.add('hidden');
        p.innerHTML = '';
      } else {
        p.className = 'card';
        p.innerHTML = this._panelHtml(game);
        if (game.panel === 'board') p.classList.add('board-mode');
        if (game.panel === 'phone') {
          p.className = 'phone-mode';
        }
      }
    }
    if (sig === 'none') return;
    // прогресс текущего действия
    const bar = p.querySelector('.act-progress i');
    if (bar) bar.style.width = game.action && game.action.type !== 'cut' ? `${(game.action.elapsed / game.action.duration) * 100}%` : '0%';
    const mix = p.querySelector('[data-hold="mix"] .fill');
    if (mix) mix.style.width = `${(game.bowl.mixProgress / CONFIG.durations.mixHold) * 100}%`;
    const mixBar = p.querySelector('.mix-progress i');
    if (mixBar) mixBar.style.width = `${(game.bowl.mixProgress / CONFIG.durations.mixHold) * 100}%`;
    const gar = p.querySelector('.garland-progress i');
    if (gar) gar.style.width = `${(game.garland.progress / CONFIG.durations.garlandHold) * 100}%`;
    const rad = p.querySelector('.radio-progress i');
    if (rad) rad.style.width = `${(game.radio.progress / game.cfg.durations.radioHold) * 100}%`;
    const radFill = p.querySelector('[data-hold="radio"] .fill');
    if (radFill) radFill.style.width = `${(game.radio.progress / game.cfg.durations.radioHold) * 100}%`;
    const potEta = p.querySelector('#pot-eta');
    if (potEta) potEta.textContent = fmtTime(CONFIG.potatoReadyAt - game.t);
    const clock = p.querySelector('#phone-clock');
    if (clock) clock.textContent = `23:${String(Math.min(59, Math.floor(game.t / 5))).padStart(2, '0')}`;
  }

  _panelHtml(game) {
    const busy = !!game.action;
    const back = `<button class="ghost" data-act="closePanel">← Назад</button>`;
    const actBar = `<div class="progress act-progress"><i></i></div>`;
    switch (game.panel) {
      case 'stove': {
        let body = '';
        if (game.phase === 'prestart') {
          body = `<div class="row"><button class="primary big" data-act="placePot">🔥 Поставить картошку вариться</button>${back}</div>
            <p class="note">После этого начнётся отсчёт 5 минут. Картошка будет готова в ${fmtTime(CONFIG.potatoReadyAt)}.</p>`;
        } else {
          const rows = [];
          if (game.pot.active) rows.push(`<button class="danger big" data-act="reduceHeat" ${busy ? 'disabled' : ''}>🔥 Убавить огонь</button>`);
          if (game.potato === 'ready') rows.push(`<button class="primary big" data-act="takePotato" ${busy ? 'disabled' : ''}>🥔 Достать картошку</button>`);
          else if (game.potato === 'boiling') rows.push(`<button class="ghost soft-disabled" data-act="takePotato">🥔 Достать картошку · через <span id="pot-eta"></span></button>`);
          rows.push(back);
          let note = 'Кастрюля под присмотром.';
          if (game.pot.active) note = 'Вода вот-вот убежит! Убавь огонь.';
          else if (game.potato === 'ready') note = 'Картошка готова. Достань, нарежь и добавь последней.';
          else if (game.potato === 'taken' || game.potato === 'added') note = 'Кастрюля пуста.';
          body = `<div class="row">${rows.join('')}</div><div class="row">${actBar}</div><p class="note">${note}</p>`;
        }
        return `<h2>♨️ Плита</h2>${body}`;
      }
      case 'board': {
        const ing = game.board;
        const tabs = ['carrot', 'sausage', 'cucumber', 'egg', 'potato']
          .filter((id) => game.ingredients[id].available || id !== 'potato')
          .map((id) => {
            const g = game.ingredients[id];
            const cls = [id === game.boardIng ? 'active' : '', g.added ? 'done' : ''].join(' ');
            return `<button class="${cls}" data-act="selectIngredient" data-arg="${id}" ${g.added || busy ? 'disabled' : ''}>${ICONS[id]} ${g.name}${g.added ? ' ✓' : ''}</button>`;
          })
          .join('');
        if (!ing) {
          return `<h2>🔪 Доска</h2><div class="row tabs">${tabs}</div>
            <div class="row" style="margin-top:8px"><button class="primary" data-act="goTo" data-arg="bowl">🥗 К миске</button>${back}</div>
            <p class="note">${game.potato === 'boiling' ? `Нарезать больше нечего — ждём картошку (${fmtTime(CONFIG.potatoReadyAt)}). Загляни к миске: горошек и майонез.` : 'Всё нарезано. Дальше — миска.'}</p>`;
        }
        const reason = game.transferBlockReason();
        const repl = ing.missing.length ? `<button class="danger" data-act="takeReplacement" ${busy ? 'disabled' : ''}>🌭 Взять замену</button>` : '';
        const quality = Math.round(accuracy(ing.pieces,CONFIG.tolerance)*100);
        const neat = ing.pieces.filter(q => q.w>=.75 && q.w<=1.25 && q.d>=.75 && q.d<=1.25).length;
        const volume = ing.pieces.reduce((s,q) => s+pieceVolume(q),0);
        const actions = game.practice ? `<button data-act="resetPractice" ${busy?'disabled':''}>↺ Начать заново</button><button class="ghost" data-act="practiceMenu">В меню</button>` : `<button class="primary ${reason ? 'soft-disabled' : ''}" data-act="transfer" title="${esc(reason ?? '')}">🥗 В миску</button>${back}`;
        return `<h2>🔪 ${ICONS[ing.id]} ${ing.name}<span class="sub">${game.practice?'Тренировка · ':''}кусочков: ${ing.pieces.length} · взмахов: ${ing.cuts}</span></h2>
          <div class="row tabs">${tabs}</div>
          <div class="cut-quality"><span>Аккуратность <b>${quality}%</b></span><div class="quality-track"><i style="width:${quality}%"></i></div><span>${neat} ровных кусочков · объём сохранён: ${Math.round(volume/ing.fullVolume*100)}%</span></div>
          <div class="row">
            <button data-act="rotate" ${busy ? 'disabled' : ''}>⟳ Повернуть <kbd>R</kbd></button>
            ${repl}
            ${actions}
            ${ing.missing.length ? actBar : ''}
          </div>
          <p class="note">Мышь — положение ножа · клик — разрез через все полоски · R — поворот. Нарезай на глаз по образцу; слишком крупные кусочки можно дорезать.${game.practice?' Закруглённые края продукта дают естественные маленькие обрезки.':''}</p>`;
      }
      case 'bowl': {
        const a = game.added;
        const list = CONFIG.suggestedOrder.map((id) => `<span style="opacity:${a[id] ? 1 : 0.35}">${ICONS[id]}</span>`).join(' ');
        const all = Object.values(a).every(Boolean);
        return `<h2>🥗 Миска <span class="sub">${list}</span></h2>
          <div class="row">
            <button class="${a.peas ? 'ghost' : 'primary'}" data-act="addPeas" ${a.peas || busy ? 'disabled' : ''}>🫛 ${a.peas ? 'Горошек добавлен' : 'Открыть горошек и добавить'}</button>
            <button class="${a.mayo ? 'ghost' : 'primary'}" data-act="addMayo" ${a.mayo || busy ? 'disabled' : ''}>🫙 ${a.mayo ? 'Майонез добавлен' : 'Добавить майонез'}</button>
            <button class="hold-btn ${all ? 'primary' : 'soft-disabled'}" data-hold="mix" data-act="mix">🥄 Перемешать (удерживай)<span class="fill"></span></button>
            ${back}
          </div>
          <div class="row">${actBar}<div class="progress mix-progress"><i></i></div></div>
          <p class="note">${all ? 'Удерживай «Перемешать» 3 секунды — прогресс сохраняется, если отпустить.' : 'Картофель добавляется последним, после него можно перемешивать.'}</p>`;
      }
      case 'garland': {
        if (!game.garland.broken) return `<h2>💡 Гирлянда</h2><div class="row">${back}</div><p class="note">${game.garland.repaired ? 'Горит как новая.' : 'Горит. Всё хорошо.'}</p>`;
        return `<h2>💡 Гирлянда погасла</h2>
          <div class="row"><button class="primary hold-btn big" data-hold="garland" data-act="garland">🔌 Поправить контакт (удерживай)<span class="fill"></span></button>${back}</div>
          <div class="row"><div class="progress garland-progress"><i></i></div></div>
          <p class="note">Удерживай 2 секунды.</p>`;
      }
      case 'radio': {
        if (game.radio.broken) return `<h2>📻 Радио замолчало</h2><div class="row"><button class="primary hold-btn big" data-hold="radio">Поправить настройку (удерживай)<span class="fill"></span></button>${back}</div><div class="progress radio-progress"><i></i></div><p class="note">Удерживай ${game.cfg.durations.radioHold} секунды. Музыка вернётся после ремонта.</p>`;
        return `<h2>📻 Кухонное радио</h2><div class="row"><button data-act="toggleRadio">${game.radio.enabled?'Выключить':'Включить'} радио</button>${back}</div><p class="note">${game.radio.enabled?'Играет негромкая мелодия.':'Радио выключено.'} Общий звук — клавиша M.</p>`;
      }
      case 'phone': {
        const pushes = game.alerts
          .filter((x) => x.type === 'cat' || x.type === 'pot')
          .map((x) => `<div class="push">${ALERT_ICONS[x.type]} ${esc(x.text)}</div>`)
          .join('');
        let feed = '';
        if (game.phone.idx === 0) feed = `<div class="empty">Новых уведомлений нет.<br/>Подозрительно тихо…</div>`;
        else {
          const insight = game.phone.sessionTime >= CONFIG.events.phone.insightAfter;
          feed = `<div class="profile"><div class="avatar">🌴</div><div><div class="name">Верка Отпускова</div><div class="meta">вымышленный профиль · только что</div></div></div>
            <div class="msg">Наконец-то море! Фото в купальнике 🌊</div>
            ${game.phone.idx > 1 ? '<div class="msg"><b>Верка:</b> ну как тебе фотка?</div>' : ''}
            <div class="photo"><div class="blur"></div><div class="load"><div class="spinner"></div>Загрузка фотографии…</div></div>
            ${insight ? '<div class="insight">Кажется, интернет тоже ушёл на каникулы.</div>' : ''}`;
        }
        return `<div class="phone">
          <div class="status"><span id="phone-clock">23:00</span><span>📶 E ▂</span></div>
          ${pushes}
          <div class="feed">${feed}</div>
          <div class="bottom"><button class="primary" data-act="closePanel">Закрыть телефон</button></div>
        </div>`;
      }
      default:
        return '';
    }
  }

  // ---------- режим разработчика ----------
  showDev(handlers, seed) {
    const d = this.el.dev;
    d.classList.remove('hidden');
    d.innerHTML = `<b>DEV · seed ${seed}</b>
      <button data-d="jump">→ ${fmtTime(CONFIG.potatoReadyAt-2)} (картошка)</button>
      <button data-d="cat">Позвать кота</button>
      <button data-d="radio">Сломать радио</button>
      <button data-d="prepare">Готовы 6 ингредиентов</button>
      <button data-d="end">Конец времени (−3 с)</button>`;
    d.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => handlers[b.dataset.d]?.()));
  }
}
