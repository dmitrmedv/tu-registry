import type { PreferenceTable, TablePreferences, TablePreferencesDto } from '@tu-registry/shared';
import type { Actor } from '../applications/application.access';
import { UserPreference } from './userPreference.model';

type Stored = {
  visible?: Record<string, boolean>;
  widths?: Record<string, number>;
  order?: string[];
  updatedAt?: Date;
};

const toDto = (row: Stored | null): TablePreferencesDto => ({
  visible: row?.visible ?? {},
  widths: row?.widths ?? {},
  order: row?.order ?? [],
  updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
});

/** The actor's own layout of the table; never anyone else's. */
export async function getTablePreferences(actor: Actor, table: PreferenceTable) {
  // `lean` turns the Maps into plain objects.
  const row = await UserPreference.findOne({ userId: actor.id, table }).lean<Stored>();
  return toDto(row);
}

/**
 * Replaces the actor's layout of the table. Not audited: it changes how the table looks to
 * them, not any data.
 */
export async function saveTablePreferences(
  actor: Actor,
  table: PreferenceTable,
  preferences: TablePreferences,
) {
  const row = await UserPreference.findOneAndUpdate(
    { userId: actor.id, table },
    { $set: preferences },
    { upsert: true, returnDocument: 'after', runValidators: true },
  ).lean<Stored>();
  return toDto(row);
}
