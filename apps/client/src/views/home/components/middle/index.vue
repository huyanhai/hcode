<template>
  <div
    class="flex flex-col h-full relative border-t bg-background text-foreground"
  >
    <div class="h-12 shrink-0 border-b"></div>
    <div
      class="relative px-4 h-1/2 flex-1 box-border w-full max-w-[900px] mx-auto flex flex-col"
    >
      <MessageScroller class="h-1/2 flex-1">
        <MessageScrollerViewport
          class="no-scrollbar pb-10 pt-4"
          @scroll="syncActiveHistoryTurn"
        >
          <MessageScrollerContent>
            <MessageScrollerItem
              v-for="message in messages"
              :key="message.id"
              :message-id="message.id"
              :scroll-anchor="
                message.role === 'user' || message.id === messages.at(-1)?.id
              "
            >
              <div v-if="message.role === 'user'" class="flex justify-end">
                <div
                  v-if="editingMessageId === message.id"
                  class="w-full max-w-[min(760px,calc(100vw-2rem))] rounded-2xl bg-muted/70 p-4"
                >
                  <MessageAttachments
                    v-if="message.attachments?.length"
                    :attachments="message.attachments"
                  />
                  <InputArea
                    v-model="editingContent"
                    placeholder="编辑消息"
                    @submit="submitEdit(message)"
                  />
                  <div class="mt-3 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="sending"
                      @click="cancelEdit"
                    >
                      取消
                    </Button>
                    <Button
                      size="sm"
                      :disabled="
                        sending ||
                        (!editingContent.trim() && !message.attachments?.length)
                      "
                      @click="submitEdit(message)"
                    >
                      {{ sending ? "发送中..." : "发送" }}
                    </Button>
                  </div>
                </div>
                <template v-else>
                  <Bubble variant="muted" align="end">
                    <MessageAttachments
                      v-if="message.attachments?.length"
                      :attachments="message.attachments"
                    />
                    <BubbleContent class="text-base">
                      <Markdown :content="message.content" />
                    </BubbleContent>
                    <div
                      class="mt-1 flex items-center justify-end text-xs text-muted-foreground"
                    >
                      <span class="mr-2">{{ formatMessageTime(message.createdAt) }}</span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        style="transform: scale(0.8)"
                        @click="copyMessage(message.content)"
                      >
                        <Copy />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        style="transform: scale(0.8)"
                        v-if="message.id === lastUserMessageId && !sending"
                        @click="startEdit(message)"
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </Bubble>
                </template>
              </div>
              <template v-else>
                <ResponseProgress
                  v-if="message.streamStatus"
                  :status="message.streamStatus"
                  :started-at="message.startedAt"
                  :completed-at="message.completedAt"
                >
                  <ResponseTimeline :items="processTimelineItems(message)" />
                  <ApprovalRequest
                    v-for="approval in pendingApprovals(message)"
                    :key="approval.approvalId"
                    :tool-name="approval.toolName"
                    :input="approval.input"
                    :busy="respondingApprovalId === approval.approvalId"
                    @respond="
                      respondToApproval(message.id, approval.approvalId, $event)
                    "
                  />
                </ResponseProgress>
                <ResponseTimeline v-else :items="timelineItems(message)" />
                <Markdown
                  v-if="finalResponseContent(message)"
                  class="text-base"
                  :content="finalResponseContent(message)"
                />
                <Thinking v-if="latestReasoning(message.reasoning)" single-line>
                  {{ latestReasoning(message.reasoning) }}
                </Thinking>
              </template>
            </MessageScrollerItem>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          class="rounded-full border glass-bg"
          direction="end"
        >
          <Ellipsis class="w-6! h-6! dot-bounce opacity-50" v-if="sending" />
          <MoveDown class="opacity-50" v-else />
        </MessageScrollerButton>
      </MessageScroller>
      <Input
        class="mb-4"
        v-model="data"
        :models="modelOptions"
        :sending="sending"
        :disabled="!selectedSessionId"
        @submit="submit"
        @stop="stopTurn"
      />
    </div>
    <ChatHistoryRail
      v-if="historyTurns.length"
      :active-fn="isActiveHistoryTurn"
      :items="historyTurns"
      class="absolute left-0 top-1/2 -translate-y-1/2"
      @select="scrollToHistoryTurn"
    />
  </div>
