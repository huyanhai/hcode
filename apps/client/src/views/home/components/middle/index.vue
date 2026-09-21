<template>
  <div class="flex flex-col h-full gap-2 pb-4 max-w-[800px] mx-auto">
    <div class="flex-1 h-1/2">
      <MessageScrollerProvider
        auto-scroll
        default-scroll-position="last-anchor"
      >
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              <MessageScrollerItem
                v-for="message in messages"
                :key="message.id"
                :message-id="message.id"
                :scroll-anchor="message.role === 'user'"
              >
                <Message :align="message.role === 'user' ? 'end' : 'start'">
                  {{ message.content }}
                </Message>
              </MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
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
    <Input v-model="data" :models="modelOptions" @submit="submit" />
    <Button type="button" size="sm" variant="outline" class="self-end">
      停止
    </Button>
  </div>
</template>
<script lang="ts" setup>
import Message from "./Message.vue";
import Input, { type SubmitPayload } from "./input/index.vue";
import Button from "@/components/ui/button/Button.vue";
import { useQuery } from "@tanstack/vue-query";
import {
  listModelProfiles,
  listProfileModels,
  type ModelProfileSummary,
} from "@/lib/model-profiles-api";

const data = reactive<SubmitPayload>({
  comments: [],
  model: "",
  attachments: [],
  content: "",
  fullAccess: false,
});

const messages = ref<{ id: string; role: "user"; content: "" }[]>();
const profilesQuery = useQuery({
  queryKey: ["model-profiles"],
  queryFn: listModelProfiles,
});
const defaultProfile = computed<ModelProfileSummary | undefined>(() => {
  const profiles = profilesQuery.data.value ?? [];
  return profiles.find((profile) => profile.isDefault) ?? profiles[0];
});
const modelsQuery = useQuery({
  queryKey: computed(() => ["provider-models", defaultProfile.value?.id ?? ""]),
  queryFn: () => listProfileModels(defaultProfile.value!.id),
  enabled: computed(() => Boolean(defaultProfile.value?.id)),
});
const modelOptions = computed(() => {
  const configuredModel = defaultProfile.value?.model;
  const remoteModels = modelsQuery.data.value?.models ?? [];
  if (!configuredModel) return remoteModels;
  return remoteModels.includes(configuredModel)
    ? remoteModels
    : [configuredModel, ...remoteModels];
});

watch(defaultProfile, (profile) => {
  if (profile && !data.model) data.model = profile.model;
}, { immediate: true });
//#region Props
//#endregion
//#region Emits
//#endregion
//#region Hooks
//#endregion
//#region Computed
//#endregion
//#region Watch
//#endregion
//#region Event
//#endregion
//#region Function
async function submit() {}

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
