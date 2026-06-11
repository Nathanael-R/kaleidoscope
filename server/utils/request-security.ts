const LOOPBACK_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
]);

const TRUSTED_MANAGEMENT_CLIENTS = new Set([
  'mosaic-client',
  'mcp-server',
]);

export const KALEIDOSCOPE_CLIENT_HEADER_NAME = 'x-kaleidoscope-client';

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) || normalized.endsWith('.localhost');
}

export function isAllowedBrowserOrigin(
  origin: string,
  expectedProductionOrigin?: string,
): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    if (expectedProductionOrigin) {
      return parsed.origin === new URL(expectedProductionOrigin).origin;
    }

    return isLoopbackHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function isTrustedManagementClient(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return TRUSTED_MANAGEMENT_CLIENTS.has(value.toLowerCase());
}

export function isManagementApiPath(pathname: string): boolean {
  if (!pathname.startsWith('/api/')) {
    return false;
  }

  if (
    pathname === '/api/health'
    || pathname === '/api/events'
    || pathname === '/api/inspect/bridge.js'
    || pathname === '/api/inspect/element-source.js'
    || pathname.startsWith('/api/screenshots-files/')
  ) {
    return false;
  }

  if (
    pathname === '/api/proxy/session'
    || pathname === '/api/proxy/sessions'
    || pathname.startsWith('/api/proxy/session/')
  ) {
    return true;
  }

  if (pathname.startsWith('/api/proxy/')) {
    return false;
  }

  return (
    pathname.startsWith('/api/watcher')
    || pathname.startsWith('/api/screenshots')
    || pathname.startsWith('/api/performance')
    || pathname.startsWith('/api/inspect')
  );
}
