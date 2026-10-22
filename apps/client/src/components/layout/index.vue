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
    <!--
      :disabled 的两个约束（缺一不可）：
      1) 拖拽进行中绝不能禁用 —— reka 在 disabled 变化时会注销该 handle 的全局拖拽监听，
         导致松手时 dragging:false 丢失、isBusy 卡死，展开图标被 watch 守卫吞掉；
      2) 折叠态必须禁用 —— reka 的命中判定是「handle rect ±5px」，零宽 handle 常驻注册时
         会和相邻的 handle（如内嵌文件面板的分割线）同时被命中，拖 A 会连带拖 B。
      所以用 `折叠 && 非拖拽中` 作为条件：拖拽期间保持注册（事件完整），
      松手后再注销（不留下幽灵命中区）。
    -->
    <ResizableHandle
      class="layout-handle mt-20 mb-10 opacity-0"
      :class="!left && 'is-collapsed'"
      :disabled="!left && !isBusy"
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
      class="layout-handle mt-20 mb-2 opacity-0"
      :class="!right && 'is-collapsed'"
      :disabled="!right && !isBusy"
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
    // 注意：当前布局暂无 bottom 面板，勿误调 leftPanelRef（历史复制粘贴错误已移除）
  }
}

function panelResize(size: number, type: PanelType) {
  // 面板被外层压成 0 宽时可能算出 NaN/Infinity，直接忽略，避免污染 default-size
  if (!Number.isFinite(size)) return;

  if (type === PanelType.LEFT) {
    // 只在展开态记录默认宽度，避免折叠时的 0/极小值污染 default-size
    if (size >= 20) leftDefaultSize.value = size;
    collapsedLeft(size);
  }
  if (type === PanelType.RIGHT) {
    if (size >= 20) rightDefaultSize.value = size;
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

<style scoped>
/* 折叠态的 handle：宽度（含 after 伪元素命中区）清零并禁用指针事件，
   与 FileManager 侧栏折叠行为一致。保留节点本身，reka 靠 DOM 统计 handle 数量 */
.layout-handle.is-collapsed {
  width: 0;
  min-width: 0;
  pointer-events: none;
}
</style>