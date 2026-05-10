import type { OpHandler } from "./types";
import { componentRegistry } from "../cache";

export const handler: OpHandler = {
    type: "clear_canvas",
    async execute(_op, nodeMap): Promise<number>
    {
        nodeMap.clear();

        // Drop UI Kit components so a fresh design isn't haunted by stale
        // masters from a previous theme.
        componentRegistry.clear();
        await figma.loadAllPagesAsync();
        const uiKit = figma.root.children.find(
            (p) => p.type === "PAGE" && p.name === "🧩 UI Kit",
        );
        if (uiKit) uiKit.remove();

        return 1;
    },
};
