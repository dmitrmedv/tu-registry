import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import { signedInWithAuth } from '../../test/applications';
import { useTestDb } from '../../test/db';
import { UserPreference } from './userPreference.model';

const app = createApp();
const URL = '/api/v1/me/preferences/registry';
const layout = {
  visible: { gasFlow: true, tuNumber: false },
  widths: { objectAddress: 386 },
  order: ['department', 'regDate'],
};

describe('a user’s own table layout', () => {
  useTestDb();

  it('starts with the defaults, then keeps what the user saved', async () => {
    const owner = await signedInWithAuth(app, { login: 'owner' });

    const empty = await request(app).get(URL).set(owner.auth);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ visible: {}, widths: {}, order: [], updatedAt: null });

    const saved = await request(app).put(URL).set(owner.auth).send(layout);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject(layout);
    expect(saved.body.updatedAt).toEqual(expect.any(String));

    expect((await request(app).get(URL).set(owner.auth)).body).toMatchObject(layout);
    // Replaced as a whole, still one record.
    const reset = await request(app)
      .put(URL)
      .set(owner.auth)
      .send({ visible: {}, widths: {}, order: [] });
    expect(reset.body).toMatchObject({ visible: {}, widths: {}, order: [] });
    expect(await UserPreference.countDocuments()).toBe(1);
  });

  it('is each user’s own', async () => {
    const owner = await signedInWithAuth(app, { login: 'owner' });
    const colleague = await signedInWithAuth(app, { login: 'colleague' });
    await request(app).put(URL).set(owner.auth).send(layout);

    expect((await request(app).get(URL).set(colleague.auth)).body.updatedAt).toBeNull();
    expect(await UserPreference.countDocuments()).toBe(1);
  });

  it('needs a signed-in user, a known table and a valid layout', async () => {
    const owner = await signedInWithAuth(app, { login: 'owner' });

    expect((await request(app).get(URL)).status).toBe(401);
    expect((await request(app).get('/api/v1/me/preferences/users').set(owner.auth)).status).toBe(
      400,
    );
    for (const body of [
      { ...layout, visible: { $where: true } },
      { ...layout, widths: { customer: -1 } },
      { ...layout, extra: true },
      { visible: {}, widths: {} },
    ]) {
      expect((await request(app).put(URL).set(owner.auth).send(body)).status).toBe(400);
    }
    expect(await UserPreference.countDocuments()).toBe(0);
  });
});
