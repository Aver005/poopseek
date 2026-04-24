import type { VariableModule } from "../types";

export const folderVariable: VariableModule = {
    key: "folder",
    resolve: (context) => context.workspaceRoot,
};
