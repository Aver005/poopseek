import type { FigmaOp } from "../types";
import type { OpHandler } from "./types";
import { dlog, derr, describeOp, describeNode, setCurrentOpTag } from "../debug";

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
    ensureColorVariables,
    ensureThemeVariables,
    createFrame,
    createRect,
    createEllipse,
    createImage,
    createText,
    createLine,
    moveNode,
    resizeNode,
    deleteNode,
    cloneNode,
    renameNode,
    setCornerRadius,
    setClipContent,
    setFill,
    setStroke,
    setOpacity,
    setShadow,
    setGradient,
    setTextStyle,
    setFont,
    setAutoLayout,
    groupNodes,
    clearCanvas,
    clearFrameChildren,
    deleteNodesByName,
];

const handlerByType = new Map<string, OpHandler>();
for (const h of handlers) handlerByType.set(h.type, h);

async function dumpFailureContext(_tag: string, op: FigmaOp, nodeMap: Map<string, string>): Promise<void>
{
    // Frame parent context (the would-be parent of a create_* op, for example)
    const frameId = (op as Record<string, unknown>).frameId;
    if (typeof frameId === "string")
    {
        const fid = nodeMap.get(frameId);
        if (!fid)
        {
            derr("ctx", `parent: nodeMap has NO entry for frameId="${frameId}"`);
        }
        else
        {
            const p = await figma.getNodeByIdAsync(fid);
            derr("ctx", `parent: nodeMap["${frameId}"]="${fid}" → ${describeNode(p)}`);
            if (p && "children" in p)
            {
                const kids = (p as BaseNode & { children: ReadonlyArray<SceneNode> }).children;
                const summary = kids.slice(0, 12).map(c =>
                {
                    const lm = "layoutMode" in c ? (c as SceneNode & { layoutMode: string }).layoutMode : "n/a";
                    return `${c.type}#${c.id}/"${c.name}"/lm=${lm}`;
                }).join(", ");
                derr("ctx", `parent.children (${kids.length}): ${summary}${kids.length > 12 ? `, +${kids.length - 12} more` : ""}`);
            }
        }
    }

    // Self-node context (for set_* ops targeting an existing node)
    const nodeId = (op as Record<string, unknown>).nodeId;
    if (typeof nodeId === "string")
    {
        const fid = nodeMap.get(nodeId);
        if (!fid)
        {
            derr("ctx", `node: nodeMap has NO entry for nodeId="${nodeId}"`);
        }
        else
        {
            const n = await figma.getNodeByIdAsync(fid);
            derr("ctx", `node: nodeMap["${nodeId}"]="${fid}" → ${describeNode(n)}`);
        }
    }
}

export async function executeOps(ops: FigmaOp[], nodeMap: Map<string, string>): Promise<number>
{
    let count = 0;
    let failed = 0;
    const failedOps: { index: number; op: FigmaOp; error: string; parentCtx?: string }[] = [];

    const typeBreakdown = new Map<string, number>();
    for (const op of ops)
    {
        const t = String(op.type ?? "?");
        typeBreakdown.set(t, (typeBreakdown.get(t) ?? 0) + 1);
    }
    const breakdownStr = [...typeBreakdown.entries()].map(([t, n]) => `${t}=${n}`).join(", ");
    dlog("ops/batch", `▶ start: ${ops.length} ops [${breakdownStr}], nodeMap.size=${nodeMap.size}`);

    for (let i = 0; i < ops.length; i++)
    {
        const op = ops[i];
        const total = ops.length;
        const tag = `ops/${i + 1}/${total}`;
        setCurrentOpTag(tag);

        try
        {
            const handler = handlerByType.get(String(op.type ?? ""));
            if (!handler)
            {
                derr("registry", `❌ unknown op type "${op.type}"`, op);
                failed++;
                failedOps.push({ index: i, op, error: `unknown op type` });
                continue;
            }

            dlog("registry", `→ ${describeOp(op as unknown as Record<string, unknown>)}`);
            const delta = await handler.execute(op, nodeMap);
            count += delta;
        }
        catch (err)
        {
            const msg = err instanceof Error ? err.message : String(err);
            derr("registry", `❌ FAILED: ${describeOp(op as unknown as Record<string, unknown>)}`);
            derr("registry", `   reason: ${msg}`);
            await dumpFailureContext("registry", op, nodeMap);
            failed++;
            failedOps.push({ index: i, op, error: msg });
        }
    }
    setCurrentOpTag(null);

    if (failed > 0)
    {
        derr("ops/batch", `■ done: ${count} succeeded, ${failed} FAILED out of ${ops.length}`);
        derr("ops/batch", `failed ops summary:`);
        for (const f of failedOps)
            derr("ops/batch", `  [#${f.index}] ${describeOp(f.op as unknown as Record<string, unknown>)} → ${f.error}`);
    }
    else
    {
        dlog("ops/batch", `■ done: all ${ops.length} ops ok, nodeMap.size=${nodeMap.size}`);
    }

    return count;
}
