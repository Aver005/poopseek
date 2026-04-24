import { handler as bashHandler, name as bashName } from "./bash";
import { handler as fileEditHandler, name as fileEditName } from "./file-edit";
import { handler as fileListHandler, name as fileListName } from "./file-list";
import { handler as fileReadHandler, name as fileReadName } from "./file-read";
import { handler as fileRemoveHandler, name as fileRemoveName } from "./file-remove";
import { handler as fileWriteHandler, name as fileWriteName } from "./file-write";
import {
    handler as powershellHandler,
    name as powershellName,
} from "./powershell";
import { handler as toolsListHandler, name as toolsListName } from "./tools-list";
import type { ToolHandler } from "./types";

export const toolsRegistry: Record<string, ToolHandler> = {
    [toolsListName]: toolsListHandler,
    [bashName]: bashHandler,
    [powershellName]: powershellHandler,
    [fileListName]: fileListHandler,
    [fileReadName]: fileReadHandler,
    [fileWriteName]: fileWriteHandler,
    [fileEditName]: fileEditHandler,
    [fileRemoveName]: fileRemoveHandler,
};

export function getToolNames(): string[]
{
    return Object.keys(toolsRegistry);
}
