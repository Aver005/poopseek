# FIGMA UPDATE

## Зачем нужен этот файл

Этот файл фиксирует новую целевую архитектуру Figma-режима и служит источником правды для будущих агентов.
Его задача:

- не потерять суть идеи staged-пайплайна;
- зафиксировать, что в проекте есть сейчас;
- описать, что именно и в каком порядке надо мигрировать;
- оставить подробный след изменений, чтобы потом можно было восстановить картину пост-фактум;
- дать следующему агенту не "направление", а рабочий контракт по инструментам, данным и этапам.

Если агент заходит в Figma-подсистему, он обязан сначала прочитать этот файл.

## TL;DR

Нынешний режим слишком хрупкий, потому что агент почти сразу прыгает в JSX/ops и смешивает сразу несколько задач:

- выдумывание визуальной системы;
- выбор токенов и semantic variables;
- декомпозицию на компоненты;
- сборку финального экрана;
- непосредственный рендер в Figma.

Целевая схема должна быть строго этапной:

1. `figma.tokens`
   Агент проектирует дизайн-систему уровня темы: палитру, spacing, radius, typography, elevation, semantic aliases и режимы.
   Результат сохраняется как структурированный артефакт, который можно повторно использовать.

2. `figma.primitives.plan`
   Агент декомпозирует задачу на кирпичики и возвращает только metadata: имена, уровни, props, зависимости, описания.

3. `figma.primitives.jsx`
   Агент возвращает JSX для уже запланированных кирпичиков.
   На этом этапе ответ содержит fenced `jsx` блоки, а не JSON-строки с JSX.

4. `figma.compose.meta`
   Агент собирает экран как композиционный план поверх существующих кирпичиков.
   Здесь возвращается только metadata и ссылки.

5. `figma.compose.jsx`
   Агент возвращает готовый composition JSX отдельным fenced `jsx` блоком.

6. `figma.compile`
   Только после этого идёт компиляция в ops и рендер в Figma.

Главная мысль: рендер должен стать последним шагом, а не местом, где агент одновременно и думает, и импровизирует, и ломается.

## Правило вывода JSX

Отдельное жёсткое правило для нового режима:

- JSX не должен возвращаться как строковое поле внутри JSON;
- всё, что является JSX, должно возвращаться отдельным fenced блоком с языком `jsx`;
- JSON или другой структурированный payload может содержать только metadata, ids, summary, refs и non-JSX данные;
- если инструмент возвращает несколько кирпичиков, каждый кирпичик должен иметь metadata-запись и отдельный fenced `jsx` блок;
- если инструмент возвращает финальную композицию, сам экран тоже должен идти отдельным fenced `jsx` блоком;
- если compile-этап хочет сохранить expanded JSX, он хранит его как текстовый артефакт/runtime payload, но в пользовательском контракте показывает его отдельным fenced `jsx` блоком, не JSON-строкой;
- инструменты, которые возвращают metadata, не должны возвращать JSX вообще;
- инструменты, которые возвращают JSX, не должны возвращать тяжёлый metadata-payload кроме минимальных ссылок и заголовков.

## Жёсткое разделение tool surface

Новая canonical-конвенция по именованию:

- tools с суффиксом `.plan` или `.meta` возвращают только metadata;
- tools с суффиксом `.jsx` возвращают только JSX presentation layer;
- compile tool принимает ссылки на уже сохранённые артефакты и не просит модель заново генерировать JSX;
- legacy tools не должны использоваться в качестве образца для нового API.

Canonical flow:

1. `figma.tokens`
2. `figma.primitives.plan`
3. `figma.primitives.jsx`
4. `figma.compose.meta`
5. `figma.compose.jsx`
6. `figma.compile`
7. `figma.compile.jsx` опционально, если нужен inspect expanded JSX

## Что есть сейчас

### 1. Prompt и контракт режима

Сейчас поведение режима определяется в основном через:

- `assets/prompts/figma.prompt.md`
- `src/tools/defs/figma/index.ts`
- `src/tools/defs/figma/v2/index.ts`

В prompt уже есть правильная интуиция:

- сначала токены;
- потом JSX;
- потом компиляция.

Но фактически система всё ещё не разделяет этапы как независимые артефакты.

### 2. Реальный runtime

Текущий runtime сидит в:

- `src/figma/server.ts`
- `src/figma/jsx-buffer.ts`
- `src/figma/var-store.ts`
- `src/figma/jsx-parser.ts`
- `src/figma/jsx-validator.ts`
- `src/figma/jsx-compiler.ts`
- `plugins/figma/src/code.ts`

Схема сейчас такая:

1. Figma session поднимает per-session `JsxBuffer` и `VariableStore`.
2. Агент получает V2 registry.
3. Агент либо:
   - собирает дерево через `figma_create` / `figma_edit` / `figma_move`,
   - либо сразу передаёт JSX в `figma_compile`.
4. `figma_compile`:
   - берёт токены из `VariableStore`,
   - прокидывает их в `theme-state`,
   - парсит JSX,
   - валидирует,
   - компилирует в `FigmaOp[]`,
   - кладёт ops в очередь плагина.
5. Плагин применяет ops напрямую к Figma canvas.

### 3. Что уже сделано хорошо

- Есть session-scoped `JsxBuffer`.
- Есть session-scoped `VariableStore`.
- Есть строгий JSX whitelist.
- Есть компилятор в Figma ops.
- Есть Figma Variables support для color tokens и theme tokens.
- Есть backward compatibility через `figma_render` и `figma_define_theme`.

Это хороший фундамент.
Проблема не в полном отсутствии архитектуры, а в том, что она пока не доведена до нормального staged-контракта.

## Почему текущий режим нестабилен

### Корневая проблема

Сейчас агенту предлагают слишком рано переходить к JSX или буферным нодам, хотя до этого не зафиксированы:

- design intent;
- semantic token system;
- reusable primitives;
- стабильные имена кирпичиков;
- ограничения композиции;
- критерии завершённости этапа.

Из-за этого вся система держится на том, что одна генерация модели одновременно:

- придумывает тему;
- придумывает структуру;
- придумывает компоненты;
- пишет JSX;
- надеется, что валидатор и компилятор всё это переживут.

### Симптомы текущего режима

- Агент перескакивает между raw hex, semantic classes и ad-hoc решениями.
- Компоненты не являются first-class артефактом: они просто возникают внутри итогового JSX.
- Нет отдельного инструмента, который возвращает библиотеку кирпичиков с именами и контрактом.
- Нет отдельного инструмента, который возвращает layout composition поверх уже одобренных кирпичиков.
- `figma_tokens` сейчас по сути только batch-set в `VariableStore`, а не полноценная design-system декларация.
- `figma_compile` скрыто совмещает три стадии: theme materialization, AST compile и render dispatch.
- Старые low-level инструменты всё ещё присутствуют в проекте и концептуально засоряют mental model, даже если V2 registry их не экспонирует в Figma server.

### Подтверждено реальным тестом

После реального ручного прогона выяснилось, что проблемы не только архитектурные "на бумаге", но и поведенческие:

