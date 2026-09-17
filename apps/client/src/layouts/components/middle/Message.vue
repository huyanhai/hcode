<template>
  <Message :align="align">
    <MessageContent>
      <Bubble>
        <BubbleContent><slot /></BubbleContent>
      </Bubble>
    </MessageContent>
  </Message>
</template>
<script lang="ts" setup>
import { Message } from "@/components/ui/message";
//#region Props
const { align } = defineProps<{
  align: (typeof Message)["align"];
}>();
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
