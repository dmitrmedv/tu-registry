import type { Server } from 'node:http';
import { createApp } from './app';
import { connectDb, disconnectDb } from './config/db';
import { env } from './config/env';
import { logger } from './config/logger';

const SHUTDOWN_TIMEOUT_MS = 10_000;

let server: Server | undefined;

async function main() {
  await connectDb(env.MONGO_URI);
  logger.info('MongoDB connected');

  server = createApp().listen(env.API_PORT, (error?: Error) => {
    if (error) {
      logger.fatal({ err: error }, 'Failed to start server');
      process.exit(1);
    }
    logger.info(`Server listening on http://localhost:${env.API_PORT}`);
  });
}

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  // Force exit if open connections keep the server from closing in time.
  setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();

  const closeHttp = new Promise<void>((resolve, reject) => {
    if (!server) return resolve();
    server.close((error) => (error ? reject(error) : resolve()));
  });

  closeHttp
    .then(() => disconnectDb())
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Startup failed');
  process.exit(1);
});
