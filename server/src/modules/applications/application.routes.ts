import { Router } from 'express';
import { requireAuth } from '../../middlewares/authenticate';
import * as controller from './application.controller';

export const applicationRouter = Router();

applicationRouter.use(requireAuth);

applicationRouter.get('/next-number', controller.nextNumber);
applicationRouter.post('/', controller.create);
