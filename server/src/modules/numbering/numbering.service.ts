import type { ClientSession } from 'mongoose';
import { Application } from '../applications/application.model';
import { Counter } from './counter.model';

/** Safety net against an endless loop if the year is somehow full of manual numbers. */
const MAX_SKIPS = 10_000;

/**
 * Issues the next automatic sequence number for `year`. MUST run inside a transaction:
 * the $inc on the year's counter document is rolled back if the registration fails
 * (no burnt numbers), and concurrent transactions conflict on that document, so
 * MongoDB serializes them and withTransaction retries the loser with the next number.
 * Numbers already taken by manual registrations are skipped.
 */
export async function issueNextNumber(year: number, session: ClientSession) {
  for (let skips = 0; skips < MAX_SKIPS; skips++) {
    const counter = await Counter.findOneAndUpdate(
      { _id: year },
      { $inc: { lastSeq: 1 } },
      { upsert: true, returnDocument: 'after', session },
    );
    const seq = counter!.lastSeq;
    const taken = await Application.exists({ regYear: year, regSeq: seq }).session(session);
    if (!taken) return seq;
  }
  throw new Error(`No free registration number found for ${year}`);
}

/** What the next automatic number would be right now. Read-only: reserves nothing. */
export async function peekNextNumber(year: number) {
  const counter = await Counter.findById(year);
  let seq = (counter?.lastSeq ?? 0) + 1;
  while (await Application.exists({ regYear: year, regSeq: seq })) seq++;
  return seq;
}
