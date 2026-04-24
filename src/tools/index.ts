import type { ToolHandler } from "./types";

import { handler as bashHandler, name as bashName } from "./defs/bash";
import { handler as fileEditHandler, name as fileEditName } from "./defs/file-edit";
import { handler as fileListHandler, name as fileListName } from "./defs/file-list";
import { handler as fileReadHandler, name as fileReadName } from "./defs/file-read";
import { handler as fileRemoveHandler, name as fileRemoveName } from "./defs/file-remove";
import { handler as fileWriteHandler, name as fileWriteName } from "./defs/file-write";
import {
    handler as powershellHandler,
    name as powershellName,
} from "./defs/powershell";
import { handler as toolsListHandler, name as toolsListName } from "./defs/tools-list";

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
