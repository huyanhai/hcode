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
    <div v-if="approvals.length" class="space-y-2 px-2">
      <div v-for="approval in approvals" :key="approval.approvalId" class="border-l-2 border-amber-500 bg-muted/40 px-3 py-2">
        <div class="text-sm font-medium">请求执行 {{ approval.toolName }}</div>
        <pre class="mt-1 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{{ JSON.stringify(approval.input, null, 2) }}</pre>
        <div class="mt-2 flex gap-2">
          <Button size="sm" @click="answerApproval(approval.approvalId, true)">允许</Button>
          <Button size="sm" variant="outline" @click="answerApproval(approval.approvalId, false)">拒绝</Button>
        </div>
      </div>
    </div>
    <Input
      v-model="data"
      :profiles="profiles"
      :disabled="busy"
      @submit="submit"
    />
    <Button v-if="busy" type="button" size="sm" variant="outline" class="self-end" @click="stopTurn">停止</Button>
    <p v-if="errorMessage" class="text-xs text-destructive px-2">{{ errorMessage }}</p>
  </div>
</template>
<script lang="ts" setup>
import Message from "./Message.vue";
import Input, { type SubmitPayload } from "./input/index.vue";
import Button from "@/components/ui/button/Button.vue";
import { storeToRefs } from "pinia";
import { useAgentStore } from "@/stores/agent";

const data = reactive<SubmitPayload>({
  comments: [],
  model: "",
  attachments: [],
  content: "",
  fullAccess: false,
});

const agent = useAgentStore();
const { messages, profiles, busy, errorMessage, approvals } = storeToRefs(agent);
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
async function submit() {
  if (busy.value || !data.content.trim()) return;
  try {
    if (!data.model) data.model = profiles.value[0]?.id ?? "";
    await agent.send(data.content.trim(), data.model, data.fullAccess);
  } catch { /* store 已保存可展示错误 */ }
}

async function answerApproval(approvalId: string, approved: boolean) {
  try { await agent.answerApproval(approvalId, approved); }
  catch { /* store 已保存可展示错误 */ }
}

async function stopTurn() { await agent.stop(); }

onMounted(async () => {
  await agent.initialize();
  if (!data.model) data.model = profiles.value.find((profile) => profile.isDefault)?.id ?? profiles.value[0]?.id ?? "";
});
watch(profiles, (items) => {
  if (!items.some((profile) => profile.id === data.model)) {
    data.model = items.find((profile) => profile.isDefault)?.id ?? items[0]?.id ?? "";
  }
});
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
