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

const ADDRESS_MAX = 500;

/**
 * The cadastral number field was removed (agreed 2026-11-15, stage 12). Stored numbers move
 * to the end of the address ("вул. Шевченка, 1; кад. № 3220481301:01:007:0012"), so nothing
 * is lost and the address search still finds them. Works on the raw collection: the field is
 * no longer in the schema, and strictQuery would drop it from a model query. A record whose
 * address would exceed the limit is left untouched and reported. Idempotent.
 */
export async function moveCadastralNumberIntoAddress() {
  const rows = await Application.collection
    .find(
      { cadastralNumber: { $exists: true } },
      { projection: { objectAddress: 1, cadastralNumber: 1 } },
    )
    .toArray();
  const skipped: string[] = [];
  const updates = rows.flatMap((row) => {
    const address = `${row.objectAddress}; кад. № ${row.cadastralNumber}`;
    if (address.length > ADDRESS_MAX) {
      skipped.push(String(row._id));
      return [];
    }
    return [
      {
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { objectAddress: address }, $unset: { cadastralNumber: '' } },
        },
      },
    ];
  });
  const moved =
    updates.length > 0 ? (await Application.collection.bulkWrite(updates)).modifiedCount : 0;
  return { moved, skipped };
}

const URBAN_SETTLEMENT = /^(?:м|смт|місто)\.?\s/iu;
const RURAL_SETTLEMENT = /^(?:с|сел|с-ще|село|селище)\.?\s/iu;

/** "м. Київ", "смт Гостомель" → URBAN; "с. Гора", "сел. Козин" → RURAL; otherwise unknown. */
export function areaTypeOf(settlement: string) {
  if (URBAN_SETTLEMENT.test(settlement)) return 'URBAN' as const;
  if (RURAL_SETTLEMENT.test(settlement)) return 'RURAL' as const;
  return null;
}

/**
 * The area type became required after applications already existed (agreed 2026-11-15,
 * stage 12). It is derived from the settlement's prefix where that is clear; other records
 * stay without it until someone edits them. Idempotent: returns how many records were updated.
 */
export async function backfillAreaType() {
  const rows = await Application.find({
    areaType: mongoose.trusted({ $exists: false }),
    settlement: mongoose.trusted({ $exists: true }),
  })
    .select('settlement')
    .lean();
  const updates = rows.flatMap((row) => {
    const areaType = areaTypeOf(row.settlement!);
    return areaType
      ? [{ updateOne: { filter: { _id: row._id }, update: { $set: { areaType } } } }]
      : [];
  });
  if (updates.length === 0) return 0;
  const { modifiedCount } = await Application.bulkWrite(updates);
  return modifiedCount;
}
