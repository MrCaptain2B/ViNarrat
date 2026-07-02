# ViNarrat — Прогресс

## Суть проекта
Модуль для Foundry VTT — полноэкранная оверлейная VN-сцена. GM управляет сценой (фон, портреты, диалог, броадкаст), игроки видят её в реальном времени, могут управлять своими портретами (эмоции, кнопка Attention/Claim).

## Структура файлов
- `scripts/visualnovel.js` — вся логика (класс приложения, панели, сокеты, настройки)
- `templates/visualnovel.hbs` — Handlebars-шаблон всей VN
- `style/visualnovel.css` — вся стилизация
- `module.json` — манифест модуля (с `"socket": true`)

## Ключевые возможности (сделано)

### Архитектура
- Двухслойная: `.vn-fullscreen` (z-index 25, под UI Foundry) + `.vn-interactive-layer` (z-index 75, выше UI) — отдельный `<div>` на `body`
- Pointer-events цепочка: контейнеры `pointer-events: none`, интерактивные дети `pointer-events: auto`
- Замена `innerHTML` без jQuery (стандартный `_replaceHTML`)
- Proxy `_el()` — направляет `querySelector*`/`addEventListener` на `document`

### Тулбар (GM)
Кнопки в `.vn-gm-toolbar`, видны только при `canManage`:
- **Locations** — управление локациями (фон, группа, теги)
- **Portraits** — управление портретами + добавление на сцену
- **Scene Control** — настройки сцены (яркость, тема, диалог, спикер)
- **Scene Presets** — сохранение/загрузка снепшотов сцены (отключено)
- **Toggle Background** — показать/скрыть фон
- **Toggle UI** — показать/скрыть весь UI (портреты, диалог, панели)
- **Broadcast** — старт/стоп броадкаста с выбором режима (All Online / Stage Only)
- **Invite** — пригласить конкретного игрока (создаётся программно)
- **Close** — закрыть VN
- (planned) **Создание сценария** — открыть редактор сценариев VN
- (planned) **Загрузка сценария** — загрузить и запустить готовый сценарий

### Сцена
- Полноэкранный оверлей с fade-анимацией открытия/закрытия
- Фон — изображение или градиент, регулировка яркости (Scene Settings)
- Смена эмоций портрета — cross-fade через overlay `<img>` (0.4s)
- Перетаскивание портретов мышью (только GM)
- Выделение портрета кликом (только GM)
- Ховер-контролы: scale, bring forward/send backward, flip, lock, remove

### Панели (открываются из тулбара)
- **Locations** — список + фильтр (search, tag, group) + пагинация (30/Show More) + CRUD
- **Portraits (GM)** — то же + импорт из актёров + добавление на сцену + удаление
- **Portraits (Player)** — открывается по "My Portrait"; видит ТОЛЬКО свои портреты; может редактировать (имя, заголовок, теги, изображения, эмоции)
- **Scene Settings** — яркость, theme colors (bg + accent), диалог (ширина/высота/прозрачность/выравнивание/текст/шрифт/режим/Y-offset), спикер бокс (шрифт)
- **Presets** — сохранение/загрузка снепшотов сцены (фон, портреты, спикер). Код присутствует, временно отключён. После рефакторинга — включить и добавить в тулбар.
- **Scripts (сценарии)** — две отдельные кнопки в тулбаре: **«Создание сценария»** и **«Загрузка сценария»**. В разработке.

### Диалог
- Два режима: **Single + Speaker** (одно окно + имя говорящего) и **Dual (2 boxes)** (левая/правая колонки)
- Y-offset — вертикальное позиционирование
- Inline editing: клик на тексте диалога → `contenteditable`, Enter/blur → сохранение, Esc → отмена
- Размеры/прозрачность/выравнивание/шрифт — настраиваются
- Спикер индикатор — всегда виден (авто-размер, только шрифт настраивается)
- Спикер бар — выбор говорящего (GM), клик по claimed портрету → снятие claim + назначение спикером

