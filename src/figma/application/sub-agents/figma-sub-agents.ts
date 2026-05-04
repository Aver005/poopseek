import type ContextManager from "@/agent/context-manager";
import type { AgentMessage } from "@/agent/types";
import type { FigmaServerDeps } from "@/figma/application/server-deps";
import type { FigmaSession } from "@/figma/application/session/session-types";
import type { VarEntry } from "@/figma/engine/theme/var-store";
import { ALLOWED_TAGS, describeComponentProps } from "@/figma/engine/jsx/jsx-spec";
import { JsxParseError, parseJsx } from "@/figma/engine/jsx/jsx-parser";
import { assertValidJsxFragment, formatJsxValidationErrors, JsxValidationException } from "@/figma/engine/jsx/jsx-validator";
import type { ProviderMessage } from "@/providers/types";

export interface DesignerToolCall
{
    tool: string;
    args: Record<string, unknown>;
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


function extractFencedJsonBlocks(text: string): unknown[]
{
    const results: unknown[] = [];
    const pattern = /```json\s*([\s\S]*?)```/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null)
    {
        const raw = match[1]!.trim();
        if (raw)
            results.push(JSON.parse(raw) as unknown);
    }
    return results;
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
        enhancer: session.roleSessions.enhancer.sessionId,
        styler: session.roleSessions.styler.sessionId,
        "primitives-builder": session.roleSessions["primitives-builder"].sessionId,
        designer: session.roleSessions.designer.sessionId,
    };
}

function roleSession(session: FigmaSession, role: "enhancer" | "styler" | "primitives-builder" | "designer"): SessionRef
{
    return {
        sessionId: session.roleSessions[role].sessionId,
        contextManager: session.roleSessions[role].contextManager,
    };
}

function withRolePrompt(base: string, extra: string): string
{
    return `${base.trim()}\n\n${extra.trim()}`;
}

function buildDesignerSystemPrompt(deps: FigmaServerDeps): string
{
    const componentDocs = ALLOWED_TAGS.map((tag) => describeComponentProps(tag)).filter(Boolean).join("\n");
    return withRolePrompt(
        deps.figmaRolePrompts.designer,
        [
            "## Ты — front-end строитель",
            "Твоя главная задача — взять доступные кирпичики, стилизовать их под запрос и скомпоновать из них полноценный `Frame` в формате JSX (обернув его в fenced jsx блок).",
            "",
            "# Доступные кирпичики:",
            `- ${ALLOWED_TAGS.join(", ")}`,
            "",
            "# Доступные пропсы для них:",
            "- id: Обязательно, в `pascal-case`",
            "- className: Используй стилизацию TailwindCSS",
            "- name: Опционально для удобства",
            "",
            "# Prop contracts:",
            componentDocs,
            "",
            "# Доступные переменные:",
            "- Цвета: background, foreground, card, card-foreground, title, primary, secondary, accent, primary-foreground, accent-foreground, secondary-foreground, dimmed, dimmed-foreground",
            "- Расстояния: 3xs, xxs, xs, sm, md, lg, xl, xxl, 3xl, 4xl, 5xl",
            "",
            "# (!) Запомни:",
            "- Никаких условий и логики",
            "- Никаких html-тегов и css styles стилизации",
            "- Никаких hover, dark и прочих модификаторов (состояние стиля статично)",
            "- Никаких event/browser props: onPress, onClick, href, style",
            "",
            "# Вот, пример, грамотно построенного ответа:",
            "```jsx",
            "<Frame id='main-view' name='Основной вид' className='max-w-2xl min-h-dvh bg-background'>",
            "    <Text className='font-bold text-2xl text-foreground'>Title</Text>",
            "</Frame>",
            "```",
        ].join("\n"),
    );
}

