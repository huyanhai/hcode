<template>
  <div class="flex flex-col h-full gap-2 pb-4 max-w-[800px] mx-auto">
    <div class="flex-1 h-1/2">
      <MessageScrollerProvider
        auto-scroll
        default-scroll-position="last-anchor"
      >
        <MessageScroller>
          <MessageScrollerViewport class="no-scrollbar">
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
                  <Thinking v-if="message.reasoning">
                    {{ message.reasoning }}
                  </Thinking>
                  <template v-if="message.toolCalls?.length">
                    <Tools v-for="tool in message.toolCalls" :key="tool">
                      {{ tool }}
                    </Tools>
                  </template>
                  <Markdown :content="message.content" />
                </template>
              </MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton
            class="rounded-full border glass-bg"
            direction="end"
          >
            <Ellipsis
              class="w-6! h-6! dot-bounce [&>circle:nth-child(2)]:[animation-delay:0.2s] [&>circle:nth-child(3)]:[animation-delay:0.4s]"
            />
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
          <Button size="sm" @click="answerApproval(approval.approvalId, true)">
            允许
          </Button>
          <Button
            size="sm"
            variant="outline"
            @click="answerApproval(approval.approvalId, false)"
          >
            拒绝
          </Button>
        </div>
      </div>
    </div> -->
    <Input
      v-model="data"
      :models="modelOptions"
      :disabled="sending || !selectedSessionId"
      @submit="submit"
    />
    <Button
      type="button"
      size="sm"
      variant="outline"
      class="self-end"
      :disabled="!sending"
    >
      停止
    </Button>
  </div>
</template>
<script lang="ts" setup>
import Input, { type SubmitPayload } from "./input/index.vue";
import Button from "@/components/ui/button/Button.vue";
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
import Thinking from "./markers/Thinking.vue";
import Tools from "./markers/Tools.vue";
import Markdown from "./markdown/index.vue";
import { Ellipsis } from "@lucide/vue";

const data = reactive<SubmitPayload>({
  comments: [],
  model: "",
  attachments: [],
  content: "",
  fullAccess: false,
});

const sending = ref(false);

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
    toolCalls: [] as string[],
    sequence: userMessage.sequence + 1,
    createdAt: String(Date.now()),
  };
  queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) =>
    old
      ? { ...old, messages: [...old.messages, userMessage, assistantMessage] }
      : old,
  );
  try {
    await streamSessionMessage(
      sessionId,
      {
        content,
        profileId: defaultProfile.value?.id,
        model: data.model || undefined,
        fullAccess: data.fullAccess,
      },
      (event: SessionStreamEvent) => {
        queryClient.setQueryData<SessionDetail>(
          ["session", sessionId],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              messages: old.messages.map((message) =>
                message.id === assistantMessageId
                  ? event.type === "text"
                    ? { ...message, content: `${message.content}${event.text}` }
                    : event.type === "reasoning"
                      ? {
                          ...message,
                          reasoning: `${message.reasoning ?? ""}${event.text}`,
                        }
                      : event.type === "tool-call"
                        ? {
                            ...message,
                            toolCalls: [
                              ...(message.toolCalls ?? []),
                              `调用 ${event.toolName}`,
                            ],
                          }
                        : event.type === "tool-result"
                          ? {
                              ...message,
                              toolCalls: [
                                ...(message.toolCalls ?? []),
                                `${event.toolName} 完成`,
                              ],
                            }
                          : message
                  : message,
              ),
            };
          },
        );
      },
    );
    const detail = await openSession(sessionId);
    queryClient.setQueryData(["session", sessionId], detail);
    await queryClient.invalidateQueries({ queryKey: ["sessions"] });
  } catch (error) {
    queryClient.setQueryData<SessionDetail>(["session", sessionId], (old) =>
      old
        ? {
            ...old,
            messages: old.messages.filter(
              (message) => message.id !== assistantMessageId,
            ),
          }
        : old,
    );
    toast.error(error instanceof Error ? error.message : "发送消息失败");
  } finally {
    sending.value = false;
  }
}

// async function answerApproval(approvalId: string, approved: boolean) {}

// async function stopTurn() {
//   await agent.stop();
// }
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>

<style>
@keyframes dot-bounce {
  0% {
    transform: translateY(0);
  }
  25% {
    transform: translateY(2px);
  }
  50% {
    transform: translateY(0px);
  }
  75% {
    transform: translateY(-2px);
  }
  100% {
    transform: translateY(0px);
  }
}
</style>
