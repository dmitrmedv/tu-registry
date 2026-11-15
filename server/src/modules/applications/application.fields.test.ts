import { Types } from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app';
import {
  APPLICATIONS,
  type ApiSession,
  applicationFields,
  registerApplication,
  signedInWithAuth,
} from '../../test/applications';
import { useTestDb } from '../../test/db';
import { backfillObjectCategory } from './application.migration';
import { Application } from './application.model';
import { ApplicationChange } from './applicationChange.model';

const app = createApp();

describe('object category and comment', () => {
  useTestDb();

  let user: ApiSession;
  beforeEach(async () => {
    user = await signedInWithAuth(app);
  });

  const patch = (id: string, body: Record<string, unknown>) =>
    request(app).patch(`${APPLICATIONS}/${id}`).set(user.auth).send(body);

  it('requires a category, and wording for "other"', async () => {
    const { objectCategory: _omitted, ...withoutCategory } = applicationFields;
    const missing = await request(app).post(APPLICATIONS).set(user.auth).send(withoutCategory);
    expect(missing.status).toBe(400);
    expect(missing.body.error.details.fieldErrors.objectCategory).toBeDefined();

    const otherWithoutWording = await request(app)
      .post(APPLICATIONS)
      .set(user.auth)
      .send({ ...applicationFields, objectCategory: 'OTHER', objectCategoryOther: '  ' });
    expect(otherWithoutWording.status).toBe(400);
    expect(otherWithoutWording.body.error.details.fieldErrors.objectCategoryOther).toEqual([
      'Уточніть категорію обʼєкта',
    ]);
  });

  it('stores "other" with its wording and the comment', async () => {
    const created = await registerApplication(app, user, {
      ...applicationFields,
      objectCategory: 'OTHER',
      objectCategoryOther: ' Котельня ',
      comment: ' Документи подано не повністю ',
    });

    expect(created).toMatchObject({
      objectCategory: 'OTHER',
      objectCategoryOther: 'Котельня',
      comment: 'Документи подано не повністю',
    });
  });

  it('drops wording left over from "other" when another category is chosen', async () => {
    const created = await registerApplication(app, user, {
      ...applicationFields,
      objectCategory: 'APARTMENT',
      objectCategoryOther: 'залишок',
    });

    expect(created).toMatchObject({ objectCategory: 'APARTMENT', objectCategoryOther: null });
    expect((await Application.findById(created.id))!.objectCategoryOther).toBeUndefined();
  });

  it('rejects a comment longer than 2000 characters', async () => {
    const res = await request(app)
      .post(APPLICATIONS)
      .set(user.auth)
      .send({ ...applicationFields, comment: 'а'.repeat(2001) });
    expect(res.status).toBe(400);
  });

  describe('editing', () => {
    it('clears the wording when moving away from "other" and records both fields', async () => {
      const created = await registerApplication(app, user, {
        ...applicationFields,
        objectCategory: 'OTHER',
        objectCategoryOther: 'Котельня',
      });

      const res = await patch(created.id, { objectCategory: 'LAND_PLOT', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ objectCategory: 'LAND_PLOT', objectCategoryOther: null });
      const change = await ApplicationChange.findOne({ action: 'UPDATED' }).lean();
      expect(change!.changes).toEqual([
        { field: 'objectCategory', oldValue: 'OTHER', newValue: 'LAND_PLOT' },
        { field: 'objectCategoryOther', oldValue: 'Котельня', newValue: null },
      ]);
    });

    it('needs wording when switching to "other", taking the stored one into account', async () => {
      const created = await registerApplication(app, user);

      const withoutWording = await patch(created.id, { objectCategory: 'OTHER', version: 1 });
      expect(withoutWording.status).toBe(400);
      expect(withoutWording.body.error.details.fieldErrors.objectCategoryOther).toBeDefined();

      const withWording = await patch(created.id, {
        objectCategory: 'OTHER',
        objectCategoryOther: 'Котельня',
        version: 1,
      });
      expect(withWording.status).toBe(200);

      const clearingWording = await patch(created.id, { objectCategoryOther: '', version: 2 });
      expect(clearingWording.status).toBe(400);

      const rewording = await patch(created.id, { objectCategoryOther: 'Теплиця', version: 2 });
      expect(rewording.body).toMatchObject({ objectCategoryOther: 'Теплиця', version: 3 });
    });

    it('adds, changes and clears the comment', async () => {
      const created = await registerApplication(app, user);

      await patch(created.id, { comment: 'Перший', version: 1 });
      const cleared = await patch(created.id, { comment: '', version: 2 });

      expect(cleared.body.comment).toBeNull();
      expect((await Application.findById(created.id))!.comment).toBeUndefined();
    });
  });

  it('filters the registry by category', async () => {
    await registerApplication(app, user, { ...applicationFields, objectCategory: 'APARTMENT' });
    await registerApplication(app, user, { ...applicationFields, objectCategory: 'LAND_PLOT' });

    const res = await request(app)
      .get(APPLICATIONS)
      .query({ objectCategory: 'APARTMENT' })
      .set(user.auth);

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      objectCategory: 'APARTMENT',
      objectCategoryOther: null,
    });
  });

  describe('records created before the category existed', () => {
    async function insertLegacy() {
      const created = await registerApplication(app, user);
      await Application.collection.updateOne(
        { _id: new Types.ObjectId(created.id) },
        { $unset: { objectCategory: '' } },
      );
      return created;
    }

    it('get "other" from the migration, once, leaving categorized records alone', async () => {
      const legacy = await insertLegacy();
      const current = await registerApplication(app, user, {
        ...applicationFields,
        objectCategory: 'APARTMENT',
      });

      expect(await backfillObjectCategory()).toBe(1);
      expect(await backfillObjectCategory()).toBe(0);

      expect((await Application.findById(legacy.id))!.objectCategory).toBe('OTHER');
      expect((await Application.findById(current.id))!.objectCategory).toBe('APARTMENT');
    });

    it('stay editable without wording until someone touches the category', async () => {
      const legacy = await insertLegacy();
      await backfillObjectCategory();

      const res = await patch(legacy.id, { phone: '0501112233', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ objectCategory: 'OTHER', objectCategoryOther: null });
    });
  });
});
