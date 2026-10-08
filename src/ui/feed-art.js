// Картинки ленты «Андрея» кодом: плоские SVG-иллюстрации 320×200 в палитре арт-библии
// (design/art/art-bible.md). Без внешних файлов; масштабируются по ширине поста.

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = (v) => +v.toFixed(1);

// Палитра: кухня, акценты, кот и еда — те же hex, что в 3D-сцене.
const C = {
  ink: '#2b221c', ink2: '#6e5e50', wall: '#f3dcb4', wall2: '#ead0a2', tile: '#fbf3e4', counter: '#3f9a4f', counterDark: '#2f7a3d',
  wood: '#d9a066', woodDark: '#b67b45', woodDeep: '#78461e', porcelain: '#fdfbf6', rim: '#e7d3bb', paper: '#fffaf0', line: '#cfe0f2',
  pine: '#1f7a3a', pineDark: '#1f5f2a', berry: '#c62c37', red: '#d7262b', gold: '#ffd54f', goldDeep: '#e6b548',
  night: '#1b2a5a', night2: '#2c4380', window: '#ffd77a', steel: '#cfd6dd', dark: '#2e2e34',
  cat: '#e89648', catLight: '#f1ac61', stripe: '#ae582d', muzzle: '#ffefd2', nose: '#e68d94', eye: '#90bd70', eyeRim: '#4e7b4e', pupil: '#26231f',
  carrot: '#fc801a', pickle: '#7a8f38', sausage: '#f5b3b3', yolk: '#ffcc38', white: '#faf7ed', potato: '#edd185', potatoIn: '#fceba8', peas: '#6dbb3a',
  greens: '#3f9b3a', mandarin: '#ff8c1a', mandarinIn: '#ffd9a0', beet: '#8e1b4a', herring: '#dbb39e', mayo: '#fffbea', caviar: '#e8461f', crust: '#a8662e', crumb: '#f2dbad', butter: '#fff1b8',
  sky: '#9ad6f7', sea: '#3f9fd8', sand: '#f2cf8f', sun: '#ffe066', purple: '#6a5cf0', purpleSoft: '#e9e4ff',
};
const BULBS = ['#ff4d4d', '#ffd54f', '#66bb6a', '#42a5f5', '#ff8a65'];

const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const ell = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}" ${extra}/>`;
const circ = (cx, cy, r, fill, extra = '') => `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" ${extra}/>`;
const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
const stroke = (d, color, w, extra = '') => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const text = (x, y, t, size, fill, extra = '') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(t)}</text>`;
// Блёстка «идеально».
const spark = (x, y, s, fill = C.gold) => `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${fill}"/>`;
// Подпись мема: белые буквы с тёмной обводкой.
const meme = (lines, y, size = 22) => lines.map((t, i) => `<text class="fa-meme" x="160" y="${y + i * (size + 4)}" font-size="${size}" text-anchor="middle">${esc(t)}</text>`).join('');
// Линейка с делениями.
function ruler(x, y, w, h = 14, rot = 0) {
  let ticks = '';
  for (let i = 1; i * 6 < w; i++) ticks += `<path d="M${x + i * 6} ${y}v${i % 5 ? 4 : 7}" stroke="${C.woodDeep}" stroke-width="1"/>`;
  return `<g transform="rotate(${rot} ${x} ${y})">${rect(x, y, w, h, '#ffe08a', 'rx="2"')}${ticks}</g>`;
}
// Кухонный фон: стена с кафелем и зелёная столешница.
function kitchen(counterY = 150) {
  let tiles = '';
  for (let x = 20; x < 320; x += 40) tiles += `<path d="M${x} 0v${counterY}" stroke="${C.wall2}" stroke-width="1.5"/>`;
  for (let y = 30; y < counterY; y += 40) tiles += `<path d="M0 ${y}h320" stroke="${C.wall2}" stroke-width="1.5"/>`;
  return rect(0, 0, 320, 200, C.wall) + tiles + rect(0, counterY, 320, 200 - counterY, C.counter) + rect(0, counterY, 320, 6, C.counterDark);
}

