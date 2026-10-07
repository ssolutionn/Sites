// Интерфейс кампании (DOM). Читает состояние и отправляет команды через act().
import { DAYS, RECIPES, PRODUCTS, CAMPAIGN, DISH_ORDER } from '../campaign/data.js';
import { CLAYOUT, TABLE_SLOTS } from '../campaign/layout.js';
import { campaignScore } from '../campaign/save.js';
import { PRACTICE } from '../campaign/session.js';
import { LOGO_URL } from '../view/textures.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const ICON = { olivier: '🥗', crab: '🦀', sandwiches: '🥪', eggs: '🥚', tartlets: '🧁', tomatoes: '🍅', shuba: '🐟', canape: '🍢', fruit: '🍊', chicken: '🍗', practice: '🔪' };
const PICON = { potato: '🥔', carrot: '🥕', sausage: '🌭', cucumber: '🥒', egg: '🥚', peas: '🫛', mayo: '🫙', crab: '🦀', corn: '🌽', bread: '🍞', butter: '🧈', caviar: '🔴', tartlet: '🧁', cheese: '🧀', greens: '🌿', tomato: '🍅', onion: '🧅', herring: '🐟', beet: '🟣', skewer: '🍡', mandarin: '🍊', apple: '🍏', grapes: '🍇', chicken: '🍗', marinade: '🥣' };
const STATION_ICON = { board: '🔪', tray: '🍽', bowl: '🥣', phone: '📱', stove: '♨️', oven: '🔥', sink: '🚰', radio: '📻', garland: '💡', fridge: '🧊', bag: '🛍', table: '🎄', puddle: '🧽' };
const TOOL = { knife: '🔪 Нож', spoon: '🥄 Ложка', spatula: '🧈 Лопатка', brush: '🖌 Кисточка', hand: '✋ Рука' };

export const TIPS = {
  cube: 'Нарезка: мышь — где пройдёт нож, клик — удар. Сначала полоски, затем R (или «Повернуть») и режь поперёк — один удар проходит через все полоски. Размер — на глаз, по кубику-образцу. Маленькие закруглённые края допустимы.',
  round: 'Кружочки: клик отрезает кружок там, где нож. Толщина — расстояние до прошлого разреза, сравни с образцом. Поворот здесь не нужен.',
  grate: 'Тёрка: зажми левую кнопку и води мышью вверх-вниз. Засчитываются только полные движения.',
  bowl: 'Перемешивание: зажми кнопку и веди мышь по кругу внутри миски — нужно 4 оборота. Просто держать кнопку бесполезно.',
  sink: 'Мытьё: зажми кнопку и три губкой, пока грязь не исчезнет.',
  puddle: 'Уборка: зажми кнопку и води тряпкой по луже.',
  'tray:sandwiches': 'Бутерброды: лопаткой (зажми кнопку) намажь каждый ломтик — масло видно там, где прошла лопатка. Потом ложкой кликай по ломтикам: норма — 2 ложки икры.',
  'tray:eggs': 'Яйца: ножом кликни по яйцу — половинки. Ложкой кликни по каждой половинке — желток уйдёт в миску для начинки.',
  'tray:tartlets': 'Наполнение: ложкой кликни по рабочей тарелке — набрать начинку, по корзинке — положить. Пустой ложкой можно снять лишнее. Затем рукой — веточки зелени.',
  'tray:tomatoes': 'Помидоры: ножом кликни по верхушке — срежешь крышечку. Ложкой проведи внутри — вынешь сердцевину. Потом наполняй, как тарталетки.',
  'tray:shuba': 'Шуба: выбери компонент снизу, кликни по блюду, разровняй лопаткой (зажми кнопку) и подтверди слой. Последний слой можно отменить.',
  'tray:canape': 'Канапе: перетаскивай кусочки из тарелочек на шпажки. Лучше по одному каждого вида — порядок можно менять.',
  'tray:fruit': 'Фрукты: кликай по мандарину — снимешь кожуру и разделишь на дольки. Перетаскивай дольки, яблоко и виноград на тарелку: 12–18 кусочков.',
  catTheft: 'Кот тянется к колбасе! Нажми «Прогнать» в уведомлении, пока не кончилась красная полоска. Если не успеть — он унесёт кусок, и понадобится замена.',
  catSpill: 'Кот подбирается к стакану компота. Прогони его — иначе на полу будет лужа, которую придётся вытирать.',
  pot: 'Вода в кастрюле поднимается. Подойди к плите и нажми «Убавить огонь», пока не кончилась полоска.',
  delivery: 'Заказ оформлен. Пока курьер едет, занимайся другими делами — уведомление придёт само.',
  radio: 'Радио замолчало. Это не срочно: подойди к нему и удерживай «Настроить», когда будет минутка.',
  garland: 'Часть гирлянды погасла. Не срочно, но к концу дня её стоит починить — это влияет на порядок.',
  'tray:chicken': 'Маринад: кисточкой (зажми кнопку) проведи по курице. Видимые части — грудка, ножки, крылья. Спинку покрывать не нужно.',
};

export class CampaignUI {
  constructor({ app, act, sound, view }) {
    this.app = app;
    this.act = act;
    this.sound = sound;
    this.view = view;
    this.el = {
      hud: $('#hud'),
      labels: $('#labels'),
      panel: $('#panel'),
      alerts: $('#alerts'),
      hint: $('#hint'),
      toasts: $('#toasts'),
      overlay: $('#overlay'),
      phone: $('#phone'),
      recipe: $('#recipe'),
      tip: $('#tip'),
      dev: $('#dev'),
      ghost: $('#drag-ghost'),
    };
    this.panelSig = null;
    this.alertEls = new Map();
    this.toasts = [];
    this.tipShown = new Set();
    this.recipeOpen = false;
    this.phoneTab = 'messages';
    this.labelEls = {};
    for (const [id, st] of Object.entries(CLAYOUT.stations)) this._label(id, st.label);
    this._label('puddle', 'Лужа');
    this._bindPanel();
    this._bindPhone();
    this._bindRecipe();
  }

  _label(id, text) {
    const d = document.createElement('div');
    d.className = 'st-label';
    d.innerHTML = `${STATION_ICON[id] ?? ''} ${esc(text)}`;
    d.style.display = 'none';
    d.addEventListener('click', () => {
      this.sound.unlock();
      this.act('goTo', id);
    });
    this.el.labels.appendChild(d);
    this.labelEls[id] = d;
  }

  // ---------- экраны ----------
  _overlay(html, cls = '') {
    this.el.overlay.className = cls;
    this.el.overlay.innerHTML = html;
    this.el.overlay.querySelectorAll('[data-ui]').forEach((b) =>
      b.addEventListener('click', (e) => {
        this.sound.unlock();
        this.sound.play('click');
        this.app.ui(b.dataset.ui, b.dataset.arg, e);
      }),
    );
  }

  hideOverlay() {
    this.el.overlay.innerHTML = '';
    this.el.overlay.className = '';
    document.body.classList.remove('paused-anim');
  }

