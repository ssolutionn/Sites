// Нарезка по сетке. Продукт — маска клеток (клетка CELL u; u = 1 см = целевой кубик оливье).
// Нож режет по реальному следу мыши: связи между соседними клетками, которые пересекло лезвие,
// рвутся; куски — связные области. Ничего не выпрямляется: наклон и дрожь руки дают косые и кривые
// куски, зигзаг «рубки» режет каждым взмахом. Пропил нулевой толщины — объём не теряется.
// Координаты — система продукта (u), центр порции в нуле; поворот доски делает сессия.

export const CELL = 0.1;

const TAPER = { carrot: (a) => 0.8 + 0.2 * Math.cos(a), egg: (a) => 0.9 + 0.1 * Math.cos(a) };

/** Полуширина исходного продукта поперёк оси x на расстоянии px от его центра (тот же контур рисует сцена). */
export function halfDepth(shape, px) {
  const W = shape.w / 2, D = shape.d / 2;
  const profile = shape.profile ?? 'rectangle';
  if (Math.abs(px) > W + 1e-9) return 0;
  if (profile === 'rectangle') return D;
  const a = Math.acos(Math.max(-1, Math.min(1, px / W)));
  return Math.sin(a) * D * (TAPER[profile]?.(a) ?? 1);
}

const orient = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);

// Пересекает ли отрезок ножа ab связь (x1,z1)–(x2,z2). Касание считается, движение вдоль связи — нет.
function crosses(a, b, x1, z1, x2, z2) {
  const d1 = orient(a.x, a.z, b.x, b.z, x1, z1), d2 = orient(a.x, a.z, b.x, b.z, x2, z2);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0) || (d1 === 0 && d2 === 0)) return false;
  const d3 = orient(x1, z1, x2, z2, a.x, a.z), d4 = orient(x1, z1, x2, z2, b.x, b.z);
  return !((d3 > 0 && d4 > 0) || (d3 < 0 && d4 < 0));
}

export class CutBody {
  /**
   * @param {object} o
   * @param {number} o.w ширина продукта, u
   * @param {number} o.d глубина продукта, u
   * @param {string} [o.profile] rectangle | oval | carrot | egg
   * @param {number} [o.qty] сколько штук лежит рядом (друг под другом по z)
   * @param {number} [o.gap] зазор между штуками, u
   * @param {number} [o.cell] размер клетки, u
   * @param {boolean} [o.spare] место справа под замену куска, утащенного котом
   */
  constructor({ w, d, profile = 'rectangle', qty = 1, gap = 0.7, cell = CELL, spare = true }) {
    this.cell = cell;
    this.shape = { w, d, profile };
    const n = Math.max(1, qty | 0);
    const total = n * d + (n - 1) * gap;
    this.spareX = w / 2 + gap; // левый край запасного места
    this.cols = Math.ceil((w + (spare ? gap + w : 0)) / cell) + 2;
    this.rows = Math.ceil(total / cell) + 2;
    this.x0 = -w / 2 - cell;
    this.z0 = -total / 2 - cell;
    const N = this.cols * this.rows;
    this.mask = new Uint8Array(N); // 1 — есть продукт
    this.owner = new Int16Array(N).fill(-1); // какой штуке принадлежит клетка
    this.cutH = new Uint8Array(N); // разорвана связь (c,r)–(c+1,r)
    this.cutV = new Uint8Array(N); // разорвана связь (c,r)–(c,r+1)
    this.copies = []; // { cx, cz, cells, fresh }
    this.version = 0;
    this._cache = null;
    for (let i = 0; i < n; i++) {
      const cz = -total / 2 + d / 2 + i * (d + gap);
      this._stamp((x, z) => Math.abs(z - cz) <= halfDepth(this.shape, x), { cx: 0, cz });
    }
  }

  /** Центр клетки (c, r), u. */
  center(c, r) {
    return { x: this.x0 + (c + 0.5) * this.cell, z: this.z0 + (r + 0.5) * this.cell };
  }