- дизайн-агент делает пресные, эмоционально слабые, шаблонные экраны;
- агент не умеет нормально жить в режиме доработок и после нового промпта слишком легко создаёт новый frame вместо точечного редактирования;
- агент плохо понимает ширину контента, контейнеры, безопасные размеры экрана и допустимые границы layout.

Это значит, что staged tools сами по себе недостаточны.
Нужен ещё и orchestration layer, который управляет тем, какой prompt, какой контекст и какие правила агент получает на каждом этапе.

### Архитектурная формулировка проблемы

Сейчас есть compile pipeline, но нет design pipeline.

Нужен переход от:

- "сгенерируй сразу экран"

к:

- "сначала определи дизайн-систему",
- "потом определи набор строительных блоков",
- "потом собери экран",
- "потом скомпилируй".

## Целевая архитектура

### Общий принцип

Внутри Figma mode должны жить не два состояния (`buffer` и `vars`), а четыре независимых слоя:

1. `tokensState`
   Семантические переменные и design decisions этапа 1.

2. `primitivePlanState`
   Metadata-представление кирпичиков: имена, props, зависимости, уровни.

3. `primitiveJsxState`
   JSX-представление кирпичиков, отделённое от metadata.

4. `compositionMetaState`
   Конкретная сборка экрана или группы экранов как metadata/refs.

5. `compositionJsxState`
   JSX-представление конкретной композиции.

6. `renderState`
   Буфер/AST/ops/runtime metadata для фактического рендера.

Только `renderState` должен зависеть от того, что происходит в Figma plugin runtime.
Первые пять слоёв должны быть чистыми артефактами мышления и сборки.

### Новая главная последовательность

Правильный happy path:

1. `figma.tokens`
2. `figma.primitives.plan`
3. `figma.primitives.jsx`
4. `figma.compose.meta`
5. `figma.compose.jsx`
6. `figma.compile`
7. `figma.compile.jsx` при необходимости inspect/debug
8. `figma.commit` или существующий dispatch в plugin

Если нужно быстрое MVP-поведение, можно оставить alias:

- `figma_render` -> internally `figma.compose.meta` + `figma.compose.jsx` + `figma.compile`

Но canonical path должен быть staged.

## Целевая orchestration-модель

### Главный принцип

Один большой универсальный prompt для Figma mode - ошибка.

Правильная система должна работать как orchestrated pipeline, где агент на каждом этапе получает:

- только релевантные инструкции для текущей стадии;
- только нужные инструменты для этой стадии;
- только тот контекст, который нужен сейчас;
- жёсткий критерий завершения этапа;
- запрет перескакивать на следующий этап без успешного результата текущего.

### Flow для первого запроса пользователя

1. Пользователь отправляет первый запрос.
2. Orchestrator запускает stage-1 prompt:
   - только `figma.tokens`,
   - только требования к visual direction,
   - только правила по semantic tokens и quality bar.
3. Если stage 1 успешен, orchestrator запускает stage-2 prompt:
   - только `figma.primitives.plan` и `figma.primitives.jsx`,
   - чёткие требования к reusable primitives,
   - запрет рисовать финальный frame на этом этапе.
4. Для stage 2 orchestrator может запускать sub-agents:
   - один sub-agent на library planning,
   - один или несколько sub-agents на JSX кирпичики,
   - при желании отдельный sub-agent на art direction / visual polish.
5. Когда primitives готовы, orchestrator запускает stage-3 prompt:
   - `figma.compose.meta`,
   - `figma.compose.jsx`,
   - `figma.compile`,
   - жёсткие правила по root frame, width, spacing rhythm и visual hierarchy.
6. Система парсит JSX / compile errors.
7. Если есть ошибки, агент получает repair prompt только на исправление ошибок.
8. Только после успешной компиляции результат показывается пользователю.

### Flow для доработок

На N-ом пользовательском промпте система не должна вести себя как "новая задача с нуля".

Правильный flow такой:

1. Пользователь присылает доработку.
2. Orchestrator определяет режим:
   - `edit-existing`,
   - `fork-variant`,
   - `new-screen`.
3. По умолчанию режим всегда `edit-existing`, если пользователь явно не попросил новый экран, альтернативу или вторую версию.
4. Агент получает revision prompt, а не initial prompt.
5. Вместе с revision prompt агент получает:
   - актуальный snapshot JSX-дерева из Figma;
   - сведения о существующих artifacts;
   - краткую сводку, что именно пользователь попросил поменять;
   - правила "редактируй существующее, не создавай новый frame без причины".
6. Агент делает точечную правку:
   - либо меняет composition,
   - либо меняет primitives,
   - либо в крайнем случае создаёт новый frame, но только с явным обоснованием.
7. Система снова прогоняет compile / validation / render.

### Обязательный orchestrator contract

Orchestrator должен уметь:

- выбирать prompt по стадии, а не держать один prompt на всё;
- блокировать переход к следующей стадии, если текущая не завершена успешно;
- хранить `taskMode`: `initial` | `revision`;
- хранить `editIntent`: `edit-existing` | `fork-variant` | `new-screen`;
- хранить `activeScreenId` / `activeCompositionArtifactId`;
- решать, когда нужен sub-agent, а когда достаточно основного агента;
- формировать repair prompt после parse/validation/compile ошибок;
- подавать агенту не только историю чата, но и актуальное state summary.

## Skill-aware генерация дизайна

### Проблема

Даже хороший staged pipeline будет выдавать посредственный дизайн, если сам агент не знает, какими навыками он может воспользоваться.

Сейчас агенту не хватает design quality layer:

- visual direction;
- композиционной выразительности;
- содержательной hierarchy;
- эмоциональной подачи;
- осознанной responsive-логики.

### Решение

На этапах, где агент принимает визуальные решения, orchestrator должен явно сообщать ему:

- какие skills доступны;
- какие из них рекомендуется использовать;
- когда надо вызывать sub-agent с конкретной специализацией.

Минимум система должна поддерживать skill-aware hints для:

- `frontend-design`
- `ui-design`
- `responsive-design`
- `tailwind`
- `suggest-lucide-icons`

Если skill доступен, orchestrator должен подталкивать агента использовать его.
Если skill недоступен, агент должен продолжать работу без него, но не делать вид, что capability существует.

### Где skill-awareness обязателен

- stage 1: visual direction и theme quality;
- stage 2: primitive quality и library completeness;
- stage 3: final composition, hero treatment, hierarchy, visual polish;
- revision mode: при сложных UX/layout правках.

## Revision-first модель вместо render-first

### Новое базовое правило

После того как пользователю уже показан экран, следующий промпт по умолчанию трактуется как request на правку существующего результата.

То есть default policy должна быть такой:

- сначала попытайся изменить текущий screen/frame;
- не создавай новый frame, если пользователь прямо не попросил:
  - новую версию,
  - альтернативный концепт,
  - второй экран,
  - полный redesign с сохранением старого.

### Что для этого не хватает сейчас

- нет актуального snapshot import из Figma в агентный контекст;
- нет edit-policy на уровне orchestrator;
- нет различия между initial prompt и revision prompt;
- нет правил выбора между patch existing и create new;
- нет достаточной памяти о том, какой frame уже является "актуальным".

### Что должно появиться

Нужен отдельный слой актуализации состояния, условно:

