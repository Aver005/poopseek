export { FigmaServerManager } from "./server";
export type { FigmaServerDeps } from "./server";
export type { FigmaOp, FigmaChatRequest, FigmaChatResponse, FigmaSession } from "./types";
export { ScopeManager } from "./scope";
export type { AgentScope } from "./scope";
export { FigmaLogger } from "./logger";
export { parseJsx } from "./jsx-parser";
export type { JsxNode, JsxPropValue, JsxSourceLocation } from "./jsx-parser";
export { JsxParseError } from "./jsx-parser";
export { compileJsx } from "./jsx-compiler";
export { assertValidJsx, assertValidJsxFragment, formatJsxValidationErrors, validateJsxFragment, validateJsxTree } from "./jsx-validator";
export { JsxBuffer } from "./jsx-buffer";
export type { BufferNode } from "./jsx-buffer";
export { VariableStore } from "./var-store";
export type { VarEntry } from "./var-store";
export { TokensStore } from "./tokens-store";
export { PrimitivePlanStore } from "./primitive-plan-store";
export { PrimitiveJsxStore } from "./primitive-jsx-store";
export { CompositionMetaStore } from "./composition-meta-store";
export { CompositionJsxStore } from "./composition-jsx-store";
export { CompileArtifactStore } from "./compile-artifact-store";
export { renderCompositionInvocationJsx, expandCompositionToJsx, assertCompositionUsesKnownSymbols } from "./materializer";
export type {
    FigmaTokensArtifact,
    FigmaPrimitivesPlanArtifact,
    FigmaPrimitivesJsxArtifact,
    FigmaCompositionMetaArtifact,
    FigmaCompositionJsxArtifact,
    FigmaCompileArtifact,
    FigmaPrimitiveDefinition,
    CompositionNode,
} from "./artifact-types";