  /** Клетка под точкой или null. */
  cellAt(x, z) {
    const c = Math.floor((x - this.x0) / this.cell), r = Math.floor((z - this.z0) / this.cell);
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows ? r * this.cols + c : null;
  }

  /** Есть ли продукт под точкой (u). */
  solidAt(x, z) {
    const i = this.cellAt(x, z);
    return i != null && this.mask[i] === 1;
  }

  _stamp(inside, meta) {
    const id = this.copies.length;
    let cells = 0;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (this.mask[i]) continue;
        const p = this.center(c, r);
        if (!inside(p.x, p.z, c, r)) continue;
        this.mask[i] = 1;
        this.owner[i] = id;
        this.cutH[i] = 0;
        this.cutV[i] = 0;
        if (c > 0) this.cutH[i - 1] = 0;
        if (r > 0) this.cutV[i - this.cols] = 0;
        cells++;
      }
    this.copies.push({ cx: meta.cx, cz: meta.cz, cells, fresh: !!meta.fresh });
    this._changed();
    return id;
  }

  _changed() {
    this.version++;
    this._cache = null;
  }

  /**
   * Лезвие прошло от a до b ({x, z}, u). Рвёт пересечённые связи между клетками продукта.
   * @returns {number} сколько связей разорвано (0 — нож прошёл мимо продукта или по уже разрезанному)
   */
  cutSegment(a, b) {
    // микросдвиг: след никогда не идёт ровно через центры клеток — иначе на стыках коротких
    // отрезков знаки расходятся и между кусками остаётся «перемычка»
    a = { x: a.x + 3.1e-6, z: a.z + 1.7e-6 };
    b = { x: b.x + 3.1e-6, z: b.z + 1.7e-6 };
    const { cols, rows, cell: cs, x0, z0, mask, cutH, cutV } = this;
    const c0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - x0) / cs) - 1);
    const c1 = Math.min(cols - 1, Math.floor((Math.max(a.x, b.x) - x0) / cs) + 1);
    const r0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - z0) / cs) - 1);
    const r1 = Math.min(rows - 1, Math.floor((Math.max(a.z, b.z) - z0) / cs) + 1);
    let n = 0;
    for (let r = r0; r <= r1; r++) {
      const pz = z0 + (r + 0.5) * cs;
      for (let c = c0; c <= c1; c++) {
        const i = r * cols + c;
        if (!mask[i]) continue;
        const px = x0 + (c + 0.5) * cs;
        if (c + 1 < cols && mask[i + 1] && !cutH[i] && crosses(a, b, px, pz, px + cs, pz)) {
          cutH[i] = 1;
          n++;
        }
        if (r + 1 < rows && mask[i + cols] && !cutV[i] && crosses(a, b, px, pz, px, pz + cs)) {
          cutV[i] = 1;
          n++;
        }
      }
    }
    if (n) this._changed();
    return n;
  }

  /**
   * Куски — связные области. Каждый: { id, cells, area, x, z, w, d (рамка, u), cx, cz (центр масс),
   * elong (вытянутость ≥ 1), edge (есть кожура/край исходного продукта), copy, m (центр исходной штуки), fresh }.
   */
  pieces() {
    if (this._cache) return this._cache;
    const { cols, rows, mask, cutH, cutV, cell: cs, x0, z0 } = this;
    const label = new Int32Array(cols * rows).fill(-1);
    const out = [];
    const stack = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || label[s] >= 0) continue;
      const id = out.length;
      label[s] = id;
      stack.push(s);
      let n = 0, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, edge = 0;
      let cmin = cols, cmax = -1, rmin = rows, rmax = -1;
      while (stack.length) {
        const j = stack.pop();
        const c = j % cols, r = (j / cols) | 0;
        const px = c + 0.5, pz = r + 0.5;
        n++;
        sx += px;
        sz += pz;
        sxx += px * px;
        szz += pz * pz;
        sxz += px * pz;
        if (c < cmin) cmin = c;
        if (c > cmax) cmax = c;
        if (r < rmin) rmin = r;
        if (r > rmax) rmax = r;
        const own = this.owner[j];
        // край исходной штуки: сосед — пустота (не другой кусок той же штуки)
        if (!edge && ((c + 1 >= cols || this.owner[j + 1] !== own) || (c === 0 || this.owner[j - 1] !== own) || (r + 1 >= rows || this.owner[j + cols] !== own) || (r === 0 || this.owner[j - cols] !== own))) edge = 1;
        if (c + 1 < cols && mask[j + 1] && !cutH[j] && label[j + 1] < 0) {
          label[j + 1] = id;
          stack.push(j + 1);
        }
        if (c > 0 && mask[j - 1] && !cutH[j - 1] && label[j - 1] < 0) {
          label[j - 1] = id;
          stack.push(j - 1);
        }
        if (r + 1 < rows && mask[j + cols] && !cutV[j] && label[j + cols] < 0) {
          label[j + cols] = id;
          stack.push(j + cols);
        }
        if (r > 0 && mask[j - cols] && !cutV[j - cols] && label[j - cols] < 0) {
          label[j - cols] = id;
          stack.push(j - cols);
        }
      }
      const mx = sx / n, mz = sz / n;
      // вытянутость: корень из отношения главных моментов (1 — круг/квадрат, 6 — полоска 1×6)
      const vxx = sxx / n - mx * mx + 1 / 12, vzz = szz / n - mz * mz + 1 / 12, vxz = sxz / n - mx * mz;
      const tr = vxx + vzz, det = vxx * vzz - vxz * vxz;
      const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
      const l1 = tr / 2 + disc, l2 = Math.max(1e-9, tr / 2 - disc);
      const copy = this.owner[s];
      const cp = this.copies[copy];
      out.push({
        id,
        cells: n,
        area: n * cs * cs,
        x: x0 + cmin * cs,
        z: z0 + rmin * cs,
        w: (cmax - cmin + 1) * cs,
        d: (rmax - rmin + 1) * cs,
        cx: x0 + mx * cs,
        cz: z0 + mz * cs,
        elong: Math.sqrt(l1 / l2),
        edge: !!edge,
        copy,
        m: { cx: cp.cx, cz: cp.cz },
        fresh: cp.fresh && n >= cp.cells * 0.9,
        c0: cmin,
        c1: cmax,
        r0: rmin,
        r1: rmax,
      });
    }
    this._label = label;
    this._cache = out;
    return out;
  }

  /** Общая площадь продукта на доске, u². */
  area() {
    let n = 0;
    for (let i = 0; i < this.mask.length; i++) n += this.mask[i];
    return n * this.cell * this.cell;
  }

  /**
   * Крошки осыпаются с доски: кусок меньше minArea или тоньше minThick (стружка с края).
   * @returns {{x:number, z:number, area:number}[]} что осыпалось
   */
  sweep(minArea, minThick = 0) {
    const crumbs = [];
    for (const p of this.pieces()) {
      if (p.area >= minArea && Math.sqrt(p.area / p.elong) >= minThick) continue;
      crumbs.push({ x: p.cx, z: p.cz, area: p.area });
      this._clear(p);
    }
    if (crumbs.length) this._changed();
    return crumbs;
  }

  _clear(p) {
    const label = this._label;
    for (let r = p.r0; r <= p.r1; r++)
      for (let c = p.c0; c <= p.c1; c++) {
        const i = r * this.cols + c;
        if (label[i] === p.id) this.mask[i] = 0;
      }
  }

  /**
   * Убрать кусок с доски (кот утащил). Возвращает образец для замены: клетки относительно рамки куска.
   */
  removePiece(id) {
    const p = this.pieces().find((q) => q.id === id);
    if (!p) return null;
    const cells = [];
    const label = this._label;
    for (let r = p.r0; r <= p.r1; r++)
      for (let c = p.c0; c <= p.c1; c++) if (label[r * this.cols + c] === p.id) cells.push([c - p.c0, r - p.r0]);
    const pattern = { cells, w: p.w, d: p.d, area: p.area, m: { cx: p.m.cx - p.x, cz: p.m.cz - p.z } };
    this._clear(p);
    this._changed();
    return pattern;
  }

  /** Положить замену рядом справа, по образцу утащенного куска. Её нужно дорезать (fresh). */
  addPattern(pattern) {
    const cs = this.cell;
    const pc0 = Math.max(0, Math.ceil((this.spareX - this.x0) / cs));
    const pw = Math.round(pattern.w / cs), pd = Math.round(pattern.d / cs);
    const c0 = Math.min(this.cols - pw, pc0);
    const r0 = Math.max(0, Math.round(this.rows / 2 - pd / 2));
    const set = new Set(pattern.cells.map(([c, r]) => (r0 + r) * this.cols + (c0 + c)));
    const x = this.x0 + c0 * cs, z = this.z0 + r0 * cs;
    return this._stamp((px, pz, c, r) => set.has(r * this.cols + c), { cx: x + pattern.m.cx, cz: z + pattern.m.cz, fresh: true });
  }

  /**
   * Контур куска: [{x, z, o}] в u (o — вершина на кожуре/исходном крае). Против часовой стрелки
   * в осях (x вправо, z вверх); углы чуть скошены, ступеньки сетки спрямлены.
   */
  contour(p, { bevel = 0.06 } = {}) {
    this.pieces();
    const { cols, rows, cell: cs, x0, z0, mask } = this;
    const label = this._label;
    const inP = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && label[r * cols + c] === p.id;
    const skin = (c, r) => (c < 0 || r < 0 || c >= cols || r >= rows || !mask[r * cols + c] ? 1 : 0);
    const W = cols + 1;
    const edges = [];
    const from = new Map();
    const add = (i0, j0, i1, j1, sk) => {
      const e = { i0, j0, i1, j1, sk, used: false };
      const k = j0 * W + i0;
      (from.get(k) ?? from.set(k, []).get(k)).push(e);
      edges.push(e);
    };
    for (let r = p.r0; r <= p.r1; r++)
      for (let c = p.c0; c <= p.c1; c++) {
        if (!inP(c, r)) continue;
        if (!inP(c, r - 1)) add(c, r, c + 1, r, skin(c, r - 1));
        if (!inP(c + 1, r)) add(c + 1, r, c + 1, r + 1, skin(c + 1, r));
        if (!inP(c, r + 1)) add(c + 1, r + 1, c, r + 1, skin(c, r + 1));
        if (!inP(c - 1, r)) add(c, r + 1, c, r, skin(c - 1, r));
      }
    // обход: на развилке (куски касаются углом) поворачиваем влево — петли не слипаются
    let best = null, bestArea = -Infinity;
    for (const e0 of edges) {
      if (e0.used) continue;
      const loop = [];
      let e = e0;
      while (e && !e.used) {
        e.used = true;
        loop.push(e);
        const cand = (from.get(e.j1 * W + e.i1) ?? []).filter((q) => !q.used);
        if (cand.length <= 1) e = cand[0] ?? null;
        else {
          const dx = e.i1 - e.i0, dz = e.j1 - e.j0;
          const pick = (tx, tz) => cand.find((q) => q.i1 - q.i0 === tx && q.j1 - q.j0 === tz);
          e = pick(-dz, dx) ?? pick(dx, dz) ?? pick(dz, -dx) ?? cand[0];
        }
      }
      let a = 0;
      for (const q of loop) a += q.i0 * q.j1 - q.i1 * q.j0;
      if (a > bestArea) {
        bestArea = a;
        best = loop;
      }
    }
    if (!best) return [];
    // вершины в углах ступенек; o — оба прилегающих ребра на кожуре
    const n = best.length;
    let pts = best.map((e, k) => ({ x: x0 + e.i0 * cs, z: z0 + e.j0 * cs, o: best[(k - 1 + n) % n].sk && e.sk ? 1 : 0 }));
    pts = dropCollinear(pts);
    pts = simplifyClosed(pts, cs * 0.75);
    return bevel > 0 ? bevelCorners(pts, bevel) : pts;
  }
}

