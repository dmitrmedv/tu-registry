/**
 * The single source of "now" for business dates. Tests replace it with vi.spyOn(clock, 'now')
 * instead of fake timers, which would also freeze the MongoDB driver's internal timers.
 */
export const clock = {
  now: () => new Date(),
};
