import { MongoMemoryReplSet } from 'mongodb-memory-server';
import type { TestProject } from 'vitest/node';
import { MONGODB_VERSION } from '../config/mongodbVersion';

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

/** One single-node in-memory replica set (transactions enabled) for the whole test run. */
export default async function setup(project: TestProject) {
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: MONGODB_VERSION },
    replSet: { count: 1 },
  });
  project.provide('mongoUri', replSet.getUri());

  return async () => {
    await replSet.stop();
  };
}