function dropCollinear(pts) {
  const out = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[(k - 1 + n) % n], b = pts[k], c = pts[(k + 1) % n];
    if (Math.abs(orient(a.x, a.z, b.x, b.z, c.x, c.z)) < 1e-12 && a.o === b.o && b.o === c.o) continue;
    out.push(b);
  }
  return out.length >= 3 ? out : pts;
}

// Рамер — Дуглас — Пейкер для замкнутого контура.
function simplifyClosed(pts, eps) {
  if (pts.length <= 4) return pts;
  let far = 0, fd = -1;
  for (let k = 1; k < pts.length; k++) {
    const d = (pts[k].x - pts[0].x) ** 2 + (pts[k].z - pts[0].z) ** 2;
    if (d > fd) {
      fd = d;
      far = k;
    }
  }
  const a = rdp(pts.slice(0, far + 1), eps);
  const b = rdp([...pts.slice(far), pts[0]], eps);
  const out = [...a.slice(0, -1), ...b.slice(0, -1)];
  return out.length >= 3 ? out : pts;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const L = Math.hypot(b.x - a.x, b.z - a.z) || 1e-9;
  let idx = -1, dmax = -1;
  for (let k = 1; k < pts.length - 1; k++) {
    // смена кожура/срез — всегда сохраняем вершину
    const d = pts[k].o !== pts[k - 1].o || pts[k].o !== pts[k + 1].o ? Infinity : Math.abs(orient(a.x, a.z, b.x, b.z, pts[k].x, pts[k].z)) / L;
    if (d > dmax) {
      dmax = d;
      idx = k;
    }
  }
  if (dmax <= eps) return [a, b];
  const l = rdp(pts.slice(0, idx + 1), eps);
  const r = rdp(pts.slice(idx), eps);
  return [...l.slice(0, -1), ...r];
}

