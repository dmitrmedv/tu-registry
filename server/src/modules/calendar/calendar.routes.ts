import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/authenticate';
import * as controller from './calendar.controller';

/** The working-day calendar is the administrator's; deadlines are computed from it server-side. */
export const calendarRouter = Router();

calendarRouter.use(requireAuth, requireRole('ADMIN'));
calendarRouter.get('/', controller.list);
calendarRouter.post('/', controller.create);
calendarRouter.patch('/:date', controller.update);
calendarRouter.delete('/:date', controller.remove);
