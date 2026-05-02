import type { ToolHandler } from "@/tools/types";
import { name as renderName, handler as renderHandler } from "./render";
import { name as defineThemeName, handler as defineThemeHandler } from "./define-theme";
import { name as createFrameName, handler as createFrameHandler } from "./create-frame";
import { name as createTextName, handler as createTextHandler } from "./create-text";
import { name as createRectName, handler as createRectHandler } from "./create-rect";
import { name as createEllipseName, handler as createEllipseHandler } from "./create-ellipse";
import { name as createLineName, handler as createLineHandler } from "./create-line";
import { name as setFillName, handler as setFillHandler } from "./set-fill";
import { name as setStrokeName, handler as setStrokeHandler } from "./set-stroke";
import { name as setOpacityName, handler as setOpacityHandler } from "./set-opacity";
import { name as setShadowName, handler as setShadowHandler } from "./set-shadow";
import { name as setGradientName, handler as setGradientHandler } from "./set-gradient";
import { name as setTextStyleName, handler as setTextStyleHandler } from "./set-text-style";
import { name as setFontName, handler as setFontHandler } from "./set-font";
import { name as setAutoLayoutName, handler as setAutoLayoutHandler } from "./set-auto-layout";
import { name as moveNodeName, handler as moveNodeHandler } from "./move-node";
import { name as resizeNodeName, handler as resizeNodeHandler } from "./resize-node";
import { name as deleteNodeName, handler as deleteNodeHandler } from "./delete-node";
import { name as cloneNodeName, handler as cloneNodeHandler } from "./clone-node";
import { name as groupNodesName, handler as groupNodesHandler } from "./group-nodes";
import { name as renameNodeName, handler as renameNodeHandler } from "./rename-node";

export const figmaToolsRegistry: Record<string, ToolHandler> = {
    [defineThemeName]: defineThemeHandler,
    [renderName]: renderHandler,
    [createFrameName]: createFrameHandler,
    [createTextName]: createTextHandler,
    [createRectName]: createRectHandler,
    [createEllipseName]: createEllipseHandler,
    [createLineName]: createLineHandler,
    [setFillName]: setFillHandler,
    [setStrokeName]: setStrokeHandler,
    [setOpacityName]: setOpacityHandler,
    [setShadowName]: setShadowHandler,
    [setGradientName]: setGradientHandler,
    [setTextStyleName]: setTextStyleHandler,
    [setFontName]: setFontHandler,
    [setAutoLayoutName]: setAutoLayoutHandler,
    [moveNodeName]: moveNodeHandler,
    [resizeNodeName]: resizeNodeHandler,
    [deleteNodeName]: deleteNodeHandler,
    [cloneNodeName]: cloneNodeHandler,
    [groupNodesName]: groupNodesHandler,
    [renameNodeName]: renameNodeHandler,
};

export { createFigmaV2Registry, FIGMA_V2_TOOLS_DOC } from "./v2";

export const FIGMA_SYSTEM_ADDENDUM = [
    "## Figma Design Mode",
    "Ты работаешь в режиме Figma-дизайна.",
    "Используй инструменты figma_* для создания элементов прямо на канвасе.",
    "Всегда создавай дизайн через инструменты — не описывай его словами.",
    "Создавай полноценные экраны: фреймы → фоны → UI-элементы → текст.",
    "Для figma_render всегда отвечай fenced блоком ```json с валидным tool-call JSON.",
    "Если нужно несколько экранов, делай несколько вызовов figma_render подряд: один вызов = один <Screen>.",
    "Каждый figma_render автоматически начинает с подготовки/создания Figma Variables палитры.",
].join("\n");

