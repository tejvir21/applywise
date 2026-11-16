/** Application entry point. */

import 'dotenv/config';
import { createApp } from './app.js';
import { getConfig, assertSecretsConfigured } from './config/index.js';
import { logger } from './config/logger.js';
import { connectToDatabase, disconnectDatabase, createIndexes, isDatabaseConnected } from './config/database.js';

async function start(): Promise<void> {
  // Validate secrets in production
  try {
    assertSecretsConfigured();
  } catch (err) {
    logger.fatal({ err }, 'Secret validation failed');
    process.exit(1);
  }

  const config = getConfig();
  const app = createApp();

  // Connect to MongoDB (optional - degraded mode if unavailable)
  await connectToDatabase();

  // Create indexes if connected
  if (isDatabaseConnected()) {
    await createIndexes();
    try {
      const { BrowserAutomationExecutionModel } = await import('./models/BrowserAutomationExecution.js');
      await (BrowserAutomationExecutionModel as any).updateMany(
        { state: { $in: ['INSPECTING', 'FILLING'] } },
        { $set: { state: 'REQUIRES_MANUAL_ACTION', pauseReason: 'Interrupted by server restart; manual review required' } },
      );
    } catch { /* best effort */ }
  }

  // Periodic browser session cleanup (abandoned sessions)
  const cleanupInterval = setInterval(async () => {
    try {
      const { browserAutomationEngine } = await import('./automation/BrowserAutomationEngine.js');
      const sm = (browserAutomationEngine as any).sessionManager;
      if (sm && typeof sm.getStaleSessions === 'function') {
        const stale = sm.getStaleSessions(5 * 60 * 1000);
        for (const sid of stale) {
          const session = sm.getSession(sid);
          const executionId = session?.executionId;
          const ownerId = session?.ownerId;
          await sm.closeSession(sid);
          // Mark the abandoned execution for manual review so it is not
          // silently left in an in-flight state after its session is gone.
          if (executionId && ownerId) {
            try {
              const { BrowserAutomationExecutionModel } = await import('./models/BrowserAutomationExecution.js');
              await (BrowserAutomationExecutionModel as any).updateOne(
                { _id: executionId, userId: ownerId, state: { $ne: 'REQUIRES_MANUAL_ACTION' } },
                { $set: { state: 'REQUIRES_MANUAL_ACTION', pauseReason: 'Abandoned execution; browser session cleaned up due to inactivity' } },
              );
            } catch { /* best effort */ }
          }
        }
      }
    } catch { /* best effort */ }
  }, 60 * 1000);
  cleanupInterval.unref();

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    clearInterval(cleanupInterval);
    logger.info({ signal }, 'Shutting down...');
    // Clean up browser automation sessions
    try {
      const { browserAutomationEngine } = await import('./automation/BrowserAutomationEngine.js');
      await browserAutomationEngine.closeAll();
    } catch {
      // Ignore cleanup errors during shutdown
    }
    server.close(async () => {
      await disconnectDatabase();
      logger.info('Server stopped');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});