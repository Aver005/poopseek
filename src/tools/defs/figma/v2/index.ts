import type { ToolHandler, ToolExecutionResult } from "@/tools/types";
import { JsxBuffer } from "@/figma/jsx-buffer";
import { VariableStore } from "@/figma/var-store";
import { setActiveTheme, createEnsureThemeVariablesOp } from "@/figma/theme-state";
import type { FigmaOp } from "@/figma/types";
import type { BufferNode } from "@/figma/jsx-buffer";
import { TokensStore } from "@/figma/tokens-store";
import { PrimitivePlanStore } from "@/figma/primitive-plan-store";
import { PrimitiveJsxStore } from "@/figma/primitive-jsx-store";
import { CompositionMetaStore } from "@/figma/composition-meta-store";
import { CompositionJsxStore } from "@/figma/composition-jsx-store";
import { CompileArtifactStore } from "@/figma/compile-artifact-store";
import { createCompileTool, createStagedFigmaTools } from "./staged";

function ok(output: string, data?: unknown): ToolExecutionResult
{
    return data !== undefined ? { ok: true, output, data } : { ok: true, output };
}

function fail(output: string): ToolExecutionResult
{
    return { ok: false, output };
}

function str(v: unknown): string | undefined
{
    return v === undefined || v === null ? undefined : String(v);
}

function num(v: unknown): number | undefined
{
    const n = Number(v);
    return v !== undefined && !Number.isNaN(n) ? n : undefined;
}

function nodeSummary(n: BufferNode): string
{
    const label = n.props.name ?? n.props.label ?? n.props.text ?? n.props.content ?? "";
    const cls = n.props.className
        ? ` [${String(n.props.className).split(" ").slice(0, 3).join(" ")}...]`
        : "";
    return label ? `${n.type}: "${label}"${cls}` : `${n.type}${cls}`;
}

function makeCreate(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const type = str(args.type);
        if (!type) return fail("type is required (e.g. Frame, Text, Button)");

        const { type: _, parentId, ...rest } = args;
        const props: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest))
            if (v !== undefined && v !== null) props[k] = v;

        try
        {
            const node = buffer.create(type, props, str(parentId));
            return ok(
                `Created ${node.type} id="${node.id}"${node.parentId ? ` inside "${node.parentId}"` : ""}`,
                { id: node.id, type: node.type, props: node.props, parentId: node.parentId },
            );
        }
        catch (err)
        {
            return fail(err instanceof Error ? err.message : String(err));
        }
    };
}

function makeEdit(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const id = str(args.id);
        if (!id) return fail("id is required");

        const { id: _, ...updates } = args;
        try
        {
            const node = buffer.edit(id, updates);
            return ok(
                `Updated "${node.id}"`,
                { id: node.id, type: node.type, props: node.props, parentId: node.parentId },
            );
        }
        catch (err)
        {
            return fail(err instanceof Error ? err.message : String(err));
        }
    };
}

function makeInfo(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const id = str(args.id);
        if (!id) return fail("id is required");

        const node = buffer.get(id);
        if (!node) return fail(`Node "${id}" not found`);

        return ok(`Node "${id}"`, {
            id: node.id,
            type: node.type,
            props: node.props,
            parentId: node.parentId,
            children: node.children,
        });
    };
}

function makeDelete(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const id = str(args.id);
        if (!id) return fail("id is required");

        try
        {
            buffer.delete(id);
            return ok(`Deleted "${id}" and all its children`);
        }
        catch (err)
        {
            return fail(err instanceof Error ? err.message : String(err));
        }
    };
}

function makeList(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const parentId = str(args.parentId);
        const nodes = buffer.list(parentId);

        const items = nodes.map((n) => ({
            id: n.id,
            type: n.type,
            parentId: n.parentId,
            childCount: n.children.length,
            summary: nodeSummary(n),
        }));

        return ok(
            `${items.length} node(s)${parentId ? ` under "${parentId}"` : " (buffer)"}`,
            items,
        );
    };
}

function makeFind(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const filter: Parameters<JsxBuffer["find"]>[0] = {};
        if (args.type !== undefined) filter.type = str(args.type);
        if (args.className !== undefined) filter.className = str(args.className);
        if (args.text !== undefined) filter.text = str(args.text);
        if ("parentId" in args)
            filter.parentId = args.parentId === null ? null : str(args.parentId);

        const results = buffer.find(filter);
        const items = results.map((n) => ({
            id: n.id,
            type: n.type,
            parentId: n.parentId,
            summary: nodeSummary(n),
        }));

        return ok(`Found ${items.length} node(s)`, items);
    };
}

