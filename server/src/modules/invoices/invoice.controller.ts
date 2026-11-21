import {
  cancelDocumentSchema,
  createInvoiceSchema,
  deleteDocumentQuerySchema,
  INVOICE_FILE_KINDS,
  restoreDocumentSchema,
  updateInvoiceSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/ApiError';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { sendScanFile } from '../scans/sendScan';
import * as files from './invoice.file.service';
import * as service from './invoice.service';

/** `:id` is the application, `:iid` its invoice. */
const paramsSchema = idParamsSchema.extend({
  iid: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});
const fileParamsSchema = paramsSchema.extend({
  kind: z.enum(INVOICE_FILE_KINDS, 'Невідомий вид файлу'),
});

export const list: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await service.listInvoices(params.id, req.user!));
};

export const create: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: createInvoiceSchema,
  });
  res
    .status(201)
    .json(await service.createInvoice(params.id, body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: updateInvoiceSchema });
  res.json(
    await service.updateInvoice(params.id, params.iid, body, req.user!, requestContext(req)),
  );
};

export const cancel: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: cancelDocumentSchema });
  res.json(
    await service.cancelInvoice(params.id, params.iid, body, req.user!, requestContext(req)),
  );
};

export const restore: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: paramsSchema,
    body: restoreDocumentSchema,
  });
  res.json(
    await service.restoreInvoice(
      params.id,
      params.iid,
      body.version,
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
  await service.deleteInvoice(params.id, params.iid, query.version, req.user!, requestContext(req));
  res.status(204).end();
};

export const checkFileEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  await files.assertFileEditable(params.id, params.iid, req.user!);
  next();
};

export const uploadFile: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  if (!req.file) throw ApiError.badRequest('Оберіть PDF-файл');
  res.json(
    await files.attachInvoiceFile(
      params.id,
      params.iid,
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
    await files.removeInvoiceFile(
      params.id,
      params.iid,
      params.kind,
      req.user!,
      requestContext(req),
    ),
  );
};

export const downloadFile: RequestHandler = async (req, res, next) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  sendScanFile(res, next, await files.invoiceFile(params.id, params.iid, params.kind, req.user!));
};
