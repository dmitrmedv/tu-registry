import { Router } from 'express';
import { authenticate } from '../../middlewares/authenticate';
import { createLoginRateLimiter } from '../../middlewares/rateLimit';
import * as controller from './auth.controller';

export function createAuthRouter() {
  const router = Router();

  router.post('/login', createLoginRateLimiter(), controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  // Available while a password change is pending (no requirePasswordChanged here).
  router.get('/me', authenticate, controller.me);
  router.post('/change-password', authenticate, controller.changePassword);

  return router;
}