function makeMove(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const id = str(args.id);
        const newParentId = str(args.newParentId);
        if (!id) return fail("id is required");
        if (!newParentId) return fail("newParentId is required");

        try
        {
            const node = buffer.move(id, newParentId, num(args.index));
            return ok(
                `Moved "${node.id}" to "${newParentId}"` +
                (args.index !== undefined ? ` at index ${args.index}` : ""),
            );
        }
        catch (err)
        {
            return fail(err instanceof Error ? err.message : String(err));
        }
    };
}

function makeReset(buffer: JsxBuffer, varStore: VariableStore): ToolHandler
{
    return async (args) =>
    {
        const clearVars = args.clearVars === true;
        const nodeCount = buffer.size;
        buffer.reset();
        if (clearVars) varStore.clear();
        return ok(
            `Buffer cleared (${nodeCount} nodes removed)` +
            (clearVars ? ", variables cleared" : ""),
        );
    };
}

function makeVarSet(varStore: VariableStore): ToolHandler
{
    return async (args) =>
    {
        const name = str(args.name);
        if (!name) return fail("name is required");
        if (args.value === undefined || args.value === null) return fail("value is required");

        const finalValue = typeof args.value === "number" ? args.value : String(args.value);
        varStore.set(name, finalValue, str(args.description));
        return ok(`"${name}" = ${finalValue}`);
    };
}

function makeVarGet(varStore: VariableStore): ToolHandler
{
    return async (args) =>
    {
        const name = str(args.name);
        if (!name) return fail("name is required");

        const entry = varStore.get(name);
        if (!entry) return fail(`Variable "${name}" not found`);
        return ok(`"${name}" = ${entry.value}`, entry);
    };
}

function makeVarRemove(varStore: VariableStore): ToolHandler
{
    return async (args) =>
    {
        const name = str(args.name);
        if (!name) return fail("name is required");

        return varStore.remove(name)
            ? ok(`Removed "${name}"`)
            : fail(`Variable "${name}" not found`);
    };
}

function makeVarList(varStore: VariableStore): ToolHandler
{
    return async () =>
    {
        const items = varStore.list();
        return ok(`${items.length} variable(s)`, items);
    };
}

function makeDefineTheme(
    varStore: VariableStore,
    tokensStore: TokensStore,
    enqueueOps: (ops: FigmaOp[]) => void,
): ToolHandler
{
    return async (args) =>
    {
        type TokenInput = { token?: unknown; hex?: unknown; description?: unknown };

        let tokens: Array<{ token: string; hex: string; description?: string }> = [];

        if (Array.isArray(args.tokens))
        {
            tokens = (args.tokens as unknown[])
                .filter((t): t is TokenInput => typeof t === "object" && t !== null)
                .map((t) => ({
                    token: String(t.token ?? "").trim(),
                    hex: String(t.hex ?? "").trim(),
                    description: typeof t.description === "string" ? t.description.trim() : undefined,
                }))
                .filter((t) => t.token.length > 0 && t.hex.length > 0);
        }
        else if (typeof args.palette === "object" && args.palette !== null)
        {
            tokens = Object.entries(args.palette as Record<string, unknown>)
                .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
                .map(([token, hex]) => ({ token, hex: String(hex).trim() }));
        }

        if (tokens.length === 0)
            return fail("figma_define_theme requires tokens[] or palette with at least one entry");

        varStore.setTokens(tokens.map((t) => ({
            name: `color/${t.token}`,
            value: t.hex,
            description: t.description,
        })));

        tokensStore.create({
            themeName: typeof args.name === "string" && args.name.trim().length > 0 ? args.name : "custom",
            modes: ["light"],
            collections: {
                color: Object.fromEntries(tokens.map((token) => [token.token, token.hex])),
                spacing: {},
                radius: {},
                typography: {},
                shadow: {},
            },
            aliases: {},
        });

        setActiveTheme({
            name: typeof args.name === "string" ? args.name : "custom",
            tokens,
        });

        const op = createEnsureThemeVariablesOp();
        enqueueOps([op as unknown as FigmaOp]);

        return ok(`Theme "${op.themeName}" applied — ${op.tokens.length} variables ready`);
    };
}

