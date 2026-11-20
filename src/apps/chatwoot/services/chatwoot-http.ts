/**
 * Minimal JSON HTTP client on native fetch (replaces axios in the Chatwoot
 * app service). Callers only use get/post/put, `.data` and `.status`, and
 * read `err.message` from rejections — so this surface is a behaviour-preserving
 * subset of the axios API BunWa actually consumed.
 */

export interface HttpJsonResponse<T = any> {
  status: number;
  data: T;
}

export interface HttpJsonClient {
  get<T = any>(url: string): Promise<HttpJsonResponse<T>>;
  post<T = any>(url: string, body?: unknown): Promise<HttpJsonResponse<T>>;
  put<T = any>(url: string, body?: unknown): Promise<HttpJsonResponse<T>>;
}

export function createJsonClient(options: {
  baseURL: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}): HttpJsonClient {
  const base = options.baseURL.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) };
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(method: string, url: string, body?: unknown): Promise<HttpJsonResponse<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(new URL(url, `${base}/`).toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Chatwoot ${method} ${url} failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let data: unknown = undefined;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!response.ok) {
      // The old axios path surfaced `Request failed with status code N`;
      // keep the status visible in the message since catch blocks log it.
      const detail = typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data)?.slice(0, 200);
      throw new Error(`Request failed with status code ${response.status}${detail ? `: ${detail}` : ''}`);
    }

    return { status: response.status, data: data as T };
  }

  return {
    get: <T = any>(url: string) => request<T>('GET', url),
    post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body),
    put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body),
  };
}