- `figma.snapshot.get`
  Возвращает актуальное JSX-like представление текущего frame/tree из Figma.

Или альтернативно:

- runtime-import step, который перед каждым revision mode читает состояние из plugin и подаёт его агенту как source-of-truth snapshot.

Без этого агент всегда будет вести себя как генератор "с нуля", а не как редактор.

## Явный контракт ширины и layout constraints

### Проблема

Сейчас агент слишком часто не понимает:

- какого размера root screen;
- где full-width, а где content-width;
- как ограничивать ширину контента;
- какой max-width у карточек, хедеров и секций;
- какие размеры считать нормальными для mobile/tablet/desktop.

Из-за этого layout выглядит сырым даже при формально валидном JSX.

### Новое обязательное правило

Каждый compose-stage обязан работать с явным layout contract:

- `platform`: `mobile` | `tablet` | `desktop`;
- `viewportWidth`;
- `viewportHeight`;
- `contentWidthPolicy`: `full-bleed` | `inset` | `centered` | `split`;
- `maxContentWidth`;
- `safeAreaInsets` при необходимости.

### Практический baseline

Если пользователь не задал размеры явно, система должна подставлять внятные defaults:

- mobile:
  - root width: `390`
  - content max width: `390`
  - horizontal padding: `20-24`
- tablet:
  - root width: `768`
  - content max width: `680-720`
- desktop:
  - root width: `1440`
  - content max width: `1120-1200`

### Обязательные выводы для агента

Агент должен не гадать про ширину, а получать её как constraint.

Если этого constraint нет, orchestrator обязан:

- либо вывести его автоматически из platform;
- либо запросить его;
- либо явно отметить default, который был применён.

## Этап 1: `figma.tokens`

### Цель этапа

Отделить проектирование визуальной системы от структуры макета.

На этом этапе агент не рисует экран и не думает о полной верстке.
Он делает только одно: формирует дизайн-систему задачи.

### Что должен делать инструмент

`figma.tokens` должен:

- принять контекст задачи;
- придумать или уточнить visual direction;
- собрать semantic palette;
- определить spacing scale;
- определить radius scale;
- определить typography scale;
- определить shadows/elevation;
- определить stroke/border tokens;
- определить режимы и aliases;
- вернуть всё это одним нормализованным объектом;
- сохранить результат как session artifact.

### Что не должен делать инструмент

`figma.tokens` не должен:

- возвращать финальный экран;
- возвращать layout конкретной страницы;
- собирать большие JSX-деревья;
- напрямую триггерить render;
- смешивать semantic tokens с локальными ad-hoc исключениями без явной пометки.

### Целевой контракт инструмента

Пример целевого вызова:

```json
{
  "tool": "figma.tokens",
  "args": {
    "name": "food-delivery",
    "intent": "Мобильное приложение доставки еды с дружелюбным, чистым и быстрым визуальным языком",
    "platform": "mobile",
    "colorModel": "semantic",
    "modes": ["light"],
    "options": {
      "allowBrandInference": true,
      "allowAccessibilityAdjustments": true
    }
  }
}
```

Пример результата:

```json
{
  "ok": true,
  "artifact": {
    "id": "tokens_food_delivery_v1",
    "type": "figma.tokens",
    "themeName": "food-delivery",
    "modes": ["light"],
    "collections": {
      "color": {
        "canvas": "#F8FAFC",
        "surface": "#FFFFFF",
        "surface-soft": "#F1F5F9",
        "brand": "#46A758",
        "brand-soft": "#EAF8EE",
        "accent": "#7C5CC4",
        "accent-soft": "#F3EEFF",
        "text": "#142033",
        "text-muted": "#5B657A",
        "text-subtle": "#94A3B8",
        "text-on-brand": "#FFFFFF",
        "border": "#E2E8F0",
        "border-strong": "#CBD5E1",
        "success": "#16A34A",
        "warning": "#D97706",
        "danger": "#DC2626"
      },
      "spacing": {
        "0": 0,
        "1": 4,
        "2": 8,
        "3": 12,
        "4": 16,
        "5": 20,
        "6": 24,
        "8": 32,
        "10": 40,
        "12": 48
      },
      "radius": {
        "sm": 8,
        "md": 12,
        "lg": 16,
        "xl": 20,
        "2xl": 24,
        "full": 999
      },
      "typography": {
        "hero": { "fontFamily": "Inter", "fontSize": 40, "lineHeight": 44, "fontWeight": 700, "letterSpacing": -2 },
        "h1": { "fontFamily": "Inter", "fontSize": 28, "lineHeight": 32, "fontWeight": 700, "letterSpacing": -1 },
        "h2": { "fontFamily": "Inter", "fontSize": 22, "lineHeight": 28, "fontWeight": 600, "letterSpacing": -0.5 },
        "body": { "fontFamily": "Inter", "fontSize": 16, "lineHeight": 24, "fontWeight": 400, "letterSpacing": 0 }
      },
      "shadow": {
        "card": { "x": 0, "y": 2, "blur": 12, "spread": 0, "color": "#000000", "opacity": 0.08 },
        "modal": { "x": 0, "y": 8, "blur": 32, "spread": 0, "color": "#000000", "opacity": 0.12 },
        "button": { "x": 0, "y": 4, "blur": 12, "spread": 0, "color": "#2563EB", "opacity": 0.30 }
      }
    },
    "aliases": {
      "bg-canvas": "{color.canvas}",
      "bg-surface": "{color.surface}",
      "text-text": "{color.text}",
      "border-border": "{color.border}",
      "rounded-xl": "{radius.xl}",
      "shadow-card": "{shadow.card}"
    }
  }
}
```

На этом этапе JSX не возвращается вообще.
`figma.tokens` отдаёт только typed metadata и design-system artifact.

### Внутренние инварианты этапа 1

- Все токены обязаны иметь стабильные имена.
- Все токены обязаны храниться как структурированные данные, не просто как список `name/value`.
- Color tokens и semantic aliases не должны теряться при переходе к JSX.
- Typography, spacing и radius должны стать first-class citizens, а не только className conventions.
- Инструмент должен возвращать артефакт с `artifact.id`, чтобы следующие этапы ссылались на конкретную версию.

### Что надо изменить в коде

Минимум:

- расширить `VariableStore` до typed design-system store;
- перестать хранить всё как просто `Map<string, VarEntry>`;
- ввести структуру уровня `FigmaTokensArtifact`;
- разделить raw variables для Figma и семантический design artifact для агента;
- обновить prompt так, чтобы первым canonical шагом был именно `figma.tokens`.

## Этап 2A: `figma.primitives.plan`

### Цель этапа

Отделить дизайн-систему от конкретного макета и получить библиотеку кирпичиков с именами, контрактами и JSX.

### Что считается кирпичиком

Кирпичик - это не обязательно только "атом" в смысле дизайн-системы.
Для этого проекта разумнее делить на три уровня:

- atoms
  Текстовые стили, икон-контейнеры, бейджи, кнопки, input shell, divider, avatar.

- molecules
  SearchBar, ProductCard, CategoryChip, PromoBanner, NavSection, MetricRow.

- sections
  HeroSection, ProductGridSection, CheckoutSummarySection, FeedHeader.