</template>
<script lang="ts" setup>
import Input, { type SubmitPayload } from "./input/index.vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import {
  listModelProfiles,
  listProfileModels,
  openSession,
  streamEditedSessionMessage,
  streamApprovalResponse,
  streamSessionMessage,
  type SessionStreamEvent,
  type SessionDetail,
  type ModelProfileSummary,
} from "@/lib/model-profiles-api";
import { toast } from "vue-sonner";
import {
  useSessionActivity,
  useSessionSelection,
} from "@/stores/session-selection";
import Markdown from "../../../../components/markdown/index.vue";
import { Copy, Ellipsis, MoveDown, Pencil } from "@lucide/vue";
import {
  ResponseProgress,
  type ResponseStreamStatus,
  type ResponseTimelineItem,
  type ResponseToolCall,
} from "@/components/response-progress";
import { ResponseTimeline } from "@/components/response-timeline";
import { ApprovalRequest } from "@/components/approval-request";
import Thinking from "@/components/response-progress/markers/Thinking.vue";
import {
  ChatHistoryRail,
  type ChatHistoryRailItem,
} from "@/components/chat-history-rail";
import { buildChatHistoryTurns } from "./chat-history";
import { provideMessageScroller } from "@/components/ui/message-scroller";
import MessageAttachments from "./MessageAttachments.vue";
import InputArea from "./input/InputArea.vue";
import { Button } from "@/components/ui/button";

const data = reactive<SubmitPayload>({
  comments: [],
  model: "",
  attachments: [],
  content: "",
  fullAccess: false,
});

const sending = ref(false);
let abortController: AbortController | undefined;
const respondingApprovalId = ref<string>();
const editingMessageId = ref<string>();
const editingContent = ref("");

const { scrollToMessage } = provideMessageScroller({
  autoScroll: true,
  defaultScrollPosition: "last-anchor",
}).context;

const defaultProfile = computed<ModelProfileSummary | undefined>(() => {
  const profiles = profilesQuery.data.value ?? [];
  return profiles.find((profile) => profile.isDefault) ?? profiles[0];
});

//#region Props
//#endregion
//#region Emits
//#endregion
//#region Hooks
const selectedSessionId = useSessionSelection();
const activeSessionId = useSessionActivity();
const queryClient = useQueryClient();
// 查询会话
const sessionQuery = useQuery<SessionDetail>({
  queryKey: computed(() => ["session", selectedSessionId.value]),
  queryFn: () => openSession(selectedSessionId.value),
  enabled: computed(() => Boolean(selectedSessionId.value)),
  retry: false,
});

// 查询模型列表
const profilesQuery = useQuery({
  queryKey: ["model-profiles"],
  queryFn: listModelProfiles,
});

