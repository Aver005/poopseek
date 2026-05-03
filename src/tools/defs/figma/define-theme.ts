import type { ToolHandler } from "@/tools/types";
import { createEnsureThemeVariablesOp, setActiveTheme, type ThemeTokenDefinition } from "@/figma/engine/theme/theme-state";

export const name = "figma_define_theme";

function isRecord(value: unknown): value is Record<string, unknown>
{
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectTokens(args: Record<string, unknown>): ThemeTokenDefinition[]
{
    if (Array.isArray(args.tokens))
    {
        return args.tokens
            .filter(isRecord)
            .map((token) => ({
                token: String(token.token ?? "").trim(),
                hex: String(token.hex ?? "").trim(),
                description: typeof token.description === "string" ? token.description.trim() : undefined,
            }))
            .filter((token) => token.token.length > 0 && token.hex.length > 0);
    }

    if (isRecord(args.palette))
    {
        return Object.entries(args.palette)
            .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
            .map(([token, hex]) => ({
                token,
                hex: String(hex).trim(),
            }));
    }

    return [];
}

export const handler: ToolHandler = async (args) =>
{
    const tokens = collectTokens(args);
    if (tokens.length === 0)
    {
        return {
            ok: false,
            output: "figma_define_theme requires args.tokens[] or args.palette with at least one color token",
        };
    }

    setActiveTheme({
        name: typeof args.name === "string" ? args.name : "custom",
        tokens,
    });

    const op = createEnsureThemeVariablesOp();

    return {
        ok: true,
        output: `Prepared ${op.tokens.length} theme variables for "${op.themeName}"`,
        data: [op],
    };
};