  showMenu(save) {
    this.hideKitchen();
    const cur = save.data.days.findIndex((d) => d.unlocked && !d.completed);
    const has = save.hasProgress;
    const done = save.data.days.filter((d) => d.completed).length;
    const contLabel = save.data.finished ? 'Финальный стол' : `Продолжить · день ${(cur < 0 ? 7 : cur + 1)}`;
    this._overlay(`
      <div class="menu">
        <div class="title-card">
          <span class="snow">❄</span>
          <h1>Симулятор<br/>новогодней<br/>суеты</h1>
          <div class="by"><img src="${LOGO_URL}" alt="" /> от «Пятёрочки»</div>
        </div>
        <div class="card controls" style="padding:14px 18px">
          <b>Семь дней подготовки. Десять блюд. Один праздничный стол.</b>
          <div class="small" style="margin-top:4px">${has ? `Пройдено дней: ${done} из 7 · итог кампании ${campaignScore(save.data)}` : 'Режь на глаз, мажь, наполняй, собирай слои — и не дай коту утащить колбасу.'}</div>
          ${save.status === 'reset' ? '<div class="small warn">Старое сохранение повреждено или устарело — начата новая кампания.</div>' : ''}
        </div>
        <div class="actions">
          ${has ? `<button class="primary big" data-ui="continue">▶ ${contLabel}</button>` : `<button class="primary big" data-ui="new">▶ Новая кампания</button>`}
          ${has ? '<button class="ghost big" data-ui="new">Новая кампания</button>' : ''}
          <button class="ghost big" data-ui="journal">📖 Журнал дней</button>
        </div>
        <div class="actions">
          <button class="ghost" data-ui="practice">🔪 Свободная практика</button>
          <a class="ghost btn-link" href="./classic.html">⏱ Оливье за 5 минут</a>
          <a class="ghost btn-link" href="./gallery.html">Девушка и кот · 3D</a>
          <button class="ghost" data-ui="controls">Управление</button>
          <button class="ghost" data-ui="mute" title="Звук (M)">${this.app.isMuted() ? '🔇' : '🔊'}</button>
          <button class="ghost" data-ui="quality" title="Качество графики">${save.data.settings.quality === 'low' ? '🖥 Графика: экономная' : '🖥 Графика: полная'}</button>
        </div>
        <div class="card controls hidden" id="controls-card">${this._controls()}</div>
      </div>`);
  }

  _controls() {
    return `<table>
      <tr><td>Клик по полу</td><td>Пойти в эту точку</td></tr>
      <tr><td>Клик по станции или метке</td><td>Подойти и начать действие</td></tr>
      <tr><td>Мышь у доски / клик</td><td>Положение ножа / один удар</td></tr>
      <tr><td><kbd>R</kbd></td><td>Повернуть раскладку (где разрешено)</td></tr>
      <tr><td>Удержание и движение</td><td>Намазывание, перемешивание, тёрка, мытьё, уборка, маринад</td></tr>
      <tr><td>Перетаскивание</td><td>Шпажки, фрукты, сервировка стола</td></tr>
      <tr><td><kbd>Q</kbd></td><td>Рецепт</td></tr>
      <tr><td><kbd>Esc</kbd></td><td>Закрыть телефон/рецепт, иначе пауза</td></tr>
      <tr><td><kbd>M</kbd></td><td>Звук</td></tr>
    </table>`;
  }

  toggleControls() {
    $('#controls-card')?.classList.toggle('hidden');
  }

  showConfirmReset() {
    this._overlay(
      `<div class="card dialog" style="width:min(440px,100%)">
        <h2>Начать заново?</h2>
        <p>Прогресс по дням и лучшие оценки будут стёрты. Это действие нельзя отменить.</p>
        <div class="actions"><button class="danger big" data-ui="resetYes">Да, начать новую кампанию</button><button class="ghost big" data-ui="menu">Отмена</button></div>
      </div>`,
      'dim',
    );
  }

  showJournal(save) {
    const cards = DAYS.map((d, i) => {
      const st = save.data.days[i];
      const state = st.completed ? 'done' : st.unlocked ? 'current' : 'locked';
      const dishes = d.dishes.map((id) => `${ICON[id]} ${RECIPES[id].name}`).join('<br/>');
      const best = st.best ? `<div class="score-pill">лучший ${st.best.D}${st.last && st.last !== st.best ? ` · последний ${st.last.D}` : ''}</div>` : '';
      const btn = state === 'locked' ? '<span class="small">🔒 закрыт</span>' : `<button class="${state === 'current' ? 'primary' : 'ghost'}" data-ui="day" data-arg="${i}">${state === 'done' ? 'Переиграть' : 'Играть'}</button>`;
      return `<div class="day-card ${state}"><div class="day-n">День ${d.id}</div><b>${esc(d.title)}</b><div class="small">${dishes}</div>${best}<div class="day-btn">${btn}</div></div>`;
    }).join('');
    this._overlay(
      `<div class="card dialog journal">
        <h2>Журнал подготовки</h2>
        <p class="small">Итог кампании считается по <b>лучшим</b> результатам семи дней: ${campaignScore(save.data)} из 100. Переигровка дня не стирает дальнейший прогресс.</p>
        <div class="days">${cards}</div>
        <div class="actions"><button class="ghost big" data-ui="menu">← В меню</button></div>
      </div>`,
      'dim',
    );
  }

  showDayIntro(day, save, resumed = false) {
    const dishes = day.dishes.map((id) => `<li>${ICON[id]} <b>${RECIPES[id].name}</b> — ${esc(RECIPES[id].look.toLowerCase())}</li>`).join('');
    const skills = day.newSkills.map((s) => `<span class="chip">${esc(s)}</span>`).join(' ');
    this._overlay(
      `<div class="card dialog intro">
        <div class="day-n">День ${day.id} из 7</div>
        <h2>${esc(day.title)}</h2>
        <p>${esc(day.intro)}</p>
        <ul class="dish-list">${dishes}</ul>
        <div class="skills">Новое: ${skills}</div>
        ${resumed ? '<p class="small warn">Страница перезагружалась во время дня: начинаем этот день заново, прошлые результаты сохранены.</p>' : ''}
        <p class="small">Ориентир: около ${day.targetMinutes} минут. Время не ограничено — день завершается, когда все блюда готовы.</p>
        <div class="actions"><button class="primary big" data-ui="enter">На кухню!</button><button class="ghost" data-ui="journal">Журнал</button></div>
      </div>`,
      'dim',
    );
  }

  showPause() {
    this._overlay(
      `<div class="card dialog" style="width:min(400px,100%);text-align:center">
        <h2>Пауза</h2>
        <p class="small">Плита, духовка, доставка и кот ждут. Музыка тоже на паузе.</p>
        <div class="actions" style="justify-content:center">
          <button class="primary big" data-ui="resume">Продолжить</button>
          <button class="ghost" data-ui="restartDay">Начать день заново</button>
          <button class="ghost" data-ui="menu">В меню</button>
        </div>
      </div>`,
      'dim',
    );
    document.body.classList.add('paused-anim');
  }

  showPracticeSelect() {
    const acts = Object.entries(PRACTICE)
      .map(([id, p]) => {
        const products = id === 'cubes' ? ['carrot', 'potato', 'cucumber', 'egg', 'sausage', 'cheese', 'onion'] : id === 'rounds' ? ['cucumber', 'sausage'] : id === 'grate' ? ['cheese', 'carrot', 'beet', 'potato'] : [null];
        return `<div class="practice-row"><b>${p.label}</b> ${products.map((pr) => `<button class="ghost" data-ui="practiceGo" data-arg="${id}:${pr ?? ''}">${pr ? PICON[pr] + ' ' + PRODUCTS[pr].name : 'Начать'}</button>`).join('')}</div>`;
      })
      .join('');
    this._overlay(
      `<div class="card dialog"><h2>Свободная практика</h2><p class="small">Без помех и таймера. Результаты кампании не меняются.</p>${acts}
      <div class="actions"><button class="ghost big" data-ui="menu">← В меню</button></div></div>`,
      'dim',
    );
  }

