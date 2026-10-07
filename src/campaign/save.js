// Сохранение кампании в localStorage: версия формата, дни, лучшие оценки, настройки.
// Повреждённые или устаревшие данные не роняют игру.
import { CAMPAIGN, DAYS } from './data.js';

export const SAVE_KEY = 'novogodnyaya-sueta.campaign';

export function emptySave() {
  return {
    version: CAMPAIGN.saveVersion,
    days: DAYS.map((d, i) => ({ id: d.id, unlocked: i === 0, completed: false, best: null, last: null })),
    settings: { quality: 'high' },
    lastCompletedAt: null,
    finished: false,
  };
}

// Нормализация и миграция. Возвращает { save, status: 'ok' | 'empty' | 'reset' | 'migrated' }.
export function parseSave(raw) {
  if (raw == null) return { save: emptySave(), status: 'empty' };
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { save: emptySave(), status: 'reset' };
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.days)) return { save: emptySave(), status: 'reset' };
  if (data.version !== CAMPAIGN.saveVersion) return { save: emptySave(), status: 'reset' };
  const base = emptySave();
  for (const d of base.days) {
    const src = data.days.find((x) => x && x.id === d.id);
    if (!src) continue;
    d.unlocked = !!src.unlocked;
    d.completed = !!src.completed;
    d.best = validResult(src.best) ? src.best : null;
    d.last = validResult(src.last) ? src.last : null;
  }
  base.days[0].unlocked = true;
  // открыт день после каждого завершённого
  base.days.forEach((d, i) => {
    if (d.completed && base.days[i + 1]) base.days[i + 1].unlocked = true;
  });
  base.settings = { ...base.settings, ...(data.settings || {}) };
  base.lastCompletedAt = data.lastCompletedAt ?? null;
  base.finished = base.days.every((d) => d.completed);
  return { save: base, status: 'ok' };
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
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let raw = null;
    try {
      raw = storage?.getItem(SAVE_KEY) ?? null;
    } catch {
      raw = null;
    }
    const { save, status } = parseSave(raw);
    this.data = save;
    this.status = status;
  }
  write() {
    try {
      this.storage?.setItem(SAVE_KEY, JSON.stringify(this.data));
      return true;
    } catch {
      return false;
    }
  }
  reset() {
    this.data = emptySave();
    this.write();
  }
  get hasProgress() {
    return this.data.days.some((d) => d.completed);
  }
}
