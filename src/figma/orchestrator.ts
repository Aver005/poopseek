import type { JsxBuffer } from "@/figma/jsx-buffer";
import { renderCompositionInvocationJsx } from "@/figma/materializer";
import type { PreparedDesignBrief } from "@/figma/preprocess";
import type { FigmaPluginSnapshot } from "@/figma/snapshot-types";
import type {
    FigmaCompileArtifact,
    FigmaCompositionJsxArtifact,
    FigmaCompositionMetaArtifact,
    FigmaPrimitivesJsxArtifact,
    FigmaPrimitivesPlanArtifact,
    FigmaTokensArtifact,
} from "@/figma/artifact-types";

export type FigmaTaskMode = "initial" | "revision";
export type FigmaEditIntent = "edit-existing" | "fork-variant" | "new-screen";
export type FigmaStage = "idle" | "tokens" | "primitives" | "compose" | "repair" | "revision";
export type FigmaPlatform = "mobile" | "tablet" | "desktop";
export type ContentWidthPolicy = "full-bleed" | "inset" | "centered" | "split";

export interface LayoutConstraints
{
    platform: FigmaPlatform;
    viewportWidth: number;
    viewportHeight: number;
    contentWidthPolicy: ContentWidthPolicy;
    maxContentWidth: number;
    horizontalPadding: number;
}

export interface FigmaDerivedSnapshot
{
    source: "plugin" | "artifacts" | "buffer" | "empty";
    summary: string;
    invocationJsx?: string;
    expandedJsx?: string;
    activeCompositionArtifactId?: string;
    activeCompileArtifactId?: string;
    activeRootNodeId?: string;
}

export interface FigmaOrchestrationState
{
    taskMode: FigmaTaskMode;
    editIntent: FigmaEditIntent;
    currentStage: FigmaStage;
    hasPresentedResult: boolean;
    revisionCount: number;
    lastUserPrompt: string;
    layout: LayoutConstraints;
    currentBrief?: PreparedDesignBrief;
    pluginSnapshot?: FigmaPluginSnapshot;
    activeRootNodeId?: string;
    activeCompositionArtifactId?: string;
    activeCompileArtifactId?: string;
}

export interface FigmaOrchestratorStores
{
    buffer: JsxBuffer;
    tokens: FigmaTokensArtifact[];
    primitivePlans: FigmaPrimitivesPlanArtifact[];
    primitiveJsx: FigmaPrimitivesJsxArtifact[];
    compositionMeta: FigmaCompositionMetaArtifact[];
    compositionJsx: FigmaCompositionJsxArtifact[];
    compileArtifacts: FigmaCompileArtifact[];
}

export interface StageConfig
{
    stage: FigmaStage;
    allowedTools: string[];
    requiredTools: string[];
}

function lastOf<T>(items: T[]): T | undefined
{
    return items.length > 0 ? items[items.length - 1] : undefined;
}

export function inferTaskMode(hasPresentedResult: boolean): FigmaTaskMode
{
    return hasPresentedResult ? "revision" : "initial";
}

export function inferEditIntent(message: string, hasPresentedResult: boolean): FigmaEditIntent
{
    const normalized = message.toLowerCase();

    if (
        normalized.includes("новый экран")
        || normalized.includes("another screen")
        || normalized.includes("second screen")
        || normalized.includes("ещё экран")
        || normalized.includes("еще экран")
        || normalized.includes("отдельный экран")
    )
        return "new-screen";

    if (
        normalized.includes("вариант")
        || normalized.includes("альтернатив")
        || normalized.includes("alternate")
        || normalized.includes("alternative")
        || normalized.includes("fork")
        || normalized.includes("вторая версия")
        || normalized.includes("ещё версия")
        || normalized.includes("еще версия")
        || normalized.includes("концепт")
    )
        return "fork-variant";

    return hasPresentedResult ? "edit-existing" : "new-screen";
}

export function inferLayoutConstraints(
    message: string,
    previous?: LayoutConstraints,
): LayoutConstraints
{
    const normalized = message.toLowerCase();
    const platform: FigmaPlatform = /\b(desktop|десктоп|web|landing|dashboard)\b/.test(normalized)
        ? "desktop"
        : /\b(tablet|tablet-first|tablet app|планшет)\b/.test(normalized)
            ? "tablet"
            : previous?.platform ?? "mobile";

    if (platform === "desktop")
    {
        return {
            platform,
            viewportWidth: 1440,
            viewportHeight: 1024,
            contentWidthPolicy: "centered",
            maxContentWidth: 1200,
            horizontalPadding: 32,
        };
    }

    if (platform === "tablet")
    {
        return {
            platform,
            viewportWidth: 768,
            viewportHeight: 1024,
            contentWidthPolicy: "inset",
            maxContentWidth: 720,
            horizontalPadding: 24,
        };
    }

    return {
        platform: "mobile",
        viewportWidth: 390,
        viewportHeight: 844,
        contentWidthPolicy: "inset",
        maxContentWidth: 390,
        horizontalPadding: 24,
    };
}

