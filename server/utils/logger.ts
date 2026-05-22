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

function sanitizeLogValue(value: string): string {
  return value
    .replace(/\r?\n/g, ' ')
    .replace(process.cwd(), '<cwd>')
    .slice(0, 1000);
}

export function logServerError(error: unknown, meta: { requestId?: string; path?: string; method?: string } = {}): void {
  const includeStack = process.env.KALEIDOSCOPE_DEBUG_ERRORS === '1';
  const normalized = error instanceof Error
    ? {
        message: sanitizeLogValue(error.message),
        ...(includeStack && error.stack ? { stack: sanitizeLogValue(error.stack) } : {}),
      }
    : { message: sanitizeLogValue(String(error)) };

  console.error(JSON.stringify({
    level: 'error',
    type: 'server_error',
    timestamp: new Date().toISOString(),
    ...meta,
    error: normalized,
  }));
}
