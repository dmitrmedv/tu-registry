import { createApplicationSchema } from '@tu-registry/shared';
import type { RequestHandler } from 'express';
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

export const nextNumber: RequestHandler = async (_req, res) => {
  res.json(await applicationService.getNextNumber());
};
