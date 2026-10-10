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
  /** Pi assistant content index used to apply tool-call argument deltas. */
  contentIndex?: number;
  approval?: {
    id: string;
    status: "pending" | "approved" | "denied";
  };
};

export type ResponseTimelineItem =
  | { id: string; type: "text"; content: string }
  | { id: string; type: "tool"; toolCall: ResponseToolCall };

export enum ToolsName {
  READ = "read",
  WRITE = "write",
  EDIT = "edit",
  BASH = "bash",
}
