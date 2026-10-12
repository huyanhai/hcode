<template>
  <!-- 面板会随 v-if 动态挂载/卸载，reka splitter 要求每个面板都提供 id + order，否则尺寸状态会错乱 -->
  <ResizablePanelGroup id="main-layout" direction="horizontal">
    <ResizablePanel
      id="layout-left"
      :order="0"
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
    <ResizablePanel
      id="layout-middle"
      :order="1"
      ref="middlePanelRef"
      :min-size="30"
      :default-size="middleDefaultSize"
    >
      <slot name="middle" />
    </ResizablePanel>
    <ResizableHandle @dragging="isBusy = $event" />
    <ResizablePanel
      id="layout-right"
      :order="2"
      ref="rightPanelRef"
      :min-size="20"
      :max-size="50"
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
const middleDefaultSize = ref(44);
const rightDefaultSize = ref(36);

const leftPanelRef = useTemplateRef("leftPanelRef");
const middlePanelRef = useTemplateRef<typeof ResizablePanel>("middlePanelRef");
const rightPanelRef = useTemplateRef<typeof ResizablePanel>("rightPanelRef");
onMounted(() => {
  if (!right.value) rightPanelRef.value?.collapse();
});
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
  async () => {
    if (isBusy.value) return;
    if (!right.value) {
      rightPanelRef.value?.collapse();
      return;
    }
    rightPanelRef.value?.expand();
    await nextTick();
    // Right 面板动态挂载后若把中间面板挤扁，这里兜底恢复到最小可用宽度
    const middle = middlePanelRef.value;
    if (middle && middle.getSize() < 30) middle.resize(30);
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
