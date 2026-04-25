import type { VariableModule } from "../types";

export const osVariable: VariableModule = {
    key: "os",
    resolve: () =>
    {
        switch (process.platform)
        {
            case "win32": return "Windows";
            case "darwin": return "macOS";
            case "linux": return "Linux";
            default: return process.platform;
        }
    },
};
