// Доска: нарезка кубиками (по реальному контуру), кружочки, тёрка.
import { PRODUCTS } from './data.js';
import { initialPieces, cutAcross, rotatePieces, pieceAt, totalVolume, largestPiece, pieceVolume, placeBeside, recenter } from '../game/cutting.js';
import { TEMPTING } from './st-extra.js';
import { makeRoundLog, cutRound, roundSlices, roundQuality, cutQuality, Grater } from './mechanics.js';

export const BOARD_UNIT = 0.042; // метров на целевой кубик

export const boardMethods = {
  boardTasks() {
    const out = [];
    for (const [dishId, dish] of Object.entries(this.dishes)) {
      if (dish.done) continue;
      for (const s of dish.recipe.steps) {
        if (s.type !== 'cut' && s.type !== 'grate') continue;
        const state = this.stepState(dishId, s.id);
        if (state === 'skipped') continue;
        const key = `${dishId}:${s.id}`;
        out.push({ key, dishId, stepId: s.id, product: s.product, type: s.type, shape: s.shape, state, started: !!this.board.items[key], block: state === 'ready' ? null : this.stepBlock(dishId, s.id) });
      }
    }
    return out;
  },

  boardCur() {
    return this.board.current ? this.board.items[this.board.current] ?? null : null;
  },

  _boardHasMaterial(it) {
    if (it.grater) return !it.grater.complete;
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
    const it = { key, dishId, stepId, product: step.product, type: step.type, shape: step.shape, cuts: 0, missing: [], freshIds: new Set() };
    if (step.type === 'grate') {
      it.grater = new Grater(this.cfg.grate);
    } else if (step.shape === 'round') {
      it.log = makeRoundLog(prod.round.length);
      it.radius = prod.round.radius;
      it.initVolume = prod.round.length;
    } else {
      it.pieces = initialPieces(prod.cut.w, prod.cut.d, () => this._id(), prod.cut.profile === 'rectangle' ? null : prod.cut.profile);
      it.initVolume = totalVolume(it.pieces);
    }
    this.board.items[key] = it;
    this.board.current = key;
    this._emit('boardSwitch', { key, fresh: true });
    if (!this.tutorialSeen.has(step.type + (step.shape ?? ''))) {
      this.tutorialSeen.add(step.type + (step.shape ?? ''));
      this._emit('tutorial', { topic: step.type === 'grate' ? 'grate' : step.shape === 'round' ? 'round' : 'cube' });
    }
    return true;
  },

  // Доска после сельди или свёклы: другой продукт на ней не режем, пока не помоешь.
  _boardDirtyBlock(product) {
    const b = this.equipment.board;
    if (!b || b.clean || this.practice || b.by === product) return null;
    return `Доска ${b.by === 'beet' ? 'в свёкле' : 'пахнет селёдкой'} — помой её у раковины`;
  },

  _boardPointer(type, x, z) {
    const it = this.boardCur();
    if (!it) return 'ignored';
    const ux = x / BOARD_UNIT, uz = z / BOARD_UNIT;
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
    if (type !== 'down') return 'hover';
    if (this.action) return 'ignored';
    if (it.log) return this._roundCut(it, ux, uz);
    return this._cubeCut(it, ux, uz);
  },

  _cubeCut(it, ux, uz) {
    if (!pieceAt(it.pieces, ux, uz)) return 'miss';
    const opts = { minWidth: this.cfg.minCutFraction, maxPieces: this.cfg.maxPiecesPerProduct, nextId: () => 0 };
    const check = cutAcross(it.pieces, ux, opts);
    if (!check.ok) {
      this.setHint(check.reason === 'limit' ? 'Кусочков уже достаточно — перенеси продукт' : 'Слишком близко к краю одного из кусочков — сдвинь нож', 2);
      return check.reason;
    }
    this._startAction('cut', this.cfg.knifeDuration, () => {
      if (this.board.items[it.key] !== it) return;
      const r = cutAcross(it.pieces, ux, { ...opts, nextId: () => this._id() });
      if (!r.ok) return;
      it.pieces = r.pieces;
      it.cuts++;
      for (const c of r.cuts) it.freshIds.delete(c.original.id);
      this._emit('cut', { key: it.key, x: ux, count: r.cuts.length });
    }, { key: it.key, x: ux, z: uz });
    return 'cut';
  },

  _roundCut(it, ux, uz) {
    if (Math.abs(uz) > it.radius) return 'miss';
    const r = cutRound(it.log, ux, this.cfg.roundTarget.minCut);
    if (!r.ok) {
      if (r.reason === 'too-close') this.setHint('Слишком тонко — такой кружочек развалится', 2);
      return r.reason === 'outside' ? 'miss' : r.reason;
    }
    this._startAction('cut', this.cfg.knifeDuration, () => {
      if (this.board.items[it.key] !== it) return;
      const rr = cutRound(it.log, ux, this.cfg.roundTarget.minCut);
      if (!rr.ok) return;
      it.log = rr.log;
      it.cuts++;
      this._emit('cut', { key: it.key, x: ux, round: true });
    }, { key: it.key, x: ux, z: uz, round: true });
    return 'cut';
  },

  rotate() {
    if (!this._isIdleAt('board') || this.action) return false;
    const it = this.boardCur();
    if (!it || it.grater) return false;
    if (it.log) {
      this.setHint('Кружочки режутся только поперёк — поворот здесь не нужен', 2.5);
      return false;
    }
    if (!it.pieces.length) return false;
    it.pieces = rotatePieces(it.pieces);
    this._emit('rotate', { key: it.key });
    return true;
  },

  boardQuality(it) {
    if (it.log) return roundQuality(it.log, this.cfg.roundTarget, this.cfg.edgeTrimAllowance);
    return cutQuality(it.pieces, it.initVolume, this.cfg.tolerance, PRODUCTS[it.product].cut?.trim ?? this.cfg.edgeTrimAllowance);
  },

  transferBlock(it = this.boardCur()) {
    if (!it) return 'На доске пусто';
    if (it.grater) return it.grater.complete ? this._destBlock(it) : `Натри до конца: ${it.grater.done} из ${it.grater.cycles} движений`;
    if (it.missing.length) return 'Кот утащил кусок — возьми замену';
    if (it.cuts < 1) return 'Сначала сделай хотя бы один разрез';
    if (it.log && roundSlices(it.log).length < 3) return 'Нарежь хотя бы несколько кружочков';
    if (it.pieces?.some((p) => it.freshIds.has(p.id))) return 'Замену нужно дорезать';
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
    }
    const moved = it.grater ? null : it.log ? roundSlices(it.log) : it.pieces.map((p) => ({ ...p }));
    if (step.dest === 'bowl') this._bowlReceive(it.dishId, { product: it.product, kind: it.grater ? 'grated' : 'pieces', pieces: moved });
    else if (step.dest === 'prepared') dish.prepared[it.stepId] = { product: it.product, q, kind: it.grater ? 'grated' : 'pieces' };
    else if (step.dest === 'pieces') dish.pieces[it.product] = (moved || []).map((p) => ({ ...p, product: it.product, used: false }));
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