// 根据模型id查询provider
const modelsQuery = useQuery({
  queryKey: computed(() => ["provider-models", defaultProfile.value?.id ?? ""]),
  queryFn: () => listProfileModels(defaultProfile.value!.id),
  enabled: computed(() => Boolean(defaultProfile.value?.id)),
  retry: false,
});
//#endregion
//#region Watch
//#region Computed
// 消息列表
const messages = computed(() => sessionQuery.data.value?.messages ?? []);
const lastUserMessageId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    if (messages.value[index]?.role === "user") return messages.value[index].id;
  }
  return "";
});
const historyTurns = computed(() => buildChatHistoryTurns(messages.value));
const activeHistoryTurnId = ref("");
const modelOptions = computed(() => {
  const configuredModel = defaultProfile.value?.model;
  const remoteModels = modelsQuery.data.value?.models ?? [];
  if (!configuredModel) return remoteModels;
  return remoteModels.includes(configuredModel)
    ? remoteModels
    : [configuredModel, ...remoteModels];
});
//#endregion
watch(
  defaultProfile,
  (profile) => {
    if (profile && !data.model) data.model = profile.model;
  },
  { immediate: true },
);
watch(sessionQuery.isError, (isError) => {
  if (isError && selectedSessionId.value) {
    selectedSessionId.value = "";
    toast.error("无法加载当前会话");
  }
});
watch(
  historyTurns,
  (turns) => {
    if (!turns.some((turn) => turn.id === activeHistoryTurnId.value)) {
      activeHistoryTurnId.value = turns[0]?.id ?? "";
    }
    void nextTick(syncActiveHistoryTurn);
  },
  { flush: "post" },
);
//#endregion
//#region Event
//#endregion
//#region Function
function isActiveHistoryTurn(item: ChatHistoryRailItem) {
  return item.id === activeHistoryTurnId.value;
}

function syncActiveHistoryTurn(event?: Event) {
  const viewport = event?.target as HTMLElement | undefined;
  if (!viewport) return;
  const viewportTop = viewport.getBoundingClientRect().top;
  let closestTurnId = historyTurns.value[0]?.id ?? "";
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const turn of historyTurns.value) {
    const target = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-message-id]"),
    ).find((element) => element.dataset.messageId === turn.userMessageId);
    if (!target) continue;
    const distance = Math.abs(
      target.getBoundingClientRect().top - viewportTop - 24,
    );
    if (distance < closestDistance) {
      closestDistance = distance;
      closestTurnId = turn.id;
    }
  }
  activeHistoryTurnId.value = closestTurnId;
}

function scrollToHistoryTurn(item: ChatHistoryRailItem) {
  scrollToMessage(item.userMessageId, {
    behavior: "smooth",
    align: "start",
  });
}

async function submit() {
  const sessionId = selectedSessionId.value;
  const content = data.content.trim();
  const attachments = data.attachments.flatMap((attachment) =>
    attachment.uploadState === "uploaded" && attachment.uploaded
      ? [attachment.uploaded]
      : [],
  );
  if (
    !sessionId ||
    (!content && !attachments.length) ||
    attachments.length !== data.attachments.length ||
    sending.value
  )
    return;

  sending.value = true;
  activeSessionId.value = sessionId;
  let assistantMessageId = "";
  try {
    const current = sessionQuery.data.value;
    const userMessageId = crypto.randomUUID();
    assistantMessageId = crypto.randomUUID();
    const userMessage = {
      id: userMessageId,
      sessionId,
      turnId: null,
      role: "user" as const,
      content,
      attachments,
      sequence: (current?.messages.at(-1)?.sequence ?? 0) + 1,
      createdAt: String(Date.now()),
    };
    const assistantMessage = {
      id: assistantMessageId,
      sessionId,
      turnId: null,
      role: "assistant" as const,
      content: "",
      reasoning: "",
      toolCalls: [] as ResponseToolCall[],
      timeline: [] as ResponseTimelineItem[],
      streamStatus: "thinking" as ResponseStreamStatus,
      startedAt: String(Date.now()),
      sequence: userMessage.sequence + 1,
      createdAt: String(Date.now()),
    };
    queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) =>
      old
        ? { ...old, messages: [...old.messages, userMessage, assistantMessage] }
        : old,
    );
    abortController = new AbortController();
    await streamSessionMessage(
      sessionId,
      {
        content,
        attachments,
        profileId: defaultProfile.value?.id,
        model: data.model || undefined,
        fullAccess: data.fullAccess,
      },
      (event: SessionStreamEvent) => {
        return updateStreamMessage(sessionId, assistantMessageId, event);
      },
      abortController.signal,
    );
    const detail = await openSession(sessionId);
    queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) =>
      mergeTransientAssistantState(detail, old, assistantMessageId),
    );
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  } catch (error) {
    const stopped = abortController?.signal.aborted ?? false;
    if (assistantMessageId) {
      updateMessageStatus(
        sessionId,
        assistantMessageId,
        stopped ? "stopped" : "failed",
      );
    }
    if (!stopped) {
      toast.error(error instanceof Error ? error.message : "发送消息失败");
    }
  } finally {
    abortController = undefined;
    sending.value = false;
    if (activeSessionId.value === sessionId) activeSessionId.value = "";
  }
}

