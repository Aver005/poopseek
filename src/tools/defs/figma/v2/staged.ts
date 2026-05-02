import type { ToolHandler, ToolExecutionResult } from "@/tools/types";
import { parseJsx, JsxParseError } from "@/figma/jsx-parser";
import { compileJsx } from "@/figma/jsx-compiler";
import { assertValidJsx, assertValidJsxFragment, formatJsxValidationErrors, JsxValidationException } from "@/figma/jsx-validator";
import { setActiveTheme } from "@/figma/theme-state";
import type { FigmaOp } from "@/figma/types";
import { TokensStore } from "@/figma/tokens-store";
import { PrimitivePlanStore } from "@/figma/primitive-plan-store";
import { PrimitiveJsxStore } from "@/figma/primitive-jsx-store";
import { CompositionMetaStore } from "@/figma/composition-meta-store";
import { CompositionJsxStore } from "@/figma/composition-jsx-store";
import { CompileArtifactStore } from "@/figma/compile-artifact-store";
import { VariableStore } from "@/figma/var-store";
import { JsxBuffer } from "@/figma/jsx-buffer";
import {
    assertCompositionUsesKnownSymbols,
    expandCompositionToJsx,
    renderCompositionInvocationJsx,
} from "@/figma/materializer";
import type {
    ArtifactScalar,
    CompositionNode,
    FigmaPrimitiveDefinition,
    PrimitiveLevel,
    PrimitivePropSpec,
    ShadowToken,
    TypographyToken,
} from "@/figma/artifact-types";

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

function normalizeThemeName(value: unknown): string
{
    const resolved = str(value)?.trim();
    return resolved && resolved.length > 0 ? resolved : "custom";
}

function normalizeStringMap(value: unknown): Record<string, string>
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, entry]) => typeof entry === "string" && entry.trim().length > 0)
            .map(([key, entry]) => [key, String(entry).trim()]),
    );
}

function normalizeNumberMap(value: unknown): Record<string, number>
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
        Object.entries(value)
            .map(([key, entry]) => [key, Number(entry)] as const)
            .filter(([, entry]) => !Number.isNaN(entry)),
    );
}

function normalizeTypographyMap(value: unknown): Record<string, TypographyToken>
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

    return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) =>
        {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
            const record = entry as Record<string, unknown>;
            const fontFamily = str(record.fontFamily);
            const fontSize = num(record.fontSize);
            const lineHeight = num(record.lineHeight);
            const fontWeight = num(record.fontWeight);
            const letterSpacing = num(record.letterSpacing) ?? 0;

            if (!fontFamily || fontSize === undefined || lineHeight === undefined || fontWeight === undefined)
                return [];

            return [[key, { fontFamily, fontSize, lineHeight, fontWeight, letterSpacing } satisfies TypographyToken] as const];
        }),
    );
}

function normalizeShadowMap(value: unknown): Record<string, ShadowToken>
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};

    return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) =>
        {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
            const record = entry as Record<string, unknown>;
            const x = num(record.x);
            const y = num(record.y);
            const blur = num(record.blur);
            const spread = num(record.spread);
            const color = str(record.color);
            const opacity = num(record.opacity);

            if (
                x === undefined || y === undefined || blur === undefined || spread === undefined
                || color === undefined || opacity === undefined
            ) return [];

            return [[key, { x, y, blur, spread, color, opacity } satisfies ShadowToken] as const];
        }),
    );
}

function normalizeLegacyColorTokens(args: Record<string, unknown>): Record<string, string>
{
    if (!Array.isArray(args.tokens)) return {};

    const colors: Array<[string, string]> = [];
    for (const token of args.tokens)
    {
        if (typeof token !== "object" || token === null || Array.isArray(token)) continue;
        const record = token as Record<string, unknown>;
        const rawName = str(record.name);
        const value = str(record.value);
        if (!rawName || !value) continue;

        const name = rawName.startsWith("color/") ? rawName.slice(6) : rawName;
        colors.push([name, value]);
    }

    return Object.fromEntries(colors);
}

