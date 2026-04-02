export const KALEIDOSCOPE_CLIENT_HEADER_NAME = 'X-Kaleidoscope-Client';
const KALEIDOSCOPE_CLIENT_HEADER_VALUE = 'mosaic-client';
const CONFIGURED_API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

function isAbsoluteUrl(value: string): boolean {
  return /^[a-z][a-z\d+\-.]*:\/\//i.test(value);
}

export function withKaleidoscopeClientHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set(KALEIDOSCOPE_CLIENT_HEADER_NAME, KALEIDOSCOPE_CLIENT_HEADER_VALUE);
  return nextHeaders;
}

export function resolveKaleidoscopeApiUrl(pathOrUrl: string): string {
  if (isAbsoluteUrl(pathOrUrl)) {
    return pathOrUrl;
  }

  if (!CONFIGURED_API_BASE) {
    return pathOrUrl;
  }

  return new URL(pathOrUrl, `${CONFIGURED_API_BASE}/`).toString();
}

export function kaleidoscopeFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: withKaleidoscopeClientHeaders(init.headers),
  });
}