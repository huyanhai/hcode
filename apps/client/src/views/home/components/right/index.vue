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
        <!-- 折叠右侧栏的开关；上面的 v-model:right 生效后不能再靠 $attrs 透传，这里显式绑定 -->
        <ChangeTabBtn v-model="right" />
      </template>
    </Tabs>
  </div>
</template>
<script lang="ts" setup>
import Webview from "@/components/webview/index.vue";
import Tabs from "@/components/tabs/index.vue";
import type { TTabItem } from "@/components/tabs/types.js";
import { Globe, Webcam } from "@lucide/vue";
import { h } from "vue";
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
/**
 * 右侧栏展开时若一个 tab 都没有，自动补一个「新标签页」，避免空面板。
 * immediate 覆盖挂载时就是展开态的情况。
 */
watch(
  right,
  (open) => {
    if (open && tabsConfig.value.length === 0) add();
  },
  { immediate: true },
);
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

/** 网页 title 加载完成 → tab 标签换成页面标题 */
function onTitleChange(value: TTabItem["value"], title: string) {
  const tab = findTab(value);
  if (tab && title.trim()) tab.label = title.trim();
}

/** 网页 favicon 加载完成 → tab 图标换成站点图标（取不到就保留默认图标） */
function onFaviconChange(value: TTabItem["value"], favicons: string[]) {
  const tab = findTab(value);
  if (!tab) return;
  const src = favicons.find((item) => /^https?:\/\//.test(item));
  if (!src) return;
  // 函数式组件渲染 <img>，替换掉默认的 Webcam 图标；
  // 部分站点图标需要 Cookie/Referer 才能访问，加载失败时回退默认图标，避免出现裂图
  tab.icon = () =>
    h("img", {
      src,
      alt: "",
      class: "size-4 rounded-sm flex-none object-contain",
      onError: () => {
        tab.icon = Webcam;
      },
    });
}

/** 网页内新开标签（target="_blank"）→ 新开一个 tab 展示并激活 */
function onNewTab(_value: TTabItem["value"], url: string) {
  let label = url;
  try {
    label = new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    // 非法地址保持原样
  }
  const tab = createTab(label, url);
  tabsConfig.value.push(tab);
  activeTab.value = tab.value;
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

/** Webview 走通用 action 通道抛出的事件，按 type 分发 */
function onTabAction(payload: {
  value: TTabItem["value"];
  type: string;
  data?: unknown;
}) {
  // 新标签页上的工具卡片：具体行为（打开变更 / 终端等）由这里接入
  if (payload.type === "newtab-tool") {
    const tool = (payload.data as { tool?: string } | undefined)?.tool ?? "";
    toast.info(`「${findTab(payload.value)?.label ?? payload.value}」触发工具：${tool}`);
    return;
  }
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
    // 还没给地址的新标签页用地球图标，加载出 favicon 后会被替换
    icon: url ? Webcam : Globe,
    value,
    content: Webview,
    props: { url, tabId: value },
    on: {
      "url-change": (next: string) => onUrlChange(value, next),
      "title-change": (title: string) => onTitleChange(value, title),
      "favicon-change": (favicons: string[]) =>
        onFaviconChange(value, favicons),
      "new-tab": (url: string) => onNewTab(value, url),
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
  // 关掉最后一个 tab 时，整个右侧栏跟着收起
  if (tabsConfig.value.length === 0) right.value = false;
}

function add() {
  // 新开 tab 默认是「新标签页」：网址为空，由 Webview 渲染本地起始页
  const tab = createTab("新标签页", "");
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
