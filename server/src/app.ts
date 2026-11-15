import express from 'express';
import helmet from 'helmet';
import { isDbConnected } from './config/db';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';

/**
 * Builds the Express app without starting it, so tests can use it via Supertest.
 * No CORS middleware on purpose: the client is served from the same origin
 * (Vite proxy in development), so cross-origin requests stay blocked by the browser.
 */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    const dbUp = isDbConnected();
    res
      .status(dbUp ? 200 : 503)
      .json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
