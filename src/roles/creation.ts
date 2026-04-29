import { stdout as output } from "node:process";
import ContextManager from "@/agent/context-manager";
import StreamingAgentLoop from "@/agent/streaming-loop";
import ToolExecutor from "@/agent/tool-executor";
import { colors } from "@/cli/colors";
import { renderMarkdown } from "@/cli/markdown";
import { getToolDetail, getToolProgressMessage, renderToolResultExtra } from "@/cli/tool-progress-messages";
import type { GenerationIndicator } from "@/cli/generation-indicator";
import type { InputQueue } from "@/cli/input-queue";
import type { TerminalInputMode } from "@/cli/terminal-input";
import type { MCPManager } from "@/mcp";
import type { SkillManager } from "@/skills";
import type { SubAgentRunner } from "@/agent/sub-agent";
import type { ILLMProvider } from "@/providers";
import type { AskUserFn } from "@/tools/types";
import type { VariableProcessor } from "@/variables";

export type ActiveOperation = {
    kind: "role-creation";
    abortController: AbortController;
};

export type RoleCreationDeps = {
    getProvider: () => ILLMProvider;
    prompts: { roleCreatorPrompt: string; toolsPrompt: string };
    variableProcessor: VariableProcessor;
    skillManager: SkillManager;
    mcpManager: MCPManager;
    subAgentRunner: SubAgentRunner;
    inputQueue: InputQueue;
    generationIndicator: GenerationIndicator;
    terminalInput: {
        setMode: (mode: TerminalInputMode) => void;
        setRenderEnabled: (enabled: boolean) => void;
        setPromptPrefix: (prefix: string) => void;
    };
    getCallOptions: () => { modelVariant: string; searchEnabled: boolean; thinkingEnabled: boolean };
    isRoleCreationActiveRef: { current: boolean };
    isMainTurnActiveRef: { current: boolean };
    activeOperationRef: { current: ActiveOperation | null };
};

function writeRoleUserMessage(value: string): void
{
    const lines = value.split("\n");
    output.write("\n");
    for (let i = 0; i < lines.length; i += 1)
    {
        const line = lines[i] ?? "";
        const prefix = i === 0 ? colors.cyan("role>") : colors.dim("....");
        output.write(`${prefix} ${line}\n`);
    }
}