function normalizeCollections(args: Record<string, unknown>): {
    color: Record<string, string>;
    spacing: Record<string, number>;
    radius: Record<string, number>;
    typography: Record<string, TypographyToken>;
    shadow: Record<string, ShadowToken>;
}
{
    const collections = typeof args.collections === "object" && args.collections !== null && !Array.isArray(args.collections)
        ? args.collections as Record<string, unknown>
        : {};

    return {
        color: { ...normalizeLegacyColorTokens(args), ...normalizeStringMap(collections.color) },
        spacing: normalizeNumberMap(collections.spacing),
        radius: normalizeNumberMap(collections.radius),
        typography: normalizeTypographyMap(collections.typography),
        shadow: normalizeShadowMap(collections.shadow),
    };
}

function normalizeAliases(args: Record<string, unknown>): Record<string, string>
{
    return normalizeStringMap(args.aliases);
}

function writeColorsToVarStore(varStore: VariableStore, colors: Record<string, string>): void
{
    varStore.setTokens(
        Object.entries(colors).map(([name, value]) => ({
            name: name.startsWith("color/") ? name : `color/${name}`,
            value,
        })),
    );
}

function normalizePrimitiveProps(value: unknown): PrimitivePropSpec[]
{
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) =>
    {
        if (typeof entry === "string")
            return [{ name: entry.trim() } satisfies PrimitivePropSpec];

        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
        const record = entry as Record<string, unknown>;
        const name = str(record.name)?.trim();
        if (!name) return [];

        return [{
            name,
            required: record.required === true,
            description: str(record.description),
        } satisfies PrimitivePropSpec];
    });
}

function normalizePrimitiveEntries(value: unknown): FigmaPrimitiveDefinition[]
{
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) =>
    {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
        const record = entry as Record<string, unknown>;
        const name = str(record.name)?.trim();
        const level = str(record.level) as PrimitiveLevel | undefined;
        if (!name || !level || !["atom", "molecule", "section"].includes(level)) return [];

        const dependencies = Array.isArray(record.dependencies)
            ? record.dependencies.map((item) => str(item)?.trim()).filter((item): item is string => !!item)
            : [];

        return [{
            name,
            level,
            description: str(record.description),
            props: normalizePrimitiveProps(record.props),
            dependencies,
        } satisfies FigmaPrimitiveDefinition];
    });
}

function normalizeJsxEntryValue(value: unknown): Array<{ name: string; jsx: string }>
{
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) =>
    {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
        const record = entry as Record<string, unknown>;
        const name = str(record.name)?.trim();
        const jsx = str(record.jsx)?.trim();
        if (!name || !jsx) return [];
        return [{ name, jsx }];
    });
}

function isScalar(value: unknown): value is ArtifactScalar
{
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function normalizeScalarRecord(value: unknown): Record<string, ArtifactScalar>
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => isScalar(entry))) as Record<string, ArtifactScalar>;
}

function normalizeCompositionNode(value: unknown): CompositionNode | null
{
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const kind = str(record.kind);
    if (kind === "primitive")
    {
        const primitive = str(record.primitive)?.trim();
        if (!primitive) return null;
        return {
            kind: "primitive",
            primitive,
            props: normalizeScalarRecord(record.props),
        };
    }

    if (kind === "element")
    {
        const type = str(record.type)?.trim();
        if (!type) return null;
        const children = Array.isArray(record.children)
            ? record.children.map((child) => normalizeCompositionNode(child)).filter((child): child is CompositionNode => child !== null)
            : [];

        return {
            kind: "element",
            type,
            props: normalizeScalarRecord(record.props),
            text: str(record.text),
            children,
        };
    }

    return null;
}

function normalizeCompositionNodes(value: unknown): CompositionNode[]
{
    if (!Array.isArray(value)) return [];
    return value.map((entry) => normalizeCompositionNode(entry)).filter((entry): entry is CompositionNode => entry !== null);
}

function ensureArtifactExists<T>(artifact: T | undefined, message: string): T
{
    if (!artifact) throw new Error(message);
    return artifact;
}

function fenceJsx(jsx: string): string
{
    return `\`\`\`jsx\n${jsx}\n\`\`\``;
}

