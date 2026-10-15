<template>
  <!--
    左侧目录树 + 右侧编辑区的可拖拽分栏，做法与 components/layout/index.vue 一致。
    面板会随 tab 动态挂载/卸载，reka splitter 要求每个面板都提供 id + order，
    否则尺寸状态会错乱；组 id 也要与 layout 的 main-layout 区分开。
  -->
  <ResizablePanelGroup id="file-manager" direction="horizontal" class="fm-root">
    <ResizablePanel
      id="fm-sidebar"
      ref="sidebarRef"
      :order="0"
      :min-size="SIDEBAR_MIN_SIZE"
      :max-size="60"
      :default-size="sidebarDefaultSize"
      :collapsed-size="0"
      :collapsible="true"
      @resize="onSidebarResize"
    >
      <aside class="fm-sidebar">
        <header class="fm-toolbar">
          <span class="fm-root-label" :title="store.root">
            {{ store.rootLabel }}
          </span>
        </header>

        <div class="fm-tree-wrap">
          <FileTree
            :items="store.tree"
            :expanded="store.expandedPaths"
            :active-path="store.activePath"
            :loading-paths="store.loadingPaths"
            :rowHeight="32"
            @update:expanded="onExpandedChange"
            @open="openFile"
            @contextmenu="onTreeContextMenu"
          />
        </div>
      </aside>
    </ResizablePanel>

    <!--
      折叠后分割线一并禁用并隐藏：此时唯一能恢复的方式是点工具栏的展开按钮。
      用 disabled 而不是 v-if —— reka 靠 DOM 查询统计 handle 数量，
      把元素摘掉会让它在布局重算时找不到 handle。
    -->
    <ResizableHandle
      class="fm-handle"
      :disabled="!sidebarOpen"
      @dragging="isDragging = $event"
    />

    <ResizablePanel id="fm-editor" :order="1" :min-size="30">
      <section class="fm-content">
        <div class="fm-toolbar fm-content-toolbar">
          <button
            type="button"
            class="fm-icon-button"
            :title="sidebarOpen ? '收起侧栏' : '展开侧栏'"
            @click="toggleSidebar"
          >
            <PanelLeftClose
              :size="14"
              :style="{ transform: sidebarOpen ? 'none' : 'rotate(180deg)' }"
            />
          </button>

          <span
            v-if="activeFile"
            class="fm-active-path"
            :title="activeFile.path"
          >
            {{ activeFile.path }}
          </span>
          <span v-else class="fm-active-path fm-placeholder">未打开文件</span>

          <div class="fm-actions">
            <button type="button" title="保存 (Cmd/Ctrl+S)" @click="save()">
              <Save :size="14" />
            </button>
          </div>
        </div>

        <FileTabs
          :files="store.openFiles"
          :active-path="store.activePath"
          @select="store.setActive"
          @close="closeTab"
        />

        <div class="fm-editor-wrap">
          <FileEditor
            v-if="activeFile"
            :key="activeFile.path"
            :file="activeFile"
            @change="onEditorChange"
            @save="save(activeFile.path)"
          />
          <div v-else class="fm-placeholder-panel">
            从左侧目录树选择一个文件开始编辑
          </div>
        </div>

        <footer v-if="status || store.hasDirtyFiles" class="fm-status">
          <AlertTriangle
            v-if="store.hasDirtyFiles"
            :size="12"
            class="fm-status-icon"
          />
          <ChevronUp v-if="store.hasDirtyFiles" :size="12" />
          <ChevronDown v-else :size="12" />
          <span>{{ status || "有未保存的修改" }}</span>
        </footer>
      </section>
    </ResizablePanel>
  </ResizablePanelGroup>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  PanelLeftClose,
  RefreshCw,
  Save,
} from "lucide-vue-next";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable/index";
import FileEditor from "./FileEditor.vue";
import FileTabs from "./FileTabs.vue";
import FileTree from "./FileTree.vue";
import { useFileManagerStore } from "../store";
import type { FileNode, FileProvider } from "../types";
import { basename, dirname, joinPath } from "../utils/path";

