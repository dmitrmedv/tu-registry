import { fullNameField, loginField, passwordField } from '@tu-registry/shared';
import { z } from 'zod';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { seedAdmin } from '../modules/users/seedAdmin';

const seedEnvSchema = z.object({
  SEED_ADMIN_LOGIN: loginField,
  SEED_ADMIN_NAME: fullNameField,
  SEED_ADMIN_PASSWORD: passwordField,
});

async function main() {
  const parsed = seedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid seed variables:\n${z.prettifyError(parsed.error)}`);
  }
  const { SEED_ADMIN_LOGIN, SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD } = parsed.data;

  await connectDb(env.MONGO_URI);
  try {
    const result = await seedAdmin({
      login: SEED_ADMIN_LOGIN,
      fullName: SEED_ADMIN_NAME,
      password: SEED_ADMIN_PASSWORD,
    });
    logger.info(
      result === 'created'
        ? `Administrator "${SEED_ADMIN_LOGIN}" created`
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
