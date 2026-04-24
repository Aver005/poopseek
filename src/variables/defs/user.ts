import type { VariableModule } from "./types";

function resolveUserName(): string
{
    return (
        process.env.POOPSEEK_USER ??
        process.env.USERNAME ??
        process.env.USER ??
        "unknown"
    );
}

export const userVariable: VariableModule = {
    key: "user",
    resolve: () => resolveUserName(),
};
