import { accessSync, constants, existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export class WorkspaceBoundaryError extends Error {
  constructor(message: string) { super(message); this.name = "WorkspaceBoundaryError"; }
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export function createWorkspacePathResolver(workspaceRoot: string) {
  const root = realpathSync(workspaceRoot);

  return (requestedPath: string, options: { mustExist?: boolean } = {}): string => {
    const candidate = resolve(root, requestedPath || ".");
    let checked = candidate;
    try {
      checked = realpathSync(candidate);
    } catch {
      if (options.mustExist) throw new WorkspaceBoundaryError(`Path does not exist: ${requestedPath}`);
      // 写入目标可以包含尚未创建的多级目录。这里向上找到最近存在的父目录，
      // 对其执行 realpath 校验，避免中间的符号链接把最终文件带出 workspace。
      let existingParent = dirname(candidate);
      while (!existsSync(existingParent) && existingParent !== dirname(existingParent)) {
        existingParent = dirname(existingParent);
      }
      const realParent = realpathSync(existingParent);
      checked = resolve(realParent, relative(existingParent, candidate));
    }
    if (!isInside(root, checked)) throw new WorkspaceBoundaryError(`Path is outside workspace: ${requestedPath}`);
    return checked;
  };
}

export function assertWorkspace(workspaceRoot: string): void {
  accessSync(workspaceRoot, constants.R_OK | constants.W_OK);
  realpathSync(workspaceRoot);
}
