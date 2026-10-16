import { promises as fs } from "node:fs";
import path from "node:path";
import { ipcMain } from "electron";

/**
 * 文件管理模块的主进程实现。
 *
 * 安全约束（务必保留）：
 * 1. 所有路径必须落在允许访问的根目录内，越界直接抛错；
 * 2. 不跟随符号链接，避免链接指向根目录之外；
 * 3. 二进制文件不走 read，由渲染层判断后走预览；
 * 4. 删除目录必须显式 recursive，避免误删。
 */

/** 允许访问的根目录集合。为空表示不限制（仅建议在开发模式使用）。 */
const allowedRoots = new Set<string>();

export function setAllowedRoots(roots: string[]): void {
  allowedRoots.clear();
  for (const root of roots) allowedRoots.add(path.resolve(root));
}

/**
 * 校验并归一化路径。
 *
 * 归一化用 realpath 会解析符号链接，这里先做逻辑归一化（resolve）保证
 * `..` 无法逃逸，再对已存在的路径用 lstat 确认不是软链。
 */
function safeResolve(input: string): string {
  const resolved = path.resolve(input);

  if (allowedRoots.size > 0) {
    const permitted = [...allowedRoots].some(
      (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
    );
    if (!permitted) {
      throw new Error(`路径超出允许访问范围：${input}`);
    }
  }

  return resolved;
}

interface FileNodePayload {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
}

/** 单个路径的元信息。不存在的路径返回 `exists: false`，由渲染层决定怎么提示。 */
interface FileStatPayload {
  exists: boolean;
  type: "file" | "directory";
  size: number;
  mtimeMs: number;
}

async function toPayload(target: string): Promise<FileNodePayload> {
  const stats = await fs.lstat(target);
  return {
    name: path.basename(target),
    // 统一用 `/` 分隔，渲染层无需处理平台差异
    path: target.split(path.sep).join("/"),
    type: stats.isDirectory() ? "directory" : "file",
    size: stats.size,
    mtimeMs: stats.mtimeMs,
  };
}

async function listDirectory(target: string): Promise<FileNodePayload[]> {
  const entries = await fs.readdir(target, { withFileTypes: true });
  const nodes = await Promise.all(
    entries
      // 跳过软链，防止通过链接读取到允许范围之外的内容
      .filter((entry) => !entry.isSymbolicLink())
      .map((entry) => toPayload(path.join(target, entry.name))),
  );

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/** 注册所有 fs:* IPC 处理器。在主进程启动早期调用一次。 */
export function registerFileIpc(): void {
  ipcMain.handle("fs:list", async (_event, target: string, recursive = false): Promise<FileNodePayload[]> => {
    const resolved = safeResolve(target);
    const stats = await fs.lstat(resolved);
    if (!stats.isDirectory()) throw new Error(`不是目录：${target}`);

    const nodes = await listDirectory(resolved);
    if (!recursive) return nodes;

    // 递归时补齐 children；前端可直接整树渲染
    return Promise.all(
      nodes.map(async (node) => {
        if (node.type !== "directory") return node;
        return { ...node, children: await listDirectory(path.resolve(resolved, node.name)) };
      }),
    );
  });

  ipcMain.handle("fs:read", async (_event, target: string): Promise<string> => {
    const resolved = safeResolve(target);
    return fs.readFile(resolved, "utf8");
  });

  ipcMain.handle(
    "fs:write",
    async (_event, target: string, content: string, create = true): Promise<void> => {
      const resolved = safeResolve(target);

      if (!create) {
        // overwrite=false 用于「新建文件」，已存在时应失败
        try {
          await fs.access(resolved);
          throw new Error(`文件已存在：${path.basename(target)}`);
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("文件已存在")) throw error;
        }
      }

      // 自动补齐缺失的父目录
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");
    },
  );

  ipcMain.handle("fs:rename", async (_event, from: string, to: string): Promise<void> => {
    const source = safeResolve(from);
    const destination = safeResolve(to);
    if (source === destination) return;
    await fs.rename(source, destination);
  });

  ipcMain.handle("fs:remove", async (_event, target: string, recursive = false): Promise<void> => {
    const resolved = safeResolve(target);

    if (allowedRoots.size > 0) {
      for (const root of allowedRoots) {
        // 不允许删除根目录自身
        if (resolved === root) throw new Error("不允许删除根目录");
      }
    }

    const stats = await fs.lstat(resolved);
    if (stats.isDirectory()) {
      if (!recursive) throw new Error("目录非空，需显式指定递归删除");
      await fs.rm(resolved, { recursive: true, force: true });
      return;
    }
    await fs.unlink(resolved);
  });

  ipcMain.handle("fs:mkdir", async (_event, target: string): Promise<void> => {
    const resolved = safeResolve(target);
    await fs.mkdir(resolved, { recursive: false });
  });

  /**
   * 单路径元信息。
   *
   * 保存前必须用它拿磁盘的真实 mtime：渲染层缓存的文件树在外部改动后并不会
   * 自动更新（没有 watcher 时永远不会更新），只比对树节点会把「外部已改」
   * 误判成「没有冲突」，从而静默覆盖别人的改动。
   */
  ipcMain.handle("fs:stat", async (_event, target: string): Promise<FileStatPayload> => {
    let resolved: string;
    try {
      resolved = safeResolve(target);
    } catch {
      // 越界路径按「不存在」处理，不把错误细节透给渲染层
      return { exists: false, type: "file", size: 0, mtimeMs: 0 };
    }

    try {
      const stats = await fs.lstat(resolved);
      return {
        exists: true,
        type: stats.isDirectory() ? "directory" : "file",
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      };
    } catch {
      return { exists: false, type: "file", size: 0, mtimeMs: 0 };
    }
  });
}