type SessionMessage = SessionDetail["messages"][number];

function startEdit(message: SessionMessage) {
  if (sending.value || message.id !== lastUserMessageId.value) return;
  editingMessageId.value = message.id;
  editingContent.value = message.content;
}

function cancelEdit() {
  if (sending.value) return;
  editingMessageId.value = undefined;
  editingContent.value = "";
}

async function copyMessage(content: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = content;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    toast.success("消息已复制");
  } catch {
    toast.error("复制消息失败");
  }
}

function formatMessageTime(value: string) {
  const date = new Date(Number(value));
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

async function submitEdit(message: SessionMessage) {
  const sessionId = selectedSessionId.value;
  const content = editingContent.value.trim();
  if (
    !sessionId ||
    message.id !== lastUserMessageId.value ||
    (!content && !message.attachments?.length) ||
    sending.value
  )
    return;

  const current = sessionQuery.data.value;
  const assistantMessageId = crypto.randomUUID();
  const editedUserMessage = {
    ...message,
    content,
    createdAt: String(Date.now()),
  };
  const assistantMessage = {
    id: assistantMessageId,
    sessionId,
    turnId: null,
    role: "assistant" as const,
    content: "",
    reasoning: "",
    toolCalls: [] as ResponseToolCall[],
    timeline: [] as ResponseTimelineItem[],
    streamStatus: "thinking" as ResponseStreamStatus,
    startedAt: String(Date.now()),
    sequence: message.sequence + 1,
    createdAt: String(Date.now()),
  };
  if (!current) return;

  const previousMessages = current.messages;
  queryClient.setQueryData<SessionDetail>(["session", sessionId], {
    ...current,
    messages: [
      ...previousMessages.filter((item) => item.sequence < message.sequence),
      editedUserMessage,
      assistantMessage,
    ],
  });
  editingMessageId.value = undefined;
  editingContent.value = "";
  sending.value = true;
  activeSessionId.value = sessionId;
  try {
    abortController = new AbortController();
    await streamEditedSessionMessage(
      sessionId,
      message.id,
      {
        content,
        attachments: message.attachments,
        profileId: defaultProfile.value?.id,
        model: data.model || undefined,
        fullAccess: data.fullAccess,
      },
      (event) => updateStreamMessage(sessionId, assistantMessageId, event),
      abortController.signal,
    );
    const detail = await openSession(sessionId);
    queryClient.setQueryData<SessionDetail>(["session", sessionId], detail);
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  } catch (error) {
    try {
      const detail = await openSession(sessionId);
      queryClient.setQueryData<SessionDetail>(["session", sessionId], detail);
    } catch {
      queryClient.setQueryData<SessionDetail>(["session", sessionId], current);
    }
    toast.error(error instanceof Error ? error.message : "重新生成消息失败");
  } finally {
    abortController = undefined;
    sending.value = false;
    if (activeSessionId.value === sessionId) activeSessionId.value = "";
  }
}

function updateStreamMessage(
  sessionId: string,
  messageId: string,
  event: SessionStreamEvent,
) {
  queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) => {
    if (!old) return old;
    return {
      ...old,
      messages: old.messages.map((message) => {
        if (message.id !== messageId) return message;
        if (event.type === "done") {
          return {
            ...message,
            streamStatus: event.awaitingApproval
              ? "awaiting-approval"
              : "completed",
            ...(event.awaitingApproval
              ? {}
              : { completedAt: String(Date.now()) }),
          };
        }
        if (event.type === "error") {
          return {
            ...message,
            streamStatus: "failed",
            completedAt: String(Date.now()),
          };
        }
        const next = {
          ...message,
          streamStatus:
            message.streamStatus === "thinking"
              ? "streaming"
              : message.streamStatus,
        };
        if (event.type === "text") {
          return {
            ...next,
            content: `${message.content}${event.text}`,
            timeline: appendTimelineText(message.timeline, event.text),
          };
        }
        if (event.type === "reasoning") {
          return {
            ...next,
            reasoning: `${message.reasoning ?? ""}${event.text}`,
          };
        }
        if (event.type === "tool-call") {
          const toolCall: ResponseToolCall = {
            id: event.toolCallId,
            toolName: event.toolName,
            status: "in-progress",
            input: event.input,
            rawArguments: event.rawArguments,
            contentOffset: message.content.length,
          };
          return {
            ...next,
            toolCalls: [...(message.toolCalls ?? []), toolCall],
            timeline: appendTimelineTool(message.timeline, toolCall),
          };
        }
        if (event.type === "approval") {
          const toolCalls = updateToolApproval(
            message.toolCalls ?? [],
            event.toolCallId,
            event.toolName,
            event.input,
            event.approvalId,
            message.content.length,
          );
          const toolCall = toolCalls.find(
            (call) => call.id === event.toolCallId,
          );
          return {
            ...next,
            toolCalls,
            timeline: toolCall
              ? updateTimelineTool(message.timeline, toolCall)
              : message.timeline,
          };
        }
        if (event.type === "tool-call-delta") {
          const rawArguments =
            event.arguments ??
            `${message.toolCalls?.find((call) => call.id === event.toolCallId)?.rawArguments ?? ""}${event.delta}`;
          let input: unknown;
          try {
            input = JSON.parse(rawArguments || "{}");
          } catch {
            input = undefined;
          }
          const toolCalls = (message.toolCalls ?? []).map((toolCall) =>
            toolCall.id === event.toolCallId
              ? {
                  ...toolCall,
                  rawArguments,
                  ...(input === undefined ? {} : { input }),
                }
              : toolCall,
          );
          const toolCall = toolCalls.find(
            (call) => call.id === event.toolCallId,
          );
          return {
            ...next,
            toolCalls,
            timeline: toolCall
              ? updateTimelineTool(message.timeline, toolCall)
              : message.timeline,
          };
        }
        if (event.type === "tool-result") {
          const toolCalls = updateToolCall(
            message.toolCalls ?? [],
            event.toolCallId,
            event.toolName,
            isToolResultFailure(event.output) ? "failed" : "completed",
            event.output,
            message.content.length,
          );
          const toolCall = toolCalls.find(
            (call) => call.id === event.toolCallId,
          );
          return {
            ...next,
            toolCalls,
            timeline: toolCall
              ? updateTimelineTool(message.timeline, toolCall)
              : message.timeline,
          };
        }
        if (event.type === "tool-progress") {
          const id = event.itemId ?? `${event.toolName}:provider`;
          const status =
            event.status === "failed"
              ? "failed"
              : event.status === "completed"
                ? "completed"
                : "in-progress";
          const toolCalls = updateToolCall(
            message.toolCalls ?? [],
            id,
            event.toolName,
            status,
            event.data,
            message.content.length,
          );
          const toolCall = toolCalls.find((call) => call.id === id);
          return {
            ...next,
            toolCalls,
            timeline: toolCall
              ? updateTimelineTool(message.timeline, toolCall)
              : message.timeline,
          };
        }
        return next;
      }),
    };
  });
}

