import type { FigmaOp } from "../types";
import type { OpHandler } from "./types";

import { handler as ensureColorVariables } from "./ensure-color-variables";
import { handler as ensureThemeVariables } from "./ensure-theme-variables";
import { handler as createFrame } from "./create-frame";
import { handler as createRect } from "./create-rect";
import { handler as createEllipse } from "./create-ellipse";
import { handler as createImage } from "./create-image";
import { handler as createText } from "./create-text";
import { handler as createLine } from "./create-line";
import { handler as moveNode } from "./move-node";
import { handler as resizeNode } from "./resize-node";
import { handler as deleteNode } from "./delete-node";
import { handler as cloneNode } from "./clone-node";
import { handler as renameNode } from "./rename-node";
import { handler as setCornerRadius } from "./set-corner-radius";
import { handler as setClipContent } from "./set-clip-content";
import { handler as setFill } from "./set-fill";
import { handler as setStroke } from "./set-stroke";
import { handler as setOpacity } from "./set-opacity";
import { handler as setShadow } from "./set-shadow";
import { handler as setGradient } from "./set-gradient";
import { handler as setTextStyle } from "./set-text-style";
import { handler as setFont } from "./set-font";
import { handler as setAutoLayout } from "./set-auto-layout";
import { handler as groupNodes } from "./group-nodes";
import { handler as clearCanvas } from "./clear-canvas";
import { handler as deleteNodesByName } from "./delete-nodes-by-name";
import { handler as clearFrameChildren } from "./clear-frame-children";

const handlers: OpHandler[] = [
    // Variables
    ensureColorVariables,
    ensureThemeVariables,
    // Primitives
    createFrame,
    createRect,
    createEllipse,
    createImage,
    createText,
    createLine,
    // Transform
    moveNode,
    resizeNode,
    deleteNode,
    cloneNode,
    renameNode,
    // Style
    setCornerRadius,
    setClipContent,
    setFill,
    setStroke,
    setOpacity,
    setShadow,
    setGradient,
    // Typography
    setTextStyle,
    setFont,
    // Layout
    setAutoLayout,
    // Organisation
    groupNodes,
    clearCanvas,
    clearFrameChildren,
    deleteNodesByName,
];

const handlerByType = new Map<string, OpHandler>();
for (const h of handlers) handlerByType.set(h.type, h);

export async function executeOps(ops: FigmaOp[], nodeMap: Map<string, string>): Promise<number>
{
    let count = 0;

    for (const op of ops)
    {
        try
        {
            const handler = handlerByType.get(op.type);
            if (handler)
            {
                count += await handler.execute(op, nodeMap);
            }
            else
            {
                console.error(`Unknown op type: "${op.type}"`);
            }
        }
        catch (err)
        {
            console.error(`Op "${op.type}" failed:`, err);
        }
    }

    return count;
}
