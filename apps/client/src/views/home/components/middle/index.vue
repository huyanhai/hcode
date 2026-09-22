<template>
  <div class="flex flex-col h-full gap-2 pb-4 max-w-[800px] mx-auto">
    <div class="flex-1 h-1/2">
      <MessageScrollerProvider
        auto-scroll
        default-scroll-position="last-anchor"
      >
        <MessageScroller>
          <MessageScrollerViewport class="no-scrollbar pb-10">
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
                    <BubbleContent>
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
      </MessageScrollerProvider>
    </div>
    <!-- <div class="space-y-2 px-2">
      <div
        v-for="approval in approvals"
        :key="approval.approvalId"
        class="border-l-2 border-amber-500 bg-muted/40 px-3 py-2"
      >
        <div class="text-sm font-medium">请求执行 {{ approval.toolName }}</div>
        <pre
          class="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground"
        >
          {{ JSON.stringify(approval.input, null, 2) }}
        </pre>
        <div class="mt-2 flex gap-2">
          <Button size="sm"> 允许 </Button>
          <Button size="sm" variant="outline"> 拒绝 </Button>
        </div>
      </div>
    </div> -->
    <Input
      v-model="data"
      :models="modelOptions"
      :sending="sending"
      :disabled="!selectedSessionId"
      @submit="submit"
      @stop="stopTurn"
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
  streamSessionMessage,
  type SessionStreamEvent,
  type SessionDetail,
  type ModelProfileSummary,
} from "@/lib/model-profiles-api";
import { toast } from "vue-sonner";
import { useSessionSelection } from "@/stores/session-selection";
import Markdown from "./markdown/index.vue";
import { Ellipsis, MoveDown } from "@lucide/vue";
import {
  ResponseProgress,
  type ResponseStreamStatus,
  type ResponseToolCall,
} from "@/components/response-progress";

const data = reactive<SubmitPayload>({
  comments: [],
  model: "",
  attachments: [],
  content: "",
  fullAccess: false,
});

const sending = ref(false);
let abortController: AbortController | undefined;

//#region Props
//#endregion
//#region Emits
//#endregion
//#region Computed
const messages = computed(() => sessionQuery.data.value?.messages ?? []);
const defaultProfile = computed<ModelProfileSummary | undefined>(() => {
  const profiles = profilesQuery.data.value ?? [];
  return profiles.find((profile) => profile.isDefault) ?? profiles[0];
});
//#endregion
//#region Hooks
const selectedSessionId = useSessionSelection();
const queryClient = useQueryClient();

const sessionQuery = useQuery<SessionDetail>({
  queryKey: computed(() => ["session", selectedSessionId.value]),
  queryFn: () => openSession(selectedSessionId.value),
  enabled: computed(() => Boolean(selectedSessionId.value)),
  retry: false,
});

const profilesQuery = useQuery({
  queryKey: ["model-profiles"],
  queryFn: listModelProfiles,
});

const modelsQuery = useQuery({
  queryKey: computed(() => ["provider-models", defaultProfile.value?.id ?? ""]),
  queryFn: () => listProfileModels(defaultProfile.value!.id),
  enabled: computed(() => Boolean(defaultProfile.value?.id)),
  retry: false,
});
const modelOptions = computed(() => {
  const configuredModel = defaultProfile.value?.model;
  const remoteModels = modelsQuery.data.value?.models ?? [];
  if (!configuredModel) return remoteModels;
  return remoteModels.includes(configuredModel)
    ? remoteModels
    : [configuredModel, ...remoteModels];
});
//#endregion
//#region Watch
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
//#endregion
//#region Event
//#endregion
//#region Function
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
      (event: SessionStreamEvent) =>
        updateStreamMessage(sessionId, assistantMessageId, event),
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
            streamStatus: "completed",
            completedAt: String(Date.now()),
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
            message.streamStatus === "thinking" ? "streaming" : message.streamStatus,
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
                ? { ...toolCall, rawArguments, ...(input === undefined ? {} : { input }) }
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
              "completed",
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
