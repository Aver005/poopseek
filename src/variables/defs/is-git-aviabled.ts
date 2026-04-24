import fs from "node:fs";
import path from "node:path";
import type { VariableModule } from "../types";

function resolveGitStatus(workspaceRoot: string): string
{
    const gitPath = path.resolve(workspaceRoot, ".git");
    return fs.existsSync(gitPath) ? "true" : "false";
}

export const isGitAviabledVariable: VariableModule = {
    key: "is_git_aviabled",
    resolve: (context) => resolveGitStatus(context.workspaceRoot),
};

export const isGitAvailableVariable: VariableModule = {
    key: "is_git_available",
    resolve: (context) => resolveGitStatus(context.workspaceRoot),
};
