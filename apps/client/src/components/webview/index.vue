<template>
  <div class="w-full h-full flex flex-col">
    <div class="flex bg-background p-2 items-center gap-1 shrink-0 border-b">
      <div class="flex gap-1">
        <div class="flex items-center gap-1 border rounded-full h-8 px-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            class="rounded-full h-7 w-7"
            :disabled="isNewTab || !canGoBack"
            @click="goBack"
          >
            <ArrowLeft />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            class="rounded-full h-7 w-7"
            :disabled="isNewTab || !canGoForward"
            @click="goForward"
          >
            <ArrowRight />
          </Button>
          <Separator orientation="vertical" class="h-4!" />
          <Button
            size="icon-sm"
            variant="ghost"
            class="rounded-full h-7 w-7"
            :disabled="isNewTab"
            @click="reload"
          >
            <RefreshCcw />
          </Button>
        </div>
        <Button
          v-if="isDesktop && !isNewTab"
          size="icon-sm"
          :variant="annotating ? 'default' : 'outline'"
          class="rounded-full"
          @click="toggleAnnotation"
        >
          <MousePointer2 />
        </Button>
      </div>
      <div class="flex-1">
        <!--
          未聚焦时只显示「二级域名.主域名」并居中（不带协议，聚焦才显示完整网址）；
          聚焦后编辑的仍是完整 href，回车提交/失焦回退逻辑不变
        -->
        <Input
          ref="addressInputRef"
          :model-value="editingAddress ? href : displayHref"
          @update:model-value="onAddressInput"
          :class="editingAddress ? 'text-left' : 'text-center'"
          class="rounded-full h-8"
          :placeholder="isNewTab ? '搜索或输入网址' : '输入网址'"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="Boolean(error)"
          @keydown.enter="onEnter"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
      <Button
        v-if="isDev && isDesktop && !isNewTab"
        size="icon-sm"
        variant="ghost"
        class="rounded-full shrink-0"
        @click="toggleDevTools"
      >
        <Bug />
      </Button>
    </div>
    <div class="relative w-full flex-1 min-h-0">
      <!-- 新标签页模式（还没有地址）不渲染 webview，改渲染本地起始页 -->
      <webview
        v-if="!isNewTab"
        ref="webviewRef"
        :src="src"
        class="w-full h-full"
        allowpopups
        @dom-ready="syncNavState"
        @did-finish-load="onDidFinishLoad"
        @did-navigate="onNavigated"
        @did-navigate-in-page="onNavigated"
        @did-start-loading="onStartLoading"
        @did-stop-loading="onStoppedLoading"
        @did-fail-load="onDidFailLoad"
        @page-title-updated="onPageTitleUpdated"
        @page-favicon-updated="onPageFaviconUpdated"
      ></webview>
      <NewTabPage v-else @select="onToolSelect" />
      <div
        v-if="loadFailed"
        class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background"
      >
        <p class="font-medium">网页加载失败：{{ loadFailed.desc }}</p>
        <p class="text-sm text-muted-foreground">{{ loadFailed.url }}</p>
        <Button variant="outline" size="sm" class="mt-2" @click="reload">
          <RefreshCcw />
          重试
        </Button>
      </div>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed } from "vue";
import type { ComponentPublicInstance } from "vue";
import { Button } from "../ui/button";
import {
  ArrowLeft,
  ArrowRight,
  Bug,
  MousePointer2,
  RefreshCcw,
} from "@lucide/vue";
import { Input } from "../ui/input";
import { toast } from "vue-sonner";
import type {
  ElementAnchor,
  PageAnnotationSelection,
} from "@hcode/web-annotation";
import pageAgentScript from "@hcode/web-annotation/inspect?raw";
import { useSessionSelection } from "@/stores/session-selection";
import { useWebAnnotationStore } from "@/stores/web-annotation";
import { normalizeUrl } from "@/utils/url";
import { registerIpc, unregisterIpc } from "@/utils/webview";
import NewTabPage from "./new-tab-page.vue";

/** Electron 的 <webview> 在 TS 里没有内置类型，这里声明用到的部分 */
interface WebviewElement extends HTMLElement {
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  /** guest 渲染进程的 webContentsId，用于主进程截图 */
  getWebContentsId: () => number;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
}