export function getStageConfig(stage: FigmaStage, mode: FigmaTaskMode): StageConfig
{
    if (stage === "tokens")
    {
        return {
            stage,
            allowedTools: ["figma.tokens", "figma.tokens.get", "figma.tokens.list"],
            requiredTools: ["figma.tokens"],
        };
    }

    if (stage === "primitives")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
                "figma.primitives.jsx",
                "figma.primitives.jsx.get",
                "figma.primitives.jsx.list",
            ],
            requiredTools: ["figma.primitives.plan", "figma.primitives.jsx"],
        };
    }

    if (stage === "compose")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
                "figma.primitives.jsx.get",
                "figma.primitives.jsx.list",
                "figma.compose.meta",
                "figma.compose.meta.get",
                "figma.compose.meta.list",
                "figma.compose.jsx",
                "figma.compose.jsx.get",
                "figma.compose.jsx.list",
                "figma.compile",
                "figma.compile.get",
                "figma.compile.list",
                "figma.compile.jsx",
            ],
            requiredTools: ["figma.compose.meta", "figma.compile"],
        };
    }

    if (stage === "repair")
    {
        return {
            stage,
            allowedTools: [
                "figma.compose.meta.get",
                "figma.compose.meta.list",
                "figma.compose.jsx",
                "figma.compose.jsx.get",
                "figma.compile",
                "figma.compile.get",
                "figma.compile.list",
                "figma.compile.jsx",
            ],
            requiredTools: ["figma.compile"],
        };
    }

    if (stage === "revision")
    {
        return {
            stage,
            allowedTools: mode === "revision"
                ? [
                    "figma.tokens",
                    "figma.tokens.get",
                    "figma.tokens.list",
                    "figma.primitives.plan",
                    "figma.primitives.plan.get",
                    "figma.primitives.plan.list",
                    "figma.primitives.jsx",
                    "figma.primitives.jsx.get",
                    "figma.primitives.jsx.list",
                    "figma.compose.meta",
                    "figma.compose.meta.get",
                    "figma.compose.meta.list",
                    "figma.compose.jsx",
                    "figma.compose.jsx.get",
                    "figma.compose.jsx.list",
                    "figma.compile",
                    "figma.compile.get",
                    "figma.compile.list",
                    "figma.compile.jsx",
                ]
                : [],
            requiredTools: ["figma.compile"],
        };
    }

    return {
        stage: "idle",
        allowedTools: [],
        requiredTools: [],
    };
}

function formatToolList(tools: string[]): string
{
    return tools.length > 0 ? tools.map((tool) => `- \`${tool}\``).join("\n") : "- нет";
}

function formatLayout(layout: LayoutConstraints): string
{
    return [
        `- platform: \`${layout.platform}\``,
        `- viewport: \`${layout.viewportWidth}x${layout.viewportHeight}\``,
        `- contentWidthPolicy: \`${layout.contentWidthPolicy}\``,
        `- maxContentWidth: \`${layout.maxContentWidth}\``,
        `- horizontalPadding: \`${layout.horizontalPadding}\``,
    ].join("\n");
}

