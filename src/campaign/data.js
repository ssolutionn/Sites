// Данные кампании 0.4: продукты, рецепты, главы, события, оценка.
// Это стартовые проектные параметры (раздел 2.2 ТЗ): меняются здесь, без правки логики.

export const CAMPAIGN = {
  version: '0.5.0',
  saveVersion: 1,

  // --- Время и общие параметры ---
  maxFrameDt: 0.25,
  subStep: 0.05,
  walkSpeed: 2.2,
  knifeDuration: 0.3,
  potatoReadyAfter: 120, // 2:00 после установки кастрюли (поправка тестового билда)
  boilTimes: { potato: 120, egg: 60, beet: 150 }, // у каждой кастрюли свой срок; конфорок две
  burners: 2,
  cool: { time: 25, sinkCool: 1.5 }, // сваренное горячее: ждать или остудить под холодной водой
  minCutFraction: 0.2,
  maxPiecesPerProduct: 150,
  edgeTrimAllowance: 0.1, // до 10 % исходного объёма порции — краевые обрезки без штрафа;
  // для профилей, где эталонной нарезке этого мало, допуск задан в PRODUCTS[*].cut.trim (scripts/calibrate-trims.mjs)
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
    pinch: 0.35, // щепотка соли или перца
    taste: 1.2, // попробовать ложкой
    dilute: 3.5, // разбавить пересоленное
    feedCat: 1.5,
    playCat: 1,
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
  season: { salt: [2, 4], pepper: [1, 2] }, // скрытая «норма» блюда в щепотках

  // Кот как система: голод растёт, сытый кот спит, голодный ищет еду без присмотра
  cat: { hungerStart: 35, rate: 0.42, rateFirstDay: 0.3, theftAt: 70, warnAt: 50, calm: 30, playTime: 45, afterShoo: -12 },

  // Деньги и доставка
  money: {
    modes: {
      express: { label: 'Экспресс', fee: 199, wait: [20, 30] },
      standard: { label: 'Обычная', fee: 79, wait: [45, 75] },
      self: { label: 'Сходить самой', fee: 0, away: 35 },
    },
    thrifty: 0.6, // медаль «экономно» — потрачено не больше 60 % бюджета
  },

  // Темп: ориентир дня — targetMinutes; в пределах ориентира 100, к двойному — 40
  pace: { floor: 40 },
  stars: [55, 75, 90],

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
    weights: { prep: 0.3, comp: 0.2, asm: 0.2, taste: 0.15, wish: 0.15 },
    day: { dishes: 0.75, order: 0.15, pace: 0.1 },
    order: { theft: 6, spillEvent: 6, puddleLeft: 15, garlandLeft: 10, radioLeft: 8, dirtyLeft: 4, hotCut: 3 },
  },
};

