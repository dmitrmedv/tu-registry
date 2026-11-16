import {
  createEngineerSchema,
  engineerListQuerySchema,
  updateEngineerSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import * as engineerService from './engineer.service';

export const list: RequestHandler = async (req, res) => {
  const { query } = parseRequest(req, { query: engineerListQuerySchema });
  res.json(await engineerService.listEngineers(req.user!, query));
};

export const create: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: createEngineerSchema });
  res.status(201).json(await engineerService.createEngineer(body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: updateEngineerSchema,
  });
  res.json(await engineerService.updateEngineer(params.id, body, req.user!, requestContext(req)));
};
