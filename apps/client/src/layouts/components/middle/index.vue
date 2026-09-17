<template>
  <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
    <MessageScroller>
      <MessageScrollerViewport>
        <MessageScrollerContent>
          <MessageScrollerItem
            v-for="message in messages"
            :key="message.id"
            :message-id="message.id"
            :scroll-anchor="message.role === 'user'"
          >
            <Message align="end">
              <MessageContent>
                <Bubble>
                  <BubbleContent>Deploying to prod real quick.</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
            <Message align="start">
              <MessageContent>
                <Bubble>
                  <BubbleContent>Deploying to prod real quick.</BubbleContent>
                </Bubble>
              </MessageContent>
            </Message>
          </MessageScrollerItem>
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton direction="end" />
    </MessageScroller>
  </MessageScrollerProvider>
</template>
<script lang="ts" setup>
const messages = ref([
  {
    id: "1",
    role: "user",
  },
]);
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
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
