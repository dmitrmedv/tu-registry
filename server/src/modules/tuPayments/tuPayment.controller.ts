import {
  deleteDocumentQuerySchema,
  saveTuPaymentSchema,
  TU_PAYMENT_SCAN_KINDS,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/ApiError';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { sendScanFile } from '../scans/sendScan';
import * as scanService from './tuPayment.scan.service';
import * as service from './tuPayment.service';

/** `:id` is the application, `:tid` its technical conditions. */
const paramsSchema = idParamsSchema.extend({
  tid: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});
const scanParamsSchema = paramsSchema.extend({
  kind: z.enum(TU_PAYMENT_SCAN_KINDS, 'Невідомий вид скану'),
});

export const save: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: saveTuPaymentSchema });
  res.json(
    await service.saveTuPayment(params.id, params.tid, body, req.user!, requestContext(req)),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { params, query } = parseRequest(req, {
    params: paramsSchema,
    query: deleteDocumentQuerySchema,
  });
  res.json(
    await service.deleteTuPayment(
      params.id,
      params.tid,
      query.version,
      req.user!,
      requestContext(req),
    ),
  );
};

export const checkScanEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: scanParamsSchema });
  await scanService.assertScanEditable(params.id, params.tid, req.user!);
  next();
};

export const uploadScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: scanParamsSchema });
  if (!req.file) throw ApiError.badRequest('Оберіть PDF-файл');
  res.json(
    await scanService.attachPaymentScan(
      params.id,
      params.tid,
      params.kind,
      req.file,
      req.user!,
      requestContext(req),
    ),
  );
};

export const removeScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: scanParamsSchema });
  res.json(
    await scanService.removePaymentScan(
      params.id,
      params.tid,
      params.kind,
      req.user!,
      requestContext(req),
    ),
  );
};

export const downloadScan: RequestHandler = async (req, res, next) => {
  const { params } = parseRequest(req, { params: scanParamsSchema });
  sendScanFile(
    res,
    next,
    await scanService.paymentScanFile(params.id, params.tid, params.kind, req.user!),
  );
};
