import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes.js";
import { tunnelService } from "./services/tunnel.service.js";
import { watcherService } from "./services/watcher.service.js";
import { screenshotService } from "./services/screenshot.service.js";
import { sseService } from "./services/sse.service.js";
import { proxyService } from "./services/proxy.service.js";
import { logApiRequest, logServerError } from "./utils/logger.js";
import { sendError } from "./utils/http.js";
import {
  KALEIDOSCOPE_CLIENT_HEADER_NAME,
  isAllowedBrowserOrigin,
  isManagementApiPath,
  isTrustedManagementClient,
} from "./utils/request-security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);
const host = process.env.HOST?.trim() || '127.0.0.1';
const isProduction = process.env.NODE_ENV === 'production';
const configuredCorsOrigin = process.env.CORS_ORIGIN;
const allowedRequestHeaders = [
  'Origin',
  'X-Requested-With',
  'Content-Type',
  'Accept',
  'Authorization',
  'X-Request-Id',
  'X-Kaleidoscope-Client',
].join(', ');

function appendVaryHeader(res: Response, value: string) {
  const current = res.getHeader('Vary');

  if (!current) {
    res.setHeader('Vary', value);
    return;
  }

  const nextValues = new Set(
    String(current)
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
  nextValues.add(value);
  res.setHeader('Vary', Array.from(nextValues).join(', '));
}

function isAllowedOrigin(origin: string): boolean {
  return isAllowedBrowserOrigin(origin, isProduction ? configuredCorsOrigin : undefined);
}

if (isProduction && !configuredCorsOrigin) {
  throw new Error('CORS_ORIGIN must be set in production');
}

if (!host || host.includes('/') || host.includes('\\') || host.includes('\0')) {
  throw new Error('HOST must be a hostname or IP address, such as 127.0.0.1 or 0.0.0.0');
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  const incomingRequestId = req.header('x-request-id');
  const requestId = incomingRequestId && incomingRequestId.trim().length > 0
    ? incomingRequestId
    : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
});

type RateEntry = { count: number; resetAt: number };
const rateLimitMap = new Map<string, RateEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
let lastRateLimitCleanupAt = 0;

function cleanupExpiredRateEntries(now: number) {
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const now = Date.now();
  if (now - lastRateLimitCleanupAt >= RATE_LIMIT_CLEANUP_INTERVAL_MS) {
    cleanupExpiredRateEntries(now);
    lastRateLimitCleanupAt = now;
  }

  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const existing = rateLimitMap.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitMap.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return next();
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    res.setHeader('Retry-After', Math.ceil((existing.resetAt - now) / 1000).toString());
    return res.status(429).json({
      error: 'Too many requests. Please retry shortly.',
      requestId: res.locals.requestId,
    });
  }

  existing.count += 1;
  return next();
});

// CORS middleware
app.use((req, res, next) => {
  const origin = req.header('origin');
  const originAllowed = origin ? isAllowedOrigin(origin) : false;

  if (origin && originAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    appendVaryHeader(res, 'Origin');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', allowedRequestHeaders);

  if (req.method === 'OPTIONS') {
    if (origin && !originAllowed) {
      return sendError(res, 403, 'Origin is not allowed.');
    }

    res.sendStatus(200);
  } else {
    next();
  }
});

app.use((req, res, next) => {
  if (!isManagementApiPath(req.path)) {
    return next();
  }

  const clientHeader = req.header(KALEIDOSCOPE_CLIENT_HEADER_NAME);
  if (!isTrustedManagementClient(clientHeader)) {
    return sendError(res, 403, 'Trusted Kaleidoscope client header is required for this endpoint.');
  }

  const origin = req.header('origin');
  if (origin && !isAllowedOrigin(origin)) {
    return sendError(res, 403, 'Origin is not allowed.');
  }

  return next();
});

// Simple logging for API requests
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on("finish", () => {
    if (req.path.startsWith("/api")) {
      const duration = Date.now() - start;
      logApiRequest({
        requestId: res.locals.requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    }
  });

  next();
});

(async () => {
  const httpServer = createServer(app);

  // SSE endpoint for live reload events
  app.get('/api/events', (req, res) => {
    const origin = req.header('origin');
    if (origin && !isAllowedOrigin(origin)) {
      return sendError(res, 403, 'Origin is not allowed.');
    }

    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId.trim() : '';
    if (!/^[A-Za-z0-9._-]{16,128}$/.test(clientId)) {
      return sendError(res, 400, 'clientId is required.');
    }

    if (origin) {
      appendVaryHeader(res, 'Origin');
    }

    sseService.addClient(req, res, {
      clientId,
      accessControlAllowOrigin: origin && isAllowedOrigin(origin) ? origin : undefined,
    });
  });

  // Serve device screenshots for client downloads
  app.use('/api/screenshots-files', express.static(
    path.resolve(process.env.SCREENSHOT_OUTPUT_DIR || './screenshots'),
    { maxAge: '1h' }
  ));

  await registerRoutes(app);

  // In production, serve static files from dist/public
  if (process.env.NODE_ENV === "production") {
    const distPath = process.env.STATIC_DIR || path.resolve(__dirname, "public");

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));

      // SPA fallback - only for non-API routes
      app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) {
          return sendError(res, 404, 'API endpoint not found');
        }
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    } else {
      console.warn(`Production static files not found at ${distPath}. Run client build first.`);
    }
  }

  // Error handler (must be registered after routes and static files)
  app.use((err: Error & { status?: number; statusCode?: number }, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = status >= 500 ? "Internal Server Error" : err.message || "Internal Server Error";
    const requestId = res.locals.requestId as string | undefined;
    sendError(res, status, message);
    logServerError(err, { requestId, path: req.path, method: req.method });
  });

  // Clean up expired proxy sessions every 10 minutes
  const cleanupInterval = setInterval(() => {
    const cleaned = proxyService.cleanExpired();
    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired proxy session(s)`);
    }
  }, 10 * 60 * 1000);

  // Centralized graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    clearInterval(cleanupInterval);
    httpServer.close();
    await Promise.allSettled([
      tunnelService.closeAllTunnels(),
      watcherService.unwatchAll(),
      screenshotService.close(),
    ]);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  httpServer.listen(port, host, () => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    console.log(`${timestamp} [express] Kaleidoscope server running on ${host}:${port}`);
    console.log(`${timestamp} [express] health check: /api/health`);
  });
})();
