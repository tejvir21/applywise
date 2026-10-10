/** Express application factory. */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { getConfig, getCorsOrigins } from "./config/index.js";
import { logger } from "./config/logger.js";
import { validateStorageConfig } from "./storage/resilient.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import apiRoutes from "./routes/index.js";

export function createApp(): express.Application {
  getConfig(); // Validate config on startup
  // Validate storage topology at startup: fail clearly when no safe provider
  // is available instead of silently using ephemeral storage.
  try {
    const status = validateStorageConfig();
    if (status.degraded) {
      logger.warn({ storage: status }, "Storage running in degraded mode");
    } else {
      logger.info({ storage: status }, "Storage configuration validated");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage misconfigured";
    logger.fatal({ err: message }, "Storage configuration failed");
    throw new Error(message);
  }
  const app = express();

  // Trust proxy for rate limiting behind reverse proxy
  app.set("trust proxy", 1);

  // Security middleware
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  // CORS
  app.use(
    cors({
      origin: getCorsOrigins(),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Body parsing
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // Compression
  app.use(compression());

  // Cookie parser
  app.use(cookieParser());

  // Request logging
  app.use((req, _res, next) => {
    logger.debug(
      { method: req.method, path: req.path, ip: req.ip },
      "Incoming request",
    );
    next();
  });

  // Routes
  app.use("/api", apiRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler
  app.use(errorHandler);

  return app;
}
