import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/authenticate';
import * as controller from './user.controller';

export const userRouter = Router();

// Names for the registry filter: any signed-in user. Registered before the admin gate below.
userRouter.get('/options', requireAuth, controller.options);

userRouter.use(requireAuth, requireRole('ADMIN'));

userRouter.get('/', controller.list);
userRouter.post('/', controller.create);
userRouter.patch('/:id', controller.update);
userRouter.post('/:id/reset-password', controller.resetPassword);
