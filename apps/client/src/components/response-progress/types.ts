export type ResponseStreamStatus =
  | "thinking"
  | "streaming"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "stopped";

export type ResponseToolCall = {
  id: string;
  toolName: string;
  status: "in-progress" | "completed" | "failed";
  input?: unknown;
  rawArguments?: string;
  output?: unknown;
  contentOffset?: number;
  approval?: {
    id: string;
    status: "pending" | "approved" | "denied";
  };
};

export enum ToolsName {
  LIST_FILE = "listFiles",
  READ_FILE = "readFile",
  WRITE_FILE = "writeFile",
  SEARCH_FILES = "searchFiles",
  EXEC_COMMAND = "execCommand",
  APPLY_PATCH = "applyPatch",
  GIT_STATUS = "gitStatus",
  GIT_DIFF = "gitDiff",
  GIT_LOG = "gitLog",
}
