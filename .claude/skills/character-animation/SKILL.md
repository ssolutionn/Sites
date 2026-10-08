---
name: character-animation
description: Риг, клипы и переключение анимаций героини и кота в «Симуляторе новогодней суеты» (three.js AnimationMixer, crossfade, машина состояний поз, сокеты реквизита, shape keys мимики) с сохранением процедурных поз в src/view/heroine.js и src/view/cat.js как запасного варианта. Использовать при работе с анимацией персонажей, GLB-клипами, позами, animateHeroine, animateCat, setExpression.
---

# Анимация героини и кота

Контракт рига и список клипов — `docs/asset-contract.md`, разделы 7–8. Внешность — `design/art/art-bible.md`.

## Риг коротко

- Арматура `rig`, корень `root` в начале координат, root motion нет: перемещает игра, клип — на месте.
- Не больше 4 влияний; героиня ≤ 60 костей, кот ≤ 40. Кости `snake_case` с `_l` / `_r`.
- Сокеты: `socket_hand_r` (нож, ложка), `socket_hand_l` (телефон), `socket_mouth` у кота (колбаса).
  Предмет крепится узлом `grip` к сокету.
- Мимика героини — shape keys `blink`, `smile`, `worried`, `mouth_o`; у кота `blink`, `mouth_open`.
- 30 fps; ходьба героини — цикл 0.6 с под 2.2 м/с, кот — 0.45 с.

## Поза игры → клип

Позы приходят из `_heroinePose` (`scene.js`) и `_pose` (`campaign-view.js`). Пока клипа нет — берётся
запасной; нет и его — `idle`; нет GLB — процедурная поза.

| Поза | Клип | Запасной клип |
|---|---|---|
| `idle`, `menu` | `idle` | — |
| `walk` | `walk` (timeScale = скорость / 2.2, в пределах 0.6–1.4) | — |
| `cut` | `cut`, проматывается по `progress` | — |
| `mix` | `stir` | — |
| `work`, `wash`, `wipe`, `stove` | одноимённый | `stir` |
| `grate` | `grate` | `cut` (цикл, без промотки) |
| `unpack` | `unpack` | `carry` |
| `reach` (гирлянда) | `reach_up` | `celebrate` |
| `phone` | `phone_answer`, держать последний кадр | — |
| `shoo` | `shoo` | — |
| `joy` | `celebrate` | — |

| Режим кота | Клип | Запасной клип |
|---|---|---|
| движется, колбаса видна | `steal_run` | `walk` с timeScale 1.5 |
| движется | `walk` | — |
| `reach` (кража) | `reach` | `idle` |
| разлив | `knock_over` | `reach` |
| `sit`, `sleep`, `eat` | одноимённый | `idle` |
| `play` | `idle` | — |
| прыжок на столешницу (сегмент с `arc`) | `jump_up` | `idle` |

Для разлива `campaign-view.js` сейчас тоже передаёт режим `reach` — нужен отдельный `knock`,
иначе `knock_over` не проиграть. Параметр `speed` в `animateCat` сейчас 0 или 1, а не м/с.

## Машина состояний героини

Состояния: `idle`, `walk`, рабочая поза (цикл), разовый клип. Переходы — crossfade через `AnimationMixer`:

| Переход | Длительность |
|---|---|
| `idle` ↔ `walk` | 0.2 с |
| `walk` → рабочая поза, рабочая → рабочая | 0.25 с |
| рабочая поза → `idle` | 0.3 с |
| любое → разовый (`shoo`, `phone_answer`, `taste`, `open_fridge`, `celebrate`) | 0.2 с |
| разовый закончился → текущая поза игры | 0.3 с |

- Поза запрашивается каждый кадр: если клип тот же — ничего не перезапускать.
- Разовые клипы: `setLoop(THREE.LoopOnce, 1)` и `clampWhenFinished = true`; возврат — по событию
  `finished` у mixer.
- `cut` — один удар: действие на паузе, `time = progress * duration`. При `progress = 0` держим кадр 0.
- `carry` во время ходьбы — только треки верхней части тела: отфильтровать треки `carry` по костям
  спины и рук, а из `walk` для этого случая убрать треки рук.
- Реквизит: нож виден только в `cut` (и `grate`), телефон — в `phone_answer`, ложка — в `stir` и `taste`.
  Показывать в начале перехода в клип, прятать в начале перехода из него. Предмет живёт только
  в своём сокете — в «чужой» руке он не появляется (ТЗ 6.3).
- Мимика: `setExpression(h, worried)` плавно (0.2 с) меняет веса `worried` и `mouth_o` против `smile`.
  Моргание раз в 3–5 с по 0.15 с; интервал считать от игрового времени, а не `Math.random`, чтобы
  скриншоты повторялись.

## Кот: поведение

- **Кража колбасы:** `walk` → `jump_up` (дугу считает код) → `reach` → игра решает «украл» → `steal_run`
  с видимым `loot` в `socket_mouth` → `sit` дома.
- **Прогнали:** `steal_run` без колбасы → `sit`.
- **Опрокинул стакан:** `walk` → `jump_up` → `knock_over` один раз. Лужа и звук запускаются в момент
  `contact` из `cat.clips.json`, но исход решает игра: клип ничего не меняет в состоянии игры.
- Между событиями — `sit` или `sleep` у `catHome`, без хождения сквозь мебель.

## Процедурный запасной вариант — не ломать

1. `buildHeroine`, `animateHeroine`, `setExpression`, `buildCat`, `animateCat` остаются с теми же
   сигнатурами: их зовут `scene.js`, `campaign-view.js`, `gallery.js`, `scripts/export-models.mjs`.
   GLB-путь — ветка внутри по `userData.rig === 'gltf'`.
2. Ключи `userData` сохраняются: `knife`, `phoneProp`, `loot` — у GLB это узлы реквизита в сокетах.
3. Новая поза добавляется в оба места: `case` в `animateHeroine` и строка в таблице выше.
4. `mergeStaticMeshes` — только для процедурных моделей.
5. Шаг mixer берётся из разницы игрового времени: функции получают `time`, а не `dt`.
6. Визуальные сценарии (`scripts/visual-check.mjs` и соседние) прогоняются в обоих режимах; второй
   режим — `?procedural=1`. Скриншоты — в `production/qa/evidence/`.

```js
// Ветка GLB внутри animateHeroine (набросок)
function playGltfPose(h, pose, time, progress) {
  const r = h.userData;
  const dt = Math.max(0, time - (r.lastTime ?? time));
  r.lastTime = time;
  const name = r.clipFor(pose);                 // таблица «поза → клип → запасной»
  if (name !== r.current) {
    const fade = r.fadeFor(r.current, name);    // 0.2–0.3 с по таблице переходов
    const next = r.actions[name];
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    r.actions[r.current]?.fadeOut(fade);
    r.showPropsFor(name);
    r.current = name;
  }
  if (name === 'cut') {
    const a = r.actions.cut;
    a.paused = true;
    a.time = Math.min(progress, 1) * a.getClip().duration;
  }
  r.mixer.update(dt);
}
```
