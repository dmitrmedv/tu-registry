import { describe, expect, it } from 'vitest';
import { useTestDb } from '../../test/db';
import { RefreshSession } from './refreshSession.model';

describe('RefreshSession model', () => {
  useTestDb();

  it('has a TTL index that expires sessions at expiresAt', async () => {
    const indexes = await RefreshSession.collection.indexes();

    expect(indexes).toContainEqual(
      expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
    );
  });
});
