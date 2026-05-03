import type { FigmaOp } from "@/figma/api/contracts";
import type { ComposerOutput, DesignerOutput, PlannerOutput } from "@/figma/application/sub-agents/figma-sub-agents";
import type { FigmaSession } from "@/figma/application/session/session-types";
import { expandCompositionToJsx, renderCompositionInvocationJsx, assertCompositionUsesKnownSymbols } from "@/figma/engine/composition/materializer";
import { compileJsx } from "@/figma/engine/jsx/jsx-compiler";
import { parseJsx, JsxParseError } from "@/figma/engine/jsx/jsx-parser";
import { assertValidJsx, formatJsxValidationErrors, JsxValidationException } from "@/figma/engine/jsx/jsx-validator";
import { createEnsureThemeVariablesOp, setActiveTheme } from "@/figma/engine/theme/theme-state";

export function saveDesignerOutput(session: FigmaSession, design: DesignerOutput)
{
    session.varStore.setTokens(
        Object.entries(design.colors).map(([name, value]) => ({
            name: `color/${name}`,
            value,
        })),
    );

    setActiveTheme({
        name: design.themeName,
        tokens: Object.entries(design.colors).map(([token, hex]) => ({ token, hex })),
    });

    session.dispatchOps([createEnsureThemeVariablesOp() as unknown as FigmaOp]);

    return session.tokensStore.create({
        themeName: design.themeName,
        modes: ["light"],
        collections: {
            color: design.colors,
            spacing: design.spacing,
            size: design.sizes,
            radius: design.radius,
            typography: design.typography,
            shadow: design.shadow,
        },
        aliases: {},
    });
}

export function savePlannerOutput(
    session: FigmaSession,
    tokensArtifactId: string,
    planner: PlannerOutput,
    enhancedPrompt: string,
)
{
    return session.primitivePlanStore.create({
        tokensArtifactId,
        target: planner.screenName,
        brief: enhancedPrompt,
        depth: "screen",
        entries: planner.primitives,
    });
}

export function savePrimitiveJsx(
    session: FigmaSession,
    primitivesArtifactId: string,
    primitiveName: string,
    jsx: string,
)
{
    return session.primitiveJsxStore.upsert({
        primitivesArtifactId,
        entries: [{
            name: primitiveName,
            jsx,
            jsxArtifactId: `jsx_${primitiveName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
        }],
    });
}

export function saveComposerOutput(
    session: FigmaSession,
    tokensArtifactId: string,
    primitivesArtifactId: string,
    primitivesJsxArtifactId: string,
    composition: ComposerOutput,
)
{
    const artifact = session.compositionMetaStore.create({
        screenName: composition.screenName,
        tokensArtifactId,
        primitivesArtifactId,
        primitivesJsxArtifactId,
        compositionNodes: composition.compositionNodes,
        jsxArtifactId: `compose_${composition.screenName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_jsx`,
    });

    const primitivesJsxArtifact = session.primitiveJsxStore.get(primitivesJsxArtifactId);
    if (!primitivesJsxArtifact)
        throw new Error(`Primitives JSX artifact "${primitivesJsxArtifactId}" not found`);

    assertCompositionUsesKnownSymbols(artifact, primitivesJsxArtifact);

    const invocationJsx = renderCompositionInvocationJsx(artifact);
    session.compositionJsxStore.create({
        compositionArtifactId: artifact.id,
        jsxArtifactId: artifact.jsxArtifactId,
        jsx: invocationJsx,
    });

    return artifact;
}

export function compileComposition(
    session: FigmaSession,
    compositionArtifactId: string,
)
{
    const compositionArtifact = session.compositionMetaStore.get(compositionArtifactId);
    if (!compositionArtifact)
        throw new Error(`Composition artifact "${compositionArtifactId}" not found`);

    const primitivesJsxArtifact = session.primitiveJsxStore.get(compositionArtifact.primitivesJsxArtifactId);
    if (!primitivesJsxArtifact)
        throw new Error(`Primitives JSX artifact "${compositionArtifact.primitivesJsxArtifactId}" not found`);

    assertCompositionUsesKnownSymbols(compositionArtifact, primitivesJsxArtifact);

    const themeTokens = session.varStore.extractThemeTokens();
    if (themeTokens.length > 0)
        setActiveTheme({ name: session.tokensStore.latest()?.themeName ?? "custom", tokens: themeTokens });

    const expandedJsx = expandCompositionToJsx(compositionArtifact, primitivesJsxArtifact);

    let ops: FigmaOp[];
    try
    {
        const nodes = parseJsx(expandedJsx);
        assertValidJsx(nodes);
        ops = compileJsx(nodes) as FigmaOp[];
    }
    catch (error)
    {
        if (error instanceof JsxParseError)
            throw new Error(`JSX parse error @ ${error.loc.line}:${error.loc.column}: ${error.message}`);
        if (error instanceof JsxValidationException)
            throw new Error(formatJsxValidationErrors(error.errors));
        throw error instanceof Error ? error : new Error(String(error));
    }

    if (ops.length === 0)
        throw new Error("Compile produced 0 operations");

    session.dispatchOps(ops);

    return session.compileArtifactStore.create({
        compositionArtifactId,
        expandedJsxArtifactId: `compile_${compositionArtifactId.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_expanded`,
        expandedJsx,
        opCount: ops.length,
        dispatched: true,
    });
}
