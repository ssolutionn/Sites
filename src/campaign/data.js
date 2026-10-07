// Данные кампании 0.4: продукты, рецепты, главы, события, оценка.
// Это стартовые проектные параметры (раздел 2.2 ТЗ): меняются здесь, без правки логики.

export const CAMPAIGN = {
  version: '0.4.0',
  saveVersion: 1,

  // --- Время и общие параметры ---
  maxFrameDt: 0.25,
  subStep: 0.05,
  walkSpeed: 2.2,
  knifeDuration: 0.3,
  potatoReadyAfter: 120, // 2:00 после установки кастрюли (поправка тестового билда)
  minCutFraction: 0.2,
  maxPiecesPerProduct: 150,
  edgeTrimAllowance: 0.1, // до 10 % исходного объёма порции — краевые обрезки без штрафа
  tolerance: { min: 0.75, max: 1.25 },
  roundTarget: { thickness: 0.5, min: 0.32, max: 0.72, minCut: 0.18 },

  durations: {
    placePot: 1,
    takePot: 1,
    reduceHeat: 1,
    replacement: 2,
    addProduct: 1.2,
    pickSpoon: 0.25,
    radioHold: 2,
    garlandHold: 2,
    shooReaction: 0.8,
    ovenLoad: 1.2,
    ovenTake: 1.2,
    awayForDelivery: 3, // героиня за кадром
    unpackItem: 0.6,
  },

  // Ручные механики
  mix: { turnsRequired: 4, minRadius: 0.02, maxRadius: 0.17, minStep: 0.002, maxJump: 0.09 },
  grate: { cyclesPerPortion: 8, zoneTop: -0.035, zoneBottom: 0.035, maxJump: 0.12 },
  spread: { cols: 16, rows: 12, brush: 0.016, complete: 0.8 },
  marinade: { cols: 18, rows: 12, brush: 0.022, complete: 0.75 },
  layer: { cols: 18, rows: 18, brush: 0.03, complete: 0.7 },
  wash: { cols: 14, rows: 10, brush: 0.03, complete: 0.92, autoFinish: 0.92 },
  wipe: { cols: 14, rows: 10, brush: 0.035, complete: 0.92, autoFinish: 0.92 },
  fill: { scoop: 0.34, normalMin: 0.75, normalMax: 1.25, overflow: 1.35 },
  dose: { scoop: 1, normal: 2, max: 3 },

  // Помехи кампании (раздел 11.3)
  events: {
    minUrgentGap: 20,
    maxUrgentFirstDay: 1,
    maxUrgent: 2,
    catWindow: [8, 12],
    potWindow: [12, 18],
    ovenWindow: [20, 30],
    deliveryWait: [45, 75],
  },

  oven: { bake: 150, burnAfter: 60 }, // 2:30 запекания, после окна — перегрев, ещё через 60 с — порча

  scoring: {
    weights: { prep: 0.35, comp: 0.25, asm: 0.25, wish: 0.15 },
    day: { dishes: 0.85, order: 0.15 },
    order: { theft: 5, spillEvent: 5, puddleLeft: 15, garlandLeft: 10, radioLeft: 8, dirtyLeft: 3 },
  },
};

