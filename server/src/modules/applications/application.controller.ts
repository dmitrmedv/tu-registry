import {
  createApplicationSchema,
  manualApplicationSchema,
  manualNumberCheckSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { kyivToday } from '../../utils/kyivDate';
import { parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import * as applicationService from './application.service';

export const create: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: createApplicationSchema });
  const application = await applicationService.createApplication(
    body,
    req.user!,
    requestContext(req),
  );
  res.status(201).json(application);
};

export const createManual: RequestHandler = async (req, res) => {
  // "Today" for the future-date check is the server's Kyiv date, never the client's.
  const { body } = parseRequest(req, { body: manualApplicationSchema(kyivToday().iso) });
  const application = await applicationService.createManualApplication(
    body,
    req.user!,
    requestContext(req),
  );
  res.status(201).json(application);
};

export const checkManualNumber: RequestHandler = async (req, res) => {
  const { query } = parseRequest(req, { query: manualNumberCheckSchema });
  res.json(await applicationService.checkManualNumber(query.regDate, query.regSeq));
};

export const nextNumber: RequestHandler = async (_req, res) => {
  res.json(await applicationService.getNextNumber());
};
