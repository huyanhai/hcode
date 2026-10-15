import { defineStore } from "pinia";
import { computed, reactive, ref, shallowRef } from "vue";
import type { FileNode, FileProvider } from "./types";
import { dirname, joinPath } from "./utils/path";
import { DEFAULT_IGNORE } from "./constants/files";

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

export const useFileManagerStore = defineStore("file-manager", () => {
  const provider = shallowRef<FileProvider | null>(null);
  const root = ref("");
  const tree = ref<FileNode[]>([]);
  /** 已展开的目录路径。受控数组，直接交给 reka-ui 的 TreeRoot。 */
  const expandedPaths = ref<string[]>([]);
  /** 正在加载子目录的路径，避免重复请求。 */
  const loadingPaths = ref(new Set<string>());
  const ignore = ref<string[]>([...DEFAULT_IGNORE]);

  const openFiles = ref<OpenFile[]>([]);
  const activePath = ref("");

  const rootLabel = computed(() => provider.value?.rootLabel ?? "");

  const activeFile = computed(
    () =>
      openFiles.value.find((file) => file.path === activePath.value) ?? null,
  );

  const hasDirtyFiles = computed(() =>
    openFiles.value.some((file) => file.content !== file.savedContent),
  );

  /** 递归查找节点。 */
  function findNode(
    path: string,
    nodes: FileNode[] = tree.value,
  ): FileNode | null {
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
    // 根目录变了，上一棵树的展开态对新目录没有意义，一并清掉
    expandedPaths.value = [];
    tree.value = await options.provider.list({
      path: options.root,
      ignore: ignore.value,
    });
  }

  /**
   * 更新展开项（受控，由 TreeRoot 的展开事件驱动）。
   *
   * 先同步落状态再异步拉子节点：点击到高亮之间不能有 IO 等待，
   * 否则展开动画会顿一下。
   */
  async function setExpanded(paths: string[]): Promise<void> {
    const next = [...new Set(paths)];
    const added = next.filter((path) => !expandedPaths.value.includes(path));
    expandedPaths.value = next;

    await Promise.all(
      added.map(async (path) => {
        const node = findNode(path);
        if (
          !node ||
          node.type !== "directory" ||
          node.children?.length ||
          loadingPaths.value.has(path)
        ) {
          return;
        }

        loadingPaths.value = new Set(loadingPaths.value).add(path);
        try {
          node.children = await provider.value!.list({
            path,
            ignore: ignore.value,
          });
        } catch (error) {
          // 加载失败时收起，避免留下一个永远转圈的节点
          expandedPaths.value = expandedPaths.value.filter(
            (item) => item !== path,
          );
          throw error;
        } finally {
          const done = new Set(loadingPaths.value);
          done.delete(path);
          loadingPaths.value = done;
        }
      }),
    );
  }

  /** 刷新单个目录（新建/重命名/删除后调用）。 */
  async function refresh(path: string): Promise<void> {
    const node = findNode(path);
    if (
      !node ||
      node.type !== "directory" ||
      !expandedPaths.value.includes(path)
    )
      return;
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

    await provider.value!.write({
      path: file.path,
      content: file.content,
      overwrite: true,
    });
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

  async function createDirectory(
    parentPath: string,
    name: string,
  ): Promise<void> {
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
        file.path === path
          ? {
              ...file,
              path: newPath,
              name: newName,
              mtimeMs: refreshed?.mtimeMs ?? file.mtimeMs,
            }
          : file,
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
        tree.value = await provider.value!.list({
          path: root.value,
          ignore: ignore.value,
        });
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
    expandedPaths,
    loadingPaths,
    openFiles,
    activePath,
    ignore,
    // getters
    rootLabel,
    activeFile,
    hasDirtyFiles,
    // actions
    initialize,
    setExpanded,
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
