import type { ToolHandler } from "./types";
import { handler as webSearchHandler, name as webSearchName } from "./defs/web-search";
import { handler as webFetchHandler, name as webFetchName } from "./defs/web-fetch";

export const webToolsRegistry: Record<string, ToolHandler> = {
    [webSearchName]: webSearchHandler,
    [webFetchName]: webFetchHandler,
};

export const webToolNames: string[] = Object.keys(webToolsRegistry);

export const WEB_TOOLS_PROMPT = `\
Тебе доступны инструменты для поиска в интернете:

- Найти информацию в интернете (возвращает список результатов с заголовками, URL и описаниями):
\`\`\`json
{
  "tool": "web.search",
  "args": {
    "query": "текст запроса",
    "maxResults": 5
  }
}
\`\`\`

- Загрузить страницу и вернуть её текстовое содержимое:
\`\`\`json
{
  "tool": "web.fetch",
  "args": {
    "url": "https://example.com"
  }
}
\`\`\`

Стратегия: сначала \`web.search\` чтобы найти нужные URL, затем \`web.fetch\` для чтения полного содержимого.`;