//#region Props
const props = withDefaults(
  defineProps<{
    /** 初始地址；空字符串表示「新标签页」（不加载网页，渲染本地起始页）；宿主后续改这个值，组件会跟着跳转 */
    url?: string;
    /** 该实例的身份标识（通常是所属 tab），会附在事件里便于溯源 */
    tabId?: string;
  }>(),
  { url: "", tabId: "" },
);
//#endregion
//#region Emits
const emit = defineEmits<{
  /** 地址变化（用户回车 / 页面内跳转后） */
  "url-change": [url: string];
  /** 页面标题变化（网页 title，用于更新 tab 标签） */
  "title-change": [title: string];
  /** 页面 favicon 变化（图标地址列表，通常取第一个更新 tab 图标） */
  "favicon-change": [favicons: string[]];
  /** 网页内新开标签（target="_blank"），宿主可据此新开 tab */
  "new-tab": [url: string];
  /** 主框架加载失败 */
  "load-failed": [info: { code: number; desc: string; url: string }];
  /** 网页批注已经提交到会话，宿主可据此联动 */
  "annotation-submitted": [sessionId: string];
  /** 通用通道：页面侧新增的 ipc 消息统一从这里出去，宿主不必为每种事件都改组件 */
  action: [payload: { type: string; data?: unknown; tabId?: string }];
}>();
//#endregion

const webviewRef = useTemplateRef<WebviewElement>("webviewRef");
const addressInputRef = useTemplateRef<ComponentPublicInstance>(
  "addressInputRef",
);
/** 地址栏内容（用户可编辑） */
const href = ref(props.url);
/** 真正交给 webview 的地址（只由校验通过的地址写入） */
const src = ref(props.url);
const error = ref("");
/** 主框架加载失败信息；加载中或成功时为 null */
const loadFailed = ref<{ code: number; desc: string; url: string } | null>(
  null,
);
const canGoBack = ref(false);
const canGoForward = ref(false);
const editingAddress = ref(false);
const annotating = ref(false);
const selectedSessionId = useSessionSelection();
const annotations = useWebAnnotationStore();
const isDev = import.meta.env.DEV;
/** 仅 Electron 桌面端展示 webview 专属功能（审查、DevTools）；浏览器里 <webview>/桥不存在 */
const isDesktop = computed(() => Boolean(window.desktop));
let annotationSessionId: string | null = null;
/** 主进程"新开标签"广播的取消订阅函数 */
let disposeNewWindowListener: (() => void) | undefined;
/** 已上报给宿主的地址；初始地址是宿主自己给的，不上报，避免挂载时无意义地刷一遍事件 */
let reportedUrl = props.url;
//#region Hooks
onMounted(() => {
  void nextTick(() => {
    syncNavState();
  });
  // 新标签页模式把光标放进地址栏，和浏览器一致
  if (isNewTab.value) (addressInputRef.value?.$el as HTMLElement)?.focus();
  // 订阅主进程转发的"网页内新开标签"；只有 senderId 等于自己 guest id 的才处理
  disposeNewWindowListener =
    window.desktop?.onWebviewNewWindow?.(({ senderId, url }) => {
      if (senderId !== webviewRef.value?.getWebContentsId?.()) return;
      emit("new-tab", url);
    }) ?? undefined;
});
onBeforeUnmount(() => {
  if (webviewRef.value)
    unregisterIpc(webviewRef.value, onWebviewIpcMessage);
  disposeNewWindowListener?.();
  disposeNewWindowListener = undefined;
  void cancelPageAnnotation();
});
//#endregion
//#region Computed
/** 新标签页模式：还没有加载任何地址，渲染本地起始页而不是 webview */
const isNewTab = computed(() => !src.value);
/** 地址栏展示值：未聚焦只显示 host（含二级域名，不带协议与路径） */
const displayHref = computed(() => {
  try {
    return new URL(href.value).host || href.value;
  } catch {
    return href.value;
  }
});
//#endregion
//#region Watch
watch(src, () => {
  error.value = "";
  void nextTick(syncNavState);
});

// 宿主改传参（例如从别的 tab / 会话跳过来）时跟着跳；非法地址静默忽略，不打扰用户
watch(
  () => props.url,
  (next) => {
    if (!next || next === src.value) return;
    try {
      const target = normalizeUrl(next);
      href.value = target;
      src.value = target;
    } catch {
      // 传参非法，保持当前页面
    }
  },
);

// 新标签页首次导航后 <webview> 才挂载，ipc 监听要跟着元素的挂载/卸载走
watch(webviewRef, (view, prev) => {
  if (prev) unregisterIpc(prev, onWebviewIpcMessage);
  if (view) registerIpc(view, onWebviewIpcMessage);
});
//#endregion
//#region Event
/** 地址栏输入（聚焦时编辑的是完整网址） */
function onAddressInput(value: string | number) {
  href.value = String(value);
}

