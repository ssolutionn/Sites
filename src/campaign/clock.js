// Реальное время игрока (0.9, решение владельца): часы телефона и время суток за окном — как у человека за компьютером.
// Дата в игре своя (25–31 декабря), время суток — настоящее. Только чтение часов компьютера: без сети и геолокации.

/** «14:05» для даты. */
export function clockText(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Время суток за окном зимой (конец декабря, средняя полоса): светает к девяти, темнеет к пяти.
 * morning 8–10 · day 10–15 · evening 15–17 · night 17–8.
 */
export function dayPhase(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 8 && h < 10) return 'morning';
  if (h >= 10 && h < 15) return 'day';
  if (h >= 15 && h < 17) return 'evening';
  return 'night';
}

/** Настоящее время события, которое случилось ago секунд назад по игровым часам (игровая секунда = секунда). */
export function wallAgo(now, agoSeconds) {
  return new Date(now.getTime() - Math.max(0, agoSeconds) * 1000);
}