export interface StagedFigmaDeps
{
    buffer: JsxBuffer;
    varStore: VariableStore;
    tokensStore: TokensStore;
    primitivePlanStore: PrimitivePlanStore;
    primitiveJsxStore: PrimitiveJsxStore;
    compositionMetaStore: CompositionMetaStore;
    compositionJsxStore: CompositionJsxStore;
    compileArtifactStore: CompileArtifactStore;
    enqueueOps: (ops: FigmaOp[]) => void;
}

function makeTokens(varStore: VariableStore, tokensStore: TokensStore): ToolHandler
{
    return async (args) =>
    {
        const collections = normalizeCollections(args);
        if (Object.keys(collections.color).length === 0 && Object.keys(collections.spacing).length === 0)
            return fail("figma.tokens requires color tokens or structured collections");

        writeColorsToVarStore(varStore, collections.color);

        const artifact = tokensStore.create({
            themeName: normalizeThemeName(args.name),
            modes: Array.isArray(args.modes)
                ? args.modes.map((mode) => str(mode)?.trim()).filter((mode): mode is string => !!mode)
                : ["light"],
            collections,
            aliases: normalizeAliases(args),
        });

        return ok(`Saved tokens artifact "${artifact.id}" with ${Object.keys(collections.color).length} color token(s)`, artifact);
    };
}

function makePrimitivesPlan(
    tokensStore: TokensStore,
    primitivePlanStore: PrimitivePlanStore,
): ToolHandler
{
    return async (args) =>
    {
        const tokensArtifactId = str(args.tokensArtifactId);
        if (!tokensArtifactId) return fail("tokensArtifactId is required");
        if (!tokensStore.get(tokensArtifactId)) return fail(`Tokens artifact "${tokensArtifactId}" not found`);

        const entries = normalizePrimitiveEntries(args.entries);
        if (entries.length === 0) return fail("figma.primitives.plan requires entries[]");

        const names = new Set<string>();
        for (const entry of entries)
        {
            if (names.has(entry.name))
                return fail(`Duplicate primitive name "${entry.name}"`);
            names.add(entry.name);
        }

        const artifact = primitivePlanStore.create({
            tokensArtifactId,
            target: str(args.target),
            brief: str(args.brief),
            depth: str(args.depth),
            entries,
        });

        return ok(`Saved primitives plan "${artifact.id}" with ${artifact.entries.length} entr${artifact.entries.length === 1 ? "y" : "ies"}`, artifact);
    };
}

function makePrimitivesJsx(
    primitivePlanStore: PrimitivePlanStore,
    primitiveJsxStore: PrimitiveJsxStore,
): ToolHandler
{
    return async (args) =>
    {
        const primitivesArtifactId = str(args.primitivesArtifactId);
        if (!primitivesArtifactId) return fail("primitivesArtifactId is required");

        const planArtifact = primitivePlanStore.get(primitivesArtifactId);
        if (!planArtifact) return fail(`Primitives plan "${primitivesArtifactId}" not found`);

        const entries = normalizeJsxEntryValue(args.entries);
        if (entries.length === 0) return fail("figma.primitives.jsx requires entries[] with {name, jsx}");

        const knownNames = new Set(planArtifact.entries.map((entry) => entry.name));
        for (const entry of entries)
        {
            if (!knownNames.has(entry.name))
                return fail(`Primitive "${entry.name}" is not present in "${planArtifact.id}"`);

            try
            {
                const nodes = parseJsx(entry.jsx);
                assertValidJsxFragment(nodes);
            }
            catch (err)
            {
                if (err instanceof JsxParseError)
                    return fail(`Primitive "${entry.name}" JSX parse error at ${err.loc.line}:${err.loc.column} — ${err.message}`);
                if (err instanceof JsxValidationException)
                    return fail(`Primitive "${entry.name}" failed validation:\n${formatJsxValidationErrors(err.errors)}`);
                return fail(`Primitive "${entry.name}" validation failed: ${err instanceof Error ? err.message : String(err)}`);
            }
        }

        const artifact = primitiveJsxStore.create({
            primitivesArtifactId,
            entries: entries.map((entry, index) => ({
                name: entry.name,
                jsx: entry.jsx,
                jsxArtifactId: `jsx_${entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_v${index + 1}`,
            })),
        });

        const blocks = artifact.entries.map((entry) => `${entry.name}\n${fenceJsx(entry.jsx)}`).join("\n\n");
        return ok(`Saved primitives JSX "${artifact.id}" for ${artifact.entries.length} entr${artifact.entries.length === 1 ? "y" : "ies"}\n\n${blocks}`, artifact);
    };
}

