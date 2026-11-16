import { CALENDAR_DAY_KINDS, CALENDAR_DESCRIPTION_MAX } from '@tu-registry/shared';
import { type InferSchemaType, Schema, model } from 'mongoose';

/**
 * An exception to "Saturday and Sunday off" (stage 17.2): a weekday off or a weekend day
 * worked. The id is the calendar date "YYYY-MM-DD", so a date has one entry at most.
 * Changes are recorded in the audit log; deadlines always use the current calendar.
 */
const calendarDaySchema = new Schema(
  {
    _id: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    kind: { type: String, enum: CALENDAR_DAY_KINDS, required: true },
    description: { type: String, required: true, trim: true, maxlength: CALENDAR_DESCRIPTION_MAX },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false },
);

export type CalendarDayData = InferSchemaType<typeof calendarDaySchema>;
export const CalendarDay = model('CalendarDay', calendarDaySchema);
