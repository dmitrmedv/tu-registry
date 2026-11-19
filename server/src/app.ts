import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { isDbConnected } from './config/db';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { applicationRouter } from './modules/applications/application.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { calendarRouter } from './modules/calendar/calendar.routes';
import { departmentRouter } from './modules/departments/department.routes';
import { engineerRouter } from './modules/engineers/engineer.routes';
import { createAuthRouter } from './modules/auth/auth.routes';
import { preferenceRouter } from './modules/preferences/userPreference.routes';
import { userRouter } from './modules/users/user.routes';

/**
 * Builds the Express app without starting it, so tests can use it via Supertest.
 * No CORS middleware on purpose: the client is served from the same origin
 * (Vite proxy in development), so cross-origin requests stay blocked by the browser.
 */
export function createApp() {
  const app = express();

  // Affects req.ip (rate limiting, audit log). Only true behind a trusted reverse proxy.
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    const dbUp = isDbConnected();
    res
      .status(dbUp ? 200 : 503)
      .json({ status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
  });

  app.use('/api/v1/auth', createAuthRouter());
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/applications', applicationRouter);
  app.use('/api/v1/audit', auditRouter);
  app.use('/api/v1/departments', departmentRouter);
  app.use('/api/v1/engineers', engineerRouter);
  app.use('/api/v1/calendar', calendarRouter);
  app.use('/api/v1/me/preferences', preferenceRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
