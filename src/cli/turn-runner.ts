import { stdout as output } from "node:process";
import { colors } from "@/cli/colors";
import { renderMarkdown } from "@/cli/markdown";
import { getToolDetail, getToolProgressMessage, renderToolResultExtra } from "@/cli/tool-progress-messages";
import { handleCommand } from "@/commands";
import { prepareInputWithFileMentions, getFileAttachmentPreviewLines } from "@/cli/file-mentions";
import type StreamingAgentLoop from "@/agent/streaming-loop";
import type { InputQueue } from "@/cli/input-queue";
import type { Command } from "@/commands/types";

export type MainLoopDeps = {
    inputQueue: InputQueue;
    terminalInput: {
        setMode: (mode: "active" | "queue") => void;
        setRenderEnabled: (enabled: boolean) => void;
        close: () => void;
    };
    agentLoop: StreamingAgentLoop;
    saveCurrentLocalSession: () => Promise<void>;
    isMainTurnActiveRef: { current: boolean };
    activeInterruptCommandRef: { current: ((error: Error) => void) | null };
    commands: Map<string, Command>;
    generationIndicator: {
        start: () => void;
        stop: () => void;
        resume: () => void;
        activate: (message: string) => void;
    };
    writeUserMessage: (value: string) => void;
    pendingSidechatTasks: Set<Promise<void>>;
};

export async function runMainLoop(deps: MainLoopDeps): Promise<void>
{
    const {
        inputQueue,
        terminalInput,
        agentLoop,
        saveCurrentLocalSession,
        isMainTurnActiveRef,
        activeInterruptCommandRef,
        commands,
        generationIndicator,
        writeUserMessage,
        pendingSidechatTasks,
    } = deps;

    try
    {
        while (true)
        {
            terminalInput.setMode("active");

            const userInput = await inputQueue.waitForNext();
            if (!userInput) continue;

            if (userInput.startsWith("/"))
            {
                terminalInput.setMode("active");
                terminalInput.setRenderEnabled(true);
            }

            const shouldContinue = await (async (): Promise<boolean> =>
            {
                let settled = false;
                const interruptPromise = new Promise<never>((_, reject) =>
                {
                    activeInterruptCommandRef.current = (error: Error) =>
                    {
                        if (settled) return;
                        settled = true;
                        reject(error);
                    };
                });
                try
                {
                    const commandPromise = handleCommand(userInput, commands).then((value) =>
                    {
                        settled = true;
                        return value;
                    });
                    return await Promise.race([commandPromise, interruptPromise]);
                }
                catch (error)
                {
                    const message = error instanceof Error ? error.message : String(error);
                    output.write(`\n${colors.red(message)}\n\n`);
                    return true;
                }
                finally
                {
                    activeInterruptCommandRef.current = null;
                }
            })();

            if (!shouldContinue) break;
            if (userInput.startsWith("/"))
            {
                terminalInput.setRenderEnabled(true);
                continue;
            }

            const preparedInput = await prepareInputWithFileMentions(userInput, process.cwd());
            const attachmentPreviewLines = getFileAttachmentPreviewLines(preparedInput.attachments);
            terminalInput.setMode("queue");
            terminalInput.setRenderEnabled(false);
            writeUserMessage(userInput);
            if (attachmentPreviewLines.length > 0)
            {
                output.write(`${attachmentPreviewLines.join("\n")}\n`);
            }

            let wroteAnyChunk = false;
            let hadToolInThisTurn = false;
            isMainTurnActiveRef.current = true;
            try
            {
                await agentLoop.runTurn(preparedInput.content, {
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
                        if (!wroteAnyChunk)
                        {
                            if (hadToolInThisTurn)
                            {
                                output.write("\n" + colors.dim("─".repeat(48)) + "\n");
                            }
                            else
                            {
                                output.write("\n");
                            }
                            wroteAnyChunk = true;
                        }
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
                        hadToolInThisTurn = true;
                        wroteAnyChunk = false;
                        const marker = toolResult.ok ? colors.green("ok") : colors.red("not ok");
                        output.write(`${colors.dim("[tool]")} ${colors.cyan(toolName)} ${marker}\n`);
                        if (toolResult.ok)
                        {
                            const extra = renderToolResultExtra(toolName, toolResult.data);
                            if (extra) output.write(extra);
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
                await saveCurrentLocalSession();
            }
            finally
            {
                isMainTurnActiveRef.current = false;
            }

            output.write("\n\n");

            generationIndicator.resume();
            terminalInput.setMode("active");

            if (inputQueue.length > 0)
            {
                output.write(colors.dim(`Очередь (${inputQueue.length}):\n`));
                for (let i = 0; i < inputQueue.length; i++)
                {
                    const item = inputQueue.itemAt(i) ?? "";
                    const firstLine = item.split("\n")[0] ?? item;
                    const preview = firstLine.length > 100
                        ? `${firstLine.slice(0, 100)}…`
                        : firstLine;
                    output.write(colors.dim(`  ${i + 1}. ${preview}\n`));
                }
                output.write("\n");
            }

            terminalInput.setRenderEnabled(true);
        }
    }
    finally
    {
        await Promise.allSettled(Array.from(pendingSidechatTasks));
        terminalInput.close();
        generationIndicator.stop();
    }
}
