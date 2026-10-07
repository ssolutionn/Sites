// Раскладка кухни кампании и координаты рабочих мест.
// Общая для логики (навигация, попадания) и сцены (модели). Метры; X — вправо, Z — к камере.

export const ISLAND_H = 0.9;

export const CLAYOUT = {
  start: { x: 0.3, z: -0.95 },
  bounds: { minX: -3.4, maxX: 3.4, minZ: -2.45, maxZ: 2.1 },
  exit: { x: 3.3, z: 1.5 }, // точка ухода за кадр к курьеру
  obstacles: {
    rects: [
      [-1.85, 0.1, 1.85, 1.0], // остров
      [-2.7, -2.62, 2.95, -1.88], // задняя столешница
      [2.6, -2.62, 3.5, -1.72], // холодильник
      [-3.6, -2.62, -2.4, -1.3], // ёлка
      [-3.35, -1.2, -2.55, -0.85], // подарки
      [-3.3, 0.0, -2.2, 1.1], // праздничный стол
    ],
    circles: [],
  },
  stations: {
    board: { label: 'Доска', stand: { x: -0.45, z: -0.22 }, facing: 0, anchor: { x: -0.45, y: 0.92, z: 0.5 } },
    tray: { label: 'Поднос', stand: { x: -1.2, z: -0.22 }, facing: 0, anchor: { x: -1.2, y: 0.92, z: 0.52 } },
    bowl: { label: 'Миска', stand: { x: 0.6, z: -0.22 }, facing: 0, anchor: { x: 0.62, y: 0.95, z: 0.55 } },
    phone: { label: 'Телефон', stand: { x: 1.4, z: -0.22 }, facing: 0, anchor: { x: 1.45, y: 0.92, z: 0.62 } },
    stove: { label: 'Плита', stand: { x: 1.6, z: -1.6 }, facing: Math.PI, anchor: { x: 1.45, y: 1.0, z: -2.25 } },
    oven: { label: 'Духовка', stand: { x: 1.15, z: -1.6 }, facing: Math.PI, anchor: { x: 1.45, y: 0.62, z: -1.9 } },
    sink: { label: 'Раковина', stand: { x: 0.25, z: -1.6 }, facing: Math.PI, anchor: { x: 0.25, y: 0.95, z: -2.25 } },
    radio: { label: 'Радио', stand: { x: -1.85, z: -1.6 }, facing: Math.PI, anchor: { x: -1.85, y: 1.06, z: -2.18 } },
    garland: { label: 'Гирлянда', stand: { x: -1.0, z: -1.6 }, facing: Math.PI, anchor: { x: -1.25, y: 1.72, z: -2.55 } },
    fridge: { label: 'Холодильник', stand: { x: 2.7, z: -1.45 }, facing: Math.PI, anchor: { x: 3.05, y: 1.5, z: -1.8 } },
    bag: { label: 'Пакет', stand: { x: 2.2, z: -1.6 }, facing: Math.PI, anchor: { x: 2.3, y: 0.95, z: -2.2 } },
    table: { label: 'Праздничный стол', stand: { x: -2.75, z: -0.3 }, facing: 0, anchor: { x: -2.75, y: 0.8, z: 0.55 } },
    catbowl: { label: 'Миска кота', stand: { x: 2.05, z: 1.45 }, facing: Math.PI / 2, anchor: { x: 2.45, y: 0.1, z: 1.6 } },
  },
  catBowl: { x: 2.45, z: 1.6 },
  glass: { x: 1.05, y: ISLAND_H, z: 0.82 },
  spillPuddle: { x: 1.05, z: 1.3, r: 0.32 },
  potPuddle: { x: 1.85, z: -1.05, r: 0.26 },
  catHome: { x: 2.6, z: 1.3 }, // кот сидит у праздничной двери, вне рабочих зон
  table: { x: -2.75, z: 0.55, w: 1.1, d: 1.1, h: 0.76 },
};