function makeComposeMeta(
    tokensStore: TokensStore,
    primitivePlanStore: PrimitivePlanStore,
    primitiveJsxStore: PrimitiveJsxStore,
    compositionMetaStore: CompositionMetaStore,
): ToolHandler
{
    return async (args) =>
    {
        const tokensArtifactId = str(args.tokensArtifactId);
        const primitivesArtifactId = str(args.primitivesArtifactId);
        const primitivesJsxArtifactId = str(args.primitivesJsxArtifactId);
        const screenName = str(args.screenName);

        if (!tokensArtifactId || !primitivesArtifactId || !primitivesJsxArtifactId || !screenName)
            return fail("tokensArtifactId, primitivesArtifactId, primitivesJsxArtifactId and screenName are required");

        if (!tokensStore.get(tokensArtifactId)) return fail(`Tokens artifact "${tokensArtifactId}" not found`);
        if (!primitivePlanStore.get(primitivesArtifactId)) return fail(`Primitives plan "${primitivesArtifactId}" not found`);
        const primitivesJsxArtifact = primitiveJsxStore.get(primitivesJsxArtifactId);
        if (!primitivesJsxArtifact) return fail(`Primitives JSX artifact "${primitivesJsxArtifactId}" not found`);

        const compositionNodes = normalizeCompositionNodes(args.compositionNodes);
        if (compositionNodes.length === 0) return fail("figma.compose.meta requires compositionNodes[]");

        const jsxArtifactId = `compose_${screenName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_jsx`;
        const artifact = compositionMetaStore.create({
            screenName,
            tokensArtifactId,
            primitivesArtifactId,
            primitivesJsxArtifactId,
            compositionNodes,
            jsxArtifactId,
        });

        try
        {
            assertCompositionUsesKnownSymbols(artifact, primitivesJsxArtifact);
        }
        catch (err)
        {
            return fail(err instanceof Error ? err.message : String(err));
        }

        return ok(`Saved composition meta "${artifact.id}"`, artifact);
    };
}

function makeComposeJsx(
    compositionMetaStore: CompositionMetaStore,
    compositionJsxStore: CompositionJsxStore,
): ToolHandler
{
    return async (args) =>
    {
        const compositionArtifactId = str(args.compositionArtifactId);
        if (!compositionArtifactId) return fail("compositionArtifactId is required");

        const compositionArtifact = compositionMetaStore.get(compositionArtifactId);
        if (!compositionArtifact) return fail(`Composition artifact "${compositionArtifactId}" not found`);

        const jsx = renderCompositionInvocationJsx(compositionArtifact);
        const artifact = compositionJsxStore.create({
            compositionArtifactId,
            jsxArtifactId: compositionArtifact.jsxArtifactId,
            jsx,
        });

        return ok(`Saved composition JSX "${artifact.id}"\n\n${fenceJsx(jsx)}`, artifact);
    };
}

