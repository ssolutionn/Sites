// Интерфейс кампании (DOM). Читает состояние и отправляет команды через act().
import { DAYS, RECIPES, PRODUCTS, CAMPAIGN, DISH_ORDER, TOYS, TOY_SETS, TINSEL, cartItem } from '../campaign/data.js';
import { PhoneUI, saveRecipeCard } from './phone.js';
import { LESSONS } from '../campaign/lessons.js';
import { CLAYOUT, TABLE_SLOTS, CLOSEUP_STATIONS, STOVE } from '../campaign/layout.js';
import { campaignScore } from '../campaign/save.js';
import { PRACTICE } from '../campaign/session.js';
import { MEDALS, MODIFIERS, guestLine } from '../campaign/extras.js';
import { LOGO_URL, NEUTRAL } from '../view/textures.js';
import { formatFreq } from '../campaign/st-radio.js';
import { inCavity } from '../campaign/st-dishwasher.js';
import { PICON } from './icons.js';
import { tipClosedBy } from './tip-done.js';
import { pts, tsp, tspText, gramsText, kitchenMin } from '../campaign/words.js';
const kmin = (sec) => kitchenMin(sec, CAMPAIGN.kitchenScale); // время готовки — в кухонных минутах (0.11)
import { Keymap, keyName } from '../keymap.js';
import { settingsHTML, bindSettings, systemReduceMotion } from './settings-ui.js';
import { effectiveReduceMotion } from '../settings.js';
import { settingsHtml, votesHtml, voteSig, nowLine } from './stream-ui.js';
import { tableGuests, streamSettings } from '../campaign/stream-rules.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Предупреждение о сохранении для меню и итога дня (пусто, если всё в порядке). */
function saveNote(save) {
  const w = save.writeError;
  if (save.status === 'newer' || w === 'protected') return 'Сохранение от более новой версии игры. В этом запуске прогресс не записывается: «Новая кампания» начнёт заново, а старое сохранение останется в копии.';
  if (!save.available || w === 'noStorage') return 'Браузер не даёт сохранять — прогресс пропадёт, когда закроешь игру.';
  if (w === 'failed') return 'Не удалось сохранить прогресс: браузер отказал в записи.';
  if (save.status === 'migrated') return 'Сохранение обновлено до новой версии игры, прогресс на месте.';
  if (save.status === 'reset') return 'Старое сохранение не удалось прочитать — начата новая кампания. Копия старого лежит в браузере, её можно вернуть.';
  return '';
}
const metres = (m) => `${(Math.round(m * 10) / 10).toFixed(1).replace('.', ',')} м`;
const stars = (n) => [0, 1, 2].map((i) => `<span class="star ${i < n ? 'on' : ''}">★</span>`).join('');
const ICON = { olivier: '🥗', crab: '🦀', sandwiches: '🥪', eggs: '🥚', tartlets: '🧁', tomatoes: '🍅', shuba: '🐟', canape: '🍢', fruit: '🍊', chicken: '🍗', practice: '🔪' };
const STATION_ICON = { catbowl: '🐾', board: '🔪', tray: '🍽', bowl: '🥣', phone: '📱', stove: '♨️', oven: '🍗', sink: '🚰', dishwasher: '🧼', radio: '📻', garland: '💡', tree: '🎄', fridge: '🧊', table: '🥂', puddle: '🧽' };
// 0.11: значки посуды в доке посудомойки
const WASH_ICON = { knife: '🔪', bowl: '🥣', tray: '🍽', form: '🥘', board: '🪵' };
const TOOL = { knife: '🔪 Нож', spoon: '🥄 Ложка', spatula: '🧈 Лопатка', brush: '🖌 Кисточка', hand: '✋ Рука', skewer: '🍡 Шпажка' };

// Шкала пробы: где вкус относительно «в самый раз» — понятнее, чем слово «пресно».
function tasteScale(last) {
  const mark = (d) => Math.max(4, Math.min(96, 50 + d * 16));
  const row = (label, d) => `<span class="tscale" title="${label}: слева — мало, по центру — в самый раз, справа — много"><em>${label}</em><span class="tbar"><i class="lo"></i><i class="ok"></i><i class="hi"></i><b style="left:${mark(d)}%"></b></span></span>`;
  return row('соль', last.ds ?? last.salt ?? 0) + row('перец', last.dp ?? last.pepper ?? 0);
}

