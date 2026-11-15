import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';
import { isDuplicateKey } from '../utils/db';

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

  // Mongoose errors are a second line of defense behind Zod validation in services.
  // Only field names and messages are returned, never the submitted values.
  if (err instanceof mongoose.Error.ValidationError) {
    // Built-in Mongoose messages may embed the rejected value ("is invalid (value)"),
    // so only the error kind is returned; our own validator messages are value-free.
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([path, fieldError]) => [
        path,
        'kind' in fieldError && fieldError.kind !== 'user defined'
          ? fieldError.kind
          : fieldError.message,
      ]),
    );
    res
      .status(400)
      .json({ error: { code: 'VALIDATION_ERROR', message: 'Некоректні дані', details } });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: {
        code: 'INVALID_VALUE',
        message: 'Некоректне значення',
        details: { field: err.path },
      },
    });
    return;
  }

  if (isDuplicateKey(err)) {
    res.status(409).json({
      error: {
        code: 'DUPLICATE',
        message: 'Запис з такими даними вже існує',
        details: { fields: Object.keys(err.keyPattern ?? {}) },
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
