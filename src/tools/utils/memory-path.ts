import os from "node:os";
import path from "node:path";

export function getMemoriesBaseDir(): string
{
    return path.join(os.homedir(), ".poopseek", "memories");
}

export function sanitizeWorkspaceToFolderName(workspaceRoot: string): string
{
    return workspaceRoot
        .replace(/[^a-zA-Z0-9]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_+|_+$/g, "")
        || "default";
}

export function getProjectMemoriesDir(workspaceRoot: string): string
{
    const folderName = sanitizeWorkspaceToFolderName(path.resolve(workspaceRoot));
    return path.join(getMemoriesBaseDir(), folderName);
}

export function sanitizeMemoryFileName(name: string): string
{
    const base = path.basename(name).replace(/[^a-zA-Z0-9_.\-]/g, "_");
    return base.endsWith(".md") ? base : `${base}.md`;
}
