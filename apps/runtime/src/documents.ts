import { defineDoc, type ConversationId } from "@earendil-works/pi-durable";
import type { PiAttachment, PiComment, PiPersistence } from "./types.js";

export type SessionData = {
  title: string;
  workspaceId: string | null;
  workspacePath: string;
  folders: string[];
  status: string;
  createdAt: number;
  updatedAt: number;
  persistence: PiPersistence;
  fullAccess: boolean;
};
export type MessageData = {
  content: string;
  attachments: PiAttachment[];
  comments: PiComment[];
};
export type ApprovalData = {
  callId: string;
  toolName: string;
  input: string;
  status: "pending" | "approved" | "denied";
};

/** Session-scoped index is needed because Harness intentionally exposes conversations by ID, not a scan API. */
export const SessionIndexDoc = defineDoc<{ ids: number[] }>({
  kind: "hcode.session-index",
  version: 1,
  scope: "session",
  initial: () => ({ ids: [] }),
});
export const SessionDoc = defineDoc<SessionData>({
  kind: "hcode.session",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({
    title: "新会话",
    workspaceId: null,
    workspacePath: "",
    folders: [],
    status: "active",
    createdAt: 0,
    updatedAt: 0,
    persistence: "durable",
    fullAccess: false,
  }),
});
/** Submission IDs survive queuing and restart; metadata is keyed by them, not transient UI message IDs. */
export const MessageDoc = defineDoc<{
  bySubmission: Record<string, MessageData>;
}>({
  kind: "hcode.messages",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ bySubmission: {} }),
});
export const ApprovalDoc = defineDoc<{ byTask: Record<string, ApprovalData> }>({
  kind: "hcode.approvals",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ byTask: {} }),
});

/** Permission belongs to an input, not to the latest toggle on a busy conversation. */
export const PermissionDoc = defineDoc<{ bySubmission: Record<string, boolean> }>({
  kind: "hcode.permissions",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ bySubmission: {} }),
});

export const asId = (kind: PiPersistence, id: number) =>
  `${kind === "durable" ? "d" : "m"}:${id}`;
export function parseId(value: string): {
  kind: PiPersistence;
  id: ConversationId;
} {
  const match = /^(d|m):(\d+)$/.exec(value);
  if (!match) throw new Error("会话不存在");
  return {
    kind: match[1] === "d" ? "durable" : "memory",
    id: Number(match[2]) as ConversationId,
  };
}
export const pause = (ms: number) =>
  new Promise<void>((done) => setTimeout(done, ms));
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  return Array.isArray(content)
    ? content
        .map((part) => (part?.type === "text" ? String(part.text) : ""))
        .join("")
    : "";
}
