import { stdout as output } from "node:process";
import { colors } from "@/cli/colors";
import type { AskUserFn } from "@/tools/types";
import type { InputQueue } from "@/cli/input-queue";
import type { TerminalChoiceItem } from "@/cli/terminal-input";

export type AskUserDeps = {
    inputQueue: InputQueue;
    terminalInput: {
        choose: (title: string, items: TerminalChoiceItem[]) => Promise<string | null>;
        setMode: (mode: "active" | "queue") => void;
        setRenderEnabled: (enabled: boolean) => void;
    };
    generationIndicator: { stop: () => void };
};

export function createAskUser(deps: AskUserDeps): AskUserFn
{
    const { inputQueue, terminalInput, generationIndicator } = deps;

    return async (request) =>
    {
        generationIndicator.stop();
        terminalInput.setRenderEnabled(true);
        terminalInput.setMode("active");

        try
        {
            if (request.type === "text")
            {
                output.write(`\n${colors.cyan("?")} ${request.prompt}\n`);
                return await inputQueue.waitForNext();
            }

            if (request.type === "confirm")
            {
                return await terminalInput.choose(request.question, [
                    { value: "yes", label: "Да" },
                    { value: "no", label: "Нет" },
                ]);
            }

            if (request.type === "choice")
            {
                const items = [
                    ...request.options.map((o) => ({ value: o, label: o })),
                    { value: "__custom__", label: colors.dim("Свой вариант...") },
                ];
                const selected = await terminalInput.choose(request.title, items);
                if (selected === "__custom__")
                {
                    output.write(`\n${colors.cyan("?")} Введите свой вариант:\n`);
                    return await inputQueue.waitForNext();
                }
                return selected;
            }

            return null;
        }
        finally
        {
            terminalInput.setMode("queue");
            terminalInput.setRenderEnabled(false);
        }
    };
}
