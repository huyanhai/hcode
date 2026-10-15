import type { FileNode, FileProvider, ListOptions } from "../types";

export interface HttpFileProviderOptions {
  /** 接口前缀，例如 `/api/files`。 */
  baseUrl?: string;
  rootLabel?: string;
  /** 注入自定义 fetch，便于测试或走统一鉴权拦截。 */
  fetchImpl?: typeof fetch;
  /** 请求头，例如鉴权 token。 */
  headers?: Record<string, string>;
}

/**
 * 基于 HTTP 的数据源，用于 Web 端或需要服务端中转的场景。
 *
 * 与 ElectronFileProvider 接口完全一致，因此组件层无需区分运行环境。
 * 路径逃逸防护依赖服务端实现（见 apps/server 的 file 模块）。
 */
export class HttpFileProvider implements FileProvider {
  readonly rootLabel: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;

  constructor(options: HttpFileProviderOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "/api/files").replace(/\/$/, "");
    this.rootLabel = options.rootLabel ?? "远程";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.headers = { "Content-Type": "application/json", ...options.headers };
  }

  async list(options: ListOptions): Promise<FileNode[]> {
    const query = new URLSearchParams({
      path: options.path,
      recursive: String(options.recursive ?? false),
    });
    if (options.ignore?.length) query.set("ignore", options.ignore.join(","));

    const payload = await this.request<unknown[]>("GET", `/list?${query.toString()}`);
    return payload.map((item) => this.toNode(item as Record<string, unknown>));
  }

  async read(path: string): Promise<string> {
    const query = new URLSearchParams({ path });
    const payload = await this.request<{ content: string }>("GET", `/read?${query.toString()}`);
    return payload.content;
  }

  async write(options: { path: string; content: string; overwrite?: boolean }): Promise<void> {
    await this.request("POST", "/write", {
      path: options.path,
      content: options.content,
      overwrite: options.overwrite ?? true,
    });
  }

  async rename(options: { path: string; newPath: string }): Promise<void> {
    await this.request("POST", "/rename", options);
  }

  async remove(options: { path: string; recursive?: boolean }): Promise<void> {
    await this.request("POST", "/remove", {
      path: options.path,
      recursive: options.recursive ?? false,
    });
  }

  async mkdir(path: string): Promise<void> {
    await this.request("POST", "/mkdir", { path });
  }

  private toNode(raw: Record<string, unknown>): FileNode {
    const type = raw.type === "directory" ? "directory" : "file";
    return {
      name: String(raw.name),
      path: String(raw.path),
      type,
      size: Number(raw.size ?? 0),
      mtimeMs: Number(raw.mtimeMs ?? 0),
      children: type === "directory" ? this.toNodeList(raw.children) : null,
    };
  }

  private toNodeList(raw: unknown): FileNode[] | null {
    if (!Array.isArray(raw)) return null;
    return raw.map((item) => this.toNode(item as Record<string, unknown>));
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      // 后端错误体优先取 message，便于直接把约束提示透出到 UI
      const detail = await response
        .json()
        .then((data: { message?: string }) => data.message)
        .catch(() => "");
      throw new Error(detail || `文件请求失败：${response.status} ${response.statusText}`);
    }

    if (response.status === 204) return undefined as T;
    return unwrap<T>(await response.json());
  }
}

/**
 * 解开后端统一响应信封 `{ code, data, message }`。
 *
 * hcode server 所有接口都走 successResponse 包装，这里直接取 data；
 * 若后端返回裸对象（未包装），则原样透传，两种形态都能工作。
 */
function unwrap<T>(payload: unknown): T {
  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    "data" in payload
  ) {
    const envelope = payload as { code: string; data: T; message?: string };
    if (envelope.code !== "0") {
      throw new Error(envelope.message || "文件服务返回错误");
    }
    return envelope.data;
  }
  return payload as T;
}
