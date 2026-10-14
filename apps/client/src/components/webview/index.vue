<template>
  <div class="w-full h-full mt-5 flex flex-col">
    <div class="flex bg-background p-2 items-center gap-1 shrink-0">
      <div class="flex gap-1">
        <div class="flex items-center gap-1 border rounded-full h-8 px-0.5">
          <Button
            size="icon-sm"
            variant="ghost"
            class="rounded-full h-7 w-7"
            :disabled="!canGoBack"
            @click="goBack"
          >
            <ArrowLeft />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            class="rounded-full h-7 w-7"
            :disabled="!canGoForward"
            @click="goForward"
          >
            <ArrowRight />
          </Button>
          <Separator orientation="vertical" class="h-4!" />
          <Button
            size="icon-sm"
            variant="ghost"
            class="rounded-full h-7 w-7"
            @click="reload"
          >
            <RefreshCcw />
          </Button>
        </div>
        <Button
          size="icon-sm"
          :variant="annotating ? 'default' : 'outline'"
          class="rounded-full"
          @click="toggleAnnotation"
        >
          <MousePointer2 />
        </Button>
      </div>
      <div class="flex-1">
        <Input
          v-model="href"
          class="rounded-full h-8"
          placeholder="输入网址"
          spellcheck="false"
          autocomplete="off"
          :aria-invalid="Boolean(error)"
          @keydown.enter="onEnter"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
      <Button
        v-if="isDev"
        size="icon-sm"
        variant="ghost"
        class="rounded-full shrink-0"
        @click="toggleDevTools"
      >
        <Bug />
      </Button>
    </div>
    <div class="relative w-full flex-1 min-h-0">
      <webview
        ref="webviewRef"
        :src="src"
        class="w-full h-full"
        @dom-ready="syncNavState"
        @did-finish-load="onDidFinishLoad"
        @did-navigate="onNavigated"
        @did-navigate-in-page="onNavigated"
        @did-start-loading="onStartLoading"
        @did-stop-loading="syncNavState"
        @did-fail-load="onDidFailLoad"
      ></webview>
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

const DEFAULT_URL = "https://www.baidu.com/";

/** Electron 的 <webview> 在 TS 里没有内置类型，这里声明用到的部分 */
interface WebviewElement extends HTMLElement {
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  capturePage: () => Promise<{ toPNG: () => Uint8Array }>;
  openDevTools: () => void;
  closeDevTools: () => void;
  isDevToolsOpened: () => boolean;
}

const webviewRef = useTemplateRef<WebviewElement>("webviewRef");
/** 地址栏内容（用户可编辑） */
const href = ref(DEFAULT_URL);
/** 真正交给 webview 的地址（只由校验通过的地址写入） */
const src = ref(DEFAULT_URL);
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
let annotationSessionId: string | null = null;
//#region Props
//#endregion
//#region Emits
//#endregion
//#region Hooks
onMounted(() => {
  void nextTick(() => {
    syncNavState();
    registerIpc(webviewRef.value!, onWebviewIpcMessage);
  });
});
onBeforeUnmount(() => {
  unregisterIpc(webviewRef.value!, onWebviewIpcMessage);
  void cancelPageAnnotation();
});
//#endregion
//#region Computed
//#endregion
//#region Watch
watch(src, () => {
  error.value = "";
  void nextTick(syncNavState);
});
//#endregion
//#region Event
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

function onNavigated() {
  syncNavState();
  if (annotating.value) void cancelPageAnnotation();
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
  if (message.channel !== "inspect-confirmed") return;
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
  const sessionId = annotationSessionId ?? selectedSessionId.value;
  if (!sessionId) {
    toast.error("请先选择会话再提交网页批注");
    return;
  }

  let screenshotPngBase64 = "";
  try {
    const image = await webviewRef.value?.capturePage();
    if (image) screenshotPngBase64 = bytesToBase64(image.toPNG());
  } catch {
    // 截图失败不阻塞批注提交
  }

  annotations.enqueue(sessionId, {
    annotation: {
      id: createAnnotationId(),
      anchor: selection.anchor,
      comment: selection.comment,
      styles: selection.styles,
      createdAt: new Date().toISOString(),
    },
    screenshotPngBase64,
  });
  if (!screenshotPngBase64) toast.warning("批注截图获取失败，将只提交描述信息");
}

function createAnnotationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `wa-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
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
//#endregion
//#region Expose
//#endregion
</script>
