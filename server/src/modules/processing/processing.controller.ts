import type { RequestHandler } from 'express';
import { idParamsSchema, parseRequest } from '../../utils/parseRequest';
import { getProcessing } from './processing.service';

export const show: RequestHandler = async (req, res) => {
  const { params } = parseRequest(req, { params: idParamsSchema });
  res.json(await getProcessing(params.id, req.user!));
};
