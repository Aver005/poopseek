import type { ToolHandler } from "@/tools/types";
import { name as renderName, handler as renderHandler } from "./render";
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

export const FIGMA_SYSTEM_ADDENDUM = [
    "## Figma Design Mode",
    "Ты работаешь в режиме Figma-дизайна.",
    "Используй инструменты figma_* для создания элементов прямо на канвасе.",
    "Всегда создавай дизайн через инструменты — не описывай его словами.",
    "Создавай полноценные экраны: фреймы → фоны → UI-элементы → текст.",
].join("\n");

export const FIGMA_TOOLS_DOC = `
## Figma-инструменты

### ГЛАВНЫЙ ИНСТРУМЕНТ — figma_render

Используй **figma_render** для создания экранов и сложных компонентов.
Передаёт JSX-схему, компилятор разворачивает её в Figma-операции автоматически.

\`\`\`json
{"tool":"figma_render","args":{"jsx":"<Screen>...</Screen>"}}
\`\`\`

#### Компоненты JSX

**Экраны и контейнеры**
| Тег | Описание | Ключевые пропсы |
|---|---|---|
| \`<Screen>\` | Артборд / экран | name, w=390, h=844, fill, gradient |
| \`<Frame>\` | Произвольный фрейм | x, y, w, h, fill, radius, stroke, shadow, gradient |
| \`<VStack>\` | Вертикальный Auto Layout | gap=8, padX, padY, align, counterAlign |
| \`<HStack>\` | Горизонтальный Auto Layout | gap=8, padX, padY, align, counterAlign |

**Готовые компоненты**
| Тег | Описание | Ключевые пропсы |
|---|---|---|
| \`<Card>\` | Карточка (белая, скругл. 16, тень card, обводка) | x, y, w, h, gap, padX, padY, shadow |
| \`<Button>\` | Кнопка с Auto Layout | variant="primary\|secondary\|ghost", text, fullWidth |
| \`<NavBar>\` | Шапка iOS (h=94, разделитель) | title, fill |
| \`<TabBar>\` | Tab Bar iOS (h=83, крепится к низу) | fill |
| \`<Input>\` | Поле ввода (Auto Layout, fill=#F5F5F5) | placeholder, w, h, radius |
| \`<Avatar>\` | Круглый аватар | size=48, fill, symbol |
| \`<Icon>\` | Скруглённый квадрат с символом | symbol, size=40, fill, radius |
| \`<Badge>\` | Бейдж/счётчик (cornerRadius=100) | text, fill |

**Примитивы**
| Тег | Описание | Ключевые пропсы |
|---|---|---|
| \`<Rect>\` | Прямоугольник | x, y, w, h, fill, radius, stroke, shadow, gradient, opacity |
| \`<Ellipse>\` / \`<Circle>\` | Эллипс | x, y, w, h, fill, opacity |
| \`<Line>\` / \`<Divider>\` | Линия | x, y, length, color, weight |

**Типографика** (children = текст)
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

#### Общие пропсы

- Размер: \`w\` / \`width\`, \`h\` / \`height\`
- Позиция: \`x\`, \`y\` (в абсолютных контейнерах)
- \`fill="#HEX"\` — заливка
- \`gradient="from:to:angle"\` — линейный градиент (0°=↓, 90°=→)
- \`stroke="#HEX"\` — обводка (INSIDE, weight=1)
- \`shadow="card|modal|button"\` — пресеты теней
- \`opacity={0.5}\` — прозрачность
- \`radius={16}\` — cornerRadius
- \`gap={12}\` / \`padX={16}\` / \`padY={16}\` — Auto Layout
- \`align="center|start|end|space-between"\`
- \`id="myId"\` — для последующих правок через figma_move_node и др.

#### Пример полного экрана

\`\`\`jsx
<Screen name="Главная" w={390} h={844} fill="#F8F9FA">
  <NavBar title="Главная" />
  <VStack padX={16} padY={24} gap={16}>
    <Card>
      <H2 color="#1A1A1A">Добро пожаловать</H2>
      <Body color="#666666">Начните работу прямо сейчас</Body>
      <Button variant="primary" text="Начать" fullWidth={true} />
    </Card>
    <HStack gap={12}>
      <Card w={155} h={100}>
        <Icon symbol="★" size={32} fill="#FFF3E0" color="#F5A623" />
        <Caption color="#666">Избранное</Caption>
      </Card>
      <Card w={155} h={100}>
        <Icon symbol="⚙" size={32} fill="#E8F4FD" color="#18A0FB" />
        <Caption color="#666">Настройки</Caption>
      </Card>
    </HStack>
  </VStack>
  <TabBar />
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