export function buildDerivedSnapshot(
    stores: FigmaOrchestratorStores,
    orchestration: FigmaOrchestrationState,
): FigmaDerivedSnapshot
{
    const pluginSnapshot = orchestration.pluginSnapshot;
    if (pluginSnapshot)
    {
        return {
            source: "plugin",
            summary: [
                `- snapshot source: plugin`,
                `- nodeCount: ${pluginSnapshot.nodeCount}`,
                `- selectedNodeIds: ${pluginSnapshot.selectedNodeIds.join(", ") || "none"}`,
                `- activeRootNodeId: ${orchestration.activeRootNodeId ?? "none"}`,
            ].join("\n"),
            invocationJsx: pluginSnapshot.jsx,
            activeCompositionArtifactId: orchestration.activeCompositionArtifactId,
            activeCompileArtifactId: orchestration.activeCompileArtifactId,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    const latestCompositionMeta = lastOf(stores.compositionMeta);
    const latestCompile = lastOf(stores.compileArtifacts);

    if (latestCompositionMeta || latestCompile)
    {
        const latestTokens = lastOf(stores.tokens);
        const latestPlan = lastOf(stores.primitivePlans);
        const latestPrimitivesJsx = lastOf(stores.primitiveJsx);
        const latestCompositionJsx = lastOf(stores.compositionJsx);
        const invocationJsx = latestCompositionJsx?.jsx ?? (latestCompositionMeta ? renderCompositionInvocationJsx(latestCompositionMeta) : undefined);

        return {
            source: "artifacts",
            summary: [
                `- tokens: ${latestTokens?.id ?? "none"}`,
                `- primitives.plan: ${latestPlan?.id ?? "none"}`,
                `- primitives.jsx: ${latestPrimitivesJsx?.id ?? "none"}`,
                `- compose.meta: ${latestCompositionMeta?.id ?? "none"}`,
                `- compose.jsx: ${latestCompositionJsx?.id ?? "none"}`,
                `- compile: ${latestCompile?.id ?? "none"}`,
                `- activeRootNodeId: ${orchestration.activeRootNodeId ?? "none"}`,
            ].join("\n"),
            invocationJsx,
            expandedJsx: latestCompile?.expandedJsx,
            activeCompositionArtifactId: latestCompositionMeta?.id,
            activeCompileArtifactId: latestCompile?.id,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    const bufferJsx = stores.buffer.toJsx().trim();
    if (bufferJsx.length > 0)
    {
        return {
            source: "buffer",
            summary: `- buffer has ${stores.buffer.size} node(s)`,
            invocationJsx: bufferJsx,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    return {
        source: "empty",
        summary: "- no current screen/artifacts",
        activeRootNodeId: orchestration.activeRootNodeId,
    };
}

export function buildStageSystemContext(args: {
    basePrompt: string;
    toolsDoc: string;
    stage: FigmaStage;
    mode: FigmaTaskMode;
    editIntent: FigmaEditIntent;
    snapshot: FigmaDerivedSnapshot;
    layout: LayoutConstraints;
    availableSkillsHint?: string;
}): string
{
    const stageConfig = getStageConfig(args.stage, args.mode);
    const stageTitle = args.stage === "revision"
        ? "REVISION STAGE"
        : args.stage === "repair"
            ? "REPAIR STAGE"
            : `${args.stage.toUpperCase()} STAGE`;

    return [
        args.basePrompt.trim(),
        "",
        "## ORCHESTRATION",
        `- taskMode: \`${args.mode}\``,
        `- editIntent: \`${args.editIntent}\``,
        `- stage: \`${args.stage}\``,
        "",
        "## LAYOUT CONSTRAINTS",
        formatLayout(args.layout),
        "",
        "## CURRENT SNAPSHOT",
        args.snapshot.summary,
        "",
        "## AVAILABLE FIGMA TOOLS FOR THIS STAGE",
        formatToolList(stageConfig.allowedTools),
        "",
        "## REQUIRED FIGMA TOOLS FOR THIS STAGE",
        formatToolList(stageConfig.requiredTools),
        "",
        "## STAGE RULES",
        `### ${stageTitle}`,
        ...buildStageRules(args.stage, args.mode, args.editIntent),
        "",
        "## SKILLS",
        args.availableSkillsHint?.trim() || "Навыки не переданы.",
        "",
        "## FIGMA TOOLS DOC",
        args.toolsDoc.trim(),
    ].join("\n");
}

function buildStageRules(
    stage: FigmaStage,
    mode: FigmaTaskMode,
    editIntent: FigmaEditIntent,
): string[]
{
    if (stage === "tokens")
    {
        return [
            "- Сфокусируйся только на visual direction и design tokens.",
            "- Если доступны design skills, используй их осознанно для более выразительной палитры и hierarchy.",
            "- Не переходи к primitives, compose или compile.",
            "- Обязательно вызови `figma.tokens`.",
        ];
    }

    if (stage === "primitives")
    {
        return [
            "- Декомпозируй задачу в reusable primitives.",
            "- Если доступны sub-agents, можешь использовать `agent.parallel` или `agent.ask` для проработки кирпичиков.",
            "- Сначала обязателен `figma.primitives.plan`, потом `figma.primitives.jsx`.",
            "- Не компилируй экран и не создавай финальный frame.",
        ];
    }

    if (stage === "compose")
    {
        return [
            "- Собирай один актуальный экран с учётом layout constraints.",
            "- Root Screen обязан уважать viewport и width policy.",
            "- Сначала `figma.compose.meta`, затем `figma.compose.jsx`, затем `figma.compile`.",
            "- Не создавай альтернативный screen, если это не требуется задачей.",
        ];
    }

    if (stage === "repair")
    {
        return [
            "- Исправляй только ошибки parse/validation/compile.",
            "- Не меняй тему или primitive library без крайней необходимости.",
            "- Обязательно доведи до успешного `figma.compile`.",
        ];
    }

    if (stage === "revision")
    {
        return [
            "- Это режим доработки существующего результата.",
            `- Текущая политика: \`${editIntent}\`. Если editIntent = \`edit-existing\`, нельзя создавать новый frame без явного обоснования.`,
            "- Используй current snapshot как source of truth.",
            "- Старайся переиспользовать существующие tokens, primitives и composition, меняя только нужные слои.",
            "- После правок обязательно получи успешный `figma.compile`.",
        ];
    }

    return [
        mode === "revision"
            ? "- Редактируй существующий результат."
            : "- Работай по staged flow.",
    ];
}

export function buildStageUserMessage(args: {
    stage: FigmaStage;
    userPrompt: string;
    designBrief?: PreparedDesignBrief;
    snapshot: FigmaDerivedSnapshot;
    layout: LayoutConstraints;
    repairError?: string;
}): string
{
    const header = args.stage === "revision"
        ? "РЕЖИМ ДОРАБОТКИ"
        : args.stage === "repair"
            ? "РЕЖИМ ПОЧИНКИ"
            : `ЭТАП ${args.stage.toUpperCase()}`;

    const parts = [
        header,
        "",
        "## Пользовательский запрос",
        args.userPrompt.trim(),
    ];

    if (args.designBrief)
    {
        parts.push(
            "",
            "## Prepared brief",
            [
                `- rewrittenPrompt: ${args.designBrief.rewrittenPrompt}`,
                `- goal: ${args.designBrief.goal}`,
                `- platform: ${args.designBrief.platform}`,
                `- visualDirection: ${args.designBrief.visualDirection}`,
                `- layoutStrategy: ${args.designBrief.layoutStrategy}`,
                `- contentStrategy: ${args.designBrief.contentStrategy}`,
                `- editStrategy: ${args.designBrief.editStrategy}`,
                ...(args.designBrief.mustHave.length > 0 ? [`- mustHave: ${args.designBrief.mustHave.join(" | ")}`] : []),
                ...(args.designBrief.avoid.length > 0 ? [`- avoid: ${args.designBrief.avoid.join(" | ")}`] : []),
                ...(args.designBrief.successCriteria.length > 0 ? [`- successCriteria: ${args.designBrief.successCriteria.join(" | ")}`] : []),
            ].join("\n"),
        );
    }

    parts.push(
        "",
        "## Snapshot",
        args.snapshot.summary,
        "",
        "## Layout constraints",
        formatLayout(args.layout),
    );

    if (args.snapshot.invocationJsx)
    {
        parts.push("", "## Актуальный invocation JSX", `\`\`\`jsx\n${args.snapshot.invocationJsx}\n\`\`\``);
    }

    if (args.snapshot.expandedJsx)
    {
        parts.push("", "## Актуальный expanded JSX", `\`\`\`jsx\n${args.snapshot.expandedJsx}\n\`\`\``);
    }

    if (args.repairError)
        parts.push("", "## Ошибка для исправления", args.repairError);

    return parts.join("\n");
}

export function summarizeStageSuccess(stage: FigmaStage): string
{
    if (stage === "tokens") return "Тема и токены подготовлены.";
    if (stage === "primitives") return "Primitive library подготовлена.";
    if (stage === "compose") return "Экран собран и скомпилирован.";
    if (stage === "repair") return "Ошибки исправлены и компиляция завершена.";
    if (stage === "revision") return "Доработки применены.";
    return "Этап завершён.";
}

export function extractRootNodeIdFromOps(ops: Array<{ type?: unknown; id?: unknown; frameId?: unknown }>): string | undefined
{
    const rootCreate = ops.find((op) => op.type === "create_frame" && op.frameId === undefined);
    return typeof rootCreate?.id === "string" ? rootCreate.id : undefined;
}

export function applyRenderPolicyToOps(
    ops: FigmaOpLike[],
    orchestration: Pick<FigmaOrchestrationState, "taskMode" | "editIntent" | "activeRootNodeId">,
): { ops: FigmaOpLike[]; nextRootNodeId?: string }
{
    const nextRootNodeId = extractRootNodeIdFromOps(ops);
    const shouldReplaceCurrent =
        orchestration.taskMode === "revision" &&
        orchestration.editIntent === "edit-existing" &&
        !!orchestration.activeRootNodeId;

    return {
        ops: shouldReplaceCurrent
            ? [{ type: "delete_node", nodeId: orchestration.activeRootNodeId }, ...ops]
            : [...ops],
        nextRootNodeId,
    };
}

export interface FigmaOpLike
{
    type?: unknown;
    id?: unknown;
    frameId?: unknown;
    nodeId?: unknown;
    [key: string]: unknown;
}