Этап 2 должен уметь возвращать библиотеку всех трёх уровней, но каждый блок должен быть:

- именован;
- независим;
- собран только на базе токенов этапа 1;
- пригоден для повторного использования.

### Что должен делать инструмент

`figma.primitives.plan` должен:

- принять `tokensArtifactId`;
- принять задачу/экран/feature intent;
- декомпозировать дизайн на reusable blocks;
- описать props/slots;
- пометить зависимости между блоками;
- сохранить библиотеку примитивов в session state.

### Что не должен делать инструмент

`figma.primitives.plan` не должен:

- выдавать один большой корневой `<Screen>`;
- вызывать компиляцию;
- придумывать новые токены поверх этапа 1 без фиксации;
- генерировать JSX в том же ответе;
- терять связи между named blocks и их будущими JSX-артефактами.

### Целевой контракт инструмента

Пример вызова:

```json
{
  "tool": "figma.primitives.plan",
  "args": {
    "tokensArtifactId": "tokens_food_delivery_v1",
    "target": "home-screen",
    "brief": "Главный экран доставки еды: шапка, поиск, категории, промо, популярные рестораны",
    "depth": "screen-library"
  }
}
```

Пример результата:

```json
{
  "ok": true,
  "artifact": {
    "id": "primitives_home_screen_v1",
    "type": "figma.primitives.plan",
    "tokensArtifactId": "tokens_food_delivery_v1",
    "entries": [
      {
        "name": "AppHeader",
        "level": "molecule",
        "props": ["title", "subtitle", "avatarSymbol"]
      },
      {
        "name": "SearchField",
        "level": "molecule",
        "props": ["placeholder"]
      },
      {
        "name": "CategoryChip",
        "level": "atom",
        "props": ["label", "active"]
      },
      {
        "name": "PromoCard",
        "level": "molecule",
        "props": ["title", "description", "cta"]
      },
      {
        "name": "RestaurantCard",
        "level": "molecule",
        "props": ["title", "meta", "imageUrl"]
      }
    ]
  }
}
```

`figma.primitives.plan` не возвращает JSX.

## Этап 2B: `figma.primitives.jsx`

### Цель этапа

Вернуть JSX только для уже существующих primitive definitions.

### Что должен делать инструмент

`figma.primitives.jsx` должен:

- принять `primitivesArtifactId`;
- принять список имён кирпичиков или вернуть все;
- вернуть JSX каждого кирпичика отдельным fenced `jsx` блоком;
- не придумывать новые primitive names;
- сохранить JSX как отдельные JSX-артефакты.

### Целевой контракт инструмента

Пример вызова:

```json
{
  "tool": "figma.primitives.jsx",
  "args": {
    "primitivesArtifactId": "primitives_home_screen_v1",
    "names": ["AppHeader", "SearchField", "CategoryChip", "PromoCard", "RestaurantCard"]
  }
}
```

Пример metadata-ответа:

```json
{
  "ok": true,
  "artifact": {
    "id": "primitives_home_screen_jsx_v1",
    "type": "figma.primitives.jsx",
    "primitivesArtifactId": "primitives_home_screen_v1",
    "entries": [
      { "name": "AppHeader", "jsxArtifactId": "jsx_app_header_v1" },
      { "name": "SearchField", "jsxArtifactId": "jsx_search_field_v1" },
      { "name": "CategoryChip", "jsxArtifactId": "jsx_category_chip_v1" },
      { "name": "PromoCard", "jsxArtifactId": "jsx_promo_card_v1" },
      { "name": "RestaurantCard", "jsxArtifactId": "jsx_restaurant_card_v1" }
    ]
  }
}
```

Дальше JSX каждого кирпичика возвращается отдельными fenced блоками:

`AppHeader`

```jsx
<HStack className="items-center justify-between">
  <VStack className="gap-1">
    <H2 className="text-text">{title}</H2>
    <BodySm className="text-muted">{subtitle}</BodySm>
  </VStack>
  <Avatar symbol="{avatarSymbol}" className="bg-brand-soft text-brand" />
</HStack>
```

`SearchField`

```jsx
<Input placeholder="{placeholder}" className="w-full bg-surface rounded-xl border border-border" />
```

`CategoryChip`

```jsx
<Badge label="{label}" className="rounded-full px-3 py-2" />
```

`PromoCard`

```jsx
<Card className="bg-brand rounded-3xl p-5 gap-3">
  <H3 className="text-on-brand">{title}</H3>
  <BodySm className="text-on-brand">{description}</BodySm>
  <Button label="{cta}" className="bg-white text-brand rounded-xl" />
</Card>
```

`RestaurantCard`

```jsx
<Card className="bg-surface rounded-2xl border border-border overflow-hidden">
  <Image src="{imageUrl}" className="w-full h-40 rounded-t-2xl" />
  <VStack className="gap-2 p-4">
    <H3 className="text-text">{title}</H3>
    <BodySm className="text-muted">{meta}</BodySm>
  </VStack>
</Card>
```

### Внутренние инварианты этапа 2

- Каждый primitive имеет уникальное имя.
- Каждый primitive знает свою версию и source artifact.
- JSX primitive не должен использовать raw hex.
- JSX primitive должен проходить тот же validator, что и финальный compose JSX.
- Primitive library должна быть сериализуемой и пригодной для повторного использования в той же сессии.

### Рекомендуемая структура данных

Нужны новые типы:

```ts
interface FigmaPrimitiveDefinition {
  name: string;
  level: "atom" | "molecule" | "section";
  description?: string;
  props: PrimitivePropSpec[];
  dependencies: string[];
}

interface FigmaPrimitivesPlanArtifact {
  id: string;
  type: "figma.primitives.plan";
  tokensArtifactId: string;
  entries: FigmaPrimitiveDefinition[];
}

interface FigmaPrimitiveJsxEntry {
  name: string;
  jsxArtifactId: string;
}

interface FigmaPrimitivesJsxArtifact {
  id: string;
  type: "figma.primitives.jsx";
  primitivesArtifactId: string;
  entries: FigmaPrimitiveJsxEntry[];
}
```

### Что надо изменить в коде

- добавить `PrimitivePlanStore`;
- добавить `PrimitiveJsxStore`;
- добавить validator для named primitive JSX;
- добавить парсер placeholder/slot syntax;
- научить систему прогонять каждый primitive через `parseJsx` + `validateJsxTree`;
- завести новый tool handler `figma.primitives.plan`;
- завести новый tool handler `figma.primitives.jsx`.

## Этап 3A: `figma.compose.meta`

### Цель этапа

Собрать конкретный экран или набор экранов из уже созданных кирпичиков, а не генерировать всё с нуля.

### Что должен делать инструмент

`figma.compose.meta` должен:

- принять `tokensArtifactId`;
- принять `primitivesArtifactId`;
- принять `primitivesJsxArtifactId`;
- выбрать нужные кирпичики;
- инстанцировать их с конкретными props;
- вернуть композиционный артефакт;
- не выполнять compile автоматически, если явно не просят.

### Что считается результатом

Результат этапа 3 - это composition artifact.
Это уже почти финальный продукт, но ещё не Figma ops.

Пример вызова:

