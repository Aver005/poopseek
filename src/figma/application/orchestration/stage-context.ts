import type { PreparedDesignBrief } from "@/figma/preprocess";
import { getStageConfig } from "./stage-config";
import type {
    FigmaDerivedSnapshot,
    FigmaEditIntent,
    FigmaStage,
    FigmaTaskMode,
    LayoutConstraints,
} from "./types";

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
