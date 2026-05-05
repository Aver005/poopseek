import type { OpHandler } from "./types";

export const handler: OpHandler = {
    type: "clear_canvas",
    async execute(_op, nodeMap): Promise<number> {
        nodeMap.clear();
        return 1;
    },
};
