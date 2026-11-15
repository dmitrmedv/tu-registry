/**
 * An expected, client-facing error. The central errorHandler converts it into
 * `{ error: { code, message, details? } }` with the given HTTP status.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static unauthorized(message = 'Потрібна автентифікація') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Недостатньо прав') {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Ресурс не знайдено') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string, details?: unknown) {
    return new ApiError(409, 'CONFLICT', message, details);
  }
}
