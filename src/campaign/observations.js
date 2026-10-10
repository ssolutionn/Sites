// Замечания после блюда о нарезке по фактическим кускам (0.8): не «кубики ровные вообще», а какой продукт и насколько.
// Чистые функции: данные приходят из st-board (статистика при переносе), тексты уходят в итог блюда.
import { CAMPAIGN, PRODUCTS } from './data.js';

const fmt = (x) => x.toFixed(1).replace('.', ',');

/**
 * Статистика кусков одного продукта. size — желаемый размер кубика (см), tol — допуски из CAMPAIGN.tolerance.
 * Крошка (меньше четверти кубика) и краевые обрезки в счёт не идут. Доли — по площади.
 */
export function pieceStats(pieces, size, tol = CAMPAIGN.tolerance, cfg = CAMPAIGN.observe) {
  const used = pieces.filter((p) => !p.edge && p.area >= cfg.crumb * size * size);
  if (!used.length) return null;
  let total = 0, big = 0, small = 0, long = 0, sum = 0;
  const sizes = [];
  for (const p of used) {
    const e = Math.sqrt(p.area);
    total += p.area;
    sum += e;
    sizes.push(e);
    if (e > tol.max * size) big += p.area;
    else if (e < tol.min * size) small += p.area;
    if (p.elong > tol.elong) long += p.area;
  }
  const mean = sum / used.length;
  const spread = Math.sqrt(sizes.reduce((a, e) => a + (e - mean) ** 2, 0) / sizes.length) / mean;
  return { n: used.length, size, mean, bigShare: big / total, smallShare: small / total, longShare: long / total, spread };
}

/** Одно замечание по продукту: { severity, text } — severity ≥ 1 — проблема (чем больше, тем хуже), ≤ 0 — похвала (чем ровнее, тем ближе к нулю). */
function judge(product, st, cfg) {
  const name = PRODUCTS[product]?.name ?? product;
  const size = st.size;
  const sizeRatio = st.mean / size;
  const issues = [
    { v: Math.max(st.bigShare / cfg.big, (sizeRatio - 1) / (cfg.bigMean - 1)), text: `${name}: крупноватые куски — в среднем ${fmt(st.mean)} см при норме ${fmt(size)} см` },
    { v: st.longShare / cfg.long, text: `${name}: много «палочек» — после полосок режь и поперёк` },
    { v: Math.max(st.smallShare / cfg.small, (1 - sizeRatio) / (1 - cfg.smallMean)), text: `${name}: мелковато — ${fmt(st.mean)} см вместо ${fmt(size)} см` },
  ].sort((a, b) => b.v - a.v);
  if (issues[0].v >= 1) return { severity: issues[0].v, text: issues[0].text };
  const ruler = st.spread <= cfg.rulerSpread;
  return { severity: -st.spread, text: `${name}: ровные кубики — ${fmt(st.mean)} см${ruler ? ', как по линейке' : ''}` };
}

/**
 * Два наблюдения для итога блюда: сначала самое проблемное, потом следующее по важности (или лучшее, если проблема одна).
 * entries: [{ product, size, stats }]. Нет данных — пустой список (тогда игра говорит общую фразу).
 */
export function pickObservations(entries, max = 2, cfg = CAMPAIGN.observe) {
  const judged = entries.filter((e) => e.stats).map((e) => ({ ...judge(e.product, e.stats, cfg) }));
  judged.sort((a, b) => b.severity - a.severity);
  return judged.slice(0, max).map((j) => j.text);
}
