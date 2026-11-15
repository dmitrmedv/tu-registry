import axios from 'axios';

export type ApiError = { status: number; code: string; message: string; details?: unknown };

type ErrorBody = { error?: { code?: string; message?: string; details?: unknown } };

/** Normalizes any thrown value into the server's `{ code, message }` shape for the UI. */
export function toApiError(error: unknown): ApiError {
  if (axios.isAxiosError<ErrorBody>(error)) {
    const response = error.response;
    if (!response) {
      return { status: 0, code: 'NETWORK_ERROR', message: 'Немає зʼєднання із сервером' };
    }
    const body = response.data?.error;
    return {
      status: response.status,
      code: body?.code ?? 'HTTP_ERROR',
      message: body?.message ?? 'Сервер повернув помилку. Спробуйте ще раз',
      details: body?.details,
    };
  }
  return { status: 0, code: 'UNKNOWN', message: 'Сталася непередбачена помилка' };
}
