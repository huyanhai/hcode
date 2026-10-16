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
}
