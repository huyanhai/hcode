/**
 * Browser-side mirror of Pi durable's JSON AgentEvent stream.
 *
 * The runtime owns the canonical types. The client intentionally mirrors only
 * the serializable protocol here so it does not import the Node-only runtime.
 */
export type PiContentBlock = {
  type: string;
  [key: string]: unknown;
};

export type PiMessageChange =
  | { type: "text_start" | "thinking_start" | "toolcall_start"; contentIndex: number; block: PiContentBlock }
  | { type: "text_delta" | "thinking_delta"; contentIndex: number; delta: string }
  | { type: "toolcall_delta"; contentIndex: number; path: (string | number)[]; delta: string }
  | { type: "block"; contentIndex: number; block: PiContentBlock }
  | { type: "message"; message: unknown };

export type PiAgentEvent =
  | { type: "snapshot"; [key: string]: unknown }
  | { type: "run_start" | "run_end"; inputs: number[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: unknown; toolResults: unknown[] }
  | { type: "message_start"; message: unknown }
  | { type: "message_update"; usage: unknown; changes: PiMessageChange[] }
  | { type: "message_end"; entry: unknown }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown; taskId?: string }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; output?: unknown; details?: unknown; taskId?: string }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; entry?: unknown; result?: unknown; taskId?: string }
  | { type: "inbox_update"; items: unknown[] }
  | { type: "submission"; record: unknown }
  | { type: "agent_changed"; agent: unknown }
  | { type: "usage_changed"; usage: unknown }
  | { type: "task_failed"; taskId: string; kind: string; message: string }
  | { type: "compaction_start"; taskId: string; reason: string; blocking: boolean }
  | { type: "compaction_end"; taskId: string; reason: string };

export type HcodeApprovalEvent = {
  type: "hcode.approval_requested";
  approvalId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type HcodeDoneEvent = {
  type: "hcode.done";
  text: string;
  awaitingApproval: boolean;
};

export type HcodeErrorEvent = {
  type: "hcode.error";
  message: string;
};

export type PiStreamEvent =
  | PiAgentEvent
  | HcodeApprovalEvent
  | HcodeDoneEvent
  | HcodeErrorEvent;
