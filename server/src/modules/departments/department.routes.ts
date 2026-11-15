import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/authenticate';
import * as controller from './department.controller';

export const departmentRouter = Router();

departmentRouter.get('/', requireAuth, controller.list);

departmentRouter.use(requireAuth, requireRole('ADMIN'));
departmentRouter.post('/', controller.create);
departmentRouter.patch('/:id', controller.update);
departmentRouter.post('/:id/archive', controller.archive);
departmentRouter.post('/:id/restore', controller.restore);
departmentRouter.delete('/:id', controller.remove);
