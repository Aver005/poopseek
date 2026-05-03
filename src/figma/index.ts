export { FigmaServerManager } from "./server";
export type { FigmaServerDeps } from "./server";
export type { FigmaOp, FigmaChatRequest, FigmaChatResponse } from "./api/contracts";
export type { FigmaSession } from "./application/session/session-types";
export { ScopeManager } from "./domain/scope/scope";
export type { AgentScope } from "./domain/scope/scope";
export { FigmaLogger } from "./logger";
export { parseJsx } from "./engine/jsx/jsx-parser";
export type { JsxNode, JsxPropValue, JsxSourceLocation } from "./engine/jsx/jsx-parser";
export { JsxParseError } from "./engine/jsx/jsx-parser";
export { compileJsx } from "./engine/jsx/jsx-compiler";
export { assertValidJsx, assertValidJsxFragment, formatJsxValidationErrors, validateJsxFragment, validateJsxTree } from "./engine/jsx/jsx-validator";
export { JsxBuffer } from "./engine/jsx/jsx-buffer";
export type { BufferNode } from "./engine/jsx/jsx-buffer";
export { VariableStore } from "./engine/theme/var-store";
export type { VarEntry } from "./engine/theme/var-store";
export { TokensStore } from "./domain/artifacts/stores/tokens-store";
export { PrimitivePlanStore } from "./domain/artifacts/stores/primitive-plan-store";
export { PrimitiveJsxStore } from "./domain/artifacts/stores/primitive-jsx-store";
export { CompositionMetaStore } from "./domain/artifacts/stores/composition-meta-store";
export { CompositionJsxStore } from "./domain/artifacts/stores/composition-jsx-store";
export { CompileArtifactStore } from "./domain/artifacts/stores/compile-artifact-store";
export { renderCompositionInvocationJsx, expandCompositionToJsx, assertCompositionUsesKnownSymbols } from "./engine/composition/materializer";
export type {
    FigmaTokensArtifact,
    FigmaPrimitivesPlanArtifact,
    FigmaPrimitivesJsxArtifact,
    FigmaCompositionMetaArtifact,
    FigmaCompositionJsxArtifact,
    FigmaCompileArtifact,
    FigmaPrimitiveDefinition,
    CompositionNode,
} from "./domain/artifacts/artifact-types";

