// Жесты ухода за котом (0.11, D4): корм — встряхивание пачки над миской, игра — «удочка с бантиком».
// Чистые классы без DOM и Three.js: координаты — локальные метры от центра миски кота (x — вправо, z — к камере).
import { ShakeTracker } from './gestures.js';

/**
 * Корм: зажми пачку над миской и потряси вниз-вверх. Каждое засчитанное встряхивание сыплет порцию;
 * cfg.shakes встряхиваний — миска полная, кот накормлен. Мимо миски (дальше radius) трясти бесполезно.
 */
export class KibbleShake {
  constructor(cfg) {
    this.cfg = cfg;
    this.tracker = new ShakeTracker({ amplitude: cfg.amplitude, minInterval: cfg.minInterval });
    this.shakes = 0;
  }

  /** Сколько корма в миске, 0…1. */
  get amount() {
    return Math.min(1, this.shakes / this.cfg.shakes);
  }

  get done() {
    return this.shakes >= this.cfg.shakes;
  }

  release() {
    this.tracker.reset();
  }

  /** Рука над точкой (x, z) в момент t: 'shake' — порция высыпана, 'away' — пачка не над миской, 'idle' — просто движение. */
  move(x, z, t) {
    if (Math.hypot(x, z) > this.cfg.radius) {
      this.tracker.reset();
      return 'away';
    }
    if (this.tracker.move(z, t)) {
      this.shakes++;
      return 'shake';
    }
    return 'idle';
  }
}

/**
 * «Удочка с бантиком»: води мышью по полу рядом с котом — он прыгает за бантиком. Прогресс — по пройденному пути;
 * резкий скачок указателя (больше maxJump за шаг) путь не считает, а выход за radius прерывает нить.
 */
export class WandPlay {
  constructor(cfg) {
    this.cfg = cfg;
    this.path = 0;
    this.last = null;
  }

  get progress() {
    return Math.min(1, this.path / this.cfg.path);
  }

  get done() {
    return this.path >= this.cfg.path;
  }

  release() {
    this.last = null;
  }

  /** Бантик в точке (x, z); возвращает пройденный путь за шаг, м. */
  move(x, z) {
    if (Math.hypot(x, z) > this.cfg.radius) {
      this.last = null;
      return 0;
    }
    let gain = 0;
    if (this.last) {
      const d = Math.hypot(x - this.last.x, z - this.last.z);
      if (d <= this.cfg.maxJump) {
        gain = d;
        this.path += d;
      }
    }
    this.last = { x, z };
    return gain;
  }
}
