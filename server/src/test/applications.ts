import type { Express } from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { signedInUser } from './auth';

export const APPLICATIONS = '/api/v1/applications';

/** A valid registration body; override what a test cares about. */
export const applicationFields = {
  customer: 'ТОВ «Приклад»',
  customerRepresentative: 'Петренко Іван',
  phone: '0671234567',
  email: 'office@example.ua',
  settlement: 'м. Київ',
  areaType: 'URBAN',
  gasificationType: 'NEW',
  objectAddress: 'вул. Прикладна, 1',
  objectType: 'DOMESTIC',
  objectCategory: 'RESIDENTIAL_HOUSE',
};

export type ApiSession = Awaited<ReturnType<typeof signedInWithAuth>>;

/** A signed-in user plus a ready Authorization header. */
export async function signedInWithAuth(
  app: Express,
  options: Parameters<typeof signedInUser>[1] = {},
) {
  const session = await signedInUser(app, options);
  return { ...session, auth: { Authorization: `Bearer ${session.accessToken}` } };
}

export async function registerApplication(
  app: Express,
  who: ApiSession,
  body: Record<string, unknown> = applicationFields,
) {
  const res = await request(app).post(APPLICATIONS).set(who.auth).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; version: number; regNumber: string };
}
