import { executeWorkspaceCommand } from "./command-tool.js";

export function gitStatus(context: { workspaceRoot: string }) { return executeWorkspaceCommand(context, "git status --short"); }
export function gitDiff(context: { workspaceRoot: string }) { return executeWorkspaceCommand(context, "git diff --no-ext-diff --unified=3"); }
export function gitLog(context: { workspaceRoot: string }) { return executeWorkspaceCommand(context, "git log -20 --oneline"); }
