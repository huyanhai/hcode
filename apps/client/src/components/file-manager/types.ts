/**
 * 文件管理模块的核心类型。
 *
 * 设计要点：UI 层（目录树 / 编辑器 / 标签页）只依赖 `FileProvider` 接口，
 * 不关心底层怎么取数据（当前由 Electron IPC 直读本地磁盘实现）。
 * 保留这层抽象是为了之后更换数据源时不必改动 UI。
 */

/** 树节点。目录的 `children` 为 `null` 表示尚未加载（懒加载）。 */
export interface FileNode {
  name: string;
  /** 绝对路径。跨平台时由 provider 归一化为 POSIX 风格（`/` 分隔）。 */
  path: string;
  type: "file" | "directory";
  size: number;
  /** 最后修改时间（epoch ms），用于外部改动检测与冲突提示。 */
  mtimeMs: number;
  children: FileNode[] | null;
}

export interface ListOptions {
  path: string;
  /** 是否递归展开整棵子树。大仓库建议关闭，改为按需展开。 */
  recursive?: boolean;
  /** 忽略的文件/目录名 glob 片段，例如 `node_modules`、`*.log`。 */
  ignore?: string[];
}

export interface WriteOptions {
  path: string;
  content: string;
  /** 文件已存在时是否覆盖。为 false 且文件存在则抛错。 */
  overwrite?: boolean;
}

export interface RenameOptions {
  path: string;
  newPath: string;
}

/** 侧栏顶部「目录」下拉框的一个可选项。 */
export interface RootOption {
  /** 目录绝对路径，同时作为下拉项的 value。 */
  path: string;
  /** 下拉里显示的名字，一般是目录名。 */
  label: string;
}

export interface RemoveOptions {
  path: string;
  /** 删除非空目录时必须显式为 true。 */
  recursive?: boolean;
}

/** 单个路径的元信息，用于保存前的冲突检测。 */
export interface FileStat {
  exists: boolean;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
}

/**
 * 文件系统访问抽象。
 *
 * 实现方必须遵守的约束（安全边界）：
 * 1. 所有 `path` 需要落在允许访问的根目录内，越界应抛错而非静默截断；
 * 2. 符号链接默认不跟随（防止逃逸到根目录之外）；
 * 3. 二进制文件不应走 `read`，由调用方通过 `isBinary` 判断后走预览通道。
 */
export interface FileProvider {
  /** 供 UI 展示的根目录名，例如工作区名称。 */
  readonly rootLabel: string;

  list(options: ListOptions): Promise<FileNode[]>;
  read(path: string): Promise<string>;
  write(options: WriteOptions): Promise<void>;
  rename(options: RenameOptions): Promise<void>;
  remove(options: RemoveOptions): Promise<void>;
  mkdir(path: string): Promise<void>;

  /**
   * 查询单个路径的最新元信息。
   *
   * 保存前用它对比磁盘与本地记录的 mtime —— 内存中的文件树不会因为外部改动
   * 自动更新（尤其在没有 `watch` 的实现里），只比树节点会让冲突检测形同虚设。
   */
  stat?(path: string): Promise<FileStat>;

  /**
   * 订阅外部文件变更（git checkout、其他编辑器保存等）。
   * 返回取消订阅函数。不支持时返回 undefined。
   */
  watch?(paths: string[], onChange: (paths: string[]) => void): () => void;
}

/** 判断路径是否指向二进制文件（依据扩展名的启发式判断）。 */
export function isBinaryPath(path: string): boolean {
  const binaryExtensions = new Set([
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "avif",
    "bmp",
    "ico",
    "svg",
    "pdf",
    "zip",
    "gz",
    "tar",
    "bz2",
    "7z",
    "rar",
    "xz",
    "mp3",
    "mp4",
    "wav",
    "ogg",
    "webm",
    "mov",
    "avi",
    "flac",
    "woff",
    "woff2",
    "ttf",
    "otf",
    "eot",
    "exe",
    "dll",
    "so",
    "dylib",
    "wasm",
    "node",
    "class",
    "jar",
    "db",
    "sqlite",
    "bin",
    "dat",
    "pack",
    "idx",
  ]);
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return binaryExtensions.has(ext);
}
