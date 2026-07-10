import { Router } from 'express';
import type { Request, Response } from 'express';
import { proxyService } from '../services/proxy.service.js';
import { validateCookies, validateProxyTargetUrl, validateRequestHeaders } from '../utils/security.js';
import { sendError } from '../utils/http.js';
import { logServerError } from '../utils/logger.js';

const router = Router();
const MAX_MOCK_ROUTES = 50;
const MAX_MOCK_PATTERN_LENGTH = 200;
const MAX_MOCK_RESPONSE_BYTES = 250_000;
const MAX_TOTAL_MOCK_BYTES = 1_000_000;

function validateMocks(mocks: unknown): { valid: boolean; reason?: string; sanitized?: Array<{ pattern: string; method?: string; status?: number; response: unknown }> } {
  if (!Array.isArray(mocks)) {
    return { valid: false, reason: 'mocks array is required' };
  }

  if (mocks.length > MAX_MOCK_ROUTES) {
    return { valid: false, reason: `Maximum ${MAX_MOCK_ROUTES} mock routes per session` };
  }

  let totalBytes = 0;
  const sanitized: Array<{ pattern: string; method?: string; status?: number; response: unknown }> = [];
  for (const [index, mock] of mocks.entries()) {
    if (!mock || typeof mock !== 'object') {
      return { valid: false, reason: `mock at index ${index} must be an object` };
    }

    const candidate = mock as { pattern?: unknown; method?: unknown; status?: unknown; response?: unknown };
    if (typeof candidate.pattern !== 'string' || candidate.pattern.trim().length === 0) {
      return { valid: false, reason: `mock at index ${index} must include a non-empty pattern` };
    }

    const pattern = candidate.pattern.trim();
    if (pattern.length > MAX_MOCK_PATTERN_LENGTH || !pattern.startsWith('/')) {
      return { valid: false, reason: `mock pattern at index ${index} must start with / and be ${MAX_MOCK_PATTERN_LENGTH} characters or fewer` };
    }

    let method: string | undefined;
    if (candidate.method !== undefined && candidate.method !== null) {
      if (typeof candidate.method !== 'string' || candidate.method.trim().length === 0) {
        return { valid: false, reason: `mock method at index ${index} must be a non-empty string when provided` };
      }
      const upper = candidate.method.trim().toUpperCase();
      if (!/^[A-Z]+$/.test(upper)) {
        return { valid: false, reason: `mock method at index ${index} must be a valid HTTP method like GET or POST` };
      }
      method = upper;
    }

    let status: number | undefined;
    if (candidate.status !== undefined && candidate.status !== null) {
      if (
        typeof candidate.status !== 'number'
        || !Number.isInteger(candidate.status)
        || candidate.status < 100
        || candidate.status >= 600
      ) {
        return { valid: false, reason: `mock status at index ${index} must be an HTTP status code between 100 and 599` };
      }
      status = candidate.status;
    }

    const encoded = JSON.stringify(candidate.response);
    const byteLength = Buffer.byteLength(encoded ?? 'null', 'utf8');
    if (byteLength > MAX_MOCK_RESPONSE_BYTES) {
      return { valid: false, reason: `mock response at index ${index} exceeds ${MAX_MOCK_RESPONSE_BYTES} bytes` };
    }

    totalBytes += byteLength;
    if (totalBytes > MAX_TOTAL_MOCK_BYTES) {
      return { valid: false, reason: `mock responses exceed ${MAX_TOTAL_MOCK_BYTES} total bytes` };
    }

    sanitized.push({ pattern, method, status, response: candidate.response });
  }

  return { valid: true, sanitized };
}

/**
 * POST /api/proxy/session
 * Create a new proxy session for a target URL
 */
router.post('/session', async (req: Request, res: Response) => {
  try {
    const { url, cookies = [], headers = [] } = req.body as {
      url: string;
      cookies?: Array<{ name: string; value: string }>;
      headers?: Array<{ name: string; value: string }>;
    };

    if (!url || typeof url !== 'string') {
      return sendError(res, 400, 'url is required');
    }

    const validation = await validateProxyTargetUrl(url, { allowLoopback: true });
    if (!validation.allowed) {
      return sendError(res, 400, validation.reason);
    }

    const cookieValidation = validateCookies(cookies);
    if (!cookieValidation.valid || !cookieValidation.sanitized) {
      return sendError(res, 400, cookieValidation.reason || 'Invalid cookies');
    }

    const headerValidation = validateRequestHeaders(headers);
    if (!headerValidation.valid || !headerValidation.sanitized) {
      return sendError(res, 400, headerValidation.reason || 'Invalid headers');
    }

    const session = proxyService.createSession(url, cookieValidation.sanitized, {
      requestHeaders: headerValidation.sanitized,
    });

    res.json({
      success: true,
      session: {
        id: session.id,
        proxyUrl: `/api/proxy/${session.id}`,
        targetUrl: session.targetUrl,
      },
    });
  } catch (error) {
    logServerError(error, {
      requestId: res.locals.requestId as string | undefined,
      path: req.path,
      method: req.method,
    });
    return sendError(res, 500, 'Failed to create proxy session');
  }
});

function requestQuery(req: Request): string {
  return new URL(req.originalUrl, 'http://kaleidoscope.invalid').search;
}

/**
 * PUT /api/proxy/session/:id/cookies
 * Update cookies for an existing proxy session
 */
