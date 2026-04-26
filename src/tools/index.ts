import type { ToolHandler } from "./types";

import { handler as bashHandler, name as bashName } from "./defs/bash";
import { handler as todoWriteHandler, name as todoWriteName } from "./defs/todo-write";
import { handler as todoReadHandler, name as todoReadName } from "./defs/todo-read";
import { handler as fileEditHandler, name as fileEditName } from "./defs/file-edit";
import { handler as fileFindHandler, name as fileFindName } from "./defs/file-find";
import { handler as fileListHandler, name as fileListName } from "./defs/file-list";
import { handler as fileReadHandler, name as fileReadName } from "./defs/file-read";
import { handler as fileRemoveHandler, name as fileRemoveName } from "./defs/file-remove";
import { handler as fileWriteHandler, name as fileWriteName } from "./defs/file-write";
import { handler as gitHandler, name as gitName } from "./defs/git";
import { handler as gitEditHandler, name as gitEditName } from "./defs/git-edit";
import { handler as memoryListHandler, name as memoryListName } from "./defs/memory-list";
import { handler as memoryReadHandler, name as memoryReadName } from "./defs/memory-read";
import { handler as memorySaveHandler, name as memorySaveName } from "./defs/memory-save";
import {
    handler as powershellHandler,
    name as powershellName,
} from "./defs/powershell";
import { handler as toolsListHandler, name as toolsListName } from "./defs/tools-list";
import { handler as userAskHandler, name as userAskName } from "./defs/user-ask";
import { handler as userChoiceHandler, name as userChoiceName } from "./defs/user-choice";
import { handler as userConfirmHandler, name as userConfirmName } from "./defs/user-confirm";
import { handler as skillReadHandler, name as skillReadName } from "./defs/skill-read";

export const toolsRegistry: Record<string, ToolHandler> = {
    [toolsListName]: toolsListHandler,
    [todoWriteName]: todoWriteHandler,
    [todoReadName]: todoReadHandler,
    [bashName]: bashHandler,
    [powershellName]: powershellHandler,
    [fileFindName]: fileFindHandler,
    [fileListName]: fileListHandler,
    [fileReadName]: fileReadHandler,
    [fileWriteName]: fileWriteHandler,
    [fileEditName]: fileEditHandler,
    [fileRemoveName]: fileRemoveHandler,
    [gitName]: gitHandler,
    [gitEditName]: gitEditHandler,
    [memorySaveName]: memorySaveHandler,
    [memoryReadName]: memoryReadHandler,
    [memoryListName]: memoryListHandler,
    [userAskName]: userAskHandler,
    [userChoiceName]: userChoiceHandler,
    [userConfirmName]: userConfirmHandler,
    [skillReadName]: skillReadHandler,
};

export function getToolNames(): string[]
{
    return Object.keys(toolsRegistry);
}
