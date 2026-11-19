import { preferenceParamsSchema, tablePreferencesSchema } from '@tu-registry/shared';
import type { RequestHandler } from 'express';
import { parseRequest } from '../../utils/parseRequest';
import * as preferenceService from './userPreference.service';

export const get: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: preferenceParamsSchema });
  res.json(await preferenceService.getTablePreferences(req.user!, params.table));
};

export const save: RequestHandler = async (req, res) => {
  const { params, body } = parseRequest(req, {
    params: preferenceParamsSchema,
    body: tablePreferencesSchema,
  });
  res.json(await preferenceService.saveTablePreferences(req.user!, params.table, body));
};