```json
{
  "tool": "figma.compose.meta",
  "args": {
    "tokensArtifactId": "tokens_food_delivery_v1",
    "primitivesArtifactId": "primitives_home_screen_v1",
    "screenName": "Home",
    "brief": "Собери главный экран из текущих кирпичиков"
  }
}
```

Пример результата:

```json
{
  "ok": true,
  "artifact": {
    "id": "compose_home_v1",
    "type": "figma.compose.meta",
    "screenName": "Home",
    "tokensArtifactId": "tokens_food_delivery_v1",
    "primitivesArtifactId": "primitives_home_screen_v1",
    "primitivesJsxArtifactId": "primitives_home_screen_jsx_v1",
    "compositionNodes": [
      { "primitive": "AppHeader", "props": { "title": "Hello, Roman", "subtitle": "What do you want today?", "avatarSymbol": "R" } },
      { "primitive": "SearchField", "props": { "placeholder": "Search for food" } },
      { "primitive": "CategoryChip", "props": { "label": "Pizza", "active": true } },
      { "primitive": "CategoryChip", "props": { "label": "Burger" } },
      { "primitive": "CategoryChip", "props": { "label": "Salad" } },
      { "primitive": "PromoCard", "props": { "title": "Free delivery", "description": "On all orders above $20", "cta": "Order now" } }
    ],
    "jsxArtifactId": "compose_home_v1_jsx"
  }
}
```

## Этап 3B: `figma.compose.jsx`

### Цель этапа

Вернуть presentation-версию композиции как fenced `jsx` блок на базе уже сохранённого compose metadata artifact.

### Что должен делать инструмент

`figma.compose.jsx` должен:

- принять `compositionArtifactId`;
- materialize-ить composition metadata в JSX;
- вернуть только metadata summary и fenced `jsx` блок;
- не менять состав кирпичиков и не придумывать новые primitives.

### Целевой контракт инструмента

Пример вызова:

```json
{
  "tool": "figma.compose.jsx",
  "args": {
    "compositionArtifactId": "compose_home_v1"
  }
}
```

Пример metadata-ответа:

```json
{
  "ok": true,
  "artifact": {
    "id": "compose_home_jsx_v1",
    "type": "figma.compose.jsx",
    "compositionArtifactId": "compose_home_v1",
    "jsxArtifactId": "compose_home_v1_jsx"
  }
}
```

И сам composition JSX должен идти отдельно:

```jsx
<Screen name="Home" className="bg-canvas">
  <VStack className="gap-6 p-6">
    <AppHeader title="Hello, Roman" subtitle="What do you want today?" avatarSymbol="R" />
    <SearchField placeholder="Search for food" />
    <HStack className="gap-3">
      <CategoryChip label="Pizza" active />
      <CategoryChip label="Burger" />
      <CategoryChip label="Salad" />
    </HStack>
    <PromoCard title="Free delivery" description="On all orders above $20" cta="Order now" />
    <VStack className="gap-4">
      <H3 className="text-text">Popular restaurants</H3>
      <RestaurantCard title="Italian House" meta="25 min · 4.8" imageUrl="https://example.com/1.jpg" />
      <RestaurantCard title="Sushi Club" meta="30 min · 4.7" imageUrl="https://example.com/2.jpg" />
    </VStack>
  </VStack>
</Screen>
```

### Внутренние инварианты этапа 3

- Композиция обязана ссылаться только на существующие primitives.
- Композиция обязана быть полностью разворачиваемой в валидный JSX.
- Перед компиляцией система должна уметь materialize primitives в plain JSX tree.
- Этап 3 не должен silently invent новые primitives.

### Что надо изменить в коде

- добавить `CompositionMetaStore`;
- добавить `CompositionJsxStore`;
- добавить materializer: `primitive invocation -> expanded JSX`;
- ввести pre-compile step, который разворачивает named primitives в canonical JSX;
- расширить validator, чтобы он валидировал как compose AST, так и expanded AST;
- добавить новый tool handler `figma.compose.meta`;
- добавить новый tool handler `figma.compose.jsx`.

## Этап 4A: `figma.compile`

### Зачем нужен отдельный этап compile

Сейчас compile и render почти одно и то же.
Так оставлять не надо.

Нужен отдельный шаг, который:

- берёт composition artifact;
- materialize-ит его в plain JSX без участия модели;
- валидирует expanded result;
- компилирует в `FigmaOp[]`;
- возвращает compile artifact;
- по желанию отдельно коммитит его в Figma plugin runtime.

### Целевой контракт

Пример:

```json
{
  "tool": "figma.compile",
  "args": {
    "compositionArtifactId": "compose_home_v1",
    "dispatch": true
  }
}
```

Пример результата:

```json
{
  "ok": true,
  "artifact": {
    "id": "compile_home_v1",
    "type": "figma.compile",
    "compositionArtifactId": "compose_home_v1",
    "opCount": 42,
    "expandedJsxArtifactId": "compile_home_v1_expanded_jsx"
  }
}
```

## Этап 4B: `figma.compile.jsx`

### Цель этапа

Дать inspect/debug-представление expanded JSX без повторной генерации модели.

### Что должен делать инструмент

`figma.compile.jsx` должен:

- принять `compileArtifactId` или `compositionArtifactId`;
- вернуть expanded JSX как fenced `jsx` блок;
- не генерировать новый JSX через модель;
- не изменять compile artifact.

Пример:

```json
{
  "tool": "figma.compile.jsx",
  "args": {
    "compileArtifactId": "compile_home_v1"
  }
}
```

Если compile-этап показывает materialized JSX пользователю, он делает это отдельным fenced блоком:

```jsx
<Screen ...>
  ...
</Screen>
```

### Почему это лучше текущего `figma_compile`

- можно дебажить до рендера;
- можно хранить expanded JSX как отдельный текстовый артефакт;
- можно diff-ить composition и compile artifacts;
- можно переиспользовать compose result для нескольких compile targets;
- можно сделать dry-run, snapshot tests и AST inspection.

## Рекомендуемая новая модель данных

### Session stores

Нужны отдельные store'ы:

```ts
interface FigmaSessionState {
  tokens: TokensStore;
  primitivePlans: PrimitivePlanStore;
  primitiveJsx: PrimitiveJsxStore;
  compositionMeta: CompositionMetaStore;
  compositionJsx: CompositionJsxStore;
  compileArtifacts: CompileArtifactStore;
  renderBuffer: JsxBuffer;
}
```

### Artifacts

Все этапы должны возвращать versioned artifacts:

- `figma.tokens`
- `figma.primitives.plan`
- `figma.primitives.jsx`
- `figma.compose.meta`
- `figma.compose.jsx`
- `figma.compile`
- `figma.compile.jsx`
- `figma.jsx-snippet`

У каждого артефакта обязаны быть:

- `id`
- `type`
- `version`
- `createdAt`
- `sourceMessageId` или аналог trace metadata
- `derivedFrom`
- `payload`

JSX-артефакты лучше хранить отдельно от metadata-артефактов:

- metadata artifact описывает структуру, зависимости и ссылки;
- JSX artifact хранит только JSX content;
- связь идёт через `jsxArtifactId`.

### Metadata для дебага

У каждого артефакта желательно хранить:

