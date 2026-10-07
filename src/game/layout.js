// Раскладка кухни, общая для логики (маршруты) и сцены (модели).
// Ось X — вправо, Z — к камере. Угол facing: 0 — лицом к камере (+Z), PI — к задней стене.

export const LAYOUT = {
  heroineStart: { x: 0.3, z: -0.95 },
  // Свободная область, по которой ходит героиня. Внутри неё нет препятствий,
  // поэтому маршрут между станциями — короткая прямая.
  freeArea: { minX: -2.1, maxX: 2.1, minZ: -1.7, maxZ: -0.15 },
  island: { x: 0, z: 0.55, w: 3.6, d: 0.85, h: 0.9 },
  backCounter: { z: -2.25, d: 0.7, h: 0.9 },
  stations: {
    board: { label: 'Доска', stand: { x: -0.45, z: -0.22 }, facing: 0, anchor: { x: -0.45, y: 0.92, z: 0.5 } },
    bowl: { label: 'Миска', stand: { x: 0.6, z: -0.22 }, facing: 0, anchor: { x: 0.62, y: 0.95, z: 0.55 } },
    phone: { label: 'Телефон', stand: { x: 1.4, z: -0.22 }, facing: 0, anchor: { x: 1.45, y: 0.92, z: 0.62 } },
    stove: { label: 'Плита', stand: { x: 1.45, z: -1.6 }, facing: Math.PI, anchor: { x: 1.45, y: 1.0, z: -2.25 } },
    garland: { label: 'Гирлянда', stand: { x: -1.25, z: -1.6 }, facing: Math.PI, anchor: { x: -1.25, y: 1.72, z: -2.55 } },
    radio: { label: 'Радио', stand: { x: -1.85, z: -1.6 }, facing: Math.PI, anchor: { x: -1.85, y: 1.06, z: -2.18 } },
  },
  plate: { x: -1.4, y: 0.92, z: 0.55 },
};