// ---------- кот (наш рыжий, как в 3D) ----------
// look: side — косится в сторону, wide — круглые глаза, happy — довольный ^^.
function catHead(cx, cy, r, look = 'side') {
  const k = (v) => n(v * r);
  const ear = (s) =>
    path(`M${n(cx + s * k(0.92))} ${n(cy - k(0.3))}L${n(cx + s * k(0.82))} ${n(cy - k(1.22))}L${n(cx + s * k(0.24))} ${n(cy - k(0.8))}Z`, C.cat) +
    path(`M${n(cx + s * k(0.78))} ${n(cy - k(0.45))}L${n(cx + s * k(0.76))} ${n(cy - k(1.02))}L${n(cx + s * k(0.42))} ${n(cy - k(0.76))}Z`, C.nose);
  const eye = (s) => {
    const ex = cx + s * k(0.36), ey = cy - k(0.06);
    if (look === 'happy') return stroke(`M${n(ex - k(0.15))} ${n(ey + k(0.04))}Q${n(ex)} ${n(ey - k(0.14))} ${n(ex + k(0.15))} ${n(ey + k(0.04))}`, C.ink, k(0.06));
    const ball = ell(ex, ey, k(0.17), k(0.2), C.eye, `stroke="${C.eyeRim}" stroke-width="${k(0.03)}"`);
    if (look === 'wide') return ball + circ(ex, ey + k(0.01), k(0.12), C.pupil) + circ(ex + k(0.05), ey - k(0.06), k(0.04), '#fff');
    return ball + ell(ex + k(0.08), ey, k(0.05), k(0.15), C.pupil) + circ(ex + k(0.03), ey - k(0.08), k(0.03), '#fff');
  };
  const whisk = (s) => [0.18, 0.36].map((dy) => stroke(`M${n(cx + s * k(0.38))} ${n(cy + k(0.3))}L${n(cx + s * k(1.08))} ${n(cy + k(dy))}`, C.ink2, k(0.025), 'opacity="0.7"')).join('');
  return (
    ear(-1) + ear(1) +
    ell(cx, cy, r, k(0.84), C.cat) +
    [-0.14, 0, 0.14].map((dx) => stroke(`M${n(cx + k(dx))} ${n(cy - k(0.8))}L${n(cx + k(dx * 0.7))} ${n(cy - k(0.52))}`, C.stripe, k(0.07))).join('') +
    ell(cx - k(0.17), cy + k(0.32), k(0.23), k(0.18), C.muzzle) + ell(cx + k(0.17), cy + k(0.32), k(0.23), k(0.18), C.muzzle) +
    eye(-1) + eye(1) +
    path(`M${n(cx - k(0.09))} ${n(cy + k(0.14))}h${k(0.18)}l${-k(0.09)} ${k(0.1)}Z`, C.nose) +
    stroke(`M${n(cx - k(0.12))} ${n(cy + k(0.34))}Q${n(cx - k(0.06))} ${n(cy + k(0.43))} ${n(cx)} ${n(cy + k(0.32))}Q${n(cx + k(0.06))} ${n(cy + k(0.43))} ${n(cx + k(0.12))} ${n(cy + k(0.34))}`, C.ink, k(0.035)) +
    whisk(-1) + whisk(1)
  );
}
// Сидящий кот анфас: тело, грудка, лапы (голова рисуется отдельно поверх).
function catBody(cx, top, w, h) {
  return (
    ell(cx, top + h / 2, w / 2, h / 2, C.cat) +
    stroke(`M${n(cx - w * 0.42)} ${n(top + h * 0.45)}q${n(w * 0.1)} 4 ${n(w * 0.14)} 12M${n(cx + w * 0.42)} ${n(top + h * 0.45)}q${n(-w * 0.1)} 4 ${n(-w * 0.14)} 12`, C.stripe, 3) +
    ell(cx, top + h * 0.42, w * 0.24, h * 0.3, C.muzzle) +
    ell(cx - w * 0.17, top + h - 4, w * 0.13, 6, C.muzzle) + ell(cx + w * 0.17, top + h - 4, w * 0.13, 6, C.muzzle)
  );
}

// ---------- тарелка ----------
const plate = (cx, cy, rx, ry) => ell(cx, cy + 3, rx, ry, 'rgba(43,34,28,0.18)') + ell(cx, cy, rx, ry, C.porcelain, `stroke="${C.rim}" stroke-width="2"`) + ell(cx, cy, rx * 0.72, ry * 0.68, 'none', `stroke="${C.rim}" stroke-width="1.5"`);

// Веточка петрушки/укропа.
function sprig(x, y, s = 1, color = C.greens) {
  return stroke(`M${x} ${y}q${4 * s} ${-8 * s} ${10 * s} ${-14 * s}`, color, 1.6) + [[3, -5], [7, -10], [10, -14], [0, -3]].map(([dx, dy], i) => ell(x + dx * s + (i % 2 ? 4 : -3) * s, y + dy * s, 4.2 * s, 2.6 * s, color, `transform="rotate(${i % 2 ? -30 : 30} ${n(x + dx * s)} ${n(y + dy * s)})"`)).join('');
}

