import type { SessionMessageSummary } from "@/lib/model-profiles-api";
import type { ChatHistoryRailItem } from "@/components/chat-history-rail";

export type ChatHistoryTurn = ChatHistoryRailItem & {
  messageIds: string[];
};

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

export function buildChatHistoryTurns(
  messages: SessionMessageSummary[],
): ChatHistoryTurn[] {
  const turns: ChatHistoryTurn[] = [];
  let currentTurn: ChatHistoryTurn | undefined;

  for (const message of messages) {
    if (message.role === "user") {
      if (currentTurn) turns.push(currentTurn);
      currentTurn = {
        id: `turn-${message.id}`,
        userMessageId: message.id,
        messageIds: [message.id],
        userPreview: truncate(message.content, 72),
        assistantPreview: "",
      };
      continue;
    }

    if (!currentTurn) continue;
    currentTurn.messageIds.push(message.id);
    if (message.role === "assistant" && !currentTurn.assistantPreview) {
      currentTurn.assistantPreview = truncate(message.content, 240);
    }
  }

  if (currentTurn) turns.push(currentTurn);
  return turns.filter((turn) => Boolean(turn.userPreview));
}