  showDayResult(r, day, save, isLast) {
    const rows = day.dishes
      .map((id) => {
        const notes = (r.notes[id] ?? []).map((n) => `<li>${esc(n)}</li>`).join('');
        return `<div class="dish-res"><div class="dish-q">${r.dishes[id]}</div><div><b>${ICON[id]} ${RECIPES[id].name}</b><ul>${notes}</ul></div></div>`;
      })
      .join('');
    const best = save.data.days[day.id - 1].best;
    const wish = r.wish ? `<p>${r.wish.met ? '✅ Пожелание гостей выполнено' : '⚠️ Пожелание гостей не выполнено'}</p>` : '';
    this._overlay(
      `<div class="card dialog result">
        <div class="head"><div class="emoji">${r.D >= 85 ? '🏆' : r.D >= 60 ? '🎄' : '😅'}</div><h2>День ${day.id} завершён</h2><div class="small">${esc(day.title)}</div></div>
        <div style="text-align:center"><span class="score">${r.D}</span><span class="small"> / 100 за день${best && best.D > r.D ? ` · лучший ${best.D}` : ''}</span></div>
        ${rows}
        ${wish}
        <div class="order-row"><b>Порядок на кухне: ${r.order}</b>${r.orderNotes.length ? ' — ' + r.orderNotes.map(esc).join('; ') : ' — чисто и празднично'}</div>
        <p class="small">Время на кухне: ${fmt(r.time)} (ходьба ${fmt(r.stats.walk)}, крупный план ${fmt(r.stats.closeup)}, телефон ${fmt(r.stats.phone)}).</p>
        <div class="actions" style="justify-content:center">
          ${isLast ? '<button class="primary big" data-ui="final">🎄 Финальный стол</button>' : '<button class="primary big" data-ui="nextDay">Следующий день →</button>'}
          <button class="ghost" data-ui="replay">Переиграть день</button>
          <button class="ghost" data-ui="journal">Журнал</button>
        </div>
      </div>`,
      'dim',
    );
  }

  showFinal(save) {
    const rows = save.data.days.map((d, i) => `<tr><td>День ${i + 1} · ${esc(DAYS[i].title)}</td><td>${d.best ? d.best.D : '—'}</td></tr>`).join('');
    this._overlay(
      `<div class="card dialog final-card">
        <h2>🎆 С Новым годом!</h2>
        <p>Все десять блюд на праздничном столе. Гости уже звонят в дверь.</p>
        <table class="final-table">${rows}<tr><td><b>Итог кампании (по лучшим дням)</b></td><td><b>${campaignScore(save.data)}</b></td></tr></table>
        <div class="actions"><button class="ghost" data-ui="journal">Журнал — переиграть дни</button><button class="ghost" data-ui="menu">В меню</button></div>
      </div>`,
      'side',
    );
  }

  // ---------- кухня ----------
  showKitchen(session) {
    this.el.hud.classList.remove('hidden');
    this.el.hud.innerHTML = `
      <div class="card hud-day">
        <div class="hud-day-title" id="hud-day"></div>
        <div class="hud-step" id="hud-step"></div>
        <div class="hud-actions">
          <button id="btn-recipe" title="Рецепт (Q)">📋 Рецепт</button>
          <button id="btn-help" title="Повторить подсказку">?</button>
          <button id="btn-finish" class="primary hidden">✅ Завершить день</button>
        </div>
      </div>
      <div class="card hud-clock"><div id="hud-clock">00:00</div><div class="small" id="hud-sub">на кухне</div></div>
      <div class="hud-buttons">
        <button id="btn-phone" title="Телефон">📱<span class="badge hidden" id="phone-badge"></span></button>
        <button id="btn-mute" title="Звук (M)"></button>
        <button id="btn-pause" title="Пауза (Esc)"><span class="pause-ico"></span></button>
      </div>`;
    $('#btn-recipe').addEventListener('click', () => this.toggleRecipe());
    $('#btn-help').addEventListener('click', () => this.repeatTip());
    $('#btn-finish').addEventListener('click', () => this.act('finishDay'));
    $('#btn-phone').addEventListener('click', () => this.act('goTo', 'phone'));
    $('#btn-mute').addEventListener('click', () => this.app.toggleMute());
    $('#btn-pause').addEventListener('click', () => this.app.pause());
    this.panelSig = null;
    this.recipeOpen = false;
    this.el.recipe.classList.add('hidden');
    for (const el of this.alertEls.values()) el.remove();
    this.alertEls.clear();
    this.el.toasts.innerHTML = '';
    this.toasts = [];
    this.lastTip = null;
  }

  hideKitchen() {
    this.el.hud.classList.add('hidden');
    this.el.panel.classList.add('hidden');
    this.el.panel.innerHTML = '';
    this.el.phone.classList.add('hidden');
    this.el.recipe.classList.add('hidden');
    this.el.hint.classList.add('hidden');
    this.el.tip.classList.add('hidden');
    for (const l of Object.values(this.labelEls)) l.style.display = 'none';
    for (const el of this.alertEls.values()) el.remove();
    this.alertEls.clear();
    this.el.toasts.innerHTML = '';
    this.toasts = [];
    this.panelSig = null;
  }

  toast(text, kind = '', seconds = 2.6) {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.innerHTML = text;
    this.el.toasts.appendChild(d);
    this.toasts.push({ el: d, t: seconds });
    while (this.toasts.length > 3) this.toasts.shift().el.remove();
  }

  tip(topic, force = false) {
    if (!TIPS[topic]) return;
    if (!force && this.tipShown.has(topic)) return;
    this.tipShown.add(topic);
    this.lastTip = topic;
    this.el.tip.innerHTML = `<div class="tip-text">💡 ${esc(TIPS[topic])}</div><button class="ghost" id="tip-ok">Понятно</button>`;
    this.el.tip.classList.remove('hidden');
    $('#tip-ok').addEventListener('click', () => this.el.tip.classList.add('hidden'));
    this.tipT = 14;
  }

  repeatTip() {
    const s = this.app.session;
    let topic = this.lastTip;
    if (s?.panel === 'board') {
      const it = s.boardCur();
      topic = it?.grater ? 'grate' : it?.log ? 'round' : 'cube';
    } else if (s?.panel === 'tray' && s.tray.owner) topic = 'tray:' + s.trayLayoutId(s.tray.owner);
    else if (s?.panel && TIPS[s.panel]) topic = s.panel;
    if (topic) this.tip(topic, true);
  }

  onEvent(e, s) {
    switch (e.type) {
      case 'tutorial':
        this.tip(e.topic);
        break;
      case 'open':
        if (['bowl', 'sink', 'puddle'].includes(e.station)) this.tip(e.station);
        if (e.station === 'phone') {
          this.openPhone();
        }
        break;
      case 'close':
        if (e.station === 'phone') this.el.phone.classList.add('hidden');
        break;
      case 'dishDone': {
        const d = s.dishes[e.dishId];
        this.toast(`<b>${ICON[e.dishId]} ${esc(d.recipe.name)} готово — ${e.Q}</b><br/><span class="small">${e.notes.map(esc).join(' · ')}</span>`, 'good dish-toast', 6);
        break;
      }
      case 'dayReady':
        this.toast('<b>Все блюда дня готовы!</b> Нажми «Завершить день».', 'good', 5);
        break;
      case 'catStart':
        this.tip(e.kind === 'spill' ? 'catSpill' : 'catTheft');
        break;
      case 'potBoil':
        this.tip('pot');
        break;
      case 'orderPlaced':
        this.tip('delivery');
        break;
      case 'radioBroken':
        this.tip('radio');
        break;
      case 'garlandOff':
        this.tip('garland');
        break;
      case 'catStole':
        this.toast('Кот утащил кусок колбасы! На доске — «Взять замену»', 'bad', 3.5);
        break;
      case 'catSpill':
        this.toast('Кот опрокинул компот — на полу лужа', 'bad', 3.5);
        break;
      case 'catShooed':
        this.toast('Брысь! Кот убежал', 'good');
        break;
      case 'spill':
        this.toast('Кастрюля выкипела — у плиты лужа', 'bad', 3);
        break;
      case 'potSaved':
        this.toast('Огонь убавлен', 'good');
        break;
      case 'garlandFixed':
        this.toast('Гирлянда снова горит ✨', 'good');
        break;
      case 'radioFixed':
        this.toast('Радио снова играет 🎵', 'good');
        break;
      case 'washed':
        this.toast(esc(s.equipment[e.item].cleanText) + ' ✨', 'good');
        break;
      case 'transfer':
        this.toast(`${PICON[e.product] ?? ''} ${esc(PRODUCTS[e.product].name)} — готово (${Math.round(e.q * 100)} % аккуратно)`, 'good', 2.2);
        break;
      case 'practiceResult':
        this.toast(`<b>Результат: ${Math.round(e.q * 100)} %</b>`, 'good', 4);
        break;
      case 'collectWarn':
        this.confirmCollect();
        break;
      case 'bagArrived':
        this.toast('Пакет на столешнице — разбери покупки', '', 3);
        break;
      case 'ovenEarly':
        this.toast('Курица ещё сырая — верни её в духовку', 'bad', 3);
        break;
      case 'chickenSpoiled':
        this.toast('Курица сгорела. Помой форму и приготовь замену', 'bad', 4);
        break;
      default:
    }
  }

