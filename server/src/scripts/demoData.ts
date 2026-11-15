/**
 * Demo applications for trying out the registry (pagination, filters) on a dev database.
 *
 *   npm run db:demo -w server               add 60 demo applications
 *   npm run db:demo -w server -- --remove   remove them again
 *
 * Safety: refuses to run in production; uses a separate past year (2020) and the "ДЕМО"
 * customer prefix, inserts rows directly (no audit, no history, no counter change), so the
 * real automatic numbering is never affected and removal touches demo rows only.
 */
import { OBJECT_CATEGORIES } from '@tu-registry/shared';
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { Application } from '../modules/applications/application.model';
import { User } from '../modules/users/user.model';

const DEMO_YEAR = 2020;
const DEMO_PREFIX = 'ДЕМО ';
const COUNT = 60;

const demoFilter = () => ({
  regYear: DEMO_YEAR,
  customer: mongoose.trusted({ $regex: `^${DEMO_PREFIX}` }),
});

const CUSTOMERS = ['ТОВ «Тепломережа»', 'ФОП Коваленко О.', 'ПП «Будпроект»', 'ОСББ «Затишок»'];
const STREETS = ['вул. Шевченка', 'просп. Перемоги', 'вул. Садова', 'пров. Тихий'];

async function add() {
  if (await Application.exists(demoFilter())) {
    console.log('Demo applications already exist. Remove them first with --remove.');
    return;
  }
  const users = await User.find().select('_id').lean();
  if (users.length === 0) throw new Error('No users found: run db:seed first');

  // Continue after any real 2020 numbers, so nothing collides.
  const last = await Application.findOne({ regYear: DEMO_YEAR }).sort({ regSeq: -1 }).lean();
  const firstSeq = (last?.regSeq ?? 0) + 1;

  const rows = Array.from({ length: COUNT }, (_, i) => {
    const day = Math.floor((i * 365) / COUNT);
    return {
      regYear: DEMO_YEAR,
      regSeq: firstSeq + i,
      regDate: new Date(Date.UTC(DEMO_YEAR, 0, 1 + day)),
      customer: `${DEMO_PREFIX}${CUSTOMERS[i % CUSTOMERS.length]} №${i + 1}`,
      customerRepresentative: i % 3 === 0 ? undefined : `Представник ${i + 1}`,
      phone: `+38067${String(1000000 + i).padStart(7, '0')}`,
      objectAddress: `м. Київ, ${STREETS[i % STREETS.length]}, ${i + 1}`,
      objectType: i % 4 === 0 ? 'NON_DOMESTIC' : 'DOMESTIC',
      objectCategory: OBJECT_CATEGORIES[i % OBJECT_CATEGORIES.length],
      objectCategoryOther:
        OBJECT_CATEGORIES[i % OBJECT_CATEGORIES.length] === 'OTHER' ? 'Котельня' : undefined,
      comment: i % 5 === 0 ? 'Демонстраційний коментар' : undefined,
      registrationMode: 'MANUAL',
      createdBy: users[i % users.length]!._id,
    };
  });
  await Application.insertMany(rows);
  console.log(`Added ${COUNT} demo applications (${firstSeq}т/20 … ${firstSeq + COUNT - 1}т/20).`);
}

async function remove() {
  const { deletedCount } = await Application.deleteMany(demoFilter());
  console.log(`Removed ${deletedCount} demo applications.`);
}

async function main() {
  if (env.NODE_ENV === 'production') throw new Error('Demo data is not allowed in production');
  await connectDb(env.MONGO_URI);
  try {
    await (process.argv.includes('--remove') ? remove() : add());
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
