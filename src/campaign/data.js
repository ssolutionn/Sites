// Данные кампании 0.4: продукты, рецепты, главы, события, оценка.
// Это стартовые проектные параметры (раздел 2.2 ТЗ): меняются здесь, без правки логики.

export const CAMPAIGN = {
  version: '0.7.0',
  saveVersion: 1,

  // --- Время и общие параметры ---
  maxFrameDt: 0.25,
  subStep: 0.05,
  walkSpeed: 2.2,
  knifeDuration: 0.22, // кружочки: нож прошёл росчерком — короткий удар до доски
  // Доска: единица u = 1 см продукта, целевой кубик оливье — 1 см (st-board.js, raster-cut.js)
  batchGap: 1.2, // зазор между одинаковыми продуктами на доске, см
  board: { turn: 7.5, spin: 1.9 }, // A/D: доворот на четверть оборота (рад/с) и свободное вращение при удержании (рад/с)
  crumbs: { area: 0.12, thick: 0.15 }, // кусок меньше 12 мм² или тоньше 1,5 мм — крошка, осыпается с доски
  cutRules: { angleTolerance: 28, cover: 0.6, maxWobble: 3.8, minLength: 1.2 }, // кружочки: допуски росчерка (gestures.js), см
  potatoReadyAfter: 120, // 2:00 после установки кастрюли (поправка тестового билда)
  boilTimes: { potato: 96, egg: 36, beet: 126 }, // сколько секунд варится после закипания (на огне 6 закипает за ~24 с: итого 2:00 и 1:00); конфорок две
  // Крутилка огня 0–9: вода греется на heatRate·огонь °C/с и остывает на loss·(T−20); на 2 и ниже не закипает.
  // Огонь ≥ foamHeat дольше foamAfter секунд кипения — пена убегает; simmer — «убавить огонь».
  stove: { heatRate: 0.7, loss: 0.02, boilAt: 99.5, simmer: 4, foamHeat: 7, foamAfter: 8, placeHeat: 6, eventHeat: 6, maxHeat: 9 },
  burners: 2,
  cool: { time: 25, sinkCool: 1.5, underTap: 2.5 }, // сваренное горячее: ждать или остудить под холодной водой (держать кран открытым underTap с)
  minCutFraction: 0.2,
  maxPiecesPerProduct: 150,
  edgeTrimAllowance: 0.1, // до 10 % исходного объёма порции — краевые обрезки без штрафа;
  // для профилей, где эталонной нарезке этого мало, допуск задан в PRODUCTS[*].cut.trim (scripts/calibrate-trims.mjs)
  // Кубик: √площади куска в [min, max] см и вытянутость не больше elong (полоска 1×3 — уже не кубик)
  tolerance: { min: 0.65, max: 1.45, elong: 2 },
  roundTarget: { thickness: 1, min: 0.64, max: 1.44, minCut: 0.36 }, // кружочки, см

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
  // Высыпать и выдавить над миской: rate — порции за метр движения руки над миской, need — сколько нужно.
  // Майонез: меньше light — «поменьше майонеза», как просят гости.
  pour: { default: { rate: 5, max: 1, need: 1 }, mayo: { rate: 2.4, max: 1.6, need: 0.45, light: 0.8, squeeze: true } },
  shake: { amplitude: 0.03, minInterval: 0.22, tapTime: 0.45 }, // солонка: взмах не меньше 3 см, не чаще ~4 раз в секунду; клик над миской короче tapTime — тоже щепотка
  restir: 1, // досолила после перемешивания — ещё оборот ложкой, иначе проба обманет
  // Чистка ножом: кисть — ширина снятой полоски кожуры (м), complete — сколько поверхности очистить
  peel: { cols: 26, rows: 22, brush: 0.017, amount: 0.7, complete: 0.86 },
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
  potato: { name: 'Картофель', price: 40, unit: 'порц.', storage: 'pantry', color: 0xf0d28a, cut: { w: 8, d: 6, profile: 'oval' }, grate: true, peel: 0x9a7448, peelDone: ['Картофелина почищена', 'Картошка почищена'], note: 'варится в мундире, потом чистим' },
  carrot: { name: 'Морковь', price: 30, unit: 'порц.', storage: 'fridge', color: 0xf28c28, cut: { w: 13, d: 3.4, profile: 'carrot' }, grate: true, note: 'варёная' },
  sausage: { name: 'Колбаса', price: 180, unit: 'порц.', storage: 'fridge', color: 0xe7909a, cut: { w: 8, d: 6, profile: 'rectangle' }, round: { length: 10, radius: 1.8 } },
  cucumber: { name: 'Огурец свежий', price: 60, unit: 'шт.', storage: 'fridge', color: 0x8cc84b, cut: { w: 12, d: 3.4, profile: 'oval' }, round: { length: 10, radius: 1.5 } },
  pickle: { name: 'Огурец солёный', price: 70, unit: 'шт.', storage: 'fridge', color: 0x8a9a3e, cut: { w: 9, d: 3.2, profile: 'oval' }, note: 'для оливье — солёные или маринованные' },
  egg: { name: 'Яйцо', price: 15, unit: 'шт.', storage: 'fridge', color: 0xfff6dc, cut: { w: 5.6, d: 4.2, profile: 'egg', trim: 0.14 }, peel: 0xe6cba0, peelDone: ['Яйцо почищено', 'Яйца почищены'], note: 'варится в кастрюле, потом чистим' },
  peas: { name: 'Горошек', price: 90, unit: 'банка', storage: 'pantry', color: 0x6dbb3a },
  mayo: { name: 'Майонез', price: 110, unit: 'порц.', storage: 'fridge', color: 0xfffbea },
  crab: { name: 'Крабовые палочки', price: 150, unit: 'упак.', storage: 'fridge', color: 0xf3f0ea, cut: { w: 10, d: 4, profile: 'rectangle' } },
  corn: { name: 'Кукуруза', price: 90, unit: 'банка', storage: 'pantry', color: 0xf4c430 },
  bread: { name: 'Хлеб', price: 10, unit: 'ломтик', storage: 'pantry', color: 0xe3b778, cut: { w: 8, d: 4, profile: 'rectangle' } },
  butter: { name: 'Сливочное масло', price: 160, unit: 'пачка', storage: 'fridge', color: 0xfff1a8 },
  caviar: { name: 'Красная икра', price: 350, unit: 'банка', storage: 'fridge', color: 0xe8461f },
  tartlet: { name: 'Корзинки', price: 20, unit: 'шт.', storage: 'pantry', color: 0xd9a35a },
  cheese: { name: 'Сыр', price: 170, unit: 'порц.', storage: 'fridge', color: 0xf7d55b, cut: { w: 8, d: 4, profile: 'rectangle' }, grate: true },
  greens: { name: 'Зелень', price: 60, unit: 'пучок', storage: 'fridge', color: 0x3f9b3a },
  tomato: { name: 'Помидор', price: 35, unit: 'шт.', storage: 'fridge', color: 0xe23b2e },
  onion: { name: 'Лук', price: 15, unit: 'шт.', storage: 'pantry', color: 0xf3ecd6, cut: { w: 6, d: 4, profile: 'oval' } },
  herring: { name: 'Сельдь', price: 220, unit: 'филе', storage: 'fridge', messy: true, color: 0xc9b6a6, cut: { w: 8, d: 4, profile: 'rectangle' } },
  beet: { name: 'Свёкла', price: 35, unit: 'порц.', storage: 'fridge', messy: true, color: 0x8e1b4a, grate: true, note: 'варится дольше всех' },
  skewer: { name: 'Шпажки', price: 5, unit: 'шт.', storage: 'pantry', color: 0xd8b07a },
  mandarin: { name: 'Мандарин', price: 30, unit: 'шт.', storage: 'pantry', color: 0xff8c1a },
  apple: { name: 'Яблоко', price: 40, unit: 'порц.', storage: 'fridge', color: 0xc8e06a, note: 'дольки подготовлены' },
  grapes: { name: 'Виноград', price: 180, unit: 'гроздь', storage: 'fridge', color: 0x7b3fa0 },
  chicken: { name: 'Курица', price: 400, unit: 'шт.', storage: 'fridge', color: 0xf6d7b0, note: 'подготовлена' },
  marinade: { name: 'Маринад со специями', price: 120, unit: 'порц.', storage: 'fridge', color: 0xb5501e },
};

