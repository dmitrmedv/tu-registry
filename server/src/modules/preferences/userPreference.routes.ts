import { Router } from 'express';
import { requireAuth } from '../../middlewares/authenticate';
import * as controller from './userPreference.controller';

/** The signed-in user's own settings: `/me/preferences/:table`. */
export const preferenceRouter = Router();

preferenceRouter.use(requireAuth);
preferenceRouter.get('/:table', controller.get);
preferenceRouter.put('/:table', controller.save);
