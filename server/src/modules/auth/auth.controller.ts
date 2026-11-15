import { changePasswordSchema, loginSchema } from '@tu-registry/shared';
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env } from '../../config/env';
import { parseRequest } from '../../utils/parseRequest';
import { requestContext } from '../audit/audit.service';
import * as authService from './auth.service';

export const SESSION_COOKIE = 'tu_session';

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'strict',
  // The cookie is sent only to auth endpoints, never with ordinary API calls.
  path: '/api/v1/auth',
};

function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
}

function sessionCookie(req: Request): string | undefined {
  const value: unknown = req.cookies?.[SESSION_COOKIE];
  return typeof value === 'string' ? value : undefined;
}

export const login: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: loginSchema });
  const result = await authService.login(body, requestContext(req));
  setSessionCookie(res, result.refreshToken, result.refreshExpiresAt);
  res.json({ user: result.user, accessToken: result.accessToken });
};

export const refresh: RequestHandler = async (req, res) => {
  try {
    const result = await authService.refresh(sessionCookie(req), requestContext(req));
    setSessionCookie(res, result.refreshToken, result.refreshExpiresAt);
    res.json({ user: result.user, accessToken: result.accessToken });
  } catch (error) {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    throw error;
  }
};

export const logout: RequestHandler = async (req, res) => {
  await authService.logout(sessionCookie(req), requestContext(req));
  res.clearCookie(SESSION_COOKIE, cookieOptions);
  res.status(204).end();
};

export const me: RequestHandler = (req, res) => {
  const { sessionId: _sessionId, ...user } = req.user!;
  res.json(user);
};

export const changePassword: RequestHandler = async (req, res) => {
  const { body } = parseRequest(req, { body: changePasswordSchema });
  const user = await authService.changePassword(
    req.user!.id,
    req.user!.sessionId,
    body,
    requestContext(req),
  );
  res.json(user);
};
