// Итоговая оценка. Чистая функция.
// C — % добавленных ингредиентов из семи, A — аккуратность в %, M — 100/0 за перемешивание,
// E — кражи + пропущенные выкипания + 1 за неотремонтированную гирлянду.
export function computeScore({ C, A, M, E }, scoring) {
  const raw = scoring.wC * C + scoring.wA * A + scoring.wM * M - scoring.errorPenalty * E;
  const clamped = Math.min(100, Math.max(0, raw));
  return Math.round(clamped);
}

export function resultTitle(success, S, scoring) {
  if (!success) return scoring.failTitle;
  for (const tier of scoring.tiers) if (S >= tier.min) return tier.title;
  return scoring.tiers[scoring.tiers.length - 1].title;
}
