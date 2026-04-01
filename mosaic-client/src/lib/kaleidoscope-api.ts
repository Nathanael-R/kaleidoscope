export const KALEIDOSCOPE_CLIENT_HEADER_NAME = 'X-Kaleidoscope-Client';
const KALEIDOSCOPE_CLIENT_HEADER_VALUE = 'mosaic-client';

export function withKaleidoscopeClientHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set(KALEIDOSCOPE_CLIENT_HEADER_NAME, KALEIDOSCOPE_CLIENT_HEADER_VALUE);
  return nextHeaders;
}

export function kaleidoscopeFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    headers: withKaleidoscopeClientHeaders(init.headers),
  });
}