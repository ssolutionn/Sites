# Findings

## Карта кода (из разведки)
- Нарезка: src/game/cutting.js — initialPieces L32, cutAcross L162 (только по x), rotatePieces L80 ((x,z)->(-z,x)), clipPolygon L136, polygonPiece L129. Кусочки в единицах BOARD_UNIT=0.042 м; polygon с флагом o:1 — исходный контур (кожура).
- st-board.js: _boardPointer L80 (клик 'down' = разрез), _cubeCut L102, _roundCut L122, rotate L140, boardQuality L154, boardTransfer L175.
- view/board.js: _pieceMesh L178 (плоская экструзия высотой 1 UNIT), sync L204, нож L40-78/L245-264.
- campaign-view.js: _updateBoard L854, roundGroup L874-901, тёрка L904-924, workPlane L409, pickLocal L430 (плоскость y=boardTop+UNIT), _updateBowl L933-1013, _camera L318.
- main.js pointer L402-450 → session.pointer(type,x,z).
- scene.js: renderer L17-23 (ACES, PCFSoft), свет L30-47, render L391. Без env map/пост-обработки.
- kitchen.js: toon-материалы. food/heroine/cat: MeshStandard.
- campaign-ui.js: _renderPhoneLive L1212-1274, TIPS L22-51, _renderRecipe L1160-1185; campaign.css #phone L70-82.
- data.js: twice() в рецептах (оливье, крабовый, тарталетки, шуба); DAYS L360+.

## Фидбек владельца после дня 1
1. Форма нарезки всегда квадрат → настоящий продукт в 3D.
2. Ингредиенты двоятся → один продукт — один заход.
3. Поучительная книга рецептов + факты.
4. Мешать в миске — ничего не происходит.
5. Телефон из приложений: Пятёрочка Доставка, Андрей («ловит даже на кухне», мессенджер + фото), Банк (бонусы Пятёрочки → продукты/декор), Кулинарная книга, Таймеры.
6. Всё делать движением мыши «как в жизни», с прощающими допусками.
