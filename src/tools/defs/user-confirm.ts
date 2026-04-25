import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "user.confirm";

export const handler: ToolHandler = async (args, context) =>
{
    const question = toStringValue(args.question);
    if (!question)
    {
        throw new Error("Missing required args.question");
    }

    const answer = await context.askUser({ type: "confirm", question });
    if (answer === null)
    {
        return { ok: false, output: "Пользователь отменил", error: "cancelled" };
    }

    return { ok: true, output: answer, data: { confirmed: answer === "yes" } };
};
