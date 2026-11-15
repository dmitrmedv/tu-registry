import { APPLICATION_STATUSES, OBJECT_TYPES, REGISTRATION_MODES } from '@tu-registry/shared';
import { type HydratedDocument, type InferSchemaType, Schema, model } from 'mongoose';
import { toJSONTransform } from '../../utils/toJSON';

const annulmentSchema = new Schema(
  {
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const applicationSchema = new Schema(
  {
    // Registration number "15т/26" is stored as two integers: regYear=2026, regSeq=15.
    regYear: { type: Number, required: true, min: 2000, max: 2099 },
    regSeq: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'regSeq must be an integer' },
    },
    // Calendar date in Europe/Kyiv, stored as midnight UTC of that date.
    regDate: { type: Date, required: true },
    customer: { type: String, required: true, trim: true, maxlength: 300 },
    customerRepresentative: { type: String, trim: true, maxlength: 300 },
    // Normalized by the shared phone helper before saving.
    phone: { type: String, required: true, match: /^\+380\d{9}$/ },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    objectAddress: { type: String, required: true, trim: true, maxlength: 500 },
    objectType: { type: String, enum: OBJECT_TYPES, required: true },
    registrationMode: { type: String, enum: REGISTRATION_MODES, required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'ACTIVE', required: true },
    annulment: { type: annulmentSchema, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    // Optimistic concurrency for edits: updateOne({ _id, version }, { $inc: { version: 1 } }).
    version: { type: Number, default: 1, min: 1 },
  },
  {
    // createdAt is the actual moment of data entry, independent of regDate.
    timestamps: true,
    versionKey: false,
    toJSON: { transform: toJSONTransform() },
  },
);

applicationSchema.pre('validate', function (this: HydratedDocument<ApplicationData>) {
  if (!this.regDate) return;
  const d = this.regDate;
  const isMidnightUtc =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;
  if (!isMidnightUtc) {
    this.invalidate('regDate', 'regDate must be a calendar date (midnight UTC)');
  }
  if (this.regYear !== d.getUTCFullYear()) {
    this.invalidate('regYear', 'Рік номера не відповідає року дати реєстрації');
  }
});

// The final guarantee against duplicate registration numbers within a year.
applicationSchema.index({ regYear: 1, regSeq: 1 }, { unique: true });
applicationSchema.index({ regDate: -1 });
applicationSchema.index({ createdBy: 1, regDate: -1 });
applicationSchema.index({ objectType: 1, regDate: -1 });

export type ApplicationData = InferSchemaType<typeof applicationSchema>;
export const Application = model('Application', applicationSchema);
