/**
 * Local development MongoDB without Homebrew or sudo.
 *
 *   npm run db:start   start mongod as a single-node replica set (initiates it on first run)
 *   npm run db:stop    shut it down cleanly
 *   npm run db:status  show whether it runs and its replica set state
 *
 * Uses the official native mongod binary resolved (and downloaded once) by
 * mongodb-memory-server. Data lives outside the repository. Development only:
 * no authentication, so it listens on 127.0.0.1 exclusively.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { MongoBinary } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { MONGODB_VERSION } from '../config/mongodbVersion';

// Must match MONGO_URI in server/.env(.example).
const HOST = '127.0.0.1';
const PORT = 27017;
const REPLICA_SET = 'rs0';

const BASE_DIR = join(homedir(), '.local', 'share', 'tu-registry', 'mongo');
const DATA_DIR = join(BASE_DIR, 'data');
const LOG_FILE = join(BASE_DIR, 'mongod.log');
const DIRECT_URI = `mongodb://${HOST}:${PORT}/?directConnection=true`;

type Hello = { setName?: string; isWritablePrimary?: boolean };

/** Runs an admin command against the local mongod; returns null if it is not reachable. */
async function adminCommand<T>(command: Record<string, unknown>): Promise<T | null> {
  const connection = mongoose.createConnection(DIRECT_URI, { serverSelectionTimeoutMS: 1_500 });
  try {
    await connection.asPromise();
    return (await connection.db!.admin().command(command)) as T;
  } catch (error) {
    if (error instanceof mongoose.Error.MongooseServerSelectionError) return null;
    throw error;
  } finally {
    await connection.close().catch(() => undefined);
  }
}

function runMongod(binary: string) {
  const args = [
    '--replSet',
    REPLICA_SET,
    '--dbpath',
    DATA_DIR,
    '--bind_ip',
    HOST,
    '--port',
    String(PORT),
    '--logpath',
    LOG_FILE,
    '--logappend',
    // --fork returns only after mongod is ready to accept connections.
    '--fork',
  ];
  return new Promise<void>((resolve, reject) => {
    const child = spawn(binary, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`mongod exited with code ${code}; see ${LOG_FILE}`)),
    );
  });
}

async function waitForPrimary(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hello = await adminCommand<Hello>({ hello: 1 });
    if (hello?.isWritablePrimary) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Replica set did not become PRIMARY in time');
}

async function start() {
  const running = await adminCommand<Hello>({ hello: 1 });
  if (running) {
    console.log(
      `MongoDB is already running on ${HOST}:${PORT} (replica set: ${running.setName ?? 'none'})`,
    );
    return;
  }

  await mkdir(DATA_DIR, { recursive: true });
  const binary = await MongoBinary.getPath({ version: MONGODB_VERSION });
  await runMongod(binary);

  const hello = await adminCommand<Hello>({ hello: 1 });
  if (!hello?.setName) {
    // First start with this data directory: initiate the single-node replica set.
    await adminCommand({
      replSetInitiate: { _id: REPLICA_SET, members: [{ _id: 0, host: `${HOST}:${PORT}` }] },
    });
  }
  await waitForPrimary();
  console.log(
    `MongoDB ${MONGODB_VERSION} is running on ${HOST}:${PORT}, replica set ${REPLICA_SET} (PRIMARY)`,
  );
  console.log(`Data: ${DATA_DIR}\nLog:  ${LOG_FILE}`);
}

async function stop() {
  const connection = mongoose.createConnection(DIRECT_URI, { serverSelectionTimeoutMS: 1_500 });
  try {
    await connection.asPromise();
  } catch {
    console.log('MongoDB is not running');
    return;
  }
  // The server closes the connection while shutting down, so this call is expected to fail.
  await connection
    .db!.admin()
    .command({ shutdown: 1 })
    .catch(() => undefined);
  await connection.close().catch(() => undefined);
  console.log('MongoDB stopped');
}

async function status() {
  const hello = await adminCommand<Hello>({ hello: 1 });
  if (!hello) {
    console.log('MongoDB is not running. Start it with: npm run db:start');
    process.exitCode = 1;
    return;
  }
  const state = hello.isWritablePrimary ? 'PRIMARY' : 'not primary';
  console.log(
    `MongoDB is running on ${HOST}:${PORT}, replica set ${hello.setName ?? 'none'} (${state})`,
  );
}

const commands: Record<string, () => Promise<void>> = { start, stop, status };
const command = commands[process.argv[2] ?? ''];

if (!command) {
  console.error('Usage: devMongo.ts <start|stop|status>');
  process.exitCode = 1;
} else {
  command().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