function updateToolCall(
  toolCalls: ResponseToolCall[],
  id: string,
  toolName: string,
  status: ResponseToolCall["status"],
  output?: unknown,
  contentOffset?: number,
): ResponseToolCall[] {
  const existing = toolCalls.find((toolCall) => toolCall.id === id);
  if (!existing) {
    return [...toolCalls, { id, toolName, status, output, contentOffset }];
  }
  return toolCalls.map((toolCall) =>
    toolCall.id === id ? { ...toolCall, status, output } : toolCall,
  );
}

function mergeTransientAssistantState(
  remote: SessionDetail,
  current: SessionDetail | undefined,
  messageId: string,
): SessionDetail {
  const localMessage = current?.messages.find(
    (message) => message.id === messageId,
  );
  if (!localMessage) return remote;

  return {
    ...remote,
    messages: remote.messages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            ...(localMessage.reasoning
              ? { reasoning: localMessage.reasoning }
              : {}),
            ...(localMessage.timeline?.length
              ? { timeline: localMessage.timeline }
              : {}),
          }
        : message,
    ),
  };
}

function updateToolApproval(
  toolCalls: ResponseToolCall[],
  id: string,
  toolName: string,
  input: unknown,
  approvalId: string,
  contentOffset: number,
): ResponseToolCall[] {
  const approval = { id: approvalId, status: "pending" as const };
  const existing = toolCalls.find((toolCall) => toolCall.id === id);
  if (!existing) {
    return [
      ...toolCalls,
      {
        id,
        toolName,
        status: "in-progress",
        input,
        contentOffset,
        approval,
      },
    ];
  }
  return toolCalls.map((toolCall) =>
    toolCall.id === id ? { ...toolCall, input, approval } : toolCall,
  );
}

