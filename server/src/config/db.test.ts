import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { Counter } from '../modules/numbering/counter.model';
import { User } from '../modules/users/user.model';
import { useTestDb } from '../test/db';
import { connectDb } from './db';
import { MONGODB_VERSION } from './mongodbVersion';

describe('database (replica set)', () => {
  useTestDb();

  it('health reports db up', async () => {
    const res = await request(createApp()).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('rolls back every write of a failed transaction', async () => {
    const session = await mongoose.startSession();
    try {
      await expect(
        session.withTransaction(async () => {
          await Counter.create([{ _id: 2026, lastSeq: 1 }], { session });
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    } finally {
      await session.endSession();
    }

    expect(await Counter.countDocuments()).toBe(0);
  });

  it('neutralizes query-selector injection via sanitizeFilter', async () => {
    await User.create({ login: 'alice', fullName: 'Alice', passwordHash: 'x' });

    // Simulates an attacker sending {"login": {"$ne": null}} instead of a string:
    // the operator is wrapped in $eq and the query is rejected instead of matching everyone.
    const injected = { $ne: null } as unknown as string;
    await expect(User.findOne({ login: injected })).rejects.toThrow(/Cast to string failed/);

    // Operators written in our own code still work when explicitly trusted.
    expect(await User.findOne({ login: mongoose.trusted({ $ne: null }) })).not.toBeNull();
  });
});

describe('database (standalone)', () => {
  it('refuses to work without a replica set', async () => {
    const standalone = await MongoMemoryServer.create({ binary: { version: MONGODB_VERSION } });
    try {
      await expect(connectDb(standalone.getUri())).rejects.toThrow(/replica set/);
      expect(mongoose.connection.readyState).toBe(mongoose.ConnectionStates.disconnected);
    } finally {
      await standalone.stop();
    }
  });
});