### Attention / Claim
- Игрок нажимает ✋ на своём портрете → сокет `{type: "claim"}` → GM видит пульсацию + кнопку ✓
- GM нажимает ✓ → портрет становится спикером, claim снимается
- Визуал: dim + drop-shadow + пульсация (2s, цвет акцента)

### Player Portrait Control
- Опционально (вкл/выкл в Configure Module — `playablePortraits`)
- Привязка портрета к игроку через `userId` + авто-тег `player:Name`
- Emotion strip на своих портретах (макс 5)
- Emotion change → сокет `{type: "emotion"}` → GM обновляет и броадкастит всем

### Броадкаст + Ре-вход
- GM нажимает Play → сокет `{type: "state"}` с портретами, спикером, claimed, inviteMode
- **inviteMode**: "All Online" или "Stage Only" (фильтр по userId на сцене)
- Stop → сокет `{type: "stop"}` → все закрывают VN; `_claimed` очищается
- **Session persistence**: `_saveSession()` сохраняет полное состояние в user flag GM-а; `_restoreSession()` восстанавливает при открытии
- **Rejoin**: `/vnrejoin` → `_rejoinVN()` → применяет `_lastBroadcastState`
- **Late-joiners**: `broadcastStore` (world setting) сохраняется на каждый броадкаст; `ready` hook читает его и открывает VN
- **Targeted invite**: сокет `{type: "invite", userId}` → только целевой игрок обрабатывает

### Приглашение (Invite)
- Кнопка + выпадающий список онлайн-игроков (только для `permManage`)
- Создаётся **программно** в `_buildInviteUI()`, не в шаблоне
- `_rebuildMenu()` — перезаполняет список игроков при каждом клике (чтобы видеть новых)
- `toolbar.appendChild(menu)` — меню внутри тулбара для правильного `position: absolute; top: 100%`
- CSS-классы (без inline `style.cssText` — CSP-safe для Foundry v13)
- `overflow: visible`, `min-width: 240px`

### Права доступа (гранулярные)
Четыре настройки в Configure Module (каждая — выбор роли: Player/Trusted/Assistant/GM):
- `permManage` — управление VN (по умолчанию GM)
- `permBroadcast` — броадкаст (по умолчанию GM)
- `permApproveClaims` — утверждение Attention (по умолчанию GM)
- `permAddRequests` — отправка запросов (по умолчанию Player)
- `_userCan(permKey)` / `_roleCan(role, permKey)` — универсальная проверка

### Разное
- Theme colors (bg + accent) — и в `vndata`, и в module settings
- DOM-фильтрация для search/tag; context-based для group/pagination
- Ограничение: макс 10 портретов на сцене
- `game.freevisualnovel` API: `open()`, `close()`, `setBackground()`, `addPortrait()`, `addRequest()`, `clearStage()`, `importActorPortraits()`
- Чат команды: `/vnreq <text>`, `/vnportrait` / `/vnedit`, `/vnrejoin`
- Два слоя затухания при close: fade 250ms → очистка → `super.close()`
- Прокси `_el()` для корректной работы binding-ов независимо от расположения элементов
- `_onRender` всегда вызывает `_bindMainUI()` — тулбар работает при любом открытом panel
- `close()` ждёт `await _saveSession()` перед очисткой, если broadcast активен
- Inline editing: флаг `_inlineEditBound` — слушатели вешаются один раз, а не на каждый render

## Статус тестирования
- **Броадкаст GM ↔ игрок** — ✅ Работает
- **Emotion change от игрока** — ✅ Работает
- **Игрок не может двигать/выделять чужие портреты** — ✅ Работает
- **Attention/Approve (player ✋ → GM ✓)** — ✅ Работает
- **Rejoin (/vnrejoin)** — ✅ Работает
- **Late-join через broadcastStore** — ✅ Работает
- **Invite menu (кнопка + список + перестроение)** — ✅ Работает
- **Гранулярные права** — ✅ Работает
- **2-dialogue mode** — ✅ Работает (переключение, Y-offset, left/right)
- **Inline editing** — ✅ Работает (click, blur/Enter save, Esc cancel)
- **Session persistence (save/restore)** — ✅ Работает (merge через Object.assign)
- **Speaker в диалоговом окне** — ✅ Работает (showSpeaker, текст/без текста)

