import type ContextManager from "@/agent/context-manager";
import type { AgentMessage } from "@/agent/types";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaSession } from "@/figma/application/session/session-types";
import { ALLOWED_TAGS, describeComponentProps, getComponentSpec } from "@/figma/engine/jsx/jsx-spec";
import { describeAllowedUtilities } from "@/figma/engine/jsx/classname";
import { JsxParseError, parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { assertValidJsxFragment, formatJsxValidationErrors, JsxValidationException } from "@/figma/engine/jsx/jsx-validator";
import type {
    CompositionNode,
    FigmaPrimitiveDefinition,
    PrimitiveLevel,
    PrimitivePropSpec,
    ShadowToken,
    TypographyToken,
} from "@/figma/domain/artifacts/artifact-types";
import type { ProviderMessage } from "@/providers/types";

export interface DesignerOutput
{
    themeName: string;
    colors: Record<string, string>;
    spacing: Record<string, number>;
    sizes: Record<string, number>;
    radius: Record<string, number>;
    typography: Record<string, TypographyToken>;
    shadow: Record<string, ShadowToken>;
}

export interface PlannerOutput
{
    screenName: string;
    primitives: FigmaPrimitiveDefinition[];
}

export interface ComposerOutput
{
    screenName: string;
    compositionNodes: CompositionNode[];
}

export class FigmaUserFacingError extends Error
{
    constructor(
        message: string,
        readonly agentSessions: Record<string, string>,
    )
    {
        super(message);
        this.name = "FigmaUserFacingError";
    }
}

interface SessionRef
{
    sessionId: string;
    contextManager: ContextManager;
}

interface StructuredSessionArgs<T>
{
    deps: FigmaServerDeps;
    session: SessionRef;
    systemPrompt: string;
    initialUserMessage: string;
    parseResponse: (text: string) => T;
    formatRetryFeedback: (error: Error, attempt: number) => string;
    maxAttempts?: number;
}

function mapMessages(messages: AgentMessage[]): ProviderMessage[]
{
    return messages
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
            role: message.role,
            content: message.content,
        }));
}

async function completePrompt(
    deps: FigmaServerDeps,
    contextManager: ContextManager,
    systemPrompt: string,
): Promise<string>
{
    const provider = await deps.getProvider().clone();
    const chunks: string[] = [];
    for await (const chunk of provider.complete(
        mapMessages(contextManager.getMessages()),
        systemPrompt,
        { ...(deps.getCallOptions?.() ?? {}), thinkingEnabled: false, searchEnabled: false },
    ))
        chunks.push(chunk);
    return chunks.join("").trim();
}

function formatLayoutBlock(layout: FigmaSession["orchestration"]["layout"]): string
{
    return [
        `- platform: ${layout.platform}`,
        `- viewport: ${layout.viewportWidth}x${layout.viewportHeight}`,
        `- contentWidthPolicy: ${layout.contentWidthPolicy}`,
        `- maxContentWidth: ${layout.maxContentWidth}`,
        `- horizontalPadding: ${layout.horizontalPadding}`,
    ].join("\n");
}

function extractJson(text: string): unknown
{
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced)
        return JSON.parse(fenced[1]!.trim()) as unknown;

    const trimmed = text.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
        return JSON.parse(trimmed) as unknown;

    throw new Error("Ответ должен содержать один JSON-объект в ```json``` блоке");
}

function normalizeStringMap(value: unknown, label: string): Record<string, string>
{
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`Поле "${label}" должно быть объектом`);

    const entries = Object.entries(value)
        .map(([key, entry]) => [key.trim(), typeof entry === "string" ? entry.trim() : ""] as const)
        .filter(([key, entry]) => key.length > 0 && entry.length > 0);

    if (entries.length === 0)
        throw new Error(`Поле "${label}" не должно быть пустым`);

    return Object.fromEntries(entries);
}

function normalizeNumberMap(value: unknown, label: string, allowEmpty: boolean = false): Record<string, number>
{
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`Поле "${label}" должно быть объектом`);

    const entries = Object.entries(value)
        .map(([key, entry]) => [key.trim(), Number(entry)] as const)
        .filter(([key, entry]) => key.length > 0 && Number.isFinite(entry));

    if (!allowEmpty && entries.length === 0)
        throw new Error(`Поле "${label}" не должно быть пустым`);

    return Object.fromEntries(entries);
}

