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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);
const isProduction = process.env.NODE_ENV === 'production';
const configuredCorsOrigin = process.env.CORS_ORIGIN;

if (isProduction && !configuredCorsOrigin) {
  throw new Error('CORS_ORIGIN must be set in production');
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

app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) {
    return next();
  }

  const now = Date.now();
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
  const allowedOrigin = isProduction ? configuredCorsOrigin! : '*';
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Request-Id');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
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
    sseService.addClient(req, res);
  });

  // Serve crawl screenshots as static files
  app.use('/api/crawl-screenshots', express.static(path.resolve('crawl-screenshots'), {
    maxAge: '1h',
  }));

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
    const message = err.message || "Internal Server Error";
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

  httpServer.listen(port, "0.0.0.0", () => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    console.log(`${timestamp} [express] Kaleidoscope server running on port ${port}`);
    console.log(`${timestamp} [express] health check: /api/health`);
  });
})();
