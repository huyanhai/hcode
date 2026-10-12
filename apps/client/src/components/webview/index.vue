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
        size="icon-sm"
        variant="outline"
        class="rounded-full"
        @click="copyAddress"
      >
        <Copy />
      </Button>
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
  Copy,
  MousePointer2,
  RefreshCcw,
} from "@lucide/vue";
import { Input } from "../ui/input";
import { toast } from "vue-sonner";
import type {
  ConfirmedWebAnnotation,
  ElementAnchor,
  StyleChanges,
} from "@hcode/web-annotation";
import { editableStyles } from "@hcode/web-annotation";
import {
  applyStylePreview,
  composePageAnnotation,
  selectPageElement,
} from "@hcode/web-annotation/page-agent";
import { useSessionSelection } from "@/stores/session-selection";
import { useWebAnnotationStore } from "@/stores/web-annotation";
import { normalizeUrl } from "@/utils/url";

const DEFAULT_URL = "https://www.github.com/";

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
let annotationCancelRequested = false;
//#region Props
//#endregion
//#region Emits
//#endregion
//#region Hooks
onMounted(() => {
  void nextTick(syncNavState);
});
onBeforeUnmount(() => {
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
  if (annotating.value) annotationCancelRequested = true;
  await webviewRef.value
    ?.executeJavaScript(
      "window.__hcodeAnnotationCancel?.();window.__hcodeAnnotationComposerCancel?.()",
      true,
    )
    .catch(() => undefined);
}

function isElementAnchor(value: unknown): value is ElementAnchor {
  if (!value || typeof value !== "object") return false;
  const anchor = value as Partial<ElementAnchor>;
  return (
    anchor.kind === "element" &&
    typeof anchor.pageUrl === "string" &&
    typeof anchor.pageTitle === "string" &&
    typeof anchor.selector === "string" &&
    typeof anchor.tagName === "string" &&
    typeof anchor.label === "string" &&
    !!anchor.rect &&
    !!anchor.styles
  );
}

interface AnnotationDraft {
  comment: string;
  changes: StyleChanges;
}

function isAnnotationDraft(value: unknown): value is AnnotationDraft | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const draft = value as { comment?: unknown; changes?: unknown };
  return (
    typeof draft.comment === "string" &&
    !!draft.changes &&
    typeof draft.changes === "object"
  );
}

function sanitizeChanges(value: StyleChanges): StyleChanges {
  const changes: StyleChanges = {};
  for (const style of editableStyles) {
    const candidate = value[style];
    if (typeof candidate === "string" && candidate.trim() && candidate.length <= 256) {
      changes[style] = candidate.trim();
    }
  }
  return changes;
}

async function toggleAnnotation() {
  if (annotating.value) {
    await cancelPageAnnotation();
    return;
  }

  const view = webviewRef.value;
  if (!view) return toast.error("网页尚未就绪");
  if (!selectedSessionId.value) return toast.error("请先选择会话");

  const sessionId = selectedSessionId.value;
  annotationCancelRequested = false;
  annotating.value = true;
  let anchor: ElementAnchor | undefined;
  try {
    await view.executeJavaScript('console.log(123)', true);
    const selected: unknown = await view.executeJavaScript(
      `(${selectPageElement.toString()})()`,
      true,
    );
    if (!isElementAnchor(selected)) return;
    anchor = selected;

    const expression = `(${composePageAnnotation.toString()})(${JSON.stringify(anchor)},(${applyStylePreview.toString()}))`;
    const draftValue = await view.executeJavaScript(expression, true);
    if (!isAnnotationDraft(draftValue)) throw new Error("网页批注数据无效");
    if (!draftValue) return;
    if (anchor.pageUrl !== view.getURL()) {
      throw new Error("网页已变化，请重新选择元素");
    }

    const changes = sanitizeChanges(draftValue.changes);
    const image = await view.capturePage();
    const screenshotPngBase64 = bytesToBase64(image.toPNG());
    if (!screenshotPngBase64) throw new Error("网页截图失败");

    const result: ConfirmedWebAnnotation = {
      annotation: {
        id: crypto.randomUUID(),
        anchor,
        comment: draftValue.comment.trim().slice(0, 10_000),
        changes,
        createdAt: new Date().toISOString(),
      },
      screenshotPngBase64,
    };
    annotations.enqueue(sessionId, result);
    toast.success("批注和网页截图已确认，正在发送");
  } catch (cause) {
    if (!annotationCancelRequested) {
      toast.error(cause instanceof Error ? cause.message : "网页批注失败");
    }
  } finally {
    if (anchor) await restorePageStyles(view, anchor);
    annotationCancelRequested = false;
    annotating.value = false;
  }
}

async function restorePageStyles(view: WebviewElement, anchor: ElementAnchor) {
  const expression = `(${applyStylePreview.toString()})(${JSON.stringify(anchor.selector)},{})`;
  await view.executeJavaScript(expression, true).catch(() => undefined);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function copyAddress() {
  try {
    const currentUrl = webviewRef.value?.getURL() || src.value;
    if (!currentUrl) return;
    await navigator.clipboard.writeText(currentUrl);
    toast.success("已复制网页地址");
  } catch {
    toast.error("复制网页地址失败");
  }
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