router.put('/session/:id/cookies', (req: Request, res: Response) => {
  const { id } = req.params;
  const { cookies } = req.body as { cookies: Array<{ name: string; value: string }> };

  const cookieValidation = validateCookies(cookies);
  if (!cookieValidation.valid || !cookieValidation.sanitized) {
    return sendError(res, 400, cookieValidation.reason || 'Invalid cookies');
  }

  const updated = proxyService.updateCookies(id, cookieValidation.sanitized);
  if (!updated) {
    return sendError(res, 404, 'Session not found');
  }

  res.json({ success: true });
});

router.put('/session/:id/auth', (req: Request, res: Response) => {
  const { id } = req.params;
  const { cookies = [], headers = [] } = req.body as {
    cookies?: Array<{ name: string; value: string }>;
    headers?: Array<{ name: string; value: string }>;
  };

  const cookieValidation = validateCookies(cookies);
  if (!cookieValidation.valid || !cookieValidation.sanitized) {
    return sendError(res, 400, cookieValidation.reason || 'Invalid cookies');
  }

  const headerValidation = validateRequestHeaders(headers);
  if (!headerValidation.valid || !headerValidation.sanitized) {
    return sendError(res, 400, headerValidation.reason || 'Invalid headers');
  }

  const updated = proxyService.updateAuth(id, cookieValidation.sanitized, headerValidation.sanitized);
  if (!updated) {
    return sendError(res, 404, 'Session not found');
  }

  res.json({ success: true });
});

/**
 * POST /api/proxy/session/:id/mock
 * Register mock data for URL patterns in a session.
 * Claude uses this to inject dummy data when auth fails.
 */
router.post('/session/:id/mock', (req: Request, res: Response) => {
  const { id } = req.params;
  const { mocks } = req.body as {
    mocks: Array<{ pattern: string; method?: string; status?: number; response: unknown }>;
  };

  const validation = validateMocks(mocks);
  if (!validation.valid || !validation.sanitized) {
    return sendError(res, 400, validation.reason ?? 'Invalid mocks');
  }

  const session = proxyService.getSession(id);
  if (!session) {
    return sendError(res, 404, 'Session not found');
  }

  proxyService.setMockRoutes(id, validation.sanitized);

  res.json({
    success: true,
    mockCount: validation.sanitized.length,
    message: `${validation.sanitized.length} mock route(s) registered. API responses matching these patterns will return mock data.`,
  });
});

/**
 * DELETE /api/proxy/session/:id/mock
 * Clear all mock routes for a session
 */
router.delete('/session/:id/mock', (req: Request, res: Response) => {
  const { id } = req.params;

  const cleared = proxyService.clearMockRoutes(id);
  if (!cleared) {
    return sendError(res, 404, 'Session not found');
  }

  res.json({ success: true, message: 'All mock routes cleared' });
});

/**
 * GET /api/proxy/session/:id/status
 * Get session status including auth failure detection
 */
router.get('/session/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const session = proxyService.getSession(id);

  if (!session) {
    return sendError(res, 404, 'Session not found');
  }

  res.json({
    id: session.id,
    targetUrl: session.targetUrl,
    authFailed: session.authFailed,
    cookieCount: session.cookies.length,
    headerCount: session.requestHeaders.length,
    mockRouteCount: session.mockRoutes.size,
    createdAt: session.createdAt.toISOString(),
  });
});

/**
 * GET /api/proxy/sessions
 * List all active proxy sessions
 */
router.get('/sessions', (_req: Request, res: Response) => {
  const sessions = proxyService.getAllSessions();
  res.json({
    sessions: sessions.map(s => ({
      id: s.id,
      targetUrl: s.targetUrl,
      authFailed: s.authFailed,
      cookieCount: s.cookies.length,
      headerCount: s.requestHeaders.length,
      mockRouteCount: s.mockRoutes.size,
      proxyUrl: `/api/proxy/${s.id}`,
    })),
    count: sessions.length,
  });
});

/**
 * DELETE /api/proxy/session/:id
 * Remove a proxy session
 */
router.delete('/session/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const removed = proxyService.removeSession(id);

  if (!removed) {
    return sendError(res, 404, 'Session not found');
  }

  res.json({ success: true, message: 'Session removed' });
});

/**
 * ALL /api/proxy/:sessionId/*
 * The actual proxy endpoint - forwards requests to the target
 * with cookie injection and header stripping
 */
router.all('/:sessionId/*', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  // Express puts the rest of the path in params[0] for wildcard routes
  const targetPath = '/' + (req.params[0] || '') + requestQuery(req);

  // Collect request headers
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  }

  // Collect request body for non-GET requests
  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
    body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  const result = await proxyService.proxyRequest(
    sessionId,
    targetPath,
    req.method,
    headers,
    body,
  );

  // Set response headers
  for (const [key, value] of Object.entries(result.headers)) {
    // Skip transfer-encoding since Express handles it
    if (key.toLowerCase() !== 'transfer-encoding' && key.toLowerCase() !== 'content-length') {
      res.setHeader(key, value);
    }
  }

  res.status(result.status).send(result.body);
});

/**
 * GET /api/proxy/:sessionId (no trailing path - serve the root)
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') {
      headers[key] = value;
    }
  }

  const result = await proxyService.proxyRequest(sessionId, `/${requestQuery(req)}`, 'GET', headers);

  for (const [key, value] of Object.entries(result.headers)) {
    if (key.toLowerCase() !== 'transfer-encoding' && key.toLowerCase() !== 'content-length') {
      res.setHeader(key, value);
    }
  }

  res.status(result.status).send(result.body);
});

export default router;