function timelineItems(
  message: SessionDetail["messages"][number],
): ResponseTimelineItem[] {
  if (message.timeline) return message.timeline;

  const toolCalls = [...(message.toolCalls ?? [])].sort(
    (left, right) =>
      (left.contentOffset ?? message.content.length) -
        (right.contentOffset ?? message.content.length) ||
      (message.toolCalls ?? []).indexOf(left) -
        (message.toolCalls ?? []).indexOf(right),
  );
  const timeline: ResponseTimelineItem[] = [];
  let cursor = 0;

  for (const toolCall of toolCalls) {
    const offset = Math.max(
      cursor,
      Math.min(message.content.length, toolCall.contentOffset ?? cursor),
    );
    if (offset > cursor) {
      timeline.push({
        id: `text:${cursor}`,
        type: "text",
        content: message.content.slice(cursor, offset),
      });
      cursor = offset;
    }
    timeline.push({ id: `tool:${toolCall.id}`, type: "tool", toolCall });
  }

  if (cursor < message.content.length) {
    timeline.push({
      id: `text:${cursor}`,
      type: "text",
      content: message.content.slice(cursor),
    });
  }
  return timeline;
}

function processTimelineItems(
  message: SessionDetail["messages"][number],
): ResponseTimelineItem[] {
  const items = timelineItems(message);
  if (!isStreamFinished(message.streamStatus)) return items;

  const lastToolIndex = items.findLastIndex((item) => item.type === "tool");
  return lastToolIndex < 0 ? [] : items.slice(0, lastToolIndex + 1);
}

function finalResponseContent(
  message: SessionDetail["messages"][number],
): string {
  if (!isStreamFinished(message.streamStatus)) return "";

  const items = timelineItems(message);
  const lastToolIndex = items.findLastIndex((item) => item.type === "tool");
  return items
    .slice(lastToolIndex + 1)
    .flatMap((item) => (item.type === "text" ? [item.content] : []))
    .join("");
}

function isStreamFinished(status: ResponseStreamStatus | undefined): boolean {
  return ["completed", "failed", "stopped"].includes(status ?? "completed");
}

