// «Рука-призрак» (0.11): полупрозрачная рука поверх сцены показывает жест. Слой только рисует: что показывать и когда —
// решают src/ghost/ (ghost-trigger.js, ghost-cues.js), положение точек в окне — src/view/ghost-space.js.
// Рука не ловит мышь (pointer-events: none) и исчезает, как только игрок сам нажал кнопку. Цвета — токены темы в ghost.css.

const NS = 'http://www.w3.org/2000/svg';
const smooth = (u) => u * u * (3 - 2 * u);

// Рука-курсор: кончик указательного пальца в (0, 0), ладонь вниз-вправо. Контур и складки — в ghost.css.
const HAND_BODY = 'M0,0 C3,0 5.5,2.4 5.5,5.5 L5.5,13 C5.5,11 7.2,10 9.2,10 C11.2,10 13,11.2 13,13.2 C13,11.6 14.6,10.6 16.4,10.6 C18.4,10.6 20.4,11.8 20.4,13.8 C20.4,12.6 21.8,11.8 23.6,11.8 C25.6,11.8 27.6,13 27.6,15.4 L27.6,32 C27.6,42.5 21.4,49 13.2,49 L4.5,49 C-1.5,49 -5.5,44.5 -9.5,38 L-15.2,28.6 C-16.6,26 -14,23.2 -11.4,25 L-5.5,30 L-5.5,5.5 C-5.5,2.4 -3,0 0,0 Z';
const HAND_FOLDS = 'M5.5,13 L5.5,26 M13,13.5 L13,27 M20.4,14 L20.4,27';

function el(name, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
}

const pathD = (pts) => (pts.length ? 'M' + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L') : '');

// Положение руки в момент t на пути в пикселях: линейно между точками; down берётся у прошедшей точки
function at(pts, t) {
  if (t <= pts[0].t) return { ...pts[0] };
  const last = pts[pts.length - 1];
  if (t >= last.t) return { ...last };
  let i = 1;
  while (i < pts.length - 1 && pts[i].t < t) i++;
  const a = pts[i - 1], b = pts[i];
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, down: k < 1 ? a.down : b.down };
}

export class GhostHand {
  /**
   * @param {object} o
   * @param {HTMLElement} o.host контейнер слоя (#app)
   * @param {() => boolean} [o.reduceMotion] «Меньше движения» из настроек или системы — тогда вместо анимации стрелка-путь
   */
  constructor({ host, reduceMotion = () => false }) {
    this.reduceMotion = reduceMotion;
    this.root = document.createElement('div');
    this.root.id = 'ghost-hand';
    this.root.className = 'gh hidden';
    this.root.setAttribute('aria-hidden', 'true');
    this.svg = el('svg', { class: 'gh-svg', width: '100%', height: '100%' }, this.root);
    this.route = el('path', { class: 'gh-route' }, this.svg);
    this.trail = el('path', { class: 'gh-trail' }, this.svg);
    this.start = el('circle', { class: 'gh-start', r: 7 }, this.svg);
    this.hand = el('g', { class: 'gh-hand' }, this.svg);
    el('circle', { class: 'gh-ring', r: 15 }, this.hand);
    const body = el('g', { class: 'gh-body' }, this.hand);
    el('path', { class: 'gh-palm', d: HAND_BODY }, body);
    el('path', { class: 'gh-folds', d: HAND_FOLDS }, body);
    this.label = document.createElement('div');
    this.label.className = 'gh-label';
    this.root.appendChild(this.label);
    host.appendChild(this.root);
    this.cur = null;
    this.hold = false;
  }

  get active() {
    return !!this.cur;
  }

  /**
   * Показать жест.
   * @param {object} o
   * @param {object} o.show результат GhostTrigger (dur, loops, speed, why)
   * @param {object} o.demo DEMOS[id]
   * @param {Array} o.path точки пути (demoPath)
   * @param {object} o.params параметры пути
   * @param {Function} o.makeMap () → (точка) → { x, y } | null; вызывается на каждый кадр (камера и ёлка двигаются)
   * @param {Function} [o.anchor] () → { x, y } | null: откуда жест начинается (фишка в доке)
   */
  play({ show, demo, path, params, makeMap, anchor = null }) {
    const natural = path[path.length - 1].t;
    const pass = natural / (show.speed || 1); // секунд на один проход
    this.cur = { show, demo, path, params, makeMap, anchor, t: 0, pass, cycle: pass + (show.pause ?? 0) };
    this.label.textContent = demo.label;
    this.root.classList.remove('hidden', 'gh-rest');
    this.root.classList.toggle('gh-static', !!this.reduceMotion());
    this.root.dataset.gesture = demo.id;
    this.root.dataset.why = show.why;
    this._draw(0);
  }

  hide() {
    if (!this.cur) return;
    this.cur = null;
    this.root.classList.add('hidden');
  }