// --- Продукты ---
// unit — игровые порции; storage — где хранится; cut — профиль для доски.
export const PRODUCTS = {
  potato: { name: 'Картофель', unit: 'порц.', storage: 'pantry', color: 0xf0d28a, cut: { w: 3, d: 2, profile: 'oval' }, grate: true, note: 'варится в кастрюле' },
  carrot: { name: 'Морковь', unit: 'порц.', storage: 'fridge', color: 0xf28c28, cut: { w: 4, d: 2, profile: 'carrot' }, grate: true, note: 'варёная' },
  sausage: { name: 'Колбаса', unit: 'порц.', storage: 'fridge', color: 0xe7909a, cut: { w: 3, d: 3, profile: 'rectangle' }, round: { length: 5, radius: 0.9 } },
  cucumber: { name: 'Огурец', unit: 'порц.', storage: 'fridge', color: 0x8cc84b, cut: { w: 4, d: 2, profile: 'oval' }, round: { length: 5, radius: 0.75 } },
  egg: { name: 'Яйцо', unit: 'шт.', storage: 'fridge', color: 0xfff6dc, cut: { w: 3, d: 2, profile: 'egg' }, note: 'сварено и очищено' },
  peas: { name: 'Горошек', unit: 'банка', storage: 'pantry', color: 0x6dbb3a },
  mayo: { name: 'Майонез', unit: 'порц.', storage: 'fridge', color: 0xfffbea },
  crab: { name: 'Крабовые палочки', unit: 'упак.', storage: 'fridge', color: 0xf3f0ea, cut: { w: 5, d: 1, profile: 'rectangle' } },
  corn: { name: 'Кукуруза', unit: 'банка', storage: 'pantry', color: 0xf4c430 },
  bread: { name: 'Хлеб', unit: 'ломтик', storage: 'pantry', color: 0xe3b778, cut: { w: 4, d: 2, profile: 'rectangle' } },
  butter: { name: 'Сливочное масло', unit: 'пачка', storage: 'fridge', color: 0xfff1a8 },
  caviar: { name: 'Красная икра', unit: 'банка', storage: 'fridge', color: 0xe8461f },
  tartlet: { name: 'Корзинки', unit: 'шт.', storage: 'pantry', color: 0xd9a35a },
  cheese: { name: 'Сыр', unit: 'порц.', storage: 'fridge', color: 0xf7d55b, cut: { w: 4, d: 2, profile: 'rectangle' }, grate: true },
  greens: { name: 'Зелень', unit: 'пучок', storage: 'fridge', color: 0x3f9b3a },
  tomato: { name: 'Помидор', unit: 'шт.', storage: 'fridge', color: 0xe23b2e },
  onion: { name: 'Лук', unit: 'шт.', storage: 'pantry', color: 0xf3ecd6, cut: { w: 3, d: 2, profile: 'oval' } },
  herring: { name: 'Сельдь', unit: 'филе', storage: 'fridge', color: 0xc9b6a6, cut: { w: 4, d: 2, profile: 'rectangle' } },
  beet: { name: 'Свёкла', unit: 'порц.', storage: 'fridge', color: 0x8e1b4a, grate: true, note: 'варёная' },
  skewer: { name: 'Шпажки', unit: 'шт.', storage: 'pantry', color: 0xd8b07a },
  mandarin: { name: 'Мандарин', unit: 'шт.', storage: 'pantry', color: 0xff8c1a },
  apple: { name: 'Яблоко', unit: 'порц.', storage: 'fridge', color: 0xc8e06a, note: 'дольки подготовлены' },
  grapes: { name: 'Виноград', unit: 'гроздь', storage: 'fridge', color: 0x7b3fa0 },
  chicken: { name: 'Курица', unit: 'шт.', storage: 'fridge', color: 0xf6d7b0, note: 'подготовлена' },
  marinade: { name: 'Маринад со специями', unit: 'порц.', storage: 'fridge', color: 0xb5501e },
};

// Каталог доставки: всё, что можно заказать.
export const CATALOG = Object.keys(PRODUCTS).filter((id) => !['skewer'].includes(id));

