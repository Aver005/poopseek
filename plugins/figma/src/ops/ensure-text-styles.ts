import type { OpHandler } from "./types";
import type { EnsureTextStylesOp } from "../types";
import { ensureTextStyles } from "../helpers";

export const handler: OpHandler = {
    type: "ensure_text_styles",
    async execute(op, _nodeMap): Promise<number> {
        await ensureTextStyles(op as EnsureTextStylesOp);
        return 1;
    },
};
