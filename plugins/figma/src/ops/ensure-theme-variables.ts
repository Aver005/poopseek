import type { OpHandler } from "./types";
import type { EnsureThemeVariablesOp } from "../types";
import { ensureThemeVariables } from "../helpers";

export const handler: OpHandler = {
    type: "ensure_theme_variables",
    async execute(op, _nodeMap): Promise<number> {
        await ensureThemeVariables(op as EnsureThemeVariablesOp);
        return 1;
    },
};