/** 侧栏最小占比（%），与侧栏面板的 `min-size` 保持一致，低于它就认为已折叠。 */
const SIDEBAR_MIN_SIZE = 15;
/** 首次挂载时侧栏占比。 */
const SIDEBAR_DEFAULT_SIZE = 40;

const props = defineProps<{
  provider: FileProvider;
  /** 文件树根目录。 */
  root: string;
  /** 覆盖默认忽略列表。 */
  ignore?: string[];
  /** 是否监听外部文件变更。 */
  watch?: boolean;
  /** 关闭有未保存改动的标签时是否直接关闭（false 时触发 beforeunload 拦截）。 */
  forceClose?: boolean;
}>();

const emit = defineEmits<{
  (event: "error", error: Error): void;
}>();

const store = useFileManagerStore();
const sidebarOpen = ref(true);
const sidebarDefaultSize = ref(SIDEBAR_DEFAULT_SIZE);
const isDragging = ref(false);
const status = ref("");
const stopWatch = ref<(() => void) | undefined>(undefined);

const sidebarRef = useTemplateRef<typeof ResizablePanel>("sidebarRef");

const activeFile = computed(() => store.activeFile);

/**
 * reka Splitter 在完成首次布局测量之前，collapse/expand 等命令式调用会
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

/**
 * 拖动分割线时同步侧栏开关。
 *
 * reka 允许把面板一路吸附折叠到 0 宽，这时尺寸会小于 `min-size`，
 * 必须把开关置为 false —— 否则下次点按钮会以为「本来就是展开的」而先折叠一次。
 */
function onSidebarResize(size: number): void {
  if (size < SIDEBAR_MIN_SIZE) {
    sidebarOpen.value = false;
    return;
  }
  // 只在展开态记录宽度，避免把折叠时的 0 当成下次挂载的默认值
  sidebarDefaultSize.value = size;
  sidebarOpen.value = true;
}

function toggleSidebar(): void {
  sidebarOpen.value = !sidebarOpen.value;
}

watch(sidebarOpen, (open) => {
  // 拖拽过程中 reka 自己在改尺寸，这里再下一次命令会跟它打架
  if (isDragging.value) return;
  guardSplitter(() =>
    open ? sidebarRef.value?.expand() : sidebarRef.value?.collapse(),
  );
});

onMounted(async () => {
  try {
    await store.initialize({
      provider: props.provider,
      root: props.root,
      ignore: props.ignore,
    });
    if (props.watch !== false) stopWatch.value = store.startWatching();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    status.value = `初始化失败：${err.message}`;
    emit("error", err);
  }
});

onBeforeUnmount(() => {
  stopWatch.value?.();
});

/** 统一的错误处理：状态栏提示 + 向上抛给宿主。 */
async function guard(action: () => Promise<void>): Promise<void> {
  try {
    status.value = "";
    await action();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    status.value = err.message;
    emit("error", err);
  }
}

function flash(message: string): void {
  status.value = message;
  setTimeout(() => {
    if (status.value === message) status.value = "";
  }, 2000);
}

async function save(path?: string): Promise<void> {
  await guard(async () => {
    await store.save(path);
    flash("已保存");
  });
}

function closeTab(path: string): Promise<void> | void {
  const file = store.openFiles.find((item) => item.path === path);
  if (!file) return;
  const dirty = file.content !== file.savedContent;

  if (dirty && !props.forceClose) {
    const choice = window.confirm(`${file.name} 有未保存的修改，确定关闭？`);
    if (!choice) return;
  }
  store.closeFile(path);
}

/** 编辑器内容变化：直接写回对应打开项，脏检查由 store 对比 savedContent 完成。 */
function onEditorChange(content: string): void {
  const file = store.openFiles.find(
    (item) => item.path === activeFile.value?.path,
  );
  if (file) file.content = content;
}

function promptCreate(parentPath: string, kind: "file" | "directory"): void {
  const label = kind === "file" ? "新建文件" : "新建文件夹";
  const name = window.prompt(`${label}名称`);
  if (!name?.trim()) return;

  void guard(async () => {
    const target = joinPath(parentPath, name.trim());
    if (kind === "file") await store.createFile(parentPath, name.trim());
    else await store.createDirectory(parentPath, name.trim());
    flash(`已创建 ${basename(target)}`);
  });
}

