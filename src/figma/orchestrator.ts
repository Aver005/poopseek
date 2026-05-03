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
export type FigmaStage =
    | "idle"
    | "tokens"
    | "primitives"
    | "primitives-plan"
    | "primitive-jsx"
    | "compose"
    | "repair"
    | "revision";
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
    activeTokensArtifactId?: string;
    activePrimitivePlanArtifactId?: string;
    activePrimitivesJsxArtifactId?: string;
    activeCompositionArtifactId?: string;
    activeCompositionJsxArtifactId?: string;
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

    if (stage === "primitives-plan")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
            ],
            requiredTools: ["figma.primitives.plan"],
        };
    }

    if (stage === "primitive-jsx")
    {
        return {
            stage,
            allowedTools: [
                "figma.tokens.get",
                "figma.tokens.list",
                "figma.primitives.plan.get",
                "figma.primitives.plan.list",
                "figma.primitives.jsx",
                "figma.primitives.jsx.get",
                "figma.primitives.jsx.list",
            ],
            requiredTools: ["figma.primitives.jsx"],
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
            requiredTools: ["figma.compose.meta", "figma.compose.jsx", "figma.compile"],
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
    const latestTokens: FigmaTokensArtifact | undefined = lastOf(stores.tokens);
    const latestPlan: FigmaPrimitivesPlanArtifact | undefined = lastOf(stores.primitivePlans);
    const latestPrimitivesJsx: FigmaPrimitivesJsxArtifact | undefined = lastOf(stores.primitiveJsx);
    const latestCompositionMeta: FigmaCompositionMetaArtifact | undefined = lastOf(stores.compositionMeta);
    const latestCompositionJsx: FigmaCompositionJsxArtifact | undefined = lastOf(stores.compositionJsx);
    const latestCompile: FigmaCompileArtifact | undefined = lastOf(stores.compileArtifacts);
    const latestTokensId = latestTokens?.id;
    const latestPlanId = latestPlan?.id;
    const latestPrimitivesJsxId = latestPrimitivesJsx?.id;
    const latestCompositionMetaId = latestCompositionMeta?.id;
    const latestCompositionJsxId = latestCompositionJsx?.id;
    const latestCompileId = latestCompile?.id;
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
            activeTokensArtifactId: latestTokensId,
            activePrimitivePlanArtifactId: latestPlanId,
            activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
            activeCompositionArtifactId: orchestration.activeCompositionArtifactId,
            activeCompositionJsxArtifactId: latestCompositionJsxId,
            activeCompileArtifactId: orchestration.activeCompileArtifactId,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    if (latestCompositionMeta || latestCompile)
    {
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
            activeTokensArtifactId: latestTokensId,
            activePrimitivePlanArtifactId: latestPlanId,
            activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
            activeCompositionArtifactId: latestCompositionMetaId,
            activeCompositionJsxArtifactId: latestCompositionJsxId,
            activeCompileArtifactId: latestCompileId,
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
            activeTokensArtifactId: latestTokensId,
            activePrimitivePlanArtifactId: latestPlanId,
            activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
            activeCompositionArtifactId: latestCompositionMetaId,
            activeCompositionJsxArtifactId: latestCompositionJsxId,
            activeCompileArtifactId: latestCompileId,
            activeRootNodeId: orchestration.activeRootNodeId,
        };
    }

    return {
        source: "empty",
        summary: [
            "- no current screen/artifacts",
            `- tokens: ${latestTokensId ?? "none"}`,
            `- primitives.plan: ${latestPlanId ?? "none"}`,
            `- primitives.jsx: ${latestPrimitivesJsxId ?? "none"}`,
            `- compose.meta: ${latestCompositionMetaId ?? "none"}`,
            `- compose.jsx: ${latestCompositionJsxId ?? "none"}`,
            `- compile: ${latestCompileId ?? "none"}`,
        ].join("\n"),
        activeTokensArtifactId: latestTokensId,
        activePrimitivePlanArtifactId: latestPlanId,
        activePrimitivesJsxArtifactId: latestPrimitivesJsxId,
        activeCompositionArtifactId: latestCompositionMetaId,
        activeCompositionJsxArtifactId: latestCompositionJsxId,
        activeCompileArtifactId: latestCompileId,
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

    if (stage === "primitives" || stage === "primitives-plan")
    {
        return [
            "- Декомпозируй задачу в reusable primitives.",
            "- `figma.primitives.plan` принимает только metadata entries: `{name, level, description?, props?, dependencies?}`.",
            "- Каждый primitive обязан иметь `level`: `atom`, `molecule` или `section`.",
            "- INVALID levels: `component`, `layout`, `block`, `element`.",
            "- В этом чате делай только plan, без JSX.",
            "- JSX нельзя класть в `figma.primitives.plan`.",
            "- Не компилируй экран и не создавай финальный frame.",
        ];
    }

    if (stage === "primitive-jsx")
    {
        return [
            "- В этом чате делай JSX только для одного primitive.",
            "- Если доступны sub-agents, можешь использовать `agent.parallel` или `agent.ask` для проработки кирпичиков.",
            "- В `figma.primitives.jsx` JSON содержит только ids/names, а сам JSX идёт следующими fenced `jsx` блоками.",
            "- Используй только Figma JSX теги и semantic utility classes, а не HTML (`div`, `span`, `button`, `section`, `h1`, `p`, `svg`) и не inline styles.",
            "- INVALID JSX patterns: `import React`, `React.createElement`, DOM tags, `style={{...}}`, CSS objects, raw hex colors, browser event handlers.",
            "- VALID primitives должны быть короткими, декларативными и похожими на canonical Figma JSX examples.",
            "- Если validator ругается, чини dialect и schema, а не переходи на React/DOM-парадигму.",
            "- Не генерируй сразу весь набор primitives в одном ответе.",
        ];
    }

    if (stage === "compose")
    {
        return [
            "- Собирай один актуальный экран с учётом layout constraints.",
            "- Root Screen обязан уважать viewport и width policy.",
            "- Сначала `figma.compose.meta`, затем `figma.compose.jsx`, затем `figma.compile`.",
            "- `figma.compose.meta` принимает только metadata graph из `compositionNodes` и ссылок на уже существующие artifact ids.",
            "- Каждый node в `compositionNodes` обязан быть либо `{ kind: \"element\", type, props?, text?, children? }`, либо `{ kind: \"primitive\", primitive, props? }`.",
            "- INVALID compose patterns: raw DOM nodes (`div`, `section`, `button`), inline styles, `content` вместо `text`, пропуск `kind`, выдуманные artifact ids.",
            "- `figma.compile` в staged flow принимает только `compositionArtifactId`, а не raw JSX.",
            "- Не используй legacy `figma_*` инструменты, HTML-теги или inline styles.",
            "- Не создавай альтернативный screen, если это не требуется задачей.",
        ];
    }

    if (stage === "repair")
    {
        return [
            "- Исправляй только ошибки parse/validation/compile.",
            "- Не меняй тему или primitive library без крайней необходимости.",
            "- Для починки переиспользуй существующий `compositionArtifactId` и пересобирай staged flow, а не уходи в legacy tools.",
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
            "- Не переключайся на legacy `figma_*` инструменты, если задача решается staged artifacts.",
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
    extraContext?: string;
}): string
{
    const header = args.stage === "revision"
        ? "РЕЖИМ ДОРАБОТКИ"
        : args.stage === "repair"
            ? "РЕЖИМ ПОЧИНКИ"
            : args.stage === "primitives-plan"
                ? "ЭТАП PRIMITIVES PLAN"
                : args.stage === "primitive-jsx"
                    ? "ЭТАП PRIMITIVE JSX"
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
        "## Current artifact ids",
        [
            `- tokensArtifactId: ${args.snapshot.activeTokensArtifactId ?? "none"}`,
            `- primitivesArtifactId: ${args.snapshot.activePrimitivePlanArtifactId ?? "none"}`,
            `- primitivesJsxArtifactId: ${args.snapshot.activePrimitivesJsxArtifactId ?? "none"}`,
            `- compositionArtifactId: ${args.snapshot.activeCompositionArtifactId ?? "none"}`,
            `- compositionJsxArtifactId: ${args.snapshot.activeCompositionJsxArtifactId ?? "none"}`,
            `- compileArtifactId: ${args.snapshot.activeCompileArtifactId ?? "none"}`,
        ].join("\n"),
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

    if (args.extraContext?.trim())
        parts.push("", "## Stage-specific context", args.extraContext.trim());

    if (args.stage === "primitives" || args.stage === "primitives-plan" || args.stage === "primitive-jsx")
    {
        parts.push(
            "",
            "## Primitive schema reminders",
            "- VALID `level`: `atom`, `molecule`, `section`",
            "- INVALID `level`: `component`, `layout`, `block`",
            "- VALID JSX: Figma JSX tags + className-based styling",
            "- INVALID JSX: DOM tags, inline styles, imports, React runtime code",
        );
    }

    if (args.stage === "compose" || args.stage === "revision" || args.stage === "repair")
    {
        parts.push(
            "",
            "## Composition schema reminders",
            "- VALID node kinds: `element`, `primitive`",
            "- Use `text`, not `content`",
            "- Reference real artifact ids from the section above",
            "- Do not invent `tokensArtifactId`, `primitivesArtifactId` or `primitivesJsxArtifactId`",
        );
    }

    return parts.join("\n");
}

export function summarizeStageSuccess(stage: FigmaStage): string
{
    if (stage === "tokens") return "Тема и токены подготовлены.";
    if (stage === "primitives") return "Primitive library подготовлена.";
    if (stage === "primitives-plan") return "Primitive plan подготовлен.";
    if (stage === "primitive-jsx") return "Primitive JSX подготовлен.";
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