// --- Продукты ---
// unit — игровые порции; storage — где хранится; cut — профиль для доски.
export const PRODUCTS = {
  potato: { name: 'Картофель', price: 40, unit: 'порц.', storage: 'pantry', color: 0xf0d28a, cut: { w: 4, d: 3, profile: 'oval' }, grate: true, note: 'варится в кастрюле' },
  carrot: { name: 'Морковь', price: 30, unit: 'порц.', storage: 'fridge', color: 0xf28c28, cut: { w: 4, d: 2, profile: 'carrot', trim: 0.39 }, grate: true, note: 'варёная' },
  sausage: { name: 'Колбаса', price: 180, unit: 'порц.', storage: 'fridge', color: 0xe7909a, cut: { w: 3, d: 3, profile: 'rectangle' }, round: { length: 5, radius: 0.9 } },
  cucumber: { name: 'Огурец', price: 60, unit: 'порц.', storage: 'fridge', color: 0x8cc84b, cut: { w: 5, d: 2, profile: 'oval' }, round: { length: 5, radius: 0.75 } },
  egg: { name: 'Яйцо', price: 15, unit: 'шт.', storage: 'fridge', color: 0xfff6dc, cut: { w: 4, d: 3, profile: 'egg', trim: 0.28 }, note: 'варится в кастрюле' },
  peas: { name: 'Горошек', price: 90, unit: 'банка', storage: 'pantry', color: 0x6dbb3a },
  mayo: { name: 'Майонез', price: 110, unit: 'порц.', storage: 'fridge', color: 0xfffbea },
  crab: { name: 'Крабовые палочки', price: 150, unit: 'упак.', storage: 'fridge', color: 0xf3f0ea, cut: { w: 5, d: 2, profile: 'rectangle' } },
  corn: { name: 'Кукуруза', price: 90, unit: 'банка', storage: 'pantry', color: 0xf4c430 },
  bread: { name: 'Хлеб', price: 10, unit: 'ломтик', storage: 'pantry', color: 0xe3b778, cut: { w: 4, d: 2, profile: 'rectangle' } },
  butter: { name: 'Сливочное масло', price: 160, unit: 'пачка', storage: 'fridge', color: 0xfff1a8 },
  caviar: { name: 'Красная икра', price: 350, unit: 'банка', storage: 'fridge', color: 0xe8461f },
  tartlet: { name: 'Корзинки', price: 20, unit: 'шт.', storage: 'pantry', color: 0xd9a35a },
  cheese: { name: 'Сыр', price: 170, unit: 'порц.', storage: 'fridge', color: 0xf7d55b, cut: { w: 4, d: 2, profile: 'rectangle' }, grate: true },
  greens: { name: 'Зелень', price: 60, unit: 'пучок', storage: 'fridge', color: 0x3f9b3a },
  tomato: { name: 'Помидор', price: 35, unit: 'шт.', storage: 'fridge', color: 0xe23b2e },
  onion: { name: 'Лук', price: 15, unit: 'шт.', storage: 'pantry', color: 0xf3ecd6, cut: { w: 3, d: 2, profile: 'oval' } },
  herring: { name: 'Сельдь', price: 220, unit: 'филе', storage: 'fridge', messy: true, color: 0xc9b6a6, cut: { w: 4, d: 2, profile: 'rectangle' } },
  beet: { name: 'Свёкла', price: 35, unit: 'порц.', storage: 'fridge', messy: true, color: 0x8e1b4a, grate: true, note: 'варится дольше всех' },
  skewer: { name: 'Шпажки', price: 5, unit: 'шт.', storage: 'pantry', color: 0xd8b07a },
  mandarin: { name: 'Мандарин', price: 30, unit: 'шт.', storage: 'pantry', color: 0xff8c1a },
  apple: { name: 'Яблоко', price: 40, unit: 'порц.', storage: 'fridge', color: 0xc8e06a, note: 'дольки подготовлены' },
  grapes: { name: 'Виноград', price: 180, unit: 'гроздь', storage: 'fridge', color: 0x7b3fa0 },
  chicken: { name: 'Курица', price: 400, unit: 'шт.', storage: 'fridge', color: 0xf6d7b0, note: 'подготовлена' },
  marinade: { name: 'Маринад со специями', price: 120, unit: 'порц.', storage: 'fridge', color: 0xb5501e },
};

// Каталог доставки: всё, что можно заказать.
export const CATALOG = Object.keys(PRODUCTS).filter((id) => !['skewer'].includes(id));