  confirmCollect() {
    this.el.tip.innerHTML = `<div class="tip-text">⚠️ На плите или в духовке срочное дело. Всё равно идти за пакетом?</div><button class="danger" id="go-anyway">Идти</button><button class="ghost" id="go-cancel">Остаться</button>`;
    this.el.tip.classList.remove('hidden');
    $('#go-anyway').addEventListener('click', () => {
      this.el.tip.classList.add('hidden');
      this.act('collectOrder', true);
    });
    $('#go-cancel').addEventListener('click', () => this.el.tip.classList.add('hidden'));
    this.tipT = 10;
  }

  // ---------- кадр ----------
  render(s, dt, mode) {
    for (const t of this.toasts) {
      t.t -= dt;
      if (t.t <= 0) t.el.remove();
    }
    this.toasts = this.toasts.filter((t) => t.t > 0);
    if (this.tipT > 0) {
      this.tipT -= dt;
      if (this.tipT <= 0) this.el.tip.classList.add('hidden');
    }
    if (!s || (mode !== 'kitchen' && mode !== 'paused')) return;
    this._renderHud(s);
    this._renderLabels(s);
    this._renderAlerts(s);
    this._renderPanel(s);
    if (!this.el.phone.classList.contains('hidden')) this._renderPhoneLive(s);
    if (this.recipeOpen) this._renderRecipe(s);
    const hint = s.hint?.text ?? (s.heroine.away ? 'Героиня забирает заказ у курьера…' : null);
    if (hint) {
      this.el.hint.textContent = hint;
      this.el.hint.classList.remove('hidden');
    } else this.el.hint.classList.add('hidden');
  }

  _renderHud(s) {
    const d = s.day;
    $('#hud-day').innerHTML = s.practice ? `🔪 ${esc(s.recipes.practice.name)}` : `День ${d.id} · ${esc(d.title)}`;
    let step = '';
    if (s.phase === 'ready') step = '✅ Всё готово — можно завершать день';
    else {
      const id = s.activeDish();
      if (id) {
        const next = s.nextSteps(id).find((st) => !(st.type === 'boil' && s.stove.state !== 'empty'));
        const dishes = Object.values(s.dishes).map((x) => `${ICON[x.id]}${x.done ? '✓' : ''}`).join(' ');
        step = `${dishes} · ${esc(s.recipes[id].name)}${next ? ': ' + esc(next.label.toLowerCase()) : ''}`;
      } else if (s.day.finalServe) step = '🎄 Расставь все 10 блюд на праздничном столе';
    }
    $('#hud-step').innerHTML = step;
    $('#hud-clock').textContent = fmt(s.t);
    $('#hud-sub').textContent = s.stove.state === 'boiling' ? `🥔 готов через ${fmt(s.stove.readyAt - s.t)}` : s.oven.state === 'baking' ? `🍗 духовка ${fmt(s.oven.readyAt - s.t)}` : s.delivery.order ? `🛵 ${({ accepted: 'заказ принят', assembling: 'собирают', onTheWay: 'курьер в пути', arrived: 'курьер приехал', collecting: 'забираем' })[s.delivery.order.status]}` : 'на кухне';
    $('#btn-finish').classList.toggle('hidden', s.phase !== 'ready' || !!s.practice);
    const badge = $('#phone-badge');
    badge.classList.toggle('hidden', !s.phone.unread);
    badge.textContent = s.phone.unread;
    $('#btn-mute').textContent = this.app.isMuted() ? '🔇' : '🔊';
    $('#btn-phone').classList.toggle('hidden', !!s.practice);
  }

  _renderLabels(s) {
    const closeup = ['board', 'tray', 'bowl', 'sink', 'puddle', 'table'].includes(s.panel) || s.practice;
    for (const [id, el] of Object.entries(this.labelEls)) {
      let show = !closeup && !s.heroine.away && s.phase !== 'finished';
      if (id === 'bag') show = show && !!s.delivery.bag;
      if (id === 'puddle') show = show && s.puddles.length > 0;
      if (id === 'table') show = show && (s.day.finalServe || s.phase === 'ready');
      if (!show) {
        el.style.display = 'none';
        continue;
      }
      const p = this.view.stationScreen(id);
      el.style.display = p.visible ? '' : 'none';
      el.style.left = `${p.x}%`;
      el.style.top = `${p.y}%`;
      const urgent = s.alerts.some((a) => a.station === id && (a.urgent || a.key === 'bag' || a.key === 'potReady' || a.key === 'puddle'));
      el.classList.toggle('urgent', urgent);
      el.classList.toggle('here', s.heroine.station === id && !s.heroine.target);
      el.classList.toggle('hover', this.view.hover === id);
    }
  }

  _renderAlerts(s) {
    const ids = new Set();
    for (const a of s.alerts) {
      ids.add(a.id);
      let el = this.alertEls.get(a.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `card alert ${a.urgent ? 'urgent' : ''}`;
        const icon = { cat: '🐱', spillWarn: '🐱', pot: '♨️', oven: '🍗', potReady: '🥔', garland: '💡', radio: '📻', phone: '📱', delivery: '🛵', bag: '🛍', puddle: '💧' }[a.key] ?? '❗';
        let acts = '';
        if (a.action === 'shoo') acts = `<button class="danger" data-a="shoo">👋 Прогнать</button>`;
        else if (a.action === 'collect') acts = `<button class="primary" data-a="collect">Забрать заказ</button>`;
        else if (a.station) acts = `<button class="${a.urgent ? 'danger' : 'primary'}" data-a="go" data-s="${a.station}">${a.phone ? 'Открыть' : 'Подойти'}</button>`;
        if (!a.urgent && a.dismissable !== false) acts += `<button class="ghost" data-a="dismiss">×</button>`;
        el.innerHTML = `<div class="ico">${icon}</div><div class="txt">${esc(a.text)}</div><div class="acts">${acts}</div>${a.deadline != null ? '<div class="timer"><i></i></div>' : ''}`;
        el.querySelectorAll('button').forEach((b) =>
          b.addEventListener('click', () => {
            this.sound.unlock();
            if (b.dataset.a === 'shoo') this.act('shoo');
            else if (b.dataset.a === 'collect') this.act('collectOrder');
            else if (b.dataset.a === 'go') this.act('goTo', b.dataset.s);
            else this.act('dismissAlert', a.id);
          }),
        );
        this.el.alerts.appendChild(el);
        this.alertEls.set(a.id, el);
      }
      if (a.deadline != null) el.querySelector('.timer i').style.width = `${Math.max(0, ((a.deadline - s.t) / a.window) * 100)}%`;
    }
    for (const [id, el] of this.alertEls)
      if (!ids.has(id)) {
        el.remove();
        this.alertEls.delete(id);
      }
  }