## Планы на будущее (фичи)
1. **Допиливание анимаций** — анимация камеры (плавный зум/сдвиг на портрет), нормальные переходы между сценами (fade через bg, не бинарная смена), кросс-фейд между пикчами в массиве эмоций (улучшить существующий 0.4s overlay)
2. **Список игроков + per-player show/hide** — GM видит кто онлайн, может скрыть VN для конкретного игрока
3. **Селектор вкладок Foundry** — кнопка с иконками чата/актёров/сцен, клик открывает поп-аут (не закрывая VN)
4. **CSS-анимации** — fade/slide для показа/скрытия элементов вместо бинарного show/hide
5. **FXMaster compatibility** — проверить, что FXMaster не ломает слои VN (z-index, pointer-events). При стабильной работе — интеграция его эффектов (туман, огонь, дождь) как оверлей поверх bg VN-сцены. Без FXMaster эффекты не показывать.
6. **Триггеры сценариев через инструментарий Foundry** — мини-интеграция без нового UI:
   - Токен игрока заходит в зону/на тайл → хук Foundry → автоматический запуск сценария
   - Сценарий крепится к зоне через `flags.free-visual-novel.scriptId`
   - Никакого нового UI — только функция-обработчик, читающая флаг и вызывающая `_playScript(id)`
   - Всё делается через штатные средства Foundry (Regions, Tile flags, hooks), новый код — пара десятков строк
7. **Импорт сценариев из файла** (без ручного создания) — через **FoundryPeek**:
   - Диалог подтверждения перед импортом: чекбоксы что перенести (диалоги, сцены, портреты — каждый отдельно)
   - Перенос всего: диалоги, реплики, персонажи, структура шагов
   - Базовая логика импорта: маппинг полей, разрешение конфликтов имён
   - Сохранение в `vndata.scripts` как обычный сценарий
8. **Экспорт сценариев** (через FoundryPeek) — проще импорта:
   - Сериализация текущего сценария в JSON
   - Выгрузка через штатное окно FoundryPeek
   - Никакой логики конфликтов — только дамп данных

## Система сценариев (Script Engine)
Две новые кнопки в тулбаре:

### «Создание сценария»
Открывает панель редактора сценариев, где GM пишет последовательность шагов:
- **Step** — базовый блок сценария
  - `type`: `dialog` | `bg` | `portrait` | `emotion` | `speaker` | `pause` | `choice` | `jump`
  - `dialog.text` / `dialog.leftText` — текст реплики
  - `dialog.mode` — single или dual
  - `speaker` — кто говорит
  - `bg` — смена фона
  - `portraitId` / `emotionIdx` — управление портретами
  - `duration` — автопереход через N секунд (0 = ждать клика)
  - `label` — метка для `jump`
  - `choices[]` — для step type `choice` (ветвление)
- Поддержка drag & drop для перестановки шагов
- Экспорт/импорт в JSON

### «Загрузка сценария»
- Открывает список сохранённых сценариев (хранятся в `vndata.scripts`)
- Сами сценарии — JSON-файлы в `worlds/{world}/data/free-visual-novel/scripts/`
- GM выбирает сценарий → попадает в режим **Script Playback**
- **Script Playback**: нижняя панель с кнопками:
  - ▶ Play (авто-прогон с `duration`)
  - ⏭ Next Step (ручной переход)
  - ⏮ Prev Step (откат)
  - ⏹ Stop (выход из режима)
  - Progress bar (текущий шаг / всего шагов)
