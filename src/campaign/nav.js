// Навигация по сетке с препятствиями (A* + сглаживание по прямой видимости).
// Препятствия: прямоугольники и круги в плоскости XZ, расширенные на радиус героини.

export class NavGrid {
  constructor({ minX, maxX, minZ, maxZ, cell = 0.1, radius = 0.2 }) {
    Object.assign(this, { minX, maxX, minZ, maxZ, cell, radius });
    this.cols = Math.round((maxX - minX) / cell) + 1;
    this.rows = Math.round((maxZ - minZ) / cell) + 1;
    this.static = new Uint8Array(this.cols * this.rows);
    this.dynamic = new Map(); // id -> {x,z,r}
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  idx(c, r) {
    return r * this.cols + c;
  }
  cellOf(x, z) {
    return { c: Math.round((x - this.minX) / this.cell), r: Math.round((z - this.minZ) / this.cell) };
  }
  pos(c, r) {
    return { x: this.minX + c * this.cell, z: this.minZ + r * this.cell };
  }
  inside(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  addRect(x0, z0, x1, z1) {
    const m = this.radius;
    this._mark((x, z) => x >= x0 - m && x <= x1 + m && z >= z0 - m && z <= z1 + m);
  }
  addCircle(cx, cz, rad) {
    const m = rad + this.radius;
    this._mark((x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= m * m);
  }
  _mark(fn) {
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const p = this.pos(c, r);
        if (fn(p.x, p.z)) this.static[this.idx(c, r)] = 1;
      }
    this._rebuild();
  }

  setDynamic(id, circle) {
    if (circle) this.dynamic.set(id, circle);
    else this.dynamic.delete(id);
    this._rebuild();
  }

  _rebuild() {
    this.blocked.set(this.static);
    for (const { x, z, r: rad } of this.dynamic.values()) {
      const m = rad + this.radius * 0.6;
      for (let r = 0; r < this.rows; r++)
        for (let c = 0; c < this.cols; c++) {
          const p = this.pos(c, r);
          if ((p.x - x) ** 2 + (p.z - z) ** 2 <= m * m) this.blocked[this.idx(c, r)] = 1;
        }
    }
  }

  isFree(x, z) {
    const { c, r } = this.cellOf(x, z);
    return this.inside(c, r) && !this.blocked[this.idx(c, r)];
  }

  // Ближайшая свободная клетка (для старта, если героиня стоит у края препятствия).
  nearestFree(x, z, maxRing = 6) {
    const { c, r } = this.cellOf(x, z);
    for (let ring = 0; ring <= maxRing; ring++)
      for (let dr = -ring; dr <= ring; dr++)
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const cc = c + dc, rr = r + dr;
          if (this.inside(cc, rr) && !this.blocked[this.idx(cc, rr)]) return { c: cc, r: rr };
        }
    return null;
  }

  lineFree(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / (this.cell * 0.4)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this.isFree(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  }

  // Путь в метрах, без стартовой точки. null — недостижимо.
  findPath(from, to) {
    const goal = this.cellOf(to.x, to.z);
    if (!this.inside(goal.c, goal.r) || this.blocked[this.idx(goal.c, goal.r)]) return null;
    const start = this.isFree(from.x, from.z) ? this.cellOf(from.x, from.z) : this.nearestFree(from.x, from.z);
    if (!start) return null;
    const N = this.cols * this.rows;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const open = [];
    const s = this.idx(start.c, start.r), goalI = this.idx(goal.c, goal.r);
    g[s] = 0;
    const h = (i) => Math.hypot((i % this.cols) - goal.c, Math.floor(i / this.cols) - goal.r);
    open.push({ i: s, f: h(s) });
    const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
    let found = false;
    while (open.length) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
      const { i } = open[bi];
      open.splice(bi, 1);
      if (closed[i]) continue;
      if (i === goalI) { found = true; break; }
      closed[i] = 1;
      const c = i % this.cols, r = Math.floor(i / this.cols);
      for (const [dc, dr, cost] of dirs) {
        const cc = c + dc, rr = r + dr;
        if (!this.inside(cc, rr)) continue;
        const j = this.idx(cc, rr);
        if (this.blocked[j] || closed[j]) continue;
        if (dc && dr && (this.blocked[this.idx(c + dc, r)] || this.blocked[this.idx(c, r + dr)])) continue;
        const ng = g[i] + cost;
        if (ng < g[j]) {
          g[j] = ng;
          came[j] = i;
          open.push({ i: j, f: ng + h(j) });
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let i = goalI; i !== -1; i = came[i]) cells.push(this.pos(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    cells[cells.length - 1] = { x: to.x, z: to.z };
    // сглаживание: прямые отрезки, если нет препятствий
    const pts = [{ x: from.x, z: from.z }, ...cells];
    const out = [];
    let a = 0;
    while (a < pts.length - 1) {
      let b = pts.length - 1;
      while (b > a + 1 && !this.lineFree(pts[a], pts[b])) b--;
      out.push(pts[b]);
      a = b;
    }
    return out;
  }
}
