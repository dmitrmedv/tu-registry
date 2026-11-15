import { z } from 'zod';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { seedAdmin } from '../modules/users/seedAdmin';

const seedEnvSchema = z.object({
  SEED_ADMIN_LOGIN: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,50}$/, '3–50 символів: латиниця, цифри, . _ -'),
  SEED_ADMIN_NAME: z.string().trim().min(2).max(150),
  // bcrypt only uses the first 72 bytes.
  SEED_ADMIN_PASSWORD: z.string().min(12, 'Мінімум 12 символів').max(72),
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
