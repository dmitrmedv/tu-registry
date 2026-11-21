import {
  cancelDocumentSchema,
  createProjectSchema,
  deleteDocumentQuerySchema,
  documentScanQuerySchema,
  restoreDocumentSchema,
  updateProjectSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { ApiError } from '../../utils/ApiError';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { sendScanFile } from '../scans/sendScan';
import * as files from './project.files.service';
import * as service from './project.service';

/** `:id` is the application, `:pid` its project. */
const paramsSchema = idParamsSchema.extend({
  pid: z.string().regex(/^[a-f\d]{24}$/i, 'Некоректний ідентифікатор'),
});

export const list: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await service.listProjects(params.id, req.user!));
};

export const create: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: idParamsSchema,
    body: createProjectSchema,
  });
  res
    .status(201)
    .json(await service.createProject(params.id, body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: updateProjectSchema });
  res.json(
    await service.updateProject(params.id, params.pid, body, req.user!, requestContext(req)),
  );
};

export const remove: RequestHandler = async (req, res) => {
  const { params, query } = parseRequest(req, {
    params: paramsSchema,
    query: deleteDocumentQuerySchema,
  });
  await service.deleteProject(params.id, params.pid, query.version, req.user!, requestContext(req));
  res.status(204).end();
};

export const cancel: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: paramsSchema, body: cancelDocumentSchema });
  res.json(
    await service.cancelProject(params.id, params.pid, body, req.user!, requestContext(req)),
  );
};

export const restore: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: paramsSchema,
    body: restoreDocumentSchema,
  });
  res.json(
    await service.restoreProject(
      params.id,
      params.pid,
      body.version,
      req.user!,
      requestContext(req),
    ),
  );
};

export const checkEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: paramsSchema });
  await files.assertEditable(params.id, params.pid, req.user!);
  next();
};

export const uploadScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: paramsSchema });
  if (!req.file) throw ApiError.badRequest('Оберіть PDF-файл');
  res.json(await files.attachScan(params.id, params.pid, req.file, req.user!, requestContext(req)));
};

export const removeScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: paramsSchema });
  res.json(await files.removeScan(params.id, params.pid, req.user!, requestContext(req)));
};

export const downloadScan: RequestHandler = async (req, res, next) => {
  const { params, query } = parseRequest(req, {
    params: paramsSchema,
    query: documentScanQuerySchema,
  });
  sendScanFile(res, next, await files.scanFile(params.id, params.pid, query.file, req.user!));
};
