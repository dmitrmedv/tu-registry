import { Router } from 'express';
import { requireAuth, requireRegistrationRights } from '../../middlewares/authenticate';
import * as controller from './application.controller';

export const applicationRouter = Router();

applicationRouter.use(requireAuth);

applicationRouter.get('/next-number', controller.nextNumber);
applicationRouter.post('/', controller.create);
applicationRouter.get('/manual/check', requireRegistrationRights, controller.checkManualNumber);
applicationRouter.post('/manual', requireRegistrationRights, controller.createManual);
