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
