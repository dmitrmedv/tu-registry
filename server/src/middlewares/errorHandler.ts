import type { ErrorRequestHandler } from 'express';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

/** Errors thrown by express.json() (body-parser) carry a 4xx status and a `type`. */
type HttpClientError = { status: number; type?: string };

function isHttpClientError(err: unknown): err is HttpClientError {
  if (typeof err !== 'object' || err === null || !('status' in err)) return false;
  const { status } = err as { status: unknown };
  return typeof status === 'number' && status >= 400 && status < 500;
}

const CLIENT_ERROR_CODES: Record<string, { code: string; message: string }> = {
  'entity.parse.failed': { code: 'INVALID_JSON', message: 'Некоректне тіло запиту' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', message: 'Завеликий розмір запиту' },
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined && { details: err.details }),
      },
    });
    return;
  }

  if (isHttpClientError(err)) {
    const known = (err.type && CLIENT_ERROR_CODES[err.type]) || {
      code: 'BAD_REQUEST',
      message: 'Некоректний запит',
    };
    res.status(err.status).json({ error: known });
    return;
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  // Internal details (stack, driver messages) are never sent to the client.
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Внутрішня помилка сервера' } });
};