  // ---------- панели станций ----------
  _bindPanel() {
    const p = this.el.panel;
    p.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || b.dataset.hold) return;
      this.sound.unlock();
      const args = b.dataset.args ? JSON.parse(b.dataset.args) : [];
      this.act(b.dataset.act, ...args);
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
    // перетаскивание блюд на стол
    p.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('[data-dish]');
      if (!card) return;
      e.preventDefault();
      this.dragDish = card.dataset.dish;
      this.el.ghost.innerHTML = card.innerHTML;
      this.el.ghost.classList.remove('hidden');
      this._moveGhost(e);
    });
    window.addEventListener('pointermove', (e) => this.dragDish && this._moveGhost(e));
    window.addEventListener('pointerup', (e) => {
      if (!this.dragDish) return;
      const id = this.dragDish;
      this.dragDish = null;
      this.el.ghost.classList.add('hidden');
      this.app.dropDish(id, e);
    });
  }

  _moveGhost(e) {
    this.el.ghost.style.left = `${e.clientX}px`;
    this.el.ghost.style.top = `${e.clientY}px`;
  }

  releaseHolds() {
    if (this.holding) {
      this.act('setHold', this.holding, false);
      this.holding = null;
    }
    this.dragDish = null;
    this.el.ghost.classList.add('hidden');
  }

  _btn(label, act, args = [], cls = '', disabled = false, title = '') {
    return `<button class="${cls}" data-act="${act}" data-args='${esc(JSON.stringify(args))}' ${disabled ? 'disabled' : ''} title="${esc(title)}">${label}</button>`;
  }

  _sig(s) {
    const p = s.panel;
    if (!p || s.heroine.away || s.phase === 'finished') return 'none';
    const busy = s.action?.type ?? '';
    const base = `${p}|${busy}|${s.phase}`;
    switch (p) {
      case 'board': {
        const it = s.boardCur();
        return `${base}|${s.board.current}|${s.boardTasks().map((t) => t.key + t.state + t.started).join(',')}|${it?.missing.length}|${s.transferBlock()}|${it?.cuts}|${it?.grater?.done}|${s.equipment.bowl.clean}|${s.bowl.owner}`;
      }
      case 'bowl': {
        const mt = s.mixTarget();
        return `${base}|${s.bowlTasks().map((t) => t.stepId + t.state + (t.block ?? '')).join(',')}|${mt?.ok}|${Math.floor(s.mixTurns() * 4)}|${s.equipment.bowl.clean}`;
      }
      case 'tray': {
        const id = s.tray.owner;
        const d = id ? s.dishes[id] : null;
        const extra = id === 'shuba' && d?.work ? `${d.work.layers.length}|${d.work.current?.comp}|${d.work.current?.placed}|${s.shubaComponents().map((c) => +c.available).join('')}` : '';
        return `${base}|${id}|${s.trayDishes().map((x) => x + s.trayBlock(x)).join(',')}|${d ? d.recipe.steps.map((st) => +s.stepDone(id, st.id)).join('') : ''}|${s.tool}|${s.canConfirm(id ?? '')?.ok}|${extra}|${s.workPlate.owner}`;
      }
      case 'stove':
        return `${base}|${s.stove.state}|${!!s.stove.overflow}|${s.stoveTask()?.dishId}`;
      case 'oven':
        return `${base}|${s.oven.state}|${s.dishes.chicken?.steps.marinade.done}|${s.dishes.chicken?.done}`;
      case 'sink':
        return `${base}|${s.dirtyItems().map((x) => x.id).join(',')}|${s.sinkJob?.item}`;
      case 'radio':
        return `${base}|${s.radio.broken}|${s.radio.enabled}`;
      case 'garland':
        return `${base}|${s.garland.broken}`;
      case 'bag':
        return `${base}|${s.delivery.bag?.items.map((i) => +i.placed).join('')}`;
      case 'fridge':
        return `${base}|${JSON.stringify(s.inventory.stock)}`;
      case 'table':
        return `${base}|${JSON.stringify(s.table.placed)}|${s.tableDishes().join(',')}`;
      case 'phone':
        return 'phone';
      default:
        return base;
    }
  }

  _renderPanel(s) {
    const p = this.el.panel;
    const sig = this._sig(s);
    if (sig !== this.panelSig) {
      this.panelSig = sig;
      if (sig === 'none' || sig === 'phone') {
        p.classList.add('hidden');
        p.innerHTML = '';
      } else {
        p.className = 'card station-panel';
        p.innerHTML = this._panelHtml(s);
      }
    }
    if (sig === 'none' || sig === 'phone') return;
    const bar = p.querySelector('.act-progress i');
    if (bar) bar.style.width = s.action && s.action.type !== 'cut' ? `${(s.action.elapsed / s.action.duration) * 100}%` : '0%';
    const live = p.querySelector('[data-live]');
    if (live) live.innerHTML = this._live(s);
  }

  // Часто меняющиеся показатели без пересборки панели.
  _live(s) {
    switch (s.panel) {
      case 'board': {
        const it = s.boardCur();
        if (!it) return '';
        if (it.grater) return `Тёрка: ${it.grater.done} из ${it.grater.cycles} полных движений`;
        const q = s.boardQuality(it);
        return `Кусочков: ${it.pieces?.length ?? it.log.segments.length} · аккуратно ≈ ${Math.round(q.score * 100)} %`;
      }
      case 'bowl': {
        const mt = s.mixTarget();
        return mt?.ok ? `Перемешано: ${Math.min(4, s.mixTurns()).toFixed(1)} из ${CAMPAIGN.mix.turnsRequired} оборотов` : '';
      }
      case 'tray': {
        const id = s.tray.owner;
        const w = id && s.dishes[id]?.work;
        if (!w) return '';
        const lay = s.trayLayoutId(id);
        if (lay === 'sandwiches') return 'Масло: ' + w.breads.map((b) => Math.round(b.mask.coverage() * 100) + '%').join(' · ') + ` · икра: ${w.breads.map((b) => b.doses).join(' ')}`;
        if (lay === 'shuba' && w.current) return `Слой «${w.current.comp === 'mayo' ? 'майонез' : PRODUCTS[w.current.product].name.toLowerCase()}»: ${w.current.placed ? Math.round(w.current.mask.coverage() * 100) + ' % покрыто' : 'кликни по блюду'}`;
        if (lay === 'chicken') return 'Маринад: ' + w.mask.zoneCoverage().map((v) => Math.round(v * 100) + '%').join(' · ');
        if (lay === 'fruit') return `На тарелке: ${w.placed.length} (нужно 12–18)`;
        if (s.workPlate.owner === id) return `Начинка на тарелке: ${Math.round(s.workPlate.amount * 100) / 100} · в ложке: ${s.spoon.load ? 'да' : 'нет'}`;
        return '';
      }
      case 'sink':
        return s.sinkJob ? `Чистота: ${Math.round(s.sinkJob.mask.coverage() * 100)} %` : '';
      case 'puddle': {
        const p = s._activePuddle();
        return p ? `Вытерто: ${Math.round(p.mask.coverage() * 100)} %` : '';
      }
      case 'radio':
        return s.radio.broken ? `Ремонт: ${Math.round((s.radio.progress / CAMPAIGN.durations.radioHold) * 100)} %` : '';
      case 'garland':
        return s.garland.broken ? `Контакт: ${Math.round((s.garland.progress / CAMPAIGN.durations.garlandHold) * 100)} %` : '';
      case 'stove':
        return s.stove.state === 'boiling' ? `Картофель будет готов через ${fmt(s.stove.readyAt - s.t)}` : '';
      case 'oven':
        return s.oven.state === 'baking' ? `Запекание: ${Math.round(s.oven.doneness * 100)} % · готово через ${fmt(s.oven.readyAt - s.t)}` : '';
      default:
        return '';
    }
  }

  _panelHtml(s) {
    const busy = !!s.action;
    const back = this._btn('← Назад', 'closePanel', [], 'ghost');
    const bar = '<div class="progress act-progress"><i></i></div>';
    const live = '<div class="note live" data-live></div>';
    switch (s.panel) {
      case 'board': {
        const tasks = s.boardTasks();
        const it = s.boardCur();
        const tabs = tasks
          .map((t) => {
            const cls = [t.key === s.board.current ? 'active' : '', t.state === 'done' ? 'done' : '', t.state === 'locked' ? 'soft-disabled' : ''].join(' ');
            const lbl = `${PICON[t.product] ?? ''} ${PRODUCTS[t.product].name}${t.stepId.endsWith('2') ? ' · 2' : ''}${t.type === 'grate' ? ' (тёрка)' : t.shape === 'round' ? ' (кружки)' : ''}${t.state === 'done' ? ' ✓' : ''}`;
            return this._btn(lbl, 'boardSelect', [t.key], cls, busy || t.state === 'done', t.block ?? '');
          })
          .join('');
        if (!it) return `<h2>🔪 Доска</h2><div class="row tabs">${tabs || '<span class="small">Сегодня на доске больше нечего делать.</span>'}</div><div class="row">${back}</div><p class="note">Выбери продукт. Продукт резервируется со склада при начале работы.</p>`;
        const block = s.transferBlock();
        const step = s.stepDef(it.dishId, it.stepId);
        const destLabel = s.practice ? 'Оценить' : step.dest === 'bowl' ? '🥣 В миску' : step.dest === 'pieces' ? '🍽 На поднос' : '✓ Готово';
        return `<h2>${it.grater ? '🧀 Тёрка' : '🔪 Доска'} · ${PICON[it.product] ?? ''} ${PRODUCTS[it.product].name}<span class="sub">${esc(s.recipes[it.dishId].name)}</span></h2>
          <div class="row tabs">${tabs}</div>
          <div class="row">
            ${it.grater ? '' : this._btn('⟳ Повернуть <kbd>R</kbd>', 'rotate', [], '', busy || !!it.log)}
            ${it.missing.length ? this._btn('🌭 Взять замену', 'takeReplacement', [], 'danger', busy) : ''}
            ${it.grater && !s.practice ? '' : this._btn(destLabel, 'boardTransfer', [], 'primary ' + (block ? 'soft-disabled' : ''), busy, block ?? '')}
            ${s.practice ? this._btn('↺ Заново', 'resetPracticeItem', [], 'ghost') : ''}
            ${back}
          </div>${it.missing.length ? bar : ''}${live}
          <p class="note">${it.grater ? 'Зажми кнопку и води мышью вверх-вниз по тёрке.' : it.log ? 'Клик по продукту — отрезать кружок. Толщина — на глаз по образцу.' : 'Клик по продукту — удар ножом. Режь полоски, R — поворот, потом кубики.'}${block && !it.grater ? ' · ' + esc(block) : ''}</p>`;
      }
      case 'bowl': {
        const tasks = s.bowlTasks();
        const btns = tasks
          .filter((t) => t.type === 'add')
          .map((t) => this._btn(`${PICON[t.product] ?? ''} ${t.state === 'done' ? PRODUCTS[t.product].name + ' ✓' : esc(t.label)}`, 'bowlAdd', [t.dishId, t.stepId], t.state === 'done' ? 'ghost' : t.block ? 'soft-disabled' : 'primary', busy || t.state === 'done', t.block ?? ''))
          .join('');
        const mt = s.mixTarget();
        const dirty = !s.equipment.bowl.clean ? '<p class="note warn">Миска грязная — помой её у раковины.</p>' : '';
        return `<h2>🥣 Миска${s.bowl.owner ? `<span class="sub">${esc(s.recipes[s.bowl.owner].name)}</span>` : ''}</h2>
          <div class="row">${btns}${back}</div><div class="row">${bar}</div>${live}${dirty}
          <p class="note">${mt ? (mt.ok ? 'Зажми кнопку и веди мышь по кругу внутри миски — 4 оборота.' : 'Перемешивание после полного состава: ' + esc(mt.block ?? '')) : s.bowl.contents.length ? 'Добавь всё по рецепту.' : 'Сюда идут нарезанные продукты с доски и заправка.'}</p>`;
      }
      case 'tray':
        return this._trayPanel(s, back, bar, live, busy);
      case 'stove': {
        const task = s.stoveTask();
        const rows = [];
        if (s.stove.overflow) rows.push(this._btn('🔥 Убавить огонь', 'reduceHeat', [], 'danger big', busy));
        if (s.stove.state === 'empty' && task) rows.push(this._btn(`${PICON[task.product]} Поставить вариться`, 'placePot', [], 'primary big', busy));
        if (s.stove.state === 'ready') rows.push(this._btn('🥔 Достать картофель', 'takePot', [], 'primary big', busy));
        if (s.stove.state === 'boiling') rows.push(this._btn('🥔 Достать картофель', 'takePot', [], 'soft-disabled', busy));
        rows.push(back);
        return `<h2>♨️ Плита</h2><div class="row">${rows.join('')}</div><div class="row">${bar}</div>${live}<p class="note">${s.stove.state === 'empty' ? (task ? `Картофель будет готов через ${CAMPAIGN.potatoReadyAfter / 60}:00 после установки кастрюли.` : 'Сегодня плита не нужна.') : s.stove.state === 'taken' ? 'Кастрюля пуста.' : 'Следи, чтобы вода не убежала.'}</p>`;
      }
      case 'oven': {
        const ch = s.dishes.chicken;
        const rows = [];
        if (s.oven.state === 'empty' && ch && !ch.done) rows.push(this._btn('🍗 Поставить форму в духовку', 'ovenLoad', [], ch.steps.marinade.done ? 'primary big' : 'soft-disabled', busy));
        if (s.oven.state !== 'empty') rows.push(this._btn(s.oven.state === 'baking' ? 'Достать (ещё рано)' : '🧤 Достать курицу', 'ovenTake', [], s.oven.state === 'baking' ? 'ghost' : 'danger big', busy));
        rows.push(back);
        const stage = { empty: 'Духовка пустая', baking: 'Запекается…', ready: 'Готово — достань!', over: 'Перегревается!', burnt: 'Сгорела' }[s.oven.state];
        return `<h2>🔥 Духовка<span class="sub">${stage}</span></h2><div class="row">${rows.join('')}</div><div class="row">${bar}</div>${live}<p class="note">${ch ? 'Готовность через 2:30; после сигнала есть окно, чтобы достать.' : 'Сегодня духовка не нужна.'}</p>`;
      }
      case 'sink': {
        const dirty = s.dirtyItems();
        const btns = dirty.map((d) => this._btn(`🧽 ${esc(d.label)}`, 'sinkSelect', [d.id], s.sinkJob?.item === d.id ? 'primary active' : 'ghost', busy)).join('');
        return `<h2>🚰 Раковина</h2><div class="row">${btns || '<span class="small">Вся посуда чистая.</span>'}${back}</div>${live}<p class="note">${s.sinkJob ? 'Зажми кнопку и три губкой по посуде.' : dirty.length ? 'Выбери, что мыть.' : 'Мыть нечего.'}</p>`;
      }
      case 'puddle':
        return `<h2>🧽 Лужа</h2><div class="row">${back}</div>${live}<p class="note">Зажми кнопку и води тряпкой по луже.</p>`;
      case 'radio':
        return `<h2>📻 Радио</h2><div class="row">${s.radio.broken ? `<button class="primary big hold-btn" data-hold="radio" data-act="hold">🎛 Настроить (удерживай)</button>` : this._btn(s.radio.enabled ? '⏻ Выключить' : '⏻ Включить', 'toggleRadio', [], 'ghost', busy)}${back}</div>${live}<p class="note">${s.radio.broken ? 'Удерживай 2 секунды. Прогресс сохраняется, если отойти.' : 'Выключение радио — просто настройка, без штрафа.'}</p>`;
      case 'garland':
        return `<h2>💡 Гирлянда</h2><div class="row">${s.garland.broken ? `<button class="primary big hold-btn" data-hold="garland" data-act="hold">🔌 Поправить контакт (удерживай)</button>` : ''}${back}</div>${live}<p class="note">${s.garland.broken ? 'Удерживай 2 секунды.' : 'Гирлянда горит.'}</p>`;
      case 'fridge': {
        const rows = Object.entries(s.inventory.stock)
          .filter(([, q]) => q > 0 || s.practice)
          .map(([id, q]) => `<span class="chip">${PICON[id] ?? ''} ${esc(PRODUCTS[id].name)}: ${q}${s.inventory.reservedOf(id) ? ` (в работе ${s.inventory.reservedOf(id)})` : ''} · ${PRODUCTS[id].storage === 'fridge' ? '🧊' : '🗄'}</span>`)
          .join(' ');
        return `<h2>🧊 Запасы</h2><div class="stock">${rows || 'Пусто'}</div><div class="row">${back}</div><p class="note">🧊 — холодильник, 🗄 — кладовая. Не хватает — закажи в телефоне.</p>`;
      }
      case 'bag': {
        const bag = s.delivery.bag;
        if (!bag) return `<h2>🛍 Пакет</h2><div class="row">${back}</div><p class="note">Пакета нет.</p>`;
        const rows = bag.items
          .map((it, i) => `<div class="bag-row ${it.placed ? 'done' : ''}">${PICON[it.id] ?? ''} ${esc(PRODUCTS[it.id].name)} × ${it.qty} ${it.placed ? '✓' : this._btn('🧊 В холодильник', 'unpack', [i, 'fridge'], 'ghost', busy) + this._btn('🗄 В кладовую', 'unpack', [i, 'pantry'], 'ghost', busy)}</div>`)
          .join('');
        return `<h2>🛍 Разобрать пакет</h2>${rows}<div class="row">${bar}${back}</div><p class="note">Продукты появятся в запасах только после раскладки по местам.</p>`;
      }
      case 'table': {
        if (!s.day.finalServe) return `<h2>🎄 Праздничный стол</h2><div class="row">${back}</div><p class="note">Готовые блюда появляются здесь сами. Финальная сервировка — в седьмой день.</p>`;
        const cards = DISH_ORDER.map((id) => {
          const avail = s.table.available.has(id);
          const placed = s.table.placed[id] != null;
          return `<div class="dish-card ${placed ? 'placed' : ''} ${avail ? '' : 'na'}" ${avail ? `data-dish="${id}"` : ''}>${ICON[id]} ${esc(RECIPES[id].short)}${placed ? ' ✓' : avail ? '' : ' ⏳'}</div>`;
        }).join('');
        return `<h2>🎄 Сервировка<span class="sub">${Object.keys(s.table.placed).length} из 10</span></h2><div class="dish-cards">${cards}</div><div class="row">${back}</div><p class="note">Перетащи карточку блюда на свободное место стола. Курица появится, когда будет готова.</p>`;
      }
      default:
        return `<h2>${STATION_ICON[s.panel] ?? ''} ${esc(CLAYOUT.stations[s.panel]?.label ?? '')}</h2><div class="row">${back}</div>`;
    }
  }

  _trayPanel(s, back, bar, live, busy) {
    const id = s.tray.owner;
    const list = s.trayDishes();
    const tabs = list.map((x) => this._btn(`${ICON[x]} ${esc(s.recipes[x].short)}`, 'traySelect', [x], x === id ? 'active' : s.trayBlock(x) ? 'soft-disabled' : '', busy, s.trayBlock(x) ?? '')).join('');
    if (!id) {
      const dirty = !s.equipment.tray.clean ? '<p class="note warn">Поднос грязный — помой его у раковины.</p>' : '';
      return `<h2>🍽 Поднос</h2><div class="row tabs">${tabs || '<span class="small">Сегодня здесь собирать нечего.</span>'}</div><div class="row">${back}</div>${dirty}<p class="note">Выбери блюдо для сборки.</p>`;
    }
    const lay = s.trayLayoutId(id);
    const tools = { sandwiches: ['spatula', 'spoon'], eggs: ['knife', 'spoon'], tartlets: ['spoon', 'hand'], tomatoes: ['knife', 'spoon', 'hand'], shuba: ['spatula'], canape: ['hand'], fruit: ['hand'], chicken: ['brush'] }[lay] ?? [];
    const toolBtns = tools.map((t) => this._btn(TOOL[t], 'setTool', [t], s.tool === t ? 'active' : '', busy)).join('');
    let extra = '';
    if (lay === 'shuba') {
      const w = s.dishes[id].work;
      const exp = s.shubaExpected(id);
      const order = exp.map((c, i) => `<span class="chip ${w.layers[i] ? (w.layers[i].comp === c ? 'ok' : 'bad') : ''}">${i + 1}. ${c === 'mayo' ? 'майонез' : esc(PRODUCTS[c].name.toLowerCase())}</span>`).join(' ');
      const comps = s.shubaComponents(id).map((c) => this._btn(`${PICON[c.product] ?? ''} ${c.comp === 'mayo' ? 'Майонез' : esc(PRODUCTS[c.product].name)}`, 'shubaChoose', [c.comp], w.current?.comp === c.comp ? 'active' : c.available ? '' : 'soft-disabled', busy || !c.available)).join('');
      extra = `<div class="row small">Порядок: ${order}</div><div class="row tabs">${comps}</div><div class="row">${this._btn('✓ Подтвердить слой', 'shubaConfirmLayer', [], 'primary', busy || !w.current?.placed)}${this._btn('↶ Отменить последний', 'shubaUndo', [], 'ghost', busy || (!w.current && !w.layers.length))}</div>`;
    }
    if (lay === 'chicken') {
      const ch = s.dishes.chicken;
      extra = ch.steps.marinade.done ? `<div class="row">${this._btn('🔥 Отнести в духовку', 'goTo', ['oven'], 'primary', busy)}</div>` : '';
    }
    const conf = s.canConfirm(id);
    const confirm = lay === 'chicken' ? '' : s.practice ? this._btn('↺ Заново', 'resetPracticeTray', [], 'ghost') : this._btn('🎄 Готово — на стол', 'confirmDish', [id], conf.ok ? 'primary' : 'soft-disabled', busy, conf.reason ?? '');
    const steps = s.dishes[id].recipe.steps.filter((st) => !['cut', 'grate', 'add', 'mix', 'boil', 'bake'].includes(st.type)).map((st) => `<span class="chip ${s.stepDone(id, st.id) ? 'ok' : ''}">${s.stepDone(id, st.id) ? '✓' : '•'} ${esc(st.label)}</span>`).join(' ');
    return `<h2>🍽 Поднос · ${ICON[id]} ${esc(s.recipes[id].name)}</h2>
      <div class="row tabs">${tabs}</div>
      <div class="row">${toolBtns}${confirm}${back}</div>${extra}
      <div class="row small">${steps}</div><div class="row">${bar}</div>${live}`;
  }

  // ---------- рецепт ----------
  _bindRecipe() {
    this.el.recipe.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (b) {
        const args = b.dataset.args ? JSON.parse(b.dataset.args) : [];
        this.act(b.dataset.act, ...args);
        this.recipeSig = null;
      }
      if (e.target.closest('[data-close]')) this.toggleRecipe(false);
    });
  }

  toggleRecipe(force) {
    this.recipeOpen = force ?? !this.recipeOpen;
    this.el.recipe.classList.toggle('hidden', !this.recipeOpen);
    this.recipeSig = null;
  }

  _renderRecipe(s) {
    const sig = Object.values(s.dishes).map((d) => d.id + d.done + d.variant.onion + d.recipe.steps.map((st) => s.stepState(d.id, st.id)).join('')).join('|') + s.requestKnown + JSON.stringify(s.inventory.stock);
    if (sig === this.recipeSig) return;
    this.recipeSig = sig;
    const html = Object.values(s.dishes)
      .map((d) => {
        const steps = d.recipe.steps
          .map((st) => {
            const state = s.stepState(d.id, st.id);
            const mark = { done: '✅', skipped: '➖', ready: '▫️', locked: '🔒' }[state];
            const block = state === 'ready' ? s.stepBlock(d.id, st.id) : null;
            return `<li class="${state}">${mark} ${esc(st.label)}${block ? `<div class="small warn">${esc(block)}</div>` : ''}</li>`;
          })
          .join('');
        let variant = '';
        if (d.recipe.onionOption && !d.done) {
          const req = s.requestKnown && s.request?.recipe === d.id ? `<div class="request">📩 Гости просят: <b>без лука</b></div>` : '';
          variant = `${req}<div class="row">${this._btn('С луком', 'setVariant', [d.id, true], d.variant.onion ? 'active' : 'ghost')}${this._btn('Без лука', 'setVariant', [d.id, false], !d.variant.onion ? 'active' : 'ghost')}${this._btn('↺ Переделать начинку', 'redoFilling', [d.id], 'ghost')}</div>`;
        }
        return `<div class="recipe-dish ${d.done ? 'done' : ''}"><h3>${ICON[d.id]} ${esc(d.recipe.name)} ${d.done ? `<span class="score-pill">${d.Q}</span>` : ''}</h3><div class="small">${esc(d.recipe.look)}</div>${variant}<ul class="steps">${steps}</ul></div>`;
      })
      .join('');
    const extra = s.day.finalServe ? `<div class="recipe-dish"><h3>🎄 Сервировка стола</h3><div class="small">Все 10 блюд — на праздничный стол (${Object.keys(s.table.placed).length}/10).</div></div>` : '';
    this.el.recipe.innerHTML = `<div class="recipe-head"><b>📋 Рецепты дня</b><button class="ghost" data-close>×</button></div>${html}${extra}<p class="small">Варка и очистка продуктов, кроме картофеля и курицы, уже сделаны заранее.</p>`;
  }

  // ---------- телефон ----------
  _bindPhone() {
    this.el.phone.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-tab]');
      if (tab) {
        this.phoneTab = tab.dataset.tab;
        this.phoneSig = null;
        return;
      }
      const b = e.target.closest('button[data-act]');
      if (b) {
        this.sound.unlock();
        const args = b.dataset.args ? JSON.parse(b.dataset.args) : [];
        this.act(b.dataset.act, ...args);
        this.phoneSig = null;
      }
    });
  }

  openPhone() {
    this.el.phone.classList.remove('hidden');
    this.phoneSig = null;
    this.act('markRead');
  }

  _renderPhoneLive(s) {
    if (s.panel !== 'phone') {
      this.el.phone.classList.add('hidden');
      return;
    }
    if (s.phone.unread) this.act('markRead');
    const o = s.delivery.order;
    const sig = this.phoneTab + s.phone.messages.length + JSON.stringify(s.delivery.draft) + (o ? o.status : '-') + !!s.delivery.bag + s.alerts.filter((a) => a.urgent).map((a) => a.key).join();
    if (sig === this.phoneSig) return;
    this.phoneSig = sig;
    const pushes = s.alerts.filter((a) => a.urgent).map((a) => `<div class="push">⚠️ ${esc(a.text)}</div>`).join('');
    let body = '';
    if (this.phoneTab === 'messages') {
      body = s.phone.messages.length
        ? s.phone.messages
            .slice()
            .reverse()
            .map((m) => `<div class="msg-card ${m.from === 'Доставка' ? 'svc' : ''}"><div class="from">${m.from === 'Верка' ? '🌴' : m.from === 'Гости' ? '🎉' : '🛵'} ${esc(m.from)} <span class="small">${fmt(m.t)}</span></div><div>${esc(m.text)}</div>${m.photo ? '<div class="photo-card"><div class="sun"></div><div class="sea"></div><div class="palm">🌴</div><div class="cap">Вид с балкона (иллюстрация)</div></div>' : ''}</div>`)
            .join('')
        : '<div class="empty">Сообщений пока нет.</div>';
    } else if (this.phoneTab === 'shopping') {
      const list = s.shopping();
      body = list.length
        ? `<table class="shop">${list.map((x) => `<tr class="${x.lack ? 'lack' : ''}"><td>${PICON[x.id] ?? ''} ${esc(x.name)}</td><td>нужно ${x.need}</td><td>есть ${x.have}</td><td>${x.lack ? `<b>не хватает ${x.lack}</b>` : '✓'}</td></tr>`).join('')}</table><p class="small">Список считает только незавершённые шаги. Ничего не заказывается само.</p>`
        : '<div class="empty">Всё необходимое есть.</div>';
    } else {
      if (o || s.delivery.bag) {
        const st = o ? { accepted: 'Принят', assembling: 'Собирают', onTheWay: 'В пути', arrived: 'Прибыл', collecting: 'Забираем' }[o.status] : 'Получен — разбери пакет';
        const steps = ['accepted', 'assembling', 'onTheWay', 'arrived'];
        const idx = o ? steps.indexOf(o.status === 'collecting' ? 'arrived' : o.status) : 4;
        const items = Object.entries(o?.items ?? Object.fromEntries((s.delivery.bag?.items ?? []).map((i) => [i.id, i.qty])))
          .map(([id, q]) => `<li>${PICON[id] ?? ''} ${esc(PRODUCTS[id].name)} × ${q}</li>`)
          .join('');
        body = `<div class="order-status"><b>Заказ: ${st}</b><div class="steps-line">${steps.map((x, i) => `<span class="${i <= idx ? 'on' : ''}"></span>`).join('')}</div><ul>${items}</ul>
          ${o && o.status === 'arrived' ? this._btn('🚪 Забрать заказ', 'collectOrder', [], 'primary') : ''}
          ${o && ['accepted', 'assembling', 'onTheWay'].includes(o.status) ? this._btn('⏩ Подождать (ускорить)', 'waitDelivery', [], 'ghost') : ''}</div>
          <p class="small">Позиции подтверждённого заказа не меняются. Один заказ за раз.</p>`;
      } else {
        const lack = Object.fromEntries(s.shopping().filter((x) => x.lack).map((x) => [x.id, x.lack]));
        const cat = s.catalog();
        const rows = cat
          .map((c) => {
            const q = s.delivery.draft[c.id] ?? 0;
            return `<tr class="${lack[c.id] ? 'lack' : ''}"><td>${PICON[c.id] ?? ''} ${esc(c.name)}${lack[c.id] ? ' <b>!</b>' : ''}</td><td class="qty">${this._btn('−', 'draftSet', [c.id, q - 1], 'ghost mini', q <= 0)}<span>${q}</span>${this._btn('+', 'draftSet', [c.id, q + 1], 'ghost mini', q >= 6)}</td></tr>`;
          })
          .join('');
        const total = Object.values(s.delivery.draft).reduce((a, b) => a + b, 0);
        body = `<table class="shop">${rows}</table><div class="row">${this._btn(`Подтвердить заказ (${total})`, 'confirmOrder', [], total ? 'primary' : 'soft-disabled')}</div><p class="small">Без оплаты и реальных сервисов. «!» — не хватает для рецептов.</p>`;
      }
    }
    this.el.phone.innerHTML = `<div class="phone"><div class="status"><span>${fmt(s.t)}</span><span>📶 🔋</span></div>${pushes}
      <div class="ptabs"><button data-tab="messages" class="${this.phoneTab === 'messages' ? 'on' : ''}">Сообщения</button><button data-tab="shopping" class="${this.phoneTab === 'shopping' ? 'on' : ''}">Покупки</button><button data-tab="order" class="${this.phoneTab === 'order' ? 'on' : ''}">Заказ</button></div>
      <div class="feed">${body}</div><div class="bottom">${this._btn('Закрыть телефон', 'closePanel', [], 'primary')}</div></div>`;
  }

  // ---------- режим разработчика ----------
  showDev(h) {
    const d = this.el.dev;
    d.classList.remove('hidden');
    d.innerHTML = `<b>DEV</b><div id="dev-stats" class="small" style="color:#fff"></div>
      <button data-d="skipDay">Завершить день (авто)</button>
      <button data-d="cat">Кот к колбасе</button>
      <button data-d="pot">Выкипание</button>
      <button data-d="ff">+30 с</button>
      <button data-d="unlock">Открыть все дни</button>`;
    d.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => h[b.dataset.d]?.()));
  }
}
