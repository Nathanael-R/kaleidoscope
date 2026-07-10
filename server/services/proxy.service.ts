import { randomUUID } from 'node:crypto';
import { validateProxyTargetUrl } from '../utils/security.js';

/**
 * A single registered mock response. Multiple entries may share a pattern.
 * An entry with method=undefined matches any method, but loses to a
 * method-specific entry.
 */
export interface MockRouteEntry {
  method?: string;
  status?: number;
  response: unknown;
}

export interface MockRouteInput {
  pattern: string;
  method?: string;
  status?: number;
  response: unknown;
}

export interface ProxySession {
  id: string;
  targetUrl: string;
  cookies: Array<{ name: string; value: string }>;
  requestHeaders: Array<{ name: string; value: string }>;
  mockRoutes: Map<string, MockRouteEntry[]>;
  authFailed: boolean;
  mode: 'standard' | 'inspect';
  createdAt: Date;
  lastAccessedAt: Date;
}

// Headers that prevent iframe embedding - we strip these
const BLOCKED_RESPONSE_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'content-encoding',
];

const INSPECT_RUNTIME_SNIPPET = [
  '<script src="/api/inspect/element-source.js" data-kaleidoscope-inspect-runtime></script>',
  '<script src="/api/inspect/bridge.js" data-kaleidoscope-inspect-runtime defer></script>',
].join('\n');

