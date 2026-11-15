import { Router } from 'express';
import {
  requireAuth,
  requireRegistrationRights,
  requireRole,
} from '../../middlewares/authenticate';
import * as controller from './application.controller';

export const applicationRouter = Router();

applicationRouter.use(requireAuth);

applicationRouter.get('/', controller.list);
applicationRouter.get('/next-number', controller.nextNumber);
applicationRouter.post('/', controller.create);
applicationRouter.get('/manual/check', requireRegistrationRights, controller.checkManualNumber);
applicationRouter.post('/manual', requireRegistrationRights, controller.createManual);

// Field- and owner-level rules are checked in the service; restoring and deleting are admin-only.
applicationRouter.get('/:id', controller.getOne);
applicationRouter.patch('/:id', controller.update);
applicationRouter.delete('/:id', requireRole('ADMIN'), controller.remove);
applicationRouter.get('/:id/history', controller.history);
applicationRouter.post('/:id/annul', controller.annul);
applicationRouter.post('/:id/restore', requireRole('ADMIN'), controller.restore);
