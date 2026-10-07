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

export function dayScore(dishQs, order, w = CAMPAIGN.scoring.day) {
  const avg = dishQs.length ? dishQs.reduce((a, b) => a + b, 0) / dishQs.length : 0;
  return Math.round(w.dishes * avg + w.order * Math.max(0, Math.min(100, order)));
}
