/** Public, Pi-independent shapes consumed by the Nest HTTP adapter. */
export type PiPersistence = "durable" | "memory";
export type PiAttachment = {
  id: string;
  url: string;
  name: string;
  mimeType: string;
  size: number;
};
export type PiComment = {
  id: string;
  content: string;
  selectedText?: string;
  messageId?: string;
  startOffset?: number;
  endOffset?: number;
};
export type PiProfile = {
  id: string;
  name: string;
  model: string;
  requestType: "chat" | "response";
  baseUrl: string;
  apiKey: string;
};
export type PiSession = {
  id: string;
  workspaceId: string | null;
  title: string;
  status: string;
  persistence: PiPersistence;
  createdAt: string;
  updatedAt: string;
};
export type PiToolCall = {
  id: string;
  toolName: string;
  status: "in-progress" | "completed" | "failed";
  input?: unknown;
  output?: unknown;
  contentOffset?: number;
  approval?: { id: string; status: "pending" | "approved" | "denied" };
};
export type PiMessage = {
  id: string;
  sessionId: string;
  turnId: string | null;
  role: string;
  content: string;
  attachments?: PiAttachment[];
  comments?: PiComment[];
  sequence: number;
  createdAt: string;
  toolCalls?: PiToolCall[];
  streamStatus?: "completed" | "failed" | "awaiting-approval";
  startedAt?: string;
  completedAt?: string;
};
export type PiDetail = { session: PiSession; messages: PiMessage[] };
