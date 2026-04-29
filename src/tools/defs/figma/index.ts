import type { ToolHandler } from "@/tools/types";
import { name as createFrameName, handler as createFrameHandler } from "./create-frame";
import { name as createTextName, handler as createTextHandler } from "./create-text";
import { name as createRectName, handler as createRectHandler } from "./create-rect";
import { name as createEllipseName, handler as createEllipseHandler } from "./create-ellipse";
import { name as setFillName, handler as setFillHandler } from "./set-fill";

export const figmaToolsRegistry: Record<string, ToolHandler> = {
    [createFrameName]: createFrameHandler,
    [createTextName]: createTextHandler,
    [createRectName]: createRectHandler,
    [createEllipseName]: createEllipseHandler,
    [setFillName]: setFillHandler,
};

export const FIGMA_TOOLS_DOC = `
## Инструменты Figma

Используй эти инструменты для создания элементов на Figma-канвасе.
Всегда назначай осмысленный \`id\` элементам, на которые будешь ссылаться.

### figma_create_frame
Создаёт фрейм (артборд).
\`\`\`json
{"tool":"figma_create_frame","args":{"id":"screen1","name":"Онбординг 1","width":390,"height":844,"fill":"#FFFFFF"}}
\`\`\`
Параметры: id (string), name, width (px), height (px), x?, y?, fill? (hex)

### figma_create_rect
Создаёт прямоугольник внутри фрейма или на канвасе.
\`\`\`json
{"tool":"figma_create_rect","args":{"id":"bg1","frameId":"screen1","x":0,"y":0,"width":390,"height":200,"fill":"#18A0FB","cornerRadius":0}}
\`\`\`
Параметры: width, height, id?, frameId? (ссылка на фрейм), x?, y?, fill? (hex), cornerRadius?, name?

### figma_create_ellipse
Создаёт эллипс/круг.
\`\`\`json
{"tool":"figma_create_ellipse","args":{"id":"avatar","frameId":"screen1","x":155,"y":60,"width":80,"height":80,"fill":"#E8F4FD"}}
\`\`\`
Параметры: width, height, id?, frameId?, x?, y?, fill? (hex), name?

### figma_create_text
Создаёт текстовый элемент.
\`\`\`json
{"tool":"figma_create_text","args":{"frameId":"screen1","content":"Добро пожаловать!","x":32,"y":200,"fontSize":28,"fontWeight":"Bold","color":"#1A1A1A"}}
\`\`\`
Параметры: content (string), id?, frameId?, x?, y?, fontSize?, fontWeight? ("Regular"|"Bold"), color? (hex)

### figma_set_fill
Меняет цвет заливки существующего элемента.
\`\`\`json
{"tool":"figma_set_fill","args":{"nodeId":"bg1","color":"#FF6B6B"}}
\`\`\`
Параметры: nodeId (ссылка на id), color (hex)
`.trim();