// Что с водой в кастрюле: понятнее, чем таймер.
function burnerStatus(s, b) {
  if (b.state === 'ready') return 'готово — достань';
  if (b.state !== 'boiling') return (b.heat ?? 0) ? 'огонь горит впустую' : '';
  if (!(b.heat > 0)) return 'огонь выключен — поверни крутилку';
  if (b.water === 'boil') return `кипит · ещё ≈ ${kmin(b.readyAt - s.t)}${b.heat >= CAMPAIGN.stove.foamHeat ? ' · убавь, убежит!' : ''}`;
  const left = b.readyAt - s.t;
  return left > 5000 ? `вода ${Math.round(b.temp)}° · так не закипит` : `вода ${Math.round(b.temp)}° · греется`;
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const TIPS = {
  cube: 'Нож режет там, где прошёл: зажми кнопку и веди. Сверху вниз — полоски, поперёк — кубики. Дрогнула рука — кусок выйдет кривым. Мелко и быстро — рубка: качай нож вверх-вниз, понемногу сдвигая вбок. Доску крутят A и D: нажал — четверть оборота, держишь — плавно. Кубик для оливье — 1 см, как образец.',
  round: 'Кружочки: проведи ножом сверху вниз через продукт — отрежешь кружок. Толщина — расстояние до прошлого разреза, сравни с образцом. Вдоль кружочки не режут.',
  grate: 'Тёрка: зажми левую кнопку и води мышью вверх-вниз. Засчитываются только полные движения.',
  peel: 'Чистка. Картофель — ножом: зажми кнопку и веди по клубню, кожура снимается там, где прошёл нож. Яйцо — пальцами: сначала нажми на каждое пару раз (постучать о доску — скорлупа треснет), потом зажми и снимай скорлупу.',
  bowl: 'Миска руками: выбери банку или майонез внизу, зажми кнопку и веди над миской — горошек высыпается, майонез ложится там, где ведёшь. Солонку возьми внизу и кликай над миской — каждый клик ⅛ ч. л. соли. Ложкой мешай по кругу.',
  sink: 'Раковина: горячее — «Под кран», потом зажми кнопку над раковиной: льётся холодная вода, держи, пока не уйдёт пар. Грязную посуду — выбери и три губкой.',
  dishwasher: 'Посудомойка: потяни ручку дверцы вниз — она откроется. Зажми фишку грязной посуды внизу и перетащи в проём, потом подними дверцу и нажми кнопку на ней. Цикл идёт 10 кухонных минут (около 40 секунд), пока он идёт, посуда внутри недоступна. Что стоит в машине к концу дня, не считается немытым: к утру оно чистое.',
  puddle: 'Уборка: зажми кнопку и води тряпкой по луже.',
  'tray:sandwiches': 'Бутерброды: лопаткой (зажми кнопку) намажь каждый ломтик — масло видно там, где прошла лопатка. Потом ложкой кликай по ломтикам: норма — 2 ложки икры.',
  'tray:eggs': 'Яйца: ножом кликни по яйцу — половинки. Ложкой кликни по каждой половинке — желток уйдёт в миску для начинки.',
  'tray:tartlets': 'Наполнение: ложкой кликни по рабочей тарелке — набрать начинку, по корзинке — положить. Пустой ложкой можно снять лишнее. Затем рукой — веточки зелени.',
  'tray:tomatoes': 'Помидоры: ножом кликни по верхушке — срежешь крышечку. Ложкой проведи внутри — вынешь сердцевину. Потом наполняй, как тарталетки.',
  'tray:shuba': 'Шуба: выбери компонент снизу, кликни по блюду, разровняй лопаткой (зажми кнопку) и подтверди слой. Последний слой можно отменить.',
  'tray:canape': 'Канапе как в жизни: положи кубик хлеба на место на блюде, сверху — сыр, колбасу, огурец (тяжёлое ниже). Потом возьми шпажку, зажми над стопкой и протяни вниз — она войдёт до хлеба. Вбок — не проткнёт.',
  'tray:fruit': 'Фрукты: кликай по мандарину — снимешь кожуру и разделишь на дольки. Перетаскивай дольки, яблоко и виноград на тарелку: 12–18 кусочков.',
  catTheft: 'Кот тянется к еде! Три способа: помаши мышью над ним в обзоре кухни, крикни (F — получится не всегда) или кликни по коту — героиня подбежит и прогонит наверняка. Не успеешь — унесёт кусок, а запаса нет.',
  catSpill: 'Кот подбирается к стакану компота. Помаши на него мышью, крикни (F) или кликни по коту — иначе на полу будет лужа.',
  pot: 'Пена поднимается — сейчас убежит! Подойди к плите и поверни крутилку этой конфорки ниже 6, пока не кончилась полоска.',
  delivery: 'Заказ оформлен. Пока курьер едет, занимайся другими делами — уведомление придёт само.',
  radio: 'Радио замолчало. Это не срочно: подойди к нему, зажми ручку настройки и подержи пару секунд — треск стихнет, музыка вернётся.',
  radioTune: 'Радио: зажми ручку настройки и веди по кругу — по часовой частота выше. Между станциями шипит. Колёсико мыши — точная подстройка, ◀ ▶ — соседняя станция.',
  garland: 'Часть гирлянды погасла. Не срочно, но к концу дня её стоит починить — это влияет на порядок.',
  gifts: 'Под ёлкой подарки! Подойди к ёлке и открой — внутри очки домохозяйки или ёлочная игрушка. Игрушки вешают на ёлку, их можно купить и в «Ёлочном базаре» в телефоне.',
  catBored: 'Кот скучает. Подойди к его миске, возьми «удочку» и води бантиком по полу — иначе он начнёт безобразничать: полезет на ёлку или к гирлянде.',
  catWave: 'Кот безобразничает! Помаши мышью над ним влево-вправо, крикни (F) или кликни по коту — героиня подбежит и прогонит его.',
  star: 'Погасла звезда на ёлке. Подойди к ёлке и удержи «Поправить звезду» — к концу дня она должна гореть.',
  stove: 'Плита: четыре конфорки и четыре крутилки. Подойди с продуктом в руках и нажми «Положить сюда» у нужной конфорки, огонь — только крутилкой (зажми и веди по кругу). На 6 закипает за ~25 с. 7–9 быстрее, но на кипении убежит пена и зальёт плиту — убавь до 4–5. Над кастрюлей кольцо: синее — греется, оранжевое — варится, зелёное ✓ — готово, сними с огня, иначе переварится.',
  fridge: 'Для варки продукт сначала берут в руки: и яйца, и картофель — из холодильника. Руки одни: отнеси, что держишь, к доске (почистить) или к плите (в кастрюлю).',
  stoveWipe: 'Конфорку залило убежавшей пеной. Сними кастрюлю, потом зажми кнопку на пятне и три туда-обратно — как тряпкой.',
  hot: 'Сваренное горячее: резать сразу нельзя. Подожди около шести минут по часам кухни или остуди под холодной водой у раковины — это быстрее.',
  season: 'Вкус как в жизни: сначала посоли и поперчи (встряхивай солонку над миской), потом перемешай ложкой — и только потом пробуй. Пока не перемешано, соль лежит сверху и проба обманет. Досолила после — ещё оборот ложкой.',
  catHungry: 'Кот проголодался. Голодный кот сам полезет к колбасе, селёдке или сыру на доске. Покорми его у миски: возьми пачку корма и потряси над миской — сытый кот спит. Игра отвлекает, но голод не утоляет.',
  catbowl: 'Миска кота: возьми пачку корма и потряси её над миской — голод обнулится. Или возьми «удочку» и води бантиком по полу — кот наиграется на 45 секунд.',
  money: 'У дня есть бюджет. Экспресс быстрее, но дороже. «Сходить самой» бесплатно, но героиня уходит на 35 секунд — плита и кот без присмотра.',
  boardDirty: 'После сельди или свёклы доска грязная: тот же продукт резать можно, другой — только после мытья у раковины. Режь пахучее последним!',
  giftOpen: 'Подарок открывают руками: зажми бант и потяни, потом рви бумагу — води по коробке туда-сюда, потом зажми крышку и сдвинь. Отпустишь или отложишь (Esc) — начатое не пропадёт.',
  treeDecor: 'Наряжаем ёлку: зажми игрушку в коробке внизу и перетащи на любое место ёлки — куда нравится, только не вплотную к другой игрушке. Висящую можно перетащить в другое место. Весь набор на ёлке — очки домохозяйки.',
  tinsel: 'Мишура: возьми моток внизу, зажми кнопку на ёлке и води по веткам — нитка ложится, где ведёшь, а длина уходит из мотка. Отпустила — нитка закончилась. «Снять» — ножницы: клик по нитке возвращает длину в моток.',
  treeDown: 'Кот уронил ёлку! Подойди к ней, зажми ствол или верхушку и потяни вверх. Пока она лежит, вешать нельзя. Часть стеклянных игрушек могла разбиться, остальные на полу: кликни по игрушке или перетащи её в коробку.',
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
    this.pendingTips = []; // советы про другое место кухни: ждут, пока игрок не выйдет из крупного плана
    this.recipeOpen = false;
    this.phoneTab = 'messages';
    this.labelEls = {};
    for (const [id, st] of Object.entries(CLAYOUT.stations)) this._label(id, st.label);
    this._label('puddle', 'Лужа');
    this._bindPanel();
    this._bindPhone();
    this._bindRecipe();
    // заметка из кулинарной книги: «как на самом деле», «зачем», факт
    this.el.note = document.createElement('div');
    this.el.note.id = 'lesson-note';
    this.el.note.className = 'hidden';
    $('#app').appendChild(this.el.note);
    this.noteT = 0;
    this.noteIdle = 0;
    this.factIdx = 0;
    // 0.11 A3: после готового блюда 2,5 с видна одна карточка, остальное молчит или ждёт
    this.quiet = 0;
    this.noteLater = null;
    this.dishCard = null;
  }

  /** Блюдо закончено: на sec секунд гасим всплывашки вкуса и заметки книги (заметка покажется позже). */
  quietFor(sec) {
    this.quiet = Math.max(this.quiet, sec);
  }

  // Показать заметку книги: kind — подпись («Как на самом деле»), text — одна-две фразы.
  _note(kind, text) {
    if (!text) return;
    if (this.quiet > 0) {
      this.noteLater = { kind, text };
      return;
    }
    this.el.note.innerHTML = `<div class="ln-k">📖 ${esc(kind)}</div><div class="ln-t">${esc(text)}</div>`;
    this.el.note.classList.remove('hidden');
    this.el.note.classList.remove('pop');
    void this.el.note.offsetWidth;
    this.el.note.classList.add('pop');
    this.noteT = 9;
    this.noteIdle = 0;
  }

  _lessonStep(dishId, stepId) {
    return LESSONS[dishId]?.steps?.[stepId] ?? null;
  }

  _label(id, text) {
    const d = document.createElement('div');
    d.className = 'st-label';
    d.innerHTML = `<kbd class="kc">${esc(this._keyName('interact'))}</kbd><span class="ic">${STATION_ICON[id] ?? ''}</span><span class="nm">${esc(text)}</span>`;
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
    this._closeSettings?.();
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
    this._closeSettings?.();
    this.streamScreen = false;
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
    const dev = new URLSearchParams(location.search).has('dev');
    const flakes = Array.from({ length: 36 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-duration:${7 + (i % 7)}s;animation-delay:${-(i * 1.3) % 9}s;opacity:${0.35 + (i % 5) * 0.12};transform:scale(${0.5 + (i % 4) * 0.25})"></i>`).join('');
    this._overlay(`
      <div class="snowfall">${flakes}</div>
      <div class="menu2">
        <div class="brand">
          <div class="kicker">семь дней до праздника</div>
          <h1>Симулятор<br/><span>новогодней</span><br/>суеты</h1>
          <p>${has ? `Пройдено дней: ${done} из 7 · итог кампании ${campaignScore(save.data)}` : 'Режь, мешай, пробуй и успевай — а кот пусть не трогает колбасу.'}</p>
          ${NEUTRAL ? '' : `<div class="by"><img src="${LOGO_URL}" alt="" /> вместе с «Пятёрочкой»</div>`}
          ${saveNote(save) ? `<p class="small warn">${esc(saveNote(save))}</p>` : ''}
        </div>
        <div class="glass side">
          ${has ? `<button class="primary big" data-ui="continue">▶ ${contLabel}</button>` : `<button class="primary big" data-ui="new">▶ Начать готовить</button>`}
          ${has ? '<button class="big" data-ui="new">✚ Новая кампания</button>' : ''}
          <button class="big" data-ui="journal">📖 Дни и рецепты</button>
          <div class="row2">
            <button data-ui="practice">🔪 Практика</button>
            <button data-ui="challenges">🏆 Испытания</button>
          </div>
          ${CAMPAIGN.stream.enabled ? `<button class="big" data-ui="stream">📺 Режим стримера${streamSettings(save.data.settings.stream).on ? ' · включён' : ''}</button>` : ''}
          <div class="settings">
            <button class="icon" data-ui="controls" title="Управление">⌨</button>
            <button class="icon" data-ui="mute" title="Звук (${esc(this._keyName('mute'))})">${this.app.isMuted() ? '🔇' : '🔊'}</button>
            <button data-ui="settings" title="Звук, управление, размер текста, графика">⚙ Настройки</button>
          </div>
          ${dev ? '<div class="row2"><a class="btn-link" href="./classic.html">Оливье за 5 минут</a><a class="btn-link" href="./gallery.html">3D-галерея</a></div>' : ''}
          <div class="card controls hidden" id="controls-card">${this._controls()}</div>
        </div>
      </div>`, 'center');
  }

  // Клавиша действия из настроек (WASD, пробел и так далее — как назначил игрок).
  _keyName(action) {
    return keyName((this.app.keymap ?? (this.app.keymap = new Keymap())).get(action));
  }

  _controls() {
    const K = (a) => `<kbd>${esc(this._keyName(a))}</kbd>`;
    return `<table>
      <tr><td>${['up', 'left', 'down', 'right'].map(K).join('')} или стрелки</td><td>Ходить по кухне</td></tr>
      <tr><td>${K('interact')}</td><td>Открыть место рядом (на метке — «${esc(this._keyName('interact'))}»); у гирлянды, звезды и радио — удерживать</td></tr>
      <tr><td>Клик по полу</td><td>Пойти в эту точку</td></tr>
      <tr><td>Клик по станции или метке</td><td>Подойти и начать действие</td></tr>
      <tr><td>Зажать и провести у доски</td><td>Росчерк ножом: сверху вниз или слева направо</td></tr>

      <tr><td>Удержание и движение</td><td>Намазывание, перемешивание, тёрка, мытьё, уборка, маринад</td></tr>
      <tr><td>Перетаскивание</td><td>Стопки канапе, фрукты, сервировка стола</td></tr>
      <tr><td>${K('recipe')}</td><td>Рецепт</td></tr>
      <tr><td>${K('left')}${K('right')} у доски</td><td>Повернуть доску</td></tr>
      <tr><td>${K('pause')}</td><td>Закрыть рецепт, отойти от места, иначе пауза</td></tr>
      <tr><td>${K('mute')}</td><td>Звук</td></tr>
      <tr><td>${K('fullscreen')}</td><td>Полный экран</td></tr>
      <tr><td>${K('pauseChat')}</td><td>Пауза чата (режим стримера)</td></tr>
    </table>`;
  }

  /** Клавиши поменяли в настройках: подписи на метках, подсказки кнопок и док (он перерисуется на следующем кадре). */
  refreshKeyLabels() {
    const t = this._keyName('interact');
    for (const el of Object.values(this.labelEls)) {
      const kc = el.querySelector('.kc');
      if (kc) kc.textContent = t;
    }
    const set = (id, text) => {
      const b = $('#' + id);
      if (b) b.title = text;
    };
    set('btn-recipe', `Книга рецептов (${this._keyName('recipe')})`);
    set('btn-mute', `Звук (${this._keyName('mute')})`);
    set('btn-pause', `Пауза (${this._keyName('pause')})`);
    this.panelSig = null;
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
        ${day.dishes.map((id) => LESSONS[id] ? `<div class="book-page"><div class="bp-k">📖 из кулинарной книги</div><p class="hand">${esc(LESSONS[id].intro)}</p><div class="bp-ingr">${LESSONS[id].ingredients.slice(0, 7).map((g) => `<span>${esc(g.product ? PRODUCTS[g.product]?.name ?? g.name : g.name)} — ${esc(g.amount)}</span>`).join('')}</div><p class="bp-fact">✨ ${esc(LESSONS[id].facts[0] ?? '')}</p></div>` : '').join('')}
        <div class="skills">Новое: ${skills}</div>
        ${resumed ? '<p class="small warn">Страница перезагружалась во время дня: начинаем этот день заново, прошлые результаты сохранены.</p>' : ''}
        <p class="small">Ориентир: около ${day.targetMinutes} минут — уложишься, получишь медаль «В ритме». Время не ограничено. Бюджет на покупки: <b>${day.budget ?? 0} ₽</b>.</p>
        ${this.app.session?.live ? '<p class="small stream-note">📺 Режим стримера: день с чатом записывается отдельно, кампания и медали не изменятся.</p>' : ''}
        ${mods?.length ? `<div class="skills">Испытание: ${mods.map((m) => `<span class="chip warn">${esc(MODIFIERS[m].label)} — ${esc(MODIFIERS[m].desc)}</span>`).join(' ')}</div>` : ''}
        <div class="actions"><button class="primary big" data-ui="enter">На кухню!</button><button class="ghost" data-ui="journal">Журнал</button></div>
      </div>`,
      'dim',
    );
  }

  /** Пауза. day — идёт ли день кампании: выход в меню из него теряет день, поэтому сначала спрашиваем. */
  showPause(day = false) {
    this._overlay(
      `<div class="card dialog" style="width:min(400px,100%);text-align:center">
        <h2>Пауза</h2>
        <p class="small">Плита, духовка, доставка и кот ждут. Музыка тоже на паузе.</p>
        <div class="actions" style="justify-content:center">
          <button class="primary big" data-ui="resume">Продолжить</button>
          <button class="ghost" data-ui="settings">Настройки</button>
          <button class="ghost" data-ui="restartDay">Начать день заново</button>
          <button class="ghost" data-ui="${day ? 'exitAsk' : 'menu'}">В меню</button>
        </div>
      </div>`,
      'dim',
    );
    document.body.classList.add('paused-anim');
  }

  /** Экран «Настройки» из меню и из паузы. Закрывает его «Готово» или Esc: app.ui('settingsBack'). */
  showSettings() {
    const ctl = this.app.settings;
    const fs = this.app.fullscreen;
    const ctx = () => ({ settings: ctl.s, muted: this.sound.muted, keymap: ctl.keymap, fs, reduce: effectiveReduceMotion(ctl.s, systemReduceMotion()) });
    this._overlay(settingsHTML(ctx()), 'dim');
    const root = this.el.overlay.querySelector('.settings');
    const h = bindSettings(root, { ctl, fs, sound: this.sound, keymap: ctl.keymap, onKeys: () => this.refreshKeyLabels(), onBack: () => this.app.ui('settingsBack') });
    this._settingsH = h;
    this._closeSettings = () => {
      h.dispose();
      this._settingsH = null;
      this._closeSettings = null;
    };
    root.focus({ preventScroll: true });
  }

  /** Открыт ли экран настроек (Esc тогда возвращает назад, а не ставит паузу). */
  get settingsOpen() {
    return !!this._settingsH;
  }

  /** Звук включили клавишей, пока открыты настройки: переключатель обновляется на месте. */
  refreshSettings() {
    this._settingsH?.refresh();
  }

  /** «В меню» посреди дня: день не сохраняется (он идёт 6–10 минут), поэтому предупреждаем заранее. */
  showExitConfirm() {
    this._overlay(
      `<div class="card dialog" style="width:min(420px,100%);text-align:center">
        <h2>Выйти в меню?</h2>
        <p class="small">Этот день начнётся заново. Результаты прошлых дней сохранены.</p>
        <div class="actions" style="justify-content:center">
          <button class="primary big" data-ui="pauseBack">Остаться</button>
          <button class="ghost big" data-ui="menu">Выйти в меню</button>
        </div>
      </div>`,
      'dim',
    );
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
        const L = LESSONS[id];
        return `<div class="dish-res"><div class="dish-q">${r.dishes[id]}</div><div><b>${ICON[id]} ${RECIPES[id].name}</b><ul>${notes}</ul>${L ? `<p class="bp-check">📖 ${esc(L.check)}</p><button class="ghost small-btn" data-card="${id}">💾 Карточка рецепта</button>` : ''}</div></div>`;
      })
      .join('');
    const best = r.challenge || r.stream ? null : save.data.days[day.id - 1].best;
    const wish = (r.wishes ?? []).map((w) => `<div>${w.met ? '✅' : '⚠️'} ${ICON[w.recipe]} «${esc(w.label)}» — ${w.met ? 'выполнено' : 'не выполнено'}</div>`).join('');
    const medals = (r.medals ?? []).map((m) => `<span class="medal" title="${esc(MEDALS[m].hint)}">${MEDALS[m].icon} ${esc(MEDALS[m].name)}</span>`).join('');
    const guests = day.dishes.map((id, k) => `<div class="guest-line">💬 <b>${['Оля', 'Дима', 'Катя', 'Серёжа'][k % 4]}:</b> ${esc(guestLine(id, r.dishes[id], r.D))}</div>`).join('');
    this._overlay(
      `<div class="card dialog result">
        <div class="head"><div class="emoji">${r.D >= 85 ? '🏆' : r.D >= 60 ? '🎄' : '😅'}</div><h2>День ${day.id} завершён</h2><div class="small">${esc(day.title)}</div></div>
        <div style="text-align:center"><span class="score">${r.D}</span><span class="small"> / 100 за день${best && best.D > r.D ? ` · лучший ${best.D}` : ''}</span><div class="stars big">${stars(r.stars ?? 0)}</div></div>
        ${r.stream ? this._streamLine(r.stream) : ''}
        ${medals ? `<div class="medals-row">${medals}</div>` : ''}
        ${rows}
        ${wish ? `<div class="wishes">${wish}</div>` : ''}
        ${guests}
        <div class="order-row"><b>Порядок на кухне: ${r.order}</b>${r.orderNotes.length ? ' — ' + r.orderNotes.map(esc).join('; ') : ' — чисто и празднично'}${r.overnight?.length ? ` · в посудомойке на ночь: ${r.overnight.map((x) => esc(x.toLowerCase())).join(', ')}` : ''}</div>
        ${save.writeError ? `<p class="small warn">⚠ Результат дня не сохранён. ${esc(saveNote(save))}</p>` : ''}
        <p class="small">Время на кухне: ${fmt(r.time)} при ориентире ${fmt(r.par ?? 0)} — темп ${r.pace ?? '—'} (ходьба ${fmt(r.stats.walk)}, крупный план ${fmt(r.stats.closeup)}, телефон ${fmt(r.stats.phone)}). Покупки: ${r.spent ?? 0} из ${r.budget ?? 0} ₽.</p>
        <div class="actions" style="justify-content:center">
          ${r.stream ? `<button class="primary big" data-ui="menu">В меню</button>${!isLast && save.data.days[day.id]?.unlocked ? '<button class="ghost" data-ui="nextDay">Следующий день →</button>' : ''}` : r.challenge ? '<button class="primary big" data-ui="challenges">🏆 К испытаниям</button>' : isLast ? '<button class="primary big" data-ui="final">🎄 Финальный стол</button>' : '<button class="primary big" data-ui="nextDay">Следующий день →</button>'}
          <button class="ghost" data-ui="replay">Переиграть день</button>
          <button class="ghost" data-ui="journal">Журнал</button>
        </div>
      </div>`,
      'dim',
    );
    this.el.overlay.querySelectorAll('[data-card]').forEach((b) => b.addEventListener('click', () => saveRecipeCard(b.dataset.card)));
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
    // 0.11: за столом — самые активные зрители стрима; зрителей меньше, чем гостей, — остальные обычные
    const names = tableGuests(['Дима', 'Оля', 'Серёжа', 'Катя', 'Миша'], save.data.stream?.viewers, streamSettings(save.data.settings.stream).nicks);
    this.finalGuests = DISH_ORDER.map((id, k) => ({ id, who: names[k % 5], text: guestLine(id, q[id], k), at: 1.5 + k * 2.2 }));
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

  /** Экран «Режим стримера». view — снимок голосования (или null), overlay — состояние оверлея OBS (только в версии для компьютера). */
  showStream(save, view = null, overlay = null, note = '') {
    const st = streamSettings(save.data.settings.stream);
    this.streamScreen = true;
    this._overlay(settingsHtml({ s: st, view, overlay, note }), 'dim');
    const root = this.el.overlay;
    const set = (key, value) => this.app.ui('streamSet', `${key}=${value}`);
    $('#stream-channel', root)?.addEventListener('change', (e) => set('channel', e.target.value));
    $('#stream-test', root)?.addEventListener('change', (e) => set('test', e.target.checked ? 1 : 0));
    $('#stream-nicks', root)?.addEventListener('change', (e) => set('nicks', e.target.checked ? 1 : 0));
    $('#stream-port', root)?.addEventListener('change', (e) => set('overlayPort', e.target.value));
    $('.ov-url', root)?.addEventListener('focus', (e) => e.target.select());
  }

  /** Пока экран настроек открыт, строка «Сейчас: …» живёт: статус подключения меняется на месте. */
  refreshStreamNow(save, view) {
    const el = $('#stream-now');
    if (!el) return;
    const html = nowLine(streamSettings(save.data.settings.stream), view);
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /** Строка «С чатом» в итоге дня: { prev, best, isBest, events }. */
  _streamLine(r) {
    const tail = r.isBest ? (r.prev ? ' — новый лучший с чатом' : '') : ` · лучший с чатом ${r.best.D}`;
    return `<div class="stream-line">📺 С чатом: <b>${r.D}</b> из 100${tail} · событий от чата: ${r.events}<div class="small">Этот день записан отдельно: кампания, медали и очки домохозяйки не изменились.</div></div>`;
  }

  /** Безопасная зона под веб-камеру: класс на корне страницы и размеры угла (доли экрана — CAMPAIGN.stream.cam). */
  setCam(cam) {
    const root = document.documentElement;
    for (const c of ['tl', 'tr', 'bl', 'br']) root.classList.toggle('cam-' + c, cam === c);
    const z = CAMPAIGN.stream.cam;
    root.style.setProperty('--cam-w', cam && cam !== 'none' ? `${Math.round(z.w * 100)}vw` : '0px');
    root.style.setProperty('--cam-h', cam && cam !== 'none' ? `${Math.round(z.h * 100)}vh` : '0px');
    this._votesSig = null;
  }

  /** Что видно только интерфейсу, но важно для canFire: заметка из книги, открытая книга рецептов, ввод в телефоне. */
  streamBusy() {
    const phone = this.el.phone;
    const typing = !phone.classList.contains('hidden') && /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '') && phone.contains(document.activeElement);
    return { lesson: !this.el.note.classList.contains('hidden'), book: !!this.recipeOpen, typing };
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
      el.className = 'glass';
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-vote]');
        if (b) this.app.testVote(b.dataset.vote);
        else if (e.target.closest('[data-chat="pause"]')) this.app.toggleChatPause();
      });
    }
    el.classList.remove('hidden');
    this._placeVotes(el);
    const sig = voteSig(v);
    if (sig === this._votesSig) return;
    this._votesSig = sig;
    el.innerHTML = votesHtml(v);
  }

  // Плашка не прячет док станции: если док открыт и они пересекаются по ширине, плашка встаёт над ним.
  _placeVotes(el) {
    const dock = this.el.panel && !this.el.panel.classList.contains('hidden') ? this.el.panel.getBoundingClientRect() : null;
    const bottom = dock && dock.height ? Math.max(16, innerHeight - dock.top + 10) : 16;
    if (this._votesBottom !== bottom) {
      this._votesBottom = bottom;
      el.style.bottom = `${bottom}px`;
    }
  }

  // ---------- кухня ----------
  showKitchen(session) {
    // подарки под ёлкой (0.9): напомнить один раз, когда игрок осмотрится
    clearTimeout(this.giftTipTimer);
    if (session.giftsLeft?.().length) this.giftTipTimer = setTimeout(() => this.app.session === session && this.tipWhenFree('gifts'), 15000);
    this.el.hud.classList.remove('hidden');
    this.el.hud.innerHTML = `
      <div class="glass hud2-task">
        <div class="dish-ico" id="hud-ico">🥗</div>
        <div class="t-title" id="hud-day"></div>
        <div class="t-tools"><button id="btn-recipe" title="Книга рецептов (Q)">📖</button><button id="btn-help" title="Повторить подсказку">?</button></div>
        <div class="t-step" id="hud-step"></div>
        <div class="t-dishes" id="hud-dishes"></div>
        <div class="t-dots" id="hud-dots"></div>
        <div class="t-wish" id="hud-wish"></div>
        <button id="btn-finish" class="primary t-finish hidden">✅ Завершить день</button>
      </div>
      <div class="glass hud2-clock"><div class="time" id="hud-clock">00:00</div><div class="timers" id="hud-timers"></div></div>
      <div class="hud2-right">
        <div class="hud2-btns">
          <button id="btn-phone" class="glass" title="Телефон">📱<span class="badge hidden" id="phone-badge"></span></button>
          <button id="btn-mute" class="glass" title="Звук (M)"></button>
          <button id="btn-pause" class="glass" title="Пауза (Esc)"><span class="pause-ico"></span></button>
        </div>
        <div class="glass hud2-status" id="hud-meta"></div>
      </div>`;
    this.hudCache = {};
    $('#btn-recipe').addEventListener('click', () => this.toggleRecipe());
    $('#btn-help').addEventListener('click', () => this.repeatTip());
    $('#btn-finish').addEventListener('click', () => this.act('finishDay'));
    $('#btn-phone').addEventListener('click', () => this.act('goTo', 'phone'));
    $('#btn-mute').addEventListener('click', () => this.app.toggleMute());
    $('#btn-pause').addEventListener('click', () => this.app.pause());
    this.refreshKeyLabels();
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
    if (this.quiet > 0) return;
    // одна всплывашка за раз: новая заменяет старую
    this._popupEl?.remove();
    const d = document.createElement('div');
    d.className = `popup ${kind}`;
    d.innerHTML = text;
    document.body.appendChild(d);
    this._popupEl = d;
    setTimeout(() => d.remove(), 1500);
  }

  hideKitchen() {
    this.el.note?.classList.add('hidden');
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
    const rec = { el: d, t: seconds };
    this.toasts.push(rec);
    while (this.toasts.length > 3) this.toasts.shift().el.remove();
    return rec;
  }

  tip(topic, force = false) {
    if (!TIPS[topic]) return;
    if (!force && this.tipShown.has(topic)) return;
    this.tipShown.add(topic);
    this.lastTip = topic;
    this.el.tip.innerHTML = `<div class="tip-text">💡 ${esc(TIPS[topic])}</div><button class="ghost" id="tip-ok">Понятно</button>`;
    this.el.tip.classList.remove('hidden');
    // совет всегда в левой колонке: по центру он закрывал продукт в крупном плане и метки станций в обзоре
    this.el.tip.classList.add('side');
    $('#tip-ok').addEventListener('click', () => this.el.tip.classList.add('hidden'));
    this.tipT = 14;
  }

  /**
   * Игрок сделал то, о чём подсказка (tip-done.js): открытая подсказка закрывается сама, а ждущая в очереди
   * больше не нужна. type — событие сессии или интерфейса ('recipeOpened').
   */
  _tipDone(type) {
    if (this.lastTip && tipClosedBy(this.lastTip, type) && !this.el.tip.classList.contains('hidden')) {
      this.el.tip.classList.add('hidden');
      this.tipT = 0;
    }
    const done = this.pendingTips.filter((t) => tipClosedBy(t, type));
    if (!done.length) return;
    for (const t of done) this.tipShown.add(t);
    this.pendingTips = this.pendingTips.filter((t) => !done.includes(t));
  }

  /** Совет о происшествии вне станции, где игрок сейчас работает, не перекрывает работу — ждёт выхода из крупного плана. */
  tipWhenFree(topic) {
    const s = this.app.session;
    const catBusy = s && ['theft','spill','mischief'].includes(s.cat.state) && !['catTheft','catSpill','catWave'].includes(topic);
    // открытый совет не перебиваем: новый ждёт, пока игрок прочтёт или сделает то, о чём старый
    const busyTip = this.el?.tip && !this.el.tip.classList.contains('hidden') && this.lastTip !== topic;
    if (catBusy || busyTip || (s?.panel && CLOSEUP_STATIONS.has(s.panel))) {
      if (!this.tipShown.has(topic) && !this.pendingTips.includes(topic)) this.pendingTips.push(topic);
      return;
    }
    this.tip(topic);
  }

  repeatTip() {
    const s = this.app.session;
    let topic = this.lastTip;
    if (s?.panel === 'board') {
      const it = s.boardCur();
      topic = it?.grater ? 'grate' : it?.log ? 'round' : 'cube';
    } else if (s?.panel === 'tray' && s.tray.owner) topic = 'tray:' + s.trayLayoutId(s.tray.owner);
    else if (s?.panel === 'radio') topic = s.radio.broken ? 'radio' : 'radioTune';
    else if (s?.panel && TIPS[s.panel]) topic = s.panel;
    if (topic) this.tip(topic, true);
  }

  onEvent(e, s) {
    this._tipDone(e.type);
    switch (e.type) {
      case 'tutorial':
        this.tip(e.topic);
        break;
      case 'open':
        if (['bowl', 'sink', 'dishwasher', 'puddle', 'catbowl'].includes(e.station)) this.tip(e.station);
        if (e.station === 'phone') this.tip('money');
        if (e.station === 'fridge') this.tip('fridge');
        if (e.station === 'tree' && s.treeFall?.down) this.tip('treeDown');
        else if (e.station === 'tree' && s.tinselColors?.().length) this.tip('tinsel');
        else if (e.station === 'tree' && s.toysInBox?.().length) this.tip('treeDecor');
        if (e.station === 'radio') {
          this.pendingTips = this.pendingTips.filter((t) => t !== 'radio');
          this.tip('radioTune');
        }
        if (e.station === 'phone') {
          this.openPhone();
        }
        break;
      case 'giftStart':
        this.tip('giftOpen');
        break;
      case 'close':
        if (e.station === 'phone') this.el.phone.classList.add('hidden');
        // отложенный совет — через мгновение после выхода из станции
        if (this.pendingTips.length) this.tip(this.pendingTips.shift());
        break;
      case 'dishDone': {
        // 0.11 A3: одна карточка — значок и название, оценка, слово-вердикт, до трёх замечаний
        const d = s.dishes[e.dishId];
        const verdict = e.Q >= 90 ? 'Шедевр!' : e.Q >= 75 ? 'Отлично!' : e.Q >= 55 ? 'Готово' : 'Ну… съедобно';
        this.quietFor(CAMPAIGN.ui.dishQuiet);
        this.dishCard = this.toast(`<b>${ICON[e.dishId]} ${esc(d.recipe.name)} — ${e.Q}. ${verdict}</b><span class="small">${e.notes.map(esc).join(' · ')}</span>`, `${e.Q >= 75 ? 'good' : ''} dish-toast`, 6);
        break;
      }
      case 'dayReady': {
        const line = 'Все блюда готовы — «Завершить день»';
        // если карточка блюда ещё на экране, строка уходит в неё, а не отдельным сообщением
        if (this.dishCard?.el.isConnected) {
          this.dishCard.el.insertAdjacentHTML('beforeend', `<span class="ready">${line}</span>`);
          this.dishCard.t = Math.max(this.dishCard.t, 6);
        } else this.toast(`<b>${line}</b>`, 'good', 5);
        break;
      }
      case 'catStart':
        this.tip(e.kind === 'spill' ? 'catSpill' : e.kind === 'theft' ? 'catTheft' : 'catWave');
        break;
      case 'potBoil':
        this.tip('pot');
        break;
      case 'orderPlaced':
        this.tipWhenFree('delivery');
        break;
      case 'radioBroken':
        this.tipWhenFree('radio');
        break;
      case 'garlandOff':
        this.tipWhenFree('garland');
        break;
      case 'starOff':
        this.tipWhenFree('star');
        break;
      case 'catStole':
        this.toast(`Кот утащил кусок (${esc(PRODUCTS[e.product ?? 'sausage'].name.toLowerCase())})! ${s.inventory.available(e.product ?? 'sausage') >= 1 ? 'На доске — «Взять замену»' : 'Запаса нет — закажи в телефоне'}`, 'bad', 3.5);
        this.popup('🐈 Утащил!', 'bad');
        break;
      case 'catHungry':
        this.tipWhenFree('catHungry');
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
      case 'taken':
        this.tip('fridge');
        break;
      case 'potatoTaken':
        this.tip('hot');
        break;
      case 'cooled':
        this.toast(`${PICON[e.product] ?? ''} Остыло — можно чистить и резать`, 'good');
        break;
      case 'coolStart':
        this.tip('sink');
        break;
      case 'dirty':
        if (e.item === 'board') this.tip('boardDirty');
        break;
      case 'dwStart':
        this.toast(`🧼 Посудомойка запущена — готово через ${kitchenMin(e.sec, CAMPAIGN.kitchenScale)}`, 'good', 2.6);
        break;
      case 'dwDone':
        this.toast(`🧼 Посудомойка закончила — чистые: ${e.items.map((id) => esc(s.equipment[id].label.toLowerCase())).join(', ')}`, 'good', 4);
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
        this.toast(`📺 ${esc(e.text)}`, e.kind === 'help' ? 'good' : 'bad', 3.5);
        break;
      case 'viewerComment':
        this.toast(`📺 ${esc(e.nick)} прокомментировал твоё фото`, '', 2.6);
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
      case 'catBored':
        this.tipWhenFree('catBored');
        break;
      case 'catMischief':
        this.toast({ garland: 'Кот сорвал гирлянду — поправь контакт', star: 'Кот залез на ёлку и погасил звезду', toys: 'Кот сбил игрушки с ёлки', tree: 'Кот уронил ёлку — подними её' }[e.kind] ?? 'Кот набезобразничал', 'bad', 3.5);
        this.popup('🐈 Мяу!', 'bad');
        break;
      case 'spill':
        this.toast('Убежало! Залило плиту и пол — вытри конфорку и лужу', 'bad', 3.5);
        this.tipWhenFree('stoveWipe');
        break;
      case 'potSaved':
        this.toast('Огонь убавлен', 'good');
        break;
      case 'garlandFixed':
        this.toast('Гирлянда снова горит ✨', 'good');
        break;
      case 'starFixed':
        this.toast('Звезда снова горит ⭐', 'good');
        break;
      case 'giftOpened':
        if (e.prize.kind === 'points') this.popup(`🎁 +${pts(e.prize.n)}`, 'good');
        else this.popup(`🎁 ${TOYS[e.prize.id].icon} ${esc(TOYS[e.prize.id].name)}!`, 'good');
        this.toast(e.prize.kind === 'points' ? `В подарке ${pts(e.prize.n)} — их можно потратить в «Ёлочном базаре»` : `В подарке игрушка: ${esc(TOYS[e.prize.id].name.toLowerCase())}. Она в коробке — повесь на ёлку`, 'good', 3.5);
        break;
      case 'toyHung':
        this.toast(`${TOYS[e.id].icon} Повесили: ${esc(TOYS[e.id].name.toLowerCase())}`, 'good', 1.6);
        break;
      case 'treeFell':
        this.popup('🎄 Бах!', 'bad');
        this.tip('treeDown');
        if (e.broken?.length) this.toast(`Разбилось: ${e.broken.map((b) => esc(TOYS[b.id]?.name.toLowerCase())).join(', ')}`, 'bad', 4);
        break;
      case 'treeUp':
        this.toast('Ёлка снова стоит 🎄', 'good');
        break;
      case 'tinselBought':
        if (e.source !== 'delivery') this.toast(`${TINSEL[e.color].icon} ${esc(TINSEL[e.color].name)}: моток ${String(e.roll).replace('.', ',')} м у ёлки`, 'good', 3);
        this.tipWhenFree('tinsel');
        break;
      case 'setComplete':
        this.popup(`${TOY_SETS[e.id].icon} Набор «${esc(TOY_SETS[e.id].name)}» собран!`, 'good');
        if (e.n) this.toast(`+${pts(e.n)} за весь набор на ёлке`, 'good', 3);
        break;
      case 'radioFixed':
        this.toast('Радио снова играет 🎵', 'good');
        break;
      case 'washed':
        this.toast(esc(s.equipment[e.item].cleanText) + ' ✨', 'good');
        break;
      case 'cutReady': {
        const where = e.dest === 'bowl' ? 'можно в миску' : e.dest === 'pieces' ? 'можно на поднос' : 'можно убирать с доски';
        this.toast(`${PICON[e.product] ?? ''} Нарезано ровно — ${where} ✓`, 'good', 2.4);
        break;
      }
      case 'transfer': {
        this.toast(`${PICON[e.product] ?? ''} ${esc(PRODUCTS[e.product].name)} — готово (${Math.round(e.q * 100)} % аккуратно)`, 'good', 2.2);
        const l = this._lessonStep(e.dishId, e.stepId);
        if (l) e.q < 0.75 ? this._note('Частая ошибка', l.mistake) : this._note('Зачем так', l.why);
        break;
      }
      case 'boardSwitch':
        if (e.fresh) {
          const [dishId, stepId] = e.key.split(':');
          this._note('Как на самом деле', this._lessonStep(dishId, stepId)?.how);
        }
        break;
      case 'potPlaced': {
        const d = s.dishes[e.dishId];
        const st = d?.recipe.steps.find((x) => x.type === 'boil' && x.product === e.product);
        if (st) this._note('Как на самом деле', this._lessonStep(e.dishId, st.id)?.how);
        break;
      }
      case 'added':
      case 'seasoned':
      case 'stepDone': {
        if (e.type === 'stepDone' && !['add', 'season', 'mix'].includes(s.stepDef(e.dishId, e.stepId)?.type)) break;
        const stepId = e.stepId ?? s.dishes[e.dishId]?.recipe.steps.find((x) => x.product === e.product)?.id;
        const l = stepId && this._lessonStep(e.dishId, stepId);
        if (l) this._note('Зачем так', l.why);
        break;
      }
      case 'practiceResult':
        this.toast(`<b>Результат: ${Math.round(e.q * 100)} %</b>`, 'good', 4);
        break;
      case 'collectWarn':
        this.confirmCollect();
        break;
      case 'delivered':
        this.toast(`🛍 Привезли: ${e.items.map((it) => `${(cartItem(it.id)?.name ?? it.id).toLowerCase()} ×${it.qty}`).join(', ')}`, 'good', 4);
        if (e.items.some((it) => cartItem(it.id)?.kind === 'toy')) this.tipWhenFree('treeDecor'); // игрушки ждут в коробке у ёлки
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
    this.lastTip = null;
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
    if (this.quiet > 0) {
      this.quiet -= dt;
      if (this.quiet <= 0 && this.noteLater) {
        const n = this.noteLater;
        this.noteLater = null;
        this._note(n.kind, n.text);
      }
    }
    if (!s || (mode !== 'kitchen' && mode !== 'paused')) return;
    if (mode === 'kitchen' && !s.panel && !['theft','spill','mischief'].includes(s.cat.state) && this.el.tip.classList.contains('hidden') && this.pendingTips.length) this.tip(this.pendingTips.shift());
    // Keep the cat and the sweep of the hand visible beside the distant tree.
    this.el.tip.classList.toggle('cat-tip', /^cat/.test(this.lastTip ?? '') && !s.panel && ['theft','spill','mischief'].includes(s.cat.state));
    if (this.noteT > 0) {
      this.noteT -= dt;
      if (this.noteT <= 0) this.el.note.classList.add('hidden');
    }
    // пока что-то варится и руки свободны — факт из книги, раз в ~40 с
    if (mode === 'kitchen' && !s.practice) {
      this.noteIdle += dt;
      const busy = s.burners.some((b) => b.state === 'boiling') || s.oven.state === 'baking' || !!s.delivery.order;
      if (busy && this.noteIdle > 40 && this.el.tip.classList.contains('hidden')) {
        const facts = Object.keys(s.dishes).flatMap((id) => LESSONS[id]?.facts ?? []);
        if (facts.length) this._note('А вы знали?', facts[this.factIdx++ % facts.length]);
      }
    }
    this.el.note.classList.toggle('under-tip', !this.el.tip.classList.contains('hidden'));
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
      // подсказка всегда над доком станции: док плиты с крутилками выше обычного
      const dock = this.el.panel && !this.el.panel.classList.contains('hidden') ? this.el.panel.getBoundingClientRect() : null;
      const bottom = dock && dock.height ? Math.max(132, innerHeight - dock.top + 10) : 132;
      if (this._hintBottom !== bottom) {
        this._hintBottom = bottom;
        this.el.hint.style.bottom = `${bottom}px`;
      }
    } else this.el.hint.classList.add('hidden');
  }

  // Обновить кусок HUD, только если содержимое изменилось.
  _set(id, html) {
    if (this.hudCache[id] === html) return;
    this.hudCache[id] = html;
    const el = $('#' + id);
    if (el) el.innerHTML = html;
  }

  // Иерархия HUD: задача (слева) → время и активные таймеры (центр) → кот и деньги (справа).
  // Текст шага для HUD: если для шага продукт сначала берут в руки — сказать, откуда.
  _stepText(s, dishId, step) {
    const c = s.carry;
    const mine = c && c.dishId === dishId && (c.stepId === step.id || c.boilStep === step.id);
    const name = PRODUCTS[step.product]?.name?.toLowerCase() ?? '';
    if (step.type === 'peel' && step.raw && !mine) return `Достать ${name} из холодильника и почистить`;
    if (step.type === 'boil' && !mine) return `Достать ${name} из холодильника → в кастрюлю`;
    if (step.type === 'boil' && mine) return `Положить ${name} в кастрюлю на плите`;
    if (step.type === 'season') {
      const n = s.dishes[dishId].season.target, g = s.recipes[dishId]?.grams;
      return `Посолить (${tsp(n.salt)}) и поперчить (${tsp(n.pepper)})${g ? ` — на ${gramsText(g)}` : ''}`;
    }
    return step.label;
  }

  _renderHud(s) {
    const d = s.day;
    this._set('hud-day', s.practice ? 'Свободная практика' : `День ${d.id} из 7 · ${esc(d.title.toLowerCase())}`);
    const id = s.activeDish();
    this._set('hud-ico', s.practice ? '🔪' : s.phase === 'ready' ? '🎉' : ICON[id] ?? (s.day.finalServe ? '🎄' : '🍽'));
    let step = '', dots = '';
    if (s.phase === 'ready') step = 'Всё готово — можно завершать день';
    else if (id) {
      const onFire = new Set(s.burners.filter((b) => b.state !== 'empty').map((b) => b.owner + ':' + b.step));
      const next = s.nextSteps(id).find((st) => !(st.type === 'boil' && onFire.has(id + ':' + st.id)));
      step = next ? esc(this._stepText(s, id, next)) : esc(s.recipes[id].name);
      const steps = s.recipes[id].steps.filter((st) => s.stepState(id, st.id) !== 'skipped');
      dots = steps.map((st) => `<i class="${s.stepState(id, st.id) === 'done' ? 'on' : next && st.id === next.id ? 'next' : ''}"></i>`).join('');
    } else if (s.day.finalServe) step = 'Расставь все 10 блюд на праздничном столе';
    this._set('hud-step', step);
    this._set('hud-dots', dots);
    const dishes = Object.values(s.dishes);
    this._set('hud-dishes', !s.practice && dishes.length > 1 ? dishes.map((x) => `<span class="${x.done ? 'done' : x.id === id ? 'cur' : ''}">${ICON[x.id]} ${esc(x.recipe.short)}</span>`).join('') : '');
    this._set('hud-wish', s.requests.filter((r) => r.known && (!id || r.recipe === id)).map((r) => `🙏 ${esc(s.wishLabel(r))}`).join(' · '));
    $('#hud-clock').textContent = fmt(s.t);
    // активные таймеры: кастрюли, горячее, духовка, курьер
    const timers = [];
    for (const b of s.burners) {
      if (b.state === 'boiling') timers.push(`<span class="timer">${PICON[b.product]} ${b.readyAt - s.t > 5000 ? '🔥?' : '≈ ' + kmin(b.readyAt - s.t)}</span>`);
      else if (b.state === 'ready') timers.push(`<span class="timer done">${PICON[b.product]} готово</span>`);
    }
    for (const x of s.hotList()) timers.push(`<span class="timer hot">${PICON[x.product]} горячо ещё ${kmin(x.left)}</span>`);
    if (s.oven.state === 'baking') timers.push(`<span class="timer">🍗 ≈ ${kmin(s.oven.readyAt - s.t)}</span>`);
    if (s.delivery.order) timers.push(`<span class="timer">🛵 ${({ accepted: 'принят', assembling: 'собирают', onTheWay: 'в пути', arrived: 'у двери', collecting: 'забираем' })[s.delivery.order.status]}</span>`);
    this._set('hud-timers', timers.join(''));
    $('#btn-finish').classList.toggle('hidden', s.phase !== 'ready' || !!s.practice);
    const badge = $('#phone-badge');
    badge.classList.toggle('hidden', !s.phone.unread);
    badge.textContent = s.phone.unread;
    $('#btn-mute').textContent = this.app.isMuted() ? '🔇' : '🔊';
    $('#btn-phone').classList.toggle('hidden', !!s.practice);
    const meta = $('#hud-meta');
    meta.classList.toggle('hidden', !!s.practice);
    if (!s.practice) {
      const h = Math.round(s.catNeeds.hunger);
      const catTxt = s.cat.state === 'eat' ? 'ест' : s.cat.state === 'play' ? 'играет' : s.catCalm() ? 'спит' : h >= CAMPAIGN.cat.theftAt ? 'ищет еду' : h >= CAMPAIGN.cat.warnAt ? 'голоден' : 'бродит';
      const cls = h >= CAMPAIGN.cat.theftAt ? 'bad' : h >= CAMPAIGN.cat.warnAt ? 'warn' : '';
      const hands = s.carry ? `<span class="chip2 hands" title="В руках">✋ ${PICON[s.carry.product] ?? ''} ${esc(PRODUCTS[s.carry.product].name.toLowerCase())}${s.carry.peeled ? ' · почищено' : ''}</span>` : '';
      this._set('hud-meta', `${hands}<span class="chip2" title="Голод кота">🐱 ${catTxt} <span class="cat-bar"><i class="${cls}" style="width:${h}%"></i></span></span><span class="chip2" title="Бюджет дня">💰 ${s.wallet.budget - s.wallet.spent} ₽</span>`);
    }
  }

  _renderLabels(s) {
    const closeup = CLOSEUP_STATIONS.has(s.panel) || s.practice;
    // 0.10: станция, которую откроет пробел, — подписана и с клавишей «␣»
    const near = s.panel ? null : s.nearStation();
    for (const [id, el] of Object.entries(this.labelEls)) {
      const show = !closeup && !s.heroine.away && s.phase !== 'finished' && s.stationAvailable(id);
      el.classList.toggle('near', show && id === near);
      if (!show) {
        el.style.display = 'none';
        continue;
      }
      const p = this.view.stationScreen(id);
      el.style.display = p.visible ? '' : 'none';
      el.style.left = `${p.x}%`;
      el.style.top = `${p.y}%`;
      const urgent = s.alerts.some((a) => a.station === id && (a.urgent || a.key === 'potReady' || a.key === 'puddle'));
      el.classList.toggle('urgent', urgent);
      el.classList.toggle('here', s.heroine.station === id && !s.heroine.target);
      el.classList.toggle('hover', this.view.hover === id);
    }
  }

  _renderAlerts(s) {
    // в крупном плане срочное остаётся карточкой, остальное — значками: руки и продукт важнее
    this.el.alerts.classList.toggle('compact', !!s.panel && CLOSEUP_STATIONS.has(s.panel));
    const ids = new Set();
    for (const a of s.alerts) {
      ids.add(a.id);
      let el = this.alertEls.get(a.id);
      if (!el) {
        el = document.createElement('div');
        el.className = `alert ${a.urgent ? 'urgent' : ''}`;
        const icon = { cat: '🐱', spillWarn: '🐱', catBored: '🧶', toys: '🧸', tree: '🎄', pot: '♨️', oven: '🍗', potReady: '🥔', garland: '💡', star: '⭐', radio: '📻', phone: '📱', delivery: '🛵', puddle: '💧' }[a.key] ?? '❗';
        let acts = '';
        // 0.11: пилюля — короткий текст, подробности по наведению, кнопка-стрелка вместо слов «Подойти»/«Открыть»
        const go = (label) => `<button class="go" data-a="${a.action === 'collect' ? 'collect' : 'go'}" data-s="${a.station ?? ''}" title="${label}" aria-label="${label}">→</button>`;
        if (a.action === 'shoo') acts = `<span class="wave-hint" title="Помаши мышью над котом">👋</span><button class="shout" data-a="shout" title="Крикнуть: F (получится не всегда)" aria-label="Крикнуть">📣</button><button class="chase" data-a="chase" title="Отогнать самой: подбежать к коту" aria-label="Отогнать самой">🏃</button>`;
        else if (a.action === 'collect') acts = go('Забрать заказ');
        else if (a.station) acts = go(a.phone ? 'Открыть' : 'Подойти');
        if (!a.urgent && a.dismissable !== false) acts += `<button class="ghost" data-a="dismiss" title="Скрыть" aria-label="Скрыть">×</button>`;
        el.title = a.detail ?? a.text;
        el.innerHTML = `<div class="ico">${icon}</div><div class="txt">${esc(a.text)}</div><div class="acts">${acts}</div>${a.deadline != null ? '<div class="timer"><i></i></div>' : ''}`;
        el.querySelectorAll('button').forEach((b) =>
          b.addEventListener('click', () => {
            this.sound.unlock();
            if (b.dataset.a === 'shoo') this.act('shoo');
            else if (b.dataset.a === 'shout') this.act('shout');
            else if (b.dataset.a === 'chase') this.act('chaseCat');
            else if (b.dataset.a === 'collect') this.act('collectOrder');
            else if (b.dataset.a === 'go') {
              // ответ на комментарий: телефон откроется сразу на ветке
              if (a.open) this.phoneNext = a.open;
              if (a.open && this.app.session?.panel === 'phone') this.openPhone();
              else this.act('goTo', b.dataset.s);
            }
            else this.act('dismissAlert', a.id);
          }),
        );
        // в сжатом виде значок — сама кнопка: клик по нему делает главное действие карточки
        el.querySelector('.ico').addEventListener('click', () => el.classList.contains('urgent') || el.querySelector('.acts button')?.click());
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
    // 0.10: ёлка — зажать игрушку в коробке и тянуть на ветку; второй клик по фишке в руке — положить обратно
    p.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('[data-drag-toy]');
      if (!chip || chip.disabled) return;
      e.preventDefault();
      this.sound.unlock();
      const uid = +chip.dataset.dragToy;
      const wasHand = this.app.session?.treeHand === uid;
      this.act('pickToy', uid);
      if (!wasHand) this.startToyDrag(uid, e, null);
    });
    window.addEventListener('pointermove', (e) => {
      const d = this.toyDrag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) {
        d.moved = true;
        this.el.ghost.innerHTML = `<span class="toy-ghost">${TOYS[d.id]?.icon ?? ''}</span>`;
        this.el.ghost.classList.remove('hidden');
      }
      if (d.moved) {
        this._moveGhost(e);
        if (!d.floor) this.app.toyHover(e);
      }
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.toyDrag;
      if (!d) return;
      this.toyDrag = null;
      if (d.floor) {
        // игрушка с пола (0.11): клик по ней или перетаскивание в коробку (на док) — подобрана; отпустила мимо — осталась лежать
        this.el.ghost.classList.add('hidden');
        if (!d.moved || e.target?.closest?.('#panel')) this.act('pickUpToy', d.uid);
        return;
      }
      if (!d.moved) return; // просто клик — игрушка осталась в руке, вешаем следующим кликом по ёлке
      this.el.ghost.classList.add('hidden');
      this.app.dropToy(e, d.back);
    });
    // 0.11: посудомойка — зажать фишку посуды и перетащить в проём; клик по фишке берёт её в руку, нажатие в проёме кладёт
    p.addEventListener('pointerdown', (e) => {
      const chip = e.target.closest('[data-drag-dw]');
      if (!chip || chip.disabled) return;
      e.preventDefault();
      this.sound.unlock();
      const item = chip.dataset.dragDw;
      const was = this.app.session?.dishwasher.hand === item;
      if (!was) this.act('dwPick', item);
      this.dwDrag = { item, x0: e.clientX, y0: e.clientY, moved: false, was, icon: WASH_ICON[item] ?? '🍽' };
    });
    window.addEventListener('pointermove', (e) => {
      const d = this.dwDrag;
      if (!d) return;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8) {
        d.moved = true;
        this.el.ghost.innerHTML = `<span class="toy-ghost">${d.icon}</span>`;
        this.el.ghost.classList.remove('hidden');
      }
      if (!d.moved) return;
      this._moveGhost(e);
      const p = this._dwLocal(e);
      this.view.dwHot = !!p && this.app.session?.dishwasher.door === 'open' && inCavity(p.x, p.z, CAMPAIGN.dishwasher.drop);
    });
    window.addEventListener('pointerup', (e) => {
      const d = this.dwDrag;
      if (!d) return;
      this.dwDrag = null;
      this.view.dwHot = false;
      if (!d.moved) {
        if (d.was) this.act('dwPick', d.item); // второй клик по той же фишке — убрать из руки
        return;
      }
      this.el.ghost.classList.add('hidden');
      const p = this._dwLocal(e);
      if (p) this.act('dwDrop', d.item, p.x, p.z);
      else this.act('dwDrop', d.item, 99, 99);
    });
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
    // крутилка огня: зажала и ведёшь по кругу — 30° на деление
    p.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('[data-knob]');
      if (!k) return;
      e.preventDefault();
      this.sound.unlock();
      const r = k.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const i = +k.dataset.knob;
      this.knob = { i, cx, cy, a0: Math.atan2(e.clientY - cy, e.clientX - cx), h0: +(k.querySelector('span')?.textContent ?? 0), last: null };
    });
    window.addEventListener('pointermove', (e) => {
      const k = this.knob;
      if (!k) return;
      let d = Math.atan2(e.clientY - k.cy, e.clientX - k.cx) - k.a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      k.acc = (k.acc ?? 0) + d;
      k.a0 += d;
      const h = Math.max(0, Math.min(CAMPAIGN.stove.maxHeat, Math.round(k.h0 + (k.acc * 180) / Math.PI / 30)));
      if (h !== k.last) {
        k.last = h;
        this.act('setHeat', k.i, h);
      }
    });
    window.addEventListener('pointerup', () => (this.knob = null));
    window.addEventListener('pointermove', (e) => this.dragDish && this._moveGhost(e));
    window.addEventListener('pointerup', (e) => {
      if (!this.dragDish) return;
      const id = this.dragDish;
      this.dragDish = null;
      this.el.ghost.classList.add('hidden');
      this.app.dropDish(id, e);
    });
  }

  /** Начать перетаскивание игрушки uid из руки (откуда её сняли, помнит сессия: session.treeFrom). */
  startToyDrag(uid, e, back = null) {
    const t = this.app.session?.toys.find((x) => x.uid === uid);
    this.toyDrag = { uid, id: t?.id, back, x0: e.clientX, y0: e.clientY, moved: false };
  }

  /** 0.11: нажали на игрушку, лежащую на полу: отпустила на месте (клик) или над доком (в коробку) — подобрана. */
  startFloorDrag(uid, e) {
    const t = this.app.session?.toys.find((x) => x.uid === uid);
    this.toyDrag = { uid, id: t?.id, floor: true, x0: e.clientX, y0: e.clientY, moved: false };
  }

  _moveGhost(e) {
    this.el.ghost.style.left = `${e.clientX}px`;
    this.el.ghost.style.top = `${e.clientY}px`;
  }

  /** Точка отпущенной фишки на плоскости дверцы посудомойки (локальные метры) или null — курсор вне сцены или над панелью. */
  _dwLocal(e) {
    const c = this.view.sv.canvas, r = c.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom || e.target?.closest?.('#panel')) return null;
    return this.view.pickLocal({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, 'dishwasher');
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
        return `${base}|${s.board.current}|${s.boardTasks().map((t) => t.key + t.state + t.started).join(',')}|${it?.missing.length}|${s.transferBlock()}|${it?.cuts}|${it?.cutReady}|${it?.grater?.done}|${s.equipment.bowl.clean}|${s.bowl.owner}`;
      }
      case 'bowl': {
        const mt = s.mixTarget();
        const se = s.bowl.owner && s.dishes[s.bowl.owner]?.season;
        const ph = s.bowl.owner && s.seasonState(s.bowl.owner);
        return `${base}|${s.bowlTasks().map((t) => t.stepId + t.state + (t.block ?? '')).join(',')}|${mt?.ok}|${s.equipment.bowl.clean}|${se ? se.salt + ':' + se.pepper + ':' + se.tastes + (se.last?.verdict ?? '') : ''}|${s.bowlHand()}|${ph?.phase}|${ph?.unmixed}`;
      }
      case 'tray': {
        const id = s.tray.owner;
        const d = id ? s.dishes[id] : null;
        const extra = id === 'shuba' && d?.work ? `${d.work.layers.length}|${d.work.current?.comp}|${d.work.current?.placed}|${s.shubaComponents().map((c) => +c.available).join('')}` : '';
        return `${base}|${id}|${s.trayDishes().map((x) => x + s.trayBlock(x)).join(',')}|${d ? d.recipe.steps.map((st) => +s.stepDone(id, st.id)).join('') : ''}|${s.tool}|${s.canConfirm(id ?? '')?.ok}|${extra}|${s.workPlate.owner}`;
      }
      case 'stove':
        return `${base}|${s.burners.map((b) => b.state + !!b.overflow + b.product + ':' + (b.heat ?? 0)).join()}|${s.stoveTasks().map((t) => t.stepId).join()}`;
      case 'catbowl':
        return `${base}|${s.cat.state}|${s.catCalm()}|${s.catTool}`;
      case 'oven':
        return `${base}|${s.oven.state}|${s.dishes.chicken?.steps.marinade.done}|${s.dishes.chicken?.done}`;
      case 'sink':
        return `${base}|${s.dirtyItems().map((x) => x.id).join(',')}|${s.sinkJob?.item}|${s.hotList().map((x) => x.product).join()}|${s.sinkCool?.product}`;
      case 'dishwasher': {
        const d = s.dishwasher;
        return `${base}|${d.door}|${d.loaded.join()}|${!!d.run}|${d.hand}|${s.dirtyItems().map((x) => x.id).join()}`;
      }
      case 'radio':
        return `${base}|${s.radio.broken}|${s.radio.enabled}`;
      case 'garland':
        return `${base}|${s.garland.broken}`;
      case 'tree':
        return `${base}|${s.star.broken}|${s.giftsLeft().map((i) => `${i}:${Math.round(s.giftProgress(i) * 3)}`).join()}|${s.toys.map((x) => `${x.uid}:${x.at ? 1 : 0}:${+x.fallen}`).join()}|${s.treeHand}|${s.gift ? `${s.gift.index}:${s.gift.stage}` : ''}|${s.giftShow ? 'show' : ''}|${s.treeFall.down ? 'down' : ''}|${s.tinsel.tool}|${s.tinselColors().map((c) => `${c}${Math.round(s.tinselLeft(c) * 10)}`).join()}|${s.tinsel.threads.length}`;
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
    const lift = p.querySelector('.lift-bar i');
    if (lift) lift.style.width = `${Math.round(s.treeLiftProgress() * 100)}%`;
    const live = p.querySelector('[data-live]');
    if (live) live.innerHTML = this._live(s);
    for (const el of p.querySelectorAll('[data-burner]')) {
      const b = s.burners[+el.dataset.burner];
      const txt = b ? burnerStatus(s, b) : '';
      if (el.textContent !== txt) el.textContent = txt;
    }
  }

  // Часто меняющиеся показатели без пересборки панели.
  _live(s) {
    switch (s.panel) {
      case 'board': {
        const it = s.boardCur();
        if (!it) return '';
        if (it.grater) return `<span class="qbar"><i style="width:${(it.grater.done / it.grater.cycles) * 100}%"></i></span><span>Натёрто ${it.grater.done} из ${it.grater.cycles}</span>`;
        if (it.peel) {
          const c = it.peel.coverage() / CAMPAIGN.peel.complete;
          return `<span class="qbar"><i style="width:${Math.min(100, c * 100)}%"></i></span><span class="q">Почищено ${Math.min(100, Math.round(c * 100))} %</span><span>зажми и веди ножом по кожуре</span>`;
        }
        const q = s.boardQuality(it);
        const block = s.transferBlock(it);
        return `<span class="qbar" title="Аккуратность"><i style="width:${Math.round(q.score * 100)}%"></i></span><span class="q">${it.cuts ? `Ровно на ${Math.round(q.score * 100)} %` : 'Ещё ни одного разреза'}</span><span>кусочков: ${it.pieces?.length ?? it.log.segments.length}${it.body && q.neat ? ` · кубиков: ${q.neat}` : ''}</span>${block && it.cuts ? `<span>· ${esc(block)}</span>` : it.body ? '<span>· A/D — повернуть доску</span>' : ''}`;
      }
      case 'bowl': {
        const p = s.bowl.pouring;
        if (p) {
          const a = p.tracker.amount;
          if (p.squeeze) return `<span class="qbar"><i style="width:${Math.min(100, (a / 1.4) * 100)}%"></i></span><span class="q">Майонез: ${a < p.need ? 'маловато' : a < s.cfg.pour.mayo.light ? 'поменьше' : a < 1.3 ? 'как обычно' : 'щедро'}</span><span>зажми и веди над миской, отпусти — хватит</span>`;
          return `<span class="qbar"><i style="width:${Math.min(100, (a / p.need) * 100)}%"></i></span><span class="q">${esc(PRODUCTS[p.product].name)}: высыпано ${Math.round(Math.min(1, a / p.need) * 100)} %</span><span>зажми и веди банку над миской</span>`;
        }
        if (s.bowl.shaker) {
          const se = s.dishes[s.bowl.shaker.dishId].season;
          const k = s.bowl.shaker.kind;
          const gr = s.recipes[s.bowl.shaker.dishId]?.grams;
          return `<span class="q">${k === 'salt' ? '🧂 Соль' : '🌶 Перец'}: ${tspText(se[k])} из ${tsp(se.target[k])}${gr ? ` · на ${gramsText(gr)}` : ''}</span><span>клик над миской или взмах вниз-вверх — ⅛ ч. л. за раз</span>${se.last ? tasteScale(se.last) : ''}`;
        }
        const mt = s.mixTarget();
        const ph = s.bowl.owner && s.seasonState(s.bowl.owner);
        if (ph?.phase === 'spice') {
          const n = ph.target, r = s.recipes[s.bowl.owner]?.season;
          const wish = r && (n.salt !== r.salt || n.pepper !== r.pepper) ? ' · гости попросили' : '';
          return `<span class="q">1. Посоли и поперчи: 🧂 ${tsp(n.salt)} · 🌶 ${n.pepper ? tsp(n.pepper) : 'без перца'}${s.recipes[s.bowl.owner]?.grams ? ` на ${gramsText(s.recipes[s.bowl.owner].grams)}` : ''}${wish}</span><span>клик над миской — ⅛ ч. л. → 2. перемешай → 3. попробуй</span>`;
        }
        if (mt?.ok) {
          const m = Math.min(1, s.mixTurns() / CAMPAIGN.mix.turnsRequired);
          return `<span class="qbar"><i style="width:${m * 100}%"></i></span><span class="q">Однородность ${Math.round(m * 100)} %</span><span>зажми и веди ложку по кругу</span>`;
        }
        if (ph?.phase === 'taste' && ph.unmixed > 0) {
          const t = s.bowl.restir ? Math.min(1, s.bowl.restir.turns / ph.unmixed) : 0;
          return `<span class="qbar"><i style="width:${t * 100}%"></i></span><span class="q">Досолила — перемешай ещё оборот</span><span>потом попробуй</span>`;
        }
        const se = s.bowl.owner && s.dishes[s.bowl.owner]?.season;
        if (ph?.phase === 'taste') return se?.last ? `<span class="q">Проба: ${esc(se.last.verdict)}</span>${tasteScale(se.last)}${se.last.ok ? '<span>— можно подавать: «✓ Вкус готов»</span>' : se.last.ds > 0 || se.last.dp > 0 ? '<span>— спаси: «🥔 Досыпать картошки»</span>' : '<span>— добавь ⅛ ч. л. и перемешай</span>'}` : '<span class="q">3. Попробуй ложкой</span><span>соль разошлась — проба честная</span>';
        return mt?.block ? `<span>${esc(mt.block)}</span>` : '';
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
        if (lay === 'canape') return `Стопок: ${w.stacks.filter((b) => b.pieces.length >= CAMPAIGN.canape.minStack).length} из ${w.stacks.length} · на шпажке: ${w.stacks.filter((b) => b.pierced).length} · ${s.tool === 'skewer' ? 'зажми над стопкой и протяни вниз' : 'хлеб — первым, сверху остальное'}`;
        if (s.workPlate.owner === id) return `Начинка на тарелке: ${Math.round(s.workPlate.amount * 100) / 100} · в ложке: ${s.spoon.load ? 'да' : 'нет'}`;
        return '';
      }
      case 'sink':
        if (s.sinkCool) {
          const k = Math.min(1, s.sinkCool.run / CAMPAIGN.cool.underTap);
          return `<span class="qbar"><i style="width:${k * 100}%"></i></span><span class="q">${s.sinkCool.open ? 'Вода льётся — остывает' : 'Зажми над раковиной — откроется кран'} · ${Math.round(k * 100)} %</span>`;
        }
        return s.sinkJob ? `Моем: ${esc(s.equipment[s.sinkJob.item].label)} · Чистота: ${Math.round(s.sinkJob.scrub.progress * 100)} %` : '';
      case 'dishwasher': {
        const d = s.dishwasher;
        const names = (list) => list.map((id) => s.equipment[id].label.toLowerCase()).join(', ');
        if (d.run) {
          const k = 1 - s.dwLeft() / s.dwCycleSec();
          return `<span class="qbar"><i style="width:${Math.max(0, Math.min(1, k)) * 100}%"></i></span><span class="q">Идёт цикл · ещё ${kitchenMin(s.dwLeft(), CAMPAIGN.kitchenScale)}</span><span>${esc(names(d.loaded))} — внутри, недоступно</span>`;
        }
        if (d.door === 'open') return d.hand ? `<span class="q">${esc(s.equipment[d.hand].label)} в руке</span><span>отпусти фишку над проёмом</span>` : '<span class="q">Дверца открыта</span><span>перетащи посуду в проём, потом подними дверцу вверх</span>';
        if (d.loaded.length) return `<span class="q">В машине: ${esc(names(d.loaded))}</span><span>нажми кнопку на дверце или «Запустить»</span>`;
        if (d.done && s.t - d.done.at < 25) return `<span class="q">Готово: ${esc(names(d.done.items))}</span><span>всё чистое и снова на месте</span>`;
        return s.dirtyItems().length ? '<span class="q">Потяни ручку вниз — дверца откроется</span>' : '<span class="small">Вся посуда чистая — загружать нечего.</span>';
      }
      case 'puddle': {
        const p = s._activePuddle();
        return p ? `Вытерто: ${Math.round(p.mask.coverage() * 100)} %` : '';
      }
      case 'radio': {
        // шкала-индикатор: «102,4 МГц · Ретро 102» и сила сигнала
        const t = s.radioTuning();
        const lit = s.radio.enabled && !s.radio.broken ? Math.round(t.signal * 4) : 0;
        const bars = [0, 1, 2, 3].map((i) => `<i class="${i < lit ? 'on' : ''}"></i>`).join('');
        let name = 'Шум';
        let cls = 'off';
        if (s.radio.broken) [name, cls] = [`Помехи · ремонт ${Math.round((s.radio.progress / CAMPAIGN.durations.radioHold) * 100)} %`, 'bad'];
        else if (!s.radio.enabled) name = 'Выключено';
        else if (t.tuned) [name, cls] = [t.tuned.name, ''];
        else if (t.signal > 0.02) [name, cls] = [`${t.station.name}…`, 'weak'];
        return `<span class="rf">${formatFreq(t.freq)}</span><span class="rdot">·</span><span class="rs ${cls}">${esc(name)}</span><span class="rbars" title="Сигнал">${bars}</span>`;
      }
      case 'garland':
        return s.garland.broken ? `Контакт: ${Math.round((s.garland.progress / CAMPAIGN.durations.garlandHold) * 100)} %` : '';
      case 'tree':
        if (s.gift) return `Подарок открыт на ${Math.round(s.giftProgress(s.gift.index) * 100)} %`;
        if (s.treeFall.down) return `Ёлка поднята на ${Math.round(s.treeLiftProgress() * 100)} %`;
        if (s.tinsel.tool && s.tinsel.tool !== 'cut') return `${TINSEL[s.tinsel.tool].name}: в мотке ${metres(s.tinselLeft(s.tinsel.tool))}`;
        if (s.tinsel.tool === 'cut') return 'Клик по нитке — снять её и вернуть длину в моток';
        return s.star.broken ? `Контакт: ${Math.round((s.star.progress / CAMPAIGN.durations.starHold) * 100)} %` : '';
      case 'stove':
        return '<span>Сильный огонь — быстрее закипит, но может убежать. Закипело — убавь до 4–5.</span>';
      case 'catbowl':
        if (s.catTool === 'kibble' && s.catFeed) return `<span class="qbar"><i style="width:${Math.round(s.catFeed.amount * 100)}%"></i></span><span class="q">В миске ${Math.round(s.catFeed.amount * 100)} %</span><span>зажми пачку над миской и тряси вниз-вверх</span>`;
        if (s.catTool === 'wand' && s.catPlay) return `<span class="qbar"><i style="width:${Math.round(s.catPlay.progress * 100)}%"></i></span><span class="q">Кот наигрался на ${Math.round(s.catPlay.progress * 100)} %</span><span>зажми и води бантиком по полу</span>`;
        return '<span>Возьми корм или «удочку», потом действуй мышью прямо на кухне</span>';
      case 'oven':
        return s.oven.state === 'baking' ? `Запекание: ${Math.round(s.oven.doneness * 100)} % · готово через ≈ ${kmin(s.oven.readyAt - s.t)}` : '';
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
        const chips = tasks
          .map((t) => {
            const cls = ['prod-chip', t.key === s.board.current ? 'active' : '', t.state === 'done' ? 'done' : '', t.state === 'locked' ? 'locked' : ''].join(' ');
            const lbl = `<span class="pi">${PICON[t.product] ?? '🍽'}</span><span class="pn">${esc(PRODUCTS[t.product].name)}${t.qty > 1 ? ' ×' + t.qty : ''}${t.type === 'grate' ? ' · тёрка' : t.type === 'peel' ? ' · чистка' : t.shape === 'round' ? ' · кружки' : ''}</span>`;
            return this._btn(lbl, 'boardSelect', [t.key], cls, busy || t.state === 'done', t.block ?? '');
          })
          .join('');
        const backBtn = this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)');
        if (!it) return `<h2>🔪 Доска · выбери продукт</h2><div class="dock">${backBtn}<div class="dock-items">${chips || '<span class="small">Сегодня на доске больше нечего делать.</span>'}</div></div>`;
        const block = s.transferBlock();
        const step = s.stepDef(it.dishId, it.stepId);
        const destLabel = s.practice ? 'Оценить' : step.dest === 'bowl' ? '🥣 В миску' : step.dest === 'pieces' ? '🍽 На поднос' : '✓ Готово';
        return `<h2>${it.grater ? '🧀 Тёрка' : it.peel ? '🔪 Чистка' : '🔪 Доска'} · ${esc(PRODUCTS[it.product].name)}${it.qty > 1 ? ' ×' + it.qty : ''}<span class="sub">${esc(s.recipes[it.dishId].name)}</span></h2>
          <div class="dock">${backBtn}<div class="dock-items">${chips}</div>
            <div class="dock-main">
              ${it.body ? this._btn(`⟲ <kbd>${esc(this._keyName('left'))}</kbd>`, 'boardTurn', [1], 'ghost turn', busy, `Повернуть доску против часовой (держи ${this._keyName('left')} — плавно)`) + this._btn(`<kbd>${esc(this._keyName('right'))}</kbd> ⟳`, 'boardTurn', [-1], 'ghost turn', busy, `Повернуть доску по часовой (держи ${this._keyName('right')} — плавно)`) : ''}
              ${it.missing.length ? this._btn('🌭 Взять замену', 'takeReplacement', [], 'danger', busy) : ''}
              ${s.practice ? this._btn('↺ Заново', 'resetPracticeItem', [], '') : ''}
              ${(it.grater && !s.practice) || it.peel ? '' : this._btn(destLabel, 'boardTransfer', [], 'primary big ' + (block ? 'soft-disabled' : it.cutReady ? 'ready-pulse' : ''), busy, block ?? '')}
            </div>
          </div>${it.missing.length ? bar : ''}<div class="dock-live" data-live></div>`;
      }
      case 'bowl': {
        // Док миски: что в руке. Банку высыпают, майонез выдавливают, солонку трясут, ложкой мешают.
        const tasks = s.bowlTasks();
        const hand = s.bowlHand();
        const chip = (icon, name, act, args, cls, dis, title = '') => this._btn(`<span class="pi">${icon}</span><span class="pn">${name}</span>`, act, args, 'prod-chip ' + cls, dis, title);
        const adds = tasks
          .filter((t) => t.type === 'add')
          .map((t) => {
            const done = t.state === 'done';
            return chip(PICON[t.product] ?? '🫙', esc(PRODUCTS[t.product].name) + (t.product === 'mayo' && done && s.dishes[t.dishId].mayo === 'light' ? ' · поменьше' : ''), 'bowlPick', [t.dishId, t.stepId], `${done ? 'done' : ''} ${hand === t.product && !done ? 'active' : ''} ${t.block && !done ? 'locked' : ''}`, busy || done, t.block ?? '');
          })
          .join('');
        const ss = s.bowl.owner ? s.seasonState(s.bowl.owner) : null;
        let season = '', main = '';
        if (ss && ['spice', 'mixing', 'taste'].includes(ss.phase)) {
          const id = s.bowl.owner;
          const dis = busy || !!ss.block;
          const canTaste = ss.phase === 'taste' && !ss.unmixed;
          const tasteWhy = ss.phase !== 'taste' ? 'Сначала перемешай — соль лежит сверху' : ss.unmixed ? 'Досолила — ещё оборот ложкой' : '';
          season = chip('🧂', hand === 'salt' ? `Соль в руке · ${tspText(ss.salt)}` : `Соль · ${tspText(ss.salt)}`, 'seasonPick', [id, 'salt'], hand === 'salt' ? 'active' : '', dis, ss.block ?? 'Взять солонку: потом кликай над миской') + chip('🌶', hand === 'pepper' ? `Перец в руке · ${tspText(ss.pepper)}` : `Перец · ${tspText(ss.pepper)}`, 'seasonPick', [id, 'pepper'], hand === 'pepper' ? 'active' : '', dis, ss.block ?? 'Взять перечницу: потом кликай над миской');
          // пересол спасают отварной картошкой — воду в салат не льют
          const salty = ss.last && (ss.last.ds > 0 || ss.last.dp > 0);
          if (ss.phase === 'taste') season += chip('👅', 'Попробовать', 'seasonTaste', [id], canTaste ? '' : 'locked', dis, tasteWhy) + (salty ? chip('🥔', 'Досыпать картошки', 'seasonDilute', [id], canTaste ? '' : 'locked', dis, tasteWhy || 'Пересолила — досыпь отварной картошки, соли станет меньше') : '');
          if (ss.phase === 'spice') main = this._btn('🥄 Посолено — мешать', 'seasonDone', [id], 'primary big', dis);
          if (ss.phase === 'taste') main = this._btn('✓ Вкус готов', 'seasonDone', [id], 'primary big ' + (canTaste ? '' : 'soft-disabled'), dis, tasteWhy);
        }
        const mt = s.mixTarget();
        const spoon = chip('🥄', 'Ложка', 'bowlSpoon', [], hand === 'spoon' ? 'active' : '', busy);
        const dirty = !s.equipment.bowl.clean ? '<p class="note warn">Миска грязная — помой её у раковины.</p>' : '';
        return `<h2>🥣 Миска${s.bowl.owner ? `<span class="sub">${esc(s.recipes[s.bowl.owner].name)}</span>` : ''}</h2>
          <div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)')}<div class="dock-items">${adds}${season}${mt || hand !== 'spoon' || ss?.phase === 'taste' ? spoon : ''}</div><div class="dock-main">${main}</div></div>
          <div class="row">${bar}</div><div class="dock-live" data-live></div>${dirty}`;
      }
      case 'tray':
        return this._trayPanel(s, back, bar, live, busy);
      case 'stove': {
        const tasks = s.stoveTasks();
        const usable = new Set(s.usableBurners().map((b) => b.i));
        const c = s.carry;
        const canPlace = !!c?.boilStep;
        const burners = s.burners
          .map((b) => {
            const name = STOVE.burners[b.i]?.name ?? `Конфорка ${b.i + 1}`;
            if (!usable.has(b.i)) return `<div class="burner off"><b>${name}</b><span class="bstat">не работает (испытание)</span></div>`;
            let act = '';
            if (b.overflow) act = '<span class="small warn">🔥 убегает — поверни крутилку ниже 6!</span>';
            else if (b.state === 'ready') act = this._btn(`${PICON[b.product]} Достать`, 'takePot', [b.i], 'primary', busy);
            else if (b.state === 'boiling') act = `<span class="small">${PICON[b.product]} ${esc(PRODUCTS[b.product].name)}</span>`;
            else if (b.dirty) act = '<span class="small warn">🧽 залита — потри тряпкой</span>';
            else if (canPlace) act = this._btn(`${PICON[c.product]} Положить сюда`, 'placePot', [b.i, null, null], 'primary', busy, 'В кастрюлю с водой на этой конфорке');
            // крутилка огня: только крутить — зажми и веди по кругу; 0 — выключено, 9 — максимум
            const heat = b.heat ?? 0;
            const knob = `<div class="knob ${heat ? 'on' : ''}" data-knob="${b.i}" style="--a:${-135 + heat * 30}deg" title="Крутилка огня: зажми и поверни по кругу"><i></i><span>${heat}</span></div>`;
            return `<div class="burner ${b.state} ${b.dirty ? 'dirty' : ''}">${knob}<div class="bcol"><b>${name}</b><span class="bstat" data-burner="${b.i}">${burnerStatus(s, b)}</span>${act}</div></div>`;
          })
          .join('');
        const need = !canPlace && tasks.length ? `<p class="note live">Чтобы варить, сначала достань продукт: 🧊 холодильник (яйца, картофель).</p>` : '';
        return `<h2>♨️ Плита<span class="sub">${c ? `в руках: ${PICON[c.product] ?? ''} ${esc(PRODUCTS[c.product].name.toLowerCase())}` : 'четыре конфорки'}</span></h2><div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)')}<div class="burners4">${burners}</div></div><div class="row">${bar}</div>${need}${tasks.length || c || s.burners.some((b) => b.state !== 'empty' || b.dirty) ? '' : '<p class="note live">Сегодня плита не нужна.</p>'}`;
      }
      case 'catbowl': {
        const h = Math.round(s.catNeeds.hunger);
        const k = s.catTool === 'kibble', w = s.catTool === 'wand';
        return `<h2>🐾 Миска кота<span class="sub">голод ${h} %</span></h2><div class="row">${this._btn(`🥣 Корм${k ? ' — в руке' : ''}`, 'catPick', ['kibble'], k ? 'primary' : 'ghost', false, 'Взять пачку корма: потом тряси её над миской')}${this._btn(`🎣 Удочка${w ? ' — в руке' : ''}`, 'catPick', ['wand'], w ? 'primary' : 'ghost', false, 'Взять «удочку с бантиком»: потом води по полу')}${back}</div>${live}<p class="note">Сытый кот спит и не лезет к еде. Игра занимает его на ${CAMPAIGN.cat.playTime} с, но голод растёт.</p>`;
      }
      case 'oven': {
        const ch = s.dishes.chicken;
        const rows = [];
        if (s.oven.state === 'empty' && ch && !ch.done) rows.push(this._btn('🍗 Поставить форму в духовку', 'ovenLoad', [], ch.steps.marinade.done ? 'primary big' : 'soft-disabled', busy));
        if (s.oven.state !== 'empty') rows.push(this._btn(s.oven.state === 'baking' ? 'Достать (ещё рано)' : '🧤 Достать курицу', 'ovenTake', [], s.oven.state === 'baking' ? 'ghost' : 'danger big', busy));
        rows.push(back);
        const stage = { empty: 'Духовка пустая', baking: 'Запекается…', ready: 'Готово — достань!', over: 'Перегревается!', burnt: 'Сгорела' }[s.oven.state];
        return `<h2>🍗 Духовка<span class="sub">${stage}</span></h2><div class="row">${rows.join('')}</div><div class="row">${bar}</div>${live}<p class="note">${ch ? 'Курица запекается около часа (по часам кухни); после сигнала есть окно, чтобы достать.' : 'Сегодня духовка не нужна.'}</p>`;
      }
      case 'dishwasher': {
        const d = s.dishwasher;
        const chip = (icon, label, cls, attrs, title = '') => `<button class="prod-chip ${cls}" ${attrs} title="${esc(title)}"><span class="pi">${icon}</span><span class="pn">${esc(label)}</span></button>`;
        const outside = s.dirtyItems().map((x) => chip(WASH_ICON[x.id] ?? '🍽', x.label, d.hand === x.id ? 'active' : '', `data-drag-dw="${x.id}" ${d.run ? 'disabled' : ''}`, 'Зажми и перетащи в проём'));
        const inside = d.loaded.map((id) => this._btn(`<span class="pi">${WASH_ICON[id] ?? '🍽'}</span><span class="pn">${esc(s.equipment[id].label)}</span>`, 'dwTake', [id], 'prod-chip done', !!d.run, d.run ? 'Идёт цикл' : d.door === 'open' ? 'Достать обратно' : 'Сначала открой дверцу'));
        const why = d.run ? 'Цикл уже идёт' : d.door === 'open' ? 'Сначала закрой дверцу — подними её вверх' : !d.loaded.length ? 'В машине пусто — сначала загрузи посуду' : 'Нажми кнопку на дверце или здесь';
        const go = !d.run && d.door === 'closed' && d.loaded.length > 0;
        return `<h2>🧼 Посудомойка<span class="sub">${d.run ? 'идёт цикл' : d.door === 'open' ? 'дверца открыта' : 'дверца закрыта'}</span></h2><div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)')}<div class="dock-items">${outside.join('')}${inside.join('')}${outside.length || inside.length ? '' : '<span class="small">Вся посуда чистая, загружать нечего.</span>'}</div><div class="dock-main">${this._btn(d.run ? '⏳ Идёт цикл' : '▶ Запустить', 'dwStart', [], 'primary big ' + (go ? 'ready-pulse' : 'soft-disabled'), false, why)}</div></div><div class="dock-live" data-live></div>`;
      }
      case 'sink': {
        const dirty = s.dirtyItems();
        const btns = dirty.map((d) => this._btn(`🧽 ${esc(d.label)}`, 'sinkSelect', [d.id], s.sinkJob?.item === d.id ? 'primary active' : 'ghost', busy)).join('');
        const cool = s.hotList().map((x) => this._btn(`❄️ Под кран: ${PICON[x.product]} ${esc(PRODUCTS[x.product].name.toLowerCase())}`, 'coolPick', [x.product], s.sinkCool?.product === x.product ? 'primary active' : 'primary', busy)).join('');
        return `<h2>🚰 Раковина</h2><div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)')}<div class="dock-items">${cool}${btns || (cool ? '' : '<span class="small">Вся посуда чистая, остужать нечего.</span>')}</div></div><div class="row">${bar}</div>${live}${s.sinkJob ? '<p class="note">Зажми кнопку на посуде и поводи губкой туда-сюда. Грязь смывается, прогресс сохраняется.</p>' : ''}`;
      }
      case 'puddle':
        return `<h2>🧽 Лужа</h2><div class="row">${back}</div>${live}<p class="note">Зажми кнопку и води тряпкой по луже.</p>`;
      case 'radio': {
        // док радио: шкала-индикатор и одна главная кнопка; настройка — только ручкой на самом радио (или колесом над ним)
        const main = s.radio.broken
          ? `<button class="primary big hold-btn" title="Удерживай кнопку мыши или пробел" data-hold="radio" data-act="hold">🎛 Настроить (удерживай)</button>`
          : this._btn(s.radio.enabled ? '⏻ Выключить' : '⏻ Включить', 'toggleRadio', [], s.radio.enabled ? '' : 'primary', busy);
        return `<h2>📻 Радио</h2><div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)')}<div class="dock-items radio-tuner"><div class="radio-readout" data-live></div></div><div class="dock-main">${main}</div></div>`;
      }
      case 'garland':
        return `<h2>💡 Гирлянда</h2><div class="row">${s.garland.broken ? `<button class="primary big hold-btn" title="Удерживай кнопку мыши или пробел" data-hold="garland" data-act="hold">🔌 Поправить контакт (удерживай)</button>` : ''}${back}</div>${live}<p class="note">${s.garland.broken ? 'Удерживай 2 секунды.' : 'Гирлянда горит.'}</p>`;
      case 'tree': {
        // 0.10: подарок в руках — три движения по шагам; «←» (Esc) — отложить, прогресс сохранится
        if (s.gift) {
          const order = ['bow', 'paper', 'lid'];
          const cur = order.indexOf(s.gift.stage);
          const steps = [['🎀', 'Бант'], ['📜', 'Бумага'], ['📦', 'Крышка']]
            .map(([ic, nm], i) => `<span class="gift-step ${i < cur ? 'done' : i === cur ? 'on' : ''}">${i < cur ? '✓' : ic} ${nm}</span>`)
            .join('<span class="gift-sep">›</span>');
          const what = { bow: 'зажми бант и потяни', paper: 'рви бумагу: води по коробке туда-сюда', lid: 'зажми крышку и сдвинь с коробки' }[s.gift.stage];
          return `<h2>🎁 Подарок ${s.gift.index + 1}<span class="sub">${what}</span></h2><div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Отложить подарок (Esc)')}<div class="dock-items gift-steps">${steps}</div></div>${live}`;
        }
        // ёлка (0.9): звезда, подарки дня, игрушки из коробки — выбрать и кликнуть по ветке
        const star = s.star.broken ? `<button class="primary big hold-btn" title="Удерживай кнопку мыши или пробел" data-hold="star" data-act="hold">⭐ Поправить звезду (удерживай)</button>` : '';
        // 0.10: подарок открывают руками — кнопка только берёт его в руки; начатый показывает, сколько осталось
        const gifts = s.giftsLeft().map((i) => {
          const p = s.giftProgress(i);
          return this._btn(`🎁 Подарок ${i + 1}${p > 0 ? ` · ${Math.round(p * 100)} %` : ''}`, 'startGift', [i], 'primary gift-btn', busy, p > 0 ? 'Продолжить открывать' : 'Взять в руки и открыть');
        }).join('');
        // 0.11: игрушки на полу подбирают кликом по каждой или перетаскивая в коробку (кнопки «Поднять игрушки» больше нет)
        const floor = s.toysOnFloor().length;
        const floorNote = floor ? `<span class="small floor-note">🧸 На полу: ${floor} — кликни по игрушке или перетащи её сюда</span>` : '';
        if (s.treeFall.down) {
          // кот уронил ёлку: подними жестом (зажми ствол или верхушку и тяни вверх); пока лежит — вешать нельзя
          return `<h2>🎄 Ёлка упала<span class="sub">зажми ствол или верхушку и потяни вверх</span></h2><div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)')}<div class="dock-items">${gifts}<div class="lift"><div class="progress lift-bar"><i></i></div>${floorNote}</div></div><div class="dock-main">${star}</div></div>${live}`;
        }
        // 0.10: фишку зажимают и тянут на ёлку (data-drag-toy); клик — взять в руку, клик по ёлке — повесить. Одинаковые игрушки — одной фишкой «×N»
        const groups = new Map();
        for (const x of s.toysInBox()) groups.set(x.id, [...(groups.get(x.id) ?? []), x.uid]);
        const box = [...groups].map(([id, uids]) => {
          const uid = uids.includes(s.treeHand) ? s.treeHand : uids[0];
          return `<button class="prod-chip toy-chip ${s.treeHand === uid ? 'active' : ''}" data-drag-toy="${uid}" title="Зажми и перетащи на любое место ёлки" ${busy ? 'disabled' : ''}><span class="pi">${TOYS[id].icon}</span><span class="pn">${esc(TOYS[id].name)}${uids.length > 1 ? ` ×${uids.length}` : ''}</span></button>`;
        }).join('');
        // мишура: моток берут в руку, зажимают на ёлке и ведут; «Снять» — ножницы, клик по нитке
        const tn = s.tinsel;
        const rolls = s.tinselColors().map((c) => `<button class="prod-chip tinsel-chip ${tn.tool === c ? 'active' : ''}" data-act="tinselPick" data-args='${esc(JSON.stringify([c]))}' title="${esc(TINSEL[c].name)}: зажми на ёлке и веди" ${busy ? 'disabled' : ''}><span class="pi">${TINSEL[c].icon}</span><span class="pn">${metres(s.tinselLeft(c))}</span></button>`).join('');
        const scissors = tn.threads.length ? `<button class="prod-chip tinsel-chip ${tn.tool === 'cut' ? 'active' : ''}" data-act="tinselPick" data-args='["cut"]' title="Клик по нитке — снять и вернуть длину в моток" ${busy ? 'disabled' : ''}><span class="pi">✂</span><span class="pn">Снять</span></button>` : '';
        const hung = s.toys.filter((x) => x.at).length;
        const wire = tn.threads.reduce((a, t) => a + s.tinselLength(t.id), 0);
        const sets = Object.entries(TOY_SETS).map(([id, set]) => {
          const pr = s.setProgress(id);
          return `<span class="set-chip ${pr.done ? 'done' : ''}" title="Набор «${esc(set.name)}»${pr.done ? ' собран' : `: весь на ёлке — +${pts(set.reward)}`}">${set.icon} ${pr.hung}/${pr.need}${pr.done ? ' ✓' : ''}</span>`;
        }).join('');
        const note = s.treeHand != null ? 'Кликни по ёлке — повесим. Клик по фишке — положить обратно.' : tn.tool ? 'Зажми кнопку на ёлке и води по веткам.' : box || rolls ? 'Тяни игрушку из коробки на любое место ёлки.' : hung ? 'Висящую игрушку можно перетащить в другое место. Новые — в «Ёлочном базаре» или в подарках.' : 'Игрушки и мишура — в «Ёлочном базаре» в телефоне или в подарках.';
        return `<h2>🎄 Ёлка<span class="sub">на ёлке ${hung}${wire > 0 ? ` · мишуры ${metres(wire)}` : ''}</span><span class="sets-row">${sets}</span></h2><div class="dock">${this._btn('←', 'closePanel', [], 'dock-back', false, 'Назад (Esc)')}<div class="dock-items">${gifts}${box}${rolls}${scissors}${floorNote}${box || rolls || gifts || floorNote ? '' : '<span class="small">В коробке пусто.</span>'}</div><div class="dock-main">${star}</div></div>${live}<p class="note">${note}</p>`;
      }
      case 'fridge': {
        const rows = Object.entries(s.inventory.stock)
          .filter(([, q]) => q > 0 || s.practice)
          .map(([id, q]) => `<span class="chip">${PICON[id] ?? ''} ${esc(PRODUCTS[id].name)}: ${q}${s.inventory.reservedOf(id) ? ` (в работе ${s.inventory.reservedOf(id)})` : ''}</span>`)
          .join(' ');
        const c = s.carry;
        const takes = s.fridgeTasks()
          .map((t) => this._btn(`${PICON[t.product] ?? ''} Достать: ${esc(PRODUCTS[t.product].name.toLowerCase())} ×${t.qty}${t.dest === 'board' ? ' · почистить' : ' · варить'}`, 'fridgeTake', [t.dishId, t.stepId], c ? 'ghost soft-disabled' : 'primary', busy, c ? 'Руки заняты' : 'Из холодильника'))
          .join('');
        const hands = c ? `<div class="row"><span class="chip">✋ В руках: ${PICON[c.product] ?? ''} ${esc(PRODUCTS[c.product].name)} ×${c.qty}${c.peeled ? ' (почищено)' : ''}</span>${c.peeled ? '' : this._btn('↩ Положить обратно', 'fridgeReturn', [], 'ghost', busy)}</div>` : '';
        return `<h2>🧊 Холодильник</h2>${takes ? `<div class="row">${takes}</div>` : ''}${hands}<div class="stock">${rows || 'Пусто'}</div><div class="row">${back}</div><p class="note">Для варки продукт сначала берут в руки. Не хватает — закажи в телефоне: привезённое сразу ложится сюда.</p>`;
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
    const tools = { sandwiches: ['spatula', 'spoon'], eggs: ['knife', 'spoon'], tartlets: ['spoon', 'hand'], tomatoes: ['knife', 'spoon', 'hand'], shuba: ['spatula'], canape: ['hand', 'skewer'], fruit: ['hand'], chicken: ['brush'] }[lay] ?? [];
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
      extra = ch.steps.marinade.done ? `<div class="row">${this._btn('🍗 Отнести в духовку', 'goTo', ['oven'], 'primary', busy)}</div>` : '';
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
      const book = e.target.closest('[data-book]');
      if (book) {
        // книга живёт в телефоне: открыть сразу нужный рецепт
        this.toggleRecipe(false);
        this.phoneNext = 'book|' + book.dataset.book;
        if (this.app.session?.panel === 'phone') this.openPhone();
        else this.act('goTo', 'phone');
      }
    });
  }

  toggleRecipe(force) {
    this.recipeOpen = force ?? !this.recipeOpen;
    if (this.recipeOpen) this._tipDone('recipeOpened');
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
        return `<div class="recipe-dish ${d.done ? 'done' : ''}"><h3>${ICON[d.id]} ${esc(d.recipe.name)} ${d.done ? `<span class="score-pill">${d.Q}</span>` : ''}${LESSONS[d.id] ? `<button class="ghost small-btn" data-book="${d.id}">📖 Подробно</button>` : ''}</h3><div class="small">${esc(d.recipe.look)}</div>${variant}<ul class="steps">${steps}</ul></div>`;
      })
      .join('');
    const extra = s.day.finalServe ? `<div class="recipe-dish"><h3>🎄 Сервировка стола</h3><div class="small">Все 10 блюд — на праздничный стол (${Object.keys(s.table.placed).length}/10).</div></div>` : '';
    this.el.recipe.innerHTML = `<div class="recipe-head"><b>📋 Рецепты дня</b><button class="ghost" data-close>×</button></div>${html}${extra}<p class="small">Картофель, яйца и свёклу варим сами; морковь — уже варёная. Норма соли у каждого блюда своя — пробуй.</p>`;
  }

  // ---------- телефон ----------
  _bindPhone() {
    this.phoneUI = new PhoneUI({ root: this.el.phone, act: (...a) => this.act(...a), sound: this.sound });
  }

  openPhone(app) {
    this.phoneUI.open(app ?? this.phoneNext ?? 'home');
    this.phoneNext = null;
  }

  _renderPhoneLive(s) {
    if (s.panel !== 'phone') {
      this.el.phone.classList.add('hidden');
      return;
    }
    this.phoneUI.render(s);
  }

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