function makeCompile(
    buffer: JsxBuffer,
    varStore: VariableStore,
    compositionMetaStore: CompositionMetaStore,
    primitiveJsxStore: PrimitiveJsxStore,
    compositionJsxStore: CompositionJsxStore,
    compileArtifactStore: CompileArtifactStore,
    enqueueOps: (ops: FigmaOp[]) => void,
): ToolHandler
{
    return async (args) =>
    {
        const compositionArtifactId = str(args.compositionArtifactId);
        const rawJsx = str(args.jsx)?.trim() ?? "";

        let jsxSrc = rawJsx;
        if (!jsxSrc && compositionArtifactId)
        {
            try
            {
                const compositionArtifact = ensureArtifactExists(
                    compositionMetaStore.get(compositionArtifactId),
                    `Composition artifact "${compositionArtifactId}" not found`,
                );
                const primitivesJsxArtifact = ensureArtifactExists(
                    primitiveJsxStore.get(compositionArtifact.primitivesJsxArtifactId),
                    `Primitives JSX artifact "${compositionArtifact.primitivesJsxArtifactId}" not found`,
                );

                assertCompositionUsesKnownSymbols(compositionArtifact, primitivesJsxArtifact);
                jsxSrc = expandCompositionToJsx(compositionArtifact, primitivesJsxArtifact);

                if (!compositionJsxStore.getByCompositionId(compositionArtifact.id))
                {
                    compositionJsxStore.create({
                        compositionArtifactId: compositionArtifact.id,
                        jsxArtifactId: compositionArtifact.jsxArtifactId,
                        jsx: renderCompositionInvocationJsx(compositionArtifact),
                    });
                }
            }
            catch (err)
            {
                return fail(err instanceof Error ? err.message : String(err));
            }
        }

        if (!jsxSrc)
            jsxSrc = buffer.toJsx();

        if (!jsxSrc.trim())
        {
            return fail(
                "Buffer is empty and no jsx/compositionArtifactId provided. " +
                "Build the tree first with figma_create, pass jsx directly, or use figma.compose.meta + figma.compose.jsx.",
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

        const shouldDispatch = args.dispatch !== false;
        if (shouldDispatch)
            enqueueOps(ops as FigmaOp[]);

        const expandedJsxArtifactId = compositionArtifactId
            ? `compile_${compositionArtifactId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_expanded`
            : `compile_inline_${Date.now()}`;

        const artifact = compileArtifactStore.create({
            compositionArtifactId: compositionArtifactId ?? "inline",
            expandedJsxArtifactId,
            expandedJsx: jsxSrc,
            opCount: ops.length,
            dispatched: shouldDispatch,
        });

        return ok(
            `Compiled ${ops.length} element(s)${shouldDispatch ? " and sent them to Figma" : " without dispatch"}\n\n${fenceJsx(jsxSrc)}`,
            artifact,
        );
    };
}

function makeCompileJsxArtifact(
    compileArtifactStore: CompileArtifactStore,
    compositionMetaStore: CompositionMetaStore,
    primitiveJsxStore: PrimitiveJsxStore,
): ToolHandler
{
    return async (args) =>
    {
        const compileArtifactId = str(args.compileArtifactId);
        const compositionArtifactId = str(args.compositionArtifactId);

        if (compileArtifactId)
        {
            const artifact = compileArtifactStore.get(compileArtifactId);
            if (!artifact) return fail(`Compile artifact "${compileArtifactId}" not found`);
            return ok(`Expanded JSX for "${artifact.id}"\n\n${fenceJsx(artifact.expandedJsx)}`, artifact);
        }

        if (compositionArtifactId)
        {
            try
            {
                const compositionArtifact = ensureArtifactExists(
                    compositionMetaStore.get(compositionArtifactId),
                    `Composition artifact "${compositionArtifactId}" not found`,
                );
                const primitivesJsxArtifact = ensureArtifactExists(
                    primitiveJsxStore.get(compositionArtifact.primitivesJsxArtifactId),
                    `Primitives JSX artifact "${compositionArtifact.primitivesJsxArtifactId}" not found`,
                );
                const expandedJsx = expandCompositionToJsx(compositionArtifact, primitivesJsxArtifact);
                return ok(`Expanded JSX for "${compositionArtifact.id}"\n\n${fenceJsx(expandedJsx)}`, {
                    compositionArtifactId: compositionArtifact.id,
                    expandedJsx,
                });
            }
            catch (err)
            {
                return fail(err instanceof Error ? err.message : String(err));
            }
        }

        return fail("compileArtifactId or compositionArtifactId is required");
    };
}

function makeGetTool<T>(name: string, getter: (id: string) => T | undefined, getLatest?: () => T | undefined): ToolHandler
{
    return async (args) =>
    {
        const id = str(args.id);
        const artifact = id ? getter(id) : getLatest?.();
        if (!artifact) return fail(id ? `${name} "${id}" not found` : `No ${name} artifacts available`);
        return ok(id ? `Loaded ${name} "${id}"` : `Loaded latest ${name}`, artifact);
    };
}

function makeListTool<T>(name: string, list: () => T[]): ToolHandler
{
    return async () =>
    {
        const items = list();
        return ok(`${items.length} ${name} artifact(s)`, items);
    };
}

function makeRenderAlias(deps: StagedFigmaDeps): ToolHandler
{
    const composeMeta = makeComposeMeta(
        deps.tokensStore,
        deps.primitivePlanStore,
        deps.primitiveJsxStore,
        deps.compositionMetaStore,
    );
    const composeJsx = makeComposeJsx(deps.compositionMetaStore, deps.compositionJsxStore);
    const compile = makeCompile(
        deps.buffer,
        deps.varStore,
        deps.compositionMetaStore,
        deps.primitiveJsxStore,
        deps.compositionJsxStore,
        deps.compileArtifactStore,
        deps.enqueueOps,
    );

    return async (args) =>
    {
        const hasCompositionPayload = Array.isArray(args.compositionNodes);
        const compositionArtifactId = str(args.compositionArtifactId);

        if (hasCompositionPayload)
        {
            const metaResult = await composeMeta(args, {} as never);
            if (!metaResult.ok || typeof metaResult.data !== "object" || metaResult.data === null)
                return metaResult;

            const metaRecord = metaResult.data as Record<string, unknown>;
            const newCompositionId = str(metaRecord.id);
            if (!newCompositionId) return fail("figma_render failed to derive composition artifact id");

            const jsxResult = await composeJsx({ compositionArtifactId: newCompositionId }, {} as never);
            if (!jsxResult.ok) return jsxResult;

            return compile({ compositionArtifactId: newCompositionId, dispatch: args.dispatch }, {} as never);
        }

        if (compositionArtifactId)
            return compile(args, {} as never);

        return compile(args, {} as never);
    };
}

export function createStagedFigmaTools(deps: StagedFigmaDeps): Record<string, ToolHandler>
{
    return {
        "figma.tokens": makeTokens(deps.varStore, deps.tokensStore),
        "figma.tokens.get": makeGetTool("tokens artifact", (id) => deps.tokensStore.get(id), () => deps.tokensStore.latest()),
        "figma.tokens.list": makeListTool("tokens", () => deps.tokensStore.list()),
        "figma.primitives.plan": makePrimitivesPlan(deps.tokensStore, deps.primitivePlanStore),
        "figma.primitives.plan.get": makeGetTool("primitives plan", (id) => deps.primitivePlanStore.get(id)),
        "figma.primitives.plan.list": makeListTool("primitives plan", () => deps.primitivePlanStore.list()),
        "figma.primitives.jsx": makePrimitivesJsx(deps.primitivePlanStore, deps.primitiveJsxStore),
        "figma.primitives.jsx.get": makeGetTool("primitives jsx", (id) => deps.primitiveJsxStore.get(id)),
        "figma.primitives.jsx.list": makeListTool("primitives jsx", () => deps.primitiveJsxStore.list()),
        "figma.compose.meta": makeComposeMeta(deps.tokensStore, deps.primitivePlanStore, deps.primitiveJsxStore, deps.compositionMetaStore),
        "figma.compose.meta.get": makeGetTool("composition meta", (id) => deps.compositionMetaStore.get(id)),
        "figma.compose.meta.list": makeListTool("composition meta", () => deps.compositionMetaStore.list()),
        "figma.compose.jsx": makeComposeJsx(deps.compositionMetaStore, deps.compositionJsxStore),
        "figma.compose.jsx.get": makeGetTool("composition jsx", (id) => deps.compositionJsxStore.get(id)),
        "figma.compose.jsx.list": makeListTool("composition jsx", () => deps.compositionJsxStore.list()),
        "figma.compile": makeCompile(
            deps.buffer,
            deps.varStore,
            deps.compositionMetaStore,
            deps.primitiveJsxStore,
            deps.compositionJsxStore,
            deps.compileArtifactStore,
            deps.enqueueOps,
        ),
        "figma.compile.get": makeGetTool("compile artifact", (id) => deps.compileArtifactStore.get(id)),
        "figma.compile.list": makeListTool("compile", () => deps.compileArtifactStore.list()),
        "figma.compile.jsx": makeCompileJsxArtifact(deps.compileArtifactStore, deps.compositionMetaStore, deps.primitiveJsxStore),
        figma_render: makeRenderAlias(deps),
    };
}
