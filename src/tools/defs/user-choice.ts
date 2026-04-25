import { toStringValue } from "../args";
import type { ToolHandler } from "../types";

export const name = "user.choice";

export const handler: ToolHandler = async (args, context) =>
{
    const title = toStringValue(args.title) ?? "Выберите вариант";
    const rawOptions = args.options;

    if (!Array.isArray(rawOptions) || rawOptions.length === 0)
    {
        throw new Error("Missing or empty args.options array");
    }

    const options = rawOptions.map((o) => String(o));
    const answer = await context.askUser({ type: "choice", title, options });

    if (answer === null)
    {
        return { ok: false, output: "Пользователь отменил выбор", error: "cancelled" };
    }

    return { ok: true, output: answer };
};
