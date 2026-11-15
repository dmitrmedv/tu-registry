const dateTimeFormat = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  dateStyle: 'short',
  timeStyle: 'short',
});

/** "15.11.2026, 10:22" in Kyiv time; an em dash for missing values. */
export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTimeFormat.format(new Date(iso)) : '—';
}