- Во время Playback тулбар GM скрывается, показывается только панель управления сценарием
- Текущий шаг применяется к сцене (фон, портреты, эмоции, диалог, спикер)
- При достижении конца сценария — уведомление и выход из Playback

### Отличие от Presets
| Presets | Scripts |
|---------|---------|
| Один снимок всей сцены | Последовательность шагов |
| Только bg + portraits + speaker | Диалог, эмоции, паузы, выборы, переходы |
| Ручное применение (Load) | Автоматический прогон |
| Нет логики | Есть ветвления и метки |

## Script Engine (сделано)

### Шаги сценария
- Три типа: `scene` (раньше `normal`), `pause`, `transition`
- `scene` — полный снепшот сцены (диалог, фон, портреты)
- `pause` — пауза на N секунд, без изменения сцены
- `transition` — чисто визуальный эффект (fadeToBlack / crossfade), не меняет состояние сцены

### Типы переходов
- **fadeToBlack**: оверлей чернеет (0→1), затем исчезает (1→0) — плавный переход между сценами
- **crossfade**: короткий эффект полупрозрачности (0→0.5→0)
- Для последнего шага (closing): fadeToBlack без возврата — сцена уходит в чёрный и остаётся

### Открывающий переход (Opening)
- При старте плеера оверлей мгновенно становится чёрным (`opacity: 1`, `transition: none`)
- Принудительный reflow (`void overlay.offsetHeight`) — без него браузер батчит стили и анимация не запускается
- Состояние первой сцены применяется ДО рендера, пока оверлей чёрный — ни единого флеша
- Оверлей живучий: приколочен к `document.body`, не пересоздаётся при `this.render()`
- После fade-out `currentStep` перепрыгивает на первый scene-шаг, минуя opening transition

### Закрывающий переход (Closing)
- Последний шаг типа transition: fade to black и стоп
- `_stopPlayback` не делает свой fade — closing transition всё делает сам

### Плеер
- Клик в любую пустую область (не тулбар, не панель, не playback-bar) → следующий шаг
- typewriter: первый клик сбрасывает печатание (показывает весь текст), второй — переход
- Портреты залочены, спикер-бар скрыт, стейдж неинтерактивный
- Кнопки: Prev, Play/Pause, Next, Stop

### Редактор
- Load step — загружает сохранённое состояние шага в редактор сцены
- Edit state — GM меняет сцену, кнопка Save сохраняет состояние активного шага
- Up/Down — перестановка шагов
- Delete — удаление шага
- Add Step — три кнопки: Scene, Pause, Transition (с выбором типа и длительности)
- Transition Type selector + Transition Duration — только для transition-шагов
- Дефолтный шаблон при создании: Opening Transition → Scene → Closing Transition

## История ключевых фиксов

### 1. Мёртвая ссылка на overlay
**Симптом**: fade не работал совсем — сцена появлялась мгновенно.
**Причина**: `_startPlayback` сохранял ссылку на overlay через `_createTransitionOverlay()`, затем `this.render()` пересоздавал весь DOM внутри `.vn-root` (включая overlay из шаблона). Ссылка становилась мёртвой — все `overlay.style.*` после render уходили в элемент вне DOM.
**Фикс**: overlay убран из Handlebars-шаблона и создаётся через JS в `document.body`. Render не трогает overlay — ссылка всегда валидна.

### 2. Нет reflow force
**Симптом**: анимации переходов работали через раз или не работали.
**Причина**: браузер батчит изменения стилей. Между `transition: none; opacity: 1` и `transition: Xs ease; opacity: 0` не было принудительного reflow, браузер схлопывал оба изменения.
**Фикс**: `void overlay.offsetHeight` между сбросом стиля и установкой целевых значений.

