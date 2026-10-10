// Доска: нарезка кубиками (по реальному контуру), кружочки, тёрка.
import { PRODUCTS } from './data.js';
import { initialBatch, cutLine, totalVolume, largestPiece, pieceVolume, placeBeside, recenter } from '../game/cutting.js';
import { Stroke, classifyCut, CUT_HINTS, CUT_RULES } from './gestures.js';
import { CoverageMask } from './coverage.js';
import { CutBody, rasterQuality } from '../game/raster-cut.js';
import { pieceStats } from './observations.js';
import { TEMPTING } from './st-extra.js';
import { makeRoundLog, cutRound, roundSlices, roundQuality, cutQuality, Grater } from './mechanics.js';

export const BOARD_UNIT = 0.021; // метров сцены на 1 см продукта (u); целевой кубик оливье — 1 см

export const boardMethods = {
  boardTasks() {
    const out = [];
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      for (const s of dish.recipe.steps) {
        if (s.type !== 'cut' && s.type !== 'grate' && s.type !== 'peel') continue;
        const state = this.stepState(dishId, s.id);
        if (state === 'skipped') continue;
        const key = `${dishId}:${s.id}`;
        out.push({ key, dishId, stepId: s.id, product: s.product, qty: s.qty ?? 1, type: s.type, shape: s.shape, state, started: !!this.board.items[key], block: state === 'ready' ? null : this.stepBlock(dishId, s.id) });
      }
    }
    return out;
  },

  boardCur() {
    return this.board.current ? this.board.items[this.board.current] ?? null : null;
  },

  _boardHasMaterial(it) {
    if (it.grater) return !it.grater.complete;
    if (it.peel) return !it.peeled;
    if (it.log) return it.log.segments.length > 0;
    return it.pieces?.length > 0;
  },

  boardSelect(key) {
    if (!this._isIdleAt('board') || this.action) return false;
    if (this.board.items[key]) {
      this.board.current = key;
      this._emit('boardSwitch', { key });
      return true;
    }
    const [dishId, stepId] = key.split(':');
    const step = this.stepDef(dishId, stepId);
    if (!step) return false;
    const block = this.stepBlock(dishId, stepId) || this._hotBlock(step.product) || this._boardDirtyBlock(step.product);
    if (block) {
      this.setHint(block);
      return false;
    }
    if (!this._reserveStep(dishId, stepId)) return false;
    const prod = PRODUCTS[step.product];
    const qty = step.qty ?? 1; // один заход — вся порция рецепта: копии лежат рядом
    // size — сторона кубика по рецепту, см (оливье 1, канапе 2,5)
    const it = { key, dishId, stepId, product: step.product, qty, type: step.type, shape: step.shape, size: step.size ?? 1, cuts: 0, missing: [], freshIds: new Set() };
    if (step.type === 'grate') {
      it.grater = new Grater(this.cfg.grate, this.cfg.grate.cyclesPerPortion * qty);
    } else if (step.shape === 'round' && step.type !== 'peel') {
      it.log = makeRoundLog(prod.round.length * qty);
      it.radius = prod.round.radius;
      it.initVolume = prod.round.length * qty;
    } else {
      // продукт — сетка клеток: нож режет там, где прошёл (raster-cut.js); при чистке — целые штуки рядом
      it.body = new CutBody({ w: prod.cut.w, d: prod.cut.d, profile: prod.cut.profile, qty, gap: this.cfg.batchGap });
      it.pieces = it.body.pieces();
      it.initVolume = it.body.area();
      it.angle = 0;
      it.angleTarget = 0;
      if (step.type === 'peel') it.peel = this._peelMask(it.pieces);
    }
    this.board.items[key] = it;
    this.board.current = key;
    this._emit('boardSwitch', { key, fresh: true });
    if (!this.tutorialSeen.has(step.type + (step.shape ?? ''))) {
      this.tutorialSeen.add(step.type + (step.shape ?? ''));
      this._emit('tutorial', { topic: step.type === 'grate' ? 'grate' : step.type === 'peel' ? 'peel' : step.shape === 'round' ? 'round' : 'cube' });
    }
    return true;
  },

  // Доска после сельди или свёклы: другой продукт на ней не режем, пока не помоешь.
  _boardDirtyBlock(product) {
    const b = this.equipment.board;
    if (!b || b.clean || this.practice || b.by === product) return null;
    return `Доска ${b.by === 'beet' ? 'в свёкле' : 'пахнет селёдкой'} — помой её у раковины`;
  },

  // Нож ведут мышью: нажал — лезвие на продукте, провёл — разрез, отпустил — готово.
  // Сам росчерк хранится в board.stroke (единицы доски), его же рисует сцена.
  _boardPointer(type, x, z) {
    const it = this.boardCur();
    if (!it) return 'ignored';
    const ux = x / BOARD_UNIT, uz = z / BOARD_UNIT;
    if (it.body) {
      // доска повёрнута: точку мыши — в систему продукта
      const a = it.angle ?? 0, c = Math.cos(a), sn = Math.sin(a);
      const px = ux * c - uz * sn, pz = ux * sn + uz * c;
      if (it.peel) return this._peelPointer(it, type, px * BOARD_UNIT, pz * BOARD_UNIT);
      return this._knifePointer(it, type, px, pz, ux, uz);
    }
    if (it.grater) {
      if (type === 'down' || (type === 'move' && this.pointerDown)) {
        if (this.action) return 'ignored';
        const counted = it.grater.move(z);
        if (counted) {
          this._emit('grate', { key: it.key, done: it.grater.done, of: it.grater.cycles });
          if (it.grater.complete) this._grateComplete(it);
        }
        return counted ? 'cycle' : 'grating';
      }
      return 'idle';
    }
    if (type === 'down') {
      if (this.action) return 'ignored';
      this.board.stroke = new Stroke();
      this.board.stroke.add(ux, uz, this.clock);
      return 'stroke';
    }
    if (type === 'move') {
      if (!this.pointerDown || !this.board.stroke) return 'hover';
      this.board.stroke.add(ux, uz, this.clock);
      return 'stroke';
    }
    if (type === 'up') {
      const stroke = this.board.stroke;
      this.board.stroke = null;
      if (!stroke || this.action) return 'ignored';
      stroke.add(ux, uz, this.clock);
      return this._strokeCut(it, stroke);
    }
    return 'hover';
  },

  // Нож по сетке: зажала — лезвие на доске, ведёшь — режет там, где прошло, по ходу движения.
  // Прямо — ровно, наискосок — косо, дрогнула рука — кривой кусок; зигзаг «рубка» режет каждым взмахом.
  // (px, pz) — в системе продукта, (bx, bz) — в координатах доски (для вида ножа).
  _knifePointer(it, type, px, pz, bx, bz) {
    const b = this.board;
    if (type === 'down') {
      if (this.action) return 'ignored';
      b.stroke = new Stroke();
      b.stroke.add(bx, bz, this.clock);
      b.knife = { x: px, z: pz, hit: it.body.solidAt(px, pz), moved: 0 };
      return 'stroke';
    }
    if (type === 'move') {
      if (!this.pointerDown || !b.knife || this.action) return 'hover';
      b.stroke?.add(bx, bz, this.clock);
      const last = b.knife;
      const seg = Math.hypot(px - last.x, pz - last.z);
      if (seg < 1e-4) return 'stroke';
      const n = it.body.cutSegment(last, { x: px, z: pz });
      b.knife = { x: px, z: pz, hit: last.hit || n > 0 || it.body.solidAt(px, pz), moved: last.moved + seg };
      if (n) this._afterKnife(it, px, pz, bx, bz);
      return n ? 'cutting' : 'stroke';
    }
    if (type === 'up') {
      const k = b.knife;
      b.knife = null;
      b.stroke = null;
      if (k && !k.hit && k.moved > 1.5) return this._cutDenied('outside');
      return 'up';
    }
    return 'hover';
  },

  _afterKnife(it, px, pz, bx, bz) {
    const before = it.pieces.length;
    const crumbs = it.body.sweep(this.cfg.crumbs.area, this.cfg.crumbs.thick);
    it.pieces = it.body.pieces();
    if (crumbs.length) this._emit('crumbs', { key: it.key, list: crumbs });
    if (it.pieces.length > before) {
      it.cuts++;
      this._emit('cut', { key: it.key, x: bx, z: bz, px, pz, count: it.pieces.length - before });
    }
  },

  /** Повернуть доску на четверть оборота: dir = 1 — против часовой (A), −1 — по часовой (D). */
  boardTurn(dir) {
    const it = this.boardCur();
    if (!it || !this._isIdleAt('board')) return false;
    if (!it.body) {
      this.setHint(it.log ? 'Кружочки режутся только поперёк — веди нож сверху вниз' : 'Тёрку не поворачивают', 2);
      return false;
    }
    const q = Math.PI / 2;
    const base = it.angleTarget ?? it.angle ?? 0;
    const k = dir > 0 ? Math.floor(base / q + 1e-6) + 1 : Math.ceil(base / q - 1e-6) - 1;
    it.angleTarget = k * q;
    this._emit('rotate', { key: it.key, dir });
    return true;
  },

  /** Свободный поворот доски, пока держат A/D: угол меняется плавно, без щелчков. */
  boardSpin(dir, dt) {
    const it = this.boardCur();
    if (!it?.body || !this._isIdleAt('board')) return false;
    it.angle = (it.angle ?? 0) + dir * this.cfg.board.spin * dt;
    it.angleTarget = it.angle;
    return true;
  },

  // Плавный доворот до целевого угла (тап по A/D).
  _updateBoard(h) {
    const it = this.boardCur();
    if (!it?.body || it.angleTarget == null) return;
    const d = it.angleTarget - it.angle;
    if (Math.abs(d) < 1e-4) {
      it.angle = it.angleTarget;
      return;
    }
    const step = this.cfg.board.turn * h;
    it.angle += Math.abs(d) <= step ? d : Math.sign(d) * step;
  },

  // Маска чистки: по эллипсу на каждый продукт, в метрах от центра доски.
  _peelMask(pieces) {
    const c = this.cfg.peel;
    const U = BOARD_UNIT;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pieces) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x + p.w);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z + p.d);
    }
    const half = (a, b) => Math.max(Math.abs(a), Math.abs(b)) * U + 0.01;
    const zones = pieces.map((p) => ({ x: (p.x + p.w / 2) * U, z: (p.z + p.d / 2) * U, rx: (p.w / 2) * U, rz: (p.d / 2) * U }));
    return new CoverageMask({ cols: c.cols, rows: c.rows, width: half(minX, maxX) * 2, depth: half(minZ, maxZ) * 2, brush: c.brush, zones });
  },

  // Чистка: зажми и веди ножом по продукту. Кожура снимается полосками; почистила — можно резать.
  _peelPointer(it, type, x, z) {
    if (this.action) return 'ignored';
    if (type === 'up') {
      this.board.peelLast = null;
      return 'up';
    }
    if (type === 'down') this.board.peelLast = { x, z };
    if (!this.pointerDown) return 'hover';
    const last = this.board.peelLast ?? { x, z };
    const gain = it.peel.strokeLine(last, { x, z }, this.cfg.peel.amount, { spread: false });
    this.board.peelLast = { x, z };
    if (gain > 0) this._emit('peel', { key: it.key, x, z, coverage: it.peel.coverage() });
    if (it.peel.coverage() >= this.cfg.peel.complete) this._peelComplete(it);
    return gain > 0 ? 'peel' : 'hover';
  },

  _peelComplete(it) {
    if (it.peeled) return;
    it.peeled = true;
    this.board.peelLast = null;
    this._completeStep(it.dishId, it.stepId, 1);
    delete this.board.items[it.key];
    this.board.current = null;
    this._emit('peeled', { key: it.key, product: it.product });
    this.setHint(`${PRODUCTS[it.product]?.peelDone?.[it.qty > 1 ? 1 : 0] ?? 'Почищено'} — теперь можно резать`, 2.5);
    // очищенное остаётся на доске: следующий шаг с этим продуктом начинается сразу
    const next = this.dishes[it.dishId].recipe.steps.find((st) => (st.requires ?? []).includes(it.stepId) && st.type !== 'peel' && this.stepState(it.dishId, st.id) === 'ready' && ['cut', 'grate'].includes(st.type));
    if (next) this.boardSelect(`${it.dishId}:${next.id}`);
    this._afterStepProgress(it.dishId);
  },

  _cutRules() {
    return { ...CUT_RULES, ...(this.cfg.cutRules ?? {}) };
  },

  // Росчерк закончен: распознать линию и разрезать то, что оказалось под лезвием.
  _strokeCut(it, stroke) {
    const rules = this._cutRules();
    const line = classifyCut(stroke, { allow: it.log ? 'x' : 'both', rules });
    if (!line.ok) return this._cutDenied(line.reason);
    if (it.log) return this._roundCut(it, line, rules);
    return this._lineCut(it, line, rules);
  },

  _cutDenied(reason) {
    this.setHint(CUT_HINTS[reason] ?? CUT_HINTS.short, 2.2);
    this._emit('cutDenied', { reason });
    return reason;
  },

  _lineCut(it, line, rules) {
    const opts = { minWidth: this.cfg.minCutFraction, maxPieces: this.cfg.maxPiecesPerProduct, cover: rules.cover, nextId: () => 0 };
    const check = cutLine(it.pieces, line, opts);
    if (!check.ok) return this._cutDenied(check.reason);
    this._startAction('cut', this.cfg.knifeDuration, () => {
      if (this.board.items[it.key] !== it) return;
      const r = cutLine(it.pieces, line, { ...opts, nextId: () => this._id() });
      if (!r.ok) return;
      it.pieces = r.pieces;
      it.cuts++;
      for (const c of r.cuts) it.freshIds.delete(c.original.id);
      this._emit('cut', { key: it.key, axis: line.axis, pos: line.pos, x: line.axis === 'x' ? line.pos : null, count: r.cuts.length });
    }, { key: it.key, axis: line.axis, pos: line.pos, from: line.from, to: line.to, x: line.axis === 'x' ? line.pos : 0, z: line.axis === 'z' ? line.pos : 0 });
    return 'cut';
  },

  _roundCut(it, line, rules) {
    const r0 = it.radius;
    const covered = Math.max(0, Math.min(r0, line.to) - Math.max(-r0, line.from));
    if (line.to < -r0 || line.from > r0) return this._cutDenied('outside');
    if (covered / (2 * r0) < rules.cover) return this._cutDenied('short');
    const ux = line.pos;
    const r = cutRound(it.log, ux, this.cfg.roundTarget.minCut);
    if (!r.ok) return this._cutDenied(r.reason === 'outside' ? 'outside' : 'too-close');
    this._startAction('cut', this.cfg.knifeDuration, () => {
      if (this.board.items[it.key] !== it) return;
      const rr = cutRound(it.log, ux, this.cfg.roundTarget.minCut);
      if (!rr.ok) return;
      it.log = rr.log;
      it.cuts++;
      this._emit('cut', { key: it.key, axis: 'x', pos: ux, x: ux, round: true });
    }, { key: it.key, axis: 'x', pos: ux, from: line.from, to: line.to, x: ux, z: 0, round: true });
    return 'cut';
  },

  // R — то же, что D: четверть оборота по часовой.
  rotate() {
    return this.boardTurn(-1);
  },

  boardQuality(it) {
    if (it.log) return roundQuality(it.log, this.cfg.roundTarget, this.cfg.edgeTrimAllowance);
    if (it.body) {
      const t = this.cfg.tolerance, k = it.size ?? 1;
      return rasterQuality(it.pieces, it.initVolume, { min: t.min * k, max: t.max * k, elong: t.elong }, PRODUCTS[it.product].cut?.trim ?? this.cfg.edgeTrimAllowance);
    }
    return cutQuality(it.pieces, it.initVolume, this.cfg.tolerance, PRODUCTS[it.product].cut?.trim ?? this.cfg.edgeTrimAllowance);
  },

  transferBlock(it = this.boardCur()) {
    if (!it) return 'На доске пусто';
    if (it.peel) return `Почисти до конца: ${Math.round(it.peel.coverage() * 100)} из ${Math.round(this.cfg.peel.complete * 100)} %`;
    if (it.grater) return it.grater.complete ? this._destBlock(it) : `Натри до конца: ${it.grater.done} из ${it.grater.cycles} движений`;
    if (it.missing.length) return 'Кот утащил кусок — возьми замену';
    if (it.cuts < 1) return 'Сначала сделай хотя бы один разрез';
    if (it.log && roundSlices(it.log).length < 3) return 'Нарежь хотя бы несколько кружочков';
    if (it.body ? it.pieces.some((p) => p.fresh) : it.pieces?.some((p) => it.freshIds.has(p.id))) return 'Замену нужно дорезать';
    return this._destBlock(it);
  },

  _destBlock(it) {
    const step = this.stepDef(it.dishId, it.stepId);
    if (step.dest === 'bowl') return this._bowlBlock(it.dishId);
    return null;
  },

  boardTransfer() {
    if (!this._isIdleAt('board') || this.action) return false;
    const it = this.boardCur();
    const block = this.transferBlock(it);
    if (block) {
      this.setHint(block);
      return false;
    }
    const step = this.stepDef(it.dishId, it.stepId);
    const dish = this.dishes[it.dishId];
    let q = 1, info = {};
    if (!it.grater) {
      const quality = this.boardQuality(it);
      q = quality.score;
      info = { neat: quality.neat ?? quality.good, pieces: it.pieces?.length ?? roundSlices(it.log).length };
      if (it.body) info.stats = pieceStats(it.pieces, it.size ?? 1, this.cfg.tolerance, this.cfg.observe); // для замечаний после блюда
    }
    const moved = it.grater ? null : it.log ? roundSlices(it.log) : it.pieces.map((p) => ({ ...p }));
    if (step.dest === 'bowl') this._bowlReceive(it.dishId, { product: it.product, kind: it.grater ? 'grated' : 'pieces', pieces: moved });
    else if (step.dest === 'prepared') dish.prepared[it.stepId] = { product: it.product, q, kind: it.grater ? 'grated' : 'pieces' };
    else if (step.dest === 'pieces') dish.pieces[it.product] = (moved || []).map((p) => ({ ...p, product: it.product, used: false }));
    if (this.practice?.activity === 'speed') {
      // скоростная нарезка: аккуратно — следующий продукт, неаккуратно — этот же заново
      this.inventory.consume(this._opId(it.dishId, it.stepId));
      delete this.board.items[it.key];
      this.board.current = null;
      if (q >= 0.75) {
        this.dishes.practice.steps[it.stepId] = { done: true, q, info };
        this._emit('practiceResult', { q, info });
        const next = this.boardTasks().find((t) => t.state === 'ready');
        if (next) this.boardSelect(next.key);
        else this._emit('speedDone', { time: this.t });
      } else {
        this._emit('speedRetry', { q });
        this.setHint(`Неаккуратно (${Math.round(q * 100)} %) — нужно от 75 %. Ещё раз!`, 3);
        this.boardSelect(it.key);
      }
      return true;
    }
    if (this.practice) {
      this._emit('practiceResult', { q, info });
      this.dishes.practice.lastQ = q;
      this.inventory.consume(this._opId(it.dishId, it.stepId));
      this.dishes.practice.attempt++;
      delete this.board.items[it.key];
      this.board.current = null;
      this.boardSelect(it.key);
      return true;
    }
    this._completeStep(it.dishId, it.stepId, q, info);
    if (PRODUCTS[it.product].messy && !this.practice) {
      this.equipment.board.clean = false;
      this.equipment.board.by = it.product;
      this._emit('dirty', { item: 'board', by: it.product });
    }
    delete this.board.items[it.key];
    this.board.current = null;
    this._emit('transfer', { dishId: it.dishId, stepId: it.stepId, product: it.product, dest: step.dest, pieces: moved, q });
    // следующий продукт той же станции выбирается автоматически, если он уже начат
    const next = this.boardTasks().find((t) => t.started);
    if (next) this.board.current = next.key;
    this._afterStepProgress(it.dishId);
    return true;
  },

  _grateComplete(it) {
    this._emit('grated', { key: it.key });
    const step = this.stepDef(it.dishId, it.stepId);
    if (this.practice) {
      this._emit('practiceResult', { q: 1, info: { cycles: it.grater.cycles } });
      return;
    }
    if (step.dest !== 'bowl' || !this._bowlBlock(it.dishId)) this.boardTransfer();
    else this.setHint('Натёрто! ' + this._bowlBlock(it.dishId), 3);
  },

  resetPracticeItem() {
    if (!this.practice || this.action) return false;
    const it = this.boardCur();
    if (!it) return false;
    this.inventory.release(this._opId(it.dishId, it.stepId));
    delete this.board.items[it.key];
    this.board.current = null;
    return this.boardSelect(it.key);
  },

  takeReplacement() {
    if (!this._isIdleAt('board') || this.action) return false;
    const it = this.boardCur();
    if (!it || !it.missing.length) return false;
    if (this.inventory.available(it.product) < 1) {
      this.setHint(`Запасной порции нет — закажи «${this.productName(it.product)}» в телефоне`);
      return false;
    }
    return this._startAction('replacement', this.cfg.durations.replacement, () => {
      if (!this.inventory.take(it.product, 1)) return;
      for (const m of it.missing) {
        if (it.log) {
          it.log = { ...it.log, segments: [...it.log.segments, { a: m.a, b: m.b }].sort((p, q) => p.a - q.a) };
        } else if (it.body) {
          it.body.addPattern(m);
          it.pieces = it.body.pieces();
        } else {
          const piece = placeBeside(it.pieces, m.w, m.d, this._id(), m);
          it.pieces = recenter([...it.pieces, piece]);
          it.freshIds.add(piece.id);
        }
      }
      it.missing = [];
      this._emit('replacement', { key: it.key });
    });
  },

  // Кот уносит конкретный крупнейший фрагмент соблазнительного продукта с доски.
  _stealFromBoard(product = 'sausage') {
    const items = Object.values(this.board.items).filter((x) => this._boardHasMaterial(x) && !x.grater);
    const it = items.find((x) => x.product === product) ?? items.find((x) => TEMPTING[x.product]);
    if (!it) return false;
    if (it.log) {
      let best = null;
      for (const s of it.log.segments) if (!best || s.b - s.a > best.b - best.a) best = s;
      it.log = { ...it.log, segments: it.log.segments.filter((s) => s !== best) };
      it.missing.push({ a: best.a, b: best.b });
    } else if (it.body) {
      const victim = largestPiece(it.pieces);
      it.missing.push(it.body.removePiece(victim.id));
      it.pieces = it.body.pieces();
      this.stats.stolenVolume = (this.stats.stolenVolume ?? 0) + victim.area;
    } else {
      const victim = largestPiece(it.pieces);
      it.pieces = it.pieces.filter((p) => p !== victim);
      it.missing.push({ ...victim });
      it.freshIds.delete(victim.id);
      this.stats.stolenVolume = (this.stats.stolenVolume ?? 0) + pieceVolume(victim);
    }
    if (this.action?.type === 'cut' && this.action.data?.key === it.key) this._cancelAction();
    return it.product;
  },
};
