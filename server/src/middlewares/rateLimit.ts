import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { ApiError } from '../utils/ApiError';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;

/**
 * Limits failed logins per IP + login pair. Created per app instance so each test
 * gets a clean counter. The in-memory store is fine for a single server process.
 */
export function createLoginRateLimiter() {
  return rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: LOGIN_MAX_FAILURES,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const login = typeof req.body?.login === 'string' ? req.body.login.trim().toLowerCase() : '';
      return `${ipKeyGenerator(req.ip ?? '')}:${login}`;
    },
    handler: (_req, _res, next) => {
      next(
        new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Забагато невдалих спроб входу. Спробуйте пізніше'),
      );
    },
  });
}