- `warnings`
- `assumptions`
- `normalizations`
- `validationSummary`

Это резко упростит расследование плохих генераций.

## Как это бьётся с текущей кодовой базой

### Что можно переиспользовать почти без изменений

- `src/figma/jsx-parser.ts`
- `src/figma/jsx-validator.ts`
- `src/figma/jsx-compiler.ts`
- `plugins/figma/src/code.ts`

Это уже хороший downstream pipeline.

### Что нужно оставить, но переработать

- `VariableStore`
  Сейчас это слишком плоское хранилище.
  Его надо либо расширить, либо оставить как низкоуровневый backend для Figma variables, а над ним добавить typed tokens artifact store.

- `JsxBuffer`
  Его стоит сохранить, но понизить в статусе.
  Он должен быть render buffer / scratchpad, а не главным представлением дизайна.

- `figma_compile`
  Его надо превратить в compile step, который работает от composition artifact.

### Что нужно фактически добавить

- `src/figma/tokens-store.ts`
- `src/figma/primitive-plan-store.ts`
- `src/figma/primitive-jsx-store.ts`
- `src/figma/composition-meta-store.ts`
- `src/figma/composition-jsx-store.ts`
- `src/figma/compose-materializer.ts`
- `src/figma/artifact-types.ts`
- `src/tools/defs/figma/tokens.ts`
- `src/tools/defs/figma/primitives.plan.ts`
- `src/tools/defs/figma/primitives.jsx.ts`
- `src/tools/defs/figma/compose.meta.ts`
- `src/tools/defs/figma/compose.jsx.ts`
- `src/tools/defs/figma/compile.ts`
- `src/tools/defs/figma/compile.jsx.ts`

Названия можно уточнить, но разделение ответственности должно сохраниться.

## План миграции

### Фаза 0. Зафиксировать архитектуру

Цель:

- остановить расползание концепции;
- ввести один source of truth;
- определить canonical flow.

Статус:

- выполнено этим документом.

Что считается done:

- есть `FIGMA-UPDATE.md`;
- будущие изменения обязаны обновлять этот файл;
- staged-contract описан явно.

### Фаза 1. Ввести артефакты токенов без поломки V2

Цель:

- не ломая текущий `figma_tokens`, научить систему сохранять полноценный typed artifact.

Шаги:

1. Добавить typed artifact для токенов.
2. Оставить `figma_tokens` как имя команды.
3. Расширить handler так, чтобы он:
   - валидировал структуру,
   - строил `FigmaTokensArtifact`,
   - сохранял его в `TokensStore`,
   - синхронизировал `VariableStore` для compile/runtime.
4. Добавить `figma_tokens_get` / `figma_tokens_list` или эквивалентные introspection tools.

Условие совместимости:

- старые сценарии с `tokens:[{name,value}]` продолжают работать.

### Фаза 2. Добавить `figma.primitives.plan` и `figma.primitives.jsx`

Цель:

- сделать primitives first-class сущностью.

Шаги:

1. Добавить `PrimitivePlanStore`.
2. Добавить `figma.primitives.plan`.
3. Добавить `figma.primitives.jsx`.
4. Валидировать JSX каждого primitive отдельно.
5. Научить prompt требовать оба этапа перед compose/render.

Условие совместимости:

- `figma_compile({jsx})` временно остаётся рабочим bypass-path.

### Фаза 3. Добавить `figma.compose.meta` и `figma.compose.jsx`

Цель:

- вынести сборку экрана в отдельный слой.

Шаги:

1. Добавить composition metadata artifact.
2. Добавить composition JSX artifact.
3. Добавить materialization pipeline.
4. Добавить validator compose-level ссылок на primitives.
5. Добавить `figma.compose.meta`.
6. Добавить `figma.compose.jsx`.

Условие совместимости:

- старый direct JSX путь пока ещё жив.

### Фаза 4. Пересобрать `figma_compile`

Цель:

- сделать compile deterministic downstream-шагом.

Шаги:

1. Научить `figma_compile` принимать `compositionArtifactId`.
2. Внутри:
   - получить compose artifact,
   - materialize JSX,
   - прогнать validator,
   - собрать ops,
   - отправить в plugin.
3. Добавить `figma.compile.jsx` для inspect/debug.
4. Оставить `jsx` аргумент как temporary compatibility mode.

Условие совместимости:

- direct JSX compile можно держать до завершения миграции.

### Фаза 5. Деприкейт legacy path

Цель:

- убрать двусмысленность старого режима.

Шаги:

1. Пометить `figma_render` как alias/deprecated.
2. Пометить `figma_define_theme` как legacy alias для `figma.tokens`.
3. Убрать из prompt рекомендации, которые ведут к старому flow.
4. Со временем убрать лишние low-level mental-model описания из user-facing docs.

Удалять код сразу не надо.
Сначала нужен telemetry signal, что staged-flow реально используется и стабилен.

## Prompt migration

### Что надо поменять в `assets/prompts/figma.prompt.md`

Сейчас prompt уже говорит "первый шаг всегда `figma_tokens`", но этого мало.
Нужно жёстко зафиксировать:

- `figma.tokens` обязателен;
- `figma.primitives.plan` обязателен;
- `figma.primitives.jsx` обязателен;
- после них обязателен `figma.compose.meta`;
- затем обязателен `figma.compose.jsx`;
- `figma.compile` идёт после них;
- агент не должен прыгать сразу к финальному JSX, кроме explicit fast-path режима.

### Рекомендуемая новая формулировка prompt contract

Нужно добавить прямой порядок:

1. `figma.tokens`
2. `figma.primitives.plan`
3. `figma.primitives.jsx`
4. `figma.compose.meta`
5. `figma.compose.jsx`
6. `figma.compile`

И отдельно fast-path:

- только если пользователь явно просит "быстро", "черновик", "без decomposition" или включён debug/dev режим.

## Backward compatibility policy

На переходный период:

- `figma_define_theme` = legacy alias на `figma.tokens`
- `figma_render` = legacy alias на `figma.compose.meta` + `figma.compose.jsx` + `figma.compile`
- `figma_compile({jsx})` = compatibility mode

Но во внутренней документации и prompt canonical path должен быть только staged.

## Тестовый план

### Обязательные unit tests

- `figma.tokens` создаёт typed artifact и синхронизирует runtime variables.
- `figma.primitives.plan` сохраняет библиотеку с уникальными именами.
- `figma.primitives.jsx` не может вернуть JSX для несуществующего primitive.
- invalid primitive JSX ловится до compose.
- `figma.compose.meta` не принимает отсутствующие primitive references.
- `figma.compose.jsx` материализует только существующий composition artifact.
- `figma.compile` материализует compose artifact в expanded JSX.
- backward compatibility path остаётся рабочим.

### Обязательные integration tests

- полный happy path: tokens -> primitives.plan -> primitives.jsx -> compose.meta -> compose.jsx -> compile.
- compose artifact можно перекомпилировать повторно.
- одна токен-система может кормить несколько compose artifacts.
- legacy `figma_render` всё ещё отрабатывает поверх нового ядра.

### Очень желательные snapshot tests

- snapshot для tokens artifact;
- snapshot для primitive library;
- snapshot для expanded JSX;
- snapshot для итоговых ops.

