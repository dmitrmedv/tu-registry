import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import { connectDb, disconnectDb } from '../config/db';
import { allModels } from '../models';

/**
 * Connects the test file to its own database on the shared in-memory replica set,
 * builds all indexes (unique constraints must exist before assertions), and wipes
 * data between tests so they never depend on each other.
 */
export function useTestDb() {
  beforeAll(async () => {
    await connectDb(inject('mongoUri'), { dbName: `test_${randomUUID().slice(0, 8)}` });
    await Promise.all(allModels.map((model) => model.init()));
  });

  afterEach(async () => {
    const collections = Object.values(mongoose.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDb();
  });
}
