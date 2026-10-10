import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  AssistantEntry,
  UserEntry,
  type Conversation,
  type Harness,
  type SubmissionId,
} from "@earendil-works/pi-durable";
import {
  ApprovalDoc,
  MessageDoc,
  messageText,
  type MessageData,
} from "./documents.js";
import type { PiDetail, PiMessage, PiSession, PiToolCall } from "./types.js";

/** Derive HTTP messages from Pi entries. Only hcode-specific attachment/comment metadata is stored separately. */
export async function projectConversation(
  value: string,
  summary: PiSession,
  harness: Harness,
  conversation: Conversation,
): Promise<PiDetail> {
  const id = conversation.id;
  const meta = await harness.snapshot(MessageDoc, id, BACKGROUND_CONTEXT);
  const approvals = await harness.snapshot(ApprovalDoc, id, BACKGROUND_CONTEXT);
  const metaByEntry = new Map<number, MessageData>();
  for (const [submissionId, data] of Object.entries(meta?.bySubmission ?? {})) {
    const submission = await harness.submission(
      Number(submissionId) as SubmissionId,
      BACKGROUND_CONTEXT,
    );
    const record = await submission?.status(BACKGROUND_CONTEXT);
    if (record?.type === "input" && record.entry !== undefined)
      metaByEntry.set(record.entry, data);
  }
  const messages: PiMessage[] = [];
  const hidden = new Set<number>();
  let cursor: Parameters<Conversation["entries"]>[2];
  do {
    const page = await conversation.entries(
      { order: "ascending" },
      100,
      cursor,
      BACKGROUND_CONTEXT,
    );
    for (const entry of page.items) {
      if (
        entry.kind === "hcode.edit" &&
        entry.data &&
        typeof entry.data === "object" &&
        "hidden" in entry.data &&
        Array.isArray(entry.data.hidden)
      ) {
        for (const target of entry.data.hidden)
          if (typeof target === "number") hidden.add(target);
        continue;
      }
      const raw = entry.model?.[0];
      if (UserEntry.is(entry) && raw?.role === "user") {
        const stored = metaByEntry.get(entry.id);
        messages.push({
          id: String(entry.id),
          sessionId: value,
          turnId: null,
          role: "user",
          content: stored?.content ?? messageText(raw.content),
          ...(stored?.attachments.length
            ? { attachments: stored.attachments }
            : {}),
          ...(stored?.comments.length ? { comments: stored.comments } : {}),
          sequence: messages.length + 1,
          createdAt: String(raw.timestamp),
        });
      } else if (AssistantEntry.is(entry) && raw?.role === "assistant") {
        const calls: PiToolCall[] = raw.content
          .filter((part) => part.type === "toolCall")
          .map((part) => ({
            id: part.id,
            toolName: part.name,
            input: part.arguments,
            status: "in-progress",
          }));
        for (const call of calls) {
          const approval = Object.values(approvals?.byTask ?? {}).find(
            (item) => item.callId === call.id,
          );
          if (approval)
            call.approval = { id: approval.callId, status: approval.status };
        }
        const current: PiMessage = {
          id: String(entry.id),
          sessionId: value,
          turnId: null,
          role: "assistant",
          content: messageText(raw.content),
          sequence: messages.length + 1,
          createdAt: String(raw.timestamp),
          ...(calls.length ? { toolCalls: calls } : {}),
          streamStatus: calls.some(
            (call) => call.approval?.status === "pending",
          )
            ? "awaiting-approval"
            : "completed",
          startedAt: String(raw.timestamp),
          completedAt: String(raw.timestamp + (raw.durationMs ?? 0)),
        };
        const previous = messages.at(-1);
        if (previous?.role === "assistant") {
          previous.content += current.content;
          previous.toolCalls = [...(previous.toolCalls ?? []), ...(current.toolCalls ?? [])];
          previous.completedAt = current.completedAt;
          previous.streamStatus = previous.toolCalls.some((call) => call.approval?.status === "pending")
            ? "awaiting-approval"
            : "completed";
        } else {
          messages.push(current);
        }
      } else if (raw?.role === "toolResult") {
        for (let index = messages.length - 1; index >= 0; index--) {
          const call = messages[index]?.toolCalls?.find(
            (item) => item.id === raw.toolCallId,
          );
          if (call) {
            call.status = raw.isError ? "failed" : "completed";
            call.output = messageText(raw.content);
            break;
          }
        }
      }
    }
    cursor = page.next;
  } while (cursor);
  return {
    session: summary,
    messages: messages
      .filter((message) => !hidden.has(Number(message.id)))
      .map((message, index) => ({ ...message, sequence: index + 1 })),
  };
}
