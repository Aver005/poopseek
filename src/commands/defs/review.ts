import { writeLine } from "../io";
import type { Command, CommandsContext } from "../types";
import type { ReviewScope } from "@/cli/review";

const USAGE = [
    "",
    "Использование: /review [scope]",
    "",
    "  /review              — все текущие изменения (staged + unstaged)",
    "  /review staged       — только staged (подготовлены к коммиту)",
    "  /review branch       — вся ветка относительно main",
    "  /review branch <ref> — вся ветка относительно указанной ветки/коммита",
    "  /review commit <ref> — конкретный коммит (SHA или HEAD~1 и т.п.)",
    "  /review file <path>  — конкретный файл",
    "",
].join("\n");

function parseScope(args: string[]): ReviewScope | null
{
    const sub = args[0]?.toLowerCase();

    if (!sub || sub === "all")
    {
        return { kind: "all" };
    }

    if (sub === "staged" || sub === "stage" || sub === "index")
    {
        return { kind: "staged" };
    }

    if (sub === "branch")
    {
        const base = args[1] ?? "main";
        return { kind: "branch", base };
    }

    if (sub === "commit" || sub === "show")
    {
        const ref = args[1] ?? "HEAD";
        return { kind: "commit", ref };
    }

    if (sub === "file" || sub === "f")
    {
        const path = args.slice(1).join(" ");
        if (!path)
        {
            return null;
        }
        return { kind: "file", path };
    }

    // If first arg looks like a file path (has extension or path separator), treat it as file
    if (args[0] && (args[0].includes(".") || args[0].includes("/") || args[0].includes("\\")))
    {
        return { kind: "file", path: args.join(" ") };
    }

    // Anything else treat as branch base
    return { kind: "branch", base: args[0] ?? "main" };
}

export function createReviewCommand(context: CommandsContext): Command
{
    return {
        name: "/review",
        description: "Ревью кода: [staged | branch [ref] | commit <ref> | file <path>]",
        execute: async (args) =>
        {
            if (!context.runReview)
            {
                writeLine("");
                writeLine("Ревью недоступно");
                writeLine("");
                return true;
            }

            if (args[0] === "--help" || args[0] === "help" || args[0] === "-h")
            {
                writeLine(USAGE);
                return true;
            }

            const scope = parseScope(args);
            if (!scope)
            {
                writeLine(USAGE);
                return true;
            }

            await context.runReview(scope);
            return true;
        },
    };
}