function normalizeTypography(value: unknown): Record<string, TypographyToken>
{
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error('Поле "typography" должно быть объектом');

    const result = Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) =>
        {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
            const record = entry as Record<string, unknown>;
            const fontFamily = typeof record.fontFamily === "string" ? record.fontFamily.trim() : "";
            const fontSize = Number(record.fontSize);
            const lineHeight = Number(record.lineHeight);
            const fontWeight = Number(record.fontWeight);
            const letterSpacing = record.letterSpacing === undefined ? 0 : Number(record.letterSpacing);

            if (!fontFamily || !Number.isFinite(fontSize) || !Number.isFinite(lineHeight) || !Number.isFinite(fontWeight) || !Number.isFinite(letterSpacing))
                return [];

            return [[key.trim(), {
                fontFamily,
                fontSize,
                lineHeight,
                fontWeight,
                letterSpacing,
            } satisfies TypographyToken] as const];
        }),
    );

    if (Object.keys(result).length === 0)
        throw new Error('Поле "typography" не должно быть пустым');

    return result;
}

function normalizeShadow(value: unknown): Record<string, ShadowToken>
{
    if (value === undefined)
        return {};

    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error('Поле "shadow" должно быть объектом');

    return Object.fromEntries(
        Object.entries(value).flatMap(([key, entry]) =>
        {
            if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
            const record = entry as Record<string, unknown>;
            const x = Number(record.x);
            const y = Number(record.y);
            const blur = Number(record.blur);
            const spread = Number(record.spread);
            const color = typeof record.color === "string" ? record.color.trim() : "";
            const opacity = Number(record.opacity);

            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(blur) || !Number.isFinite(spread) || !color || !Number.isFinite(opacity))
                return [];

            return [[key.trim(), { x, y, blur, spread, color, opacity } satisfies ShadowToken] as const];
        }),
    );
}

function normalizePrimitiveLevel(value: unknown): PrimitiveLevel
{
    if (value === "atom" || value === "molecule" || value === "section")
        return value;
    throw new Error('Primitive "level" должен быть atom, molecule или section');
}

function normalizePrimitiveProps(value: unknown): PrimitivePropSpec[]
{
    if (value === undefined) return [];
    if (!Array.isArray(value))
        throw new Error('Primitive "props" должно быть массивом');

    return value.map((entry) =>
    {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry))
            throw new Error('Каждый primitive prop должен быть объектом');

        const record = entry as Record<string, unknown>;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        if (!name)
            throw new Error('Каждый primitive prop должен содержать непустое поле "name"');
        if (/^on[A-Z]/.test(name) || /^on[a-z]/.test(name))
            throw new Error(`Prop "${name}" запрещен: event-handler props не поддерживаются в Figma JSX`);
        if (["style", "className", "children", "ref", "key", "href"].includes(name))
            throw new Error(`Prop "${name}" запрещен для primitive contract`);

        return {
            name,
            required: record.required === true,
            description: typeof record.description === "string" && record.description.trim().length > 0
                ? record.description.trim()
                : undefined,
        } satisfies PrimitivePropSpec;
    });
}

function normalizePrimitiveDefinitions(value: unknown): FigmaPrimitiveDefinition[]
{
    if (!Array.isArray(value) || value.length === 0)
        throw new Error('Поле "primitives" должно быть непустым массивом');

    const primitives = value.map((entry) =>
    {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry))
            throw new Error("Каждый primitive должен быть объектом");

        const record = entry as Record<string, unknown>;
        const name = typeof record.name === "string" ? record.name.trim() : "";
        if (!name)
            throw new Error('Каждый primitive должен содержать непустое поле "name"');

        const dependencies = Array.isArray(record.dependencies)
            ? record.dependencies
                .map((item) => typeof item === "string" ? item.trim() : "")
                .filter((item) => item.length > 0)
            : [];

        return {
            name,
            level: normalizePrimitiveLevel(record.level),
            description: typeof record.description === "string" && record.description.trim().length > 0
                ? record.description.trim()
                : undefined,
            props: normalizePrimitiveProps(record.props),
            dependencies,
        } satisfies FigmaPrimitiveDefinition;
    });

    const names = new Set<string>();
    for (const primitive of primitives)
    {
        const key = primitive.name.toLowerCase();
        if (names.has(key))
            throw new Error(`Дублирующийся primitive "${primitive.name}"`);
        names.add(key);
    }

    for (const primitive of primitives)
    {
        for (const dependency of primitive.dependencies)
        {
            if (!names.has(dependency.toLowerCase()))
                throw new Error(`Primitive "${primitive.name}" ссылается на неизвестную dependency "${dependency}"`);
        }
    }

    return primitives;
}

