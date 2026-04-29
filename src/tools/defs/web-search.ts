import type { ToolHandler } from "../types";
import { toStringValue } from "../args";

export const name = "web.search";

function stripTags(html: string): string
{
    return html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
}

function decodeUddg(href: string): string | null
{
    const match = /[?&]uddg=([^&"]+)/.exec(href);
    if (!match?.[1]) return null;
    try { return decodeURIComponent(match[1]); }
    catch { return null; }
}

interface SearchResult
{
    title: string;
    url: string;
    snippet: string;
}

function parseResults(html: string, max: number): SearchResult[]
{
    const results: SearchResult[] = [];

    const titleRe = /<a\s[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a\s[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const titles: Array<{ href: string; text: string }> = [];
    const snippets: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = titleRe.exec(html)) !== null)
    {
        if (m[1] && m[2]) titles.push({ href: m[1], text: stripTags(m[2]) });
    }

    while ((m = snippetRe.exec(html)) !== null)
    {
        if (m[1]) snippets.push(stripTags(m[1]));
    }

    for (let i = 0; i < Math.min(titles.length, max); i++)
    {
        const entry = titles[i];
        if (!entry) continue;
        const url = decodeUddg(entry.href) ?? entry.href.replace(/^\/\//, "https://");
        results.push({ title: entry.text, url, snippet: snippets[i] ?? "" });
    }

    return results;
}

export const handler: ToolHandler = async (args) =>
{
    const query = toStringValue(args.query);
    const max = typeof args.maxResults === "number" ? Math.min(Math.max(args.maxResults, 1), 10) : 5;

    if (!query)
        return { ok: false, output: "Обязательный аргумент: query", error: "Missing query" };

    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    let response: Response;
    try
    {
        response = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });
    }
    catch (err)
    {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, output: `Fetch error: ${msg}`, error: msg };
    }

    if (!response.ok)
        return { ok: false, output: `HTTP ${response.status}`, error: `HTTP ${response.status}` };

    const html = await response.text();
    const results = parseResults(html, max);

    if (results.length === 0)
        return { ok: true, output: "Результатов не найдено" };

    const output = results
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`)
        .join("\n\n");

    return { ok: true, output, data: results };
};
