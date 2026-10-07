// Интерфейс кампании (DOM). Читает состояние и отправляет команды через act().
import { DAYS, RECIPES, PRODUCTS, CAMPAIGN, DISH_ORDER } from '../campaign/data.js';
import { CLAYOUT, TABLE_SLOTS } from '../campaign/layout.js';
import { campaignScore } from '../campaign/save.js';
import { PRACTICE } from '../campaign/session.js';
import { MEDALS, MODIFIERS, guestLine } from '../campaign/extras.js';
import { LOGO_URL } from '../view/textures.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const stars = (n) => [0, 1, 2].map((i) => `<span class="star ${i < n ? 'on' : ''}">★</span>`).join('');
const ICON = { olivier: '🥗', crab: '🦀', sandwiches: '🥪', eggs: '🥚', tartlets: '🧁', tomatoes: '🍅', shuba: '🐟', canape: '🍢', fruit: '🍊', chicken: '🍗', practice: '🔪' };
const PICON = { potato: '🥔', carrot: '🥕', sausage: '🌭', cucumber: '🥒', egg: '🥚', peas: '🫛', mayo: '🫙', crab: '🦀', corn: '🌽', bread: '🍞', butter: '🧈', caviar: '🔴', tartlet: '🧁', cheese: '🧀', greens: '🌿', tomato: '🍅', onion: '🧅', herring: '🐟', beet: '🟣', skewer: '🍡', mandarin: '🍊', apple: '🍏', grapes: '🍇', chicken: '🍗', marinade: '🥣' };
const STATION_ICON = { catbowl: '🐾', board: '🔪', tray: '🍽', bowl: '🥣', phone: '📱', stove: '♨️', oven: '🔥', sink: '🚰', radio: '📻', garland: '💡', fridge: '🧊', bag: '🛍', table: '🎄', puddle: '🧽' };
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
  stove: 'Плита: две конфорки. Ставь вариться всё сразу и режи остальное, пока варится. У картофеля 2:00, у яиц 1:00, у свёклы 2:30.',
  hot: 'Сваренное горячее: резать сразу нельзя. Подожди полминуты или остуди под холодной водой у раковины — это быстрее.',
  season: 'Вкус: соль и перец — щепотками. Норму не видно: попробуй ложкой («Попробовать»), героиня скажет честно. Пересолила — «Разбавить» (долго). Потом «Вкус готов» и перемешивай.',
  catHungry: 'Кот проголодался. Голодный кот сам полезет к колбасе, селёдке или сыру на доске. Покорми его у миски кота — сытый кот спит. Мячик отвлекает, но голод не утоляет.',
  catbowl: 'Миска кота: «Покормить» обнуляет голод. «Мячик» занимает кота на 45 секунд.',
  money: 'У дня есть бюджет. Экспресс быстрее, но дороже. «Сходить самой» бесплатно, но героиня уходит на 35 секунд — плита и кот без присмотра.',
  boardDirty: 'После сельди или свёклы доска грязная: тот же продукт резать можно, другой — только после мытья у раковины. Режь пахучее последним!',
  wish: 'Гости прислали пожелание. Оно видно в рецепте (Q) и влияет на оценку блюда.',
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
        <div class="actions compact">
          <button class="ghost" data-ui="practice">🔪 Свободная практика</button>
          <button class="ghost" data-ui="challenges">🏆 Испытания</button>
          <button class="ghost" data-ui="stream">📺 Режим стрима${save.data.settings.stream?.on ? ' · вкл' : ''}</button>
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
      const best = st.best ? `<div class="score-pill">лучший ${st.best.D}${st.last && st.last !== st.best ? ` · последний ${st.last.D}` : ''}</div><div class="stars">${stars(st.stars ?? 0)}</div><div class="medals">${(st.medals ?? []).map((m) => `<span title="${esc(MEDALS[m]?.name ?? m)}">${MEDALS[m]?.icon ?? ''}</span>`).join('')}</div>${st.bestTime ? `<div class="small">лучшее время ${fmt(st.bestTime)}</div>` : ''}` : '';
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

  showDayIntro(day, save, resumed = false, mods = []) {
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
        <p class="small">Ориентир: около ${day.targetMinutes} минут — уложишься, получишь медаль «В ритме». Время не ограничено. Бюджет на покупки: <b>${day.budget ?? 0} ₽</b>.</p>
        ${mods?.length ? `<div class="skills">Испытание: ${mods.map((m) => `<span class="chip warn">${esc(MODIFIERS[m].label)} — ${esc(MODIFIERS[m].desc)}</span>`).join(' ')}</div>` : ''}
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
      .filter(([, p]) => !p.hidden)
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
    const best = r.challenge ? null : save.data.days[day.id - 1].best;
    const wish = (r.wishes ?? []).map((w) => `<div>${w.met ? '✅' : '⚠️'} ${ICON[w.recipe]} «${esc(w.label)}» — ${w.met ? 'выполнено' : 'не выполнено'}</div>`).join('');
    const medals = (r.medals ?? []).map((m) => `<span class="medal" title="${esc(MEDALS[m].hint)}">${MEDALS[m].icon} ${esc(MEDALS[m].name)}</span>`).join('');
    const guests = day.dishes.map((id, k) => `<div class="guest-line">💬 <b>${['Оля', 'Дима', 'Катя', 'Серёжа'][k % 4]}:</b> ${esc(guestLine(id, r.dishes[id], r.D))}</div>`).join('');
    this._overlay(
      `<div class="card dialog result">
        <div class="head"><div class="emoji">${r.D >= 85 ? '🏆' : r.D >= 60 ? '🎄' : '😅'}</div><h2>День ${day.id} завершён</h2><div class="small">${esc(day.title)}</div></div>
        <div style="text-align:center"><span class="score">${r.D}</span><span class="small"> / 100 за день${best && best.D > r.D ? ` · лучший ${best.D}` : ''}</span><div class="stars big">${stars(r.stars ?? 0)}</div></div>
        ${medals ? `<div class="medals-row">${medals}</div>` : ''}
        ${rows}
        ${wish ? `<div class="wishes">${wish}</div>` : ''}
        ${guests}
        <div class="order-row"><b>Порядок на кухне: ${r.order}</b>${r.orderNotes.length ? ' — ' + r.orderNotes.map(esc).join('; ') : ' — чисто и празднично'}</div>
        <p class="small">Время на кухне: ${fmt(r.time)} при ориентире ${fmt(r.par ?? 0)} — темп ${r.pace ?? '—'} (ходьба ${fmt(r.stats.walk)}, крупный план ${fmt(r.stats.closeup)}, телефон ${fmt(r.stats.phone)}). Покупки: ${r.spent ?? 0} из ${r.budget ?? 0} ₽.</p>
        <div class="actions" style="justify-content:center">
          ${r.challenge ? '<button class="primary big" data-ui="challenges">🏆 К испытаниям</button>' : isLast ? '<button class="primary big" data-ui="final">🎄 Финальный стол</button>' : '<button class="primary big" data-ui="nextDay">Следующий день →</button>'}
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
        <div class="small">Звёзд: ${save.data.days.reduce((a, d) => a + (d.stars ?? 0), 0)} из 21 · медалей: ${new Set(save.data.days.flatMap((d) => d.medals ?? [])).size} из ${Object.keys(MEDALS).length}</div>
        <div class="actions"><button class="ghost" data-ui="journal">Журнал — переиграть дни</button><button class="ghost" data-ui="menu">В меню</button></div>
      </div>`,
      'side',
    );
    this._finalBubbles(save);
  }

  // Гости за столом комментируют блюда по лучшим оценкам дней.
  _finalBubbles(save) {
    const q = {};
    save.data.days.forEach((d, i) => {
      for (const id of DAYS[i].dishes) q[id] = d.best?.dishes?.[id] ?? 75;
    });
    this.finalGuests = DISH_ORDER.map((id, k) => ({ id, who: ['Дима', 'Оля', 'Серёжа', 'Катя', 'Миша'][k % 5], text: guestLine(id, q[id], k), at: 1.5 + k * 2.2 }));
    this.finalT = 0;
    let box = $('#final-bubbles');
    if (!box) {
      box = document.createElement('div');
      box.id = 'final-bubbles';
      document.body.appendChild(box);
    }
    box.innerHTML = '';
    box.classList.remove('hidden');
  }

  updateFinal(dt, slotOf) {
    const box = $('#final-bubbles');
    if (!box || !this.finalGuests) return;
    this.finalT += dt;
    const cycle = this.finalGuests.at(-1).at + 4;
    const t = this.finalT % cycle;
    for (const g of this.finalGuests) {
      let el = box.querySelector(`[data-g="${g.id}"]`);
      const on = t >= g.at && t < g.at + 4.2;
      if (!on) {
        el?.remove();
        continue;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = 'bubble';
        el.dataset.g = g.id;
        el.innerHTML = `<b>${esc(g.who)}:</b> ${esc(g.text)}`;
        box.appendChild(el);
      }
      const p = slotOf(g.id);
      if (!p) continue;
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
    }
  }

  hideFinal() {
    $('#final-bubbles')?.classList.add('hidden');
    this.finalGuests = null;
  }

  showChallenges(save, today) {
    const ch = save.data.challenges?.[today.key];
    const sp = save.data.speed?.best;
    const done = save.data.days.some((d) => d.completed);
    this._overlay(
      `<div class="card dialog">
        <h2>🏆 Испытания</h2>
        <div class="challenge">
          <b>Испытание дня · ${esc(today.label)}</b>
          <div class="small">День ${today.dayIndex + 1} «${esc(DAYS[today.dayIndex].title)}» с условиями: ${today.mods.map((m) => `<span class="chip warn">${esc(MODIFIERS[m].label)}</span>`).join(' ')}</div>
          <div class="small">Одинаково для всех игроков сегодня. ${ch ? `Твой лучший: <b>${ch.D}</b> ${stars(ch.stars)}` : 'Ещё не пройдено.'}</div>
          <div class="actions">${done ? '<button class="primary" data-ui="challengeGo">Начать испытание</button>' : '<span class="small warn">Открывается после первого пройденного дня.</span>'}</div>
        </div>
        <div class="challenge">
          <b>⏱ Скоростная нарезка</b>
          <div class="small">Три продукта кубиками на время. Засчитывается, если аккуратность каждого не ниже 75 %. ${sp ? `Рекорд: <b>${fmt(sp)}</b>` : 'Рекорда пока нет.'}</div>
          <div class="actions"><button class="primary" data-ui="speedGo">На старт</button></div>
        </div>
        <div class="actions"><button class="ghost big" data-ui="menu">← В меню</button></div>
      </div>`,
      'dim',
    );
  }

  showStream(save) {
    const st = save.data.settings.stream ?? {};
    this._overlay(
      `<div class="card dialog">
        <h2>📺 Режим стрима</h2>
        <p class="small">Зрители голосуют в чате Twitch командами <b>!кот</b>, <b>!гость</b>, <b>!радио</b>, <b>!гирлянда</b>. Каждые 45 секунд побеждает самая популярная команда, и событие случается на кухне — в пределах обычных правил (не больше двух срочных дел сразу). Подключение только на чтение, анонимно; без канала игра работает офлайн.</p>
        <label class="field">Канал Twitch: <input id="stream-channel" value="${esc(st.channel ?? '')}" placeholder="имя_канала" /></label>
        <label class="field"><input type="checkbox" id="stream-test" ${st.test ? 'checked' : ''}/> Тестовый чат (без сети: кнопки голосования на экране)</label>
        <div class="actions">
          <button class="primary" data-ui="streamOn">Включить</button>
          <button class="ghost" data-ui="streamOff">Выключить</button>
          <button class="ghost big" data-ui="menu">← В меню</button>
        </div>
        <p class="small">Сейчас: ${st.on ? `<b>включён</b>${st.channel ? ' · канал ' + esc(st.channel) : ''}${st.test ? ' · тестовый чат' : ''}` : 'выключен'}</p>
      </div>`,
      'dim',
    );
  }

  // Плашка голосования чата во время дня.
  renderVotes(v) {
    let el = $('#votes');
    if (!v) {
      el?.classList.add('hidden');
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'votes';
      this.voteSig = null;
      el.className = 'card';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-vote]');
        if (b) this.app.testVote(b.dataset.vote);
      });
    }
    el.classList.remove('hidden');
    const host = $('.hud-left');
    if (host && el.parentElement !== host) host.appendChild(el);
    const sig = Math.ceil(v.left) + v.status + v.options.map((o) => o.n).join();
    if (sig === this.voteSig) return;
    this.voteSig = sig;
    const rows = v.options.map((o) => `<div class="vote-row"><span>${esc(o.cmd)}</span><span class="vbar"><i style="width:${v.total ? (o.n / v.total) * 100 : 0}%"></i></span><b>${o.n}</b>${v.test ? `<button class="ghost mini" data-vote="${esc(o.cmd)}">+</button>` : ''}</div>`).join('');
    el.innerHTML = `<div class="small"><b>📺 Чат решает</b> · ${Math.ceil(v.left)} с ${v.status ? '· ' + esc(v.status) : ''}</div>${rows}`;
  }

  // ---------- кухня ----------
  showKitchen(session) {
    this.el.hud.classList.remove('hidden');
    this.el.hud.innerHTML = `
      <div class="hud-left"><div class="card hud-day">
        <div class="hud-day-title" id="hud-day"></div>
        <div class="hud-step" id="hud-step"></div>
        <div class="hud-actions">
          <button id="btn-recipe" title="Рецепт (Q)">📋 Рецепт</button>
          <button id="btn-help" title="Повторить подсказку">?</button>
          <button id="btn-finish" class="primary hidden">✅ Завершить день</button>
        </div>
      </div>
      <div class="card hud-meta" id="hud-meta"></div>
      <div class="tickets" id="tickets"></div></div>
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
    this.ticketSig = null;
  }

  // Всплывающая надпись по центру (как в аркадных кухнях): «Идеально!», «Пересолено» и т. п.
  popup(text, kind = '') {
    const d = document.createElement('div');
    d.className = `popup ${kind}`;
    d.innerHTML = text;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1500);
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
        if (['bowl', 'sink', 'puddle', 'catbowl'].includes(e.station)) this.tip(e.station);
        if (e.station === 'phone' && this.phoneTab === 'order') this.tip('money');
        if (e.station === 'phone') {
          this.openPhone();
        }
        break;
      case 'close':
        if (e.station === 'phone') this.el.phone.classList.add('hidden');
        break;
      case 'dishDone': {
        const d = s.dishes[e.dishId];
        this.popup(`${ICON[e.dishId]} ${e.Q >= 90 ? 'Шедевр!' : e.Q >= 75 ? 'Отлично!' : e.Q >= 55 ? 'Готово' : 'Ну… съедобно'}`, e.Q >= 75 ? 'good' : '');
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
        this.toast(`Кот утащил кусок (${esc(PRODUCTS[e.product ?? 'sausage'].name.toLowerCase())})! На доске — «Взять замену»`, 'bad', 3.5);
        this.popup('🐈 Утащил!', 'bad');
        break;
      case 'catHungry':
        this.tip('catHungry');
        break;
      case 'catFed':
        this.toast('Кот сыт и доволен 🐟', 'good');
        break;
      case 'catPlay':
        this.toast('Кот гоняет мячик 🧶', 'good');
        break;
      case 'catSleep':
        this.toast('Сытый кот спит и к еде не лезет 😴', 'good', 3);
        break;
      case 'potPlaced':
        this.tip('stove');
        break;
      case 'potatoTaken':
        this.tip('hot');
        break;
      case 'cooled':
        this.toast(`${PICON[e.product] ?? ''} Остыло — можно резать`, 'good');
        break;
      case 'dirty':
        if (e.item === 'board') this.tip('boardDirty');
        break;
      case 'pinch':
        this.popup(e.kind === 'salt' ? '🧂' : '🌶', 'small');
        break;
      case 'taste':
        this.popup(`${e.face === 'good' ? '😋' : e.face === 'bad' ? '😖' : '🤔'} ${esc(e.verdict)}`, e.face === 'good' ? 'good' : 'bad');
        break;
      case 'seasoned':
        if (e.q >= 0.999) this.popup('😋 Идеальный вкус!', 'good');
        break;
      case 'stepDone':
        if (e.q >= 0.95 && ['cut', 'grate'].includes(s.stepDef(e.dishId, e.stepId)?.type)) this.popup('🔪 Чётко!', 'good');
        break;
      case 'paid':
        this.toast(`💳 −${e.total} ₽`, '', 2);
        break;
      case 'noMoney':
        this.popup('💸 Не хватает денег', 'bad');
        break;
      case 'stream':
        this.toast(`📺 ${esc(e.text)}`, 'bad', 3.5);
        break;
      case 'phoneMsg':
        if (e.from === 'Гости' && s.requests?.some((r) => r.known && !r.tipped && (r.tipped = true))) this.tip('wish');
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
        const onFire = new Set(s.burners.filter((b) => b.state !== 'empty').map((b) => b.owner + ':' + b.step));
        const next = s.nextSteps(id).find((st) => !(st.type === 'boil' && onFire.has(id + ':' + st.id)));
        const dishes = Object.values(s.dishes).map((x) => `${ICON[x.id]}${x.done ? '✓' : ''}`).join(' ');
        step = `${dishes} · ${esc(s.recipes[id].name)}${next ? ': ' + esc(next.label.toLowerCase()) : ''}`;
      } else if (s.day.finalServe) step = '🎄 Расставь все 10 блюд на праздничном столе';
    }
    $('#hud-step').innerHTML = step;
    $('#hud-clock').textContent = fmt(s.t);
    const boiling = s.burners.filter((b) => b.state === 'boiling');
    $('#hud-sub').textContent = boiling.length ? boiling.map((b) => `${PICON[b.product]} ${fmt(b.readyAt - s.t)}`).join(' · ') : s.oven.state === 'baking' ? `🍗 духовка ${fmt(s.oven.readyAt - s.t)}` : s.delivery.order ? `🛵 ${({ accepted: 'заказ принят', assembling: 'собирают', onTheWay: 'курьер в пути', arrived: 'курьер приехал', collecting: 'забираем' })[s.delivery.order.status]}` : 'на кухне';
    $('#btn-finish').classList.toggle('hidden', s.phase !== 'ready' || !!s.practice);
    const badge = $('#phone-badge');
    badge.classList.toggle('hidden', !s.phone.unread);
    badge.textContent = s.phone.unread;
    $('#btn-mute').textContent = this.app.isMuted() ? '🔇' : '🔊';
    $('#btn-phone').classList.toggle('hidden', !!s.practice);
    this._renderTickets(s);
    const meta = $('#hud-meta');
    if (s.practice) meta.classList.add('hidden');
    else {
      meta.classList.remove('hidden');
      const h = Math.round(s.catNeeds.hunger);
      const catTxt = s.cat.state === 'eat' ? 'ест' : s.cat.state === 'play' ? 'играет' : s.catCalm() ? 'спит' : h >= CAMPAIGN.cat.theftAt ? 'ищет еду!' : h >= CAMPAIGN.cat.warnAt ? 'голоден' : 'бродит';
      const hot = s.hotList().map((x) => `${PICON[x.product]}🔥${Math.ceil(x.left)}с`).join(' ');
      meta.innerHTML = `<div class="meter" title="Голод кота"><span>🐱 ${catTxt}</span><i class="${h >= CAMPAIGN.cat.theftAt ? 'bad' : h >= CAMPAIGN.cat.warnAt ? 'warn' : ''}" style="width:${h}%"></i></div><div class="small">💰 ${s.wallet.budget - s.wallet.spent} ₽${hot ? ' · ' + hot : ''}</div>`;
    }
  }

  // Карточки заказов дня: блюдо, прогресс шагов, пожелания гостей.
  _renderTickets(s) {
    const el = $('#tickets');
    if (s.practice) {
      el.innerHTML = '';
      return;
    }
    const sig = Object.values(s.dishes).map((d) => d.id + d.done + d.recipe.steps.filter((st) => s.stepDone(d.id, st.id)).length).join() + s.requests.map((r) => r.known + r.recipe).join() + s.tray.owner + s.bowl.owner;
    if (sig === this.ticketSig) return;
    this.ticketSig = sig;
    el.innerHTML = Object.values(s.dishes)
      .map((d) => {
        const total = d.recipe.steps.filter((st) => s.stepState(d.id, st.id) !== 'skipped').length;
        const done = d.recipe.steps.filter((st) => s.stepState(d.id, st.id) === 'done').length;
        const wishes = s.requests.filter((r) => r.known && r.recipe === d.id).map((r) => `<span class="wish" title="${esc(s.wishLabel(r))}">🙏 ${esc(s.wishLabel(r))}</span>`).join('');
        return `<div class="ticket ${d.done ? 'done' : ''}"><div class="t-head">${ICON[d.id]} ${esc(d.recipe.short)}${d.done ? ` <b>${d.Q}</b>` : ''}</div><div class="t-bar"><i style="width:${(done / total) * 100}%"></i></div>${wishes}</div>`;
      })
      .join('');
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
        const se = s.bowl.owner && s.dishes[s.bowl.owner]?.season;
        return `${base}|${s.bowlTasks().map((t) => t.stepId + t.state + (t.block ?? '')).join(',')}|${mt?.ok}|${Math.floor(s.mixTurns() * 4)}|${s.equipment.bowl.clean}|${se ? se.salt + ':' + se.pepper + ':' + se.tastes + (se.last?.verdict ?? '') : ''}`;
      }
      case 'tray': {
        const id = s.tray.owner;
        const d = id ? s.dishes[id] : null;
        const extra = id === 'shuba' && d?.work ? `${d.work.layers.length}|${d.work.current?.comp}|${d.work.current?.placed}|${s.shubaComponents().map((c) => +c.available).join('')}` : '';
        return `${base}|${id}|${s.trayDishes().map((x) => x + s.trayBlock(x)).join(',')}|${d ? d.recipe.steps.map((st) => +s.stepDone(id, st.id)).join('') : ''}|${s.tool}|${s.canConfirm(id ?? '')?.ok}|${extra}|${s.workPlate.owner}`;
      }
      case 'stove':
        return `${base}|${s.burners.map((b) => b.state + !!b.overflow + b.product).join()}|${s.stoveTasks().map((t) => t.stepId).join()}`;
      case 'catbowl':
        return `${base}|${s.cat.state}|${s.catCalm()}`;
      case 'oven':
        return `${base}|${s.oven.state}|${s.dishes.chicken?.steps.marinade.done}|${s.dishes.chicken?.done}`;
      case 'sink':
        return `${base}|${s.dirtyItems().map((x) => x.id).join(',')}|${s.sinkJob?.item}|${s.hotList().map((x) => x.product).join()}`;
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
        return s.burners.filter((b) => b.state === 'boiling').map((b) => `${PICON[b.product]} ${esc(PRODUCTS[b.product].name)}: ${fmt(b.readyAt - s.t)}`).join(' · ');
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
          .map((t) => {
            const cls = t.state === 'done' ? 'ghost' : t.block ? 'soft-disabled' : 'primary';
            if (t.product === 'mayo' && t.state !== 'done') return this._btn(`${PICON.mayo} ${esc(t.label)}`, 'bowlAdd', [t.dishId, t.stepId, 'full'], cls, busy, t.block ?? '') + this._btn(`${PICON.mayo} Поменьше майонеза`, 'bowlAdd', [t.dishId, t.stepId, 'light'], t.block ? 'soft-disabled' : 'ghost', busy, t.block ?? '');
            const lbl = t.state === 'done' ? PRODUCTS[t.product].name + (t.product === 'mayo' && s.dishes[t.dishId].mayo === 'light' ? ' (поменьше)' : '') + ' ✓' : esc(t.label);
            return this._btn(`${PICON[t.product] ?? ''} ${lbl}`, 'bowlAdd', [t.dishId, t.stepId], cls, busy || t.state === 'done', t.block ?? '');
          })
          .join('');
        const seasonTask = tasks.find((t) => t.type === 'season' && t.state !== 'done' && t.dishId === s.bowl.owner);
        let seasonRow = '';
        if (seasonTask) {
          const ss = s.seasonState(seasonTask.dishId);
          const dis = busy || !!ss.block;
          seasonRow = `<div class="season"><div class="row">
            ${this._btn(`🧂 Соль · ${ss.salt}`, 'seasonAdd', [seasonTask.dishId, 'salt'], '', dis, ss.block ?? '')}
            ${this._btn(`🌶 Перец · ${ss.pepper}`, 'seasonAdd', [seasonTask.dishId, 'pepper'], '', dis, ss.block ?? '')}
            ${this._btn('👅 Попробовать', 'seasonTaste', [seasonTask.dishId], 'primary', dis, ss.block ?? '')}
            ${this._btn('💧 Разбавить', 'seasonDilute', [seasonTask.dishId], 'ghost', dis || (!ss.salt && !ss.pepper))}
            ${this._btn('✓ Вкус готов', 'seasonDone', [seasonTask.dishId], 'primary', dis)}
          </div><div class="small">${ss.block ? '⏳ ' + esc(ss.block) : ss.last ? `Последняя проба: <b>${esc(ss.last.verdict)}</b> (проб: ${ss.tastes})` : 'Норма скрыта — пробуй ложкой.'}</div></div>`;
        }
        const mt = s.mixTarget();
        const dirty = !s.equipment.bowl.clean ? '<p class="note warn">Миска грязная — помой её у раковины.</p>' : '';
        return `<h2>🥣 Миска${s.bowl.owner ? `<span class="sub">${esc(s.recipes[s.bowl.owner].name)}</span>` : ''}</h2>
          <div class="row">${btns}${back}</div>${seasonRow}<div class="row">${bar}</div>${live}${dirty}
          <p class="note">${mt ? (mt.ok ? 'Зажми кнопку и веди мышь по кругу внутри миски — 4 оборота.' : 'Перемешивание после полного состава: ' + esc(mt.block ?? '')) : s.bowl.contents.length ? 'Добавь всё по рецепту.' : 'Сюда идут нарезанные продукты с доски и заправка.'}</p>`;
      }
      case 'tray':
        return this._trayPanel(s, back, bar, live, busy);
      case 'stove': {
        const tasks = s.stoveTasks();
        const usable = new Set(s.usableBurners().map((b) => b.i));
        const burners = s.burners
          .map((b) => {
            const name = `Конфорка ${b.i + 1}`;
            if (!usable.has(b.i)) return `<div class="burner off"><b>${name}</b> — сломана (испытание)</div>`;
            let act = '';
            if (b.overflow) act = this._btn('🔥 Убавить огонь', 'reduceHeat', [b.i], 'danger', busy);
            else if (b.state === 'ready') act = this._btn(`${PICON[b.product]} Достать`, 'takePot', [b.i], 'primary', busy);
            else if (b.state === 'boiling') act = `<span class="small">${PICON[b.product]} ${esc(PRODUCTS[b.product].name)} варится</span>`;
            else act = tasks.length ? tasks.map((t) => this._btn(`${PICON[t.product]} ${esc(PRODUCTS[t.product].name)} · ${fmt(s.boilTime(t.product))}`, 'placePot', [b.i, `${t.dishId}:${t.stepId}`], 'primary', busy)).join('') : '<span class="small">свободна</span>';
            return `<div class="burner ${b.state}"><b>${name}</b> ${act}</div>`;
          })
          .join('');
        return `<h2>♨️ Плита</h2>${burners}<div class="row">${back}</div><div class="row">${bar}</div>${live}<p class="note">${tasks.length || s.burners.some((b) => b.state !== 'empty') ? 'Ставь сразу на обе конфорки. Следи, чтобы вода не убежала. Сваренное горячее — остуди у раковины.' : 'Сегодня плита не нужна.'}</p>`;
      }
      case 'catbowl': {
        const h = Math.round(s.catNeeds.hunger);
        return `<h2>🐾 Миска кота<span class="sub">голод ${h} %</span></h2><div class="row">${this._btn('🐟 Покормить', 'feedCat', [], 'primary big', busy)}${this._btn('🧶 Бросить мячик', 'playCat', [], 'ghost', busy)}${back}</div><div class="row">${bar}</div><p class="note">Сытый кот спит и не лезет к еде. Мячик занимает его на ${CAMPAIGN.cat.playTime} с, но голод растёт.</p>`;
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
        const cool = s.hotList().map((x) => this._btn(`❄️ Остудить: ${PICON[x.product]} ${esc(PRODUCTS[x.product].name.toLowerCase())}`, 'coolProduct', [x.product], 'primary', busy)).join('');
        return `<h2>🚰 Раковина</h2>${cool ? `<div class="row">${cool}</div>` : ''}<div class="row">${btns || '<span class="small">Вся посуда чистая.</span>'}${back}</div><div class="row">${bar}</div>${live}<p class="note">${s.sinkJob ? 'Зажми кнопку и три губкой по посуде.' : dirty.length ? 'Выбери, что мыть.' : cool ? 'Холодная вода остужает сваренное за пару секунд.' : 'Мыть нечего.'}</p>`;
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
    const sig = Object.values(s.dishes).map((d) => d.id + d.done + d.variant.onion + d.recipe.steps.map((st) => s.stepState(d.id, st.id)).join('')).join('|') + s.requests.map((r) => r.known).join() + JSON.stringify(s.inventory.stock);
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
        const reqs = s.requests.filter((r) => r.known && r.recipe === d.id).map((r) => `<div class="request">📩 Гости просят: <b>${esc(s.wishLabel(r))}</b>${d.done ? (s.wishMet(r) ? ' ✅' : ' ⚠️') : ''}</div>`).join('');
        variant = reqs;
        if (d.recipe.onionOption && !d.done) {
          variant = `${reqs}<div class="row">${this._btn('С луком', 'setVariant', [d.id, true], d.variant.onion ? 'active' : 'ghost')}${this._btn('Без лука', 'setVariant', [d.id, false], !d.variant.onion ? 'active' : 'ghost')}${this._btn('↺ Переделать начинку', 'redoFilling', [d.id], 'ghost')}</div>`;
        }
        return `<div class="recipe-dish ${d.done ? 'done' : ''}"><h3>${ICON[d.id]} ${esc(d.recipe.name)} ${d.done ? `<span class="score-pill">${d.Q}</span>` : ''}</h3><div class="small">${esc(d.recipe.look)}</div>${variant}<ul class="steps">${steps}</ul></div>`;
      })
      .join('');
    const extra = s.day.finalServe ? `<div class="recipe-dish"><h3>🎄 Сервировка стола</h3><div class="small">Все 10 блюд — на праздничный стол (${Object.keys(s.table.placed).length}/10).</div></div>` : '';
    this.el.recipe.innerHTML = `<div class="recipe-head"><b>📋 Рецепты дня</b><button class="ghost" data-close>×</button></div>${html}${extra}<p class="small">Картофель, яйца и свёклу варим сами; морковь — уже варёная. Норма соли у каждого блюда своя — пробуй.</p>`;
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
    const sig = this.phoneTab + s.phone.messages.length + JSON.stringify(s.delivery.draft) + (o ? o.status : '-') + !!s.delivery.bag + s.alerts.filter((a) => a.urgent).map((a) => a.key).join() + s.wallet.spent;
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
            return `<tr class="${lack[c.id] ? 'lack' : ''}"><td>${PICON[c.id] ?? ''} ${esc(c.name)}${lack[c.id] ? ' <b>!</b>' : ''}</td><td class="price">${PRODUCTS[c.id].price ?? 0} ₽</td><td class="qty">${this._btn('−', 'draftSet', [c.id, q - 1], 'ghost mini', q <= 0)}<span>${q}</span>${this._btn('+', 'draftSet', [c.id, q + 1], 'ghost mini', q >= 6)}</td></tr>`;
          })
          .join('');
        const total = Object.values(s.delivery.draft).reduce((a, b) => a + b, 0);
        const m = s.money();
        const modes = s.deliveryModes()
          .map((md) => {
            const c = s.orderCost(s.delivery.draft, md.id);
            const when = md.id === 'self' ? `уйду на ${md.away} с` : `${md.wait[0]}–${md.wait[1]} с`;
            const can = total && c.total <= m.left;
            return this._btn(`${md.id === 'express' ? '⚡' : md.id === 'self' ? '🏃‍♀️' : '🛵'} ${esc(md.label)} · ${c.total} ₽ · ${when}`, 'confirmOrder', [md.id], can ? (md.id === 'standard' ? 'primary' : '') : 'soft-disabled', false, can ? '' : total ? 'Не хватает денег' : 'Пустой заказ');
          })
          .join('');
        body = `<div class="wallet">💰 Бюджет дня: <b>${m.left} ₽</b> из ${m.budget} ₽</div><table class="shop">${rows}</table><div class="row modes">${modes}</div><p class="small">Игровые деньги, без реальных сервисов. «!» — не хватает для рецептов. «Сходить самой» — бесплатно, но плита и кот останутся без присмотра.</p>`;
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
