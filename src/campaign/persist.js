// Что из прохождения попадает в сохранение кампании (0.8). Чистые функции: main.js только вызывает их и пишет в хранилище.
// Правило: испытания и практика кампанию не трогают; баллы дня попадают в сохранение только итогом дня.
import { DECOR, TOYS, GIFTS } from './data.js';

/** Отметить, что идёт день кампании (чтобы после перезагрузки начать его заново). Возвращает true, если сохранение изменилось. */
export function markInProgress(saveData, { dayId, practice = false, challenge = false }) {
  if (practice || challenge) return false;
  if (saveData.settings.inProgress === dayId) return false;
  saveData.settings.inProgress = dayId;
  return true;
}

/**
 * Покупка декора посреди дня: списываем цену с СОХРАНЁННЫХ баллов. Баллы, заработанные в этом дне, живут только в сессии
 * и попадут в сохранение итогом дня — иначе перезапуск недоигранного дня давал бы их второй раз.
 * Возвращает true, если сохранение изменилось.
 */
export function applyDecorPurchase(saveData, { id, practice = false, challenge = false }) {
  if (practice || challenge) return false;
  const d = DECOR[id];
  if (!d || saveData.decor.includes(id)) return false;
  saveData.bonus = Math.max(0, (saveData.bonus ?? 0) - d.price);
  saveData.decor = [...saveData.decor, id];
  return true;
}

/**
 * Ёлка (0.9): открытый подарок, купленная игрушка, игрушки на ёлке — сохраняются сразу, как декор.
 * Подарок помечается открытым в тот же момент, что и начисляются его баллы, — переиграть день и получить их снова нельзя.
 * В конце дня save.bonus всё равно берётся из сессии: там эти баллы уже учтены.
 * toys — полный список из сессии (session.toysForSave()). Возвращает true, если сохранение изменилось.
 */
export function applyTreeEvent(saveData, e, { toys = null, practice = false, challenge = false } = {}) {
  if (practice || challenge) return false;
  saveData.toys ??= [];
  saveData.gifts ??= {};
  if (e.type === 'giftOpened') {
    const opened = new Set(saveData.gifts[e.dayId] ?? []);
    if (opened.has(e.index) || e.index < 0 || e.index >= GIFTS.perDay) return false;
    opened.add(e.index);
    saveData.gifts[e.dayId] = [...opened].sort((a, b) => a - b);
    if (e.prize?.kind === 'points') saveData.bonus = (saveData.bonus ?? 0) + e.prize.n;
  } else if (e.type === 'toyBought') {
    const t = TOYS[e.id];
    if (!t) return false;
    saveData.bonus = Math.max(0, (saveData.bonus ?? 0) - t.price);
  } else if (!['toyHung', 'toyTaken', 'toysKnocked', 'toysPicked'].includes(e.type)) return false;
  if (toys) saveData.toys = toys.filter((t) => TOYS[t.id]).map((t) => ({ id: t.id, slot: Number.isInteger(t.slot) ? t.slot : null }));
  return true;
}
