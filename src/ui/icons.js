// Значки продуктов для интерфейса и телефона. Почти все — эмодзи; у свёклы и красной икры своих эмодзи нет
// (раньше стояли 🟣 и 🔴 — «просто фиолетовый круг», замечание владельца 0.9), поэтому они нарисованы SVG.
// Значок — строка HTML: вставлять только в разметку (innerHTML), не в title и не в textContent.

const svg = (label, body) => `<svg class="picon" viewBox="0 0 24 24" role="img" aria-label="${label}">${body}</svg>`;

const BEET = svg(
  'Свёкла',
  '<path d="M11 7.2C9.8 4 7.4 2.6 4.8 2.9c1.1 2.4 3.3 4.2 6.2 4.3z" fill="#43a047"/>' +
    '<path d="M13 7.2c1.2-3.2 3.6-4.6 6.2-4.3-1.1 2.4-3.3 4.2-6.2 4.3z" fill="#66bb6a"/>' +
    '<path d="M11.4 7.4 12 4.6l.6 2.8z" fill="#a3245a"/>' +
    '<path d="M12 6.8c4.3 0 7 2.9 7 6.4 0 3.2-2.6 5.4-5.1 6.5L12 23.4l-1.9-3.7C7.6 18.6 5 16.4 5 13.2c0-3.5 2.7-6.4 7-6.4z" fill="#8e1b4a"/>' +
    '<ellipse cx="9.4" cy="11.4" rx="1.5" ry="2.4" fill="#c4497a" opacity=".75"/>',
);

const CAVIAR = svg(
  'Красная икра',
  '<path d="M3 12.5h18c0 4.4-4 7.5-9 7.5s-9-3.1-9-7.5z" fill="#cfd8dc"/>' +
    '<ellipse cx="12" cy="12.5" rx="9" ry="2.6" fill="#eceff1"/>' +
    [
      [8, 11.6], [10.6, 10.9], [13.4, 11], [16, 11.7], [9.4, 13], [12, 12.5], [14.7, 13],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="#e8461f"/><circle cx="${x - 0.5}" cy="${y - 0.5}" r=".45" fill="#ffd2b8"/>`)
      .join(''),
);

/** Значок продукта по id из PRODUCTS (HTML-строка). */
export const PICON = { potato: '🥔', carrot: '🥕', sausage: '🌭', cucumber: '🥒', pickle: '🫙', egg: '🥚', peas: '🫛', mayo: '🫙', crab: '🦀', corn: '🌽', bread: '🍞', butter: '🧈', caviar: CAVIAR, tartlet: '🧁', cheese: '🧀', greens: '🌿', tomato: '🍅', onion: '🧅', herring: '🐟', beet: BEET, skewer: '🍡', mandarin: '🍊', apple: '🍏', grapes: '🍇', chicken: '🍗', marinade: '🥣' };