function normalizeCompositionNode(value: unknown): CompositionNode
{
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("Каждый composition node должен быть объектом");

    const record = value as Record<string, unknown>;
    const kind = typeof record.kind === "string" ? record.kind.trim() : "";
    if (kind === "primitive")
    {
        const primitive = typeof record.primitive === "string" ? record.primitive.trim() : "";
        if (!primitive)
            throw new Error('Primitive node должен содержать непустое поле "primitive"');
        return {
            kind: "primitive",
            primitive,
            props: normalizeScalarRecord(record.props),
        };
    }

    if (kind === "element")
    {
        const type = typeof record.type === "string" ? record.type.trim() : "";
        if (!type)
            throw new Error('Element node должен содержать непустое поле "type"');
        if (!getComponentSpec(type))
            throw new Error(`Неизвестный Figma element "${type}"`);

        const children = Array.isArray(record.children)
            ? record.children.map((child) => normalizeCompositionNode(child))
            : [];

        return {
            kind: "element",
            type,
            props: normalizeScalarRecord(record.props),
            text: typeof record.text === "string" && record.text.trim().length > 0
                ? record.text.trim()
                : undefined,
            children,
        };
    }

    throw new Error('Каждый composition node должен иметь kind "element" или "primitive"');
}

function normalizeScalarRecord(value: unknown): Record<string, string | number | boolean> | undefined
{
    if (value === undefined) return undefined;
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error('Поле "props" должно быть объектом');

    const result = Object.fromEntries(
        Object.entries(value).filter(([, entry]) =>
            typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean"),
    );

    return Object.keys(result).length > 0 ? result : undefined;
}

function parseDesignerResponse(text: string): DesignerOutput
{
    const record = extractJson(text) as Record<string, unknown>;
    const themeName = typeof record.themeName === "string" && record.themeName.trim().length > 0
        ? record.themeName.trim()
        : "custom";

    return {
        themeName,
        colors: normalizeStringMap(record.colors, "colors"),
        spacing: normalizeNumberMap(record.spacing, "spacing"),
        sizes: normalizeNumberMap(record.sizes, "sizes"),
        radius: normalizeNumberMap(record.radius ?? {}, "radius", true),
        typography: normalizeTypography(record.typography),
        shadow: normalizeShadow(record.shadow),
    };
}

function parsePlannerResponse(text: string): PlannerOutput
{
    const record = extractJson(text) as Record<string, unknown>;
    const screenName = typeof record.screenName === "string" ? record.screenName.trim() : "";
    if (!screenName)
        throw new Error('Поле "screenName" обязательно');

    return {
        screenName,
        primitives: normalizePrimitiveDefinitions(record.primitives),
    };
}

function parseComposerResponse(text: string): ComposerOutput
{
    const record = extractJson(text) as Record<string, unknown>;
    const screenName = typeof record.screenName === "string" ? record.screenName.trim() : "";
    if (!screenName)
        throw new Error('Поле "screenName" обязательно');
    if (!Array.isArray(record.compositionNodes) || record.compositionNodes.length === 0)
        throw new Error('Поле "compositionNodes" должно быть непустым массивом');

    return {
        screenName,
        compositionNodes: record.compositionNodes.map((entry) => normalizeCompositionNode(entry)),
    };
}

function extractStrictJsx(text: string): string
{
    const trimmed = text.trim();
    const match = trimmed.match(/^```jsx\s*([\s\S]*?)```$/i);
    if (!match)
        throw new Error("Builder должен вернуть только один fenced ```jsx``` блок без дополнительного текста");

    const jsx = match[1]!.trim();
    if (!jsx)
        throw new Error("Builder вернул пустой JSX");

    try
    {
        const nodes = parseJsx(jsx);
        assertValidJsxFragment(nodes);
    }
    catch (error)
    {
        if (error instanceof JsxParseError)
            throw new Error(`JSX parse error @ ${error.loc.line}:${error.loc.column}: ${error.message}`);
        if (error instanceof JsxValidationException)
            throw new Error(formatJsxValidationErrors(error.errors));
        throw error instanceof Error ? error : new Error(String(error));
    }

    return jsx;
}

function commonBuilderFailureHints(): string
{
    return [
        "- Нельзя использовать CSS/DOM positioning utilities: `fixed`, `absolute`, `sticky`, `top-0`, `right-0`, `bottom-0`, `left-0`, `inset-*`, `z-*`.",
        "- Нельзя придумывать utility names из design token names: `bg-accent-pasta`, `border-light`, `text-title-medium` и т.п.",
        "- Нельзя передавать browser/event props: `onPress`, `onClick`, `href`, `style`.",
        "- Используй только реальные Figma JSX props и только допустимые utility classes.",
    ].join("\n");
}

async function runStructuredSession<T>(args: StructuredSessionArgs<T>): Promise<T>
{
    const maxAttempts = args.maxAttempts ?? 3;
    args.session.contextManager.addUser(args.initialUserMessage);

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1)
    {
        const raw = await completePrompt(args.deps, args.session.contextManager, args.systemPrompt);
        args.session.contextManager.addAssistant(raw);

        try
        {
            return args.parseResponse(raw);
        }
        catch (error)
        {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt >= maxAttempts) break;
            args.session.contextManager.addUser(args.formatRetryFeedback(lastError, attempt));
        }
    }

    throw new FigmaUserFacingError(
        [
            `Подагент сессии \`${args.session.sessionId}\` не смог выдать корректный ответ за ${maxAttempts} попытки.`,
            lastError ? `Последняя ошибка: ${lastError.message}` : "Причина неизвестна.",
        ].join("\n"),
        { [args.session.sessionId]: args.session.sessionId },
    );
}