## Риски миграции

### Риск 1. Слишком сложный контракт для модели

Если сделать инструменты слишком многословными, модель начнёт путаться.

Что делать:

- держать выход каждого этапа структурированным и коротким;
- хранить полный payload в session state;
- в tool result давать summary + `artifact.id`.

### Риск 2. Primitive system станет mini-framework

Не надо превращать это в полноценный React runtime.

Что делать:

- ограничить primitive syntax;
- не поддерживать произвольный JS;
- оставить только JSX templates + placeholder props + simple expansion.

### Риск 3. Слом backward compatibility

Что делать:

- не удалять `figma_render` сразу;
- сначала перевести его на новую внутреннюю реализацию;
- только потом деприкейтить внешне.

### Риск 4. Артефакты разъедутся с runtime state

Что делать:

- artifacts должны быть primary truth;
- `VariableStore` и `JsxBuffer` должны быть derived/runtime representations;
- все derived states должны восстанавливаться из artifacts.

## Decision log

### ADR-001. Рендер не должен быть первым этапом

Решение:

- сначала артефакты мышления, потом compile/render.

Почему:

- так проще дебажить;
- так меньше хаоса;
- так появляются stable reuse points.

### ADR-002. `figma.tokens` должен стать typed design artifact

Решение:

- уйти от плоского `name/value` как единственного источника правды.

Почему:

- этого недостаточно для typography, spacing, radius и aliases.

### ADR-003. Примитивы должны быть named artifacts

Решение:

- каждый кирпичик имеет имя, props, JSX и зависимости.

Почему:

- иначе этап 2 не существует как сущность, а значит снова будет хаос.

### ADR-004. Compile и compose разделяются

Решение:

- `figma.compose.meta` собирает intent-level экран как metadata;
- `figma.compose.jsx` выдаёт presentation-версию этого экрана;
- `figma.compile` превращает его в executable payload.

Почему:

- это делает дебаг и тестирование внятными.

### ADR-005. JSX не живёт внутри JSON

Решение:

- любой пользовательский или документируемый JSX возвращается отдельным fenced `jsx` блоком;
- JSON содержит только metadata и ссылки на JSX-артефакты.

Почему:

- JSX внутри JSON плохо читается;
- его труднее ревьюить глазами;
- fenced JSX намного лучше подходит для диффов, копирования и ручной правки;
- это делает staged-пайплайн понятнее визуально.

### ADR-006. Metadata tools и JSX tools разделяются по именам

Решение:

- `figma.primitives.plan` и `figma.primitives.jsx` - разные инструменты;
- `figma.compose.meta` и `figma.compose.jsx` - разные инструменты;
- `figma.compile` и `figma.compile.jsx` - разные инструменты.

Почему:

- так модель не смешивает две разные ответственности;
- так проще валидировать ответы по типу инструмента;
- так контракт становится машинно-проверяемым;
- так легче строить UI и логи вокруг стадий пайплайна.

### ADR-007. Prompt должен быть stage-specific, а не универсальным

Решение:

- initial flow, primitive flow, compose flow, repair flow и revision flow должны иметь разные системные промпты;
- агент на каждом этапе получает только релевантный ему набор инструментов и правил.
- это должно быть зафиксировано не только в коде orchestration, но и в отдельных prompt-файлах.

Почему:

- один универсальный prompt перегружает модель;
- модель начинает преждевременно компилировать, пересоздавать frame и терять edit discipline;
- stage-specific prompts повышают управляемость pipeline.

### ADR-008. Revision mode по умолчанию редактирует существующий результат

Решение:

- после первого успешно показанного результата любой следующий пользовательский промпт по умолчанию считается запросом на правку текущего экрана;
- новый frame создаётся только при явном `fork-variant` или `new-screen`.

Почему:

- это соответствует пользовательскому ожиданию;
- это устраняет главную текущую проблему "каждый новый запрос = новый frame".

### ADR-009. Snapshot из Figma обязателен для режима доработок

Решение:

- перед revision-mode агент должен получать актуальный snapshot текущего дерева/JSX из Figma или эквивалентного runtime state.

Почему:

- без актуального source of truth агент не может надёжно редактировать уже существующий результат.

### ADR-010. Width policy не может оставаться неявной

Решение:

- compose-stage всегда работает с явными layout constraints;
- root width, content width policy и max content width должны быть известны до финального compose.

Почему:

- иначе даже валидный JSX даёт визуально слабый и непропорциональный layout.

### ADR-011. Сырой пользовательский prompt не должен идти прямо в builder stage

Решение:

- перед staged flow должен выполняться preprocess step;
- отдельный агент превращает сырой пользовательский запрос в короткий design brief;
- builder получает уже не исходный шумный prompt, а подготовленную цель с constraints и anti-goals.

Почему:

- модель слишком легко теряется, когда одновременно должна интерпретировать vague prompt, придумывать direction и строить UI;
- короткий brief лучше удерживает цель и повышает качество решений.

## TODO

### P0

- [x] Ввести typed artifact model для `figma.tokens`.
- [x] Добавить `TokensStore` и связать его с `VariableStore`.
- [x] Обновить `assets/prompts/figma.prompt.md` под staged flow.
- [x] Обновить `src/figma/server.ts`, чтобы session state держал отдельные stores для этапов.

### P1

- [x] Разделить primitives layer на `figma.primitives.plan` и `figma.primitives.jsx`.
- [x] Добавить `PrimitivePlanStore`.
- [x] Добавить `PrimitiveJsxStore`.
- [x] Добавить validation pipeline для primitive JSX.
- [x] Разделить compose layer на `figma.compose.meta` и `figma.compose.jsx`.
- [x] Добавить `CompositionMetaStore`.
- [x] Добавить `CompositionJsxStore`.
- [x] Добавить compose materializer.

### P2

- [x] Переделать `figma_compile`, чтобы canonical input был `compositionArtifactId`.
- [x] Добавить `figma.compile.jsx` для inspect expanded JSX.
- [x] Добавить compile artifacts и dry-run режим.
- [x] Перевести `figma_render` на новую внутреннюю реализацию.
- [x] Добавить introspection tools для artifact stores.
- [ ] Добавить snapshot tests на expanded JSX и ops.

### P3

- [ ] Задеприкейтить старые mental-model подсказки в docs.
- [ ] Решить судьбу legacy low-level figma tools вне Figma server runtime.
- [ ] Добавить telemetry/trace по артефактам и стадиям.

### P4

- [x] Ввести orchestrator со stage-specific prompts вместо одного универсального prompt.
- [x] Добавить `taskMode`: `initial` | `revision`.
- [x] Добавить `editIntent`: `edit-existing` | `fork-variant` | `new-screen`.
- [x] Научить систему блокировать переход между стадиями до успешного завершения предыдущей.
- [x] Добавить repair flow после parse/validation/compile ошибок.
- [x] Добавить sub-agent orchestration для primitives и visual polish.
- [x] Сделать skill-aware routing/hints для visual-design стадий.
- [x] Добавить snapshot import/current-tree export для режима доработок.
- [x] Ввести width/layout constraints как обязательный input compose-stage.
- [x] Добавить policy: новый frame создаётся только по явному разрешению или явному intent.