// Бонусная программа: баллы за покупки и за блюда, тратятся на продукты (до половины заказа) и декор кухни.
export const BONUS = {
  cashback: 0.05, // 5 % от заказа баллами
  perDish: 0.1, // баллов за блюдо = оценка × 0.1
  perPhoto: 5, // за фото блюда в «Андрее»
  payShare: 0.5, // баллами можно оплатить до половины заказа
};

// Декор кухни за баллы: сохраняется между днями и виден в сцене.
export const DECOR = {
  wreath: { name: 'Венок на окно', icon: '🎄', price: 30, note: 'Еловый венок с красными бантами' },
  snowman: { name: 'Снеговик на холодильник', icon: '⛄', price: 20, note: 'Магнит-снеговик' },
  lights: { name: 'Гирлянда-шарики', icon: '🔴', price: 45, note: 'Тёплые шарики над столешницей' },
  cloth: { name: 'Скатерть в клетку', icon: '🟥', price: 35, note: 'Праздничная скатерть на стол' },
  candles: { name: 'Свечи-звёзды', icon: '⭐', price: 25, note: 'Подсвечники на подоконник' },
};

// Витрина доставки сверх нужного: красиво, но не по карману (атмосфера магазина под праздник).
export const STORE_EXTRAS = [
  { name: 'Икра чёрная, 100 г', icon: '⚫', price: 4990, cat: 'Деликатесы' },
  { name: 'Хамон, нарезка', icon: '🥩', price: 1290, cat: 'Деликатесы' },
  { name: 'Торт «Наполеон»', icon: '🍰', price: 890, cat: 'К чаю' },
  { name: 'Ананас', icon: '🍍', price: 450, cat: 'Фрукты' },
  { name: 'Сыр с плесенью', icon: '🧀', price: 690, cat: 'Деликатесы' },
  { name: 'Конфеты в коробке', icon: '🍫', price: 590, cat: 'К чаю' },
  { name: 'Креветки королевские', icon: '🦐', price: 1490, cat: 'Деликатесы' },
  { name: 'Мандарины, ящик', icon: '🍊', price: 1190, cat: 'Фрукты' },
];

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
      { id: 'boil', type: 'boil', product: 'potato', qty: 2, label: 'Поставить картофель вариться' },
      { id: 'boilEgg', type: 'boil', product: 'egg', qty: 2, label: 'Поставить яйца вариться' },
      { id: 'carrot', type: 'cut', product: 'carrot', qty: 2, shape: 'cube', dest: 'bowl', label: 'Нарезать 2 морковки кубиками' },
      { id: 'sausage', type: 'cut', product: 'sausage', shape: 'cube', dest: 'bowl', label: 'Нарезать колбасу кубиками' },
      { id: 'pickle', type: 'cut', product: 'pickle', qty: 2, shape: 'cube', dest: 'bowl', label: 'Нарезать 2 солёных огурца кубиками' },
      { id: 'peelEgg', type: 'peel', product: 'egg', qty: 2, requires: ['boilEgg'], label: 'Почистить 2 яйца' },
      { id: 'egg', type: 'cut', product: 'egg', qty: 2, shape: 'cube', dest: 'bowl', requires: ['peelEgg'], label: 'Нарезать 2 яйца кубиками' },
      { id: 'peelPotato', type: 'peel', product: 'potato', qty: 2, requires: ['boil'], label: 'Почистить 2 картофелины' },
      { id: 'potato', type: 'cut', product: 'potato', qty: 2, shape: 'cube', dest: 'bowl', requires: ['peelPotato'], label: 'Нарезать 2 картофелины кубиками' },
      { id: 'peas', type: 'add', product: 'peas', label: 'Открыть горошек и добавить' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Заправить майонезом' },
      { id: 'season', type: 'season', requires: ['carrot', 'sausage', 'pickle', 'egg', 'potato', 'peas', 'mayo'], label: 'Посолить и поперчить' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать круговыми движениями' },
      { id: 'taste', type: 'taste', requires: ['mix'], label: 'Попробовать и довести до вкуса' },
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
      { id: 'crab', type: 'cut', product: 'crab', qty: 2, shape: 'cube', dest: 'bowl', label: 'Нарезать 2 упаковки крабовых палочек' },
      { id: 'peelEgg', type: 'peel', product: 'egg', qty: 2, requires: ['boilEgg'], label: 'Почистить 2 яйца' },
      { id: 'egg', type: 'cut', product: 'egg', qty: 2, shape: 'cube', dest: 'bowl', requires: ['peelEgg'], label: 'Нарезать 2 яйца кубиками' },
      { id: 'cucumber', type: 'cut', product: 'cucumber', shape: 'cube', dest: 'bowl', label: 'Нарезать свежий огурец кубиками' },
      { id: 'corn', type: 'add', product: 'corn', label: 'Открыть кукурузу и добавить' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Заправить майонезом' },
      { id: 'season', type: 'season', requires: ['crab', 'egg', 'cucumber', 'corn', 'mayo'], label: 'Посолить и поперчить' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать' },
      { id: 'taste', type: 'taste', requires: ['mix'], label: 'Попробовать и довести до вкуса' },
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
      { id: 'peelEgg', type: 'peel', product: 'egg', qty: 3, requires: ['boilEgg'], label: 'Почистить 3 яйца' },
      { id: 'halves', type: 'halves', product: 'egg', items: 3, requires: ['peelEgg'], label: 'Разрезать 3 яйца пополам и вынуть желтки' },
      { id: 'mayo', type: 'add', product: 'mayo', requires: ['halves'], label: 'Добавить майонез к желткам' },
      { id: 'greens', type: 'add', product: 'greens', requires: ['halves'], label: 'Добавить зелень' },
      { id: 'season', type: 'season', requires: ['mayo', 'greens'], label: 'Посолить и поперчить' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать начинку' },
      { id: 'taste', type: 'taste', requires: ['mix'], label: 'Попробовать начинку' },
      { id: 'fill', type: 'fill', containers: 'eggHalf', items: 6, requires: ['taste'], label: 'Наполнить 6 половинок' },
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
      { id: 'cheese', type: 'grate', product: 'cheese', qty: 2, dest: 'bowl', label: 'Натереть 2 куска сыра' },
      { id: 'peelEgg', type: 'peel', product: 'egg', qty: 2, requires: ['boilEgg'], label: 'Почистить 2 яйца' },
      { id: 'egg', type: 'cut', product: 'egg', qty: 2, shape: 'cube', dest: 'bowl', requires: ['peelEgg'], label: 'Нарезать 2 яйца кубиками' },
      { id: 'mayo', type: 'add', product: 'mayo', label: 'Добавить майонез' },
      { id: 'season', type: 'season', requires: ['cheese', 'egg', 'mayo'], label: 'Посолить и поперчить' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать начинку' },
      { id: 'taste', type: 'taste', requires: ['mix'], label: 'Попробовать начинку' },
      { id: 'fill', type: 'fill', containers: 'tartlet', items: 8, requires: ['taste'], label: 'Разложить начинку по 8 корзинкам' },
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
      { id: 'season', type: 'season', requires: ['cheese', 'mayo', 'onion'], label: 'Посолить и поперчить' },
      { id: 'mix', type: 'mix', requires: ['season'], label: 'Перемешать начинку' },
      { id: 'taste', type: 'taste', requires: ['mix'], label: 'Попробовать начинку' },
      { id: 'fill', type: 'fill', containers: 'tomato', items: 4, requires: ['prep', 'taste'], label: 'Наполнить помидоры' },
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
      { id: 'herring', type: 'cut', product: 'herring', qty: 2, shape: 'cube', dest: 'prepared', label: 'Нарезать 2 филе сельди' },
      { id: 'onion', type: 'cut', product: 'onion', shape: 'cube', dest: 'prepared', onion: true, label: 'Нарезать лук (если с луком)' },
      { id: 'peelPotato', type: 'peel', product: 'potato', qty: 2, requires: ['boil'], label: 'Почистить 2 картофелины' },
      { id: 'potato', type: 'grate', product: 'potato', qty: 2, dest: 'prepared', requires: ['peelPotato'], label: 'Натереть 2 картофелины' },
      { id: 'carrot', type: 'grate', product: 'carrot', dest: 'prepared', label: 'Натереть морковь' },
      { id: 'beet', type: 'grate', product: 'beet', qty: 2, dest: 'prepared', requires: ['boilBeet'], label: 'Натереть 2 свёклы' },
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
      return { [step.product]: step.qty ?? 1 };
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
    case 'taste':
      return 'bowl';
    case 'cut':
    case 'grate':
    case 'peel':
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
    intro: 'Первый салат года. Нож режет там, где прошёл: сверху вниз — полоски, поверни доску клавишей D — и снова сверху вниз: кубики по 1 см. Быстрее — рубкой: качай нож вверх-вниз, сдвигая вбок. Поставь картошку и яйца на две конфорки и поверни крутилки: сильный огонь быстрее, но может убежать. Сваренное остуди под краном и почисти. В конце посоли, перемешай и попробуй.',
    newSkills: ['Нож по следу', 'Доска A/D', 'Рубка', 'Крутилки огня', 'Под краном', 'Чистка', 'Соль → перемешать → проба'],
    targetMinutes: 7, // 0.7: крутилки, кран и кубик 1 см — уверенный игрок ~6:30
    budget: 300,
    wishes: 0,
    stock: { potato: 2, carrot: 2, sausage: 2, pickle: 2, egg: 2, peas: 1, mayo: 1 },
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
    targetMinutes: 6,
    budget: 400,
    wishes: 1,
    stock: { crab: 3, egg: 2, cucumber: 1, corn: 0, mayo: 1 },
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
    targetMinutes: 7,
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
    targetMinutes: 10,
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
    stock: { potato: 2, herring: 3, onion: 1, carrot: 1, beet: 2, mayo: 1 },
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
    targetMinutes: 6,
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
    targetMinutes: 6,
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
