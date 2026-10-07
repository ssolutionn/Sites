// Оценка блюда и дня (раздел 14.2). Неприменимые характеристики не дают
// бесплатных баллов: их вес перераспределяется между остальными.
import { CAMPAIGN } from './data.js';

export function dishScore(parts, weights = CAMPAIGN.scoring.weights) {
  let wsum = 0, s = 0;
  for (const [k, w] of Object.entries(weights)) {
    const v = parts[k];
    if (v == null) continue;
    wsum += w;
    s += w * Math.max(0, Math.min(100, v));
  }
  return wsum ? Math.round(s / wsum) : 0;
}

// Темп (pace) — необязательная характеристика: без него её вес делится между блюдами и порядком.
export function dayScore(dishQs, order, pace = null, w = CAMPAIGN.scoring.day) {
  const avg = dishQs.length ? dishQs.reduce((a, b) => a + b, 0) / dishQs.length : 0;
  const clamp = (v) => Math.max(0, Math.min(100, v));
  let sum = w.dishes * avg + w.order * clamp(order);
  let ws = w.dishes + w.order;
  if (pace != null && w.pace) {
    sum += w.pace * clamp(pace);
    ws += w.pace;
  }
  return Math.round(sum / ws);
}
