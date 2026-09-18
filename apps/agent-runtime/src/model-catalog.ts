const MODEL_LIST_TIMEOUT_MS = 10_000;

export type ModelCatalogErrorCode =
  | "MODEL_LIST_INVALID_BASE_URL"
  | "MODEL_LIST_TIMEOUT"
  | "MODEL_LIST_NETWORK_ERROR"
  | "MODEL_LIST_HTTP_ERROR"
  | "MODEL_LIST_INVALID_RESPONSE"
  | "MODEL_LIST_EMPTY";

export class ModelCatalogError extends Error {
  constructor(readonly code: ModelCatalogErrorCode, message: string) {
    super(message);
    this.name = "ModelCatalogError";
  }
}

/**
 * 只允许无凭据、无查询参数的 HTTP(S) 基地址，避免请求时把密钥带到
 * 非预期的协议、重定向地址或带有敏感信息的 URL 中。
 */
export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ModelCatalogError("MODEL_LIST_INVALID_BASE_URL", "Base URL 无效");
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ModelCatalogError("MODEL_LIST_INVALID_BASE_URL", "Base URL 只支持 HTTP 或 HTTPS 地址");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${url.pathname}`;
}

export function sameBaseUrl(left: string, right: string): boolean {
  try {
    return normalizeBaseUrl(left) === normalizeBaseUrl(right);
  } catch {
    return false;
  }
}

export async function listProviderModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/models`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_LIST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      redirect: "error",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof ModelCatalogError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ModelCatalogError("MODEL_LIST_TIMEOUT", "获取模型列表超时");
    }
    throw new ModelCatalogError("MODEL_LIST_NETWORK_ERROR", "无法连接模型 Provider");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    // 非 2xx 响应不读取 body，避免 Provider 把密钥或内部信息回显到 Runtime 响应。
    throw new ModelCatalogError("MODEL_LIST_HTTP_ERROR", `模型 Provider 返回 HTTP ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ModelCatalogError("MODEL_LIST_INVALID_RESPONSE", "模型 Provider 返回了无效响应");
  }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    throw new ModelCatalogError("MODEL_LIST_INVALID_RESPONSE", "模型 Provider 返回了无效响应");
  }

  const models = [...new Set(
    (payload as { data: unknown[] }).data
      .map((item) => item && typeof item === "object" ? (item as { id?: unknown }).id : undefined)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim()),
  )].sort();
  if (!models.length) throw new ModelCatalogError("MODEL_LIST_EMPTY", "未获取到可用模型");
  return models;
}
