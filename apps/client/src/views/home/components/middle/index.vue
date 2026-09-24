<template>
  <div class="flex flex-col h-full relative border-t bg-background text-foreground">
    <div class="h-12 shrink-0 border-b"></div>
    <div class="relative p-4 h-1/2 flex-1 box-border w-full max-w-[800px] mx-auto flex flex-col">
      <MessageScroller class="h-1/2 flex-1">
        <MessageScrollerViewport
          class="no-scrollbar pb-10"
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
                <Bubble variant="muted" align="end">
                  <BubbleContent class="text-base">
                    <Markdown :content="message.content" />
                  </BubbleContent>
                </Bubble>
              </div>
              <template v-else>
                <ResponseProgress
                  v-if="message.streamStatus"
                  :status="message.streamStatus"
                  :started-at="message.startedAt"
                  :completed-at="message.completedAt"
                  :reasoning="message.reasoning"
                  :tool-calls="message.toolCalls"
                />
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
                <Markdown :content="message.content" />
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
  streamApprovalResponse,
  streamSessionMessage,
  type SessionStreamEvent,
  type SessionDetail,
  type ModelProfileSummary,
} from "@/lib/model-profiles-api";
import { toast } from "vue-sonner";
import { useSessionSelection } from "@/stores/session-selection";
import Markdown from "../../../../components/markdown/index.vue";
import { Ellipsis, MoveDown } from "@lucide/vue";
import {
  ResponseProgress,
  type ResponseStreamStatus,
  type ResponseToolCall,
} from "@/components/response-progress";
import { ApprovalRequest } from "@/components/approval-request";
import {
  ChatHistoryRail,
  type ChatHistoryRailItem,
} from "@/components/chat-history-rail";
import { buildChatHistoryTurns } from "./chat-history";
import {
  provideMessageScroller,
  useMessageScroller,
} from "@/components/ui/message-scroller";

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
  if (!sessionId || !content || sending.value) return;

  sending.value = true;
  const current = sessionQuery.data.value;
  const userMessageId = crypto.randomUUID();
  const assistantMessageId = crypto.randomUUID();
  const userMessage = {
    id: userMessageId,
    sessionId,
    turnId: null,
    role: "user" as const,
    content,
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
  try {
    abortController = new AbortController();
    await streamSessionMessage(
      sessionId,
      {
        content,
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
    queryClient.setQueryData(["session", sessionId], detail);
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  } catch (error) {
    const stopped = abortController?.signal.aborted ?? false;
    updateMessageStatus(
      sessionId,
      assistantMessageId,
      stopped ? "stopped" : "failed",
    );
    if (!stopped) {
      toast.error(error instanceof Error ? error.message : "发送消息失败");
    }
  } finally {
    abortController = undefined;
    sending.value = false;
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
          return { ...next, content: `${message.content}${event.text}` };
        }
        if (event.type === "reasoning") {
          return {
            ...next,
            reasoning: `${message.reasoning ?? ""}${event.text}`,
          };
        }
        if (event.type === "tool-call") {
          return {
            ...next,
            toolCalls: [
              ...(message.toolCalls ?? []),
              {
                id: event.toolCallId,
                toolName: event.toolName,
                status: "in-progress",
                input: event.input,
                rawArguments: event.rawArguments,
              },
            ],
          };
        }
        if (event.type === "approval") {
          return {
            ...next,
            toolCalls: updateToolApproval(
              message.toolCalls ?? [],
              event.toolCallId,
              event.toolName,
              event.input,
              event.approvalId,
            ),
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
          return {
            ...next,
            toolCalls: (message.toolCalls ?? []).map((toolCall) =>
              toolCall.id === event.toolCallId
                ? {
                    ...toolCall,
                    rawArguments,
                    ...(input === undefined ? {} : { input }),
                  }
                : toolCall,
            ),
          };
        }
        if (event.type === "tool-result") {
          return {
            ...next,
            toolCalls: updateToolCall(
              message.toolCalls ?? [],
              event.toolCallId,
              event.toolName,
              isToolResultFailure(event.output) ? "failed" : "completed",
              event.output,
            ),
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
          return {
            ...next,
            toolCalls: updateToolCall(
              message.toolCalls ?? [],
              id,
              event.toolName,
              status,
              event.data,
            ),
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
): ResponseToolCall[] {
  const existing = toolCalls.find((toolCall) => toolCall.id === id);
  if (!existing) return [...toolCalls, { id, toolName, status, output }];
  return toolCalls.map((toolCall) =>
    toolCall.id === id ? { ...toolCall, status, output } : toolCall,
  );
}

function updateToolApproval(
  toolCalls: ResponseToolCall[],
  id: string,
  toolName: string,
  input: unknown,
  approvalId: string,
): ResponseToolCall[] {
  const approval = { id: approvalId, status: "pending" as const };
  const existing = toolCalls.find((toolCall) => toolCall.id === id);
  if (!existing) {
    return [
      ...toolCalls,
      { id, toolName, status: "in-progress", input, approval },
    ];
  }
  return toolCalls.map((toolCall) =>
    toolCall.id === id ? { ...toolCall, input, approval } : toolCall,
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
    queryClient.setQueryData(
      ["session", sessionId],
      await openSession(sessionId),
    );
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  } catch (error) {
    updateMessageStatus(sessionId, messageId, "failed");
    toast.error(error instanceof Error ? error.message : "处理审批失败");
  } finally {
    abortController = undefined;
    respondingApprovalId.value = undefined;
    sending.value = false;
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
