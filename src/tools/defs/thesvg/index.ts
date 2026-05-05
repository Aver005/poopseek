import type { ToolHandler } from "@/tools/types";
import { ensureCache, type TheSvgIcon } from "./cache";

export const name = "thesvg.search";

const CDN = "https://thesvg.org/icons";

function scoreIcon(icon: TheSvgIcon, q: string): number
{
    const lq = q.toLowerCase();
    const lt = icon.title.toLowerCase();
    const ls = icon.slug.toLowerCase();

    if (ls === lq || lt === lq) return 100;
    if (icon.aliases.some(a => a.toLowerCase() === lq)) return 90;
    if (ls.startsWith(lq) || lt.startsWith(lq)) return 80;
    if (icon.aliases.some(a => a.toLowerCase().startsWith(lq))) return 70;
    if (ls.includes(lq) || lt.includes(lq)) return 50;
    if (icon.aliases.some(a => a.toLowerCase().includes(lq))) return 40;
    return 0;
}

export const handler: ToolHandler = async (args) =>
{
    const query = String(args.query ?? "").trim();
    const limit = typeof args.limit === "number" ? Math.min(Math.max(args.limit, 1), 20) : 5;

    if (!query)
        return { ok: false, output: "Обязательный аргумент: query", error: "Missing query" };

    let icons: TheSvgIcon[];
    try { icons = await ensureCache(); }
    catch (err)
    {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, output: `Ошибка загрузки индекса theSVG: ${msg}`, error: msg };
    }

    const scored = icons
        .map(icon => ({ icon, score: scoreIcon(icon, query) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    if (scored.length === 0)
        return { ok: true, output: `Иконки по запросу "${query}" не найдены` };

    const lines = scored.map(({ icon }) =>
    {
        const variantLines = icon.variants
            .map(v => `  ${v}: ${CDN}/${icon.slug}/${v}.svg`)
            .join("\n");
        return `${icon.slug} — ${icon.title}${icon.hex ? ` (${icon.hex})` : ""}\n${variantLines}`;
    });

    return {
        ok: true,
        output: lines.join("\n\n"),
        data: scored.map(({ icon }) => ({
            ...icon,
            urls: Object.fromEntries(icon.variants.map(v => [v, `${CDN}/${icon.slug}/${v}.svg`])),
        })),
    };
};
