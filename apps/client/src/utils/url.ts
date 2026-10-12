/** 已带协议，如 https://、file:// */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;
/** 本地地址：缺协议时补 http 而不是 https */
const LOCAL_HOST_PATTERN =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?(?:[/?#]|$)/i;
/** 域名：至少含一个点，允许中文等 IDN 字符 */
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)([a-z0-9\u00a1-\uffff](?:[a-z0-9\u00a1-\uffff-]{0,61}[a-z0-9\u00a1-\uffff])?\.)+[a-z\u00a1-\uffff]{2,63}$/i;

function isValidHostname(hostname: string) {
  if (!hostname) return false;
  if (hostname === "localhost") return true;
  // IPv6 字面量
  if (hostname.startsWith("[") && hostname.endsWith("]")) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname))
    return hostname.split(".").every((part) => Number(part) <= 255);
  return DOMAIN_PATTERN.test(hostname);
}

/**
 * 校验并补全地址。
 * - 缺协议：本地地址补 http，其余补 https
 * - 有协议：仅允许 http / https，其它（ftp:、file: 等）报错
 * 校验不通过直接抛错，由调用方决定怎么提示。
 */
export function normalizeUrl(raw: string): string {
  // 去掉粘贴常见的包裹字符和空白
  const text = raw.trim().replace(/^[<"'`\s]+|[>"'`\s]+$/g, "");
  if (!text) throw new Error("请输入网址");

  const withScheme = SCHEME_PATTERN.test(text)
    ? text
    : `${LOCAL_HOST_PATTERN.test(text) ? "http" : "https"}://${text}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error("网址格式不正确");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("仅支持 http / https 协议的地址");
  if (!isValidHostname(url.hostname)) throw new Error("网址格式不正确");

  return url.href;
}
