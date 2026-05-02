import type { ToolHandler, ToolExecutionResult } from "@/tools/types";
import { JsxBuffer } from "@/figma/jsx-buffer";
import { VariableStore } from "@/figma/var-store";
import { parseJsx, JsxParseError } from "@/figma/jsx-parser";
import { compileJsx } from "@/figma/jsx-compiler";
import { assertValidJsx, formatJsxValidationErrors, JsxValidationException } from "@/figma/jsx-validator";
import { setActiveTheme, createEnsureThemeVariablesOp } from "@/figma/theme-state";
import type { FigmaOp } from "@/figma/types";
import type { BufferNode } from "@/figma/jsx-buffer";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── figma_create ─────────────────────────────────────────────────────────────

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

// ─── figma_edit ───────────────────────────────────────────────────────────────

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

// ─── figma_info ───────────────────────────────────────────────────────────────

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

// ─── figma_delete ─────────────────────────────────────────────────────────────

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

// ─── figma_list ───────────────────────────────────────────────────────────────

function makeList(buffer: JsxBuffer): ToolHandler
{
    return async (args) =>
    {
        const parentId = str(args.parentId);
        const nodes = buffer.list(parentId);

        const items = nodes.map(n => ({
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

// ─── figma_find ───────────────────────────────────────────────────────────────

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
        const items = results.map(n => ({
            id: n.id,
            type: n.type,
            parentId: n.parentId,
            summary: nodeSummary(n),
        }));

        return ok(`Found ${items.length} node(s)`, items);
    };
}

// ─── figma_move ───────────────────────────────────────────────────────────────

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

// ─── figma_compile ────────────────────────────────────────────────────────────
// ВАЖНО: ops уходят напрямую в enqueueOps, НЕ в result.data
// Модель видит только строку output — никаких Figma-сущностей

function makeCompile(
    buffer: JsxBuffer,
    varStore: VariableStore,
    enqueueOps: (ops: FigmaOp[]) => void,
): ToolHandler
{
    return async (args) =>
    {
        const rawJsx = str(args.jsx)?.trim() ?? "";
        const jsxSrc = rawJsx || buffer.toJsx();

        if (!jsxSrc.trim())
        {
            return fail(
                "Buffer is empty and no jsx provided. " +
                "Build the tree first with figma_create, or pass jsx directly.",
            );
        }

        const themeTokens = varStore.extractThemeTokens();
        if (themeTokens.length > 0)
            setActiveTheme({ tokens: themeTokens });

        let ops: unknown[];
        try
        {
            const nodes = parseJsx(jsxSrc);
            assertValidJsx(nodes);
            ops = compileJsx(nodes);
        }
        catch (err)
        {
            if (err instanceof JsxParseError)
                return fail(`JSX parse error at ${err.loc.line}:${err.loc.column} — ${err.message}`);
            if (err instanceof JsxValidationException)
                return fail(formatJsxValidationErrors(err.errors));
            return fail(`Compile error: ${err instanceof Error ? err.message : String(err)}`);
        }

        if (ops.length === 0)
            return fail("No elements compiled — check JSX structure (tags must be PascalCase)");

        // Ops идут напрямую в плагин, модель их не видит
        enqueueOps(ops as FigmaOp[]);

        return ok(`Compiled and sent ${ops.length} elements to Figma`);
    };
}

// ─── figma_reset ──────────────────────────────────────────────────────────────

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

// ─── figma_var_set ────────────────────────────────────────────────────────────

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

// ─── figma_var_get ────────────────────────────────────────────────────────────

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

// ─── figma_var_remove ─────────────────────────────────────────────────────────

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

// ─── figma_var_list ───────────────────────────────────────────────────────────

function makeVarList(varStore: VariableStore): ToolHandler
{
    return async () =>
    {
        const items = varStore.list();
        return ok(`${items.length} variable(s)`, items);
    };
}

// ─── figma_tokens ─────────────────────────────────────────────────────────────

function makeTokens(varStore: VariableStore): ToolHandler
{
    return async (args) =>
    {
        if (!Array.isArray(args.tokens))
            return fail("tokens must be an array of {name, value} objects");

        type RawToken = { name: string; value: string | number; description?: string };
        const valid = (args.tokens as unknown[]).filter(
            (t): t is RawToken =>
                typeof t === "object" && t !== null &&
                "name" in t && typeof (t as Record<string, unknown>).name === "string" &&
                "value" in t,
        );

        if (valid.length === 0) return fail("No valid tokens (each needs name + value)");

        varStore.setTokens(valid.map(t => ({
            name: t.name,
            value: typeof t.value === "number" ? t.value : String(t.value),
            description: typeof (t as Record<string, unknown>).description === "string"
                ? String((t as Record<string, unknown>).description)
                : undefined,
        })));

        return ok(`Set ${valid.length} token(s)`);
    };
}

// ─── figma_define_theme (backward compat) ─────────────────────────────────────
// Ops уходят через enqueueOps, модель видит только строку

function makeDefineTheme(
    varStore: VariableStore,
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
                .map(t => ({
                    token: String(t.token ?? "").trim(),
                    hex: String(t.hex ?? "").trim(),
                    description: typeof t.description === "string" ? t.description.trim() : undefined,
                }))
                .filter(t => t.token.length > 0 && t.hex.length > 0);
        }
        else if (typeof args.palette === "object" && args.palette !== null)
        {
            tokens = Object.entries(args.palette as Record<string, unknown>)
                .filter(([, v]) => typeof v === "string" && (v as string).trim().length > 0)
                .map(([token, hex]) => ({ token, hex: String(hex).trim() }));
        }

        if (tokens.length === 0)
            return fail("figma_define_theme requires tokens[] or palette with at least one entry");

        varStore.setTokens(tokens.map(t => ({
            name: `color/${t.token}`,
            value: t.hex,
            description: t.description,
        })));

        setActiveTheme({
            name: typeof args.name === "string" ? args.name : "custom",
            tokens,
        });

        const op = createEnsureThemeVariablesOp();
        enqueueOps([op as unknown as FigmaOp]);

        return ok(`Theme "${op.themeName}" applied — ${op.tokens.length} variables ready`);
    };
}

// ─── figma_render (backward compat = alias for figma_compile) ─────────────────

function makeRender(
    buffer: JsxBuffer,
    varStore: VariableStore,
    enqueueOps: (ops: FigmaOp[]) => void,
): ToolHandler
{
    return makeCompile(buffer, varStore, enqueueOps);
}

// ─── Registry factory ─────────────────────────────────────────────────────────

export function createFigmaV2Registry(
    buffer: JsxBuffer,
    varStore: VariableStore,
    enqueueOps: (ops: FigmaOp[]) => void,
): Record<string, ToolHandler>
{
    return {
        // Buffer CRUD
        figma_create: makeCreate(buffer),
        figma_edit: makeEdit(buffer),
        figma_info: makeInfo(buffer),
        figma_delete: makeDelete(buffer),
        figma_list: makeList(buffer),
        figma_find: makeFind(buffer),
        figma_move: makeMove(buffer),
        // Variables
        figma_var_set: makeVarSet(varStore),
        figma_var_get: makeVarGet(varStore),
        figma_var_remove: makeVarRemove(varStore),
        figma_var_list: makeVarList(varStore),
        figma_tokens: makeTokens(varStore),
        // Compile / reset
        figma_compile: makeCompile(buffer, varStore, enqueueOps),
        figma_reset: makeReset(buffer, varStore),
        // Backward compat (ops go via enqueueOps, never returned to model)
        figma_define_theme: makeDefineTheme(varStore, enqueueOps),
        figma_render: makeRender(buffer, varStore, enqueueOps),
    };
}

// ─── Tool documentation ───────────────────────────────────────────────────────

export const FIGMA_V2_TOOLS_DOC = `
## Figma V2 — Инструменты буфера

### Принцип
Буфер — in-memory JSX-дерево. Figma-ноды создаются **только при** \`figma_compile\`.
Буфер живёт всю сессию. Созданные узлы не исчезают — их нужно редактировать через \`figma_edit\`, а не пересоздавать.

### Переменные / токены
**figma_tokens** \`{tokens:[{name,value}]}\` — пакетная установка цветовых токенов
**figma_var_set** \`{name,value}\` — одна переменная (\`name\`: \`color/brand\`, \`color/canvas\` и т.д.)
**figma_var_list** \`{}\` — список всех переменных

### CRUD буфера
**figma_create** \`{type,className?,parentId?,...props}\` → \`{id,type,props,parentId}\`
**figma_edit** \`{id,...props}\` — изменить пропсы (частично), \`parentId\` для перемещения
**figma_info** \`{id}\` — тип, пропсы, список дочерних id
**figma_delete** \`{id}\` — удалить узел и всех детей
**figma_list** \`{parentId?}\` — список узлов (все / дети)
**figma_find** \`{type?,className?,text?,parentId?}\` — поиск
**figma_move** \`{id,newParentId,index?}\` — переместить

### Компиляция
**figma_compile** \`{jsx?}\` — компилировать буфер (или jsx) → Figma. Без аргументов = весь буфер.
**figma_reset** \`{clearVars?}\` — очистить буфер

### Обратная совместимость
**figma_define_theme** \`{name,tokens:[{token,hex}]}\` — задать тему (ops уходят в Figma автоматически)
**figma_render** — алиас \`figma_compile\`
`.trim();
