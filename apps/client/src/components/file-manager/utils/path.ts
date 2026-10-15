/** 路径处理工具。统一使用 `/` 作为分隔符，跨平台由 provider 归一化。 */

/** 取父目录路径，根目录返回自身。 */
export function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  if (index <= 0) return "/";
  return path.slice(0, index);
}

/** 取文件名。 */
export function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

/** 取扩展名（不含点），无扩展名返回空串。 */
export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  if (index <= 0) return "";
  return name.slice(index + 1).toLowerCase();
}

/** 拼接路径，自动处理分隔符。 */
export function joinPath(base: string, name: string): string {
  if (base === "/" || base === "") return `/${name}`;
  return `${base.replace(/\/$/, "")}/${name}`;
}

/** 路径是否落在 root 之内（用于前端预校验，真正的防线在主进程/服务端）。 */
export function isInside(root: string, path: string): boolean {
  const normalizedRoot = root.replace(/\/$/, "");
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`);
}

/** 人类可读体积。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unitIndex]}`;
}

/** 相对时间，用于「3 分钟前保存」这类提示。 */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(timestamp).toLocaleDateString();
}
