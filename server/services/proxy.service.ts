import { createRequire } from 'node:module';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

export interface ProxySession {
  id: string;
  targetUrl: string;
  cookies: Array<{ name: string; value: string }>;
  mockRoutes: Map<string, unknown>;
  authFailed: boolean;
  createdAt: Date;
}

// Headers that prevent iframe embedding - we strip these
const BLOCKED_RESPONSE_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
];

class ProxyService {
  private sessions: Map<string, ProxySession> = new Map();

  /**
   * Create a new proxy session for a target URL
   */
  createSession(targetUrl: string, cookies: Array<{ name: string; value: string }> = []): ProxySession {
    const id = this.generateId();
    const session: ProxySession = {
      id,
      targetUrl: targetUrl.replace(/\/$/, ''), // strip trailing slash
      cookies,
      mockRoutes: new Map(),
      authFailed: false,
      createdAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
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
    return true;
  }

  /**
   * Register mock data for a URL pattern within a session.
   * When the proxy sees a request matching this pattern, it returns the mock data
   * instead of forwarding to the target.
   */
  setMockRoute(sessionId: string, urlPattern: string, responseData: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.mockRoutes.set(urlPattern, responseData);
    return true;
  }

  /**
   * Set multiple mock routes at once
   */
  setMockRoutes(sessionId: string, mocks: Array<{ pattern: string; response: unknown }>): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    for (const mock of mocks) {
      session.mockRoutes.set(mock.pattern, mock.response);
    }
    return true;
  }

  /**
   * Clear all mock routes for a session
   */
  clearMockRoutes(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.mockRoutes.clear();
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

    // Check if this path matches a mock route
    const mockData = this.findMockRoute(session, requestPath);
    if (mockData !== undefined) {
      const body = typeof mockData === 'string' ? mockData : JSON.stringify(mockData);
      return {
        status: 200,
        headers: {
          'content-type': typeof mockData === 'string' ? 'text/html' : 'application/json',
          'x-kaleidoscope-mocked': 'true',
        },
        body,
        authFailed: false,
        wasMocked: true,
      };
    }

    // Build target URL
    const targetUrl = `${session.targetUrl}${requestPath}`;

    // Build cookie header
    const cookieHeader = session.cookies
      .map(c => `${c.name}=${c.value}`)
      .join('; ');

    // Build fetch headers
    const fetchHeaders: Record<string, string> = {};
    // Forward safe headers from original request
    const safeHeaders = ['accept', 'accept-language', 'content-type', 'content-length'];
    for (const key of safeHeaders) {
      if (requestHeaders[key]) {
        fetchHeaders[key] = requestHeaders[key];
      }
    }
    if (cookieHeader) {
      fetchHeaders['cookie'] = cookieHeader;
    }

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: fetchHeaders,
        redirect: 'manual', // handle redirects ourselves to detect login redirects
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

      // Add permissive CSP for iframe embedding
      responseHeaders['x-frame-options'] = 'ALLOWALL';

      // Get response body
      const contentType = response.headers.get('content-type') || '';
      let body: string | Buffer;

      if (contentType.includes('text/html')) {
        let html = await response.text();
        // Rewrite absolute URLs in HTML to go through proxy
        html = this.rewriteHtml(html, session);
        body = html;
      } else {
        const arrayBuffer = await response.arrayBuffer();
        body = Buffer.from(arrayBuffer);
      }

      return {
        status: response.status,
        headers: responseHeaders,
        body,
        authFailed: isAuthFailure,
        wasMocked: false,
      };
    } catch (error) {
      return {
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to reach target',
          message: error instanceof Error ? error.message : String(error),
        }),
        authFailed: false,
        wasMocked: false,
      };
    }
  }

  /**
   * Check if a response indicates authentication failure
   */
  private isAuthFailure(response: Response): boolean {
    // Explicit auth failure status codes
    if (response.status === 401 || response.status === 403) {
      return true;
    }

    // Redirect to login page (common pattern)
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location') || '';
      const loginPatterns = ['/login', '/signin', '/sign-in', '/auth', '/sso', '/oauth', '/cas/login'];
      if (loginPatterns.some(p => location.toLowerCase().includes(p))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Find a matching mock route for a given path
   */
  private findMockRoute(session: ProxySession, requestPath: string): unknown | undefined {
    // Exact match first
    if (session.mockRoutes.has(requestPath)) {
      return session.mockRoutes.get(requestPath);
    }

    // Pattern matching (supports * wildcard and /api/users/:id style)
    for (const [pattern, data] of session.mockRoutes) {
      if (this.matchPattern(pattern, requestPath)) {
        return data;
      }
    }

    return undefined;
  }

  /**
   * Simple pattern matching: supports * wildcards
   */
  private matchPattern(pattern: string, path: string): boolean {
    // Convert pattern to regex
    const regexStr = '^' + pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex chars
      .replace(/\\\*/g, '.*')                  // convert * wildcard
      .replace(/:[a-zA-Z_]+/g, '[^/]+')        // convert :param style
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
    const baseTag = `<base href="${session.targetUrl}/">`;

    if (html.includes('<head>')) {
      return html.replace('<head>', `<head>\n${baseTag}`);
    } else if (html.includes('<HEAD>')) {
      return html.replace('<HEAD>', `<HEAD>\n${baseTag}`);
    }

    return baseTag + html;
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
   * Clean up expired sessions (older than 1 hour)
   */
  cleanExpired(): number {
    const now = Date.now();
    const maxAge = 60 * 60 * 1000; // 1 hour
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.createdAt.getTime() > maxAge) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  private generateId(): string {
    return `proxy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export const proxyService = new ProxyService();
