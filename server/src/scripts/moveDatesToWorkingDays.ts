import { connectDb, disconnectDb } from '../config/db';
import { env } from '../config/env';
import { logger } from '../config/logger';
import {
  applyWorkingDateMoves,
  type DateMove,
  planWorkingDateMoves,
} from '../modules/calendar/workingDate.migration';
import { User } from '../modules/users/user.model';

/**
 * Moves the saved dates that fall on a day off by the calendar to the working day before
 * (2026-11-22). Run once, by hand — not on every deploy: a later change of the calendar must
 * not move the documents again.
 *
 *   npm run db:move-dates-to-working-days -w server                       # shows what would move
 *   npm run db:move-dates-to-working-days -w server -- --apply --by admin # moves, in the history as admin
 */
const describe = (move: DateMove) =>
  `${move.regNumber} ${move.kind ?? 'APPLICATION'} ${move.number}: ` +
  move.changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join(', ') +
  (move.skipped ? ` — ПРОПУЩЕНО: ${move.skipped}` : '');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const login = args[args.indexOf('--by') + 1];
  await connectDb(env.MONGO_URI);
  try {
    const moves = await planWorkingDateMoves();
    for (const move of moves) console.log(describe(move));
    const skipped = moves.filter((move) => move.skipped).length;
    console.log(`Усього: ${moves.length}, з них пропущено: ${skipped}.`);
    if (!apply) {
      console.log('Нічого не змінено. Щоб перенести: -- --apply --by <логін адміністратора>');
      return;
    }
    const actor = args.includes('--by')
      ? await User.findOne({ login, role: 'ADMIN' }).select('_id').lean()
      : null;
    if (!actor)
      throw new Error('Вкажіть --by <логін адміністратора>: від нього записи в історії змін');
    const count = await applyWorkingDateMoves(moves, String(actor._id));
    logger.info({ count, skipped }, 'Dates on days off moved to the working day before');
  } finally {
    await disconnectDb();
  }
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Moving the dates failed');
  process.exitCode = 1;
});
