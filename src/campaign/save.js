// Сохранение кампании в localStorage: версия формата, дни, лучшие оценки, настройки.
// Повреждённые или устаревшие данные не роняют игру.
import { CAMPAIGN, DAYS } from './data.js';

export const SAVE_KEY = 'novogodnyaya-sueta.campaign';
export const SAVE_BACKUP_KEY = `${SAVE_KEY}.backup`;

/**
 * Миграции формата: ключ — версия, из которой переходим, значение — функция «данные → данные следующей версии».
 * Меняешь формат — поднимай CAMPAIGN.saveVersion и добавляй сюда шаг ОТ старой версии, иначе у игроков обнулится прогресс.
 */
export const MIGRATIONS = {};

export function emptySave(version = CAMPAIGN.saveVersion) {
  return {
    version,
    days: DAYS.map((d, i) => ({ id: d.id, unlocked: i === 0, completed: false, best: null, last: null, medals: [], stars: 0, bestTime: null })),
    settings: { quality: 'high' },
    challenges: {}, // дата испытания → лучший результат
    speed: { best: null }, // скоростная нарезка: лучшее время
    lastCompletedAt: null,
    finished: false,
    bonus: 0, // баллы бонусной программы
    decor: [], // купленный декор кухни
  };
}

/**
 * Нормализация и миграция. Возвращает { save, status }, status:
 *  'ok' — формат текущий; 'empty' — сохранения не было; 'migrated' — прогресс перенесён со старой версии;
 *  'reset' — данные повреждены или миграции нет (начата новая кампания, старое лежит в резервной копии);
 *  'newer' — сохранение от более новой версии игры (не перезаписывать, см. SaveStore).
 */
export function parseSave(raw, { version = CAMPAIGN.saveVersion, migrations = MIGRATIONS } = {}) {
  if (raw == null) return { save: emptySave(version), status: 'empty' };
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { save: emptySave(version), status: 'reset' };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.days) || !Number.isInteger(data.version)) return { save: emptySave(version), status: 'reset' };
  if (data.version > version) return { save: emptySave(version), status: 'newer' };
  let migrated = false;
  while (data.version < version) {
    const step = migrations[data.version];
    if (typeof step !== 'function') return { save: emptySave(version), status: 'reset' };
    try {
      const from = data.version;
      data = { ...step(structuredClone(data)), version: from + 1 };
    } catch {
      return { save: emptySave(version), status: 'reset' };
    }
    migrated = true;
  }
  const base = emptySave(version);
  for (const d of base.days) {
    const src = data.days.find((x) => x && x.id === d.id);
    if (!src) continue;
    d.unlocked = !!src.unlocked;
    d.completed = !!src.completed;
    d.best = validResult(src.best) ? src.best : null;
    d.last = validResult(src.last) ? src.last : null;
    d.medals = Array.isArray(src.medals) ? src.medals.filter((m) => typeof m === 'string') : [];
    d.stars = Number.isFinite(src.stars) ? src.stars : d.best?.stars ?? 0;
    d.bestTime = Number.isFinite(src.bestTime) ? src.bestTime : null;
  }
  if (data.challenges && typeof data.challenges === 'object') base.challenges = data.challenges;
  if (data.speed && typeof data.speed === 'object') base.speed = { best: Number.isFinite(data.speed.best) ? data.speed.best : null };
  base.days[0].unlocked = true;
  // открыт день после каждого завершённого
  base.days.forEach((d, i) => {
    if (d.completed && base.days[i + 1]) base.days[i + 1].unlocked = true;
  });
  base.settings = { ...base.settings, ...(data.settings || {}) };
  base.lastCompletedAt = data.lastCompletedAt ?? null;
  base.bonus = Number.isFinite(data.bonus) && data.bonus >= 0 ? Math.round(data.bonus) : 0;
  base.decor = Array.isArray(data.decor) ? data.decor.filter((x) => typeof x === 'string') : [];
  base.finished = base.days.every((d) => d.completed);
  return { save: base, status: migrated ? 'migrated' : 'ok' };
}

function validResult(r) {
  return r && typeof r === 'object' && Number.isFinite(r.D) && r.dishes && typeof r.dishes === 'object';
}

// Записать результат дня: лучший результат сохраняется, последний — фактический.
export function recordDay(save, dayId, result, now = Date.now()) {
  const d = save.days.find((x) => x.id === dayId);
  if (!d) return save;
  d.completed = true;
  d.last = result;
  if (!d.best || result.D > d.best.D) d.best = result;
  d.medals = [...new Set([...(d.medals ?? []), ...(result.medals ?? [])])];
  d.stars = Math.max(d.stars ?? 0, result.stars ?? 0);
  if (Number.isFinite(result.time)) d.bestTime = d.bestTime == null ? result.time : Math.min(d.bestTime, result.time);
  const i = save.days.indexOf(d);
  if (save.days[i + 1]) save.days[i + 1].unlocked = true;
  save.lastCompletedAt = now;
  save.finished = save.days.every((x) => x.completed);
  return save;
}

export function campaignScore(save) {
  const done = save.days.filter((d) => d.best);
  if (!done.length) return 0;
  return Math.round(done.reduce((s, d) => s + d.best.D, 0) / save.days.length);
}

export function currentDayIndex(save) {
  const i = save.days.findIndex((d) => d.unlocked && !d.completed);
  return i < 0 ? save.days.length - 1 : i;
}

export class SaveStore {
  /**
   * @param storage объект { getItem, setItem }; undefined — localStorage; null — хранилища нет.
   * Поля: status (см. parseSave), available, writeError (null | 'noStorage' | 'failed' | 'protected').
   */
  constructor(storage) {
    if (storage === undefined) {
      try {
        storage = globalThis.localStorage; // в песочнице доступ к хранилищу может бросать исключение
      } catch {
        storage = null;
      }
    }
    this.storage = storage ?? null;
    this.available = this.storage != null;
    this.writeError = null;
    let raw = null;
    try {
      raw = this.storage?.getItem(SAVE_KEY) ?? null;
    } catch {
      raw = null;
    }
    const { save, status } = parseSave(raw);
    this.data = save;
    this.status = status;
    // сохранение от другой версии игры: копия «как есть», чтобы прогресс можно было достать руками
    if (raw != null && status !== 'ok') this._backup(raw);
    // новее нашей версии — не затираем, пока игрок сам не начнёт новую кампанию
    this.protected = status === 'newer';
  }
  _backup(raw) {
    try {
      this.storage?.setItem(SAVE_BACKUP_KEY, typeof raw === 'string' ? raw : JSON.stringify(raw));
    } catch {
      /* копия — необязательная страховка */
    }
  }
  /** true — записано; false — нет, причина в writeError. */
  write() {
    if (!this.storage) {
      this.writeError = 'noStorage';
      return false;
    }
    if (this.protected) {
      this.writeError = 'protected';
      return false;
    }
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.data));
      this.writeError = null;
      return true;
    } catch {
      this.writeError = 'failed';
      return false;
    }
  }
  reset() {
    this.data = emptySave();
    this.protected = false;
    this.write();
  }
  get hasProgress() {
    return this.data.days.some((d) => d.completed);
  }
}
