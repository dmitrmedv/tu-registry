import {
  APPLICATION_STATUSES,
  AREA_TYPES,
  COMMENT_MAX,
  OBJECT_CATEGORIES,
  OBJECT_CATEGORY_OTHER_MAX,
  OBJECT_TYPES,
  REGISTRATION_MODES,
  SCAN_MAX_BYTES,
  SCAN_NAME_MAX,
  SETTLEMENT_MAX,
} from '@tu-registry/shared';
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

// The scanned documents: the file is on disk (modules/scans), only its description is here.
const scanSchema = new Schema(
  {
    fileId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: SCAN_NAME_MAX },
    size: { type: Number, required: true, min: 1, max: SCAN_MAX_BYTES },
    uploadedAt: { type: Date, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
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
    // The author's department at registration (stage 13); the number is unique within it.
    department: { type: String, required: true },
    customer: { type: String, required: true, trim: true, maxlength: 300 },
    customerRepresentative: { type: String, trim: true, maxlength: 300 },
    // Normalized by the shared phone helper before saving.
    phone: { type: String, required: true, match: /^\+380\d{9}$/ },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    // Required for new records; older ones got it from their address via `npm run db:migrate`
    // where the address started with it ("м. Київ, ...") and stay without it otherwise.
    settlement: { type: String, trim: true, maxlength: SETTLEMENT_MAX },
    objectAddress: { type: String, required: true, trim: true, maxlength: 500 },
    // Required for new records (Zod); older ones got it from their settlement via
    // `npm run db:migrate` where the settlement made it clear.
    areaType: { type: String, enum: AREA_TYPES },
    objectType: { type: String, enum: OBJECT_TYPES, required: true },
    // Records created before the field existed got OTHER via `npm run db:migrate`.
    objectCategory: { type: String, enum: OBJECT_CATEGORIES, required: true },
    objectCategoryOther: { type: String, trim: true, maxlength: OBJECT_CATEGORY_OTHER_MAX },
    comment: { type: String, trim: true, maxlength: COMMENT_MAX },
    registrationMode: { type: String, enum: REGISTRATION_MODES, required: true },
    status: { type: String, enum: APPLICATION_STATUSES, default: 'ACTIVE', required: true },
    annulment: { type: annulmentSchema, default: undefined },
    scan: { type: scanSchema, default: undefined },
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

// The final guarantee against duplicate registration numbers within a year and department.
applicationSchema.index({ department: 1, regYear: 1, regSeq: 1 }, { unique: true });
// Sorting by number across departments (an admin's "all departments" view). Descending key:
// the ascending one is the pre-stage-13 unique index's, which `db:migrate` drops.
applicationSchema.index({ regYear: -1, regSeq: -1 });
// Registry sorts by date with the number as a tie-breaker; the indexes carry the full sort
// key so MongoDB reads rows already in order instead of sorting them in memory.
const BY_DATE = { regDate: -1, regYear: -1, regSeq: -1 } as const;
applicationSchema.index(BY_DATE);
applicationSchema.index({ createdBy: 1, ...BY_DATE });
applicationSchema.index({ objectType: 1, ...BY_DATE });
applicationSchema.index({ objectCategory: 1, ...BY_DATE });
// Text columns sort alphabetically (Ukrainian collation) with the number as a tie-breaker;
// a query uses these only with the same collation (see application.query.ts).
for (const field of ['customer', 'settlement', 'objectAddress', 'customerRepresentative']) {
  applicationSchema.index({ [field]: 1, regYear: 1, regSeq: 1 }, { collation: { locale: 'uk' } });
  applicationSchema.index(
    { department: 1, [field]: 1, regYear: 1, regSeq: 1 },
    { collation: { locale: 'uk' } },
  );
}
// A user's registry is always one department: the same sorts, scoped to it.
applicationSchema.index({ department: 1, ...BY_DATE });

export type ApplicationData = InferSchemaType<typeof applicationSchema>;
export const Application = model('Application', applicationSchema);