export async function runRoleCreation(deps: RoleCreationDeps): Promise<void>
{
    const {
        getProvider,
        prompts,
        variableProcessor,
        skillManager,
        mcpManager,
        subAgentRunner,
        inputQueue,
        generationIndicator,
        terminalInput,
        getCallOptions,
        isRoleCreationActiveRef,
        isMainTurnActiveRef,
        activeOperationRef,
    } = deps;

    terminalInput.setMode("queue");
    terminalInput.setRenderEnabled(false);
    const abortController = new AbortController();
    activeOperationRef.current = { kind: "role-creation", abortController };
    const roleProvider = await getProvider().clone();
    let roleSaved = false;
    let confirmationGiven = false;

    const showRoleInput = (): void =>
    {
        terminalInput.setMode("active");
        terminalInput.setRenderEnabled(true);
    };

    const waitForRoleInput = async (): Promise<string | null> =>
    {
        isMainTurnActiveRef.current = false;
        showRoleInput();
        const value = await inputQueue.waitForNext();
        terminalInput.setMode("queue");
        isMainTurnActiveRef.current = true;
        if (abortController.signal.aborted) return null;
        writeRoleUserMessage(value);
        return value;
    };

    const roleAskUser: AskUserFn = async (request) =>
    {
        generationIndicator.stop();

        if (request.type === "text")
        {
            output.write(`\n${colors.cyan("?")} ${request.prompt}\n`);
            return await waitForRoleInput();
        }

        if (request.type === "confirm")
        {
            output.write(`\n${colors.cyan("?")} ${request.question}\n`);
            output.write(`${colors.dim("Введите yes/no или /back")}\n`);
            while (!abortController.signal.aborted)
            {
                const answer = await waitForRoleInput();
                if (answer === null) return null;
                const normalized = answer.trim().toLowerCase();
                if (normalized === "yes" || normalized === "y" || normalized === "да" || normalized === "д")
                {
                    confirmationGiven = true;
                    return "yes";
                }
                if (normalized === "no" || normalized === "n" || normalized === "нет" || normalized === "н")
                {
                    return "no";
                }
                output.write(`${colors.dim("Нужно ввести yes или no. Для отмены: /back")}\n`);
            }
            return null;
        }

        output.write(`\n${colors.cyan("?")} ${request.title}\n`);
        request.options.forEach((option, index) =>
        {
            output.write(`${colors.dim(String(index + 1) + ".")} ${option}\n`);
        });
        output.write(`${colors.dim("Введите номер, точное значение или /back")}\n`);
        while (!abortController.signal.aborted)
        {
            const answer = await waitForRoleInput();
            if (answer === null) return null;
            const trimmedAnswer = answer.trim();
            const selectedIndex = Number(trimmedAnswer);
            if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= request.options.length)
            {
                return request.options[selectedIndex - 1] ?? null;
            }
            const matchedOption = request.options.find((option) => option === trimmedAnswer);
            if (matchedOption) return matchedOption;
            return trimmedAnswer;
        }

        return null;
    };

    isRoleCreationActiveRef.current = true;
    terminalInput.setPromptPrefix(`${colors.cyan(">")} `);
    output.write(`\n${colors.cyan("Создание новой роли")}\n`);
    output.write(`${colors.dim("────────────────────────────────────────")}\n`);
    output.write(`${colors.dim("Отдельная сессия. Отмена: /back или Ctrl+C")}\n`);
    output.write(`${colors.dim("Команды внутри мастера отключены, кроме /back")}\n\n`);

    const roleContextManager = new ContextManager(
        prompts.roleCreatorPrompt,
        prompts.toolsPrompt,
        { maxMessages: 40 },
        variableProcessor,
    );
    const roleToolExecutor = new ToolExecutor(
        process.cwd(),
        roleAskUser,
        (skillName) =>
        {
            const skill = skillManager.getSkills().find((s) => s.name === skillName);
            return skill ? skill.body : null;
        },
        mcpManager.createDynamicToolResolver(),
        () => mcpManager.getDynamicToolNames(),
        subAgentRunner,
        (message) => generationIndicator.activate(message),
    );
    const roleLoop = new StreamingAgentLoop(() => roleProvider, roleContextManager, roleToolExecutor, {
        getCallOptions,
    });

    const savedIsMainTurnActive = isMainTurnActiveRef.current;
    isMainTurnActiveRef.current = true;
    try
    {
        let nextRoleInput = "Привет! Я хочу создать новую роль. Помоги мне с этим.";
        while (!abortController.signal.aborted && !roleSaved)
        {
            await roleLoop.runTurn(nextRoleInput, {
                signal: abortController.signal,
                onModelRequestStart: () =>
                {
                    generationIndicator.start();
                },
                onModelRequestDone: () =>
                {
                    generationIndicator.stop();
                },
                onAssistantChunk: (chunk) =>
                {
                    generationIndicator.stop();
                    output.write(renderMarkdown(chunk));
                },
                onToolStart: (toolName, toolArgs) =>
                {
                    generationIndicator.stop();
                    const detail = getToolDetail(toolName, toolArgs);
                    const suffix = detail ? ` ${colors.dim(`(${detail})`)}` : "";
                    output.write(`${colors.yellow(getToolProgressMessage(toolName))}${suffix}\n`);
                },
                onToolDone: (toolName, toolResult) =>
                {
                    generationIndicator.stop();
                    const marker = toolResult.ok ? colors.green("ok") : colors.red("not ok");
                    output.write(`${colors.dim("[tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                    if (toolResult.ok)
                    {
                        const extra = renderToolResultExtra(toolName, toolResult.data);
                        if (extra) output.write(extra);
                        if (toolName === "role.save")
                        {
                            roleSaved = true;
                        }
                    }
                    output.write("\n");
                    generationIndicator.activate("Продолжаю...");
                },
                onToolParseError: (content) =>
                {
                    generationIndicator.stop();
                    output.write(`\n${colors.red("[tool parse error]")} Не удалось распарсить вызов инструмента\n`);
                    const preview = content.slice(0, 300);
                    output.write(`${colors.dim(preview)}\n\n`);
                },
            });

            if (abortController.signal.aborted || roleSaved) break;

            if (confirmationGiven && !roleSaved)
            {
                confirmationGiven = false;
                output.write(`\n${colors.yellow("⚠")} ${colors.dim("Роль была подтверждена, но role.save не был вызван. Отправляю напоминание...")}\n\n`);
                nextRoleInput = "СИСТЕМНОЕ НАПОМИНАНИЕ: пользователь уже подтвердил создание роли (ответил 'yes' на user.confirm), но ты не вызвал инструмент role.save. Вызови role.save ПРЯМО СЕЙЧАС — без лишнего текста, без повторных вопросов. Просто вызови инструмент с готовыми данными роли.";
                continue;
            }

            const followUp = await waitForRoleInput();
            if (followUp === null) break;
            nextRoleInput = followUp;
        }
    }
    catch (error)
    {
        const message = error instanceof Error ? error.message : String(error);
        if (!abortController.signal.aborted && message !== "Создание роли прервано.")
        {
            throw error;
        }
    }
    finally
    {
        isMainTurnActiveRef.current = savedIsMainTurnActive;
        isRoleCreationActiveRef.current = false;
        generationIndicator.stop();
        if (activeOperationRef.current?.abortController === abortController)
        {
            activeOperationRef.current = null;
        }
        terminalInput.setPromptPrefix(`${colors.magenta(">")} `);
        terminalInput.setMode("active");
        terminalInput.setRenderEnabled(true);
    }
}
