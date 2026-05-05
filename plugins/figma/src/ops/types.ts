import type { FigmaOp } from "../types";

/** Each handler processes exactly one operation type. Return 1 if the op was handled, 0 to skip. */
export interface OpHandler
{
    readonly type: string;
    execute(op: FigmaOp, nodeMap: Map<string, string>): Promise<number>;
}