function sessionMap(session: FigmaSession): Record<string, string>
{
    return {
        planner: session.plannerSessionId,
        enhancer: session.roleSessions.enhancer.sessionId,
        designer: session.roleSessions.designer.sessionId,
        builder: session.roleSessions.builder.sessionId,
        composer: session.roleSessions.composer.sessionId,
    };
}

function roleSession(session: FigmaSession, role: "enhancer" | "designer" | "builder" | "composer"): SessionRef
{
    return {
        sessionId: session.roleSessions[role].sessionId,
        contextManager: session.roleSessions[role].contextManager,
    };
}

function plannerSession(session: FigmaSession): SessionRef
{
    return {
        sessionId: session.plannerSessionId,
        contextManager: session.plannerContextManager,
    };
}

function withRolePrompt(base: string, extra: string): string
{
    return `${base.trim()}\n\n${extra.trim()}`;
}

export async function runEnhancerSession(
    deps: FigmaServerDeps,
    session: FigmaSession,
    userMessage: string,
): Promise<string>
{
    const enhanced = await runStructuredSession<string>({
        deps,
        session: roleSession(session, "enhancer"),
        systemPrompt: withRolePrompt(
            deps.figmaRolePrompts.enhancer,
            [
                deps.figmaStagePrompts.preprocess,
                "Ты улучшаешь пользовательский запрос для генерации красивого и цельного UI.",
                "Формат ответа свободный.",
                "Запрещено возвращать JSON-схемы, списки требований к инструментам и технические инструкции.",
                "Нужен только усиленный дизайн-бриф на естественном языке.",
            ].join("\n\n"),
        ),
        initialUserMessage: [
            "Улучши этот запрос так, чтобы следующим агентам было проще построить сильный интерфейс.",
            "",
            "## User request",
            userMessage.trim(),
            "",
            "## Layout",
            formatLayoutBlock(session.orchestration.layout),
        ].join("\n"),
        parseResponse: (text) =>
        {
            const normalized = text.trim();
            if (!normalized)
                throw new Error("Enhancer вернул пустой ответ");
            return normalized;
        },
        formatRetryFeedback: (error) => [
            "Ответ пустой или непригоден.",
            `Исправь проблему: ${error.message}`,
            "Верни один цельный улучшенный бриф обычным текстом, без JSON и без markdown-рамок.",
        ].join("\n"),
    });

    return enhanced;
}

