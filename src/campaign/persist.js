// Что из прохождения попадает в сохранение кампании (0.8). Чистые функции: main.js только вызывает их и пишет в хранилище.
// Правило: испытания и практика кампанию не трогают; баллы дня попадают в сохранение только итогом дня.
import { DECOR, TOYS, GIFTS, TOY_SETS, CAMPAIGN, TINSEL } from './data.js';
import { mergeViewers } from './stream-rules.js';

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
  if (!d || saveData.decor.includes(id) || (saveData.bonus ?? 0) < d.price) return false;
  saveData.bonus = Math.max(0, (saveData.bonus ?? 0) - d.price);
  saveData.decor = [...saveData.decor, id];
  return true;
}

/**
 * Ёлка (0.9): открытый подарок, купленная игрушка, игрушки на ёлке — сохраняются сразу, как декор.
 * Подарок помечается открытым в тот же момент, что и начисляются его баллы, — переиграть день и получить их снова нельзя.
 * В конце дня save.bonus всё равно берётся из сессии: там эти баллы уже учтены.
 * toys — полный список из сессии (session.toysForSave(): { id, at }); tinsel — { threads, rolls } (session.tinselForSave()).
 * 0.11: покупка с source 'delivery' очки не списывает (деньги — из бюджета дня, это делает доставка); упала ёлка — игрушки
 * на полу уходят в коробку, мишура — в мотки. Возвращает true, если сохранение изменилось.
 */
export function applyTreeEvent(saveData, e, { toys = null, tinsel = null, practice = false, challenge = false } = {}) {
  if (practice || challenge) return false;
  saveData.toys ??= [];
  saveData.gifts ??= {};
  if (e.type === 'giftOpened') {
    const opened = new Set(saveData.gifts[e.dayId] ?? []);
    if (opened.has(e.index) || e.index < 0 || e.index >= GIFTS.perDay) return false;
    opened.add(e.index);
    saveData.gifts[e.dayId] = [...opened].sort((a, b) => a - b);
    if (e.prize?.kind === 'points') saveData.bonus = (saveData.bonus ?? 0) + e.prize.n;
  } else if (e.type === 'toyBought' || e.type === 'tinselBought') {
    const item = e.type === 'toyBought' ? TOYS[e.id] : TINSEL[e.color];
    if (!item) return false;
    if (e.source !== 'delivery') {
      const price = e.price ?? item.price; // 0.10: товар дня — со скидкой
      if ((saveData.bonus ?? 0) < price) return false;
      saveData.bonus = Math.max(0, (saveData.bonus ?? 0) - price);
    }
  } else if (e.type === 'setComplete') {
    // 0.10: набор собран — награда разовая, набор запоминается
    saveData.sets ??= [];
    if (!TOY_SETS[e.id] || saveData.sets.includes(e.id)) return false;
    saveData.sets = [...saveData.sets, e.id];
    saveData.bonus = (saveData.bonus ?? 0) + (e.n ?? 0);
  } else if (!TREE_EVENTS.includes(e.type)) return false;
  if (toys) saveData.toys = toys.filter((t) => TOYS[t.id]).map((t) => ({ id: t.id, at: t.at ?? null }));
  if (tinsel) {
    saveData.tinsel = tinsel.threads ?? [];
    saveData.tinselRolls = tinsel.rolls ?? {};
  }
  return true;
}

/**
 * 0.11, режим стримера: день, сыгранный с чатом, — отдельный зачёт. Кампанию он не трогает вовсе (как испытание): ни best, ни last,
 * ни медалей, звёзд, времени, баллов, декора, открытия следующего дня. Лучший результат с чатом по дню — saveData.stream.best[dayIndex].
 * Возвращает { prev, best, isBest, events } для строки «С чатом: …» в итоге дня.
 */
export function recordStreamDay(saveData, dayIndex, result) {
  saveData.stream ??= { best: {}, viewers: [] };
  saveData.stream.best ??= {};
  const prev = saveData.stream.best[dayIndex] ?? null;
  const rec = { D: result.D, stars: result.stars ?? 0, time: Number.isFinite(result.time) ? result.time : null, events: result.stats?.chatEvents ?? 0 };
  const isBest = !prev || rec.D > prev.D;
  if (isBest) saveData.stream.best[dayIndex] = rec;
  return { prev, best: isBest ? rec : prev, isBest, events: rec.events };
}

/** Самые активные зрители (для гостей финального стола): добавить активность { ник: голоса } к сохранённым и оставить лучших. */
export function rememberViewers(saveData, counts, keep = CAMPAIGN.stream.viewers.keep) {
  saveData.stream ??= { best: {}, viewers: [] };
  const merged = mergeViewers(saveData.stream.viewers, counts, keep);
  const changed = JSON.stringify(merged) !== JSON.stringify(saveData.stream.viewers);
  saveData.stream.viewers = merged;
  return changed;
}

// События, после которых меняется то, что висит на ёлке или лежит в моточках: сохраняем сразу.
const TREE_EVENTS = ['toyHung', 'toyTaken', 'toysKnocked', 'toyPicked', 'toyBroken', 'treeFell', 'tinselHung', 'tinselTaken', 'tinselEmpty'];
