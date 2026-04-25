import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "user.ask";

export const handler: ToolHandler = async (args, context) =>
{
    const question = toStringValue(args.question);
    if (!question)
    {
        throw new Error("Missing required args.question");
    }

    const answer = await context.askUser({ type: "text", prompt: question });
    if (answer === null)
    {
        return { ok: false, output: "Пользователь отменил ввод", error: "cancelled" };
    }

    return { ok: true, output: answer };
};