// ---------- картинки ----------
const ART = {
  // ИДЕАЛЬНОЕ оливье из кольца: кубики по сетке, петрушка, линейка.
  olivierRing() {
    let cubes = '';
    const cols = [C.carrot, C.pickle, C.sausage, C.yolk, C.potatoIn, C.peas];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) cubes += rect(112 + c * 11 + (r % 2) * 0, 92 + r * 12, 9, 9, cols[(c + r * 2) % cols.length], 'rx="1.5"');
    let peas = '';
    for (let i = 0; i < 9; i++) peas += circ(128 + (i % 5) * 16 + (i > 4 ? 8 : 0), 82 + (i > 4 ? 4 : -2), 3.4, C.peas);
    return (
      rect(0, 0, 320, 200, '#fde9ef') + rect(0, 138, 320, 62, '#f8d2de') +
      plate(160, 158, 118, 30) +
      rect(104, 82, 112, 72, '#f7e9bf') + ell(160, 154, 56, 13, '#f2dfaa') + cubes +
      ell(160, 82, 56, 13, '#fbf0cf', `stroke="#efdcab" stroke-width="1.5"`) + peas +
      sprig(152, 82, 1.4) + sprig(166, 80, 1.1) +
      ruler(30, 168, 70, 12, -8) +
      spark(64, 54, 9) + spark(258, 66, 11) + spark(244, 30, 6) + spark(86, 24, 6, '#ffffff') + spark(280, 120, 7, '#ffffff') +
      `<text x="22" y="34" font-size="15" font-weight="900" fill="${C.berry}" transform="rotate(-6 22 34)">ИДЕАЛЬНО</text>`
    );
  },

  // Кот в миске: «Я не ел оливье».
  catBowl() {
    let cubes = '';
    const cols = [C.carrot, C.pickle, C.sausage, C.yolk, C.potatoIn, C.peas];
    for (let i = 0; i < 14; i++) cubes += rect(92 + ((i * 37) % 136), 150 + ((i * 13) % 14), 8, 8, cols[i % 6], `rx="1.5" transform="rotate(${(i * 23) % 40} ${96 + ((i * 37) % 136)} ${154 + ((i * 13) % 14)})"`);
    return (
      kitchen(160) +
      catBody(160, 92, 104, 76) +
      catHead(160, 92, 40, 'side') +
      rect(170, 50, 7, 7, C.carrot, 'rx="1.5" transform="rotate(20 173 53)"') + circ(136, 62, 3.5, C.peas) +
      circ(150, 122, 2.2, C.mayo) + circ(168, 126, 1.8, C.mayo) +
      path('M70 128 Q74 186 160 188 Q246 186 250 128 Z', 'rgba(207,224,236,0.55)', `stroke="#b9cbd8" stroke-width="2.5"`) +
      cubes +
      ell(160, 128, 90, 9, 'rgba(255,255,255,0.35)', `stroke="#b9cbd8" stroke-width="2.5"`) +
      path('M86 138 Q90 170 122 180', 'none', 'stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.7"') +
      meme(['Я НЕ ЕЛ ОЛИВЬЕ'], 32, 24)
    );
  },

  // Кот против ёлки: ёлка падает, игрушки летят.
  catTree() {
    const tier = (y, w, h) => path(`M${160 - w / 2} ${y}L160 ${y - h}L${160 + w / 2} ${y}Z`, C.pine);
    const balls = [[120, 150, C.berry], [176, 128, C.gold], [146, 104, '#42a5f5'], [196, 158, C.berry], [134, 132, C.gold]];
    return (
      rect(0, 0, 320, 200, '#f6dfb8') + rect(0, 168, 320, 32, '#e5c79a') +
      `<g transform="rotate(24 160 186)">` +
      rect(152, 170, 16, 18, C.woodDark) + rect(140, 180, 40, 10, C.red, 'rx="2"') +
      tier(176, 120, 52) + tier(144, 96, 48) + tier(112, 70, 44) +
      balls.map(([x, y, c]) => circ(x, y, 6, c)).join('') +
      path('M160 56l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z', C.gold) +
      catHead(160, 128, 22, 'wide') +
      `</g>` +
      circ(62, 92, 8, C.gold) + circ(84, 60, 6, C.berry) + circ(40, 140, 7, '#42a5f5') + circ(262, 180, 7, C.berry) + circ(282, 176, 6, C.gold) +
      stroke('M74 100q-6 -8 -2 -16M94 70q-4 -8 2 -14', C.ink2, 1.5, 'opacity="0.5"') +
      meme(['ЁЛКА 0 : 1 КОТ'], 34, 24)
    );
  },

  // Кот в шапочке из мандариновой кожуры.
  catMandarin() {
    const mand = (x, y, r) => circ(x, y, r, C.mandarin) + circ(x - r * 0.3, y - r * 0.3, r * 0.22, '#ffb066') + ell(x + 2, y - r, 4, 2, C.greens, `transform="rotate(-25 ${x + 2} ${y - r})"`);
    let dots = '';
    for (let i = 0; i < 10; i++) dots += circ(128 + ((i * 29) % 64), 54 + ((i * 7) % 12), 1.3, '#e8730c');
    return (
      rect(0, 0, 320, 200, '#dcefe4') + rect(0, 160, 320, 40, C.wood) +
      catBody(160, 110, 110, 74) +
      catHead(160, 108, 44, 'happy') +
      path('M118 74 Q120 34 160 32 Q200 34 202 74 Q160 64 118 74 Z', C.mandarin) +
      path('M118 74 Q160 64 202 74 Q200 80 196 80 Q160 72 124 80 Q120 80 118 74 Z', C.mandarinIn) + dots +
      stroke('M160 32q2 -8 8 -10', C.pineDark, 2) + ell(172, 22, 7, 3.5, C.greens, 'transform="rotate(-20 172 22)"') +
      mand(56, 168, 16) + mand(88, 178, 12) + mand(260, 170, 15) +
      path('M226 182 q10 -14 22 -4 q-8 2 -10 10 Z', C.mandarin) + path('M30 150 q14 -10 22 2 q-10 0 -12 8 Z', C.mandarin) +
      meme(['МНЕ ИДЁТ?'], 192, 22)
    );
  },

  // 31 декабря, а ничего не нарезано: календарь, гора целых овощей, кот в ужасе.
  catPanic() {
    const potato = (x, y) => ell(x, y, 14, 10, C.potato, `stroke="#c9a85a" stroke-width="1.2"`);
    const carrot = (x, y, rot) => `<g transform="rotate(${rot} ${x} ${y})">${path(`M${x} ${y - 5}L${x + 40} ${y}L${x} ${y + 5}Z`, '#f26e12')}${sprig(x - 2, y, 0.8)}</g>`;
    const egg = (x, y) => ell(x, y, 8, 10, C.white, `stroke="${C.rim}" stroke-width="1"`);
    return (
      kitchen(150) +
      rect(238, 62, 58, 64, '#fff', 'rx="5"') + rect(238, 62, 58, 18, C.berry, 'rx="5"') + rect(238, 74, 58, 6, C.berry) +
      text(267, 76, 'ДЕКАБРЬ', 9, '#fff', 'text-anchor="middle" font-weight="900"') + text(267, 118, '31', 34, C.ink, 'text-anchor="middle" font-weight="900"') +
      rect(246, 58, 4, 9, C.ink2, 'rx="2"') + rect(284, 58, 4, 9, C.ink2, 'rx="2"') +
      potato(196, 150) + potato(224, 152) + potato(210, 138) + carrot(236, 160, -10) + carrot(178, 162, 8) + egg(252, 146) + egg(240, 138) + ell(268, 156, 10, 9, C.beet) +
      rect(36, 158, 96, 30, C.wood, 'rx="6"') +
      catBody(84, 112, 76, 54) +
      catHead(84, 104, 32, 'wide') +
      ell(46, 114, 9, 7, C.muzzle, 'transform="rotate(-30 46 114)"') + ell(122, 114, 9, 7, C.muzzle, 'transform="rotate(30 122 114)"') +
      stroke('M38 92l-8 -6M36 104l-10 0M130 92l8 -6M132 104l10 0', C.ink, 2) +
      meme(['КОГДА 31 ДЕКАБРЯ,', 'А ЕЩЁ НИЧЕГО НЕ НАРЕЗАНО'], 24, 17)
    );
  },

  // «Всё по плану»: сковородка с угольками и дымом.
  burntPan() {
    let coals = '';
    for (let i = 0; i < 7; i++) coals += rect(120 + i * 13, 120 + (i % 2) * 4, 11, 8, '#2a211c', `rx="2" transform="rotate(${(i * 17) % 30 - 15} ${125 + i * 13} ${124})"`);
    return (
      kitchen(150) +
      rect(70, 150, 180, 50, C.dark) + ell(160, 164, 70, 9, '#1c1c20') + ell(160, 164, 50, 6, '#ff6b2c', 'opacity="0.6"') +
      ell(160, 132, 66, 16, '#3a3a40') + ell(160, 128, 58, 12, '#262628') + coals +
      rect(222, 124, 74, 10, '#2b1d16', 'rx="5" transform="rotate(-6 222 124)"') +
      path('M118 108 q-16 -18 0 -34 q14 -14 2 -32 q22 12 10 34 q-10 14 4 32 Z', '#8d8a8e', 'opacity="0.75"') +
      path('M156 106 q-20 -22 -2 -42 q16 -16 0 -40 q28 16 14 42 q-10 16 6 40 Z', '#a6a3a8', 'opacity="0.8"') +
      path('M196 108 q-14 -16 0 -30 q12 -12 2 -28 q20 10 10 30 q-8 12 4 28 Z', '#8d8a8e', 'opacity="0.7"') +
      circ(118, 34, 12, '#bdbabf', 'opacity="0.6"') + circ(170, 18, 14, '#bdbabf', 'opacity="0.55"') + circ(212, 44, 10, '#bdbabf', 'opacity="0.6"') +
      rect(18, 24, 66, 26, '#fff', 'rx="13"') + text(51, 42, '✓ план', 14, C.pine, 'text-anchor="middle" font-weight="900"')
    );
  },

  // Бабушкин рецепт 1985 года на тетрадном листке.
  recipeCard() {
    let lines = '';
    for (let y = 58; y < 186; y += 16) lines += `<path d="M58 ${y}h214" stroke="${C.line}" stroke-width="1.2"/>`;
    const hand = (y, t, size = 17, fill = '#2a3f8f') => `<text x="80" y="${y}" font-size="${size}" fill="${fill}" class="fa-hand">${esc(t)}</text>`;
    return (
      rect(0, 0, 320, 200, C.wood) + [30, 70, 110, 150, 190].map((y) => `<path d="M0 ${y}h320" stroke="#c98f55" stroke-width="2" opacity="0.5"/>`).join('') +
      `<g transform="rotate(-4 160 110)">` +
      rect(52, 14, 226, 186, C.paper, 'rx="3"') + lines + `<path d="M74 14v186" stroke="#f08a8a" stroke-width="1.5"/>` +
      hand(44, 'Оливье · 1985', 22, C.berry) +
      hand(72, 'картошка — 4 шт.') + hand(88, 'колбаса докторская — 300 г') + hand(104, 'огурчики солёные — 3') + hand(120, 'яйца — 4, горошек — банка') + hand(136, 'майонез — сколько не жалко') +
      hand(162, 'Резать мелко! С любовью', 17, C.berry) +
      ell(236, 168, 18, 11, 'rgba(232,180,80,0.25)') +
      `</g>` +
      rect(250, 140, 70, 8, '#3f9a4f', 'rx="4" transform="rotate(-38 250 140)"') + path('M244 146 l6 -8 4 6 Z', '#f2dbad', 'transform="rotate(-38 250 140)"')
    );
  },

  // Бутерброды с икрой ровными рядами.
  caviarRows() {
    let s = rect(0, 0, 320, 200, '#f6ead4') + rect(26, 22, 268, 160, C.porcelain, `rx="14" stroke="${C.rim}" stroke-width="2"`);
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 4; c++) {
        const x = 44 + c * 62, y = 36 + r * 70;
        s += rect(x, y, 52, 56, C.crust, 'rx="6"') + rect(x + 3, y + 3, 46, 50, C.crumb, 'rx="5"') + rect(x + 6, y + 6, 40, 44, C.butter, 'rx="4"');
        for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) s += circ(x + 12 + j * 9.5, y + 12 + i * 8, 3.4, C.caviar) + circ(x + 11 + j * 9.5, y + 11 + i * 8, 1, '#ffb199');
        s += sprig(x + 40, y + 52, 0.7);
      }
    return s + ruler(40, 184, 240, 12) + spark(300, 18, 8) + spark(18, 100, 6);
  },

  // Ёлка с характером: наклон, стопка книг под подставкой.
  crookedTree() {
    const tier = (y, w, h) => path(`M${160 - w / 2} ${y}L160 ${y - h}L${160 + w / 2} ${y}Z`, C.pine);
    const bulbs = [[132, 150], [184, 140], [150, 118], [176, 100], [146, 82], [166, 64]].map(([x, y], i) => circ(x, y, 4, BULBS[i % 5])).join('');
    return (
      rect(0, 0, 320, 200, '#f6dfb8') + rect(0, 170, 320, 30, '#e5c79a') + rect(232, 30, 60, 76, C.night, 'rx="4"') + rect(236, 34, 52, 68, C.night2) + `<path d="M262 34v68M236 68h52" stroke="${C.night}" stroke-width="3"/>` +
      rect(110, 168, 34, 6, C.berry, 'rx="1"') + rect(112, 162, 30, 6, '#42a5f5', 'rx="1"') +
      `<g transform="rotate(14 150 172)">` +
      rect(142, 152, 16, 18, C.woodDark) + rect(128, 162, 44, 10, C.red, 'rx="2"') +
      tier(160, 120, 54) + tier(126, 94, 48) + tier(94, 66, 44) + bulbs +
      `</g>` +
      path('M196 40l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z', C.gold, 'transform="rotate(32 196 50)"') +
      `<text x="28" y="44" font-size="15" font-weight="900" fill="${C.pineDark}">с характером</text>`
    );
  },

  // Гирлянда соседа мигает вразнобой (анимация — в theme.css).
  garlandSync() {
    let s = rect(0, 0, 320, 200, C.night);
    for (let i = 0; i < 26; i++) s += circ((i * 53) % 320, (i * 31) % 70, 1.3, '#ffffff', 'opacity="0.7"');
    s += rect(40, 40, 240, 160, '#c9b79a') + rect(40, 40, 240, 8, '#a8957a');
    const win = (x, y, lit) => rect(x, y, 34, 40, lit ? C.window : '#3a4466', 'rx="2"') + `<path d="M${x + 17} ${y}v40" stroke="#c9b79a" stroke-width="3"/>`;
    s += win(60, 60, true) + win(132, 60, false) + win(226, 60, true) + win(60, 140, false) + win(226, 140, true);
    s += rect(112, 128, 96, 72, '#3a4466') + rect(104, 160, 112, 6, '#8d7d64') + `<path d="M104 166v34M216 166v34" stroke="#8d7d64" stroke-width="4"/>`;
    for (let x = 108; x <= 212; x += 9) s += `<path d="M${x} 166v34" stroke="#8d7d64" stroke-width="2"/>`;
    s += stroke('M96 120 Q130 150 160 124 Q190 150 224 120', '#1f3a2a', 2);
    const pts = [[100, 124], [112, 134], [124, 140], [138, 138], [150, 130], [160, 126], [170, 130], [182, 138], [196, 140], [208, 134], [220, 124]];
    pts.forEach(([x, y], i) => {
      const d = (((i * 7) % 5) * 0.23).toFixed(2), t = (0.6 + ((i * 3) % 4) * 0.25).toFixed(2);
      s += circ(x, y + 5, 5, BULBS[i % 5], `class="fa-blink" style="animation-delay:${d}s;animation-duration:${t}s"`);
    });
    return s + text(160, 30, 'мигает как хочет', 15, '#ffd77a', 'text-anchor="middle" font-weight="900"');
  },

  // ИДЕАЛЬНАЯ шуба: слои ровно по линейке.
  shubaPerfect() {
    const layers = [[C.herring, 12], [C.mayo, 3], [C.potato, 12], [C.mayo, 3], [C.carrot, 12], [C.mayo, 3], [C.yolk, 10], [C.mayo, 3], [C.beet, 14]];
    let y = 160, s = rect(0, 0, 320, 200, '#f3e6f0') + rect(0, 146, 320, 54, '#e8d3e3') + plate(150, 166, 118, 26);
    for (const [c, h] of layers) {
      y -= h;
      s += rect(88, y, 124, h, c);
    }
    s += ell(150, y, 62, 12, C.beet) + ell(150, y - 1, 52, 8, '#a52a5c', 'opacity="0.5"');
    for (let i = 0; i < 6; i++) s += stroke(`M${104 + i * 18} ${y - 7}l12 10`, C.mayo, 2) + stroke(`M${104 + i * 18 + 12} ${y - 7}l-12 10`, C.mayo, 2);
    s += sprig(140, y - 4, 1.2) + sprig(160, y - 2, 1);
    s += ruler(232, 160, 74, 12, -90);
    return s + spark(56, 44, 10) + spark(262, 32, 8) + spark(40, 112, 5, '#ffffff') + `<text x="22" y="30" font-size="15" font-weight="900" fill="${C.beet}">7 слоёв × 7 мм</text>`;
  },

  // ИДЕАЛЬНЫЙ стол: всё симметрично, на скатерти — строительный уровень.
  tablePerfect() {
    let s = rect(0, 0, 320, 200, '#f6dfb8') + rect(0, 0, 320, 14, C.pineDark);
    for (let i = 0; i < 9; i++) s += circ(18 + i * 36, 14, 4, BULBS[i % 5]);
    s += rect(12, 92, 296, 108, '#ffffff') + rect(12, 92, 296, 8, '#f1e7d6');
    for (let i = 0; i < 4; i++) {
      const x = 52 + i * 72;
      s += plate(x, 136, 26, 10) + path(`M${x - 8} 122l8 -14 8 14Z`, C.berry) + ell(x, 136, 10, 4, i % 2 ? C.beet : '#f7e9bf');
      s += rect(x + 30, 112, 6, 22, 'rgba(207,224,236,0.8)', 'rx="2"');
    }
    s += rect(150, 58, 6, 40, '#fff8e1') + rect(164, 58, 6, 40, '#fff8e1') + path('M153 58q-4 -8 0 -14q4 6 0 14Z', '#ffb44d') + path('M167 58q-4 -8 0 -14q4 6 0 14Z', '#ffb44d');
    s += rect(110, 168, 100, 16, '#ffd54f', 'rx="3"') + rect(150, 171, 20, 10, '#9ce0a8', 'rx="5"') + circ(160, 176, 3.5, '#ffffff') + `<path d="M154 171v10M166 171v10" stroke="${C.pine}" stroke-width="1.2"/>`;
    return s + spark(40, 60, 9) + spark(282, 56, 9) + spark(232, 36, 5);
  },

  // Верка у моря.
  sea() {
    return (
      rect(0, 0, 320, 200, C.sky) + circ(262, 44, 22, C.sun) + circ(262, 44, 30, C.sun, 'opacity="0.3"') +
      rect(0, 108, 320, 40, C.sea) + `<path d="M0 120q20 -6 40 0t40 0t40 0t40 0t40 0t40 0t40 0t40 0" stroke="#ffffff" stroke-width="2" fill="none" opacity="0.6"/>` +
      path('M0 146 Q160 132 320 146 V200 H0 Z', C.sand) +
      stroke('M120 186 Q112 130 136 82', '#8a5a2b', 9) +
      path('M136 82 q-30 -10 -52 10 q26 -4 52 -10Z', C.greens) + path('M136 82 q30 -16 54 0 q-28 -2 -54 0Z', C.greens) + path('M136 82 q-12 -26 -38 -30 q20 14 38 30Z', '#4cae4a') + path('M136 82 q14 -28 40 -28 q-22 12 -40 28Z', '#4cae4a') +
      circ(132, 88, 5, '#7a4a20') + circ(140, 90, 5, '#7a4a20') +
      ell(232, 174, 26, 6, '#ffffff', 'opacity="0.6"') + rect(214, 160, 40, 10, '#ff8a65', 'rx="5"')
    );
  },

  // Пальма в гирлянде вместо ёлки.
  palmTree() {
    let s = this.sea();
    s += path('M126 74l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z', C.gold, 'transform="translate(10 -6)"');
    [[124, 170], [128, 150], [126, 130], [130, 112], [134, 96]].forEach(([x, y], i) => (s += circ(x, y, 4, BULBS[i % 5]) + circ(x, y, 7, BULBS[i % 5], 'opacity="0.3"')));
    return s + rect(150, 170, 26, 20, C.berry, 'rx="2"') + rect(161, 170, 4, 20, C.gold) + rect(150, 178, 26, 4, C.gold);
  },

  // Ящик мандаринов: день первый и день второй.
  mandarins() {
    const crate = (x, full) => {
      let m = rect(x, 92, 120, 70, C.woodDark, 'rx="4"') + rect(x, 110, 120, 6, '#9b6233') + rect(x, 136, 120, 6, '#9b6233');
      if (full) for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) m += circ(x + 12 + c * 19 + (r ? 9 : 0), 90 - r * 12, 10, C.mandarin) + circ(x + 9 + c * 19 + (r ? 9 : 0), 86 - r * 12, 2.5, '#ffb066');
      else m += path(`M${x + 20} 92 q10 -12 22 -2 q-8 2 -10 8Z`, C.mandarin) + path(`M${x + 70} 92 q12 -10 22 0 q-10 0 -12 6Z`, C.mandarin) + circ(x + 58, 88, 7, C.mandarinIn);
      return m;
    };
    return (
      rect(0, 0, 320, 200, '#fff1cf') + rect(0, 162, 320, 38, C.wood) +
      crate(20, true) + crate(180, false) +
      path('M196 176 q12 -12 24 -2 q-10 2 -12 8Z', C.mandarin) + path('M250 182 q10 -14 22 -4 q-8 2 -10 8Z', C.mandarin) + path('M290 172 q8 -10 18 -2 q-8 2 -8 6Z', C.mandarin) +
      `<text x="80" y="40" font-size="17" font-weight="900" fill="${C.pine}" text-anchor="middle">День 1</text>` +
      `<text x="240" y="40" font-size="17" font-weight="900" fill="${C.berry}" text-anchor="middle">День 2</text>` +
      `<path d="M160 30v120" stroke="${C.rim}" stroke-width="2" stroke-dasharray="4 5"/>`
    );
  },

  // «Андрей ловит даже на кухне»: пар над кастрюлей — значок сети.
  signal() {
    return (
      kitchen(150) +
      rect(80, 150, 160, 50, C.dark) + ell(160, 152, 56, 6, '#1c1c20') +
      rect(110, 96, 100, 54, C.steel, 'rx="8"') + rect(96, 104, 16, 8, '#aeb7c0', 'rx="4"') + rect(208, 104, 16, 8, '#aeb7c0', 'rx="4"') + ell(160, 96, 50, 8, '#e3e8ec') + rect(150, 84, 20, 8, '#aeb7c0', 'rx="3"') +
      stroke('M138 64 a30 30 0 0 1 44 0', C.purple, 7) + stroke('M124 50 a50 50 0 0 1 72 0', C.purple, 7, 'opacity="0.8"') + stroke('M110 36 a70 70 0 0 1 100 0', C.purple, 7, 'opacity="0.6"') + circ(160, 76, 5, C.purple) +
      rect(16, 18, 76, 30, C.purple, 'rx="15"') + text(54, 39, 'А · 5G', 15, '#ffffff', 'text-anchor="middle" font-weight="900"')
    );
  },

  // Без минуты полночь: часы, гирлянда, салют за окном.
  midnight() {
    let s = rect(0, 0, 320, 200, '#f3dcb4') + rect(150, 26, 150, 120, C.night, 'rx="6"') + rect(156, 32, 138, 108, C.night2);
    const burst = (x, y, c) => {
      let b = '';
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b += circ(x + Math.cos(a) * 16, y + Math.sin(a) * 16, 2.5, c) + circ(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 1.6, c);
      }
      return b;
    };
    s += burst(196, 66, '#ffd54f') + burst(254, 92, '#ff8a65') + burst(232, 54, '#66bb6a');
    for (let i = 0; i < 12; i++) s += circ(160 + ((i * 37) % 130), 40 + ((i * 23) % 96), 1.6, '#ffffff');
    s += `<path d="M225 32v108M156 86h138" stroke="#faf6ef" stroke-width="5"/>` + rect(146, 140, 158, 10, '#faf6ef', 'rx="2"');
    s += circ(76, 82, 48, C.woodDark) + circ(76, 82, 41, '#fffaf0');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      s += circ(76 + Math.sin(a) * 34, 82 - Math.cos(a) * 34, i % 3 ? 1.6 : 3, C.ink);
    }
    s += stroke('M76 82L76 52', C.ink, 4) + stroke('M76 82L73 46', C.berry, 2) + circ(76, 82, 3.5, C.ink);
    for (let i = 0; i < 9; i++) s += circ(16 + i * 36, 12 + (i % 2) * 6, 5, BULBS[i % 5]);
    s += stroke('M0 10 Q40 22 72 12 T144 14 T216 12 T288 14 T330 10', '#1f3a2a', 1.5);
    return s + `<text x="76" y="168" font-size="20" font-weight="900" fill="${C.berry}" text-anchor="middle">23:59</text>` + `<text x="225" y="180" font-size="16" font-weight="900" fill="${C.pine}" text-anchor="middle">С наступающим!</text>`;
  },
};