// Скошенные углы: настоящие кубики не бывают острыми, как бумага.
function bevelCorners(pts, size) {
  const out = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[(k - 1 + n) % n], b = pts[k], c = pts[(k + 1) % n];
    const la = Math.hypot(b.x - a.x, b.z - a.z), lc = Math.hypot(c.x - b.x, c.z - b.z);
    const s1 = Math.min(size, la / 3), s2 = Math.min(size, lc / 3);
    if (s1 < 1e-6 || s2 < 1e-6) {
      out.push(b);
      continue;
    }
    out.push({ x: b.x + ((a.x - b.x) / la) * s1, z: b.z + ((a.z - b.z) / la) * s1, o: a.o && b.o ? 1 : 0 });
    out.push({ x: b.x + ((c.x - b.x) / lc) * s2, z: b.z + ((c.z - b.z) / lc) * s2, o: b.o && c.o ? 1 : 0 });
  }
  return out;
}

/**
 * Качество нарезки кубиком по кускам на доске.
 * Хороший кусок: размер √площади в [min, max] и вытянутость ≤ elong. Мелкие края с кожурой — обрезки
 * без штрафа до allowance исходной площади.
 * @returns {{score:number, neat:number, trims:number, allowed:number, pieces:number, spread:number}}
 */
export function rasterQuality(pieces, initialArea, tol, allowance) {
  let total = 0, good = 0, trims = 0, neat = 0;
  const sizes = [];
  for (const p of pieces) {
    total += p.area;
    const e = Math.sqrt(p.area);
    const ok = e >= tol.min && e <= tol.max && p.elong <= tol.elong;
    if (ok) {
      good += p.area;
      neat++;
      sizes.push(e);
    } else if (p.edge && e <= tol.max) trims += p.area;
  }
  if (total <= 1e-9) return { score: 0, neat: 0, trims: 0, allowed: 0, pieces: 0, spread: 0 };
  const allowed = Math.min(trims, allowance * initialArea);
  const mean = sizes.reduce((a, b) => a + b, 0) / (sizes.length || 1);
  const spread = sizes.length ? Math.sqrt(sizes.reduce((a, b) => a + (b - mean) ** 2, 0) / sizes.length) / mean : 0;
  return { score: Math.min(1, (good + allowed) / total), neat, trims, allowed, pieces: pieces.length, spread };
}
