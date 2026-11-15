import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const server = createApp().listen(env.API_PORT, (error?: Error) => {
  if (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
  logger.info(`Server listening on http://localhost:${env.API_PORT}`);
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
    process.exit(0);
  });
  // Force exit if open connections keep the server from closing in time.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
