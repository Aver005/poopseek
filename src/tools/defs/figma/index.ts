import type { ToolHandler } from "@/tools/types";
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
## Инструменты Figma

Назначай осмысленные \`id\` всем элементам, на которые будешь ссылаться.
Угол градиента: 0° = сверху вниз, 90° = слева направо.

---

### Создание примитивов

**figma_create_frame** — артборд/экран
\`\`\`json
{"tool":"figma_create_frame","args":{"id":"s1","name":"Главная","width":390,"height":844,"x":0,"y":0,"fill":"#FFFFFF"}}
\`\`\`
Параметры: id, name, width, height, x?, y?, fill? (hex)

**figma_create_rect** — прямоугольник
\`\`\`json
{"tool":"figma_create_rect","args":{"id":"card1","frameId":"s1","x":16,"y":80,"width":358,"height":120,"fill":"#FFFFFF","cornerRadius":16}}
\`\`\`
Параметры: width, height, id?, frameId?, x?, y?, fill?, cornerRadius?, name?

**figma_create_ellipse** — круг/эллипс
\`\`\`json
{"tool":"figma_create_ellipse","args":{"id":"avatar","frameId":"s1","x":24,"y":96,"width":48,"height":48,"fill":"#E8F4FD"}}
\`\`\`
Параметры: width, height, id?, frameId?, x?, y?, fill?, name?

**figma_create_text** — текстовый элемент
\`\`\`json
{"tool":"figma_create_text","args":{"id":"title","frameId":"s1","content":"Добро пожаловать!","x":24,"y":200,"fontSize":28,"fontWeight":"Bold","color":"#1A1A1A"}}
\`\`\`
Параметры: content, id?, frameId?, x?, y?, fontSize?, fontWeight? ("Regular"|"Bold"), color?

**figma_create_line** — линия/разделитель
\`\`\`json
{"tool":"figma_create_line","args":{"id":"div1","frameId":"s1","x":0,"y":94,"length":390,"color":"#E5E5E5","weight":1}}
\`\`\`
Параметры: length, id?, frameId?, x?, y?, rotation?, color?, weight?

---

### Трансформация нодов

**figma_move_node** — переместить существующий нод
\`\`\`json
{"tool":"figma_move_node","args":{"nodeId":"card1","x":24,"y":160}}
\`\`\`
Параметры: nodeId (ссылка на id), x?, y?

**figma_resize_node** — изменить размер
\`\`\`json
{"tool":"figma_resize_node","args":{"nodeId":"card1","width":342,"height":140}}
\`\`\`
Параметры: nodeId, width?, height?

**figma_delete_node** — удалить нод
\`\`\`json
{"tool":"figma_delete_node","args":{"nodeId":"card1"}}
\`\`\`
Параметры: nodeId

**figma_clone_node** — клонировать нод
\`\`\`json
{"tool":"figma_clone_node","args":{"nodeId":"card1","newId":"card2","offsetX":0,"offsetY":136}}
\`\`\`
Параметры: nodeId, newId?, offsetX?, offsetY?

**figma_rename_node** — переименовать слой
\`\`\`json
{"tool":"figma_rename_node","args":{"nodeId":"card1","name":"Карточка / Товар"}}
\`\`\`
Параметры: nodeId, name

---

### Заливка и стиль

**figma_set_fill** — сменить цвет заливки
\`\`\`json
{"tool":"figma_set_fill","args":{"nodeId":"bg1","color":"#18A0FB"}}
\`\`\`
Параметры: nodeId, color (hex)

**figma_set_stroke** — обводка
\`\`\`json
{"tool":"figma_set_stroke","args":{"nodeId":"card1","color":"#E5E5E5","weight":1,"align":"INSIDE"}}
\`\`\`
Параметры: nodeId, color, weight?, align? ("INSIDE"|"OUTSIDE"|"CENTER")

**figma_set_opacity** — прозрачность (0–1)
\`\`\`json
{"tool":"figma_set_opacity","args":{"nodeId":"overlay","opacity":0.5}}
\`\`\`
Параметры: nodeId, opacity

**figma_set_shadow** — тень
\`\`\`json
{"tool":"figma_set_shadow","args":{"nodeId":"card1","color":"#000000","x":0,"y":2,"blur":12,"spread":0,"opacity":0.08}}
\`\`\`
Параметры: nodeId, color?, x?, y?, blur?, spread?, opacity?

**figma_set_gradient** — градиентная заливка
\`\`\`json
{"tool":"figma_set_gradient","args":{"nodeId":"hero","from":"#18A0FB","to":"#0D8DE3","angle":0}}
\`\`\`
Параметры: nodeId, from (hex), to (hex), angle? (0=сверху вниз, 90=слева направо)

---

### Типографика

**figma_set_text_style** — выравнивание, межстрочный, трекинг
\`\`\`json
{"tool":"figma_set_text_style","args":{"nodeId":"title","align":"CENTER","lineHeight":36,"letterSpacing":-1}}
\`\`\`
Параметры: nodeId, align? ("LEFT"|"CENTER"|"RIGHT"|"JUSTIFIED"), lineHeight? (px), letterSpacing? (%), decoration? ("NONE"|"UNDERLINE"|"STRIKETHROUGH")

**figma_set_font** — смена шрифта на существующем тексте
\`\`\`json
{"tool":"figma_set_font","args":{"nodeId":"title","family":"Inter","style":"SemiBold"}}
\`\`\`
Параметры: nodeId, family, style? ("Regular"|"Medium"|"SemiBold"|"Bold")

---

### Auto Layout

**figma_set_auto_layout** — включить Auto Layout на фрейме
\`\`\`json
{"tool":"figma_set_auto_layout","args":{"nodeId":"btn1","direction":"HORIZONTAL","gap":8,"paddingH":24,"paddingV":16,"align":"CENTER","counterAlign":"CENTER"}}
\`\`\`
Параметры: nodeId, direction ("HORIZONTAL"|"VERTICAL"), gap?, paddingH?, paddingV?, align? ("MIN"|"CENTER"|"MAX"|"SPACE_BETWEEN"), counterAlign? ("MIN"|"CENTER"|"MAX")

---

### Организация

**figma_group_nodes** — группировка нодов
\`\`\`json
{"tool":"figma_group_nodes","args":{"nodeIds":["icon1","label1"],"name":"Tab / Home","id":"tab_home"}}
\`\`\`
Параметры: nodeIds (массив id), name?, id?
`.trim();
