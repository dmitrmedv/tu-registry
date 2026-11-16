import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/authenticate';
import * as controller from './engineer.controller';

export const engineerRouter = Router();

// Forms of technical conditions and responses need the list: any signed-in user (scoped).
engineerRouter.get('/', requireAuth, controller.list);

engineerRouter.use(requireAuth, requireRole('ADMIN'));
engineerRouter.post('/', controller.create);
engineerRouter.patch('/:id', controller.update);
