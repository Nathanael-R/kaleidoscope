import { randomUUID } from 'node:crypto';
import { validateProxyTargetUrl } from '../utils/security.js';

export interface InspectProxySession {
  id: string;
  targetUrl: string;
  lastAccessedAt: Date;
}

export interface InspectProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}

const BLOCKED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
]);
const INSPECT_RUNTIME_SNIPPET = [
  '<script src="/api/inspect/element-source.js" data-kaleidoscope-inspect-runtime></script>',
  '<script src="/api/inspect/bridge.js" data-kaleidoscope-inspect-runtime defer></script>',
].join('\n');
const DEFAULT_PROXY_FETCH_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PROXY_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_PROXY_REDIRECTS = 5;
const SESSION_MAX_IDLE_MS = 60 * 60 * 1000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function readPositiveIntEnv(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const PROXY_FETCH_TIMEOUT_MS = readPositiveIntEnv(
  'KALEIDOSCOPE_PROXY_TIMEOUT_MS',
  DEFAULT_PROXY_FETCH_TIMEOUT_MS,
);
const MAX_PROXY_RESPONSE_BYTES = readPositiveIntEnv(
  'KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES',
  DEFAULT_MAX_PROXY_RESPONSE_BYTES,
);

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function readResponseBuffer(response: Response): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = Buffer.from(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_PROXY_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(`Proxy response exceeded ${MAX_PROXY_RESPONSE_BYTES} bytes`);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, totalBytes);
}

function errorResponse(status: number, message: string): InspectProxyResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error: message }),
  };
}

class InspectProxyService {
  private readonly sessions = new Map<string, InspectProxySession>();

  createSession(targetUrl: string): InspectProxySession {
    const session = {
      id: `inspect_${randomUUID()}`,
      targetUrl: new URL(targetUrl).toString().replace(/\/$/, ''),
      lastAccessedAt: new Date(),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async proxyRequest(
    sessionId: string,
    requestPath: string,
    method = 'GET',
    requestHeaders: Record<string, string> = {},
    requestBody?: string,
  ): Promise<InspectProxyResponse> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return errorResponse(404, 'Inspect proxy session not found');
    }
    session.lastAccessedAt = new Date();

    const requestUrl = new URL(requestPath, 'http://kaleidoscope.invalid');
    const initialTargetUrl = new URL(session.targetUrl);
    const target = requestUrl.pathname === '/'
      ? new URL(session.targetUrl)
      : new URL(requestUrl.pathname, initialTargetUrl.origin);
    target.search = requestUrl.search;

    const headers: Record<string, string> = {};
    for (const name of ['accept', 'accept-language', 'content-type']) {
      if (requestHeaders[name]) headers[name] = requestHeaders[name];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROXY_FETCH_TIMEOUT_MS);
    try {
      let currentTarget = target;
      let currentMethod = method.toUpperCase();
      let currentBody = requestBody && currentMethod !== 'GET' && currentMethod !== 'HEAD'
        ? requestBody
        : undefined;
      let response: Response | null = null;

      for (let redirectCount = 0; redirectCount <= MAX_PROXY_REDIRECTS; redirectCount += 1) {
        const validation = await validateProxyTargetUrl(currentTarget.toString(), { allowLoopback: true });
        if (!validation.allowed) {
          return errorResponse(403, 'Proxy target is not allowed');
        }

        response = await fetch(currentTarget, {
          method: currentMethod,
          headers,
          body: currentBody,
          redirect: 'manual',
          signal: controller.signal,
        });

        if (!REDIRECT_STATUSES.has(response.status)) {
          break;
        }

        const location = response.headers.get('location');
        if (!location) {
          break;
        }
        if (redirectCount === MAX_PROXY_REDIRECTS) {
          await response.body?.cancel();
          return errorResponse(508, `Proxy redirect limit of ${MAX_PROXY_REDIRECTS} exceeded`);
        }

        const nextTarget = new URL(location, currentTarget);
        await response.body?.cancel();
        currentTarget = nextTarget;
        if (response.status === 303 || ((response.status === 301 || response.status === 302) && currentMethod === 'POST')) {
          currentMethod = 'GET';
          currentBody = undefined;
          delete headers['content-type'];
        }
      }

      if (!response) {
        return errorResponse(502, 'Failed to reach target');
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (!BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) {
          responseHeaders[key] = value;
        }
      });
      responseHeaders['x-kaleidoscope-proxy'] = 'inspect';

      const responseBuffer = await readResponseBuffer(response);
      const contentType = response.headers.get('content-type') ?? '';
      const body = contentType.includes('text/html')
        ? this.rewriteHtml(responseBuffer.toString('utf8'), session)
        : responseBuffer;

      return { status: response.status, headers: responseHeaders, body };
    } catch (error) {
      return errorResponse(
        error instanceof Error && error.name === 'AbortError' ? 504 : 502,
        error instanceof Error && error.name === 'AbortError'
          ? 'Target request timed out'
          : 'Failed to reach target',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  cleanExpired(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt.getTime() > SESSION_MAX_IDLE_MS) {
        this.sessions.delete(id);
        cleaned += 1;
      }
    }
    return cleaned;
  }

  private rewriteHtml(html: string, session: InspectProxySession): string {
    const baseTag = `<base href="${escapeHtmlAttribute(`${session.targetUrl}/`)}">`;
    const injection = `${INSPECT_RUNTIME_SNIPPET}\n${baseTag}`;
    if (html.includes('<head>')) return html.replace('<head>', `<head>\n${injection}`);
    if (html.includes('<HEAD>')) return html.replace('<HEAD>', `<HEAD>\n${injection}`);
    return `${injection}${html}`;
  }
}

export const proxyService = new InspectProxyService();