## Checklist для любого будущего изменения

Любой агент, который меняет Figma subsystem, обязан:

1. Обновить этот файл.
2. Добавить запись в `Change log` ниже.
3. Пометить, какие TODO закрыты, какие добавлены, какие переехали.
4. Указать, были ли изменения:
   - только в docs;
   - только в prompt;
   - в runtime;
   - в tool contract;
   - в tests.
5. Если меняется контракт инструмента, привести пример запроса и ответа.

## Change log

### 2026-05-02

Автор: агент текущей сессии

Изменения:

- добавлен новый файл `FIGMA-UPDATE.md`;
- зафиксировано текущее состояние Figma mode;
- описана целевая staged-архитектура:
  - `figma.tokens`
  - `figma.primitives.plan`
  - `figma.primitives.jsx`
  - `figma.compose.meta`
  - `figma.compose.jsx`
  - `figma.compile`
- описан план миграции по фазам;
- добавлены ADR, TODO и checklist для будущих агентов.
- обновлён контракт вывода: JSX должен жить в отдельных fenced `jsx` блоках, а не строкой внутри JSON.
- ужесточён сам tool contract: metadata и JSX разведены по разным именованным инструментам.
- реализованы typed artifact types и session stores для staged flow;
- реализованы новые инструменты:
  - `figma.tokens`
  - `figma.tokens.get`
  - `figma.tokens.list`
  - `figma.primitives.plan`
  - `figma.primitives.plan.get`
  - `figma.primitives.plan.list`
  - `figma.primitives.jsx`
  - `figma.primitives.jsx.get`
  - `figma.primitives.jsx.list`
  - `figma.compose.meta`
  - `figma.compose.meta.get`
  - `figma.compose.meta.list`
  - `figma.compose.jsx`
  - `figma.compose.jsx.get`
  - `figma.compose.jsx.list`
  - `figma.compile`
  - `figma.compile.get`
  - `figma.compile.list`
  - `figma.compile.jsx`
- `figma_compile` научен компилировать по `compositionArtifactId`;
- `figma_render` переведён на staged dispatcher с fallback на compile path;
- prompt `assets/prompts/figma.prompt.md` переведён на новый canonical flow;
- `src/tools/defs/figma/v2/index.ts` упрощён до thin registry, staged-логика вынесена в `src/tools/defs/figma/v2/staged.ts`;
- обновлён secondary doc layer в `src/tools/defs/figma/index.ts`, чтобы не конфликтовал с новым flow;
- добавлены тесты на dotted tool names, staged materialization pipeline, introspection tools и `figma_render` alias.
- после ручного UX-теста зафиксированы новые системные требования:
  - staged tools недостаточны без stage-specific orchestration;
  - revision mode должен быть default после первого рендера;
  - агент должен получать snapshot текущего результата перед доработками;
  - width/layout constraints должны быть first-class input;
  - visual quality должна усиливаться через skill-aware prompting и sub-agent decomposition.
- реализован первый runtime-слой orchestration:
  - новый `src/figma/orchestrator.ts`;
  - `FigmaSession` теперь хранит orchestration state;
  - `FigmaServerManager` переведён на multi-pass pipeline;
  - initial flow разбит на `tokens -> primitives -> compose -> repair`;
  - revision flow теперь отдельный режим;
  - stage prompts формируются динамически;
  - stage-specific prompts вынесены в отдельные файлы:
    - `assets/prompts/figma/tokens.prompt.md`
    - `assets/prompts/figma/primitives.prompt.md`
    - `assets/prompts/figma/compose.prompt.md`
    - `assets/prompts/figma/repair.prompt.md`
    - `assets/prompts/figma/revision.prompt.md`
  - `assets/prompts/figma.prompt.md` теперь используется как overview/base prompt, а не как единственный prompt для всех стадий;
  - stage gating ограничивает видимые `figma.*` tools по текущей стадии;
  - `figma_render` / compile dispatch в revision `edit-existing` режиме удаляет предыдущий root frame перед новым рендером;
  - в Figma mode начали прокидываться skill hints и sub-agent capability;
  - layout constraints выводятся автоматически и подаются агенту как часть stage context.
- реализован plugin snapshot round-trip:
  - plugin main thread умеет сериализовать текущее дерево в snapshot + JSX-like representation;
  - `plugins/figma/ui.html` синкает snapshot в сервер перед `/v1/chat` и после `OPS_DONE`;
  - сервер принимает snapshot через `/v1/snapshot`;
  - revision mode теперь предпочитает plugin snapshot перед derived artifacts.
- добавлены tests для orchestration heuristics, width policy и replace-current-screen policy.
- добавлены tests на приоритет plugin snapshot.
- реализован минимальный patch planner для revision `edit-existing`:
  - если доступен plugin snapshot root, система переиспользует текущий root frame;
  - root патчится через rename/move/resize/fill/corner/clip ops;
  - старые дети root удаляются;
  - subtree создаётся заново уже внутри существующего root;
  - fallback path по-прежнему остаётся `delete root + rerender`.
- добавлен preprocess layer перед staged flow:
  - новый `assets/prompts/figma/preprocess.prompt.md`;
  - новый `src/figma/preprocess.ts`;
  - preprocess агент строит краткий `PreparedDesignBrief`;
  - brief сохраняется в session orchestration state;
  - все stage user messages теперь получают prepared brief вместо зависимости только от сырого user prompt.
- stage prompts дополнительно ужаты: меньше шума, больше коротких целевых инструкций.

Что не менялось:

- plugin runtime Figma не менялся;
- legacy buffer CRUD flow сохранён;
- low-level legacy tool files вне V2 registry не удалялись.
- полноценный semantic patch planner ещё не реализован; текущая revision strategy пока основана на replace-current-screen policy.
- полноценный deep tree diff planner ещё не реализован; текущий patch planner пока работает на уровне reuse root + rebuild children.
- visual quality всё ещё может быть недостаточной даже при хорошем orchestration; если brief + short prompts не дадут скачка качества, следующим шагом нужен отдельный art-direction stage или dedicated visual sub-agent.

Итог:

- staged runtime уже частично реализован;
- canonical flow внедрён в prompt и V2 registry;
- staged tools уже вынесены в отдельный модуль;
- миграция не завершена полностью, потому что поверх staged runtime теперь требуется полноценный orchestration layer;
- P0, P1 и значимая часть P2 уже сделаны;
- P4 частично реализован, включая plugin snapshot import;
- главный оставшийся behavioural gap теперь в более умном patch/edit planner вместо current replace strategy и в усилении visual quality.

## Короткая инструкция будущему агенту

Если тебе дали задачу "починить Figma mode" или "улучшить Figma pipeline", делай так:

1. Прочитай этот файл полностью.
2. Определи, какая фаза миграции реально затрагивается.
3. Не перепрыгивай сразу к compile/render, если задача касается токенов или decomposition.
4. Не смешивай новые staged tools с legacy mental model без явной причины.
5. После изменений обнови:
   - TODO,
   - Change log,
   - примеры контрактов,
   - статус миграции.

Если сомневаешься, помни главное правило:

сначала система токенов, потом кирпичики, потом сборка, и только потом рендер.
