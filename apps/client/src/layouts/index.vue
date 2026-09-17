<template>
  <ResizablePanelGroup direction="horizontal">
    <ResizablePanel
      ref="leftPanelRef"
      :min-size="20"
      :max-size="40"
      :default-size="leftDefaultSize"
      :collapsed-size="0"
      :collapsible="true"
      @resize="panelResize($event, PanelType.LEFT)"
    >
      <slot name="left" />
    </ResizablePanel>
    <ResizableHandle @dragging="isBusy = $event" />
    <ResizablePanel :min-size="30">
      <slot name="middle" />
    </ResizablePanel>
    <ResizableHandle @dragging="isBusy = $event" />
    <ResizablePanel
      ref="rightPanelRef"
      :min-size="20"
      :max-size="50"
      :collapsed-size="0"
      :collapsible="true"
      :default-size="rightDefaultSize"
      @resize="panelResize($event, PanelType.RIGHT)"
    >
      <slot name="right" />
    </ResizablePanel>
  </ResizablePanelGroup>
</template>
<script lang="ts" setup>
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable/index";

enum PanelType {
  LEFT,
  RIGHT,
  BOTTOM,
}

const isBusy = ref(false);
const left = defineModel<boolean>("left");
const right = defineModel<boolean>("right");
const bottom = defineModel<boolean>("bottom");

const leftDefaultSize = ref(20);
const rightDefaultSize = ref(0);

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
watch(
  () => left.value,
  () => {
    if (isBusy.value) return;
    left.value ? leftPanelRef.value?.expand() : leftPanelRef.value?.collapse();
  },
);

watch(
  () => right.value,
  () => {
    if (isBusy.value) return;
    right.value
      ? rightPanelRef.value?.expand()
      : rightPanelRef.value?.collapse();
  },
);
//#endregion
//#region Event
//#endregion
//#region Function
function collapsedLeft(size: number) {
  if (size < 20) {
    left.value = false;
    leftPanelRef.value?.collapse();
  } else {
    left.value = true;
  }
}

function collapsedRight(size: number) {
  if (size < 20) {
    right.value = false;
    rightPanelRef.value?.collapse();
  } else {
    right.value = true;
  }
}

function collapsedBottom(size: number) {
  if (size < 20) {
    bottom.value = false;
    leftPanelRef.value?.collapse();
  }
}

function panelResize(size: number, type: PanelType) {
  if (type === PanelType.LEFT) {
    leftDefaultSize.value = size;
    collapsedLeft(size);
  }
  if (type === PanelType.RIGHT) {
    rightDefaultSize.value = size;
    collapsedRight(size);
  }

  if (type === PanelType.BOTTOM) {
    collapsedBottom(size);
  }
}
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