function onEnter(event: KeyboardEvent) {
  // 中文输入法正在拼字时，回车只用于选词，不跳转
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  submitUrl();
}

/** 聚焦时全选，和浏览器地址栏一致 */
function onFocus(event: FocusEvent) {
  editingAddress.value = true;
  (event.target as HTMLInputElement | null)?.select();
}

/** 失焦时若输入的不是合法地址，回退到当前地址，避免留着半截非法内容 */
function onBlur() {
  editingAddress.value = false;
  if (error.value) href.value = src.value;
  syncNavState();
}
//#endregion
//#region Function

/** 回车：校验通过才更新 webview 地址；地址没变则原地刷新 */
function submitUrl() {
  let next: string;
  try {
    next = normalizeUrl(href.value);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "网址格式不正确";
    toast.error(error.value);
    return;
  }

  href.value = next;
  if (next === src.value) {
    reload();
    return;
  }
  src.value = next;
  reportUrlChange(next);
}

/** 地址变化去重后上报宿主，避免 did-stop-loading 反复触发同一个事件 */
function reportUrlChange(url: string) {
  if (!url || url === reportedUrl) return;
  reportedUrl = url;
  emit("url-change", url);
}

function syncNavState() {
  const view = webviewRef.value;
  if (!view) return;
  try {
    canGoBack.value = view.canGoBack();
    canGoForward.value = view.canGoForward();
    if (!editingAddress.value) {
      const currentUrl = view.getURL();
      if (currentUrl) href.value = currentUrl;
    }
  } catch {
    // webview 未就绪，忽略
  }
}

function onStartLoading() {
  loadFailed.value = null;
  if (annotating.value) void cancelPageAnnotation();
}

/** 页面内跳转 / 前进后退：此时 getURL() 已经是新地址，同步并上报 */
function onNavigated() {
  syncNavState();
  reportUrlChange(href.value);
  if (annotating.value) void cancelPageAnnotation();
}

/** 加载收尾（含重定向）：再同步一次并上报最终地址，reportUrlChange 内部会去重 */
function onStoppedLoading() {
  syncNavState();
  reportUrlChange(href.value);
}

async function cancelPageAnnotation() {
  annotating.value = false;
  annotationSessionId = null;
  // destroy() 内已包含关闭批注卡片（还原实时预览）与清理遮罩
  await webviewRef.value
    ?.executeJavaScript("window.destroy?.()", true)
    .catch(() => undefined);
}

async function onDidFinishLoad() {
  syncNavState();
  await runScriptInWebview(pageAgentScript);
}

function runScriptInWebview(script: Function | string) {
  const view = webviewRef.value;
  if (!view) return Promise.reject(new Error("webview 未就绪"));
  const code = typeof script === "string" ? script : `(${script.toString()})()`;
  return view.executeJavaScript(code, true);
}

async function toggleAnnotation() {
  if (annotating.value) {
    await cancelPageAnnotation();
    return;
  }
  annotating.value = true;
  // 记住进入审查时所在的会话，批注确认后提交到该会话
  annotationSessionId = selectedSessionId.value || null;
  // 页面脚本未注入时回退按钮状态
  await runScriptInWebview("window.inspect?.()").catch(() => {
    annotating.value = false;
  });
}

// 今天消息
function onWebviewIpcMessage(event: Event) {
  const message = event as Event & { channel?: string; args?: unknown[] };
  // 页面里按 Esc 自行退出审查，同步工具栏按钮状态
  if (message.channel === "inspect-exited") {
    annotating.value = false;
    annotationSessionId = null;
    return;
  }
  // 页面侧 preload 桥：ipcRenderer.sendToHost("inspect-confirmed", selection)
  if (message.channel !== "inspect-confirmed") {
    // 其他消息统一走 action 通道，宿主按 type 分发，组件不用跟着改
    emit("action", {
      type: message.channel ?? "unknown",
      data: message.args?.[0],
      tabId: props.tabId || undefined,
    });
    return;
  }
  const selection = message.args?.[0];
  if (!isPageAnnotationSelection(selection)) {
    toast.error("网页批注数据无效");
    return;
  }
  void handleAnnotationConfirmed(selection);
}

/** 页面里确认的批注是否可用（IPC 负载来自页面，做一次形状校验） */
function isPageAnnotationSelection(
  value: unknown,
): value is PageAnnotationSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<PageAnnotationSelection>;
  return (
    !!selection.anchor &&
    typeof selection.anchor.selector === "string" &&
    typeof selection.comment === "string"
  );
}

