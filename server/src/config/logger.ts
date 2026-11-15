import { pino } from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Never let credentials reach the logs, even if a whole request object is logged.
  redact: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.passwordHash',
    '*.token',
  ],
  ...(env.NODE_ENV === 'development' && { transport: { target: 'pino-pretty' } }),
});
