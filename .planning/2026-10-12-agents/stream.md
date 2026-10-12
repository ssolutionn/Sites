# Заметки агента stream — режим стримера, этап 1 (0.11, идея 4)

## Что сделано
- **Чат**: разбор IRC в чистом `src/stream-parse.js` (PING→PONG, теги `@display-name=…`, PRIVMSG, пакеты из нескольких строк, `!КОТ`/`!Кот пожалуйста`/`!кот!!!`, имя канала `cleanChannel`).
  Источники за одним интерфейсом `StreamSource` (`src/stream-sources.js`): `TwitchChatSource` (анонимный `justinfan#####`, `PASS SCHMOOPIIE`, переподключение 2→4→8→16→30 с, сторож тишины 7 мин, RECONNECT), `TestChatSource`. Подключить баллы канала/донаты/VK/YouTube = новый класс + строка в `SOURCES`.
- **Правила** (`src/campaign/stream-rules.js`, числа в `CAMPAIGN.stream`): сила чата Мягко/Нормально/Хаос (окно, пауза, вес вредных), круг `VoteRound` (voting → pending → cooldown, не больше одного события за окно), `canFire(state)`, шкала хаос↔помощь, строка победителя «Победило !кот — 7 из 12 голосов».
- **`!помощь`**: `streamEvent('help')` (`src/campaign/st-stream.js`): кот спит `help.catSleep` с (`catNeeds.sleepUntil`, `catCalm()`, `_updateCatNeeds` стоит) или курьер в пути едет на 30 % быстрее (`order.wait`), выбор по ситуации через `this.rng`.
- **Ники**: `sanitizeNick` (`src/stream-nick.js`), «Курьер Нико» в сообщениях доставки, комментарий зрителя под фото — только из `VIEWER_REACTIONS` (`feed-data.js`), гости финального стола — самые активные (`tableGuests`, `save.data.stream.viewers`), переключатель «Ники зрителей».
- **Безопасная зона**: класс `cam-tl|tr|bl|br` на `<html>`, `--cam-w/--cam-h` из `CAMPAIGN.stream.cam` (`src/ui/stream.css`).
- **Оверлей OBS**: `overlay.html` + `src/overlay/*`, сервер `desktop/overlay-server.cjs` (127.0.0.1:17771, `/overlay`, `/state`, `/events`), IPC `desktop/stream-ipc.cjs`, мост `desktop/preload.cjs` (`window.suetaDesktop`), `scripts/overlay-dev.mjs`.
- **Отдельный зачёт**: день с чатом = сессия `challenge:true` + `session.live`; результат — `save.data.stream.best[индекс дня]` (`persist.recordStreamDay`), строка «С чатом: …» в итоге дня.
- **Документация**: `docs/STREAMER_GUIDE.md`.

## Решения и отступления от задания
1. `COMMENT_REACTIONS` в `feed-data.js` — это ответы друзей по словам, у них другая форма. Для зрителей добавлен соседний список `VIEWER_REACTIONS` (только заготовки, ≤ 80 знаков).
2. `cat.sleep` из задания: ключ лежит в `CAMPAIGN.stream.help.catSleep` (рядом с `courierBoost`), чтобы не трогать объект `cat` (там работает агент по коту).
3. «Последние 30 с дня»: у дня нет жёсткого конца, поэтому конец оценивается по темпу (`estimateRemaining`: оставшиеся шаги × средний шаг) и по фазе `ready`.
4. День с чатом **не двигает кампанию** (не открывает следующий день, не пишет `completed`) — как испытание. Если владелец хочет иначе, менять в `main.js` (ветка `session.live` в `finishDay`) и `persist.recordStreamDay`.
5. Клавиша паузы чата — `KeyP`, объявлена в `STREAM_KEYS` (`src/stream.js`): `src/keymap.js` в этой копии нет. **При слиянии перенести в раскладку клавиш.** Строка про `P` добавлена в `_controls()` (меню).
6. Электрон в облаке не установлен: оболочка проверена `node --check`, логика IPC — тестами с поддельным `ipcMain`; `SUETA_SMOKE` дополнен проверкой моста (`bridge`, `overlay`). Проверить на настоящей сборке: `npm run desktop`, включить режим, открыть `http://127.0.0.1:17771/overlay`.
7. События чата выключены в практике и в испытании дня (испытание «одинаково для всех»).

## Как проверить
`npm test` (новые файлы `tests/stream-*-v11.test.js`, `tests/overlay-server-v11.test.js`);
`npx vite build && npx vite preview --port 4185 --strictPort --host 127.0.0.1`, затем
`PW=/opt/node-tools/node_modules/playwright/index.mjs OUT=production/qa/evidence node scripts/v11-stream-shots.mjs http://127.0.0.1:4185/ all`
(оверлей-сервер скрипт поднимает сам на 4186). Снимки: `production/qa/evidence/v11_stream_*.png`.
Руками: оверлей без игры — `node scripts/overlay-dev.mjs --demo`, адрес в консоли.

## Строки для спецификации (design/gdd/interaction-spec.md)
Новых жестов нет. Управление: **P** — пауза чата (режим стримера) / кнопка «⏸ Пауза чата» на плашке голосования; мета-интерфейс, не физическое действие. События чата не выходят: жест в процессе, заметка из книги, открыта книга, ввод в телефоне, первые 45 с и последние ~30 с дня.

## Возможные конфликты при слиянии
- `src/main.js` (убран `STREAM_ENABLED`, новый блок «режим стримера», правки в `startDay`, `finishDay`, `frame`, клавиши, `app.ui`).
- `src/ui/campaign-ui.js` (меню, итог дня, финальные гости, `showStream/renderVotes`), `index.html` (+ `stream.css`), `vite.config.js` (вход `overlay`).
- `src/campaign/st-extra.js` (`streamEvent`, `catCalm`, `_updateCatNeeds`), `st-phone.js` (имя курьера, хуки фото/комментариев, фильтр друзей), `session.js` (подключение `streamMethods`), `data.js` (блок `stream` после `events`), `extras.js` (`STREAM_COMMANDS`), `feed-data.js`, `save.js`, `persist.js`.
- `desktop/main.cjs`, `desktop/build.mjs`.