export const FIGMA_TOOLS_DOC = `
## Figma-инструменты

### ШАГ 1 — figma_define_theme

Перед первым экраном вызови **figma_define_theme**.
Это обязательный первый шаг для новой задачи на дизайн.

- Агент сам придумывает спокойную палитру под задачу.
- Агент создаёт semantic variables и дальше использует их в JSX.
- Не нужно просить пользователя выбирать конкретные hex, если он не просил.

\`\`\`json
{"tool":"figma_define_theme","args":{"name":"food-delivery","tokens":[{"token":"canvas","hex":"#F8FAFC"},{"token":"surface","hex":"#FFFFFF"},{"token":"brand","hex":"#46A758"},{"token":"brand-soft","hex":"#EAF8EE"},{"token":"accent","hex":"#7C5CC4"},{"token":"accent-soft","hex":"#F3EEFF"},{"token":"text","hex":"#142033"},{"token":"text-muted","hex":"#5B657A"},{"token":"text-on-brand","hex":"#FFFFFF"},{"token":"border","hex":"#E2E8F0"}]}}
\`\`\`

После \`figma_define_theme\` используй semantic utility-классы вроде:
- \`bg-canvas\`, \`bg-surface\`, \`bg-surface-soft\`
- \`bg-brand\`, \`bg-brand-soft\`, \`bg-accent\`, \`bg-accent-soft\`
- \`text-text\`, \`text-muted\`, \`text-subtle\`, \`text-on-brand\`
- \`border-border\`, \`border-border-strong\`

### ШАГ 2 — figma_render

Используй **figma_render** для создания экранов и сложных компонентов.
Передавай **кастомный JSX** с пропом \`className\`. Компилятор маппит whitelist-утилиты в Figma Auto Layout, размеры, типографику, цвета и variables.

Если инструмент вернул ошибку валидации или парсинга:
- немедленно исправь JSX;
- вызови \`figma_render\` повторно;
- не переходи к другим действиям, пока JSX не станет валидным.
- Первый ответ на задачу рендера должен быть именно fenced блок \`\`\`json с tool-call JSON. Не пиши объяснение до первого вызова инструмента.
- Никогда не отдавай tool-call обычным текстом без \`\`\`json fence.
- Один вызов \`figma_render\` = один корневой \`<Screen>\`.
- По умолчанию делай ровно один \`figma_render\` за один модельный шаг, потом жди результат инструмента и только потом переходи к следующему экрану.
- Между вызовами можно писать короткие пояснения, но каждый tool-call обязан быть в отдельном \`\`\`json fence.
- После \`figma_define_theme\` не возвращайся к raw hex без причины: используй semantic tokens.

\`\`\`json
{"tool":"figma_render","args":{"jsx":"<Screen>...</Screen>"}}
\`\`\`

Правильная последовательность:

\`\`\`json
{"tool":"figma_define_theme","args":{"name":"food-delivery","tokens":[...]}}
\`\`\`

\`\`\`json
{"tool":"figma_render","args":{"jsx":"<Screen name=\\"Home\\">...</Screen>"}}
\`\`\`

\`\`\`json
{"tool":"figma_render","args":{"jsx":"<Screen name=\\"Restaurant\\">...</Screen>"}}
\`\`\`

\`\`\`json
{"tool":"figma_render","args":{"jsx":"<Screen name=\\"Menu\\">...</Screen>"}}
\`\`\`

#### Основной контракт JSX

- Корневой JSX для одного \`figma_render\` вызова: только один \`<Screen>\`.
- Несколько страниц не рендерятся в один \`<Screen>\` и не требуют рассуждений: просто делай несколько вызовов \`figma_render\`.
- Для layout и визуальных свойств предпочитай \`className\`.
- Числовые пропсы используй только там, где нужен точный контроль: \`x\`, \`y\`, иногда \`w\`, \`h\`.
- Не используй \`div\`, \`span\`, HTML-теги, \`style\`, \`md:\`, \`hover:\`, \`sm:\`, arbitrary values типа \`w-[342px]\`.
- Если LLM случайно сгенерировала URL как \`src=" \\\`https://...\\\` "\`, немедленно нормализуй в чистую строку URL без backticks и лишних пробелов.
- Для новых макетов предпочитай semantic theme classes, а не жёстко зашитые \`green-500\`, \`purple-700\` и т.п.

#### Разрешённые теги

**Контейнеры**
| Тег | Назначение |
|---|---|
| \`<Screen>\` | корневой экран / артборд |
| \`<Frame>\` | универсальный контейнер |
| \`<VStack>\` | вертикальный auto-layout |
| \`<HStack>\` | горизонтальный auto-layout |
| \`<Card>\` | surface-карточка |

**Готовые компоненты**
| Тег | Назначение | Обязательные / ключевые пропсы |
|---|---|---|
| \`<Button>\` | CTA / action | \`label\` или текстовый child |
| \`<Image>\` | картинка по URL | \`src\` |
| \`<Input>\` | поле ввода | \`placeholder\` опционален |
| \`<Badge>\` | бейдж | \`label\` или текст |
| \`<Icon>\` | иконка / символ | \`symbol\` или текст |
| \`<Avatar>\` | круглый аватар | \`symbol\` опционален |
| \`<NavBar>\` | верхняя системная панель | \`title\` опционален |
| \`<TabBar>\` | нижняя системная панель | - |

**Примитивы**
| Тег | Описание | Ключевые пропсы |
|---|---|---|
| \`<Rect>\` | Прямоугольник | x, y, w, h |
| \`<Ellipse>\` / \`<Circle>\` | Эллипс | x, y, w, h, size |
| \`<Line>\` / \`<Divider>\` | Разделитель | length, weight, orientation |

**Типографика**
| Тег | Размер / вес |
|---|---|
| \`<Hero>\` | 40 / Bold, ls=-2 |
| \`<H1>\` | 28 / Bold, ls=-1 |
| \`<H2>\` | 22 / SemiBold, ls=-0.5 |
| \`<H3>\` | 18 / SemiBold |
| \`<Body>\` | 16 / Regular |
| \`<BodySm>\` / \`<Small>\` | 14 / Regular |
| \`<Caption>\` | 12 / Regular |
| \`<Text>\` | кастомный: size, weight, color, align |

#### Разрешённые utility-классы

- Layout: \`flex\`, \`flex-col\`, \`items-start|center|end\`, \`justify-start|center|end|between\`
- Spacing: \`p-*\`, \`px-*\`, \`py-*\`, \`pt-*\`, \`pr-*\`, \`pb-*\`, \`pl-*\`, \`gap-*\`
- Size: \`w-*\`, \`h-*\`, \`w-full\`
- Colors: \`bg-*\`, \`text-*\`, \`border-*\`
- Typography: \`text-xs|sm|base|lg|xl|2xl|3xl|4xl|5xl\`, \`font-normal|medium|semibold|bold\`, \`leading-*\`, \`tracking-*\`, \`text-left|center|right\`
- Surface: \`rounded\`, \`rounded-md|lg|xl|2xl|3xl|full\`, \`rounded-t-xl|2xl|3xl\`, \`border\`, \`border-0\`, \`border-t\`, \`border-b\`, \`shadow-sm|shadow|shadow-md|shadow-lg\`
- Misc: \`overflow-hidden\`

#### Разрешённая палитра

- \`white\`, \`black\`, \`transparent\`
- \`slate-50\`, \`slate-100\`, \`slate-200\`, \`slate-300\`, \`slate-400\`, \`slate-500\`, \`slate-600\`, \`slate-700\`, \`slate-900\`
- \`blue-50\`, \`blue-100\`, \`blue-500\`, \`blue-600\`, \`blue-700\`
- \`green-50\`, \`green-500\`
- \`amber-50\`, \`amber-500\`
- \`purple-50\`, \`purple-100\`, \`purple-500\`, \`purple-700\`
- \`red-50\`, \`red-500\`

При успешном рендере палитра токенов создаётся upfront через Figma Variables API, затем классы вроде \`bg-blue-500\`, \`text-slate-900\`, \`border-slate-200\` биндятся к variables, а не только к raw hex.

#### Пример className-first JSX

\`\`\`jsx
<Screen
  name="Landing"
  className="bg-slate-50"
>
  <Frame x={24} y={24} className="flex flex-col gap-6">
    <Frame className="flex flex-col gap-3">
      <Text className="text-4xl font-bold tracking-tight text-slate-900">
        AI landing page
      </Text>
      <Text className="text-base leading-normal text-slate-600">
        Generate polished Figma screens from strict JSX.
      </Text>
    </Frame>

    <Frame className="flex gap-3">
      <Button label="Start now" className="w-full bg-blue-500 text-white rounded-xl shadow-md" />
      <Button label="See demo" className="w-full bg-white text-slate-900 border border-slate-200 rounded-xl" />
    </Frame>

    <Frame className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <Image
          src="https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80"
          className="w-full h-48 rounded-xl overflow-hidden"
        />
        <Text className="text-lg font-semibold text-slate-900">Fast and predictable</Text>
        <Text className="text-sm leading-snug text-slate-500">
          Static utilities only, strict validation, deterministic compiler.
        </Text>
      </Card>
    </Frame>
  </Frame>
</Screen>
\`\`\`

---

### Точечные правки (после figma_render)

Используй отдельные инструменты только для изменения уже существующих элементов.
Ссылайся на \`id\` заданный в JSX.

**figma_move_node** \`{nodeId, x?, y?}\`
**figma_resize_node** \`{nodeId, width?, height?}\`
**figma_set_fill** \`{nodeId, color}\`
**figma_set_stroke** \`{nodeId, color, weight?, align?}\`
**figma_set_opacity** \`{nodeId, opacity}\`
**figma_set_shadow** \`{nodeId, color?, x?, y?, blur?, spread?, opacity?}\`
**figma_set_gradient** \`{nodeId, from, to, angle?}\`
**figma_set_text_style** \`{nodeId, align?, lineHeight?, letterSpacing?, decoration?}\`
**figma_set_font** \`{nodeId, family, style?}\`
**figma_set_auto_layout** \`{nodeId, direction, gap?, paddingH?, paddingV?, align?, counterAlign?}\`
**figma_delete_node** \`{nodeId}\`
**figma_clone_node** \`{nodeId, newId?, offsetX?, offsetY?}\`
**figma_rename_node** \`{nodeId, name}\`
**figma_group_nodes** \`{nodeIds[], name?, id?}\`
`.trim();
