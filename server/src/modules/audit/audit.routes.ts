import { auditListQuerySchema } from '@tu-registry/shared';
import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/authenticate';
import { parseRequest } from '../../utils/parseRequest';
import { listAuditLogs } from './audit.query.service';

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole('ADMIN'));

auditRouter.get('/', async (req, res) => {
  const { query } = parseRequest(req, { query: auditListQuerySchema });
  res.json(await listAuditLogs(query));
});
