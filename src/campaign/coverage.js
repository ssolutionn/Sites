// Маска покрытия поверхности (намазывание, маринад, слой, мытьё, уборка).
// Логика и изображение используют одну сетку: повторный проход не даёт больше 100 %.

export class CoverageMask {
  constructor({ cols, rows, width, depth, brush, shape = 'rect', zones = null, maxLevel = 1 }) {
    Object.assign(this, { cols, rows, width, depth, brush, shape, maxLevel });
    this.level = new Float32Array(cols * rows);
    this.valid = new Uint8Array(cols * rows);
    this.zone = zones ? new Int8Array(cols * rows).fill(-1) : null;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const { x, z } = this.cellCenter(c, r);
        let ok = true;
        if (shape === 'ellipse') ok = (x / (width / 2)) ** 2 + (z / (depth / 2)) ** 2 <= 1;
        if (ok && zones) {
          const zi = zones.findIndex((zn) => ((x - zn.x) / zn.rx) ** 2 + ((z - zn.z) / zn.rz) ** 2 <= 1);
          this.zone[r * cols + c] = zi;
          ok = zi >= 0;
        }
        this.valid[r * cols + c] = ok ? 1 : 0;
      }
    this.validCount = this.valid.reduce((a, b) => a + b, 0);
    this.version = 0;
  }

  cellCenter(c, r) {
    return { x: ((c + 0.5) / this.cols - 0.5) * this.width, z: ((r + 0.5) / this.rows - 0.5) * this.depth };
  }

  // Мазок кистью в локальных координатах поверхности (центр = 0,0). Возвращает новое покрытие.
  stroke(x, z, amount = 0.5) {
    let gained = 0;
    const b2 = this.brush * this.brush;
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const i = r * this.cols + c;
        if (!this.valid[i]) continue;
        const p = this.cellCenter(c, r);
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d2 > b2) continue;
        const before = this.level[i];
        const add = amount * (1 - Math.sqrt(d2) / this.brush * 0.5);
        this.level[i] = Math.min(this.maxLevel, before + add);
        gained += Math.min(1, this.level[i]) - Math.min(1, before);
      }
    if (gained > 0) this.version++;
    return gained;
  }

  // Отрезок мазка: шагом в полкисти, чтобы быстрое движение не оставляло пропусков.
  strokeLine(a, b, amount = 0.5) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(d / (this.brush * 0.5)));
    let g = 0;
    for (let i = 1; i <= n; i++) g += this.stroke(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, amount / Math.max(1, n / 2));
    return g;
  }

  // Доля покрытой поверхности (клетка считается покрытой от 0.5).
  coverage() {
    let n = 0;
    for (let i = 0; i < this.level.length; i++) if (this.valid[i] && this.level[i] >= 0.5) n++;
    return this.validCount ? n / this.validCount : 0;
  }

  // Равномерность: 1 — ровный слой, ниже — пятна разной толщины.
  evenness() {
    let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < this.level.length; i++) {
      if (!this.valid[i]) continue;
      const v = Math.min(1, this.level[i]);
      s += v;
      s2 += v * v;
      n++;
    }
    if (!n) return 0;
    const mean = s / n;
    const sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
    return Math.max(0, 1 - sd * 1.6);
  }

  zoneCoverage() {
    if (!this.zone) return [];
    const tot = [], cov = [];
    for (let i = 0; i < this.level.length; i++) {
      const z = this.zone[i];
      if (z < 0) continue;
      tot[z] = (tot[z] ?? 0) + 1;
      if (this.level[i] >= 0.5) cov[z] = (cov[z] ?? 0) + 1;
    }
    return tot.map((t, i) => (cov[i] ?? 0) / t);
  }

  fill(v = 1) {
    for (let i = 0; i < this.level.length; i++) if (this.valid[i]) this.level[i] = v;
    this.version++;
  }
}
