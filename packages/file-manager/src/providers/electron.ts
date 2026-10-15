import type { FileNode, ListOptions } from "../types";
import type { FileNodeDto } from "../env";

/**
 * 基于 Electron IPC 的数据源，访问本地磁盘。
 *
 * 依赖 preload 通过 contextBridge 暴露的 `window.desktop.fs`。
 * 渲染进程拿不到 Node API，所有真实 fs 操作都在主进程完成，
 * 这也是唯一能保证路径校验不被绕过的地方。
 */
export class ElectronFileProvider {
  constructor(readonly rootLabel = "本地") {}

  private get bridge(): NonNullable<NonNullable<Window["desktop"]>["fs"]> {
    const bridge = window.desktop?.fs;
    if (!bridge) {
      throw new Error(
        "window.desktop.fs 不可用：请确认在 preload 中暴露了 fs 命名空间，且当前运行在 Electron 环境。",
      );
    }
    return bridge;
  }

  async list(options: ListOptions): Promise<FileNode[]> {
    const nodes = await this.bridge.list(options.path, options.recursive ?? false);
    return nodes
      .map(normalizeNode)
      .filter((node) => !shouldIgnore(node.name, options.ignore));
  }

  read(path: string): Promise<string> {
    return this.bridge.read(path);
  }

  async write(options: { path: string; content: string; overwrite?: boolean }): Promise<void> {
    await this.bridge.write(options.path, options.content, options.overwrite ?? true);
  }

  async rename(options: { path: string; newPath: string }): Promise<void> {
    await this.bridge.rename(options.path, options.newPath);
  }

  async remove(options: { path: string; recursive?: boolean }): Promise<void> {
    await this.bridge.remove(options.path, options.recursive ?? false);
  }

  async mkdir(path: string): Promise<void> {
    await this.bridge.mkdir(path);
  }
}

function normalizeNode(dto: FileNodeDto): FileNode {
  return {
    name: dto.name,
    path: dto.path,
    type: dto.type,
    size: dto.size,
    mtimeMs: dto.mtimeMs,
    children: dto.type === "directory" ? [] : null,
  };
}

/** 简单的忽略匹配：支持精确名与 `*.ext` 形式。 */
function shouldIgnore(name: string, ignore?: string[]): boolean {
  if (!ignore?.length) return false;
  return ignore.some((pattern) => {
    if (pattern.startsWith("*.")) {
      return name.toLowerCase().endsWith(pattern.slice(1).toLowerCase());
    }
    return name === pattern;
  });
}