// Станции, у которых есть крупный план от первого лица.
export const CLOSEUP_STATIONS = new Set(['board', 'tray', 'bowl', 'sink', 'puddle', 'table']);

// --- Рабочие места на подносе (локальные координаты: центр подноса) ---
export const TRAY = { w: 0.56, d: 0.4, workPlate: { x: -0.33, z: 0.11, r: 0.065 } };

export function trayItems(dishId) {
  switch (dishId) {
    case 'sandwiches': {
      const out = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) out.push({ i: out.length, x: -0.125 + c * 0.125, z: -0.06 + r * 0.12, w: 0.1, d: 0.078 });
      return out;
    }
    case 'eggs':
      return [-0.12, 0, 0.12].map((x, i) => ({ i, x, z: -0.02, rx: 0.026, rz: 0.04 }));
    case 'tartlets': {
      const out = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) out.push({ i: out.length, x: -0.165 + c * 0.11, z: -0.06 + r * 0.12, r: 0.034 });
      return out;
    }
    case 'tomatoes':
      return [-0.165, -0.055, 0.055, 0.165].map((x, i) => ({ i, x, z: 0, r: 0.042 }));
    case 'shuba':
      return [{ i: 0, x: 0.02, z: 0, r: 0.13 }];
    case 'canape': {
      const out = [];
      for (let i = 0; i < 8; i++) out.push({ i, x: -0.21 + i * 0.06, z0: -0.16, slots: [-0.115, -0.07, -0.025, 0.02].map((z) => ({ x: -0.21 + i * 0.06, z })) });
      return out;
    }
    case 'fruit':
      return [{ i: 0, x: 0.03, z: 0, r: 0.145 }];
    case 'chicken':
      return [{ i: 0, x: 0, z: 0, w: 0.3, d: 0.21 }];
    default:
      return [];
  }
}

// Половинки яиц: у каждого яйца две половинки слева и справа.
export function eggHalfPos(egg, side) {
  return { x: egg.x + side * 0.03, z: egg.z, rx: 0.026, rz: 0.04 };
}

export const CANAPE_PILES = ['bread', 'cheese', 'sausage', 'cucumber'].map((p, i) => ({ product: p, x: -0.2 + i * 0.13, z: 0.115, r: 0.04 }));
export const FRUIT_PILES = {
  mandarin: [{ x: -0.245, z: -0.11 }, { x: -0.245, z: 0 }, { x: -0.245, z: 0.11 }],
  apple: { x: 0.255, z: -0.085 },
  grapes: { x: 0.255, z: 0.085 },
};

// Курица: видимые зоны для маринада (спина скрыта и не требуется).
export const CHICKEN_ZONES = [
  { name: 'грудка', x: 0, z: -0.005, rx: 0.07, rz: 0.052 },
  { name: 'левая ножка', x: -0.07, z: 0.052, rx: 0.033, rz: 0.03 },
  { name: 'правая ножка', x: 0.07, z: 0.052, rx: 0.033, rz: 0.03 },
  { name: 'левое крыло', x: -0.085, z: -0.04, rx: 0.026, rz: 0.024 },
  { name: 'правое крыло', x: 0.085, z: -0.04, rx: 0.026, rz: 0.024 },
];

// Праздничный стол: 10 мест.
export const TABLE_SLOTS = (() => {
  const out = [];
  for (let r = 0; r < 3; r++) {
    const n = r === 1 ? 4 : 3;
    for (let c = 0; c < n; c++) out.push({ i: out.length, x: (c - (n - 1) / 2) * 0.27, z: -0.34 + r * 0.34, r: 0.12 });
  }
  return out;
})();

// Миска: радиус области перемешивания.
export const BOWL = { r: 0.17 };
// Раковина и лужа — размеры маски.
export const SINK = { w: 0.34, d: 0.24 };
export const PUDDLE = { w: 0.6, d: 0.42 };