/** 截图 + 组装批注，交给消息区消费（上传附件并提交到会话） */
async function handleAnnotationConfirmed(selection: PageAnnotationSelection) {
  // 截图前隐藏批注卡片（评论弹窗不应出现在截图里；pin 标记保留），
  // 截完立即移除样式还原
  await runScriptInWebview(
    "(() => {" +
      "document.getElementById('hcode-capture-suppress')?.remove();" +
      "const style = document.createElement('style');" +
      "style.id = 'hcode-capture-suppress';" +
      "style.textContent = 'h-annotation .card{display:none !important}';" +
      "document.head.append(style);" +
    "})()",
  ).catch(() => undefined);
  // 等浏览器渲染出一帧再截图，避免截到样式生效前的画面
  await new Promise((resolve) => setTimeout(resolve, 100));
  // 页面在确认后保留了批注边框与 marker，先截图再让页面清除边框。
  // 截图必须在主进程做：<webview>.capturePage() 会让宿主渲染进程崩溃。
  let screenshotPngBase64 = "";
  try {
    const guestId = webviewRef.value?.getWebContentsId?.();
    if (guestId) {
      screenshotPngBase64 =
        (await window.desktop?.captureWebview(guestId).catch(() => "")) ?? "";
    }
  } catch {
    // 截图失败不阻塞批注提交
  }
  await runScriptInWebview(
    "document.getElementById('hcode-capture-suppress')?.remove()",
  ).catch(() => undefined);
  await runScriptInWebview("window.releaseAnnotationHighlight?.()").catch(
    () => undefined,
  );

  const sessionId = annotationSessionId ?? selectedSessionId.value;
  if (!sessionId) {
    toast.error("请先选择会话再提交网页批注");
    return;
  }

  annotations.enqueue(sessionId, {
    annotation: {
      id: createAnnotationId(),
      anchor: selection.anchor,
      comment: selection.comment,
      styles: selection.styles,
      pinIndex: selection.pinIndex,
      createdAt: new Date().toISOString(),
    },
    screenshotPngBase64,
  });
  if (!screenshotPngBase64) toast.warning("批注截图获取失败，将只提交描述信息");
  // 通知宿主：这个 webview 刚往会话里塞了一条批注
  emit("annotation-submitted", sessionId);
}

function createAnnotationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `wa-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

/** 页面标题 / favicon 更新：透传给宿主更新 tab 标签与图标 */
function onPageTitleUpdated(event: { title: string }) {
  if (event.title) emit("title-change", event.title);
}

function onPageFaviconUpdated(event: { favicons: string[] }) {
  if (event.favicons?.length) emit("favicon-change", event.favicons);
}

/** 主框架加载失败时给出可见的错误页，避免只有一块空白 */
function onDidFailLoad(event: {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
}) {
  // 只关心主框架；-3 是 ERR_ABORTED（跳转/重定向打断），不算失败
  if (!event.isMainFrame || event.errorCode === -3) return;
  loadFailed.value = {
    code: event.errorCode,
    desc: event.errorDescription,
    url: event.validatedURL,
  };
  emit("load-failed", { ...loadFailed.value });
}

/** 新标签页工具卡片点击：走通用 action 通道，具体行为由宿主决定 */
function onToolSelect(tool: string) {
  emit("action", {
    type: "newtab-tool",
    data: { tool },
    tabId: props.tabId || undefined,
  });
}

function goBack() {
  try {
    webviewRef.value?.goBack();
  } catch {
    // 非 Electron 环境下 webview 不可用
  }
}

function goForward() {
  try {
    webviewRef.value?.goForward();
  } catch {
    // 非 Electron 环境下 webview 不可用
  }
}

function reload() {
  try {
    webviewRef.value?.reload();
  } catch {
    // 非 Electron 环境下 webview 不可用
  }
}

/**
 * 打开/关闭这个 webview 自己的 DevTools。
 * guest 页面是独立的 webContents，主窗口的 DevTools 看不到它。
 */
function toggleDevTools() {
  const view = webviewRef.value;
  if (!view) return;
  try {
    if (view.isDevToolsOpened()) view.closeDevTools();
    else view.openDevTools();
  } catch {
    toast.error("调试窗口仅在 Electron 客户端中可用");
  }
}
/** 宿主指定地址跳转（走地址栏同一套校验，非法地址会提示） */
function navigate(url: string) {
  href.value = url;
  submitUrl();
}
//#endregion
//#region Expose
/** 暴露给宿主（tab 层）的方法，可对某一个 tab 定向操作 */
defineExpose({
  navigate,
  reload,
  goBack,
  goForward,
  getWebContentsId: () => webviewRef.value?.getWebContentsId?.(),
});
//#endregion
</script>