// --- Рецепты ---
// Шаг: id, type, станция выводится из типа, requires — id шагов-предпосылок.
// cut.shape: cube | round; dest: bowl | prepared | pieces.
export const RECIPES = {
  olivier: {
    name: 'Оливье',
    short: 'Оливье',
    serve: 'saladBowl',
    uses: ['bowl'],
    look: 'Разноцветные мелкие кусочки в кремовой заправке',
    steps: [
      { id: 'boil', type: 'boil', product: 'potato', label: 'Поставить картофель вариться' },
      { id: 'carrot', type: 'cut', product: 'carrot', shape: 'cube', dest: 'bowl', label: 'Нарезать морковь кубиками' },
      { id: 'sausage', type: 'cut', product: 'sausage', shape: 'cube', dest: 'bowl', label: 'Нарезать колбасу кубиками' },
      { id: 'cucumber', type: 'cut', product: 'cucumber', shape: 'cube', dest: 'bowl', label: 'Нарезать огурец кубиками' },
      { id: 'egg', type: 'cut', product: 'egg', shape: 'cube', dest: 'bowl', label: 'Нарезать яйцо кубиками' },
      { id: 'potato', type: 'cut', product: 'potato', shape: 'cube', dest: 'bowl', requires: ['boil'], label: 'Нарезать картофель кубиками' },
      { id: 'peas', type: 'add', product: 'peas', label: 'Открыть горошек и добавить' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Заправить майонезом' },
      { id: 'mix', type: 'mix', requires: ['carrot', 'sausage', 'cucumber', 'egg', 'potato', 'peas', 'mayo'], label: 'Перемешать круговыми движениями' },
    ],
  },
  crab: {
    name: 'Крабовый салат',
    short: 'Крабовый',
    serve: 'saladBowlCrab',
    uses: ['bowl'],
    look: 'Бело-красные кусочки и жёлтая кукуруза',
    steps: [
      { id: 'crab', type: 'cut', product: 'crab', shape: 'cube', dest: 'bowl', label: 'Нарезать крабовые палочки' },
      { id: 'egg', type: 'cut', product: 'egg', shape: 'cube', dest: 'bowl', label: 'Нарезать яйцо кубиками' },
      { id: 'cucumber', type: 'cut', product: 'cucumber', shape: 'cube', dest: 'bowl', label: 'Нарезать огурец кубиками' },
      { id: 'corn', type: 'add', product: 'corn', label: 'Открыть кукурузу и добавить' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Заправить майонезом' },
      { id: 'mix', type: 'mix', requires: ['crab', 'egg', 'cucumber', 'corn', 'mayo'], label: 'Перемешать' },
    ],
  },
  sandwiches: {
    name: 'Бутерброды с икрой',
    short: 'Бутерброды',
    serve: 'sandwichPlate',
    uses: ['tray'],
    look: 'Хлеб с видимым слоем масла и красной икрой',
    count: 6,
    steps: [
      { id: 'spread', type: 'spread', product: 'butter', items: 6, label: 'Намазать 6 ломтиков маслом' },
      { id: 'dose', type: 'dose', product: 'caviar', items: 6, requires: ['spread'], label: 'Разложить икру ложкой' },
    ],
  },
  eggs: {
    name: 'Фаршированные яйца',
    short: 'Яйца',
    serve: 'eggPlate',
    uses: ['tray', 'bowl'],
    look: 'Ровные половинки с порцией начинки',
    count: 6,
    steps: [
      { id: 'halves', type: 'halves', product: 'egg', items: 3, label: 'Разрезать 3 яйца пополам и вынуть желтки' },
      { id: 'mayo', type: 'add', product: 'mayo', requires: ['halves'], label: 'Добавить майонез к желткам' },
      { id: 'greens', type: 'add', product: 'greens', requires: ['halves'], label: 'Добавить зелень' },
      { id: 'mix', type: 'mix', requires: ['mayo', 'greens'], label: 'Перемешать начинку' },
      { id: 'fill', type: 'fill', containers: 'eggHalf', items: 6, requires: ['mix'], label: 'Наполнить 6 половинок' },
    ],
  },
  tartlets: {
    name: 'Тарталетки',
    short: 'Тарталетки',
    serve: 'tartletTray',
    uses: ['bowl', 'tray'],
    look: 'Заполненные корзинки с зеленью',
    count: 8,
    steps: [
      { id: 'cheese', type: 'grate', product: 'cheese', dest: 'bowl', label: 'Натереть сыр' },
      { id: 'egg', type: 'cut', product: 'egg', shape: 'cube', dest: 'bowl', label: 'Нарезать яйцо кубиками' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Добавить майонез' },
      { id: 'mix', type: 'mix', requires: ['cheese', 'egg', 'mayo'], label: 'Перемешать начинку' },
      { id: 'fill', type: 'fill', containers: 'tartlet', items: 8, requires: ['mix'], label: 'Разложить начинку по 8 корзинкам' },
      { id: 'garnish', type: 'garnish', product: 'greens', requires: ['fill'], label: 'Украсить зеленью' },
    ],
  },
  tomatoes: {
    name: 'Фаршированные помидоры',
    short: 'Помидоры',
    serve: 'tomatoPlate',
    uses: ['bowl', 'tray'],
    look: 'Открытые помидоры с начинкой и зеленью',
    count: 4,
    onionOption: true,
    steps: [
      { id: 'prep', type: 'tomato', items: 4, label: 'Срезать крышечки и вынуть сердцевину' },
      { id: 'cheese', type: 'grate', product: 'cheese', dest: 'bowl', label: 'Натереть сыр' },
      { id: 'onion', type: 'cut', product: 'onion', shape: 'cube', dest: 'bowl', onion: true, label: 'Нарезать лук (если с луком)' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Добавить майонез' },
      { id: 'mix', type: 'mix', requires: ['cheese', 'mayo', 'onion'], label: 'Перемешать начинку' },
      { id: 'fill', type: 'fill', containers: 'tomato', items: 4, requires: ['prep', 'mix'], label: 'Наполнить помидоры' },
      { id: 'garnish', type: 'garnish', product: 'greens', requires: ['fill'], label: 'Украсить зеленью' },
    ],
  },
  shuba: {
    name: 'Селёдка под шубой',
    short: 'Шуба',
    serve: 'shuba',
    uses: ['tray'],
    look: 'Слоёный салат со свекольным верхом',
    onionOption: true,
    steps: [
      { id: 'boil', type: 'boil', product: 'potato', label: 'Поставить картофель вариться' },
      { id: 'herring', type: 'cut', product: 'herring', shape: 'cube', dest: 'prepared', label: 'Нарезать сельдь' },
      { id: 'onion', type: 'cut', product: 'onion', shape: 'cube', dest: 'prepared', onion: true, label: 'Нарезать лук (если с луком)' },
      { id: 'potato', type: 'grate', product: 'potato', dest: 'prepared', requires: ['boil'], label: 'Натереть картофель' },
      { id: 'carrot', type: 'grate', product: 'carrot', dest: 'prepared', label: 'Натереть морковь' },
      { id: 'beet', type: 'grate', product: 'beet', dest: 'prepared', label: 'Натереть свёклу' },
      { id: 'layers', type: 'layers', requires: ['herring', 'onion', 'potato', 'carrot', 'beet'], label: 'Собрать слои' },
    ],
    layers: ['herring', 'onion', 'potato', 'mayo', 'carrot', 'mayo', 'beet', 'mayo'],
  },
  canape: {
    name: 'Канапе на шпажках',
    short: 'Канапе',
    serve: 'canapePlate',
    uses: ['tray'],
    look: 'Разноцветные устойчивые шпажки',
    count: 8,
    steps: [
      { id: 'bread', type: 'cut', product: 'bread', shape: 'cube', dest: 'pieces', label: 'Нарезать хлеб кубиками' },
      { id: 'cheese', type: 'cut', product: 'cheese', shape: 'cube', dest: 'pieces', label: 'Нарезать сыр кубиками' },
      { id: 'sausage', type: 'cut', product: 'sausage', shape: 'round', dest: 'pieces', label: 'Нарезать колбасу кружочками' },
      { id: 'cucumber', type: 'cut', product: 'cucumber', shape: 'round', dest: 'pieces', label: 'Нарезать огурец кружочками' },
      { id: 'skewers', type: 'skewers', items: 8, requires: ['bread', 'cheese', 'sausage', 'cucumber'], label: 'Собрать 8 шпажек' },
    ],
    skewerSlots: 4,
    sample: ['bread', 'cheese', 'sausage', 'cucumber'],
  },
  fruit: {
    name: 'Фруктовая тарелка',
    short: 'Фрукты',
    serve: 'fruitPlate',
    uses: [],
    look: 'Кольцо из мандаринов, яблок и винограда',
    steps: [{ id: 'fruit', type: 'fruit', min: 12, max: 18, label: 'Почистить мандарины и разложить фрукты' }],
  },
  chicken: {
    name: 'Запечённая курица',
    short: 'Курица',
    serve: 'chicken',
    uses: ['form'],
    look: 'Золотистая курица на блюде',
    steps: [
      { id: 'marinade', type: 'marinade', product: 'marinade', label: 'Покрыть курицу маринадом' },
      { id: 'bake', type: 'bake', requires: ['marinade'], label: 'Запечь в духовке и достать вовремя' },
    ],
  },
};

// Какие продукты расходует каждый шаг (одна порция, если не указано иначе).
export function stepProducts(recipeId, step, variant) {
  if (step.onion && variant && variant.onion === false) return {};
  switch (step.type) {
    case 'cut':
    case 'grate':
      // варёный в этой же кастрюле продукт уже списан при установке кастрюли
      if (RECIPES[recipeId]?.steps.some((x) => x.type === 'boil' && x.product === step.product)) return {};
      return { [step.product]: 1 };
    case 'boil':
    case 'add':
      return { [step.product]: 1 };
    case 'spread':
      return { bread: step.items, butter: 1 };
    case 'dose':
      return { caviar: 1 };
    case 'halves':
      return { egg: step.items };
    case 'fill':
      return step.containers === 'tartlet' ? { tartlet: step.items } : {};
    case 'tomato':
      return { tomato: step.items };
    case 'garnish':
      return { greens: 1 };
    case 'layers':
      return { mayo: 3 };
    case 'skewers':
      return { skewer: step.items };
    case 'fruit':
      return { mandarin: 3, apple: 1, grapes: 1 };
    case 'marinade':
      return { chicken: 1, marinade: 1 };
    default:
      return {};
  }
}

export function stationOfStep(step) {
  switch (step.type) {
    case 'boil':
      return 'stove';
    case 'cut':
    case 'grate':
      return 'board';
    case 'add':
    case 'mix':
      return 'bowl';
    case 'bake':
      return 'oven';
    default:
      return 'tray';
  }
}

// --- Главы ---
// stock — стартовые запасы, dirty — грязная посуда в начале, events — помехи главы.
export const DAYS = [
  {
    id: 1,
    title: 'Начинаем подготовку',
    dishes: ['olivier'],
    intro: 'Первый салат года. Учимся резать на глаз: полоски, поворот R, затем кубики. Картошка готова через 2:00 после установки кастрюли.',
    newSkills: ['Клик — разрез', 'R — поворот', 'Миска и майонез', 'Перемешивание кругами', 'Плита'],
    targetMinutes: 8,
    stock: { potato: 1, carrot: 1, sausage: 2, cucumber: 1, egg: 1, peas: 1, mayo: 1 },
    dirty: [],
    events: [
      { type: 'pot', after: 'boilStart', delay: 70 },
      { type: 'radio', after: 'boilStart', delay: 85 },
      { type: 'cat', when: 'sausageOnBoard', delay: 6 },
    ],
    messages: [{ at: 40, from: 'Верка', text: 'Мы уже у моря. А ты как, всё успеваешь?' }],
  },
  {
    id: 2,
    title: 'Ещё один салат',
    dishes: ['crab'],
    intro: 'Крабовый салат: другой набор продуктов. Миска со вчера грязная — её придётся помыть у раковины. Телефон тоже оживает.',
    newSkills: ['Мытьё посуды', 'Телефон', 'Кукуруза'],
    targetMinutes: 8,
    stock: { crab: 1, egg: 1, cucumber: 1, corn: 1, mayo: 1 },
    dirty: ['bowl'],
    events: [{ type: 'radio', at: 140 }],
    messages: [
      { at: 15, from: 'Верка', text: 'Смотри, какой у нас вид!', photo: 'sea' },
      { at: 90, from: 'Гости', text: 'Мы придём к семи. Чем помочь? 🎄' },
    ],
  },
  {
    id: 3,
    title: 'Первые закуски',
    dishes: ['sandwiches', 'eggs'],
    intro: 'Бутерброды с икрой и фаршированные яйца. Намазываем удержанием мыши, наполняем ложкой. Икры дома нет — закажи доставку в телефоне.',
    newSkills: ['Намазывание', 'Половинки яиц', 'Наполнение', 'Заказ и разбор пакета'],
    targetMinutes: 8,
    stock: { bread: 6, butter: 1, caviar: 0, egg: 3, mayo: 1, greens: 1 },
    dirty: [],
    events: [{ type: 'cat', when: 'idle', at: 200 }],
    messages: [{ at: 8, from: 'Доставка', text: 'Нужны продукты? Оформите заказ во вкладке «Заказ».' }],
  },
  {
    id: 4,
    title: 'Мелкая работа',
    dishes: ['tartlets', 'tomatoes'],
    intro: 'Тарталетки и фаршированные помидоры. Сердцевину вынимаем ложкой, начинку дозируем. Проверь сообщения от гостей.',
    newSkills: ['Тёрка', 'Удаление сердцевины', 'Дозирование', 'Пожелание без лука'],
    targetMinutes: 9,
    stock: { cheese: 2, egg: 1, mayo: 2, tartlet: 8, greens: 2, tomato: 4, onion: 1 },
    dirty: [],
    request: { recipe: 'tomatoes', onion: false },
    events: [{ type: 'radio', at: 200 }],
    messages: [{ at: 5, from: 'Гости', text: 'Можно нам помидоры без лука? Остальное как обычно.', request: true }],
  },
  {
    id: 5,
    title: 'Слой за слоем',
    dishes: ['shuba'],
    intro: 'Селёдка под шубой: тёрка, порядок слоёв и майонез. Последний слой можно отменить. Майонеза на все слои не хватит — закажи.',
    newSkills: ['Слои', 'Распределение соуса', 'Отмена слоя'],
    targetMinutes: 10,
    stock: { potato: 1, herring: 1, onion: 1, carrot: 1, beet: 1, mayo: 1 },
    dirty: [],
    events: [
      { type: 'pot', after: 'boilStart', delay: 60 },
      { type: 'garland', at: 150 },
    ],
    messages: [{ at: 30, from: 'Верка', text: 'Тут даже ёлки на пляже наряжают. Скучаю по нашей кухне!' }],
  },
  {
    id: 6,
    title: 'Красиво разложить',
    dishes: ['canape', 'fruit'],
    intro: 'Канапе на шпажках и фруктовая тарелка. Режем кружочки, перетаскиваем кусочки на шпажки. Осторожно со стаканом компота — кот рядом.',
    newSkills: ['Кружочки', 'Сборка шпажек', 'Выкладка', 'Уборка лужи'],
    targetMinutes: 8,
    stock: { bread: 1, cheese: 1, sausage: 2, cucumber: 1, skewer: 8, mandarin: 3, apple: 1, grapes: 1 },
    dirty: [],
    events: [
      { type: 'cat', when: 'sausageOnBoard', delay: 8 },
      { type: 'spill', at: 120 },
      { type: 'radio', at: 240 },
    ],
    messages: [{ at: 60, from: 'Гости', text: 'Мы купили бенгальские огни! ✨' }],
  },
  {
    id: 7,
    title: 'Последние приготовления',
    dishes: ['chicken'],
    intro: 'Курица в духовке, а пока она запекается — финальная сервировка всего стола. Не пропусти сигнал духовки!',
    newSkills: ['Маринад', 'Духовка', 'Финальная сервировка'],
    targetMinutes: 9,
    stock: { chicken: 2, marinade: 2 },
    dirty: [],
    finalServe: true,
    events: [{ type: 'garland', at: 90 }, { type: 'cat', when: 'idle', at: 60 }],
    messages: [{ at: 20, from: 'Гости', text: 'Выходим! Будем через час 🎉' }],
  },
];

export const DISH_ORDER = ['olivier', 'crab', 'sandwiches', 'eggs', 'tartlets', 'tomatoes', 'shuba', 'canape', 'fruit', 'chicken'];
