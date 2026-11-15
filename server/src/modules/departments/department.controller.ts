import {
  createDepartmentSchema,
  departmentIdParamsSchema,
  updateDepartmentSchema,
} from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { parseRequest } from '../../utils/parseRequest';
import { isAdmin } from '../applications/application.access';
import { requestContext } from '../audit/audit.service';
import * as departmentService from './department.service';

/** Everyone needs names and codes; only admins see how many users and applications each has. */
export const list: RequestHandler = async (req, res) => {
  res.json(
    isAdmin(req.user!)
      ? await departmentService.listDepartmentsWithCounts()
      : await departmentService.listDepartments(),
  );
};

export const create: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: createDepartmentSchema });
  res
    .status(201)
    .json(await departmentService.createDepartment(body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: departmentIdParamsSchema,
    body: updateDepartmentSchema,
  });
  res.json(
    await departmentService.updateDepartment(params.id, body, req.user!, requestContext(req)),
  );
};

export const archive: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: departmentIdParamsSchema });
  res.json(await departmentService.setArchived(params.id, true, req.user!, requestContext(req)));
};

export const restore: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: departmentIdParamsSchema });
  res.json(await departmentService.setArchived(params.id, false, req.user!, requestContext(req)));
};

export const remove: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: departmentIdParamsSchema });
  await departmentService.deleteDepartment(params.id, req.user!, requestContext(req));
  res.status(204).end();
};