function latestReasoning(value: string | undefined): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentences = normalized
    .split(/(?<=[。！？])\s*|(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.at(-1) ?? normalized;
}

function appendTimelineText(
  timeline: ResponseTimelineItem[] | undefined,
  text: string,
): ResponseTimelineItem[] {
  const items = timeline ?? [];
  const previous = items.at(-1);
  if (previous?.type === "text") {
    return [
      ...items.slice(0, -1),
      { ...previous, content: `${previous.content}${text}` },
    ];
  }
  return [...items, { id: crypto.randomUUID(), type: "text", content: text }];
}

function appendTimelineTool(
  timeline: ResponseTimelineItem[] | undefined,
  toolCall: ResponseToolCall,
): ResponseTimelineItem[] {
  return [
    ...(timeline ?? []),
    { id: `tool:${toolCall.id}`, type: "tool", toolCall },
  ];
}

function updateTimelineTool(
  timeline: ResponseTimelineItem[] | undefined,
  toolCall: ResponseToolCall,
): ResponseTimelineItem[] {
  const items = timeline ?? [];
  if (
    !items.some(
      (item) => item.type === "tool" && item.toolCall.id === toolCall.id,
    )
  ) {
    return appendTimelineTool(items, toolCall);
  }
  return items.map((item) =>
    item.type === "tool" && item.toolCall.id === toolCall.id
      ? { ...item, toolCall }
      : item,
  );
}

function isToolResultFailure(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    "error" in output &&
    typeof output.error === "string"
  );
}

function updateMessageStatus(
  sessionId: string,
  messageId: string,
  streamStatus: ResponseStreamStatus,
) {
  queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) =>
    old
      ? {
          ...old,
          messages: old.messages.map((message) =>
            message.id === messageId
              ? { ...message, streamStatus, completedAt: String(Date.now()) }
              : message,
          ),
        }
      : old,
  );
}

function pendingApprovals(message: SessionDetail["messages"][number]) {
  return (message.toolCalls ?? []).flatMap((toolCall) =>
    toolCall.approval?.status === "pending"
      ? [
          {
            approvalId: toolCall.approval.id,
            toolName: toolCall.toolName,
            input: toolCall.input,
          },
        ]
      : [],
  );
}

async function respondToApproval(
  messageId: string,
  approvalId: string,
  approved: boolean,
) {
  const sessionId = selectedSessionId.value;
  if (!sessionId || respondingApprovalId.value) return;
  respondingApprovalId.value = approvalId;
  sending.value = true;
  activeSessionId.value = sessionId;
  queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) =>
    old
      ? {
          ...old,
          messages: old.messages.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  streamStatus: "streaming",
                  toolCalls: (message.toolCalls ?? []).map((toolCall) =>
                    toolCall.approval?.id === approvalId
                      ? {
                          ...toolCall,
                          approval: {
                            ...toolCall.approval,
                            status: approved ? "approved" : "denied",
                          },
                        }
                      : toolCall,
                  ),
                }
              : message,
          ),
        }
      : old,
  );
  try {
    abortController = new AbortController();
    await streamApprovalResponse(
      sessionId,
      approvalId,
      approved,
      (event) => updateStreamMessage(sessionId, messageId, event),
      abortController.signal,
    );
    const detail = await openSession(sessionId);
    queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) =>
      mergeTransientAssistantState(detail, old, messageId),
    );
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  } catch (error) {
    updateMessageStatus(sessionId, messageId, "failed");
    toast.error(error instanceof Error ? error.message : "处理审批失败");
  } finally {
    abortController = undefined;
    respondingApprovalId.value = undefined;
    sending.value = false;
    if (activeSessionId.value === sessionId) activeSessionId.value = "";
  }
}

function stopTurn() {
  abortController?.abort();
}
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>

<style>
@keyframes dot-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-3px);
  }
}

.dot-bounce circle {
  animation: dot-bounce 1.2s ease-in-out infinite;
  /* 关键：SVG 元素必须指定，否则 translateY 会以整个画布为参照跑飞 */
  transform-box: fill-box;
  transform-origin: center;
}

.dot-bounce circle:nth-child(3) {
  animation-delay: 0s;
}
.dot-bounce circle:nth-child(1) {
  animation-delay: 0.2s;
}
.dot-bounce circle:nth-child(2) {
  animation-delay: 0.4s;
}
</style>
