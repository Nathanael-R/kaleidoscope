import type { Express } from "express";
import { type Server } from "http";
import type { HealthResponse } from "./types.js";
import tunnelRoutes from "./routes/tunnel.routes.js";
import watcherRoutes from "./routes/watcher.routes.js";
import screenshotRoutes from "./routes/screenshot.routes.js";

export async function registerRoutes(app: Express): Promise<void> {

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    const response: HealthResponse = {
      status: "ok",
      timestamp: new Date().toISOString()
    };
    res.json(response);
  });

  // Register feature routes
  app.use("/api/tunnel", tunnelRoutes);
  app.use("/api/watcher", watcherRoutes);
  app.use("/api/screenshots", screenshotRoutes);
}
