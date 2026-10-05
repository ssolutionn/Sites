// Единая конфигурация баланса и расписания.
// Длительность раунда (300 с) и готовность картофеля (270 с = 4:30) зафиксированы ТЗ.
// Остальные числа — стартовые настройки, их можно менять после игровых проверок.

export const CONFIG = {
  // --- Время ---
  roundDuration: 300, // секунд активного времени после установки кастрюли
  potatoReadyAt: 270, // 4:30 — картофель готов, остаётся 00:30
  noNewEventsAfter: 255, // после этой секунды новые помехи не начинаются
  maxFrameDt: 0.25, // защита от скачков времени между кадрами (после паузы скачка нет)
  subStep: 0.05, // шаг внутренней симуляции

  // --- Нарезка ---
  // Целевой кубик нормализован к 1. Толщина ломтика всегда равна 1.
  targetSize: 1,
  tolerance: { min: 0.75, max: 1.25 }, // аккуратный кусок: каждая сторона в этих пределах
  minCutFraction: 0.2, // минимальная ширина новой части относительно целевого кубика
  maxPiecesPerIngredient: 150,
  knifeDuration: 0.3,

  // --- Перемещение и действия ---
  walkSpeed: 2.6, // м/с в сцене
  durations: {
    reduceHeat: 1,
    replacement: 2,
    openPeas: 1.5,
    addMayo: 1,
    takePotato: 1,
    shooReaction: 0.8,
    mixHold: 3,
    garlandHold: 2,
  },

  // --- Рецепт ---
  // w × d — размер подготовленного ломтика в целевых кубиках (толщина = 1).
  ingredients: [
    { id: 'carrot', name: 'Морковь', start: 'варёная и очищенная', cut: true, w: 4, d: 2 },
    { id: 'sausage', name: 'Колбаса', start: 'подготовлена', cut: true, w: 3, d: 3 },
    { id: 'cucumber', name: 'Огурец', start: 'подготовлен', cut: true, w: 4, d: 2 },
    { id: 'egg', name: 'Яйцо', start: 'сварено и очищено', cut: true, w: 3, d: 2 },
    { id: 'peas', name: 'Горошек', start: 'банка готова', cut: false },
    { id: 'mayo', name: 'Майонез', start: 'упаковка готова', cut: false },
    { id: 'potato', name: 'Картофель', start: 'в кастрюле', cut: true, w: 2, d: 2 },
  ],
  suggestedOrder: ['carrot', 'sausage', 'cucumber', 'egg', 'peas', 'mayo', 'potato'],

  // --- Помехи ---
  events: {
    cat: { first: 35, intervalMin: 35, intervalMax: 50, window: 6 },
    phone: { at: [55, 165], insightAfter: 4, alertLifetime: 12 },
    pot: { at: [100, 205], window: 8 },
    garland: { at: 135 },
  },

  // --- Оценка ---
  scoring: {
    wC: 0.45,
    wA: 0.4,
    wM: 0.15,
    errorPenalty: 4,
    tiers: [
      { min: 85, title: 'Оливье мечты' },
      { min: 60, title: 'Гости съедят' },
      { min: 0, title: 'Оливье с приключениями' },
    ],
    failTitle: 'Заказываем пиццу',
  },
};

export const STATION_IDS = ['stove', 'board', 'bowl', 'phone', 'garland'];
