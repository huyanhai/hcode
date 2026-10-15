import { defineStore } from "pinia";
import { computed, reactive, ref, shallowRef } from "vue";
import type { FileNode, FileProvider } from "./types";
import { dirname, joinPath } from "./utils/path";

/** 展开后的可见行，供虚拟滚动使用。 */
export interface FlatRow {
  node: FileNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  loading: boolean;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  /** 上次保存到磁盘的内容，用于脏检查。 */
  savedContent: string;
  /** 打开时的 mtime，用于检测外部修改。 */
  mtimeMs: number;
  loading: boolean;
  error: string | null;
  /** 检测到磁盘版本比打开时更新，且本地也有改动。 */
  conflicted: boolean;
}

/** 默认忽略项：跳过依赖与构建产物，避免无意义加载。 */
const DEFAULT_IGNORE = [
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".cache",
  ".DS_Store",
  "*.log",
  "*.lock",
];

export const useFileManagerStore = defineStore("file-manager", () => {
  const provider = shallowRef<FileProvider | null>(null);
  const root = ref("");
  const tree = ref<FileNode[]>([]);
  const expandedPaths = ref(new Set<string>());
  /** 正在加载子目录的路径，避免重复请求。 */
  const loadingPaths = ref(new Set<string>());
  const ignore = ref<string[]>([...DEFAULT_IGNORE]);

  const openFiles = ref<OpenFile[]>([]);
  const activePath = ref("");

  const rootLabel = computed(() => provider.value?.rootLabel ?? "");

  const activeFile = computed(
    () => openFiles.value.find((file) => file.path === activePath.value) ?? null,
  );

  const hasDirtyFiles = computed(() =>
    openFiles.value.some((file) => file.content !== file.savedContent),
  );

  /**
   * 把树拍平成可见行列表。
   *
   * 目录树节点数量可能上万（尤其 node_modules 未忽略干净时），
   * 递归组件直接渲染会卡死，因此统一走扁平列表 + 虚拟滚动。
   */
  const flatRows = computed<FlatRow[]>(() => {
    const rows: FlatRow[] = [];
    const expanded = expandedPaths.value;

    const walk = (nodes: FileNode[], depth: number): void => {
      // 目录优先、同类按名称排序，与主流编辑器一致
      const sorted = [...nodes].sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });

      for (const node of sorted) {
        const hasChildren = node.type === "directory";
        const isExpanded = expanded.has(node.path);
        rows.push({
          node,
          depth,
          hasChildren,
          expanded: isExpanded,
          loading: loadingPaths.value.has(node.path),
        });
        if (hasChildren && isExpanded && node.children?.length) {
          walk(node.children, depth + 1);
        }
      }
    };

    walk(tree.value, 0);
    return rows;
  });

  /** 递归查找节点。 */
  function findNode(path: string, nodes: FileNode[] = tree.value): FileNode | null {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children?.length) {
        const found = findNode(path, node.children);
        if (found) return found;
      }
    }
    return null;
  }

  /** 初始化：绑定数据源并加载根目录。 */
  async function initialize(options: {
    provider: FileProvider;
    root: string;
    ignore?: string[];
  }): Promise<void> {
    provider.value = options.provider;
    root.value = options.root;
    if (options.ignore) ignore.value = options.ignore;
    tree.value = await options.provider.list({ path: options.root, ignore: ignore.value });
  }

  /** 展开目录：首次展开时懒加载子节点，之后复用缓存。 */
  async function toggle(path: string): Promise<void> {
    const next = new Set(expandedPaths.value);
    if (next.has(path)) {
      next.delete(path);
      expandedPaths.value = next;
      return;
    }

    next.add(path);
    expandedPaths.value = next;

    const node = findNode(path);
    if (!node || node.type !== "directory" || node.children?.length || loadingPaths.value.has(path)) {
      return;
    }

    loadingPaths.value = new Set(loadingPaths.value).add(path);
    try {
      const children = await provider.value!.list({ path, ignore: ignore.value });
      node.children = children;
    } catch (error) {
      // 加载失败时收起，避免留下一个永远转圈的节点
      const rollback = new Set(expandedPaths.value);
      rollback.delete(path);
      expandedPaths.value = rollback;
      throw error;
    } finally {
      const done = new Set(loadingPaths.value);
      done.delete(path);
      loadingPaths.value = done;
    }
  }

  /** 刷新单个目录（新建/重命名/删除后调用）。 */
  async function refresh(path: string): Promise<void> {
    const node = findNode(path);
    if (!node || node.type !== "directory" || !expandedPaths.value.has(path)) return;
    node.children = await provider.value!.list({ path, ignore: ignore.value });
  }

  /** 打开文件。若已打开则直接激活，不重复读盘。 */
  async function openFile(path: string): Promise<void> {
    const existing = openFiles.value.find((file) => file.path === path);
    if (existing) {
      activePath.value = path;
      return;
    }

    const node = findNode(path);
    // 注意必须是响应式对象：先建普通对象再推入数组的话，后续对原始引用的
    // 属性赋值不会触发依赖更新，UI 会永远停在「加载中」。
    const entry = reactive<OpenFile>({
      path,
      name: node?.name ?? path.split("/").pop() ?? path,
      content: "",
      savedContent: "",
      mtimeMs: node?.mtimeMs ?? 0,
      loading: true,
      error: null,
      conflicted: false,
    });
    openFiles.value = [...openFiles.value, entry];
    activePath.value = path;

    try {
      entry.content = await provider.value!.read(path);
      entry.savedContent = entry.content;
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    } finally {
      entry.loading = false;
    }
  }

  /** 保存当前（或指定）文件。检测磁盘版本变化以提示冲突。 */
  async function save(path?: string): Promise<void> {
    const target = path ?? activePath.value;
    const file = openFiles.value.find((item) => item.path === target);
    if (!file || file.content === file.savedContent) return;

    // 保存前复查磁盘 mtime：期间被外部程序改动过则标记冲突
    const node = findNode(file.path);
    if (node && file.mtimeMs > 0 && node.mtimeMs > file.mtimeMs) {
      file.conflicted = true;
      throw new Error("文件已被外部程序修改，请先解决冲突再保存。");
    }

    await provider.value!.write({ path: file.path, content: file.content, overwrite: true });
    file.savedContent = file.content;
    file.conflicted = false;
    if (node) file.mtimeMs = node.mtimeMs;
    await refresh(dirname(file.path));
  }

  /** 放弃本地改动。 */
  function revert(path?: string): void {
    const target = path ?? activePath.value;
    const file = openFiles.value.find((item) => item.path === target);
    if (!file) return;
    file.content = file.savedContent;
    file.conflicted = false;
  }

  function closeFile(path: string): void {
    const index = openFiles.value.findIndex((file) => file.path === path);
    if (index === -1) return;

    openFiles.value = openFiles.value.filter((file) => file.path !== path);
    if (activePath.value === path) {
      // 优先激活右侧文件，其次左侧
      const next = openFiles.value[index] ?? openFiles.value[index - 1];
      activePath.value = next?.path ?? "";
    }
  }

  function setActive(path: string): void {
    activePath.value = path;
  }

  /** 新建文件并打开。 */
  async function createFile(parentPath: string, name: string): Promise<void> {
    const path = joinPath(parentPath, name);
    await provider.value!.write({ path, content: "", overwrite: false });
    await refresh(parentPath);
    await openFile(path);
  }

  async function createDirectory(parentPath: string, name: string): Promise<void> {
    const path = joinPath(parentPath, name);
    await provider.value!.mkdir(path);
    await refresh(parentPath);
  }

  /** 重命名节点，并同步已打开文件的引用。 */
  async function renameNode(path: string, newName: string): Promise<void> {
    const parent = dirname(path);
    const newPath = joinPath(parent, newName);
    await provider.value!.rename({ path, newPath });
    await refresh(parent);

    const moved = openFiles.value.find((file) => file.path === path);
    if (moved) {
      const refreshed = findNode(newPath);
      openFiles.value = openFiles.value.map((file) =>
        file.path === path ? { ...file, path: newPath, name: newName, mtimeMs: refreshed?.mtimeMs ?? file.mtimeMs } : file,
      );
      if (activePath.value === path) activePath.value = newPath;
    }
  }

  async function removeNode(path: string, recursive = false): Promise<void> {
    await provider.value!.remove({ path, recursive });
    const parent = dirname(path);
    await refresh(parent);

    openFiles.value
      .filter((file) => file.path === path || file.path.startsWith(`${path}/`))
      .forEach((file) => closeFile(file.path));
  }

  /**
   * 外部文件变更回调。
   * 未打开的文件直接刷新树；已打开且无本地改动时静默重载，保持编辑区与磁盘一致。
   */
  async function applyExternalChange(changedPaths: string[]): Promise<void> {
    const parentDirs = new Set(changedPaths.map((path) => dirname(path)));
    for (const dir of parentDirs) {
      if (dir === root.value) {
        tree.value = await provider.value!.list({ path: root.value, ignore: ignore.value });
      } else {
        await refresh(dir);
      }
    }

    for (const file of openFiles.value) {
      if (!changedPaths.includes(file.path)) continue;
      if (file.content !== file.savedContent) {
        file.conflicted = true;
        continue;
      }
      try {
        const content = await provider.value!.read(file.path);
        file.content = content;
        file.savedContent = content;
        file.conflicted = false;
      } catch {
        // 文件已被删除：保留标签但标记错误，由 UI 提示
        file.error = "文件已被删除";
      }
    }
  }

  /** 订阅外部变更，自动在根目录注册。 */
  function startWatching(): (() => void) | undefined {
    if (!provider.value?.watch) return undefined;
    let queued: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = provider.value.watch([root.value], (paths) => {
      // 文件系统事件密集（尤其递归监听），做 200ms 合并
      queued.push(...paths);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const batch = [...new Set(queued)];
        queued = [];
        void applyExternalChange(batch);
      }, 200);
    });

    return () => {
      if (timer) clearTimeout(timer);
      stop();
    };
  }

  return {
    // state
    root,
    tree,
    openFiles,
    activePath,
    ignore,
    // getters
    rootLabel,
    activeFile,
    hasDirtyFiles,
    flatRows,
    // actions
    initialize,
    toggle,
    refresh,
    findNode,
    openFile,
    save,
    revert,
    closeFile,
    setActive,
    createFile,
    createDirectory,
    renameNode,
    removeNode,
    applyExternalChange,
    startWatching,
  };
});
