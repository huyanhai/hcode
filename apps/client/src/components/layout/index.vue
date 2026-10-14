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
    <ResizableHandle
      class="mt-20 mb-10 opacity-0"
      @dragging="isBusy = $event"
    />
    <ResizablePanel
      id="layout-middle"
      :order="1"
      ref="middlePanelRef"
      :min-size="30"
      :default-size="middleDefaultSize"
    >
      <slot name="middle" />
    </ResizablePanel>
    <ResizableHandle
      class="mt-20 mb-2"
      @dragging="isBusy = $event"
    />
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

/**
 * reka Splitter 在完成首次布局测量之前，collapse/expand/resize 等命令式调用会
 * assert 抛错（"Panel size not found"）。该错误若发生在 Vue 的 mounted 钩子
 * flush 阶段会中断 post-flush 队列，导致整个应用后续挂载的弹层组件
 * （HoverCard / DropdownMenu 等 reka Portal）永远不渲染。
 * 这里统一兜底：捕获错误并在下一帧重试，直到 splitter 完成测量。
 */
function guardSplitter(action: () => void, retries = 10): void {
  try {
    action();
  } catch {
    if (retries > 0)
      requestAnimationFrame(() => guardSplitter(action, retries - 1));
  }
}

onMounted(() => {
  if (!right.value) guardSplitter(() => rightPanelRef.value?.collapse());
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
    guardSplitter(() =>
      left.value
        ? leftPanelRef.value?.expand()
        : leftPanelRef.value?.collapse(),
    );
  },
);

watch(
  () => right.value,
  async () => {
    if (isBusy.value) return;
    if (!right.value) {
      guardSplitter(() => rightPanelRef.value?.collapse());
      return;
    }
    guardSplitter(() => rightPanelRef.value?.expand());
    await nextTick();
    // Right 面板动态挂载后若把中间面板挤扁，这里兜底恢复到最小可用宽度
    const middle = middlePanelRef.value;
    if (middle && middle.getSize() < 30) guardSplitter(() => middle.resize(30));
  },
);
//#endregion
//#region Event
//#endregion
//#region Function
function collapsedLeft(size: number) {
  if (size < 20) {
    left.value = false;
    guardSplitter(() => leftPanelRef.value?.collapse());
  } else {
    left.value = true;
  }
}

function collapsedRight(size: number) {
  if (size < 20) {
    right.value = false;
    guardSplitter(() => rightPanelRef.value?.collapse());
  } else {
    right.value = true;
  }
}

function collapsedBottom(size: number) {
  if (size < 20) {
    bottom.value = false;
    guardSplitter(() => leftPanelRef.value?.collapse());
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