/** Ключи всех картинок ленты (для проверок данных). */
export const FEED_ART_KEYS = Object.keys(ART);

/** SVG-картинка поста по ключу; alt — описание для экранного диктора. Пустая строка, если ключа нет. */
export function feedArt(key, alt = '') {
  const draw = ART[key];
  if (!draw) return '';
  return `<svg class="fa" viewBox="0 0 320 200" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg">${draw.call(ART)}</svg>`;
}

/** Фото блюда героини: тарелка на праздничной скатерти, значок блюда и подпись. */
export function dishArt(icon, name, alt = name) {
  let cloth = rect(0, 0, 320, 200, '#fbefe0');
  for (let x = 0; x < 320; x += 40) cloth += rect(x, 0, 20, 200, 'rgba(198,44,55,0.08)');
  for (let y = 0; y < 200; y += 40) cloth += rect(0, y, 320, 20, 'rgba(198,44,55,0.08)');
  const body = cloth + plate(160, 104, 110, 70) + `<text x="160" y="126" font-size="64" text-anchor="middle">${esc(icon)}</text>` + sprig(236, 64, 1.2) + spark(70, 40, 8) + spark(262, 160, 6) +
    rect(96, 168, 128, 24, 'rgba(255,255,255,0.9)', 'rx="12"') + text(160, 185, name, 14, C.ink, 'text-anchor="middle" font-weight="900"');
  return `<svg class="fa" viewBox="0 0 320 200" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/** Сердечко лайка: контур — не отмечено, заливка — отмечено. */
export function heartIcon(on) {
  return `<svg class="heart" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.6-9.2C.9 7.9 3 4.5 6.5 4.5c2.1 0 3.6 1.2 4.5 2.6.9-1.4 2.4-2.6 4.5-2.6 3.5 0 5.6 3.4 4.1 6.8-2.1 4.6-9.6 9.2-9.6 9.2z" fill="${on ? '#d23c3c' : 'none'}" stroke="${on ? '#d23c3c' : '#6e5e50'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
