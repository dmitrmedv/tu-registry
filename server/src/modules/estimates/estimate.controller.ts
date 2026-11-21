import {
  createEstimateSchema,
  deleteDocumentQuerySchema,
  ESTIMATE_FILE_KINDS,
  updateEstimateSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { uploadImd, uploadScan } from '../../middlewares/upload';
import { ApiError } from '../../utils/ApiError';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { sendScanFile } from '../scans/sendScan';
import * as files from './estimate.file.service';
import * as service from './estimate.service';

/** `:id` is the application, `:eid` its estimate. */
const paramsSchema = idParamsSchema.extend({
  eid: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});
const fileParamsSchema = paramsSchema.extend({
  kind: z.enum(ESTIMATE_FILE_KINDS, 'Невідомий вид файлу'),
});

export const list: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await service.listEstimates(params.id, req.user!));
};

export const create: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: createEstimateSchema,
  });
  res
    .status(201)
    .json(await service.createEstimate(params.id, body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: paramsSchema,
    body: updateEstimateSchema,
  });
  res.json(
    await service.updateEstimate(params.id, params.eid, body, req.user!, requestContext(req)),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { params, query } = parseRequest(req, {
    params: paramsSchema,
    query: deleteDocumentQuerySchema,
  });
  await service.deleteEstimate(
    params.id,
    params.eid,
    query.version,
    req.user!,
    requestContext(req),
  );
  res.status(204).end();
};

export const checkFileEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  await files.assertFileEditable(params.id, params.eid, req.user!);
  next();
};

/** The IMD check file comes in the "imd" field, the scan in "scan". */
export const receiveFile: RequestHandler = (req, res, next) =>
  (req.params.kind === 'imd' ? uploadImd : uploadScan)(req, res, next);

export const uploadFile: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  if (!req.file) {
    throw ApiError.badRequest(params.kind === 'imd' ? 'Оберіть файл .imd' : 'Оберіть PDF-файл');
  }
  res.json(
    await files.attachEstimateFile(
      params.id,
      params.eid,
      params.kind,
      req.file,
      req.user!,
      requestContext(req),
    ),
  );
};

export const removeFile: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  res.json(
    await files.removeEstimateFile(
      params.id,
      params.eid,
      params.kind,
      req.user!,
      requestContext(req),
    ),
  );
};

export const downloadFile: RequestHandler = async (req, res, next) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  sendScanFile(res, next, await files.estimateFile(params.id, params.eid, params.kind, req.user!));
};
