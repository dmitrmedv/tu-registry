import {
  calendarDateParamsSchema,
  calendarYearQuerySchema,
  createCalendarDaySchema,
  updateCalendarDaySchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import * as calendarService from './calendar.service';

export const exceptions: RequestHandler = async (_req, res) => {
  res.json(await calendarService.listCalendarExceptions());
};

export const list: RequestHandler = async (req, res) => {
  const { query } = parseRequest(req, { query: calendarYearQuerySchema });
  res.json(await calendarService.listCalendarDays(query.year));
};

export const create: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: createCalendarDaySchema });
  res
    .status(201)
    .json(await calendarService.createCalendarDay(body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: calendarDateParamsSchema,
    body: updateCalendarDaySchema,
  });
  res.json(
    await calendarService.updateCalendarDay(params.date, body, req.user!, requestContext(req)),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: calendarDateParamsSchema });
  await calendarService.deleteCalendarDay(params.date, req.user!, requestContext(req));
  res.status(204).end();
};
