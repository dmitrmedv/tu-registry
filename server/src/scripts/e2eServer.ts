/**
 * API for Playwright: a throwaway in-memory replica set, so every run starts from an empty
 * database with one seeded administrator and never touches the local development data.
 */
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MONGODB_VERSION } from '../config/mongodbVersion';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The E2E server is not allowed in production');
}

const replSet = await MongoMemoryReplSet.create({
  binary: { version: MONGODB_VERSION },
  // Own process group: Playwright signals the whole group on teardown, and mongod must stay
  // up until stop() below shuts it down and removes the temporary data directory.
  replSet: { count: 1, spawn: { detached: true } },
});
process.env.MONGO_URI = replSet.getUri('tu_registry_e2e');
process.env.JWT_ACCESS_SECRET ??= randomBytes(48).toString('base64');
// Scans uploaded by the tests go to a throwaway folder, removed on shutdown.
const uploadsDir = await mkdtemp(path.join(tmpdir(), 'tu-registry-e2e-uploads-'));
process.env.UPLOADS_DIR = uploadsDir;

// env.ts validates process.env when imported, so the app is loaded only after it is complete.
const { env } = await import('../config/env');
const { connectDb, disconnectDb } = await import('../config/db');
const { createApp } = await import('../app');
const { seedAdmin, seedAdminFromEnv } = await import('../modules/users/seedAdmin');

await connectDb(env.MONGO_URI);
await seedAdmin(seedAdminFromEnv(process.env));

const server: Server = createApp().listen(env.API_PORT, () => {
  console.log(`E2E API listening on http://localhost:${env.API_PORT}`);
});

async function shutdown() {
  server.close();
  try {
    await disconnectDb();
    await replSet.stop();
    await rm(uploadsDir, { recursive: true, force: true });
    process.exit(0);
  } catch (error) {
    console.error('E2E server shutdown failed:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
