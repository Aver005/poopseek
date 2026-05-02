export type ArtifactScalar = string | number | boolean;

export interface ArtifactBase
{
    id: string;
    type: string;
    version: number;
    createdAt: number;
}

export interface TypographyToken
{
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    fontWeight: number;
    letterSpacing: number;
}

export interface ShadowToken
{
    x: number;
    y: number;
    blur: number;
    spread: number;
    color: string;
    opacity: number;
}

export interface FigmaTokensArtifact extends ArtifactBase
{
    type: "figma.tokens";
    themeName: string;
    modes: string[];
    collections: {
        color: Record<string, string>;
        spacing: Record<string, number>;
        radius: Record<string, number>;
        typography: Record<string, TypographyToken>;
        shadow: Record<string, ShadowToken>;
    };
    aliases: Record<string, string>;
}

export type PrimitiveLevel = "atom" | "molecule" | "section";

export interface PrimitivePropSpec
{
    name: string;
    required?: boolean;
    description?: string;
}

export interface FigmaPrimitiveDefinition
{
    name: string;
    level: PrimitiveLevel;
    description?: string;
    props: PrimitivePropSpec[];
    dependencies: string[];
}

export interface FigmaPrimitivesPlanArtifact extends ArtifactBase
{
    type: "figma.primitives.plan";
    tokensArtifactId: string;
    target?: string;
    brief?: string;
    depth?: string;
    entries: FigmaPrimitiveDefinition[];
}

export interface FigmaPrimitiveJsxEntry
{
    name: string;
    jsxArtifactId: string;
    jsx: string;
}

export interface FigmaPrimitivesJsxArtifact extends ArtifactBase
{
    type: "figma.primitives.jsx";
    primitivesArtifactId: string;
    entries: FigmaPrimitiveJsxEntry[];
}

export interface CompositionPrimitiveNode
{
    kind: "primitive";
    primitive: string;
    props?: Record<string, ArtifactScalar>;
}

export interface CompositionElementNode
{
    kind: "element";
    type: string;
    props?: Record<string, ArtifactScalar>;
    text?: string;
    children?: CompositionNode[];
}

export type CompositionNode = CompositionPrimitiveNode | CompositionElementNode;

export interface FigmaCompositionMetaArtifact extends ArtifactBase
{
    type: "figma.compose.meta";
    screenName: string;
    tokensArtifactId: string;
    primitivesArtifactId: string;
    primitivesJsxArtifactId: string;
    compositionNodes: CompositionNode[];
    jsxArtifactId: string;
}

export interface FigmaCompositionJsxArtifact extends ArtifactBase
{
    type: "figma.compose.jsx";
    compositionArtifactId: string;
    jsxArtifactId: string;
    jsx: string;
}

export interface FigmaCompileArtifact extends ArtifactBase
{
    type: "figma.compile";
    compositionArtifactId: string;
    expandedJsxArtifactId: string;
    expandedJsx: string;
    opCount: number;
    dispatched: boolean;
}

export interface FigmaJsxSnippetArtifact extends ArtifactBase
{
    type: "figma.jsx-snippet";
    ownerArtifactId: string;
    role: "primitive" | "composition" | "expanded";
    name: string;
    jsx: string;
}
