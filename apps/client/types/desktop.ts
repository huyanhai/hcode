/** 文件面板（src/components/file-manager）的文件树节点（路径统一用 `/` 分隔） */
export interface FileNodePayload {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
  /** 仅 fs:list 传 recursive=true 时返回 */
  children?: FileNodePayload[];
}

/** 单个路径的元信息（fs:stat 返回）。路径不存在时 exists 为 false。 */
export interface FileStatPayload {
  exists: boolean;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
}

/** 文件管理模块的主进程桥接接口 */
export interface FileSystemBridge {
  list(path: string, recursive?: boolean): Promise<FileNodePayload[]>;
  read(path: string): Promise<string>;
  write(path: string, content: string, create?: boolean): Promise<void>;
  rename(path: string, newPath: string): Promise<void>;
  remove(path: string, recursive?: boolean): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** 查询单个路径的最新元信息，用于保存前的冲突检测 */
  stat(path: string): Promise<FileStatPayload>;
}

/** 单个候选 macOS 应用的检测结果（「打开」菜单用） */
export interface InstalledAppPayload {
  installed: boolean;
  /** .app 的完整路径；未安装为 null */
  path: string | null;
  /** 系统应用图标的 dataURL（PNG base64）；提取失败为 null，渲染层回退内置图标 */
  icon: string | null;
}

export interface InstalledAppsResult {
  apps: Record<string, InstalledAppPayload>;
  defaultAppIcon: string | null;
}

/** 外部应用 / 链接打开能力（文件面板「打开」菜单用） */
export interface ShellBridge {
  /** 检测这些 macOS 应用是否已安装，key 为应用名（/Applications 下的 .app 名），附带系统图标 */
  installedApps(names: string[]): Promise<InstalledAppsResult>;
  /** 用指定 macOS 应用打开路径 */
  openWithApp(appName: string, path: string): Promise<void>;
  /** 用系统默认应用打开路径（目录即 Finder） */
  openPath(path: string): Promise<string>;
  /** 在 Finder / 资源管理器中显示该路径 */
  showItemInFolder(path: string): Promise<void>;
  /** 打开 http/https 外部链接 */
  openExternal(url: string): Promise<void>;
  /** 读取 git 仓库的 GitHub 主页链接；不是 git 仓库 / 非 GitHub 远端返回 null */
  githubUrl(root: string): Promise<string | null>;
}

export interface DesktopInfo {
  platform: string;
  electronVersion: string;
  selectDirectory(): Promise<string | null>;
  /** 在主进程对指定 webview 渲染进程截图，返回 PNG base64；失败返回空串 */
  captureWebview(webContentsId: number): Promise<string>;
  /** 订阅 webview 内新开标签（target="_blank"）；返回取消订阅函数 */
  onWebviewNewWindow(
    callback: (payload: { senderId: number; url: string }) => void,
  ): () => void;
  /** 本地文件系统访问，供文件面板（src/components/file-manager）使用 */
  fs: FileSystemBridge;
  /** 外部应用 / 链接打开能力，供文件面板「打开」菜单使用 */
  shell: ShellBridge;
}
