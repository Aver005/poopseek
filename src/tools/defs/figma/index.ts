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
    "Основной flow: figma.tokens -> figma.primitives.plan -> figma.primitives.jsx -> figma.compose.meta -> figma.compose.jsx -> figma.compile.",
    "Используй legacy figma_* только для совместимости или buffer-режима.",
    "Всегда создавай дизайн через инструменты — не описывай его словами.",
    "Metadata tools и JSX tools не смешиваются: .plan/.meta дают metadata, .jsx дают JSX.",
    "JSX не должен жить строкой внутри JSON-ответа staged tools.",
    "Для tool-calls всегда отвечай fenced блоком ```json с валидным tool-call JSON.",
    "Если tool принимает JSX input, JSON содержит только ids/names/metadata, а JSX идёт следующими fenced блоками ```jsx.",
].join("\n");

export const FIGMA_TOOLS_DOC = `
## Figma-инструменты

### Canonical staged flow

1. \`figma.tokens\`
2. \`figma.primitives.plan\`
3. \`figma.primitives.jsx\`
4. \`figma.compose.meta\`
5. \`figma.compose.jsx\`
6. \`figma.compile\`

### ШАГ 1 — figma.tokens

\`\`\`json
{"tool":"figma.tokens","args":{"name":"food-delivery","collections":{"color":{"canvas":"#F8FAFC","surface":"#FFFFFF","brand":"#46A758","brand-soft":"#EAF8EE","accent":"#7C5CC4","accent-soft":"#F3EEFF","text":"#142033","text-muted":"#5B657A","text-on-brand":"#FFFFFF","border":"#E2E8F0"}}}}
\`\`\`

После \`figma.tokens\` используй semantic utility-классы вроде:
- \`bg-canvas\`, \`bg-surface\`, \`bg-surface-soft\`
- \`bg-brand\`, \`bg-brand-soft\`, \`bg-accent\`, \`bg-accent-soft\`
- \`text-text\`, \`text-muted\`, \`text-subtle\`, \`text-on-brand\`
- \`border-border\`, \`border-border-strong\`

### ШАГ 2 — figma.primitives.plan + figma.primitives.jsx

\`figma.primitives.plan\` возвращает metadata примитивов.
\`figma.primitives.jsx\` принимает JSON c \`primitivesArtifactId\` + \`names[]\`, а JSX кирпичиков идёт следующими fenced \`jsx\` блоками.

### ШАГ 3 — figma.compose.meta + figma.compose.jsx

\`figma.compose.meta\` собирает экран как metadata.
\`figma.compose.jsx\` отдаёт invocation JSX отдельным fenced \`jsx\` блоком.

### ШАГ 4 — figma.compile

\`figma.compile\` компилирует composition artifact.
\`figma.compile.jsx\` показывает expanded JSX для inspect/debug.

\`\`\`json
{"tool":"figma.compile","args":{"compositionArtifactId":"compose_home_v1","dispatch":true}}
\`\`\`

Правильная последовательность:

\`\`\`json
{"tool":"figma.tokens","args":{"name":"food-delivery","collections":{"color":{"canvas":"#F8FAFC","brand":"#46A758","text":"#142033"}}}}
\`\`\`

\`\`\`json
{"tool":"figma.primitives.plan","args":{"tokensArtifactId":"tokens_food_delivery_v1","entries":[{"name":"AppHeader","level":"molecule","props":["title","subtitle"]}]}}
\`\`\`

\`\`\`json
{"tool":"figma.primitives.jsx","args":{"primitivesArtifactId":"primitives_home_v1","names":["AppHeader"]}}
\`\`\`

\`AppHeader\`

\`\`\`jsx
<HStack className="items-center justify-between"><VStack className="gap-1"><H2 className="text-text">{title}</H2><BodySm className="text-muted">{subtitle}</BodySm></VStack></HStack>
\`\`\`

\`\`\`json
{"tool":"figma.compose.meta","args":{"tokensArtifactId":"tokens_food_delivery_v1","primitivesArtifactId":"primitives_home_v1","primitivesJsxArtifactId":"primitives_home_jsx_v1","screenName":"Home","compositionNodes":[{"kind":"element","type":"Screen","props":{"name":"Home","className":"bg-canvas"},"children":[{"kind":"primitive","primitive":"AppHeader","props":{"title":"Привет","subtitle":"Что заказать?"}}]}]}}
\`\`\`

\`\`\`json
{"tool":"figma.compose.jsx","args":{"compositionArtifactId":"compose_home_v1"}}
\`\`\`

\`\`\`json
{"tool":"figma.compile","args":{"compositionArtifactId":"compose_home_v1"}}
\`\`\`

#### Staged правила

- \`.plan\` и \`.meta\` не возвращают JSX.
- input JSX передаётся через fenced \`jsx\`, а не через JSON string fields.
- \`.jsx\` инструменты возвращают fenced \`jsx\`.
- \`figma.compile\` вызывается после compose.
- \`figma.compile.jsx\` не генерирует новый JSX, а показывает expanded результат.

#### Legacy JSX контракт
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