function promptRename(node: FileNode): void {
  const next = window.prompt("重命名", node.name);
  if (!next?.trim() || next.trim() === node.name) return;

  void guard(async () => {
    await store.renameNode(node.path, next.trim());
    flash("已重命名");
  });
}

function confirmDelete(node: FileNode): void {
  const label = node.type === "directory" ? "文件夹（含全部内容）" : "文件";
  if (!window.confirm(`确定删除${label}「${node.name}」？此操作不可撤销。`))
    return;

  void guard(async () => {
    await store.removeNode(node.path, node.type === "directory");
    flash("已删除");
  });
}

function onTreeContextMenu(payload: {
  event: MouseEvent;
  node: FileNode;
}): void {
  const { event, node } = payload;
  const parent = dirname(node.path);
  const action = window.prompt(
    `对「${node.name}」执行操作：\n1 = 重命名\n2 = 删除\n3 = 在同级新建文件\n4 = 在同级新建文件夹`,
    "1",
  );
  event.preventDefault();

  switch (action?.trim()) {
    case "1":
      promptRename(node);
      break;
    case "2":
      confirmDelete(node);
      break;
    case "3":
      promptCreate(parent, "file");
      break;
    case "4":
      promptCreate(parent, "directory");
      break;
    default:
      break;
  }
}

async function refreshAll(): Promise<void> {
  await guard(async () => {
    await store.refresh(store.root);
    flash("已刷新");
  });
}

/** 展开项变化：由 store 补齐新展开目录的子节点（懒加载）。 */
function onExpandedChange(paths: string[]): void {
  void guard(() => store.setExpanded(paths));
}

/** 点击文件：打开并激活。 */
function openFile(path: string): void {
  void guard(() => store.openFile(path));
}

/** 有未保存改动时拦截关闭，与主流编辑器一致。 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!store.hasDirtyFiles) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() =>
  window.removeEventListener("beforeunload", onBeforeUnload),
);
</script>

<style scoped>
.fm-root {
  height: 100%;
  min-height: 0;
  background: var(--fm-editor-bg, #ffffff);
  color: var(--fm-fg, #111827);
  font-size: 13px;
}

/*
  宽度交给 ResizablePanel 控制，这里只负责填满并裁掉溢出 ——
  折叠到 0 宽时树内容若撑出来，会把编辑区顶开。
  分隔线由 ResizableHandle（.fm-handle）提供，这里不再加 border，
  否则折叠后仍会残留 1px。
*/
.fm-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--fm-sidebar-bg, #fafafa);
}

.fm-tree-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.fm-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

/* 覆盖 ResizableHandle 默认的 1px bg-border，hover 时给一个「可拖」的提示 */
.fm-handle {
  width: 2px;
  background: var(--fm-border, #e5e7eb);
  transition: background 0.15s ease;
}

.fm-handle:hover {
  background: var(--fm-accent, #9ca3af);
}

/* 侧栏折叠后：线不显示、宽度归零、无法拖拽，只能靠工具栏按钮展开 */
.fm-handle[data-disabled] {
  width: 0;
  opacity: 0;
  pointer-events: none;
}

.fm-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--fm-border, #e5e7eb);
}

.fm-content-toolbar {
  background: var(--fm-tabs-bg, #f3f4f6);
}

.fm-root-label {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fm-active-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fm-fg-muted, #6b7280);
}

.fm-actions {
  display: flex;
  gap: 2px;
  margin-left: auto;
}

.fm-actions button,
.fm-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.fm-actions button:hover,
.fm-icon-button:hover {
  background: var(--fm-hover, rgba(0, 0, 0, 0.08));
}

.fm-editor-wrap {
  flex: 1;
  min-height: 0;
}

.fm-placeholder-panel {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--fm-fg-muted, #9ca3af);
}

.fm-placeholder {
  color: var(--fm-fg-muted, #9ca3af);
}

.fm-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--fm-fg-muted, #6b7280);
  border-top: 1px solid var(--fm-border, #e5e7eb);
  background: var(--fm-sidebar-bg, #fafafa);
}

.fm-status-icon {
  color: var(--fm-danger, #dc2626);
}
</style>