### 3. Transition-шаги меняли состояние сцены
**Симптом**: closing transition фейдил в чёрный, применял state (без изменений), фейдил обратно — сцена возвращалась. Потом `_stopPlayback` делал второй fade.
**Причина**: `_playStep` для transition-шагов вызывал `_applyStepState(step.state)` и `_broadcast()`.
**Фикс**: transition-шаги чисто визуальные — не трогают `_applyStepState` и `_broadcast`. Closing (последний шаг) — fade to black без возврата. Mid — полный цикл (fade in → fade out) как визуальный эффект.

### 4. Opening transition флешил GM-стейт
**Симптом**: при старте плеера на долю секунды был виден редактор GM до того, как оверлей становился чёрным.
**Причина**: `this.render()` вызывался до установки `overlay.style.opacity = "1"`.
**Фикс**: оверлей ставится на чёрный ДО `this.render()`.

### 5. Socket: Assignment to constant variable
**Симптом**: `_lastBroadcastState` не обновлялся, броадкаст не работал.
**Причина**: `export let _lastBroadcastState` в `helpers.js` создаёт read-only binding при импорте. `_lastBroadcastState = ...` в `visualnovel.js` кидал `TypeError`.
**Фикс**: геттер/сеттер `_getLastBroadcastState()` / `_setLastBroadcastState()`.

## Роадмап (ближайшие шаги)

## Рефакторинг (шаг 4)

Код написан быстро и работает, но 1900 строк в одном файле — потолок.
Ориентир — структура популярных модулей Foundry (FXMaster, TokenMagic, Monk's Active Tiles):

```
scripts/
  main.js                  <-- оркестратор: imports, Hooks.once("init")
  app.js                   <-- класс VisualNovelApp
  settings.js              <-- все game.settings.register() + game.settings.settingsMenu()
  constants.js             <-- packageId, SOCKET, дефолты
  socket.js                <-- game.socket.on() + _broadcastVNState, _applyVNState
  api.js                   <-- game.freevisualnovel публичное API
  helpers.js               <-- Handlebars.registerHelper, _userCan, _roleCan
  controls.js              <-- Scene Control кнопки
  panels/
    location-panel.js
    portrait-panel.js
    scene-panel.js
    presets-panel.js
  hooks/
    index.js               <-- barrel: registerAllHooks()
    canvas-hooks.js
    scene-hooks.js
    token-hooks.js
    ui-hooks.js
```

**Паттерн импорта (как `from X import Y` в Python):**
```js
// settings.js
export function registerSettings() {
  game.settings.register("free-visual-novel", "key", { ... });
}

// main.js — единственная точка входа в module.json
import { registerSettings } from "./settings.js";
import { registerHooks } from "./hooks/index.js";
import { VisualNovelApp } from "./app.js";

Hooks.once("init", function() {
  registerSettings();
  registerHooks();
});

Hooks.once("ready", function() {
  game.socket.on(SOCKET, (data) => { ... });
});
```

Все импорты — статические (`import { ... } from "./file.js"`), никакой магии.
Foundry сам резолвит esmodules, указанные в `"esmodules": ["scripts/main.js"]` в `module.json`.

### План разрезания текущего `visualnovel.js`
1. Создать `scripts/` с подпапками
2. Перенести класс VisualNovelApp в `app.js`
3. Вырезать функции _userCan, _roleCan, Handlebars-хелперы → `helpers.js`
4. Вырезать _broadcastVNState, _applyVNState, _rejoinVN, сокет-обработчик → `socket.js`
5. Вырезать game.settings.register → `settings.js`
6. Вырезать Scene Control кнопки → `controls.js`
7. Вырезать _bindLocationPanel → `panels/location-panel.js`
8. Вырезать _bindPortraitPanel → `panels/portrait-panel.js`
9. Вырезать _bindScenePanel → `panels/scene-panel.js`
10. Вырезать _bindPresetsPanel → `panels/presets-panel.js`
11. `main.js` собирает всё через import и раскладывает по Hooks

Каждый шаг — чистый `Ctrl+X` / `Ctrl+V` + добавление `export` перед function/class.
Никакой смены логики, только перетасовка. За 1 вечер делается.