const DEFAULT_PROXY_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PROXY_RESPONSE_BYTES = 10 * 1024 * 1024;

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const PROXY_FETCH_TIMEOUT_MS = readPositiveIntEnv('KALEIDOSCOPE_PROXY_TIMEOUT_MS', DEFAULT_PROXY_FETCH_TIMEOUT_MS);
const MAX_PROXY_RESPONSE_BYTES = readPositiveIntEnv('KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES', DEFAULT_MAX_PROXY_RESPONSE_BYTES);

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function readResponseBuffer(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`Proxy response exceeded ${maxBytes} bytes`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

class ProxyService {
  private sessions: Map<string, ProxySession> = new Map();

  /**
   * Create a new proxy session for a target URL
   */
  createSession(
    targetUrl: string,
    cookies: Array<{ name: string; value: string }> = [],
    options: {
      mode?: 'standard' | 'inspect';
      requestHeaders?: Array<{ name: string; value: string }>;
    } = {},
  ): ProxySession {
    const id = this.generateId();
    const normalizedUrl = new URL(targetUrl).toString().replace(/\/$/, '');
    const now = new Date();
    const session: ProxySession = {
      id,
      targetUrl: normalizedUrl,
      cookies,
      requestHeaders: options.requestHeaders ?? [],
      mockRoutes: new Map(),
      authFailed: false,
      mode: options.mode ?? 'standard',
      createdAt: now,
      lastAccessedAt: now,
    };
    this.sessions.set(id, session);
    return session;
  }

  /**
   * Mark a session as active. Called on every state-changing operation
   * and on every proxied request so that cleanExpired() uses sliding
   * inactivity-based expiry rather than hard-createdAt cutoff.
   */
  private touch(session: ProxySession): void {
    session.lastAccessedAt = new Date();
  }

  /**
   * Get a session by ID
   */
  getSession(id: string): ProxySession | undefined {
    return this.sessions.get(id);
  }

  /**
   * Update session cookies (e.g., after auth wizard)
   */
  updateCookies(sessionId: string, cookies: Array<{ name: string; value: string }>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.cookies = cookies;
    session.authFailed = false; // reset auth failure status on new cookies
    this.touch(session);
    return true;
  }

  updateAuth(
    sessionId: string,
    cookies: Array<{ name: string; value: string }>,
    requestHeaders: Array<{ name: string; value: string }>,
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.cookies = cookies;
    session.requestHeaders = requestHeaders;
    session.authFailed = false;
    this.touch(session);
    return true;
  }

  /**
   * Register mock data for a URL pattern within a session.
   * When the proxy sees a request matching this pattern, it returns the mock data
   * instead of forwarding to the target. Accepts a raw response (untyped) for
   * backward compatibility; new callers should prefer setMockRoutes with
   * optional method/status.
   */
  setMockRoute(sessionId: string, urlPattern: string, responseData: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.mockRoutes.set(urlPattern, [{ response: responseData }]);
    this.touch(session);
    return true;
  }

  /**
   * Set multiple mock routes at once. Each entry may carry an optional
   * uppercase HTTP method (default: any) and optional status (default: 200).
   * Multiple entries for the same pattern can coexist when their methods
   * differ. Re-registering the same pattern + method replaces the old entry.
   */
  setMockRoutes(sessionId: string, mocks: Array<MockRouteInput>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    for (const mock of mocks) {
      const normalizedMethod = mock.method?.trim().toUpperCase() || undefined;
      const normalizedStatus =
        typeof mock.status === 'number' && Number.isInteger(mock.status) && mock.status >= 100 && mock.status < 600
          ? mock.status
          : undefined;
      const existing = session.mockRoutes.get(mock.pattern) ?? [];
      const nextEntries = existing.filter(entry => entry.method !== normalizedMethod);
      nextEntries.push({
        method: normalizedMethod,
        status: normalizedStatus,
        response: mock.response,
      });
      session.mockRoutes.set(mock.pattern, nextEntries);
    }
    this.touch(session);
    return true;
  }

  /**
   * Clear all mock routes for a session
   */
  clearMockRoutes(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.mockRoutes.clear();
    this.touch(session);
    return true;
  }

  /**
   * Proxy a request to the target, injecting cookies and stripping frame-blocking headers.
   * Returns mock data if the request path matches a registered mock route.
   */
  async proxyRequest(
    sessionId: string,
    requestPath: string,
    method: string = 'GET',
    requestHeaders: Record<string, string> = {},
    requestBody?: string,
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: string | Buffer;
    authFailed: boolean;
    wasMocked: boolean;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Proxy session not found' }),
        authFailed: false,
        wasMocked: false,
      };
    }
    this.touch(session);

    const requestUrl = new URL(requestPath, 'http://kaleidoscope.invalid');

    // Mock patterns describe paths, so query strings do not affect matching.
    const mockEntry = this.findMockRoute(session, requestUrl.pathname, method.toUpperCase());
    if (mockEntry) {
      const mockData = mockEntry.response;
      const body = typeof mockData === 'string' ? mockData : JSON.stringify(mockData);
      return {
        status: mockEntry.status ?? 200,
        headers: {
          'content-type': typeof mockData === 'string' ? 'text/html' : 'application/json',
          'x-kaleidoscope-mocked': 'true',
        },
        body,
        authFailed: false,
        wasMocked: true,
      };
    }

    // A proxy root request represents the exact URL used to create the
    // session. Nested proxy paths remain origin-relative, matching the
    // existing proxy route contract.
    const initialTargetUrl = new URL(session.targetUrl);
    const target = requestUrl.pathname === '/'
      ? new URL(session.targetUrl)
      : new URL(requestUrl.pathname, initialTargetUrl.origin);
    if (requestUrl.search) {
      target.search = requestUrl.search;
    }
    const targetUrl = target.toString();
    const targetValidation = await validateProxyTargetUrl(targetUrl, { allowLoopback: true });
    if (!targetValidation.allowed) {
      return {
        status: 403,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Proxy target is not allowed' }),
        authFailed: false,
        wasMocked: false,
      };
    }

    // Build cookie header
    const cookieHeader = session.cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    // Build fetch headers
    const fetchHeaders: Record<string, string> = {};
    // Forward safe headers from original request
    const safeHeaders = ['accept', 'accept-language', 'content-type'];
    for (const key of safeHeaders) {
      if (requestHeaders[key]) {
        fetchHeaders[key] = requestHeaders[key];
      }
    }
    if (cookieHeader) {
      fetchHeaders['cookie'] = cookieHeader;
    }
    for (const header of session.requestHeaders) {
      fetchHeaders[header.name] = header.value;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_FETCH_TIMEOUT_MS);
    try {
      const fetchOptions: RequestInit = {
        method,
        headers: fetchHeaders,
        redirect: 'manual', // handle redirects ourselves to detect login redirects
        signal: controller.signal,
      };

      if (requestBody && method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = requestBody;
      }

      const response = await fetch(targetUrl, fetchOptions);

      // Detect auth failures
      const isAuthFailure = this.isAuthFailure(response);
      if (isAuthFailure) {
        session.authFailed = true;
      }

      // Build response headers, stripping frame-blocking ones
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (!BLOCKED_RESPONSE_HEADERS.includes(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });

      responseHeaders['x-kaleidoscope-proxy'] = 'true';

      // Get response body
      const contentType = response.headers.get('content-type') || '';
      const responseBuffer = await readResponseBuffer(response, MAX_PROXY_RESPONSE_BYTES);
      let body: string | Buffer;

      if (contentType.includes('text/html')) {
        let html = responseBuffer.toString('utf8');
        // Rewrite absolute URLs in HTML to go through proxy
        html = this.rewriteHtml(html, session);
        body = html;
      } else {
        body = responseBuffer;
      }

      return {
        status: response.status,
        headers: responseHeaders,
        body,
        authFailed: isAuthFailure,
        wasMocked: false,
      };
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'AbortError';
      return {
        status: timedOut ? 504 : 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: timedOut ? 'Target request timed out' : 'Failed to reach target',
        }),
        authFailed: false,
        wasMocked: false,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check if a response indicates authentication failure.
   */
  private isAuthFailure(response: Response): boolean {
    // Explicit auth failure status codes
    if (response.status === 401 || response.status === 403) {
      return true;
    }

    // Redirect to login page (common pattern)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      let locationPath: string;
      try {
        locationPath = new URL(location, 'http://kaleidoscope.invalid').pathname.toLowerCase();
      } catch {
        locationPath = location.toLowerCase();
      }
      const loginPathPatterns = [
        /^\/login(\/|$)/,
        /^\/signin(\/|$)/,
        /^\/sign-in(\/|$)/,
        /^\/auth(\/|$)/,
        /^\/sso(\/|$)/,
        /^\/oauth(\/|$)/,
        /^\/cas\/login(\/|$)/,
      ];
      if (loginPathPatterns.some(pattern => pattern.test(locationPath))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find a matching mock route entry for a given path and method.
   * Method-specific entries win over method-agnostic entries.
   */
  private findMockRoute(session: ProxySession, requestPath: string, method: string): MockRouteEntry | undefined {
    // Exact match first
    const exactEntries = session.mockRoutes.get(requestPath);
    if (exactEntries) {
      const match = this.pickEntryByMethod(exactEntries, method);
      if (match) return match;
    }

    // Pattern matching (supports * wildcard and /api/users/:id style)
    for (const [pattern, entries] of session.mockRoutes) {
      if (pattern === requestPath) continue; // already tried
      if (this.matchPattern(pattern, requestPath)) {
        const match = this.pickEntryByMethod(entries, method);
        if (match) return match;
      }
    }

    return undefined;
  }

  /**
   * Returns the method-specific entry if one exists, else the
   * method-agnostic entry (method === undefined), else undefined.
   */
  private pickEntryByMethod(entries: MockRouteEntry[], method: string): MockRouteEntry | undefined {
    let anyMethod: MockRouteEntry | undefined;
    for (const entry of entries) {
      if (entry.method === method) return entry;
      if (!entry.method) anyMethod = entry;
    }
    return anyMethod;
  }

  /**
   * Simple pattern matching: supports * wildcards
   */
  private matchPattern(pattern: string, path: string): boolean {
    // Convert pattern to regex
    const regexStr = '^' + pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex chars
      .replace(/\\\*/g, '.*')                  // convert * wildcard
      .replace(/:[a-zA-Z_][a-zA-Z0-9_]*/g, '[^/]+') // convert :param style
      + '$';

    try {
      return new RegExp(regexStr).test(path);
    } catch {
      return false;
    }
  }

  /**
   * Rewrite HTML to route relative URLs through the proxy
   */
  private rewriteHtml(html: string, session: ProxySession): string {
    // Add a <base> tag to handle relative URLs
    // This makes the browser resolve relative URLs against the original target
    const baseTag = `<base href="${escapeHtmlAttribute(`${session.targetUrl}/`)}">`;
    const headInjection = session.mode === 'inspect'
      ? `${INSPECT_RUNTIME_SNIPPET}\n${baseTag}`
      : baseTag;

    if (html.includes('<head>')) {
      return html.replace('<head>', `<head>\n${headInjection}`);
    } else if (html.includes('<HEAD>')) {
      return html.replace('<HEAD>', `<HEAD>\n${headInjection}`);
    }

    return `${headInjection}${html}`;
  }

  /**
   * Remove a session
   */
  removeSession(id: string): boolean {
    return this.sessions.delete(id);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): ProxySession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clean up expired sessions (1 hour since last access).
   *
   * Uses lastAccessedAt, not createdAt, so a session remains alive as long
   * as an agent (or human) is actively proxying through it. This matters
   * for long-running review loops where a proxy session survives many
   * captures and re-loads.
   */
  cleanExpired(): number {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour of inactivity
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt.getTime() > maxAge) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  private generateId(): string {
    return `proxy_${randomUUID()}`;
  }
}

export const proxyService = new ProxyService();