export async function runDesignerSession(
    deps: FigmaServerDeps,
    session: FigmaSession,
    userMessage: string,
    enhancedPrompt: string,
): Promise<DesignerOutput>
{
    try
    {
        return await runStructuredSession<DesignerOutput>({
            deps,
            session: roleSession(session, "designer"),
            systemPrompt: withRolePrompt(
                deps.figmaRolePrompts.designer,
                [
                    deps.figmaStagePrompts.tokens,
                    "Сформируй строгую дизайн-систему для экрана.",
                    "Верни только один JSON-объект в ```json``` блоке.",
                    "Обязательные поля: themeName, colors, spacing, sizes, radius, typography, shadow.",
                    "colors: map token -> hex.",
                    "spacing/sizes/radius: map token -> number.",
                    "typography: map token -> { fontFamily, fontSize, lineHeight, fontWeight, letterSpacing }.",
                    "shadow: map token -> { x, y, blur, spread, color, opacity }.",
                    "Без пояснений вне JSON.",
                ].join("\n\n"),
            ),
            initialUserMessage: [
                "Собери дизайн-токены для этого UI.",
                "",
                "## User request",
                userMessage.trim(),
                "",
                "## Enhanced prompt",
                enhancedPrompt,
                "",
                "## Layout",
                formatLayoutBlock(session.orchestration.layout),
            ].join("\n"),
            parseResponse: parseDesignerResponse,
            formatRetryFeedback: (error) => [
                "JSON не прошел валидацию.",
                `Исправь: ${error.message}`,
                "Верни только один корректный ```json``` блок с полями themeName, colors, spacing, sizes, radius, typography, shadow.",
            ].join("\n"),
        });
    }
    catch (error)
    {
        if (error instanceof FigmaUserFacingError)
            throw new FigmaUserFacingError(error.message, sessionMap(session));
        throw error;
    }
}

export async function runPlannerSession(
    deps: FigmaServerDeps,
    session: FigmaSession,
    userMessage: string,
    enhancedPrompt: string,
    design: DesignerOutput,
): Promise<PlannerOutput>
{
    try
    {
        return await runStructuredSession<PlannerOutput>({
            deps,
            session: plannerSession(session),
            systemPrompt: [
                "Ты основной Figma planner agent.",
                "Ты не рисуешь и не пишешь JSX.",
                "Твоя задача: понять, какие reusable primitives нужны для экрана, и вернуть только строгий JSON.",
                "Верни один JSON-объект в ```json``` блоке.",
                'Формат: { "screenName": string, "primitives": Array<{ "name": string, "level": "atom" | "molecule" | "section", "description"?: string, "props"?: Array<{ "name": string, "required"?: boolean, "description"?: string }>, "dependencies"?: string[] }> }',
                "Primitives должны быть реальными кирпичиками, которые builder сможет собрать отдельно.",
                "Не добавляй лишние вариации и не дублируй роли компонентов.",
                "НЕ включай event/browser props: onPress, onClick, href, style, className, children, ref, key.",
                "Если поведение интерактивное, описывай semantic prop без browser semantics, например `label`, `price`, `badgeText`, `subtitle`.",
            ].join("\n\n"),
            initialUserMessage: [
                "Определи минимально-достаточный набор primitives для экрана.",
                "",
                "## User request",
                userMessage.trim(),
                "",
                "## Enhanced prompt",
                enhancedPrompt,
                "",
                "## Design tokens summary",
                JSON.stringify({
                    themeName: design.themeName,
                    colors: Object.keys(design.colors),
                    spacing: Object.keys(design.spacing),
                    sizes: Object.keys(design.sizes),
                    radius: Object.keys(design.radius),
                    typography: Object.keys(design.typography),
                    shadow: Object.keys(design.shadow),
                }, null, 2),
                "",
                "## Layout",
                formatLayoutBlock(session.orchestration.layout),
            ].join("\n"),
            parseResponse: parsePlannerResponse,
            formatRetryFeedback: (error) => [
                "JSON не прошел валидацию.",
                `Исправь: ${error.message}`,
                "Верни только корректный primitive plan в одном ```json``` блоке.",
            ].join("\n"),
        });
    }
    catch (error)
    {
        if (error instanceof FigmaUserFacingError)
            throw new FigmaUserFacingError(error.message, sessionMap(session));
        throw error;
    }
}

