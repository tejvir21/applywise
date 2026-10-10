/** Health check routes. */

import { Router, Response } from "express";
import { getConfig } from "../config/index.js";
import { getConnectionStatus } from "../config/database.js";
import { getStorageStatus } from "../storage/resilient.js";

const router = Router();

interface HealthData {
  status: "ok" | "degraded";
  service: string;
  version: string;
  environment: string;
  mongodb: "connected" | "disconnected" | "error";
  ai_provider: string;
  storage_provider: string;
  browser_automation_provider: string;
  storage: {
    active: string;
    primary: string;
    fallback: string;
    healthy: boolean;
    durable: boolean;
    degraded: boolean;
    reason?: string;
  };
}

/**
 * GET /api/health
 * Comprehensive health check including dependencies. Storage metadata is
 * sanitized: provider names and booleans only — no secrets, tokens, signed
 * URLs, bucket/object identifiers, or filesystem paths.
 */
router.get("/health", async (_req, res: Response) => {
  const config = getConfig();
  const rawStatus = getConnectionStatus();

  // Map intermediate states to error for health check
  const mongodbStatus =
    rawStatus === "connected"
      ? "connected"
      : rawStatus === "disconnected"
        ? "disconnected"
        : "error";

  const storage = await getStorageStatus();

  const overallStatus =
    mongodbStatus === "connected" && storage.healthy ? "ok" : "degraded";

  const data: HealthData = {
    status: overallStatus,
    service: "ai-job-application-agent",
    version: "0.1.0",
    environment: config.NODE_ENV,
    mongodb: mongodbStatus,
    ai_provider: config.AI_PROVIDER,
    storage_provider: storage.active,
    browser_automation_provider: config.BROWSER_AUTOMATION_PROVIDER,
    storage: {
      active: storage.active,
      primary: storage.primary,
      fallback: storage.fallback,
      healthy: storage.healthy,
      durable: storage.durable,
      degraded: storage.degraded,
      ...(storage.reason ? { reason: storage.reason } : {}),
    },
  };

  res.json({ success: true, data });
});

/**
 * GET /api/health/live
 * Liveness probe - process is running
 */
router.get("/health/live", (_req, res: Response) => {
  res.json({ success: true, data: { status: "ok" } });
});

/**
 * GET /api
 * API metadata
 */
router.get("/", (_req, res: Response) => {
  res.json({
    success: true,
    data: {
      name: "AI Job Application Agent API",
      version: "0.1.0",
      docs: "/api/docs",
      health: "/api/health",
    },
  });
});

export default router;
