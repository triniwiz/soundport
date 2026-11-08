import { Http } from '@nativescript/core';

export interface HttpResult {
  status: number;
  text: string;
  header(name: string): string | undefined;
}

/** Uses core's `Http` rather than `fetch`, which loses the Content-Type of bodies on Android. */
export async function httpRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<HttpResult> {
  const response = await Http.request({
    url,
    method,
    headers,
    // POST/PUT need a Content-Length, even when empty.
    content: body ?? (method === 'GET' ? undefined : ''),
  });

  let text = '';
  try {
    text = response.content?.toString() ?? '';
  } catch {
    text = '';
  }

  const responseHeaders = (response.headers ?? {}) as Record<string, string | string[]>;
  return {
    status: response.statusCode,
    text,
    header(name) {
      const key = Object.keys(responseHeaders).find((k) => k.toLowerCase() === name.toLowerCase());
      const value = key ? responseHeaders[key] : undefined;
      return Array.isArray(value) ? value[0] : value;
    },
  };
}

/** undefined when empty or not JSON. */
export function jsonOf(result: HttpResult): any {
  if (!result.text) {
    return undefined;
  }
  try {
    return JSON.parse(result.text);
  } catch {
    return undefined;
  }
}
