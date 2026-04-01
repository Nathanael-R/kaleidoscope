import { Router } from 'express';
import type { Request, Response } from 'express';
import { proxyService } from '../services/proxy.service.js';
import { linkedActionsBridgeScript } from '../services/linked-actions-bridge-script.js';
import { validateCookies, validateProxyTargetUrl, validateRequestHeaders } from '../utils/security.js';
import { sendError } from '../utils/http.js';

const router = Router();

router.get('/linked-actions-bridge.js', (_req: Request, res: Response) => {
  res.type('application/javascript').send(linkedActionsBridgeScript);
});

/**
 * POST /api/proxy/session
 * Create a new proxy session for a target URL
 */
router.post('/session', async (req: Request, res: Response) => {
  try {
    const { url, cookies = [], headers = [], mode, allowLoopback = false } = req.body as {
      url: string;
      cookies?: Array<{ name: string; value: string }>;
      headers?: Array<{ name: string; value: string }>;
      mode?: 'standard' | 'inspect' | 'linked';
      allowLoopback?: boolean;
    };

    if (!url || typeof url !== 'string') {
      return sendError(res, 400, 'url is required');
    }

    if (mode !== undefined && mode !== 'standard' && mode !== 'inspect' && mode !== 'linked') {
      return sendError(res, 400, 'mode must be one of standard, inspect, or linked');
    }

    const validation = await validateProxyTargetUrl(url, { allowLoopback, mode });
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
      mode,
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
    return sendError(
      res,
      500,
      error instanceof Error ? error.message : 'Failed to create proxy session',
    );
  }
});

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
    mocks: Array<{ pattern: string; response: unknown }>;
  };

  if (!mocks || !Array.isArray(mocks)) {
    return sendError(res, 400, 'mocks array is required');
  }

  const session = proxyService.getSession(id);
  if (!session) {
    return sendError(res, 404, 'Session not found');
  }

  proxyService.setMockRoutes(id, mocks);

  res.json({
    success: true,
    mockCount: mocks.length,
    message: `${mocks.length} mock route(s) registered. API responses matching these patterns will return mock data.`,
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
  const targetPath = '/' + (req.params[0] || '');

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

  const result = await proxyService.proxyRequest(sessionId, '/', 'GET', headers);

  for (const [key, value] of Object.entries(result.headers)) {
    if (key.toLowerCase() !== 'transfer-encoding' && key.toLowerCase() !== 'content-length') {
      res.setHeader(key, value);
    }
  }

  res.status(result.status).send(result.body);
});

export default router;
