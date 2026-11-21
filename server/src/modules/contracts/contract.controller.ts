import {
  cancelDocumentSchema,
  CONTRACT_FILE_KINDS,
  deleteDocumentQuerySchema,
  departmentField,
  saveContractSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { uploadDocx, uploadScan } from '../../middlewares/upload';
import { ApiError } from '../../utils/ApiError';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { sendScanFile } from '../scans/sendScan';
import * as files from './contract.file.service';
import * as service from './contract.service';

/** `:id` is the application, `:cid` its contract. */
const paramsSchema = idParamsSchema.extend({
  cid: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});
const fileParamsSchema = paramsSchema.extend({
  kind: z.enum(CONTRACT_FILE_KINDS, 'Невідомий вид файлу'),
});
const draftQuerySchema = z.object({ department: departmentField.optional() });
const updateSchema = saveContractSchema.safeExtend({
  version: z.number('Відсутня версія документа').int().min(1),
});

export const list: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await service.listContracts(params.id, req.user!));
};

export const draft: RequestHandler = async (req, res) => {
  const { params, query } = parseRequest(req, { params: idParamsSchema, query: draftQuerySchema });
  res.json(await service.contractDraft(params.id, query.department, req.user!));
};

export const create: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: idParamsSchema, body: saveContractSchema });
  res
    .status(201)
    .json(await service.createContract(params.id, body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: updateSchema });
  res.json(
    await service.updateContract(params.id, params.cid, body, req.user!, requestContext(req)),
  );
};

export const cancel: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: cancelDocumentSchema });
  res.json(
    await service.cancelContract(params.id, params.cid, body, req.user!, requestContext(req)),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { params, query } = parseRequest(req, {
    params: paramsSchema,
    query: deleteDocumentQuerySchema,
  });
  await service.deleteContract(
    params.id,
    params.cid,
    query.version,
    req.user!,
    requestContext(req),
  );
  res.status(204).end();
};

export const checkFileEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  await files.assertFileEditable(params.id, params.cid, req.user!);
  next();
};

/** The Word document comes in the "document" field, the signed scan in "scan". */
export const receiveFile: RequestHandler = (req, res, next) =>
  (req.params.kind === 'document' ? uploadDocx : uploadScan)(req, res, next);

export const uploadFile: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  if (!req.file) {
    throw ApiError.badRequest(
      params.kind === 'document' ? 'Оберіть файл .docx' : 'Оберіть PDF-файл',
    );
  }
  res.json(
    await files.attachContractFile(
      params.id,
      params.cid,
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
    await files.removeContractFile(
      params.id,
      params.cid,
      params.kind,
      req.user!,
      requestContext(req),
    ),
  );
};

export const downloadFile: RequestHandler = async (req, res, next) => {
  const { params } = parseRequest(req, { params: fileParamsSchema });
  sendScanFile(res, next, await files.contractFile(params.id, params.cid, params.kind, req.user!));
};
