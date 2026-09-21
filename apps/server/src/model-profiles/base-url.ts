/**
 * Some OpenAI-compatible providers expose their API below a versioned path.
 * Keep accepting the provider host in existing profiles, but make the
 * request URL point at the actual OpenAI-compatible API root.
 */
export function normalizeProviderBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  try {
    const url = new URL(normalized);
    if (url.hostname === 'api.atria-asi.ai' && (url.pathname === '' || url.pathname === '/')) {
      url.pathname = '/v1';
      return url.toString().replace(/\/+$/, '');
    }
  } catch {
    // DTO validation handles invalid URLs before this helper is called.
  }
  return normalized;
}
