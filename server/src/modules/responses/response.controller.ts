import {
  cancelDocumentSchema,
  createResponseSchema,
  documentScanQuerySchema,
  restoreDocumentSchema,
  updateResponseSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/ApiError';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { sendScanFile } from '../scans/sendScan';
import * as scanService from './response.scan.service';
import * as responseService from './response.service';

/** `:id` is the application, `:rid` its response. */
const responseParamsSchema = idParamsSchema.extend({
  rid: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});

export const list: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await responseService.listResponses(params.id, req.user!));
};

export const create: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: createResponseSchema,
  });
  res
    .status(201)
    .json(await responseService.createResponse(params.id, body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: responseParamsSchema,
    body: updateResponseSchema,
  });
  res.json(
    await responseService.updateResponse(
      params.id,
      params.rid,
      body,
      req.user!,
      requestContext(req),
    ),
  );
};

export const cancel: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: responseParamsSchema,
    body: cancelDocumentSchema,
  });
  res.json(
    await responseService.cancelResponse(
      params.id,
      params.rid,
      body,
      req.user!,
      requestContext(req),
    ),
  );
};

export const restore: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: responseParamsSchema,
    body: restoreDocumentSchema,
  });
  res.json(
    await responseService.restoreResponse(
      params.id,
      params.rid,
      body.version,
      req.user!,
      requestContext(req),
    ),
  );
};

export const checkScanEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: responseParamsSchema });
  await scanService.assertResponseScanEditable(params.id, params.rid, req.user!);
  next();
};

export const uploadScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: responseParamsSchema });
  if (!req.file) throw ApiError.badRequest('Оберіть PDF-файл');
  res.json(
    await scanService.attachResponseScan(
      params.id,
      params.rid,
      req.file,
      req.user!,
      requestContext(req),
    ),
  );
};

export const downloadScan: RequestHandler = async (req, res, next) => {
  const { params, query } = parseRequest(req, {
    params: responseParamsSchema,
    query: documentScanQuerySchema,
  });
  sendScanFile(
    res,
    next,
    await scanService.responseScanFile(params.id, params.rid, query.file, req.user!),
  );
};