  /** Двигаем время показа на dt секунд; закрываемся, когда оно вышло. */
  frame(dt) {
    const c = this.cur;
    if (!c) return;
    if (!this.hold) c.t += dt; // hold — кадр стоит (снимки для проверки глазами)
    if (c.t >= c.show.dur) return this.hide();
    this._draw(c.t);
  }

  // Точки пути в пикселях; фишка в доке (anchor) сдвигает начало жеста к себе: рука берёт её, а не воздух
  _screen(c) {
    const map = c.makeMap();
    if (!map) return null;
    const pts = [];
    for (const p of c.path) {
      const q = map(p);
      if (!q) return null;
      pts.push({ ...q, t: p.t, down: p.down });
    }
    const a = c.anchor?.();
    if (a) {
      const k = pts.findIndex((p) => p.down);
      let last = pts.length - 1;
      while (last > k && !pts[last].down) last--;
      if (k >= 0) {
        const dx = a.x - pts[k].x, dy = a.y - pts[k].y;
        for (let i = 0; i < pts.length; i++) {
          // подход целиком переезжает к фишке, ведение плавно возвращается на свою траекторию
          const w = i <= k ? 1 : i >= last ? 0 : 1 - smooth((i - k) / (last - k));
          pts[i].x += dx * w;
          pts[i].y += dy * w;
        }
      }
    }
    return pts;
  }

  _draw(elapsed) {
    const c = this.cur;
    const pts = this._screen(c);
    this.root.style.visibility = pts ? '' : 'hidden'; // точки на миг пропали (перерисовался док) — кадр пропускаем, показ идёт дальше
    if (!pts) return;
    const local = c.show.loops > 1 ? elapsed % c.cycle : elapsed;
    const rest = local > c.pass;
    const t = Math.min(local, c.pass) * (c.show.speed || 1);
    const stat = this.root.classList.contains('gh-static');
    // путь жеста: только участки с нажатием; жест без нажатия (мах над котом) — весь путь
    const hasDown = pts.some((p) => p.down);
    const route = hasDown ? pts.filter((p) => p.down) : pts;
    this.route.setAttribute('d', pathD(route));
    const first = route[0] ?? pts[0];
    this.start.setAttribute('cx', first.x.toFixed(1));
    this.start.setAttribute('cy', first.y.toFixed(1));
    this.root.classList.toggle('gh-rest', rest && !stat);
    if (stat) {
      // «меньше движения»: рука стоит в начале, путь — стрелкой до конца
      this.trail.setAttribute('d', pathD(route));
      this.trail.classList.add('gh-arrow');
      const end = route[route.length - 1], prev = route[Math.max(0, route.length - 4)];
      this._place(first.x, first.y, 0, hasDown);
      this._arrowhead(prev, end);
      this._labelAt(first);
      return;
    }
    this.trail.classList.remove('gh-arrow');
    const cut = pts.filter((p) => p.t <= t);
    const sub = hasDown ? cut.filter((p) => p.down) : cut;
    const now = at(pts, t);
    this.trail.setAttribute('d', pathD(sub.length ? [...sub, now] : []));
    this._clearArrow();
    // наклон руки по скорости: мах над котом читается как мах
    const prev = at(pts, Math.max(0, t - 0.08));
    const tilt = c.demo.id === 'cat-wave' ? Math.max(-1, Math.min(1, (now.x - prev.x) / 6)) * 16 : 0;
    this._place(now.x, now.y, tilt, now.down);
    this._labelAt(first);
  }

  // Рука растёт вместе с окном: на 1080p она не меньше, чем на 720p, относительно сцены
  _scale() {
    return Math.max(1.15, Math.min(2, innerHeight / 620));
  }

  _place(x, y, tilt, pressed) {
    this.hand.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(tilt - 8).toFixed(1)}) scale(${this._scale().toFixed(2)})`);
    this.hand.classList.toggle('gh-down', !!pressed);
  }

  _arrowhead(from, to) {
    if (!this.arrow) this.arrow = el('path', { class: 'gh-head' }, this.svg);
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    const L = 16, w = 0.5;
    const p = (da) => `${(to.x - Math.cos(a + da) * L).toFixed(1)},${(to.y - Math.sin(a + da) * L).toFixed(1)}`;
    this.arrow.setAttribute('d', `M${p(w)} L${to.x.toFixed(1)},${to.y.toFixed(1)} L${p(-w)}`);
    this.arrow.style.display = '';
  }

  _clearArrow() {
    if (this.arrow) this.arrow.style.display = 'none';
  }

  // Подпись над началом жеста, в пределах окна; у верхнего края (гирлянда над окном) — под рукой, а не под часами HUD
  _labelAt(p) {
    const w = this.label.offsetWidth || 220;
    const x = Math.max(w / 2 + 12, Math.min(innerWidth - w / 2 - 12, p.x));
    const y = p.y - 62 >= 96 ? p.y - 62 : p.y + 60 * this._scale() + 16;
    this.label.style.left = `${x.toFixed(0)}px`;
    this.label.style.top = `${y.toFixed(0)}px`;
  }
}
