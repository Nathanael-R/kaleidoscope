const DEFAULT_KALEIDOSCOPE_SERVER = 'http://localhost:5000';
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

function resolveKaleidoscopeServerUrl() {
  const configuredUrl = process.env.KALEIDOSCOPE_SERVER_URL?.trim() || DEFAULT_KALEIDOSCOPE_SERVER;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error('KALEIDOSCOPE_SERVER_URL must be a valid absolute http:// or https:// URL.');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('KALEIDOSCOPE_SERVER_URL only supports http:// and https:// URLs.');
  }

  if (parsedUrl.search || parsedUrl.hash) {
    throw new Error('KALEIDOSCOPE_SERVER_URL must not include query strings or fragments.');
  }

  if (parsedUrl.pathname !== '/' && parsedUrl.pathname !== '') {
    throw new Error('KALEIDOSCOPE_SERVER_URL must point to the Kaleidoscope server origin, not a nested path.');
  }

  return configuredUrl.replace(/\/+$/, '');
}

export const KALEIDOSCOPE_SERVER = resolveKaleidoscopeServerUrl();
export const KALEIDOSCOPE_CLIENT_HEADER_NAME = 'X-Kaleidoscope-Client';
const KALEIDOSCOPE_CLIENT_HEADER_VALUE = 'mcp-server';
const KALEIDOSCOPE_REQUEST_TIMEOUT_MS = (() => {
  const configured = Number.parseInt(process.env.KALEIDOSCOPE_REQUEST_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REQUEST_TIMEOUT_MS;
})();

export function withKaleidoscopeClientHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set(KALEIDOSCOPE_CLIENT_HEADER_NAME, KALEIDOSCOPE_CLIENT_HEADER_VALUE);
  return nextHeaders;
}

export async function kaleidoscopeFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KALEIDOSCOPE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      headers: withKaleidoscopeClientHeaders(init.headers),
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}
