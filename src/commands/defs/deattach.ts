import { writeLine } from "@/commands/io";
import type { Command, CommandsContext } from "@/commands/types";

function parseIndices(spec: string, count: number): number[] | null
{
    const s = spec.trim().toLowerCase();

    if (s === "all") return Array.from({ length: count }, (_, i) => i);

    if (/^-\d+$/.test(s))
    {
        const fromEnd = parseInt(s, 10);
        const idx = count + fromEnd;
        return idx >= 0 && idx < count ? [idx] : null;
    }

    if (/^\d+-\d+$/.test(s))
    {
        const [a, b] = s.split("-").map(Number);
        const lo = Math.min(a!, b!) - 1;
        const hi = Math.max(a!, b!) - 1;
        if (lo < 0 || hi >= count) return null;
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }

    if (/^[\d,]+$/.test(s))
    {
        const nums = s.split(",").map((n) => parseInt(n, 10) - 1);
        if (nums.some((n) => n < 0 || n >= count)) return null;
        return nums;
    }

    return null;
}

export function createDeattachCommand(context: CommandsContext): Command
{
    return {
        name: "/deattach",
        description: "Открепить файл(ы): /deattach 1  /deattach 1-3  /deattach 1,3  /deattach -1  /deattach all",
        execute: (args) =>
        {
            const spec = args.join(" ").trim();
            const files = context.getPendingFiles?.() ?? [];

            writeLine("");

            if (files.length === 0)
            {
                writeLine("Нет прикреплённых файлов.");
                writeLine("");
                return true;
            }

            if (!spec)
            {
                writeLine("Укажите файл(ы): /deattach 1  |  1-3  |  1,3  |  -1  |  all");
                writeLine("");
                return true;
            }

            const indices = parseIndices(spec, files.length);
            if (!indices)
            {
                writeLine(`Неверный формат или индекс вне диапазона (1–${files.length}): ${spec}`);
                writeLine("");
                return true;
            }

            const removed = indices.map((i) => files[i]!.name);
            context.removePendingFiles?.(indices);

            if (removed.length === 1)
            {
                writeLine(`Откреплён: ${removed[0]}`);
            }
            else
            {
                writeLine(`Откреплено ${removed.length} файл(ов):`);
                removed.forEach((name) => writeLine(`  ${name}`));
            }

            writeLine("");
            return true;
        },
    };
}
