import express, { type Request, type Response, type NextFunction } from "express";
import { createServer } from "http";
import { Server as SocketServer } from "socket.io";
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS middleware for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
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
  // Create HTTP server for Socket.IO
  const httpServer = createServer(app);

  // Setup Socket.IO for live reload
  const io = new SocketServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Make io available globally for services
  (global as any).io = io;

  await registerRoutes(app);

  // Error handler
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error(err);
  });

  // In production, serve static files from dist
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(process.cwd(), "dist", "public");
    
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.use((_req, res) => {
        res.sendFile(path.resolve(distPath, "index.html"));
      });
    } else {
      console.warn("Production build not found. Run 'npm run build' first.");
    }
  } else {
    // Development fallback - serve a simple message
    app.get("*", (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>DevicePreview - Backend Only</title>
          <style>
            body { 
              font-family: system-ui, -apple-system, sans-serif; 
              max-width: 600px; 
              margin: 100px auto; 
              padding: 20px;
              line-height: 1.6;
            }
            .status { color: #059669; }
            .info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
            code { background: #e5e7eb; padding: 2px 4px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <h1>DevicePreview Backend</h1>
          <p class="status">✅ Backend server is running successfully on port ${port}</p>
          
          <div class="info">
            <h3>Development Setup</h3>
            <p>This is the independent backend server for DevicePreview. It provides:</p>
            <ul>
              <li>Health check endpoint: <code>/api/health</code></li>
              <li>CORS support for frontend communication</li>
              <li>No Vite dependencies - completely independent</li>
            </ul>
          </div>

          <div class="info">
            <h3>Architecture</h3>
            <p>The server and client are now completely independent:</p>
            <ul>
              <li><strong>Backend:</strong> Pure Express API server (this server)</li>
              <li><strong>Frontend:</strong> Served by Vite dev server (separate process)</li>
              <li><strong>Storage:</strong> Client-side localStorage only</li>
            </ul>
          </div>

          <p>
            <a href="/api/health">Test API Health Check</a>
          </p>
        </body>
        </html>
      `);
    });
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  httpServer.listen(port, "0.0.0.0", () => {
    const timestamp = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    console.log(`${timestamp} [express] backend API server running on port ${port}`);
    console.log(`${timestamp} [express] WebSocket server ready for live reload`);
    console.log(`${timestamp} [express] completely independent of frontend`);
    console.log(`${timestamp} [express] frontend should be served separately on port 80`);
    console.log(`${timestamp} [express] health check available at /api/health`);
  });
})();
