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
  }

  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...');
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