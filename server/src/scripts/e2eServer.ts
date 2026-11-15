/**
 * API for Playwright: a throwaway in-memory replica set, so every run starts from an empty
 * database with one seeded administrator and never touches the local development data.
 */
import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { fullNameField, loginField, passwordField } from '@tu-registry/shared';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { z } from 'zod';
import { MONGODB_VERSION } from '../config/mongodbVersion';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The E2E server is not allowed in production');
}

const seed = z
  .object({
    SEED_ADMIN_LOGIN: loginField,
    SEED_ADMIN_NAME: fullNameField,
    SEED_ADMIN_PASSWORD: passwordField,
  })
  .parse(process.env);

const replSet = await MongoMemoryReplSet.create({
  binary: { version: MONGODB_VERSION },
  // Own process group: Playwright signals the whole group on teardown, and mongod must stay
  // up until stop() below shuts it down and removes the temporary data directory.
  replSet: { count: 1, spawn: { detached: true } },
});
process.env.MONGO_URI = replSet.getUri('tu_registry_e2e');
process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString('base64');

// env.ts validates process.env when imported, so the app is loaded only after it is complete.
const { env } = await import('../config/env');
const { connectDb, disconnectDb } = await import('../config/db');
const { createApp } = await import('../app');
const { seedAdmin } = await import('../modules/users/seedAdmin');

await connectDb(env.MONGO_URI);
await seedAdmin({
  login: seed.SEED_ADMIN_LOGIN,
  fullName: seed.SEED_ADMIN_NAME,
  password: seed.SEED_ADMIN_PASSWORD,
});

const server: Server = createApp().listen(env.API_PORT, () => {
  console.log(`E2E API listening on http://localhost:${env.API_PORT}`);
});

async function shutdown() {
  server.close();
  await disconnectDb();
  await replSet.stop();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
