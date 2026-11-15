import {
  annulApplicationSchema,
  applicationListQuerySchema,
  createApplicationSchema,
  manualApplicationSchema,
  manualNumberCheckSchema,
  restoreApplicationSchema,
  updateApplicationSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { kyivToday } from '../../utils/kyivDate';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import * as editService from './application.edit.service';
import * as applicationService from './application.service';

export const list: RequestHandler = async (req, res) => {
  const { query } = parseRequest(req, { query: applicationListQuerySchema });
  res.json(await applicationService.listApplications(query));
};

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
  res.json(
    await applicationService.checkManualNumber(query.regDate, query.regSeq, query.excludeId),
  );
};

export const nextNumber: RequestHandler = async (_req, res) => {
  res.json(await applicationService.getNextNumber());
};

export const getOne: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await editService.getApplication(params.id));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: updateApplicationSchema(kyivToday().iso),
  });
  res.json(await editService.updateApplication(params.id, body, req.user!, requestContext(req)));
};

export const annul: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: annulApplicationSchema,
  });
  res.json(await editService.annulApplication(params.id, body, req.user!, requestContext(req)));
};

export const restore: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: restoreApplicationSchema,
  });
  res.json(
    await editService.restoreApplication(params.id, body.version, req.user!, requestContext(req)),
  );
};

export const history: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await editService.getApplicationHistory(params.id));
};
