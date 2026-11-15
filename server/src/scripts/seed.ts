import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { seedAdmin, seedAdminFromEnv } from '../modules/users/seedAdmin';

async function main() {
  const admin = seedAdminFromEnv(process.env);

  await connectDb(env.MONGO_URI);
  try {
    const result = await seedAdmin(admin);
    logger.info(
      result === 'created'
        ? `Administrator "${admin.login}" created`
        : 'An active administrator already exists; nothing to do',
    );
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Seed failed');
  process.exitCode = 1;
});
