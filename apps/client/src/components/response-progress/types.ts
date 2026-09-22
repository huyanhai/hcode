export type ResponseStreamStatus =
  | "thinking"
  | "streaming"
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
};
