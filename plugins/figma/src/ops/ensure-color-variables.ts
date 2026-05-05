import type { OpHandler } from "./types";
import type { EnsureColorVariablesOp } from "../types";
import { ensureColorVariables } from "../helpers";

export const handler: OpHandler = {
    type: "ensure_color_variables",
    async execute(op, _nodeMap): Promise<number> {
        await ensureColorVariables(op as EnsureColorVariablesOp);
        return 1;
    },
};
