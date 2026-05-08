import type { OpHandler } from "./types";
import type { EnsureTokenVariablesOp } from "../types";
import { ensureTokenVariables } from "../helpers";

export const handler: OpHandler = {
    type: "ensure_token_variables",
    async execute(op, _nodeMap): Promise<number> {
        await ensureTokenVariables(op as EnsureTokenVariablesOp);
        return 1;
    },
};