export async function runBuilderSession(args: {
    deps: FigmaServerDeps;
    session: FigmaSession;
    userMessage: string;
    enhancedPrompt: string;
    design: DesignerOutput;
    planner: PlannerOutput;
    primitive: FigmaPrimitiveDefinition;
    builtPrimitiveNames: string[];
}): Promise<string>
{
    try
    {
        return await runStructuredSession<string>({
            deps: args.deps,
            session: roleSession(args.session, "builder"),
            systemPrompt: withRolePrompt(
                args.deps.figmaRolePrompts.builder,
                [
                    args.deps.figmaStagePrompts.primitives,
                    "Ты пишешь только один JSX primitive за раз.",
                    "Figma JSX НЕ равен HTML/CSS/Tailwind для веба.",
                    "В этой dialect нет fixed/absolute/sticky positioning utilities.",
                    "Нельзя выдумывать class tokens из названий design tokens.",
                    "Нельзя передавать event-handler props вроде onPress/onClick/href/style.",
                    "Разрешены только Figma JSX теги:",
                    ALLOWED_TAGS.join(", "),
                    "",
                    "Критически важные prop contracts:",
                    describeComponentProps("Frame"),
                    describeComponentProps("VStack"),
                    describeComponentProps("HStack"),
                    describeComponentProps("Card"),
                    describeComponentProps("Button"),
                    describeComponentProps("Text"),
                    describeComponentProps("Image"),
                    "",
                    `Разрешены только utility class tokens: ${describeAllowedUtilities()}`,
                    "Верни только один fenced ```jsx``` блок и ничего кроме него.",
                    "Никаких import/export, никакого React runtime, никаких HTML тегов, никаких inline styles.",
                ].join("\n"),
            ),
            initialUserMessage: [
                `Собери primitive "${args.primitive.name}".`,
                "",
                "## User request",
                args.userMessage.trim(),
                "",
                "## Enhanced prompt",
                args.enhancedPrompt,
                "",
                "## Design tokens",
                JSON.stringify(args.design, null, 2),
                "",
                "## Planner screen",
                args.planner.screenName,
                "",
                "## Primitive spec",
                JSON.stringify(args.primitive, null, 2),
                "",
                "## Important interpretation rules",
                "- Если описание говорит про fixed/sticky/bottom bar, не используй CSS positioning utilities.",
                "- В таком случае собери semantic bottom CTA container, а само размещение на экране решает composer/main pipeline.",
                "- Не превращай design token names в class tokens.",
                "",
                "## Already built primitives",
                args.builtPrimitiveNames.length > 0 ? args.builtPrimitiveNames.join(", ") : "none",
            ].join("\n"),
            parseResponse: extractStrictJsx,
            formatRetryFeedback: (error) => [
                "JSX не прошел валидацию.",
                `Исправь: ${error.message}`,
                "",
                "Частые причины:",
                commonBuilderFailureHints(),
                "Верни только один fenced ```jsx``` блок для этого primitive.",
            ].join("\n"),
        });
    }
    catch (error)
    {
        if (error instanceof FigmaUserFacingError)
            throw new FigmaUserFacingError(error.message, sessionMap(args.session));
        throw error;
    }
}

export async function runComposerSession(args: {
    deps: FigmaServerDeps;
    session: FigmaSession;
    userMessage: string;
    enhancedPrompt: string;
    design: DesignerOutput;
    planner: PlannerOutput;
    builtPrimitives: Array<{ name: string; jsx: string }>;
    compileError?: string;
}): Promise<ComposerOutput>
{
    try
    {
        return await runStructuredSession<ComposerOutput>({
            deps: args.deps,
            session: roleSession(args.session, "composer"),
            systemPrompt: withRolePrompt(
                args.deps.figmaRolePrompts.composer,
                [
                    args.deps.figmaStagePrompts.compose,
                    "Ты собираешь экран только из доступных primitives и Figma JSX elements.",
                    "Верни только один JSON-объект в ```json``` блоке.",
                    'Формат: { "screenName": string, "compositionNodes": CompositionNode[] }',
                    'CompositionNode = { kind: "primitive", primitive: string, props?: Record<string, string | number | boolean> } | { kind: "element", type: string, props?: Record<string, string | number | boolean>, text?: string, children?: CompositionNode[] }',
                    "Не используй неизвестные primitives.",
                    "Для element.type разрешены только Figma elements.",
                    "Никаких пояснений вне JSON.",
                ].join("\n\n"),
            ),
            initialUserMessage: [
                "Собери композицию экрана из готовых primitives.",
                "",
                "## User request",
                args.userMessage.trim(),
                "",
                "## Enhanced prompt",
                args.enhancedPrompt,
                "",
                "## Design tokens",
                JSON.stringify(args.design, null, 2),
                "",
                "## Screen name",
                args.planner.screenName,
                "",
                "## Available primitives",
                JSON.stringify(args.builtPrimitives, null, 2),
                ...(args.compileError ? ["", "## Previous compile error", args.compileError] : []),
            ].join("\n"),
            parseResponse: parseComposerResponse,
            formatRetryFeedback: (error) => [
                "Composition JSON не прошел валидацию.",
                `Исправь: ${error.message}`,
                "Верни только один корректный ```json``` блок.",
            ].join("\n"),
        });
    }
    catch (error)
    {
        if (error instanceof FigmaUserFacingError)
            throw new FigmaUserFacingError(error.message, sessionMap(args.session));
        throw error;
    }
}
