import type { OpHandler } from "./types";
import { resolveNode, applyCornerRadii, bindNumberVariable } from "../helpers";

export const handler: OpHandler = {
    type: "set_corner_radius",
    async execute(op, nodeMap): Promise<number> {
        const node = resolveNode(op.nodeId, nodeMap);
        if (node && "cornerRadius" in node) {
            (node as SceneNode & { cornerRadius: number }).cornerRadius = Number(op.cornerRadius ?? 0);
            await bindNumberVariable(node as SceneNode, "topLeftRadius",     typeof op.cornerRadiusVariableName === "string" ? op.cornerRadiusVariableName : undefined, "set_corner_radius");
            await bindNumberVariable(node as SceneNode, "topRightRadius",    typeof op.cornerRadiusVariableName === "string" ? op.cornerRadiusVariableName : undefined, "set_corner_radius");
            await bindNumberVariable(node as SceneNode, "bottomLeftRadius",  typeof op.cornerRadiusVariableName === "string" ? op.cornerRadiusVariableName : undefined, "set_corner_radius");
            await bindNumberVariable(node as SceneNode, "bottomRightRadius", typeof op.cornerRadiusVariableName === "string" ? op.cornerRadiusVariableName : undefined, "set_corner_radius");
            applyCornerRadii(node as SceneNode, op);
        }
        return 1;
    },
};
