/**
 * Shared toJSON transform: expose `id` as a string and hide Mongo internals.
 * Pass extra field names to strip sensitive data (e.g. passwordHash).
 */
export function toJSONTransform(...hiddenFields: string[]) {
  return (_doc: unknown, ret: Record<string, unknown>) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    for (const field of hiddenFields) delete ret[field];
    return ret;
  };
}
