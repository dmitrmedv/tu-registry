import {
  cancelDocumentSchema,
  createTechnicalConditionsSchema,
  deleteDocumentQuerySchema,
  documentScanQuerySchema,
  restoreDocumentSchema,
  updateTechnicalConditionsSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/ApiError';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { sendScanFile } from '../scans/sendScan';
import * as scanService from './technicalConditions.scan.service';
import * as service from './technicalConditions.service';

/** `:id` is the application, `:tid` its technical conditions. */
const paramsSchema = idParamsSchema.extend({
  tid: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});

export const list: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await service.listTechnicalConditions(params.id, req.user!));
};

export const create: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: createTechnicalConditionsSchema,
  });
  res
    .status(201)
    .json(await service.createTechnicalConditions(params.id, body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: paramsSchema,
    body: updateTechnicalConditionsSchema,
  });
  res.json(
    await service.updateTechnicalConditions(
      params.id,
      params.tid,
      body,
      req.user!,
      requestContext(req),
    ),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { params, query } = parseRequest(req, {
    params: paramsSchema,
    query: deleteDocumentQuerySchema,
  });
  await service.deleteTechnicalConditions(
    params.id,
    params.tid,
    query.version,
    req.user!,
    requestContext(req),
  );
  res.status(204).end();
};

export const cancel: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: cancelDocumentSchema });
  res.json(
    await service.cancelTechnicalConditions(
      params.id,
      params.tid,
      body,
      req.user!,
      requestContext(req),
    ),
  );
};

export const restore: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: paramsSchema,
    body: restoreDocumentSchema,
  });
  res.json(
    await service.restoreTechnicalConditions(
      params.id,
      params.tid,
      body.version,
      req.user!,
      requestContext(req),
    ),
  );
};

export const checkScanEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: paramsSchema });
  await scanService.assertScanEditable(params.id, params.tid, req.user!);
  next();
};

export const uploadScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: paramsSchema });
  if (!req.file) throw ApiError.badRequest('Оберіть PDF-файл');
  res.json(
    await scanService.attachScan(params.id, params.tid, req.file, req.user!, requestContext(req)),
  );
};

export const removeScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: paramsSchema });
  res.json(await scanService.removeScan(params.id, params.tid, req.user!, requestContext(req)));
};

export const downloadScan: RequestHandler = async (req, res, next) => {
  const { params, query } = parseRequest(req, {
    params: paramsSchema,
    query: documentScanQuerySchema,
  });
  sendScanFile(res, next, await scanService.scanFile(params.id, params.tid, query.file, req.user!));
};
