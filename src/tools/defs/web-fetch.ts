import type { ToolHandler } from "../types";
import { toStringValue } from "../args";

export const name = "web.fetch";

const MAX_CHARS = 15_000;

function extractText(html: string): string
{
    let text = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<head[\s\S]*?<\/head>/gi, "")
        .replace(/<(p|div|h[1-6]|li|tr|section|article|header|footer|nav|main)[^>]*>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "");

    text = text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        .replace(/&#\d+;/g, " ");

    text = text
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n\n[...truncated]" : text;
}

export const handler: ToolHandler = async (args) =>
{
    const url = toStringValue(args.url);
    if (!url)
        return { ok: false, output: "Обязательный аргумент: url", error: "Missing url" };

    let response: Response;
    try
    {
        response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
                "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            },
            redirect: "follow",
        });
    }
    catch (err)
    {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, output: `Fetch error: ${msg}`, error: msg };
    }

    if (!response.ok)
        return { ok: false, output: `HTTP ${response.status}`, error: `HTTP ${response.status}` };

    const contentType = response.headers.get("content-type") ?? "";
    const isText = contentType.includes("text/html")
        || contentType.includes("text/plain")
        || contentType.includes("application/xhtml");

    if (!isText)
        return { ok: false, output: `Unsupported content-type: ${contentType}`, error: "Unsupported content-type" };

    const html = await response.text();
    const text = extractText(html);

    return {
        ok: true,
        output: text.length > 0 ? text : "Страница пустая или нечитаемая",
    };
};