// Две порции одного продукта — отдельные шаги (каждая режется/трётся своей серией движений).
function twice(step, label2) {
  return [step, { ...step, id: step.id + '2', label: label2 ?? step.label + ' — вторая порция' }];
}

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
      { id: 'boil', type: 'boil', product: 'potato', qty: 2, label: 'Поставить картофель вариться' },
      { id: 'boilEgg', type: 'boil', product: 'egg', qty: 2, label: 'Поставить яйца вариться' },
      ...twice({ id: 'carrot', type: 'cut', product: 'carrot', shape: 'cube', dest: 'bowl', label: 'Нарезать морковь кубиками' }),
      { id: 'sausage', type: 'cut', product: 'sausage', shape: 'cube', dest: 'bowl', label: 'Нарезать колбасу кубиками' },
      ...twice({ id: 'cucumber', type: 'cut', product: 'cucumber', shape: 'cube', dest: 'bowl', label: 'Нарезать огурец кубиками' }),
      ...twice({ id: 'egg', type: 'cut', product: 'egg', shape: 'cube', dest: 'bowl', requires: ['boilEgg'], label: 'Нарезать яйцо кубиками' }),
      ...twice({ id: 'potato', type: 'cut', product: 'potato', shape: 'cube', dest: 'bowl', requires: ['boil'], label: 'Нарезать картофель кубиками' }),
      { id: 'peas', type: 'add', product: 'peas', label: 'Открыть горошек и добавить' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Заправить майонезом' },
      { id: 'season', type: 'season', requires: ['carrot', 'carrot2', 'sausage', 'cucumber', 'cucumber2', 'egg', 'egg2', 'potato', 'potato2', 'peas', 'mayo'], label: 'Посолить, поперчить и попробовать' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать круговыми движениями' },
    ],
  },
  crab: {
    name: 'Крабовый салат',
    short: 'Крабовый',
    serve: 'saladBowlCrab',
    uses: ['bowl'],
    look: 'Бело-красные кусочки и жёлтая кукуруза',
    steps: [
      { id: 'boilEgg', type: 'boil', product: 'egg', qty: 2, label: 'Поставить яйца вариться' },
      ...twice({ id: 'crab', type: 'cut', product: 'crab', shape: 'cube', dest: 'bowl', label: 'Нарезать крабовые палочки' }),
      ...twice({ id: 'egg', type: 'cut', product: 'egg', shape: 'cube', dest: 'bowl', requires: ['boilEgg'], label: 'Нарезать яйцо кубиками' }),
      { id: 'cucumber', type: 'cut', product: 'cucumber', shape: 'cube', dest: 'bowl', label: 'Нарезать огурец кубиками' },
      { id: 'corn', type: 'add', product: 'corn', label: 'Открыть кукурузу и добавить' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Заправить майонезом' },
      { id: 'season', type: 'season', requires: ['crab', 'crab2', 'egg', 'egg2', 'cucumber', 'corn', 'mayo'], label: 'Посолить, поперчить и попробовать' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать' },
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
      { id: 'boilEgg', type: 'boil', product: 'egg', qty: 3, label: 'Поставить яйца вариться' },
      { id: 'halves', type: 'halves', product: 'egg', items: 3, requires: ['boilEgg'], label: 'Разрезать 3 яйца пополам и вынуть желтки' },
      { id: 'mayo', type: 'add', product: 'mayo', requires: ['halves'], label: 'Добавить майонез к желткам' },
      { id: 'greens', type: 'add', product: 'greens', requires: ['halves'], label: 'Добавить зелень' },
      { id: 'season', type: 'season', requires: ['mayo', 'greens'], label: 'Посолить, поперчить и попробовать' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать начинку' },
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
      { id: 'boilEgg', type: 'boil', product: 'egg', qty: 2, label: 'Поставить яйца вариться' },
      ...twice({ id: 'cheese', type: 'grate', product: 'cheese', dest: 'bowl', label: 'Натереть сыр' }),
      ...twice({ id: 'egg', type: 'cut', product: 'egg', shape: 'cube', dest: 'bowl', requires: ['boilEgg'], label: 'Нарезать яйцо кубиками' }),
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Добавить майонез' },
      { id: 'season', type: 'season', requires: ['cheese', 'cheese2', 'egg', 'egg2', 'mayo'], label: 'Посолить, поперчить и попробовать' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать начинку' },
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
      { id: 'season', type: 'season', requires: ['cheese', 'mayo', 'onion'], label: 'Посолить, поперчить и попробовать' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать начинку' },
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
      { id: 'boil', type: 'boil', product: 'potato', qty: 2, label: 'Поставить картофель вариться' },
      { id: 'boilBeet', type: 'boil', product: 'beet', qty: 2, label: 'Поставить свёклу вариться' },
      ...twice({ id: 'herring', type: 'cut', product: 'herring', shape: 'cube', dest: 'prepared', label: 'Нарезать сельдь' }),
      { id: 'onion', type: 'cut', product: 'onion', shape: 'cube', dest: 'prepared', onion: true, label: 'Нарезать лук (если с луком)' },
      ...twice({ id: 'potato', type: 'grate', product: 'potato', dest: 'prepared', requires: ['boil'], label: 'Натереть картофель' }),
      { id: 'carrot', type: 'grate', product: 'carrot', dest: 'prepared', label: 'Натереть морковь' },
      ...twice({ id: 'beet', type: 'grate', product: 'beet', dest: 'prepared', requires: ['boilBeet'], label: 'Натереть свёклу' }),
      { id: 'layers', type: 'layers', requires: ['herring', 'herring2', 'onion', 'potato', 'potato2', 'carrot', 'beet', 'beet2'], label: 'Собрать слои' },
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
// Продукт варится в этом же рецепте — его порции списаны при установке кастрюли.
export function boiledHere(recipeId, product) {
  return !!RECIPES[recipeId]?.steps.some((x) => x.type === 'boil' && x.product === product);
}

export function stepProducts(recipeId, step, variant) {
  if (step.onion && variant && variant.onion === false) return {};
  if (step.opt && variant && variant[step.opt] === false) return {};
  switch (step.type) {
    case 'cut':
    case 'grate':
      if (boiledHere(recipeId, step.product)) return {};
      return { [step.product]: 1 };
    case 'boil':
    case 'add':
      return { [step.product]: step.qty ?? 1 };
    case 'spread':
      return { bread: step.items, butter: 1 };
    case 'dose':
      return { caviar: 1 };
    case 'halves':
      return boiledHere(recipeId, 'egg') ? {} : { egg: step.items };
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
    case 'season':
      return 'bowl';
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
    intro: 'Первый салат года. Учимся резать на глаз: полоски, поворот R, затем кубики. Конфорок две: поставь картошку (2:00) и яйца (1:00), режь, пока варятся. Сваренное горячее — подожди или остуди под холодной водой. В конце посоли и попробуй.',
    newSkills: ['Клик — разрез', 'R — поворот', 'Две конфорки', 'Остывание', 'Соль и вкус', 'Перемешивание кругами'],
    targetMinutes: 8,
    budget: 300,
    wishes: 0,
    stock: { potato: 2, carrot: 2, sausage: 2, cucumber: 2, egg: 2, peas: 1, mayo: 1 },
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
    intro: 'Крабовый салат: другой набор продуктов. Миска со вчера грязная — помой её у раковины. Кукурузы дома нет: закажи в телефоне и режь, пока едет курьер.',
    newSkills: ['Мытьё посуды', 'Телефон', 'Первый заказ и бюджет', 'Корм для кота', 'Пожелания гостей'],
    targetMinutes: 8,
    budget: 400,
    wishes: 1,
    stock: { crab: 2, egg: 2, cucumber: 1, corn: 0, mayo: 1 },
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
    budget: 700,
    wishes: 1,
    stock: { bread: 6, butter: 1, caviar: 0, egg: 3, mayo: 1, greens: 1 },
    dirty: [],
    events: [{ type: 'cat', when: 'idle', at: 200 }],
    messages: [{ at: 8, from: 'Доставка', text: 'Нужны продукты? Оформите заказ во вкладке «Заказ».' }],
  },
  {
    id: 4,
    title: 'Мелкая работа',
    dishes: ['tartlets', 'tomatoes'],
    intro: 'Тарталетки и фаршированные помидоры. Сердцевину вынимаем ложкой, начинку дозируем. Зелени для украшения нет — закажи. Проверь сообщения от гостей.',
    newSkills: ['Тёрка', 'Удаление сердцевины', 'Дозирование', 'Пожелание без лука'],
    targetMinutes: 9,
    budget: 500,
    wishes: 1,
    stock: { cheese: 3, egg: 2, mayo: 2, tartlet: 8, greens: 0, tomato: 4, onion: 1 },
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
    newSkills: ['Слои', 'Свёкла варится 2:30', 'Грязная доска после сельди', 'Отмена слоя'],
    targetMinutes: 10,
    budget: 500,
    wishes: 1,
    stock: { potato: 2, herring: 2, onion: 1, carrot: 1, beet: 2, mayo: 1 },
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
    intro: 'Канапе на шпажках и фруктовая тарелка. Режем кружочки, перетаскиваем кусочки на шпажки. Винограда нет — закажи. Осторожно со стаканом компота — кот рядом.',
    newSkills: ['Кружочки', 'Сборка шпажек', 'Выкладка', 'Уборка лужи'],
    targetMinutes: 8,
    budget: 600,
    wishes: 1,
    stock: { bread: 1, cheese: 1, sausage: 2, cucumber: 1, skewer: 8, mandarin: 3, apple: 1, grapes: 0 },
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
    intro: 'Маринад закончился — закажи его, а пока курьер едет, начни сервировку стола. Курица запекается 2:30 — не пропусти сигнал духовки!',
    newSkills: ['Маринад', 'Духовка', 'Финальная сервировка'],
    targetMinutes: 9,
    budget: 600,
    wishes: 0,
    stock: { chicken: 2, marinade: 0 },
    dirty: [],
    finalServe: true,
    events: [{ type: 'garland', at: 90 }, { type: 'cat', when: 'idle', at: 60 }],
    messages: [{ at: 20, from: 'Гости', text: 'Выходим! Будем через час 🎉' }],
  },
];

export const DISH_ORDER = ['olivier', 'crab', 'sandwiches', 'eggs', 'tartlets', 'tomatoes', 'shuba', 'canape', 'fruit', 'chicken'];
