<template>
  <ResizablePanelGroup direction="horizontal">
    <ResizablePanel ref="leftPanelRef" @resize="panelResize">
      One
    </ResizablePanel>
    <ResizableHandle />
    <ResizablePanel ref="rightPanelRef" @resize="panelResize">
      Two
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
<script lang="ts" setup>
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable/index";
import { onMounted, useTemplateRef } from "vue";

const leftPanelRef = useTemplateRef("leftPanelRef");
const rightPanelRef = useTemplateRef<typeof ResizablePanel>("rightPanelRef");
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
function panelResize(size: number) {
  console.log(size);
  if (size < 20) {
  }
}
//#endregion
//#region Life Cycle
onMounted(() => {
  rightPanelRef.value?.collapse();
});
//#endregion
//#region Expose
//#endregion
</script>
