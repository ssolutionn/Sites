# assets/ — исходники моделей художника

Здесь лежат исходники: `.blend`, экспортированные `.glb` и исходные текстуры. Игра отсюда ничего
не читает: готовые `.glb` копируются в `public/assets/models/` скриптом синхронизации
(`npm run models:sync`, см. `docs/asset-contract.md`, раздел 1). Пока скрипта нет — копируем вручную.

```
characters/girl/   girl.blend, girl.glb (+ girl_<clip>.glb), girl.clips.json, textures/
characters/cat/    cat.blend, cat.glb (+ cat_<clip>.glb), cat.clips.json, textures/
food/              цельные продукты: carrot.blend / carrot.glb …
kitchen/           мебель и комната: island, back_counter, fridge, stove, sink, room …
props/             реквизит: knife, board, bowl, pot, phone, grater, tray …
```

## Главное

- Как должно выглядеть — `design/art/art-bible.md` (палитра, свет, материалы, пропорции, порядок замены).
- Как должно быть устроено — `docs/asset-contract.md` (оси, pivot, имена, бюджеты, клипы, проверка).
- 1 единица = 1 метр, экспорт с +Y Up, персонажи и предметы смотрят в +Z glTF (в Blender — в камеру
  в виде Front, по −Y). Transforms применены, scale корня 1.
- Имена `snake_case`, без точек и пробелов. Файл клипа — `<asset>_<clip>.glb`.
- GLB экспортируется без сжатия: декодеры в игре пока не подключены.
- Логотип — отдельный материал `m_brand_logo`, не в общей текстуре.
- Перед сдачей — проверка из раздела 11 контракта и скриншоты в `production/qa/evidence/`.

## Git

`.blend`, `.glb` и текстуры — тяжёлые бинарные файлы; их стоит хранить через Git LFS
(`.gitattributes` пока не настроен — задача для tools-programmer). Пустые папки держит `.gitkeep`.
