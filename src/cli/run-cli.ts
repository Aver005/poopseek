import fs from "node:fs";
import path from "node:path";
import { emitKeypressEvents } from "node:readline";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import ContextManager from "@/agent/context-manager";
import AgentLoop from "@/agent/loop";
import ToolExecutor from "@/agent/tool-executor";
import { createHintsRenderer } from "@/cli/command-hints";
import { colors, getColorMode, setTheme } from "@/cli/colors";
import { getToolProgressMessage } from "@/cli/tool-progress-messages";
import {
    createCommandCompleter,
    createCommandHandlers,
    handleCommand,
} from "@/commands";
import type { Command } from "@/commands/types";
import DeepseekClient from "@/deepseek-client/client/DeepseekClient";
import { createVariableProcessor } from "@/variables";

function getRequiredEnv(name: string): string
{
    const value = process.env[name];
    if (!value || value.trim().length === 0)
    {
        throw new Error(`Missing required env variable: ${name}`);
    }
    return value.trim();
}

async function readPromptFiles(): Promise<{ basePrompt: string; toolsPrompt: string }>
{
    const cwd = process.cwd();
    const basePromptPath = path.resolve(cwd, "assets/prompts/base.prompt.md");
    const toolsPromptPath = path.resolve(cwd, "docs/tools/tool.base.md");

    const [basePrompt, toolsPrompt] = await Promise.all([
        fs.promises.readFile(basePromptPath, "utf8"),
        fs.promises.readFile(toolsPromptPath, "utf8"),
    ]);

    return {
        basePrompt,
        toolsPrompt,
    };
}

export async function runCli(): Promise<void>
{
    const token = getRequiredEnv("DEEPSEEK_TOKEN");
    const deepseekClient = new DeepseekClient(token);

    await deepseekClient.initialize();
    const session = await deepseekClient.createSession();

    const prompts = await readPromptFiles();
    const variableProcessor = createVariableProcessor({
        workspaceRoot: process.cwd(),
    });
    const contextManager = new ContextManager(
        prompts.basePrompt,
        prompts.toolsPrompt,
        { maxMessages: 40 },
        variableProcessor,
    );
    const toolExecutor = new ToolExecutor(process.cwd());
    const agentLoop = new AgentLoop(
        deepseekClient,
        session,
        contextManager,
        toolExecutor,
        { maxStepsPerTurn: 12 },
    );

    let commands = new Map<string, Command>();
    const rl = readline.createInterface({
        input,
        output,
        completer: createCommandCompleter(() => commands),
    });
    const hintsRenderer = createHintsRenderer(output);

    commands = createCommandHandlers(rl, {
        getSessionInfo: () => `Session ID: ${session.getId()}`,
        getContextStats: () => `Messages in context: ${contextManager.getMessageCount()}`,
        clearHistory: () => contextManager.clearHistory(),
        getTheme: () => getColorMode().theme,
        setTheme: (theme) => setTheme(theme),
    });
    emitKeypressEvents(input);
    const onKeypress = (): void =>
    {
        hintsRenderer.render(rl.line, commands);
    };
    input.on("keypress", onKeypress);

    output.write(`${colors.green("PoopSeek CLI запущен.")} Введите /help для списка команд.\n`);
    const colorMode = getColorMode();
    output.write(
        `${colors.dim(`Цвета: ${colorMode.enabled ? "on" : "off"}, тема: ${colorMode.theme}`)}\n`,
    );

    try
    {
        while (true)
        {
            const userInput = (await rl.question(`${colors.magenta(">")} `)).trim();
            hintsRenderer.clear();
            if (userInput.length === 0) continue;
            
            // Handle commands
            const shouldContinue = await handleCommand(userInput, commands);
            if (!shouldContinue) break;
            
            // If it was a command, skip agent processing
            if (userInput.startsWith("/")) continue;

            let wroteAnyChunk = false;
            const result = await agentLoop.runTurn(userInput, {
                onAssistantChunk: (chunk) =>
                {
                    if (!wroteAnyChunk)
                    {
                        output.write("\n");
                        wroteAnyChunk = true;
                    }

                    output.write(chunk);
                },
                onToolStart: (toolName) =>
                {
                    output.write(`\n${colors.yellow(getToolProgressMessage(toolName))}\n`);
                },
                onToolDone: (toolName, toolResult) =>
                {
                    const marker = toolResult.ok ? colors.green("ok=true") : colors.red("ok=false");
                    output.write(`${colors.dim("[tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                },
            });

            if (!wroteAnyChunk && result.assistantText.length > 0)
            {
                output.write(`\n${result.assistantText}`);
            }
            output.write("\n\n");
        }
    }
    finally
    {
        input.off("keypress", onKeypress);
        rl.close();
    }
}
