import { createUserSchema, updateUserSchema } from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import * as userService from './user.service';

export const list: RequestHandler = async (_req, res) => {
  res.json(await userService.listUsers());
};

export const create: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: createUserSchema });
  res.status(201).json(await userService.createUser(body, req.user!, requestContext(req)));
};

export const update: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, { params: idParamsSchema, body: updateUserSchema });
  res.json(await userService.updateUser(params.id, body, req.user!, requestContext(req)));
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await userService.resetPassword(params.id, req.user!, requestContext(req)));
};
