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
    <Input v-model="data" @submit="submit" />
  </div>
</template>
<script lang="ts" setup>
import Message from "./Message.vue";
import Input, { type SubmitPayload } from "./input/index.vue";

const data = reactive<SubmitPayload>({
  comments: [],
  model: "",
  attachments: [],
  content: "",
  fullAccess: true,
});

const messages = ref<{ id: string; role: "user" | "a"; content: string }[]>([]);
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
function submit() {
  messages.value.push({
    id: `${+new Date()}`,
    role: "user",
    content: data.content,
  });
}
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
