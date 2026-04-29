import { colors } from "@/cli/colors";
import type { InputQueue } from "@/cli/input-queue";
import type { ActiveOperation } from "@/roles/creation";

export type SubmitHandlerDeps = {
    activeOperationRef: { current: ActiveOperation | null };
    cancelActiveOperation: () => boolean;
    inputQueue: InputQueue;
    startQueuedSidechat: (question: string) => void;
    writeDetachedOutput: (value: string) => void;
    onGoHome?: () => void;
};

function parseBtwQuestion(value: string): string | null
{
    const trimmed = value.trim();
    const match = trimmed.match(/^\/btw(?:\s+([\s\S]+))?$/i);
    if (!match) return null;
    const question = match[1]?.trim() ?? "";
    return question.length > 0 ? question : "";
}

export function createSubmitHandler(deps: SubmitHandlerDeps): (value: string) => void
{
    const { activeOperationRef, cancelActiveOperation, inputQueue, startQueuedSidechat, writeDetachedOutput } = deps;

    return (value) =>
    {
        const trimmed = value.trim().toLowerCase();

        if (trimmed === "/home")
        {
            deps.onGoHome?.();
            return;
        }

        if (activeOperationRef.current?.kind === "role-creation")
        {
            if (trimmed === "/back")
            {
                cancelActiveOperation();
                writeDetachedOutput(`\n${colors.yellow("Создание роли прервано.")}\n\n`);
                return;
            }
            if (trimmed.startsWith("/"))
            {
                writeDetachedOutput(`\n${colors.dim("Во время создания роли доступна только команда /back.")}\n\n`);
                return;
            }
        }

        if (inputQueue.hasPendingWaiter())
        {
            inputQueue.resolveWaiter(value);
            return;
        }

        if (!value) return;

        const btwQuestion = parseBtwQuestion(value);
        if (btwQuestion !== null)
        {
            if (btwQuestion.length === 0)
            {
                writeDetachedOutput("\nИспользование: /btw <вопрос>\n\n");
            }
            else
            {
                startQueuedSidechat(btwQuestion);
            }
            return;
        }

        inputQueue.enqueue(value);
    };
}