export function createFigmaV2Registry(
    buffer: JsxBuffer,
    varStore: VariableStore,
    tokensStore: TokensStore,
    primitivePlanStore: PrimitivePlanStore,
    primitiveJsxStore: PrimitiveJsxStore,
    compositionMetaStore: CompositionMetaStore,
    compositionJsxStore: CompositionJsxStore,
    compileArtifactStore: CompileArtifactStore,
    enqueueOps: (ops: FigmaOp[]) => void,
): Record<string, ToolHandler>
{
    const stagedTools = createStagedFigmaTools({
        buffer,
        varStore,
        tokensStore,
        primitivePlanStore,
        primitiveJsxStore,
        compositionMetaStore,
        compositionJsxStore,
        compileArtifactStore,
        enqueueOps,
    });
    const legacyCompile = createCompileTool({
        buffer,
        varStore,
        compositionMetaStore,
        primitiveJsxStore,
        compositionJsxStore,
        compileArtifactStore,
        enqueueOps,
    }, { allowRawJsx: true });

    return {
        figma_create: makeCreate(buffer),
        figma_edit: makeEdit(buffer),
        figma_info: makeInfo(buffer),
        figma_delete: makeDelete(buffer),
        figma_list: makeList(buffer),
        figma_find: makeFind(buffer),
        figma_move: makeMove(buffer),
        figma_var_set: makeVarSet(varStore),
        figma_var_get: makeVarGet(varStore),
        figma_var_remove: makeVarRemove(varStore),
        figma_var_list: makeVarList(varStore),
        figma_tokens: stagedTools["figma.tokens"]!,
        figma_compile: legacyCompile,
        figma_reset: makeReset(buffer, varStore),
        figma_define_theme: makeDefineTheme(varStore, tokensStore, enqueueOps),
        ...stagedTools,
    };
}

export const FIGMA_V2_STAGED_TOOLS_DOC = `
## Figma V2 — staged tools only

### Canonical flow
\`figma.tokens\` -> \`figma.primitives.plan\` -> \`figma.primitives.jsx\` -> \`figma.compose.meta\` -> \`figma.compose.jsx\` -> \`figma.compile\`

### Staged tools
**figma.tokens** \`{name?,modes?,collections,aliases?}\`
**figma.tokens.get** \`{id?}\`
**figma.tokens.list** \`{}\`
**figma.primitives.plan** \`{tokensArtifactId,entries:[{name,level,description?,props?,dependencies?}],target?,brief?,depth?}\`
**figma.primitives.plan.get** \`{id}\`
**figma.primitives.plan.list** \`{}\`
**figma.primitives.jsx** \`{primitivesArtifactId,names?}\` + matching fenced \`jsx\` blocks after the tool JSON
**figma.primitives.jsx.get** \`{id}\`
**figma.primitives.jsx.list** \`{}\`
**figma.compose.meta** \`{tokensArtifactId,primitivesArtifactId,primitivesJsxArtifactId,screenName,compositionNodes}\`
**figma.compose.meta.get** \`{id}\`
**figma.compose.meta.list** \`{}\`
**figma.compose.jsx** \`{compositionArtifactId}\`
**figma.compose.jsx.get** \`{id}\`
**figma.compose.jsx.list** \`{}\`
**figma.compile** \`{compositionArtifactId,dispatch?}\`
**figma.compile.get** \`{id}\`
**figma.compile.list** \`{}\`
**figma.compile.jsx** \`{compileArtifactId?|compositionArtifactId?}\`
`.trim();

export const FIGMA_V2_TOOLS_DOC = `
${FIGMA_V2_STAGED_TOOLS_DOC}

### Legacy tools
**figma_tokens** \`{tokens:[{name,value}]}\`
**figma_var_set** \`{name,value}\`
**figma_var_list** \`{}\`
**figma_create** \`{type,className?,parentId?,...props}\`
**figma_edit** \`{id,...props}\`
**figma_info** \`{id}\`
**figma_delete** \`{id}\`
**figma_list** \`{parentId?}\`
**figma_find** \`{type?,className?,text?,parentId?}\`
**figma_move** \`{id,newParentId,index?}\`
**figma_compile** \`{jsx?}\`
**figma_reset** \`{clearVars?}\`
**figma_define_theme** \`{name,tokens:[{token,hex}]}\`
**figma_render** — staged alias/dispatcher with legacy fallback
`.trim();
