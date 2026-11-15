import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/authenticate';
import * as controller from './user.controller';

export const userRouter = Router();

userRouter.use(requireAuth, requireRole('ADMIN'));

userRouter.get('/', controller.list);
userRouter.post('/', controller.create);
userRouter.patch('/:id', controller.update);
userRouter.post('/:id/reset-password', controller.resetPassword);
