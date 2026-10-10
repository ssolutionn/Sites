// Что из прохождения попадает в сохранение кампании (0.8). Чистые функции: main.js только вызывает их и пишет в хранилище.
// Правило: испытания и практика кампанию не трогают; баллы дня попадают в сохранение только итогом дня.
import { DECOR } from './data.js';

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
