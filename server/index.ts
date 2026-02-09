import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes.js";
import { tunnelService } from "./services/tunnel.service.js";
import { watcherService } from "./services/watcher.service.js";
import { screenshotService } from "./services/screenshot.service.js";
import { sseService } from "./services/sse.service.js";
import { proxyService } from "./services/proxy.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS middleware
app.use((req, res, next) => {
  const allowedOrigin = process.env.NODE_ENV === 'production'
    ? (process.env.CORS_ORIGIN || '*')
    : '*';
  res.header('Access-Control-Allow-Origin', allowedOrigin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

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
      const timestamp = new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit", 
        second: "2-digit",
        hour12: true,
      });
      console.log(`${timestamp} [express] ${req.method} ${req.path} ${res.statusCode} in ${duration}ms`);
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

  await registerRoutes(app);

  // In production, serve static files from dist/public
  if (process.env.NODE_ENV === "production") {
    const distPath = process.env.STATIC_DIR || path.resolve(__dirname, "public");

    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));

      // SPA fallback - only for non-API routes
      app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) {
          return res.status(404).json({ error: 'API endpoint not found' });
        }
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    } else {
      console.warn(`Production static files not found at ${distPath}. Run client build first.`);
    }
  }

  // Error handler (must be registered after routes and static files)
  app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error(err);
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
