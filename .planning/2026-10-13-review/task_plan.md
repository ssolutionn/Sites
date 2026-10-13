# Ревью кода 0.11 (ночь 13→14.10.2026)

Запрос владельца: «проверь весь код что написал sonnet несколько раз… проверь, чтобы он работал хорошо».
Диапазон: `1d1858e..HEAD` (0.10.0 → 0.11.0), 77 файлов, ~9 500 строк в `src/` и `desktop/`.

## Проходы
1. **Чтение по подсистемам** (сам): diff + окружающий код, поиск логических ошибок, рассинхрона UI↔сессия, утечек, NaN, гонок.
   Каждая находка → тест, который падает до правки → правка → тест зелёный.
2. **Независимое ревью** (агенты по подсистемам, без моих выводов) → проверка каждой их находки руками.
3. **Живой прогон**: браузерные сценарии v10/v11, e2e дня 1, полный день мышью; темп; нейтральная сборка.

## Подсистемы
- [ ] S1 Плита и духовка (st-home, st-oven, stove-model, campaign-view, data.stove)
- [ ] S2 Снабжение и доставка (st-phone, st-extra, persist, inventory)
- [ ] S3 Кот (st-cat, cat-gestures, session.interact, main.js кот)
- [ ] S4 Ёлка, мишура, падение (st-tree, tree-geo, tree-view, tinsel, save-миграция)
- [ ] S5 Посудомойка и нож (st-dishwasher, dishwasher-model)
- [ ] S6 Настройки (settings, settings-controller, keymap, fullscreen, settings-ui, assist, sound)
- [ ] S7 Стример (stream*, st-stream, stream-rules, overlay, desktop)
- [ ] S8 Рука-призрак (ghost/*, ghost-hand, ghost-coach, ghost-space)
- [ ] S9 Рецепт домой (qr, recipe-home, recipe-card*)
- [ ] S10 Жесты G (sweep, шуба, замена, удержание, перенос на плиту)
- [ ] S11 Клей UI (campaign-ui, main, phone) и данные/слова/сохранение
