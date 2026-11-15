import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError';

export const notFound: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Маршрут ${req.method} ${req.path} не знайдено`));
};
