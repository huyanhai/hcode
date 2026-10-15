<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FilePlus,
  FolderPlus,
  PanelLeftClose,
  RefreshCw,
  Save,
} from "lucide-vue-next";
import FileEditor from "./FileEditor.vue";
import FileTabs from "./FileTabs.vue";
import FileTree from "./FileTree.vue";
import { useFileManagerStore } from "../store";
import type { FileNode, FileProvider } from "../types";
import { basename, dirname, joinPath } from "../utils/path";

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
const status = ref("");
const stopWatch = ref<(() => void) | undefined>(undefined);

const activeFile = computed(() => store.activeFile);

onMounted(async () => {
  try {
    await store.initialize({ provider: props.provider, root: props.root, ignore: props.ignore });
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

async function closeTab(path: string): Promise<void> {
  const file = store.openFiles.find((item) => item.path === path);
  if (!file) return;
  const dirty = file.content !== file.savedContent;

  if (dirty && !props.forceClose) {
    const choice = window.confirm(`${file.name} 有未保存的修改，确定关闭？`);
    if (!choice) return;
  }
  store.closeFile(path);
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
  if (!window.confirm(`确定删除${label}「${node.name}」？此操作不可撤销。`)) return;

  void guard(async () => {
    await store.removeNode(node.path, node.type === "directory");
    flash("已删除");
  });
}

function onTreeContextMenu(payload: { event: MouseEvent; node: FileNode }): void {
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

/** 有未保存改动时拦截关闭，与主流编辑器一致。 */
function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!store.hasDirtyFiles) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", onBeforeUnload));
</script>

<template>
  <div class="fm-root">
    <aside v-show="sidebarOpen" class="fm-sidebar">
      <header class="fm-toolbar">
        <span class="fm-root-label" :title="store.root">{{ store.rootLabel }}</span>
        <div class="fm-actions">
          <button type="button" title="新建文件" @click="promptCreate(store.root, 'file')">
            <FilePlus :size="14" />
          </button>
          <button type="button" title="新建文件夹" @click="promptCreate(store.root, 'directory')">
            <FolderPlus :size="14" />
          </button>
          <button type="button" title="刷新" @click="refreshAll">
            <RefreshCw :size="14" />
          </button>
        </div>
      </header>

      <div class="fm-tree-wrap">
        <FileTree
          :rows="store.flatRows"
          :active-path="store.activePath"
          @toggle="store.toggle"
          @open="store.openFile"
          @contextmenu="onTreeContextMenu"
        />
      </div>
    </aside>

    <section class="fm-content">
      <div class="fm-toolbar fm-content-toolbar">
        <button
          type="button"
          class="fm-icon-button"
          :title="sidebarOpen ? '收起侧栏' : '展开侧栏'"
          @click="sidebarOpen = !sidebarOpen"
        >
          <PanelLeftClose :size="14" :style="{ transform: sidebarOpen ? 'none' : 'rotate(180deg)' }" />
        </button>

        <span v-if="activeFile" class="fm-active-path" :title="activeFile.path">
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
          @change="(content) => { const f = store.openFiles.find(i => i.path === activeFile?.path); if (f) f.content = content; }"
          @save="save(activeFile.path)"
        />
        <div v-else class="fm-placeholder-panel">从左侧目录树选择一个文件开始编辑</div>
      </div>

      <footer v-if="status || store.hasDirtyFiles" class="fm-status">
        <AlertTriangle v-if="store.hasDirtyFiles" :size="12" class="fm-status-icon" />
        <ChevronUp v-if="store.hasDirtyFiles" :size="12" />
        <ChevronDown v-else :size="12" />
        <span>{{ status || "有未保存的修改" }}</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.fm-root {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--fm-editor-bg, #ffffff);
  color: var(--fm-fg, #111827);
  font-size: 13px;
}

.fm-sidebar {
  display: flex;
  flex-direction: column;
  width: 260px;
  flex: 0 0 260px;
  min-height: 0;
  border-right: 1px solid var(--fm-border, #e5e7eb);
  background: var(--fm-sidebar-bg, #fafafa);
}

.fm-tree-wrap {
  flex: 1;
  min-height: 0;
}

.fm-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
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
