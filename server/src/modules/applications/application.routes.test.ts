import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { signedInUser } from '../../test/auth';
import { useTestDb } from '../../test/db';
import { AuditLog } from '../audit/auditLog.model';
import { Application } from './application.model';

const app = createApp();
const APPLICATIONS = '/api/v1/applications';

const body = {
  customer: 'ТОВ «Приклад»',
  customerRepresentative: 'Петренко Іван',
  phone: '(067) 123-45-67',
  email: 'Office@Example.UA',
  objectAddress: 'м. Київ, вул. Прикладна, 1',
  objectType: 'NON_DOMESTIC',
};

async function employee() {
  const session = await signedInUser(app);
  return { ...session, auth: { Authorization: `Bearer ${session.accessToken}` } };
}

describe('applications API', () => {
  useTestDb();

  it('requires authentication', async () => {
    expect((await request(app).post(APPLICATIONS).send(body)).status).toBe(401);
    expect((await request(app).get(`${APPLICATIONS}/next-number`)).status).toBe(401);
  });

  it('registers an application with a server-assigned date and number', async () => {
    const { auth, user } = await employee();

    const res = await request(app).post(APPLICATIONS).set(auth).send(body);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      regSeq: 1,
      regNumber: expect.stringMatching(/^1т\/\d{2}$/),
      regDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      phone: '+380671234567',
      email: 'office@example.ua',
      objectType: 'NON_DOMESTIC',
      registrationMode: 'AUTO',
      createdBy: { id: user.id, fullName: user.fullName },
    });
    const audit = await AuditLog.findOne({ action: 'APPLICATION_CREATED' });
    expect(JSON.stringify(audit?.details)).not.toMatch(/Приклад|Петренко|380|example/);
  });

  it('stores a missing representative as null', async () => {
    const { auth } = await employee();

    const res = await request(app)
      .post(APPLICATIONS)
      .set(auth)
      .send({ ...body, customerRepresentative: '' });

    expect(res.status).toBe(201);
    expect(res.body.customerRepresentative).toBeNull();
  });

  it('stores a missing email as null', async () => {
    const { auth } = await employee();
    const { email: _email, ...withoutEmail } = body;

    const res = await request(app).post(APPLICATIONS).set(auth).send(withoutEmail);

    expect(res.status).toBe(201);
    expect(res.body.email).toBeNull();
  });

  it('rejects invalid data and fields the client must not control', async () => {
    const { auth } = await employee();

    for (const invalid of [
      { ...body, customer: '' },
      { ...body, phone: '12345' },
      { ...body, email: 'not-an-email' },
      { ...body, objectType: 'INDUSTRIAL' },
      { ...body, regSeq: 999 },
      { ...body, regDate: '2020-01-01' },
      { ...body, registrationMode: 'MANUAL' },
    ]) {
      const res = await request(app).post(APPLICATIONS).set(auth).send(invalid);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await Application.countDocuments()).toBe(0);
  });

  it('returns the next number hint', async () => {
    const { auth } = await employee();
    await request(app).post(APPLICATIONS).set(auth).send(body);

    const res = await request(app).get(`${APPLICATIONS}/next-number`).set(auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ regSeq: 2, regNumber: expect.stringMatching(/^2т\//) });
  });
});
