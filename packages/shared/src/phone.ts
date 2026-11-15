/**
 * Ukrainian phone numbers only (mobile and landline, 10-digit national format).
 * Any common notation is accepted; the stored form is "+380XXXXXXXXX".
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s()\-.]/g, '');
  if (!/^\+?\d+$/.test(compact)) return null;
  const hasPlus = compact.startsWith('+');
  const digits = hasPlus ? compact.slice(1) : compact;

  if (/^380\d{9}$/.test(digits)) return `+${digits}`;
  if (!hasPlus && /^0\d{9}$/.test(digits)) return `+38${digits}`;
  return null;
}

/** "+380671234567" → "+380 67 123 45 67". */
export function formatPhone(normalized: string) {
  const match = /^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(normalized);
  return match ? `+380 ${match[1]} ${match[2]} ${match[3]} ${match[4]}` : normalized;
}
