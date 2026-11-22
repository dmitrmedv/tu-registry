import { Router } from 'express';
import { requireAuth, requireRole } from '../../middlewares/authenticate';
import * as controller from './calendar.controller';

/** The working-day calendar is the administrator's; deadlines are computed from it server-side. */
export const calendarRouter = Router();

// Read by every user (2026-11-22): a document date on a day off is refused, and shown at once.
calendarRouter.get('/exceptions', requireAuth, controller.exceptions);
calendarRouter.use(requireAuth, requireRole('ADMIN'));
calendarRouter.get('/', controller.list);
calendarRouter.post('/', controller.create);
calendarRouter.patch('/:date', controller.update);
calendarRouter.delete('/:date', controller.remove);
