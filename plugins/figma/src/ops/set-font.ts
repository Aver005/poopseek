import type { OpHandler } from "./types";
import type { FigmaOp } from "../types";
import { resolveNode } from "../helpers";

export const handler: OpHandler = {
    type: "set_font",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && node.type === "TEXT" && typeof op.family === "string") {
            const style = typeof op.style === "string" ? op.style : "Regular";
            await figma.loadFontAsync({ family: op.family, style });
            (node as TextNode).fontName = { family: op.family, style };
        }
        return 1;
    },
};
