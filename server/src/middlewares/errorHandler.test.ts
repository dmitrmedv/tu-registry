import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Application } from '../modules/applications/application.model';
import { User } from '../modules/users/user.model';
import { useTestDb } from '../test/db';
import { errorHandler } from './errorHandler';

/** Minimal app whose single route runs `action` and forwards its error. */
function appThatRuns(action: () => Promise<unknown>) {
  const app = express();
  app.get('/', async (_req, res) => {
    await action();
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('errorHandler with Mongoose errors', () => {
  useTestDb();

  it('maps a validation error to 400 without echoing submitted values', async () => {
    const res = await request(
      appThatRuns(() => Application.create({ phone: 'secret-value' } as never)),
    ).get('/');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toHaveProperty('customer');
    expect(JSON.stringify(res.body)).not.toContain('secret-value');
  });

  it('maps a cast error (e.g. injected operator) to 400', async () => {
    const injected = { $gt: '' } as unknown as string;
    const res = await request(appThatRuns(() => User.findOne({ login: injected }))).get('/');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_VALUE', details: { field: 'login' } });
  });

  it('maps a duplicate key error to 409', async () => {
    const user = { login: 'dup', fullName: 'Dup', passwordHash: 'x', department: 'ODESA' as const };
    await User.create(user);

    const res = await request(appThatRuns(() => User.create(user))).get('/');

    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'DUPLICATE', details: { fields: ['login'] } });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await request(
      appThatRuns(() => Promise.reject(new mongoose.Error('driver internals'))),
    ).get('/');

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('driver internals');
  });
});
