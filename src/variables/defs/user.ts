import type { VariableModule } from "../types";

function resolveUserName(configuredName?: string | null): string
{
    if (configuredName) return configuredName;
    return (
        process.env.POOPSEEK_USER ??
        process.env.USERNAME ??
        process.env.USER ??
        "unknown"
    );
}

export const userVariable: VariableModule = {
    key: "user",
    resolve: (context) => resolveUserName(context.userName),
};
