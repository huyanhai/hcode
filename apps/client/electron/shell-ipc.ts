import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { promisify } from "node:util";
import { ipcMain, shell } from "electron";
import { safeResolve } from "./file-ipc";

/**
 * 「用外部应用打开」相关 IPC（文件面板顶部「打开」菜单）。
 *
 * 安全边界与 file-ipc 一致：
 * 1. 所有本地路径必须过 safeResolve，越界直接抛错；
 * 2. 外部链接只放行 http/https，防止 shell.openExternal 被喂 file:// 等协议；
 * 3. 应用启动用 detached 子进程，不阻塞也不随主进程退出而终止。
 */

/**
 * macOS 查找应用的目录顺序：
 * - /Applications：用户手动安装（VS Code、Warp、Xcode 都在这里）
 * - /System/Applications 与 /System/Applications/Utilities：系统自带（Terminal 在 Utilities 下）
 */
const APP_DIRS = [
  "/Applications",
  path.join(homedir(), "Applications"),
  "/System/Applications",
  "/System/Applications/Utilities",
];

const execFileAsync = promisify(execFile);

/** 单个候选应用的检测结果（随安装状态附带系统图标）。 */
export interface InstalledAppPayload {
  installed: boolean;
  /** .app 的完整路径；未安装为 null。 */
  path: string | null;
  /** 系统应用图标的 dataURL（PNG）；获取失败为 null。 */
  icon: string | null;
}

export interface InstalledAppsResult {
  apps: Record<string, InstalledAppPayload>;
  defaultAppIcon: string | null;
}

async function findAppPath(name: string): Promise<string | null> {
  const directPath = APP_DIRS.map((dir) => path.join(dir, `${name}.app`)).find(
    (candidate) => existsSync(candidate),
  );
  if (directPath) return directPath;
  if (process.platform !== "darwin") return null;

  const query =
    `kMDItemContentType == 'com.apple.application-bundle' && ` +
    `(kMDItemCFBundleName == '${name}'cd || kMDItemFSName == '${name}.app'cd)`;
  try {
    const { stdout } = await execFileAsync("/usr/bin/mdfind", [query], {
      maxBuffer: 1024 * 1024,
    });
    return stdout
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item.endsWith(`${name}.app`) && existsSync(item)) ?? null;
  } catch {
    return null;
  }
}

async function iconForPath(appPath: string | null): Promise<string | null> {
  if (!appPath || process.platform !== "darwin") return null;
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/plutil",
      ["-extract", "CFBundleIconFile", "raw", "-o", "-", path.join(appPath, "Contents/Info.plist")],
    );
    const iconName = stdout.trim();
    if (!iconName || path.basename(iconName) !== iconName) return null;
    const iconFile = iconName.endsWith(".icns") ? iconName : `${iconName}.icns`;
    const source = path.join(appPath, "Contents/Resources", iconFile);
    if (!existsSync(source)) return null;

    const tempDir = await mkdtemp(path.join(tmpdir(), "hcode-app-icon-"));
    try {
      const output = path.join(tempDir, "icon.png");
      await execFileAsync("/usr/bin/sips", ["-s", "format", "png", "-Z", "64", source, "--out", output]);
      const png = await readFile(output);
      return `data:image/png;base64,${png.toString("base64")}`;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.warn(`[shell-ipc] 提取应用图标失败：${appPath}`, error);
    return null;
  }
}

/** 解析候选应用：定位 .app 并提取应用包内声明的图标。 */
async function resolveApp(name: string): Promise<InstalledAppPayload> {
  const appPath = await findAppPath(name);
  if (!appPath) return { installed: false, path: null, icon: null };

  return { installed: true, path: appPath, icon: await iconForPath(appPath) };
}

/** 把 git remote 地址转成 GitHub 网页链接；非 GitHub 远端返回 null。 */
export function toGithubUrl(remote: string): string | null {
  // 覆盖三种常见形态：https://github.com/o/r(.git)、git@github.com:o/r(.git)、ssh://git@github.com/o/r(.git)
  const match = remote.match(
    /^(?:https?:\/\/|git@|ssh:\/\/git@)github\.com[:/](.+?)(?:\.git)?\/?$/i,
  );
  return match ? `https://github.com/${match[1]}` : null;
}

/** 注册 shell:* 与 git:* IPC 处理器。在主进程启动早期调用一次。 */
export function registerShellIpc(): void {
  /** 渲染层据此决定「打开」菜单里显示哪些应用项（附带系统图标）。 */
  ipcMain.handle(
    "shell:installed-apps",
    async (_event, names: string[]): Promise<InstalledAppsResult> => {
      const results = await Promise.all(names.map((name) => resolveApp(name)));

      const apps = Object.fromEntries(
        results.map((result, index) => [names[index], result]),
      );
      return {
        apps,
        defaultAppIcon: await iconForPath("/System/Library/CoreServices/Finder.app"),
      };
    },
  );

  /** 用指定 macOS 应用打开路径（`open -a`）。 */
  ipcMain.handle(
    "shell:open-with-app",
    (_event, appName: string, target: string): void => {
      if (process.platform !== "darwin") {
        throw new Error("openWithApp 仅支持 macOS");
      }
      const resolved = safeResolve(target);
      const child = spawn("open", ["-a", appName, resolved], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    },
  );

  /** 用系统默认应用打开路径（目录即 Finder）。返回错误信息，成功为空串。 */
  ipcMain.handle("shell:open-path", (_event, target: string): Promise<string> =>
    shell.openPath(safeResolve(target)),
  );

  /** 在 Finder / 资源管理器中显示该路径。 */
  ipcMain.handle("shell:show-item-in-folder", (_event, target: string): void => {
    shell.showItemInFolder(safeResolve(target));
  });

  /** 打开外部网页链接。 */
  ipcMain.handle("shell:open-external", (_event, url: string): Promise<void> => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`不允许打开的链接：${url}`);
    }
    return shell.openExternal(url);
  });

  /**
   * 读取工作区 git 仓库的 GitHub 主页链接。
   * 不是 git 仓库 / 没有 origin 远端 / 远端不是 GitHub 时返回 null，菜单隐藏该项。
   */
  ipcMain.handle("git:github-url", (_event, root: string): string | null => {
    // worktree / submodule 的 .git 是文件而不是目录，readFileSync 会抛错，统一按无仓库处理
    const configPath = path.join(safeResolve(root), ".git", "config");
    try {
      const content = readFileSync(configPath, "utf8");
      const section = content.match(/\[remote\s+"origin"\]([^\[]*)/);
      const url = section?.[1]?.match(/^\s*url\s*=\s*(\S+)\s*$/m)?.[1];
      return url ? toGithubUrl(url) : null;
    } catch {
      return null;
    }
  });
}
