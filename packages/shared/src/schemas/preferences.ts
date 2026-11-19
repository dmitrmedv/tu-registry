import { z } from 'zod';

/**
 * A user's own layout of a table — which columns, in which order, how wide — kept on the server
 * so it follows them to any computer and browser (agreed 2026-11-19). A new table with
 * configurable columns adds its name here.
 */
export const PREFERENCE_TABLES = ['registry'] as const;
export type PreferenceTable = (typeof PREFERENCE_TABLES)[number];

/** Column ids are our own names (`objectAddress`): letters only, so safe as stored keys. */
const columnId = z.string().regex(/^[A-Za-z]{1,40}$/, 'Некоректна колонка');
const MAX_COLUMNS = 50;
const fewEnough = (value: object) => Object.keys(value).length <= MAX_COLUMNS;

export const MAX_COLUMN_WIDTH = 2000;

/** Only what the user changed: columns not mentioned follow their defaults. */
export const tablePreferencesSchema = z
  .object({
    visible: z.record(columnId, z.boolean()).refine(fewEnough, 'Забагато колонок'),
    widths: z
      .record(columnId, z.number().positive().max(MAX_COLUMN_WIDTH))
      .refine(fewEnough, 'Забагато колонок'),
    order: z
      .array(columnId)
      .max(MAX_COLUMNS)
      .refine((ids) => new Set(ids).size === ids.length, 'Колонки повторюються'),
  })
  .strict();

export const preferenceParamsSchema = z.object({ table: z.enum(PREFERENCE_TABLES) });

export type TablePreferences = z.infer<typeof tablePreferencesSchema>;

/** `updatedAt` null: nothing saved yet, the defaults apply. */
export type TablePreferencesDto = TablePreferences & { updatedAt: string | null };