function buildEditToolsBlock(): string
{
    return [
        "# Доступные инструменты:",
        "- `figma.set-inner`",
        'Аргументы: "id" - компонента, внутри которого заменить код, "source" - новый JSX-код внутри компонента с id;',
        "- `figma.set-outer`",
        'Аргументы: "id" - компонента, чей код будет изменён, "source" - новый JSX-код компонента с id;',
        "- `figma.remove`",
        'Аргументы: "id" - компонента для удаления;',
        "- `figma.find`",
        'Аргументы: "pattern" - паттерн для поиска по id, например, `btn-*`',
        "- `figma.create-frame`",
        'Аргументы: "source" - полный JSX-код нового `Frame` (начиная с тега `<Frame>`);',
        "",
        "# Пример вызова инструмента:",
        "```json",
        "{",
        '    "tool": "figma.remove",',
        '    "args":',
        "    {",
        '        "id": "some-el-id"',
        "    }",
        "}",
        "```",
        "",
        "# (!) Важно!",
        "- Количество инструментов за один твой ответ - 10",
        "- Вызовы обязательно оборачивай в fenced-json блок",
    ].join("\n");
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
        systemPrompt: deps.figmaRolePrompts.enhancer,
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

export async function runStylerSession(
    deps: FigmaServerDeps,
    session: FigmaSession,
    enhancedPrompt: string,
): Promise<VarEntry[]>
{
    function parseTokens(text: string): VarEntry[]
    {
        const blocks = extractFencedJsonBlocks(text);
        if (blocks.length === 0)
            throw new Error("Styler должен вернуть один fenced ```json``` блок с массивом токенов");

        const raw = blocks[0];
        if (!Array.isArray(raw))
            throw new Error("Styler должен вернуть JSON-массив токенов, не объект");

        return raw.map((item: unknown, i: number) =>
        {
            if (typeof item !== "object" || item === null || Array.isArray(item))
                throw new Error(`Токен #${i + 1}: ожидался объект { name, value }`);
            const record = item as Record<string, unknown>;
            if (typeof record.name !== "string" || !record.name.trim())
                throw new Error(`Токен #${i + 1}: поле "name" обязательно и должно быть строкой`);
            if (typeof record.value !== "string" && typeof record.value !== "number")
                throw new Error(`Токен #${i + 1}: поле "value" должно быть строкой или числом`);
            const entry: VarEntry = { name: record.name.trim(), value: record.value };
            if (typeof record.description === "string" && record.description.trim())
                entry.description = record.description.trim();
            return entry;
        });
    }

    try
    {
        return await runStructuredSession<VarEntry[]>({
            deps,
            session: roleSession(session, "styler"),
            systemPrompt: deps.figmaRolePrompts.styler,
            initialUserMessage: [
                "## Бриф",
                enhancedPrompt.trim(),
                "",
                "## Layout",
                formatLayoutBlock(session.orchestration.layout),
            ].join("\n"),
            parseResponse: parseTokens,
            formatRetryFeedback: (error) => [
                "Ответ не прошел валидацию.",
                `Исправь: ${error.message}`,
                "Верни только один fenced ```json``` блок с массивом токенов формата { name, value, description? }.",
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

export async function runPrimitivesBuilderSession(
    deps: FigmaServerDeps,
    session: FigmaSession,
    enhancedPrompt: string,
): Promise<string>
{
    const componentDocs = ALLOWED_TAGS.map((tag) => describeComponentProps(tag)).filter(Boolean).join("\n");
    const systemPrompt = withRolePrompt(
        deps.figmaRolePrompts.primitivesBuilder,
        [
            "# Доступные компоненты:",
            `- ${ALLOWED_TAGS.join(", ")}`,
            "",
            "# Prop contracts:",
            componentDocs,
            "",
            "# Доступные переменные:",
            "- Цвета: background, foreground, card, card-foreground, title, primary, secondary, accent, primary-foreground, accent-foreground, secondary-foreground, dimmed, dimmed-foreground",
            "- Расстояния: 3xs, xxs, xs, sm, md, lg, xl, xxl, 3xl, 4xl, 5xl",
            "",
            "# (!) Запомни:",
            "- Никаких условий и логики",
            "- Никаких html-тегов и css styles стилизации",
            "- Никаких hover, dark и прочих модификаторов (состояние стиля статично)",
            "- Никаких event/browser props: onPress, onClick, href, style",
            "- id обязателен для каждого элемента, в kebab-case",
            "- Верни только один fenced ```jsx``` блок без оберток Frame — это набор примитивов",
        ].join("\n"),
    );

    try
    {
        return await runStructuredSession<string>({
            deps,
            session: roleSession(session, "primitives-builder"),
            systemPrompt,
            initialUserMessage: [
                "## Бриф",
                enhancedPrompt.trim(),
                "",
                "## Layout",
                formatLayoutBlock(session.orchestration.layout),
            ].join("\n"),
            parseResponse: (text) =>
            {
                const trimmed = text.trim();
                const match = trimmed.match(/^```jsx\s*([\s\S]*?)```$/i);
                if (!match)
                    throw new Error("Primitives-builder должен вернуть только один fenced ```jsx``` блок");
                const jsx = match[1]!.trim();
                if (!jsx)
                    throw new Error("Primitives-builder вернул пустой JSX");
                try
                {
                    const nodes = parseJsx(jsx);
                    assertValidJsxFragment(nodes);
                }
                catch (err)
                {
                    if (err instanceof JsxParseError)
                        throw new Error(`JSX parse error @ ${err.loc.line}:${err.loc.column}: ${err.message}`);
                    if (err instanceof JsxValidationException)
                        throw new Error(formatJsxValidationErrors(err.errors));
                    throw err instanceof Error ? err : new Error(String(err));
                }
                return jsx;
            },
            formatRetryFeedback: (error) => [
                "JSX не прошел валидацию.",
                `Исправь: ${error.message}`,
                "Верни только один fenced ```jsx``` блок с примитивами.",
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

export async function runDesignerEditSession(
    deps: FigmaServerDeps,
    session: FigmaSession,
    userFeedback: string,
): Promise<DesignerToolCall[]>
{
    function parseToolCalls(text: string): DesignerToolCall[]
    {
        const blocks = extractFencedJsonBlocks(text);
        if (blocks.length === 0)
            throw new Error("Дизайнер должен вернуть хотя бы один fenced ```json``` блок с вызовом инструмента");

        return blocks.map((block, i) =>
        {
            if (typeof block !== "object" || block === null || Array.isArray(block))
                throw new Error(`Блок #${i + 1}: ожидался объект { tool, args }`);
            const record = block as Record<string, unknown>;
            const tool = typeof record.tool === "string" ? record.tool.trim() : "";
            if (!tool)
                throw new Error(`Блок #${i + 1}: поле "tool" обязательно`);
            if (typeof record.args !== "object" || record.args === null || Array.isArray(record.args))
                throw new Error(`Блок #${i + 1}: поле "args" должно быть объектом`);
            return { tool, args: record.args as Record<string, unknown> };
        });
    }

    try
    {
        return await runStructuredSession<DesignerToolCall[]>({
            deps,
            session: roleSession(session, "designer"),
            systemPrompt: buildDesignerSystemPrompt(deps),
            initialUserMessage: [
                "# Пользователь запросил правки",
                "Вот его пожелания:",
                "```",
                userFeedback.trim(),
                "```",
                "",
                "## Твоя задача теперь внести точечные правки используя перечень инструментов ниже",
                "",
                buildEditToolsBlock(),
            ].join("\n"),
            parseResponse: parseToolCalls,
            formatRetryFeedback: (error) => [
                "Ответ не прошел валидацию.",
                `Исправь: ${error.message}`,
                "Верни вызовы инструментов в отдельных fenced ```json``` блоках.",
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
