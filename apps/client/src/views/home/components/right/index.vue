<template>
  <!--
    想让切 tab 不重新加载网页，加一个 keep-alive（代价是所有 tab 的 webview 都常驻，
    每个都是独立渲染进程，比较吃内存）：
      <Tabs keep-alive ... />
  -->
  <div class="pb-2 h-full pr-2">
    <Tabs
      v-model="activeTab"
      :list="tabsConfig"
      add-able
      closeable
      keep-alive
      @close="close"
      @add="add"
      @tab-action="onTabAction"
      contentClass="rounded-tr-2xl rounded-br-2xl overflow-hidden border border-l-0"
    >
      <template #tab-right>
        <ChangeTabBtn v-bind="$attrs" />
      </template>
    </Tabs>
  </div>
</template>
<script lang="ts" setup>
import Webview from "@/components/webview/index.vue";
import Tabs from "@/components/tabs/index.vue";
import type { TTabItem } from "@/components/tabs/types.js";
import { Webcam } from "@lucide/vue";
import { toast } from "vue-sonner";
import ChangeTabBtn from "../change-tab-btn/index.vue";

const DEFAULT_URL = "https://www.baidu.com/";

/** tab 自增序号：value 必须唯一，reka-ui 靠它区分 tab */
let tabSeq = 0;

const tabsConfig = ref<TTabItem[]>([
  createTab("Account"),
  createTab("Account1"),
]);
/** 当前激活的 tab：受控选中态，新建 tab 时能自动切过去 */
const activeTab = ref<TTabItem["value"]>(tabsConfig.value[0]?.value ?? "");

const right = defineModel<boolean>("right");
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
/**
 * 地址变化 → 把 tab 标题换成域名。
 * value 是建 tab 时就闭包捕获好的，所以这里能精确知道是哪个 webview 报的。
 */
function onUrlChange(value: TTabItem["value"], url: string) {
  const tab = findTab(value);
  if (!tab) return;
  // 记住这个 tab 当前地址：切走时内容会卸载，重新激活要靠它恢复现场
  if (tab.props) tab.props.url = url;
  try {
    tab.label = new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    tab.label = url;
  }
}

/** 主框架加载失败 → 提示一下，失败详情由 Webview 自己展示 */
function onLoadFailed(
  value: TTabItem["value"],
  info: { code: number; desc: string; url: string },
) {
  const tab = findTab(value);
  toast.error(`${tab?.label ?? value} 加载失败：${info.desc}`);
}

/** 网页批注已提交到会话 → 宿主联动入口（接消息列表后可以在这里定向刷新） */
function onAnnotationSubmitted(value: TTabItem["value"]) {
  const tab = findTab(value);
  toast.success(`「${tab?.label ?? value}」的批注已提交到会话`);
}

/** Webview 走通用 action 通道抛出的事件（目前是未知的 ipc 消息），按 type 分发 */
function onTabAction(payload: {
  value: TTabItem["value"];
  type: string;
  data?: unknown;
}) {
  console.debug("[tab-action]", payload);
}
//#endregion
//#region Function
/**
 * 造一个浏览器 tab。两个关键字段：
 * - props：下传给 content 组件（Webview）的入参；
 * - on：监听 content 组件的事件，闭包里已经带上了本 tab 的 value。
 */
function createTab(label: string, url = DEFAULT_URL): TTabItem {
  const value = `browser-${++tabSeq}`;
  return {
    label,
    icon: Webcam,
    value,
    content: Webview,
    props: { url, tabId: value },
    on: {
      "url-change": (next: string) => onUrlChange(value, next),
      "load-failed": (info: { code: number; desc: string; url: string }) =>
        onLoadFailed(value, info),
      "annotation-submitted": () => onAnnotationSubmitted(value),
    },
  };
}

function findTab(value: TTabItem["value"]) {
  return tabsConfig.value.find((item) => item.value === value);
}

function close(key: TTabItem["value"]) {
  tabsConfig.value = tabsConfig.value.filter((item) => item.value !== key);
}

function add() {
  const tab = createTab(`Account${tabsConfig.value.length + 1}`);
  tabsConfig.value.push(tab);
  // 新开的 tab 自动激活
  activeTab.value = tab.value;
}
//#endregion
//#region Life Cycle
//#endregion
//#region Expose
//#endregion
</script>
