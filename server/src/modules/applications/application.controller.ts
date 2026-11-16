import {
  annulApplicationSchema,
  applicationListQuerySchema,
  createApplicationSchema,
  deleteApplicationQuerySchema,
  nextNumberQuerySchema,
  manualApplicationSchema,
  manualNumberCheckSchema,
  restoreApplicationSchema,
  updateApplicationSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { ApiError } from '../../utils/ApiError';
import { kyivToday } from '../../utils/kyivDate';
import { departmentScope, isAdmin, registrationDepartment } from './application.access';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import { deleteApplication } from './application.delete.service';
import { listApplications } from './application.list.service';
import * as editService from './application.edit.service';
import * as scanService from './application.scan.service';
import * as applicationService from './application.service';

export const list: RequestHandler = async (req, res) => {
  const { query } = parseRequest(req, { query: applicationListQuerySchema });
  // A user's registry is always their own department, whatever the query asks for.
  const department = departmentScope(req.user!) ?? query.department;
  res.json(await listApplications({ ...query, department }));
};

export const create: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: createApplicationSchema });
  const context = requestContext(req);
  const department = await registrationDepartment(req.user!, body.department, context);
  const application = await applicationService.createApplication(
    body,
    department,
    req.user!,
    context,
  );
  res.status(201).json(application);
};

export const createManual: RequestHandler = async (req, res) => {
  // "Today" for the future-date check is the server's Kyiv date, never the client's.
  const { body } = parseRequest(req, { body: manualApplicationSchema(kyivToday().iso) });
  const context = requestContext(req);
  const department = await registrationDepartment(req.user!, body.department, context);
  const application = await applicationService.createManualApplication(
    body,
    department,
    req.user!,
    context,
  );
  res.status(201).json(application);
};

export const checkManualNumber: RequestHandler = async (req, res) => {
  const { query } = parseRequest(req, { query: manualNumberCheckSchema });
  res.json(
    await applicationService.checkManualNumber(
      query.regDate,
      query.regSeq,
      // Users check their own department; an admin may check another one (moving an
      // application there), otherwise their own.
      (isAdmin(req.user!) && query.department) || req.user!.department,
      query.excludeId,
    ),
  );
};

export const nextNumber: RequestHandler = async (req, res) => {
  const { query } = parseRequest(req, { query: nextNumberQuerySchema });
  // Admins see the hint for the department they are registering into; users their own.
  res.json(
    await applicationService.getNextNumber(
      (isAdmin(req.user!) && query.department) || req.user!.department,
    ),
  );
};

export const getOne: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await editService.getApplication(params.id, req.user!));
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

export const remove: RequestHandler = async (req, res) => {
  const { params, query } = parseRequest(req, {
    params: idParamsSchema,
    query: deleteApplicationQuerySchema,
  });
  await deleteApplication(params.id, query.version, req.user!, requestContext(req));
  res.status(204).end();
};

export const checkScanEditable: RequestHandler = async (req, _res, next) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  await scanService.assertScanEditable(params.id, req.user!);
  next();
};

export const uploadScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  if (!req.file) throw ApiError.badRequest('Оберіть PDF-файл');
  res.json(await scanService.attachScan(params.id, req.file, req.user!));
};

export const deleteScan: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await scanService.removeScan(params.id, req.user!));
};

/** RFC 6266: an ASCII fallback plus the real (Ukrainian) name, opened in the browser. */
function inlineDisposition(name: string) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export const downloadScan: RequestHandler = async (req, res, next) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  const scan = await scanService.scanFile(params.id, req.user!);
  res.sendFile(
    scan.path,
    {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': inlineDisposition(scan.name),
        // Customer documents: never kept by shared caches.
        'Cache-Control': 'private, no-store',
      },
    },
    (error?: NodeJS.ErrnoException) => {
      if (!error) return;
      next(
        error.code === 'ENOENT' ? ApiError.notFound('Файл скану не знайдено') : (error as Error),
      );
    },
  );
};

export const history: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await editService.getApplicationHistory(params.id, req.user!));
};
