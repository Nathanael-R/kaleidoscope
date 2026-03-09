export interface ApiLogMeta {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

export function logApiRequest(meta: ApiLogMeta): void {
  console.log(JSON.stringify({
    level: 'info',
    type: 'api_request',
    timestamp: new Date().toISOString(),
    ...meta,
  }));
}

export function logServerError(error: unknown, meta: { requestId?: string; path?: string; method?: string } = {}): void {
  const normalized = error instanceof Error
    ? { message: error.message, stack: error.stack }
    : { message: String(error) };

  console.error(JSON.stringify({
    level: 'error',
    type: 'server_error',
    timestamp: new Date().toISOString(),
    ...meta,
    error: normalized,
  }));
}