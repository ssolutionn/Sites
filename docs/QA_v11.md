# Проверка 0.11.0

Задание — `docs/HANDOFF_v011_ChatGPT.md` (блоки A–I) и идеи 1, 2, 4, 5. ChatGPT в ветке `codex/v011` написал только
документы, код делал Claude. Тесты: `npm test` — 728/728. Сборка и нейтральная сборка — чистые.
Темп (`npm run pacing`): 52:20 / 68:22 (0.10: 49:41 / 64:21; разница — настоящие кухонные минуты и заказ замены).

| Запрос владельца | Решение | Проверка |
|---|---|---|
| Звёзды → «очки домохозяйки» | Везде слова и склонения через `pts()` | `tests/words-v11` |
| Уведомления слишком большие | Пилюли ≤ 3, подробности по наведению, одна запись после блюда | `ui-shots`, снимки `v11_*` |
| Соль в ложках | Щепотка = ⅛ ч. л., норма на вес салата | `tests/words-v11`, `season-exact` |
| Не разбирать пакет | Привезённое сразу в запасе, пакет — только для вида | `tests/supply-v11` |
| Украденное пропадает | Запаса нет, замена — через доставку | `tests/supply-v11` |
| Игрушки и мишура в доставке | Раздел «Для ёлки», рубли, в коробку у ёлки | `tests/supply-v11`, `scripts/v11-supply-shots.mjs` (6/6) |
| Плита отдельным прибором | `src/view/stove-model.js`, шкафы вырезаны под корпус | `tests/stove-model-v11`, `v11_gest_oven_*.png` |
| Конфорка не гаснет, вода выкипает, переварка | `st-home.js` `_updateStove`, `_burnPot` | `tests/stove-v11` |
| Реальные тайминги | Кухонные минуты ×15 (`KITCHEN_SCALE`) | `tests/stove-v11` |
| Кот: крик, сама, ёлка, корм и игра жестом | `st-cat.js`, `cat-gestures.js` | `tests/cat-v11`, `scripts/v11-cat-shots.mjs` |
| Голая ёлка, игрушки куда угодно, мишура | `tree-geo.js`, `st-tree.js`, `tinsel.js` | `tests/tree*`, `scripts/v11-tree-shots.mjs` |
| Посудомойка | `st-dishwasher.js`, жест дверцы | `tests/dishwasher-v11`, `scripts/v11-washer-shots.mjs` |
| Жесты вместо кнопок: плита (G1.1, G1.2) | Продукт → конфорка, кастрюля — за корпус | `tests/stove-gestures-v11`, `v11-gestures-shots stove` (7/7) |
| Духовка (G1.3) | Ручка вниз, форма в проём, вытащить вниз (`st-oven.js`) | `tests/oven-gesture-v11`, `v11-gestures-shots oven` (7/7) |
| Гирлянда, звезда (G2.1) | Зажать лампочку или звезду в сцене | `v11-gestures-shots hold` (8/8) |
| «В миску» (G2.4) | Нож плашмя — смахнуть к миске (`sweep.js`) | `tests/sweep-v11` |
| Слой шубы (G2.5) | Ложится сам при отпускании | `tests/shuba-auto-v11` |
| Замена (G2.6) | Фишку тянут на доску | `campaign-e2e` (`dragReplacement`) |
| Идея 1: рука-призрак | `src/ghost/*`, `src/ui/ghost-*.js` | тесты ghost, `scripts/v11-ghost-shots.mjs` |
| Идея 2: настройки Steam | `settings.js`, `keymap.js`, `fullscreen.js` | `tests/settings-v11`, `scripts/v11-settings-shots.mjs` |
| Идея 4: режим стримера | `stream*.js`, `desktop/overlay-server.cjs` | тесты stream, `scripts/v11-stream-shots.mjs` |
| Идея 5: «Рецепт домой» | `src/qr.js`, `recipe-card*.js`; QR — обычный текст, без ссылок | `tests/qr-v11`, `recipe-*-v11`, `scripts/v11-recipe-shots.mjs` |

## Что не доделано

- «Рука-призрак» не показывает жесты, добавленные в самом конце: смах ножом, духовку, удержание лампочки.
- G2.3 (поднять игрушки с пола) уже был жестом в ветке ёлки; отдельно не перепроверялся.
- `campaign-e2e … all`: день 1 переведён на жесты; дни 2–7 в сценарии устарели ещё в 0.9 и целиком не прогонялись.
- Сводный `scripts/v11-shots.mjs` не собран: проверки лежат по частям в `scripts/v11-*-shots.mjs`.
