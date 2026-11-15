import mongoose from 'mongoose';
import { Application } from './application.model';

/**
 * The object category became required after applications already existed. Those get OTHER
 * without wording (agreed 2026-11-15); the wording is asked for only if someone later edits
 * the category. Idempotent: returns how many records were updated.
 */
export async function backfillObjectCategory() {
  const { modifiedCount } = await Application.updateMany(
    { objectCategory: mongoose.trusted({ $exists: false }) },
    { $set: { objectCategory: 'OTHER' } },
  );
  return modifiedCount;
}

// "м. Київ", "с. Гора", "смт Гостомель", "сел. Козин", "с-ще Слобожанське" — up to the first comma.
const LEADING_SETTLEMENT =
  /^\s*((?:м|с|смт|сел|с-ще|селище|село|місто)\.?\s+[^,]+?)\s*,\s*(\S.*?)\s*$/iu;

/**
 * Splits "м. Київ, вул. Шевченка, 1" into the settlement and the rest of the address.
 * Returns null when the address does not start with a recognizable settlement.
 */
export function splitSettlement(address: string) {
  const match = LEADING_SETTLEMENT.exec(address);
  return match ? { settlement: match[1]!, objectAddress: match[2]! } : null;
}

/**
 * The settlement became a separate required field after applications already existed
 * (agreed 2026-11-15). Where the address starts with it, it is moved out of the address;
 * other records keep their address and stay without a settlement until someone edits them.
 * Idempotent: returns how many records were updated.
 */
export async function backfillSettlement() {
  const rows = await Application.find({ settlement: mongoose.trusted({ $exists: false }) })
    .select('objectAddress')
    .lean();
  const updates = rows.flatMap((row) => {
    const split = splitSettlement(row.objectAddress);
    return split ? [{ updateOne: { filter: { _id: row._id }, update: { $set: split } } }] : [];
  });
  if (updates.length === 0) return 0;
  const { modifiedCount } = await Application.bulkWrite(updates);
  return modifiedCount;
}
